import "../load-env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getBeanConfig, runQuery, type BeanConfig, type BeanQueryResult } from "../services/bean/client";
import { runWithConcurrency } from "../utils/run-with-concurrency";

/**
 * Bulk schema profiler — 1 lightweight query per table, resume support.
 *
 * Usage:
 *   npx tsx src/scripts/bean-discover-bulk.ts --file discovery/tables_gng_cooked_ob.txt
 *   npx tsx src/scripts/bean-discover-bulk.ts --file discovery/tables_failed.txt --retry-errors
 */

const OUT_DIR = path.resolve(process.cwd(), "discovery");
const DATE_CANDIDATES = ["dt", "grass_date", "log_date", "stat_date", "ds"];

interface TableProfile {
  table: string;
  status: "ok" | "partial" | "error";
  query?: string;
  error?: string;
  columns?: string[];
  scopedTo?: string;
  sampleRows?: unknown[][];
  notes?: string[];
  payloadFields?: string[];
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const file = get("--file");
  if (!file) {
    console.error("Usage: bean-discover-bulk.ts --file <tables.txt> [--dt YYYYMMDD] [--concurrency N] [--retry-errors]");
    process.exit(1);
  }
  return {
    file,
    dt: get("--dt") ?? "20251208",
    sampleLimit: Number(get("--sample-limit") ?? "3"),
    concurrency: Number(get("--concurrency") ?? "2"),
    resume: !argv.includes("--no-resume"),
    retryErrors: argv.includes("--retry-errors"),
  };
}

function safeName(fq: string): string {
  return fq.replace(/[^a-z0-9_]+/gi, "_");
}

function profilePath(fq: string): string {
  return path.join(OUT_DIR, `profile_${safeName(fq)}.json`);
}

function loadTables(file: string): string[] {
  return readFileSync(path.resolve(file), "utf-8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

function extractPayloadStructFields(msg: string): string[] | null {
  const idx = msg.indexOf("STRUCT<");
  if (idx === -1) return null;
  const inner = msg.slice(idx + 7);
  const fields: string[] = [];
  for (const part of inner.split(/,\s*/)) {
    const name = part.trim().split(/\s*:\s*/)[0]?.trim();
    if (!name || !/^[a-zA-Z_][\w]*$/.test(name)) break;
    fields.push(name);
  }
  return fields.length > 0 ? fields : null;
}

function isInfrastructureError(msg: string): boolean {
  return msg.includes("NotFoundException") || msg.includes("Failed to open input stream");
}

async function tryQuery(cfg: BeanConfig, sql: string): Promise<BeanQueryResult | null> {
  try {
    return await runQuery(cfg, sql);
  } catch {
    return null;
  }
}

async function captureQueryError(cfg: BeanConfig, sql: string): Promise<string> {
  try {
    await runQuery(cfg, sql);
    return "query returned empty";
  } catch (err) {
    return (err as Error).message;
  }
}

function buildAttempts(fq: string, dt: string, sampleLimit: number): Array<{ label: string; sql: string }> {
  const attempts: Array<{ label: string; sql: string }> = [];
  const altDts = [dt, "20251201", "20251115", "20251101"];
  for (const d of altDts) {
    for (const col of DATE_CANDIDATES) {
      attempts.push({
        label: `${col}=${d}`,
        sql: `SELECT * FROM ${fq} WHERE ${col} = '${d}' LIMIT ${sampleLimit}`,
      });
    }
  }
  attempts.push({ label: "unfiltered", sql: `SELECT * FROM ${fq} LIMIT ${sampleLimit}` });
  return attempts;
}

async function profileTable(
  cfg: BeanConfig,
  fq: string,
  dt: string,
  sampleLimit: number,
): Promise<TableProfile> {
  const attempts = buildAttempts(fq, dt, sampleLimit);

  for (const a of attempts) {
    const result = await tryQuery(cfg, a.sql);
    if (result && result.headers.length > 0) {
      return {
        table: fq,
        status: "ok",
        query: a.sql,
        columns: result.headers,
        scopedTo: a.label,
        sampleRows: result.rows.slice(0, 3),
      };
    }
  }

  const probeSql = attempts[0]!.sql;
  const errMsg = await captureQueryError(cfg, probeSql);
  const payloadFields = extractPayloadStructFields(errMsg);

  if (payloadFields) {
    const columns = payloadFields.map((f) => `payload.${f}`);
    return {
      table: fq,
      status: "partial",
      query: probeSql,
      columns,
      scopedTo: "struct-from-error",
      payloadFields,
      notes: [
        "SELECT * fails: Spark CANNOT_UP_CAST_DATATYPE on nested payload STRUCT (schema evolution across files).",
        "Column list inferred from Spark error message — top-level columns not included.",
      ],
      error: errMsg.slice(0, 500),
    };
  }

  if (isInfrastructureError(errMsg)) {
    return {
      table: fq,
      status: "error",
      error: errMsg.slice(0, 500),
      notes: ["Warehouse/Iceberg metadata missing on HDFS — table broken at source, not a query issue."],
    };
  }

  return { table: fq, status: "error", error: errMsg.slice(0, 500) };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const args = parseArgs();
  const cfg = getBeanConfig();
  const tables = loadTables(args.file);

  const pending = tables.filter((t) => {
    if (!args.resume) return true;
    const p = profilePath(t);
    if (!existsSync(p)) return true;
    if (!args.retryErrors) return false;
    try {
      const profile = JSON.parse(readFileSync(p, "utf-8")) as TableProfile;
      return profile.status === "error";
    } catch {
      return true;
    }
  });
  console.log(`[bulk] file=${args.file} total=${tables.length} pending=${pending.length} concurrency=${args.concurrency}`);

  const catalog: Record<string, TableProfile> = {};
  if (existsSync(path.join(OUT_DIR, "catalog.json"))) {
    try {
      Object.assign(catalog, JSON.parse(readFileSync(path.join(OUT_DIR, "catalog.json"), "utf-8")));
    } catch {
      /* ignore */
    }
  }

  let done = 0;
  await runWithConcurrency(pending, args.concurrency, async (fq) => {
    const n = ++done;
    console.log(`[bulk] [${n}/${pending.length}] ${fq}`);
    const profile = await profileTable(cfg, fq, args.dt, args.sampleLimit);
    writeFileSync(profilePath(fq), JSON.stringify(profile, null, 2), "utf-8");
    catalog[fq] = profile;
    writeFileSync(path.join(OUT_DIR, "catalog.json"), JSON.stringify(catalog, null, 2), "utf-8");
    if (profile.status === "ok") {
      console.log(`  ok: ${profile.columns!.length} cols (${profile.scopedTo})`);
    } else if (profile.status === "partial") {
      console.log(`  partial: ${profile.columns!.length} payload fields (STRUCT cast issue)`);
    } else {
      console.log(`  ERR: ${profile.error?.slice(0, 120)}`);
    }
  });

  const ok = Object.values(catalog).filter((p) => p.status === "ok").length;
  const partial = Object.values(catalog).filter((p) => p.status === "partial").length;
  const err = Object.values(catalog).filter((p) => p.status === "error").length;
  console.log(`[bulk] done. ok=${ok} partial=${partial} err=${err} catalog=${path.join(OUT_DIR, "catalog.json")}`);
}

main().catch((err) => {
  console.error("[bulk] FAILED:", err);
  process.exit(1);
});
