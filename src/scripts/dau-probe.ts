import "../load-env";
import { getBeanConfig, runQuery } from "../services/bean/client";

async function main() {
  const cfg = getBeanConfig();
  const d = "20260707";
  const queries = [
    ["dws VN only", `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='${d}' AND last_active_ip_region='VN'`],
    ["dws SG+VN", `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='${d}' AND last_active_ip_region='VN' AND last_active_region='SG'`],
    ["dws ALL regions VN ip", `SELECT last_active_region, COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='${d}' AND last_active_ip_region='VN' GROUP BY last_active_region ORDER BY dau DESC LIMIT 10`],
    ["today dws VN", `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='20260708' AND last_active_ip_region='VN'`],
  ];
  for (const [label, sql] of queries) {
    const r = await runQuery(cfg, sql, label);
    console.log(`\n${label}:`);
    console.log(r.headers.join("\t"));
    for (const row of r.rows.slice(0, 10)) console.log(row.join("\t"));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
