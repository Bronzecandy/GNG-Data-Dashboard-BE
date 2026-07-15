import "../load-env";
import { fetch } from "undici";
import { getBeanConfig, submitQuery, pollUntilDone } from "../services/bean/client";

/**
 * One-off probe: capture the raw JSON shapes of get_result, download_result,
 * and get_non_terminal_tasks so the client fallback can parse them correctly.
 *
 * Usage: npx tsx src/scripts/bean-probe-download.ts
 */
async function main() {
  const cfg = getBeanConfig();
  const headers = {
    "Content-Type": "application/json",
    "client-app-id": cfg.clientAppId,
    "client-token": cfg.clientToken,
    "user-email": cfg.userEmail,
  };
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`\n=== POST ${path} (${res.status}) ===`);
    console.log(text.slice(0, 2000));
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { _raw: text };
    }
  };

  const sql =
    "SELECT COUNT(*) AS new_user FROM gng_cooked_ob.dws_user_register_account_retention_d_i WHERE local_dt = '20260101' AND region = 'SG' AND ip_region = 'VN'";

  console.log("[probe] submitting query...");
  const taskId = await submitQuery(cfg, sql, "probe");
  console.log("[probe] taskId =", taskId);
  await pollUntilDone(cfg, taskId, "probe");

  await post("/api/v1/query/get_result", { id: taskId });
  await post("/api/v1/query/download_result", { id: taskId });
  await post("/api/v1/query/get_non_terminal_tasks", {});
}

main()
  .catch((err) => {
    console.error("[probe] FAILED:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
