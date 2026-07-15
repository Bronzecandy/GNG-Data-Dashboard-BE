import "../load-env";
import { getBeanConfig, runQuery } from "../services/bean/client";

const tests = [
  ["2024-06-01", "dm VN only", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20240601' AND ip_region='VN'`],
  ["2024-06-02", "dm VN only", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20240602' AND ip_region='VN'`],
  ["2024-06-03", "dm VN only", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20240603' AND ip_region='VN'`],
  ["2025-11-01", "dm VN only", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20251101' AND ip_region='VN'`],
  ["2025-12-01", "dm VN only", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20251201' AND ip_region='VN'`],
  ["2025-12-07", "dm SG+VN", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20251207' AND region='SG' AND ip_region='VN'`],
  ["2025-12-07", "dm VN only", `SELECT COUNT(*) AS n, SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20251207' AND ip_region='VN'`],
  ["2024-06-01", "dws COUNT VN", `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='20240601' AND last_active_ip_region='VN'`],
  ["2026-01-01", "dm VN only", `SELECT SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20260101' AND ip_region='VN'`],
  ["2026-01-01", "dm SG+VN", `SELECT SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='20260101' AND region='SG' AND ip_region='VN'`],
  ["2025-01-02", "dws COUNT VN", `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='20250102' AND last_active_ip_region='VN'`],
  ["2025-09-09", "dws COUNT VN", `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='20250909' AND last_active_ip_region='VN'`],
];

async function main() {
  const cfg = getBeanConfig();
  console.log("=== active_user filter probe (ip_region=VN) ===\n");
  for (const [date, label, sql] of tests) {
    const r = await runQuery(cfg, sql, `${date} ${label}`);
    const row = r.rows[0] ?? [];
    const out: Record<string, unknown> = {};
    r.headers.forEach((h, i) => { out[h] = row[i]; });
    console.log(`${date} [${label}]:`, JSON.stringify(out));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
