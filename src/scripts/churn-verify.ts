import "../load-env";
import { prisma } from "../utils/prisma";

async function main() {
  const dates = ["2026-04-04", "2026-04-03", "2026-04-05", "2026-02-08", "2025-12-26", "2026-01-01"];
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
    console.log(d, {
      account_total: total,
      c7: m.c7,
      c14: m.c14,
      c30: m.c30,
      c7_rate_db: m.c7_rate,
      c14_rate_db: m.c14_rate,
      c30_rate_db: m.c30_rate,
      c7_over_total: total ? Math.round((m.c7 / total) * 10000) / 100 : null,
      c30_over_c14_old: m.c14 ? Math.round((m.c30 / m.c14) * 10000) / 100 : null,
    });
  }
}

main().finally(() => prisma.$disconnect());
