import "../load-env";
import { prisma } from "../utils/prisma";
import { getAllMetricIds } from "../services/bean/queries";

/**
 * Wipe previously ingested facts + watermarks for the current metric set so a
 * clean SG+VN SQL-aggregated backfill can be re-run.
 *
 * Usage: npx tsx src/scripts/ingest-reset.ts
 */
async function main() {
  const metricIds = getAllMetricIds();
  console.log(`[reset] metrics: ${metricIds.join(", ")}`);

  const facts = await prisma.beanDailyFact.deleteMany({
    where: { metricId: { in: metricIds } },
  });
  const wm = await prisma.ingestionWatermark.deleteMany({
    where: { metricId: { in: metricIds } },
  });

  console.log(`[reset] deleted ${facts.count} facts, ${wm.count} watermarks`);
}

main()
  .catch((err) => {
    console.error("[reset] FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
