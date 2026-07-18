import "../load-env";
import { prisma } from "../utils/prisma";
import { backfillAll, backfillMetric, dailyIngestAll, ingestDaysForAllMetrics, scheduledIngest } from "../services/ingest";
import { todayInIngestTz, yesterdayInIngestTz } from "../utils/dates";
import { formatDateOnly, yesterdayUtc } from "../utils/dates";

async function main() {
  const mode = process.argv[2];
  if (mode === "backfill") {
    const start = process.argv[3] || process.env.HISTORY_START_DATE || "2024-06-01";
    const end = process.argv[4] || process.env.HISTORY_END_DATE || formatDateOnly(yesterdayUtc());
    const metricId = process.argv[5];
    console.log(`[ingest] backfill from ${start} to ${end}${metricId ? ` (metric=${metricId})` : ""}`);
    if (metricId) {
      const n = await backfillMetric(metricId, start, end);
      console.log(`[ingest] done: ${n} rows`);
    } else {
      await backfillAll(start, end);
    }
    return;
  }
  if (mode === "daily") {
    console.log("[ingest] daily");
    await dailyIngestAll();
    return;
  }
  if (mode === "scheduled") {
    const hourArg = process.argv[3];
    if (hourArg !== undefined) {
      const h = Number(hourArg);
      const days = [todayInIngestTz()];
      if (h === 2 || h === 4) days.push(yesterdayInIngestTz());
      console.log(`[ingest] scheduled simulate hour=${h} days=${days.join(", ")}`);
      await ingestDaysForAllMetrics(days);
    } else {
      await scheduledIngest();
    }
    return;
  }
  if (mode === "days") {
    const days = process.argv.slice(3).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (days.length === 0) {
      console.error("Usage: ingest-cli.ts days YYYY-MM-DD [YYYY-MM-DD ...]");
      process.exit(1);
    }
    console.log(`[ingest] force refresh days: ${days.join(", ")}`);
    await ingestDaysForAllMetrics(days);
    return;
  }
  console.error("Usage: ingest-cli.ts backfill [start] [end] [metricId] | daily | scheduled [hour] | days YYYY-MM-DD ...");
  process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
