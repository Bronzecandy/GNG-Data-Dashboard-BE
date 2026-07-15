import "../load-env";
import { prisma } from "../utils/prisma";

const CSV: Record<string, { dau: number; a2: number; ar2: number }> = {
  "2026-01-01": { dau: 11274, a2: 14920, ar2: 60.2 },
  "2026-01-02": { dau: 10126, a2: 14613, ar2: 63.89 },
  "2026-01-03": { dau: 9509, a2: 13165, ar2: 65.04 },
  "2026-01-04": { dau: 9186, a2: 12510, ar2: 60.53 },
  "2026-01-05": { dau: 7864, a2: 11490, ar2: 68.5 },
};

async function main() {
  console.log("=== DB vs CSV after active_user fix ===\n");
  for (const [date, exp] of Object.entries(CSV)) {
    const fact = await prisma.beanDailyFact.findFirst({
      where: { metricId: "active.active_user", dt: new Date(`${date}T00:00:00Z`) },
    });
    const m = (fact?.measures ?? {}) as Record<string, unknown>;
    const ok = (k: string, v: number, tol = 1) =>
      Math.abs(Number(m[k]) - v) <= tol ? "OK" : `DIFF(db=${m[k]})`;
    console.log(
      `${date}: dau ${ok("dau", exp.dau)} | a2 ${ok("a2", exp.a2)} | ar2 ${ok("ar2", exp.ar2, 0.15)}`,
    );
  }
}

main().finally(() => prisma.$disconnect());
