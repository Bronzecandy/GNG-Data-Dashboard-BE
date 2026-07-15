import "../load-env";
import { getBeanConfig, runQuery } from "../services/bean/client";

async function main() {
  const cfg = getBeanConfig();
  const dates = ["20260706", "20260707", "20260708"];
  console.log("=== dm_user_active_account_1d_i SUM(DAU) ip_region=VN ===\n");
  for (const d of dates) {
    const sql = `SELECT SUM(DAU) AS dau FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='${d}' AND ip_region='VN'`;
    const r = await runQuery(cfg, sql, `dm-${d}`);
    console.log(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}:`, r.rows[0]?.[0] ?? "n/a");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
