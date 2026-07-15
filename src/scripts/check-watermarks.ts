import "../load-env";
import { prisma } from "../utils/prisma";
import { formatDateOnly } from "../utils/dates";

const METRICS = [
  "economy.stats",
  "hack.stats",
  "mode.match_stats",
  "perf.session_stats",
  "newbie.stats",
];

async function main() {
  const watermarks = await prisma.ingestionWatermark.findMany({
    where: { metricId: { in: METRICS } },
    orderBy: { metricId: "asc" },
  });
  console.log("watermarks:");
  for (const m of METRICS) {
    const wm = watermarks.find((w) => w.metricId === m);
    console.log(`  ${m}: ${wm ? formatDateOnly(wm.lastDt) : "(none)"}`);
  }

  const counts = await prisma.beanDailyFact.groupBy({
    by: ["metricId"],
    _count: true,
    where: { metricId: { in: METRICS } },
  });
  console.log("fact rows:", counts);

  const runs = await prisma.ingestionRun.findMany({
    where: { metricId: { in: METRICS } },
    orderBy: { startedAt: "desc" },
    take: 8,
  });
  console.log(
    "recent runs:",
    runs.map((r) => ({
      metric: r.metricId,
      status: r.status,
      rows: r.rowsUpserted,
      error: r.error?.slice(0, 100),
    })),
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());
