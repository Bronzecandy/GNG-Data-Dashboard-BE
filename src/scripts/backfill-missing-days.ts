/**
 * Backfill only dates that have no beanDailyFact row (watermark may be ahead).
 * Usage: tsx src/scripts/backfill-missing-days.ts [start] [end] [metricId?]
 */
import "../load-env";
import { prisma } from "../utils/prisma";
import { getAllMetricIds } from "../services/bean/queries";
import { ingestMetricForDayWithRetry, recordEmptyIngestDay } from "../services/ingest";
import { dateRangeInclusive, formatDateOnly, parseDateOnly } from "../utils/dates";

const METRIC_START: Record<string, string> = {
  "hero.balance": "2025-12-01",
  "new.device_retention": "2025-06-04",
};

const PRIORITY = [
  "new.device_retention",
  "new.user_retention",
  "active.active_user",
  "active.online_time",
  "active.revival",
  "active.churn",
  "perf.session_stats",
  "hero.balance",
  "economy.stats",
  "hack.stats",
  "mode.match_stats",
  "newbie.stats",
];

async function missingDates(metricId: string, start: Date, end: Date): Promise<string[]> {
  const rows = await prisma.beanDailyFact.findMany({
    where: { metricId, dt: { gte: start, lte: end } },
    select: { dt: true },
  });
  const have = new Set(rows.map((r) => formatDateOnly(r.dt)));
  return dateRangeInclusive(start, end).map(formatDateOnly).filter((d) => !have.has(d));
}

async function backfillMetricGaps(metricId: string, start: Date, end: Date): Promise<number> {
  const metricStart = METRIC_START[metricId] ? parseDateOnly(METRIC_START[metricId]) : start;
  const from = metricStart > start ? metricStart : start;
  const missing = await missingDates(metricId, from, end);
  if (missing.length === 0) {
    console.log(`[gaps] ${metricId}: no missing days`);
    return 0;
  }
  console.log(`[gaps] ${metricId}: ${missing.length} missing day(s) ${missing[0]} .. ${missing[missing.length - 1]}`);
  let total = 0;
  for (let i = 0; i < missing.length; i++) {
    const iso = missing[i]!;
    const n = await ingestMetricForDayWithRetry(metricId, iso);
    if (n === 0) {
      await recordEmptyIngestDay(metricId, iso);
      console.log(`[gaps] ${metricId} ${iso}: marked empty (no Bean rows)`);
    }
    total += n;
    if ((i + 1) % 10 === 0 || i + 1 === missing.length) {
      console.log(`[gaps] ${metricId} progress ${i + 1}/${missing.length} days, ${total} rows`);
    }
  }
  return total;
}

async function main() {
  const start = parseDateOnly(process.argv[2] || process.env.HISTORY_START_DATE || "2025-01-02");
  const end = parseDateOnly(process.argv[3] || new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  const only = process.argv[4];
  const all = getAllMetricIds();
  const metrics = only ? [only] : PRIORITY.filter((m) => all.includes(m)).concat(all.filter((m) => !PRIORITY.includes(m)));

  console.log(`[gaps] backfill missing days ${formatDateOnly(start)} -> ${formatDateOnly(end)} (${metrics.length} metrics)`);

  let grand = 0;
  for (const metricId of metrics) {
    try {
      grand += await backfillMetricGaps(metricId, start, end);
    } catch (err) {
      console.error(`[gaps] ${metricId} FAILED:`, (err as Error).message);
    }
  }
  console.log(`[gaps] done: ${grand} total fact rows upserted`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
