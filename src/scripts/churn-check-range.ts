import "../load-env";
import { prisma } from "../utils/prisma";

async function main() {
  const min = await prisma.beanDailyFact.findFirst({
    where: { metricId: "active.churn" },
    orderBy: { dt: "asc" },
  });
  const max = await prisma.beanDailyFact.findFirst({
    where: { metricId: "active.churn" },
    orderBy: { dt: "desc" },
  });
  console.log("range", min?.dt?.toISOString().slice(0, 10), "->", max?.dt?.toISOString().slice(0, 10));

  const staleRows = await prisma.beanDailyFact.findMany({
    where: { metricId: "active.churn" },
    select: { dt: true, measures: true },
  });
  let stale = 0;
  for (const row of staleRows) {
    const m = row.measures as Record<string, number>;
    const total = m.account_total ?? 0;
    const c7r = total ? Math.round((m.c7 / total) * 10000) / 100 : null;
    if (c7r !== m.c7_rate) stale++;
  }
  console.log("stale_rows", stale, "/", staleRows.length);

  const dates = [
    "2025-04-01",
    "2025-06-15",
    "2025-09-01",
    "2025-11-01",
    "2025-11-18",
    "2025-12-26",
    "2026-02-08",
    "2026-04-04",
  ];
  for (const d of dates) {
    const row = await prisma.beanDailyFact.findFirst({
      where: { metricId: "active.churn", dt: new Date(`${d}T00:00:00Z`) },
    });
    if (!row) {
      console.log(d, "NO DATA");
      continue;
    }
    const m = row.measures as Record<string, number>;
    const total = m.account_total ?? 0;
    const c7r = total ? Math.round((m.c7 / total) * 10000) / 100 : null;
    const match = c7r === m.c7_rate ? "OK" : "STALE";
    console.log(d, match, {
      total,
      c7_rate_db: m.c7_rate,
      c7_expected: c7r,
      c14_rate_db: m.c14_rate,
      c30_rate_db: m.c30_rate,
    });
  }
}

main().finally(() => prisma.$disconnect());
