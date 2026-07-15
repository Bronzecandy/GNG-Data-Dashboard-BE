import "../load-env";
import { prisma } from "../utils/prisma";
import { getAllMetricIds } from "../services/bean/queries";

async function main() {
  const sizes = await prisma.$queryRaw<{ db_size: string }[]>`
    SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
  `;
  const tables = await prisma.$queryRaw<{ table: string; size: string; rows: bigint }[]>`
    SELECT relname as "table", pg_size_pretty(pg_total_relation_size(relid)) as size, n_live_tup as rows
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12
  `;
  console.log("DB size:", sizes[0]?.db_size);
  for (const t of tables) console.log(`  ${t.table}: ${t.size}`);
  console.log("beanDailyFact rows:", await prisma.beanDailyFact.count());
  for (const d of ["2026-07-13", "2026-07-14", "2026-07-15"]) {
    const dt = new Date(`${d}T00:00:00Z`);
    const counts = await prisma.beanDailyFact.groupBy({ by: ["metricId"], where: { dt }, _count: true });
    const missing = getAllMetricIds().filter((id) => !counts.some((c) => c.metricId === id));
    console.log(`${d}: ${counts.length}/12 metrics, ${counts.reduce((a,c)=>a+c._count,0)} rows${missing.length ? " missing="+missing.join(",") : ""}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());