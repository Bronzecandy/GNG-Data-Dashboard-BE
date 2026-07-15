import "../load-env";
import { prisma } from "../utils/prisma";
import { getAllMetricIds } from "../services/bean/queries";
import { formatDateOnly, dateRangeInclusive, parseDateOnly } from "../utils/dates";

const START = parseDateOnly("2025-01-02");
const END = parseDateOnly("2026-07-07");

async function main() {
  for (const metricId of getAllMetricIds()) {
    const rows = await prisma.beanDailyFact.findMany({
      where: { metricId, dt: { gte: START, lte: END } },
      select: { dt: true },
    });
    const have = new Set(rows.map((r) => formatDateOnly(r.dt)));
    const all = dateRangeInclusive(START, END);
    const missing = all.filter((d) => !have.has(formatDateOnly(d)));
    console.log(`${metricId.padEnd(24)} have=${String(have.size).padStart(4)}/${all.length} missing=${missing.length}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
