import "../load-env";
import { prisma } from "../utils/prisma";
import { formatDateOnly } from "../utils/dates";

async function main() {
  const from = process.argv[2] || "2026-01-01";
  const to = process.argv[3] || "2026-01-05";
  const region = process.argv[4] || "VN";

  const fromDt = new Date(`${from}T00:00:00Z`);
  const toDt = new Date(`${to}T00:00:00Z`);

  const metrics = await prisma.beanDailyFact.groupBy({
    by: ["metricId"],
    where: { dt: { gte: fromDt, lte: toDt } },
    _count: { _all: true },
  });

  console.log(`\n=== Fact counts ${from} -> ${to} ===`);
  for (const m of metrics.sort((a, b) => a.metricId.localeCompare(b.metricId))) {
    console.log(`  ${m.metricId}: ${m._count._all} rows`);
  }

  const sample = await prisma.beanDailyFact.findFirst({
    where: {
      metricId: "new.user_retention",
      dt: fromDt,
    },
  });

  const vnSample = await prisma.beanDailyFact.findMany({
    where: {
      metricId: "new.user_retention",
      dt: { gte: fromDt, lte: toDt },
    },
    orderBy: { dt: "asc" },
  });

  const vnRows = vnSample.filter((r) => {
    const dims = r.dims as Record<string, unknown>;
    return dims.ip_region === region;
  });

  console.log(`\n=== hack.stats kind counts by date ===`);
  for (const d of ["2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13"]) {
    const rows = await prisma.beanDailyFact.findMany({
      where: { metricId: "hack.stats", dt: new Date(`${d}T00:00:00Z`) },
    });
    const kinds = new Map<string, number>();
    for (const row of rows) {
      const kind = String((row.dims as Record<string, unknown>).kind ?? "?");
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
    console.log(`  ${d}: ${[...kinds.entries()].map(([k, n]) => `${k}=${n}`).join(", ")}`);
  }

  console.log(`\n=== new.user_retention (${region}) daily new_user ===`);
  for (const row of vnRows) {
    const measures = row.measures as Record<string, unknown>;
    console.log(
      `  ${formatDateOnly(row.dt)}: new_user=${measures.new_user}, r2=${measures.r2}%`,
    );
  }

  const deviceRows = await prisma.beanDailyFact.findMany({
    where: { metricId: "new.device_retention", dt: { gte: fromDt, lte: toDt } },
    orderBy: { dt: "asc" },
  });
  const deviceVn = deviceRows.filter((r) => (r.dims as Record<string, unknown>).ip_region === region);
  console.log(`\n=== new.device_retention (${region}) ===`);
  for (const row of deviceVn) {
    const measures = row.measures as Record<string, unknown>;
    console.log(
      `  ${formatDateOnly(row.dt)}: new_device=${measures.new_device}, r2=${measures.r2}%`,
    );
  }

  const active = await prisma.beanDailyFact.findMany({
    where: {
      metricId: "active.active_user",
      dt: { gte: fromDt, lte: toDt },
    },
    orderBy: { dt: "asc" },
  });
  const activeVn = active.filter((r) => (r.dims as Record<string, unknown>).ip_region === region);
  console.log(`\n=== active.active_user (${region}) DAU ===`);
  for (const row of activeVn) {
    const measures = row.measures as Record<string, unknown>;
    console.log(`  ${formatDateOnly(row.dt)}: dau=${measures.dau}`);
  }

  if (!sample) {
    console.warn("\nWARN: No new.user_retention facts found — run backfill first.");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
