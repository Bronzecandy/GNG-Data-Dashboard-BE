/**
 * Validate churn count/rate formulas against GNG CSV exports.
 * Run: node src/scripts/churn-csv-validate.mjs [path-to-csv]
 */
import { readFileSync } from "fs";

const csvPath =
  process.argv[2] ||
  "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-7-2026, 3-06-43 PM.csv";

function loadCsv(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] ?? "").trim();
    });
    return row;
  });
}

function parseRows(csvRows) {
  const pct = (s) => Number(String(s).replace("%", ""));
  return csvRows.map((r) => ({
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
  }));
}

const keys = ["c2", "c3", "c4", "c5", "c6", "c7", "c14", "c30"];
const pct = (a, b) => (a / b) * 100;
const pct2 = (v) => Math.round(v * 100) / 100;
const sum = (r, i, j) => keys.slice(i, j + 1).reduce((s, k) => s + r[k], 0);
const mae = (fn, rk, rows) =>
  rows.reduce((s, r) => s + Math.abs(fn(r) - r[rk]), 0) / rows.length;

const OLD = {
  r2: (r) => pct2(pct(sum(r, 3, 4), sum(r, 1, 5))),
  r3: (r) => pct2(pct(sum(r, 0, 2), sum(r, 0, 4))),
  r4: (r) => pct2(pct(sum(r, 4, 5), sum(r, 1, 5))),
  r5: (r) => pct2(pct(sum(r, 2, 4), sum(r, 0, 5))),
  r6: (r) => pct2(100 - pct(sum(r, 3, 4), sum(r, 1, 5))),
  r7: (r) => pct2(pct(sum(r, 1, 2), sum(r, 1, 3))),
  r14: (r) => pct2(pct(r.c14, r.c6 + r.c14)),
  r30: (r) => pct2(pct(r.c4, r.c4 + r.c5)),
};

const ADJACENT = {
  r2: (r) => pct2(pct(r.c2, r.c2 + r.c3)),
  r3: (r) => pct2(pct(r.c3, r.c3 + r.c4)),
  r4: (r) => pct2(pct(r.c4, r.c4 + r.c5)),
  r5: (r) => pct2(pct(r.c5, r.c5 + r.c6)),
  r6: (r) => pct2(pct(r.c6, r.c6 + r.c7)),
  r7: (r) => pct2(pct(r.c7, r.c7 + r.c14)),
  r14: (r) => pct2(pct(r.c14, r.c14 + r.c30)),
  r30: (r) => pct2(pct(r.c30, r.c14 + r.c30)),
};

const rows = parseRows(loadCsv(csvPath));
console.log(`CSV: ${csvPath}`);
console.log(`Days: ${rows.length} (${rows[0]?.date} .. ${rows[rows.length - 1]?.date})\n`);

for (const [name, fns] of [
  ["Old ad-hoc formulas (Jan-tuned)", OLD],
  ["Adjacent funnel c_n/(c_n+c_next)", ADJACENT],
]) {
  let total = 0;
  console.log(`=== ${name} ===`);
  for (const rk of Object.keys(fns)) {
    const e = mae(fns[rk], rk, rows);
    total += e;
    console.log(`  ${rk} MAE ${e.toFixed(2)}pp`);
  }
  console.log(`  avg MAE ${(total / 8).toFixed(2)}pp\n`);
}

console.log("Note: Bean counts match CSV via dws_user_active_account_d_s SUM(is_cN).");
console.log("No churn rate columns found in Bean catalog — rates must come from GNG dashboard SQL.");
