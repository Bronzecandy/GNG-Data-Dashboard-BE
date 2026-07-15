import "../load-env";
import { prisma } from "../utils/prisma";
import { backfillAll, backfillMetric, dailyIngestAll } from "../services/ingest";
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
  console.error("Usage: ingest-cli.ts backfill [startDate] [endDate] [metricId] | daily");
  process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
