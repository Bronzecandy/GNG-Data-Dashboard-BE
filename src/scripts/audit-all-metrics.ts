import "../load-env";
import { prisma } from "../utils/prisma";
import { getAllMetricIds } from "../services/bean/queries";
import { formatDateOnly } from "../utils/dates";

const TARGET_START = process.env.HISTORY_START_DATE || "2025-01-02";
const TARGET_END = "2026-07-07";

async function main() {
  const ids = getAllMetricIds();
  console.log(`audit ${TARGET_START} -> ${TARGET_END}\n`);
  const gaps: string[] = [];
  for (const id of ids) {
    const wm = await prisma.ingestionWatermark.findFirst({ where: { metricId: id } });
    const agg = await prisma.beanDailyFact.aggregate({
      where: { metricId: id },
      _count: true,
      _min: { dt: true },
      _max: { dt: true },
    });
    const wmStr = wm ? formatDateOnly(wm.lastDt) : "(none)";
    const maxStr = agg._max.dt ? formatDateOnly(agg._max.dt) : "(none)";
    const behind = !wm || formatDateOnly(wm.lastDt) < TARGET_END;
    const line = `${id.padEnd(24)} wm=${wmStr.padEnd(12)} facts=${String(agg._count).padStart(7)} range=${agg._min.dt ? formatDateOnly(agg._min.dt) : "?"}..${maxStr} ${behind ? "NEEDS_BACKFILL" : "OK"}`;
    console.log(line);
    if (behind) gaps.push(id);
  }
  console.log("\nmetrics needing backfill:", gaps.join(", ") || "(none)");
  const failed = await prisma.ingestionRun.findMany({ where: { status: "FAILED" }, orderBy: { startedAt: "desc" }, take: 8 });
  if (failed.length) {
    console.log("\nrecent FAILED runs:");
    for (const r of failed) console.log(`  ${r.metricId}: ${r.error?.slice(0, 150)}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
