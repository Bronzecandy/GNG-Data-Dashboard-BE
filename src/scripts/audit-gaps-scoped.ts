import "../load-env";
import { prisma } from "../utils/prisma";
import { formatDateOnly, dateRangeInclusive, parseDateOnly } from "../utils/dates";

const METRIC_START: Record<string, string> = {
  "hero.balance": "2025-12-01",
  "new.device_retention": "2025-06-04",
};

const END = parseDateOnly("2026-07-07");

async function gaps(metricId: string) {
  const start = parseDateOnly(METRIC_START[metricId] ?? "2025-01-02");
  const rows = await prisma.beanDailyFact.findMany({
    where: { metricId, dt: { gte: start, lte: END } },
    select: { dt: true },
  });
  const have = new Set(rows.map((r) => formatDateOnly(r.dt)));
  const all = dateRangeInclusive(start, END).map(formatDateOnly);
  const missing = all.filter((d) => !have.has(d));
  console.log(
    `${metricId.padEnd(24)} from ${formatDateOnly(start)} have=${have.size}/${all.length} missing=${missing.length}`,
  );
  if (missing.length) {
    console.log(`  first: ${missing.slice(0, 3).join(", ")}`);
    console.log(`  last:  ${missing.slice(-3).join(", ")}`);
  }
}

async function main() {
  console.log(`scoped audit -> ${formatDateOnly(END)}\n`);
  for (const id of [
    "new.device_retention",
    "hero.balance",
    "perf.session_stats",
    "new.user_retention",
    "active.active_user",
  ]) {
    await gaps(id);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
