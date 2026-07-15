import { fetch } from "undici";
import { acquireSubmitSlot, releaseSubmitSlot } from "./gate";

export interface BeanConfig {
  baseUrl: string;
  clientAppId: string;
  clientToken: string;
  userEmail: string;
  clusterUrn: string;
}

export function getBeanConfig(): BeanConfig {
  const baseUrl = (process.env.BEAN_BASE_URL || "https://bean.data.garenanow.com").replace(/\/$/, "");
  const clientAppId = process.env.BEAN_CLIENT_APP_ID?.trim();
  const clientToken = process.env.BEAN_CLIENT_TOKEN?.trim();
  const userEmail = process.env.BEAN_USER_EMAIL?.trim();
  const clusterUrn = process.env.BEAN_CLUSTER_URN?.trim() || "platform:(hive,sg-cluster)";

  if (!clientAppId || !clientToken || !userEmail) {
    throw new Error("BEAN_CLIENT_APP_ID, BEAN_CLIENT_TOKEN, and BEAN_USER_EMAIL are required");
  }

  return { baseUrl, clientAppId, clientToken, userEmail, clusterUrn };
}

function authHeaders(cfg: BeanConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "client-app-id": cfg.clientAppId,
    "client-token": cfg.clientToken,
    "user-email": cfg.userEmail,
  };
}

interface SubmitResponse {
  data?: string | { id?: string };
  id?: string;
}

interface StateData {
  id?: string;
  state?: number;
  state_msg?: string;
  progress?: number;
  error_code?: string;
  error_msg?: string;
}

interface StateResponse {
  data?: StateData;
}

interface ResultResponse {
  data?: StateData & {
    query_task_data?: {
      headers?: string[];
      rows?: unknown[][];
    };
  };
}

export interface BeanQueryResult {
  headers: string[];
  rows: unknown[][];
}

const STATE_SUCCESS = 1;

async function beanPost<T>(cfg: BeanConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bean API ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

async function beanPostText(cfg: BeanConfig, path: string, body: unknown): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Bean API ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return text;
}

/** Minimal CSV parser (handles quoted fields with embedded commas/quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

export async function submitQuery(cfg: BeanConfig, rawSql: string, label?: string): Promise<string> {
  await acquireSubmitSlot(label ?? "submit");
  try {
    const payload = {
      raw_sql: rawSql,
      engine_type: "spark",
      data_cluster_urn: cfg.clusterUrn,
    };
    const data = await beanPost<SubmitResponse>(cfg, "/api/v1/query/submit", payload);
    const raw = data.data;
    const id = typeof raw === "string" ? raw : (raw?.id ?? data.id);
    if (!id) throw new Error(`Bean submit did not return task id: ${JSON.stringify(data).slice(0, 300)}`);
    return id;
  } catch (err) {
    releaseSubmitSlot();
    throw err;
  }
}

export async function getQueryState(cfg: BeanConfig, taskId: string): Promise<StateData> {
  const data = await beanPost<StateResponse>(cfg, "/api/v1/query/get_state", { id: taskId });
  if (!data.data?.state && data.data?.state !== 0) {
    throw new Error("Bean get_state missing state");
  }
  if (data.data.state! < 0 || data.data.state_msg === "FAILED") {
    const msg = data.data.error_msg || data.data.error_code || "Bean query failed";
    throw new Error(msg);
  }
  return data.data;
}

export async function getQueryResult(cfg: BeanConfig, taskId: string): Promise<BeanQueryResult> {
  const data = await beanPost<ResultResponse>(cfg, "/api/v1/query/get_result", { id: taskId });
  const qtd = data.data?.query_task_data;
  if (!qtd?.headers || !qtd.rows) {
    throw new Error("Bean get_result missing query_task_data");
  }
  return { headers: qtd.headers, rows: qtd.rows };
}

/** Fallback for when get_result has no inline payload: download_result returns CSV text. */
export async function downloadResult(cfg: BeanConfig, taskId: string): Promise<BeanQueryResult> {
  const text = await beanPostText(cfg, "/api/v1/query/download_result", { id: taskId });
  const parsed = parseCsv(text);
  if (parsed.length === 0) {
    throw new Error("Bean download_result returned empty CSV");
  }
  const [headers, ...rows] = parsed;
  return { headers: headers!, rows };
}

interface NonTerminalTask {
  id?: string;
  state?: number;
  state_msg?: string;
}

/** Count of non-terminal (queued/running) tasks — Bean caps concurrency at 10 per user. */
export async function getNonTerminalTasks(cfg: BeanConfig): Promise<NonTerminalTask[]> {
  const data = await beanPost<{ data?: NonTerminalTask[] }>(
    cfg,
    "/api/v1/query/get_non_terminal_tasks",
    {},
  );
  return Array.isArray(data.data) ? data.data : [];
}

export async function pollUntilDone(
  cfg: BeanConfig,
  taskId: string,
  label?: string,
): Promise<void> {
  const maxAttempts = Number(process.env.BEAN_POLL_MAX ?? 180);
  const pollMs = Number(process.env.BEAN_POLL_INTERVAL_MS ?? 5000);
  const started = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    const st = await getQueryState(cfg, taskId);
    if (st.state === STATE_SUCCESS) {
      const sec = Math.round((Date.now() - started) / 1000);
      console.log(`[bean] done ${label ?? taskId} in ${sec}s (${st.progress ?? 100}%)`);
      return;
    }
    const sec = Math.round((Date.now() - started) / 1000);
    if (i === 0 || i % 3 === 0) {
      console.log(
        `[bean] polling ${label ?? taskId} … ${sec}s state=${st.state} progress=${st.progress ?? "?"}%`,
      );
    }
    await sleep(pollMs);
  }
  throw new Error(`Bean query ${taskId} timed out after ${Math.round((Date.now() - started) / 1000)}s`);
}

export async function runQuery(cfg: BeanConfig, rawSql: string, label?: string): Promise<BeanQueryResult> {
  const taskId = await submitQuery(cfg, rawSql, label);
  try {
    await pollUntilDone(cfg, taskId, label);
    const retries = Number(process.env.BEAN_RESULT_RETRIES ?? 4);
    await sleep(Number(process.env.BEAN_POST_SUCCESS_DELAY_MS ?? 2000));

    for (let i = 0; i < retries; i++) {
      try {
        const result = await getQueryResult(cfg, taskId);
        releaseSubmitSlot();
        return result;
      } catch (err) {
        const msg = (err as Error).message;
        if (!msg.includes("missing query_task_data")) throw err;
        if (i < retries - 1) {
          const waitMs = Math.min(3000 + i * 3000, 15_000);
          console.log(`[bean] inline result not ready, retry ${i + 1}/${retries} in ${waitMs}ms — ${label ?? taskId}`);
          await sleep(waitMs);
        }
      }
    }

    // Fallback: large/spilled results are served via download_result (CSV)
    console.log(`[bean] falling back to download_result — ${label ?? taskId}`);
    const downloaded = await downloadResult(cfg, taskId);
    releaseSubmitSlot();
    return downloaded;
  } catch (err) {
    releaseSubmitSlot();
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function smokeTest(cfg?: BeanConfig): Promise<BeanQueryResult> {
  const config = cfg ?? getBeanConfig();
  return runQuery(config, "SELECT 1 AS ok", "smoke");
}
