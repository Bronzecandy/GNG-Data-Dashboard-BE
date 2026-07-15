import "../load-env";
import { readFileSync } from "fs";
import { prisma } from "../utils/prisma";

const paths = [
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-2-2026, 2-21-13 PM.csv",
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-7-2026, 3-06-43 PM.csv",
];

const RATE_KEYS = [
  { day: 2, ck: "c2", rk: "r2", rateCol: "C2 Rate", countCol: "C2" },
  { day: 3, ck: "c3", rk: "r3", rateCol: "C3 Rate", countCol: "C3" },
  { day: 4, ck: "c4", rk: "r4", rateCol: "C4 Rate", countCol: "C4" },
  { day: 5, ck: "c5", rk: "r5", rateCol: "C5 Rate", countCol: "C5" },
  { day: 6, ck: "c6", rk: "r6", rateCol: "C6 Rate", countCol: "C6" },
  { day: 7, ck: "c7", rk: "r7", rateCol: "C7 Rate", countCol: "C7" },
  { day: 14, ck: "c14", rk: "r14", rateCol: "C14 Rate", countCol: "C14" },
  { day: 30, ck: "c30", rk: "r30", rateCol: "C30 Rate", countCol: "C30" },
] as const;

function loadCsv(path: string) {
  const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const h = lines[0]!.split(",").map((x) => x.trim());
  return lines.slice(1).map((line) => {
    const v = line.split(",");
    const o: Record<string, string> = {};
    h.forEach((k, i) => { o[k] = v[i] ?? ""; });
    return o;
  });
}

const pct = (s: string) => Number(String(s).replace("%", ""));
const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);
const mae = (errs: number[]) => errs.reduce((a, b) => a + b, 0) / errs.length;

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function loadDauMap(from: string, to: string): Promise<Map<string, number>> {
  const rows = await prisma.beanDailyFact.findMany({
    where: {
      metricId: "active.active_user",
      dt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
    },
    select: { dt: true, measures: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const iso = r.dt.toISOString().slice(0, 10);
    const m = r.measures as Record<string, number>;
    map.set(iso, m.dau ?? 0);
  }
  return map;
}

async function main() {
  type Row = { date: string } & Record<string, number>;
  const rows: Row[] = [];
  for (const p of paths) {
    for (const r of loadCsv(p)) {
      const row: Row = { date: r.Date };
      for (const { ck, rk, rateCol, countCol } of RATE_KEYS) {
        row[ck] = +r[countCol];
        row[rk] = pct(r[rateCol]);
      }
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const minDate = rows[0]!.date;
  const maxDate = rows[rows.length - 1]!.date;
  const dauFrom = addDays(minDate, -35);
  const dauMap = await loadDauMap(dauFrom, maxDate);

  console.log(`CSV days: ${rows.length} (${minDate} .. ${maxDate})`);
  console.log(`DAU loaded: ${dauMap.size} days from ${dauFrom}\n`);

  // Example Feb 3 / Feb 1
  const ex = rows.find((r) => r.date === "2026-02-03");
  if (ex) {
    const dauLag = dauMap.get(addDays(ex.date, -2)) ?? 0;
    console.log("=== Example: C2(03/02) / DAU(01/02) ===");
    console.log(`C2=${ex.c2}  DAU(01/02)=${dauLag}  calc=${rate(ex.c2, dauLag)}%  CSV=${ex.r2}%  diff=${(rate(ex.c2, dauLag) - ex.r2).toFixed(2)}pp\n`);
  }

  console.log("=== Unified: cN(date) / DAU(date - N days) ===");
  let totalMae = 0;
  let count = 0;
  for (const { day, ck, rk } of RATE_KEYS) {
    const errs: number[] = [];
    const skipped: string[] = [];
    for (const r of rows) {
      const lagDate = addDays(r.date, -day);
      const dau = dauMap.get(lagDate);
      if (!dau) { skipped.push(r.date); continue; }
      errs.push(Math.abs(rate(r[ck], dau) - r[rk]));
    }
    const e = mae(errs);
    totalMae += e;
    count++;
    console.log(`c${day}/dau(-${day}d)  n=${errs.length}  MAE ${e.toFixed(3)}pp  max ${Math.max(...errs).toFixed(3)}pp${skipped.length ? `  skip ${skipped.length}` : ""}`);
  }
  console.log(`avg MAE ${(totalMae / count).toFixed(3)}pp\n`);

  console.log("=== Compare baselines (same day) ===");
  for (const { day, ck, rk } of RATE_KEYS) {
    const errsLag = rows.map((r) => Math.abs(rate(r[ck], dauMap.get(addDays(r.date, -day)) ?? 0) - r[rk])).filter((_, i) => dauMap.has(addDays(rows[i]!.date, -day)));
    const errsSame = rows.map((r) => Math.abs(rate(r[ck], dauMap.get(r.date) ?? 0) - r[rk])).filter((_, i) => dauMap.has(rows[i]!.date));
    const lagMae = mae(errsLag);
    const sameMae = mae(errsSame);
    const best = lagMae < sameMae ? "lagged" : "same-day";
    console.log(`c${day}: lagged=${lagMae.toFixed(3)}pp  same-day dau=${sameMae.toFixed(3)}pp  better=${best}`);
  }

  console.log("\n=== Feb 2026 sample (first 7 days) C2 ===");
  for (const r of rows.filter((x) => x.date.startsWith("2026-02")).slice(0, 7)) {
    const lag = addDays(r.date, -2);
    const d = dauMap.get(lag) ?? 0;
  console.log(`${r.date}  c2=${r.c2}  dau(${lag})=${d}  calc=${rate(r.c2, d)}%  csv=${r.r2}%`);
  }

  await prisma.$disconnect();
}

main();
