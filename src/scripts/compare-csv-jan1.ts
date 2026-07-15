import "../load-env";
import { prisma } from "../utils/prisma";

const CSV = {
  "2026-01-01": {
    "new.user_retention": { new_user: 1976, r2: 34.72 },
    "new.device_retention": { new_device: 1512, r2: 37.83 },
    "active.active_user": { dau: 11274, a2: 14920, ar2: 60.2 },
    "active.online_time": { dau: 11274, game_partition_users: 10187, avg_rank_match: 8.01, avg_lobby_time: 52.06 },
    "active.revival": { dau: 11274, revival7: 875, revival7_rate: 7.76 },
    "active.churn": { c2: 5541, c2_rate: 40.37 },
  },
} as const;

async function main() {
  for (const [date, metrics] of Object.entries(CSV)) {
    console.log(`\n=== ${date} ===`);
    for (const [metricId, expected] of Object.entries(metrics)) {
      const fact = await prisma.beanDailyFact.findFirst({
        where: { metricId, dt: new Date(`${date}T00:00:00Z`) },
      });
      const m = (fact?.measures ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      for (const [k, exp] of Object.entries(expected)) {
        const got = Number(m[k]);
        const ok = Math.abs(got - exp) < 0.15;
        parts.push(`${k}: csv=${exp} db=${got} ${ok ? "OK" : "DIFF"}`);
      }
      console.log(`${metricId}: ${parts.join(" | ")}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
