import "../load-env";
import { readFileSync } from "fs";
import { prisma } from "../utils/prisma";

const FEB_CSV =
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-7-2026, 3-06-43 PM.csv";
const JAN_CSV =
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-2-2026, 2-21-13 PM.csv";

function loadCsv(path: string) {
  const text = readFileSync(path, "utf8");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] ?? "").trim();
    });
    return row;
  });
}

function parseCsvRows(paths: string[]) {
  const pct = (s: string) => Number(String(s).replace("%", ""));
  const rows: Array<{
    date: string;
    c2: number;
    c3: number;
    c4: number;
    c5: number;
    c6: number;
    c7: number;
    c14: number;
    c30: number;
    r2: number;
    r3: number;
    r4: number;
    r5: number;
    r6: number;
    r7: number;
    r14: number;
    r30: number;
  }> = [];
  for (const path of paths) {
    for (const r of loadCsv(path)) {
      rows.push({
        date: r.Date,
        c2: +r.C2,
        c3: +r.C3,
        c4: +r.C4,
        c5: +r.C5,
        c6: +r.C6,
        c7: +r.C7,
        c14: +r.C14,
        c30: +r.C30,
        r2: pct(r["C2 Rate"]),
        r3: pct(r["C3 Rate"]),
        r4: pct(r["C4 Rate"]),
        r5: pct(r["C5 Rate"]),
        r6: pct(r["C6 Rate"]),
        r7: pct(r["C7 Rate"]),
        r14: pct(r["C14 Rate"]),
        r30: pct(r["C30 Rate"]),
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

type Abs = {
  dau: number;
  a2: number;
  a3: number;
  a4: number;
  a5: number;
  a6: number;
  a7: number;
  a14: number;
  a30: number;
  ar2: number;
  ar3: number;
  ar4: number;
  ar5: number;
  ar6: number;
  ar7: number;
  ar14: number;
  ar30: number;
  account_total: number;
  revival_dau: number;
};

async function loadAbsolutes(date: string): Promise<Abs> {
  const dt = new Date(`${date}T00:00:00Z`);
  const churn = await prisma.beanDailyFact.findFirst({
    where: { metricId: "active.churn", dt },
  });
  const active = await prisma.beanDailyFact.findFirst({
    where: { metricId: "active.active_user", dt },
  });
  const revival = await prisma.beanDailyFact.findFirst({
    where: { metricId: "active.revival", dt },
  });
  const cm = (churn?.measures ?? {}) as Record<string, number>;
  const am = (active?.measures ?? {}) as Record<string, number>;
  const rm = (revival?.measures ?? {}) as Record<string, number>;
  return {
    dau: am.dau ?? 0,
    a2: am.a2 ?? 0,
    a3: am.a3 ?? 0,
    a4: am.a4 ?? 0,
    a5: am.a5 ?? 0,
    a6: am.a6 ?? 0,
    a7: am.a7 ?? 0,
    a14: am.a14 ?? 0,
    a30: am.a30 ?? 0,
    ar2: am.ar2 ?? 0,
    ar3: am.ar3 ?? 0,
    ar4: am.ar4 ?? 0,
    ar5: am.ar5 ?? 0,
    ar6: am.ar6 ?? 0,
    ar7: am.ar7 ?? 0,
    ar14: am.ar14 ?? 0,
    ar30: am.ar30 ?? 0,
    account_total: cm.account_total ?? 0,
    revival_dau: rm.dau ?? 0,
  };
}

const pct2 = (v: number) => Math.round(v * 100) / 100;
const rate = (n: number, d: number) => (d > 0 ? pct2((n / d) * 100) : 0);
const mae = (errs: number[]) => errs.reduce((s, e) => s + e, 0) / errs.length;

const RATE_KEYS = [
  { rk: "r2" as const, ck: "c2" as const, day: 2 },
  { rk: "r3" as const, ck: "c3" as const, day: 3 },
  { rk: "r4" as const, ck: "c4" as const, day: 4 },
  { rk: "r5" as const, ck: "c5" as const, day: 5 },
  { rk: "r6" as const, ck: "c6" as const, day: 6 },
  { rk: "r7" as const, ck: "c7" as const, day: 7 },
  { rk: "r14" as const, ck: "c14" as const, day: 14 },
  { rk: "r30" as const, ck: "c30" as const, day: 30 },
];

type DenFn = (c: Record<string, number>, a: Abs) => number;

const DENOMINATORS: Array<{ name: string; fn: DenFn }> = [
  { name: "dau", fn: (_c, a) => a.dau },
  { name: "account_total", fn: (_c, a) => a.account_total },
  { name: "revival_dau", fn: (_c, a) => a.revival_dau },
  { name: "a2", fn: (_c, a) => a.a2 },
  { name: "a3", fn: (_c, a) => a.a3 },
  { name: "a4", fn: (_c, a) => a.a4 },
  { name: "a5", fn: (_c, a) => a.a5 },
  { name: "a6", fn: (_c, a) => a.a6 },
  { name: "a7", fn: (_c, a) => a.a7 },
  { name: "a14", fn: (_c, a) => a.a14 },
  { name: "a30", fn: (_c, a) => a.a30 },
  { name: "sum(c2..c30)", fn: (c) => c.c2 + c.c3 + c.c4 + c.c5 + c.c6 + c.c7 + c.c14 + c.c30 },
];

async function main() {
  const csvRows = parseCsvRows([JAN_CSV, FEB_CSV]);
  console.log(`Loaded ${csvRows.length} CSV days\n`);

  const enriched: Array<(typeof csvRows)[0] & { abs: Abs }> = [];
  for (const row of csvRows) {
    const abs = await loadAbsolutes(row.date);
    enriched.push({ ...row, abs });
  }

  // Sample Feb 1
  const s = enriched.find((r) => r.date === "2026-02-01")!;
  console.log("=== 2026-02-01 absolutes ===");
  console.log({
    dau: s.abs.dau,
    a2: s.abs.a2,
    a7: s.abs.a7,
    a14: s.abs.a14,
    a30: s.abs.a30,
    account_total: s.abs.account_total,
  });
  console.log();

  // Unified rule: cN / aN (matching day)
  console.log("=== Unified: cN / aN (C2/A2, C7/A7, ...) ===");
  let totalMae = 0;
  let n = 0;
  for (const { rk, ck, day } of RATE_KEYS) {
    const aKey = `a${day}` as keyof Abs;
    const errs = enriched.map((r) => {
      const calc = rate(r[ck], r.abs[aKey] as number);
      return Math.abs(calc - r[rk]);
    });
    const e = mae(errs);
    totalMae += e;
    n++;
    console.log(`${ck}/a${day}  MAE ${e.toFixed(3)}pp  max ${Math.max(...errs).toFixed(3)}pp`);
  }
  console.log(`avg MAE ${(totalMae / n).toFixed(3)}pp\n`);

  // Unified: cN / a2 for all (user suggestion C2 / 2-day active)
  console.log("=== Unified: all rates use cN / a2 ===");
  for (const { rk, ck } of RATE_KEYS) {
    const errs = enriched.map((r) => Math.abs(rate(r[ck], r.abs.a2) - r[rk]));
    console.log(`${ck}/a2  MAE ${mae(errs).toFixed(3)}pp`);
  }
  console.log();

  // Best denominator per rate column
  console.log("=== Best denominator per rate (all CSV days) ===");
  for (const { rk, ck } of RATE_KEYS) {
    let best = { name: "", mae: 999, max: 999 };
    for (const d of DENOMINATORS) {
      const errs = enriched.map((r) => {
        const den = d.fn(r, r.abs);
        return Math.abs(rate(r[ck], den) - r[rk]);
      });
      const e = mae(errs);
      const mx = Math.max(...errs);
      if (e < best.mae || (e === best.mae && mx < best.max)) {
        best = { name: d.name, mae: e, max: mx };
      }
    }
    // also try cN / aM where M = day from mapping
    console.log(`${rk} (${ck}): best=${best.name}  MAE ${best.mae.toFixed(3)}pp  max ${best.max.toFixed(3)}pp`);
  }
  console.log();

  // Cross: each rate tries all a2-a30 and dau
  console.log("=== Full grid: each cN vs each absolute (avg MAE) ===");
  const grid: Array<{ num: string; den: string; mae: number }> = [];
  for (const { rk, ck } of RATE_KEYS) {
    for (const d of DENOMINATORS) {
      const errs = enriched.map((r) => Math.abs(rate(r[ck], d.fn(r, r.abs)) - r[rk]));
      grid.push({ num: ck, den: d.name, mae: mae(errs) });
    }
  }
  grid.sort((a, b) => a.mae - b.mae);
  for (const g of grid.slice(0, 20)) {
    console.log(`${g.num} / ${g.den}  MAE ${g.mae.toFixed(3)}pp`);
  }

  console.log("\n=== Feb-only: cN / aN matched ===");
  const feb = enriched.filter((r) => r.date.startsWith("2026-02"));
  for (const { rk, ck, day } of RATE_KEYS) {
    const aKey = `a${day}` as keyof Abs;
    const errs = feb.map((r) => Math.abs(rate(r[ck], r.abs[aKey] as number) - r[rk]));
    console.log(`${ck}/a${day}  MAE ${mae(errs).toFixed(3)}pp`);
  }

  console.log("\n=== Jan-only sample (5d) ===");
  const jan = enriched.filter((r) => r.date.startsWith("2026-01"));
  for (const { rk, ck, day } of RATE_KEYS) {
    const aKey = `a${day}` as keyof Abs;
    const errs = jan.map((r) => Math.abs(rate(r[ck], r.abs[aKey] as number) - r[rk]));
    if (jan.length) console.log(`${ck}/a${day}  MAE ${mae(errs).toFixed(3)}pp`);
  }

  // Extra formulas: dau, 100-arN, cN/(aN-cN), c30/(c30+a30)
  console.log("\n=== Extra formulas (best per rate) ===");
  type ExtraFn = (r: (typeof enriched)[0], day: number, c: number) => number;
  const extras: Array<{ name: string; fn: ExtraFn }> = [
    { name: "cN/dau", fn: (r, _d, c) => rate(c, r.abs.dau) },
    { name: "cN/(aN-cN)", fn: (r, d, c) => rate(c, (r.abs[`a${d}` as keyof Abs] as number) - c) },
    { name: "cN/(cN+aN)", fn: (r, d, c) => rate(c, c + (r.abs[`a${d}` as keyof Abs] as number)) },
    { name: "cN/account_total", fn: (r, _d, c) => rate(c, r.abs.account_total) },
    { name: "100-arN", fn: (r, d) => pct2(100 - (r.abs[`ar${d}` as keyof Abs] as number)) },
    { name: "c30/(c30+a30)", fn: (r) => rate(r.c30, r.c30 + r.abs.a30) },
  ];
  for (const { rk, ck, day } of RATE_KEYS) {
    let best = { name: "", mae: 999 };
    for (const ex of extras) {
      const errs = enriched.map((r) =>
        Math.abs(ex.fn(r, day, r[ck]) - r[rk]),
      );
      const e = mae(errs);
      if (e < best.mae) best = { name: ex.name, mae: e };
    }
    console.log(`${rk}: best extra=${best.name} MAE ${best.mae.toFixed(3)}pp`);
  }

  const feb1 = enriched.find((r) => r.date === "2026-02-01")!;
  console.log("\n=== 2026-02-01: cN/aN vs 100-arN vs CSV ===");
  for (const { rk, ck, day } of RATE_KEYS) {
    const a = feb1.abs[`a${day}` as keyof Abs] as number;
    const ar = feb1.abs[`ar${day}` as keyof Abs] as number;
    console.log(
      `${ck}: csv=${feb1[rk]}%  c/a${day}=${rate(feb1[ck], a)}%  100-ar${day}=${pct2(100 - ar)}%`,
    );
  }
}

main().finally(() => prisma.$disconnect());
