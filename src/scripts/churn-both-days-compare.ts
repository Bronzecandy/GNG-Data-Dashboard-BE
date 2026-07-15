import "../load-env";
import { readFileSync } from "fs";
import { prisma } from "../utils/prisma";

const maps = JSON.parse(
  readFileSync("discovery/churn-both2-all7.json", "utf8"),
) as { both2: Record<string, number>; all7: Record<string, number> };

const paths = [
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-2-2026, 2-21-13 PM.csv",
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-7-2026, 3-06-43 PM.csv",
];

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
const isoToKey = (iso: string) => iso.replace(/-/g, "");

const RATES = [
  { n: 2, ck: "c2" as const, rk: "r2" as const, rateCol: "C2 Rate", countCol: "C2" },
  { n: 7, ck: "c7" as const, rk: "r7" as const, rateCol: "C7 Rate", countCol: "C7" },
];

async function main() {
  const rows: Array<Record<string, string | number>> = [];
  for (const p of paths) {
    for (const r of loadCsv(p)) {
      const row: Record<string, string | number> = { date: r.Date };
      for (const { ck, rk, rateCol, countCol } of RATES) {
        row[ck] = +r[countCol];
        row[rk] = pct(r[rateCol]);
      }
      rows.push(row);
    }
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  type E = { date: string; c2: number; c7: number; r2: number; r7: number; a2: number; a7: number; both2: number; all7: number };
  const enriched: E[] = [];
  for (const row of rows) {
    const dt = new Date(`${row.date}T00:00:00Z`);
    const active = await prisma.beanDailyFact.findFirst({ where: { metricId: "active.active_user", dt } });
    const am = (active?.measures ?? {}) as Record<string, number>;
    const k = isoToKey(String(row.date));
    enriched.push({
      date: String(row.date),
      c2: row.c2 as number,
      c7: row.c7 as number,
      r2: row.r2 as number,
      r7: row.r7 as number,
      a2: am.a2 ?? 0,
      a7: am.a7 ?? 0,
      both2: maps.both2[k] ?? 0,
      all7: maps.all7[k] ?? 0,
    });
  }

  console.log(`Compared ${enriched.length} CSV days\n`);

  for (const { n, ck, rk } of RATES) {
    const aKey = `a${n}` as "a2" | "a7";
    const bothKey = n === 2 ? "both2" : "all7";
    const formulas = [
      { name: `c${n}/a${n} (A${n} union)`, fn: (r: E) => rate(r[ck], r[aKey]) },
      { name: `c${n}/${bothKey} (active ALL ${n} days)`, fn: (r: E) => rate(r[ck], r[bothKey]) },
      { name: `c${n}/(c${n}+a${n})`, fn: (r: E) => rate(r[ck], r[ck] + r[aKey]) },
      { name: `c${n}/(c${n}+${bothKey})`, fn: (r: E) => rate(r[ck], r[ck] + r[bothKey]) },
    ];
    console.log(`=== C${n} rate ===`);
    for (const f of formulas) {
      const errs = enriched.map((r) => Math.abs(f.fn(r) - r[rk]));
      console.log(`  ${f.name.padEnd(32)} MAE ${mae(errs).toFixed(3)}pp  max ${Math.max(...errs).toFixed(3)}pp`);
    }
    console.log();
  }

  const s = enriched.find((r) => r.date === "2026-02-01")!;
  console.log("=== 2026-02-01 detail ===");
  console.log(`C2: csv=${s.r2}%  c2/a2=${rate(s.c2,s.a2)}%  c2/both2=${rate(s.c2,s.both2)}%  c2/(c2+both2)=${rate(s.c2,s.c2+s.both2)}%  c2/(c2+a2)=${rate(s.c2,s.c2+s.a2)}%`);
  console.log(`C7: csv=${s.r7}%  c7/a7=${rate(s.c7,s.a7)}%  c7/all7=${rate(s.c7,s.all7)}%  c7/(c7+all7)=${rate(s.c7,s.c7+s.all7)}%`);

  console.log("\nNote: A2 from dm = SUM(is_a2) on d_s snapshot (same count), NOT both-days intersection.");
  console.log(`Feb1: a2=${s.a2} vs both2=${s.both2} (intersection) vs dau~5297`);

  await prisma.$disconnect();
}

main();
