import "../load-env";
import { getBeanConfig, runQuery } from "../services/bean/client";
import { prisma } from "../utils/prisma";

async function main() {
  const cfg = getBeanConfig();
  const dates = ["20260706", "20260707", "20260708"];
  console.log("=== DAU (dws_user_active_account_d_i, SG server + VN players) ===\n");
  for (const d of dates) {
    const sql = `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='${d}' AND last_active_ip_region='VN' AND last_active_region='SG'`;
    const r = await runQuery(cfg, sql, `dau-${d}`);
    console.log(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}:`, r.rows[0]?.[0] ?? "n/a");
  }
  const facts = await prisma.beanDailyFact.findMany({ where: { metricId: "active.active_user" }, orderBy: { dt: "desc" }, take: 5 });
  console.log("\n=== Local DB (active.active_user) ===");
  for (const f of facts) {
    const m = f.measures as { dau?: number };
    console.log(f.dt.toISOString().slice(0, 10), "dau=", m.dau);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
