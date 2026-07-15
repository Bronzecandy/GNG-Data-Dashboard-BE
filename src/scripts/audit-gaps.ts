import "../load-env";
import { prisma } from "../utils/prisma";
import { formatDateOnly, dateRangeInclusive, parseDateOnly } from "../utils/dates";

const GAP_METRICS = [
  "new.user_retention",
  "new.device_retention",
  "active.active_user",
  "active.online_time",
  "active.revival",
];

const START = parseDateOnly("2025-01-02");
const END = parseDateOnly("2026-07-07");

async function main() {
  for (const metricId of GAP_METRICS) {
    const rows = await prisma.beanDailyFact.findMany({
      where: { metricId, dt: { gte: START, lte: END } },
      select: { dt: true },
      orderBy: { dt: "asc" },
    });
    const have = new Set(rows.map((r) => formatDateOnly(r.dt)));
    const all = dateRangeInclusive(START, END).map(formatDateOnly);
    const missing = all.filter((d) => !have.has(d));
    console.log(`\n${metricId}: have=${have.size}/${all.length} missing=${missing.length}`);
    if (missing.length) {
      console.log(`  first missing: ${missing[0]} .. ${missing[Math.min(5, missing.length - 1)]}`);
      console.log(`  last missing:  ${missing[Math.max(0, missing.length - 3)]} .. ${missing[missing.length - 1]}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
