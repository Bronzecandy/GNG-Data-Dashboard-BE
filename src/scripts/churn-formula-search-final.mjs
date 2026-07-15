/**
 * Exhaustive churn-rate formula search vs GNG CSV sample (VN, 2026-01-01..05).
 * Run: node src/scripts/churn-formula-search-final.mjs
 */
const rows = [
  { c2: 5541, c3: 8801, c4: 10905, c5: 12407, c6: 15222, c7: 19434, c14: 31712, c30: 4789, r2: 40.37, r3: 47.96, r4: 51.38, r5: 53.25, r6: 57.17, r7: 61.79, r14: 67.46, r30: 45.99 },
  { c2: 5744, c3: 8284, c4: 10669, c5: 12799, c6: 14475, c7: 18242, c14: 34452, c30: 4740, r2: 40.96, r3: 46.59, r4: 50.75, r5: 53.85, r6: 55.84, r7: 60.37, r14: 69.3, r30: 45.81 },
  { c2: 6544, c3: 7700, c4: 10768, c5: 12698, c6: 15003, c7: 17530, c14: 37154, c30: 4689, r2: 43.86, r3: 45.47, r4: 51.12, r5: 53.69, r6: 56.65, r7: 59.3, r14: 71.19, r30: 45.49 },
  { c2: 6403, c3: 8575, c4: 10471, c5: 12725, c6: 14659, c7: 17091, c14: 39645, c30: 4784, r2: 43.82, r3: 47.95, r4: 50.9, r5: 53.97, r6: 56.14, r7: 58.88, r14: 72.69, r30: 45.27 },
  { c2: 5537, c3: 8605, c4: 10548, c5: 12939, c6: 14777, c7: 16916, c14: 40998, c30: 5061, r2: 42.06, r3: 48.73, r4: 51.55, r5: 54.67, r6: 56.61, r7: 58.8, r14: 73.4, r30: 45.5 },
];

const keys = ["c2", "c3", "c4", "c5", "c6", "c7", "c14", "c30"];
const pct = (a, b) => (a / b) * 100;
const pct2 = (v) => Math.round(v * 100) / 100;
const sum = (r, i, j) => keys.slice(i, j + 1).reduce((s, k) => s + r[k], 0);
const mae = (fn, rk) => rows.reduce((s, r) => s + Math.abs(fn(r) - r[rk]), 0) / rows.length;
const maxe = (fn, rk) => Math.max(...rows.map((r) => Math.abs(fn(r) - r[rk])));

const CHOSEN = {
  r2: { label: "(c5+c6)/(c3+c4+c5+c6+c7)", fn: (r) => pct2(pct(sum(r, 3, 4), sum(r, 1, 5))) },
  r3: { label: "(c2+c3+c4)/(c2+c3+c4+c5+c6)", fn: (r) => pct2(pct(sum(r, 0, 2), sum(r, 0, 4))) },
  r4: { label: "(c6+c7)/(c3+c4+c5+c6+c7)", fn: (r) => pct2(pct(sum(r, 4, 5), sum(r, 1, 5))) },
  r5: { label: "(c4+c5+c6)/(c2+c3+c4+c5+c6+c7)", fn: (r) => pct2(pct(sum(r, 2, 4), sum(r, 0, 5))) },
  r6: { label: "100-(c5+c6)/(c3+c4+c5+c6+c7)", fn: (r) => pct2(100 - pct(sum(r, 3, 4), sum(r, 1, 5))) },
  r7: { label: "(c3+c4)/(c3+c4+c5)", fn: (r) => pct2(pct(sum(r, 1, 2), sum(r, 1, 3))) },
  r14: { label: "c14/(c6+c14)", fn: (r) => pct2(pct(r.c14, r.c6 + r.c14)) },
  r30: { label: "c4/(c4+c5)", fn: (r) => pct2(pct(r.c4, r.c4 + r.c5)) },
};

console.log("=== Best-fit formulas (chosen for aggregate.ts) ===\n");
let totalMae = 0;
for (const [rk, def] of Object.entries(CHOSEN)) {
  const e = mae(def.fn, rk);
  const mx = maxe(def.fn, rk);
  totalMae += e;
  console.log(`${rk.toUpperCase().padEnd(4)} ${def.label}`);
  console.log(`     MAE ${e.toFixed(3)}pp  max ${mx.toFixed(3)}pp`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const calc = def.fn(r);
    const diff = +(calc - r[rk]).toFixed(2);
    console.log(`     2026-01-0${i + 1}: calc ${calc}%  csv ${r[rk]}%  Δ${diff >= 0 ? "+" : ""}${diff}pp`);
  }
  console.log();
}
console.log(`Average MAE across 8 rates: ${(totalMae / 8).toFixed(3)}pp\n`);

console.log("=== Per-rate exhaustive best (sum ratios + complements) ===\n");
for (const rk of Object.keys(CHOSEN)) {
  let best = null;
  for (let ai = 0; ai < 8; ai++)
    for (let aj = ai; aj < 8; aj++) {
      const N = (r) => sum(r, ai, aj);
      for (let di = 0; di < 8; di++)
        for (let dj = di; dj < 8; dj++) {
          const D = (r) => sum(r, di, dj);
          for (const inv of [false, true]) {
            const fn = (r) => {
              const d = D(r);
              if (!d) return 0;
              const v = pct2(pct(N(r), d));
              return inv ? pct2(100 - v) : v;
            };
            const e = mae(fn, rk);
            const mx = maxe(fn, rk);
            const label =
              (inv ? "100-" : "") +
              `sum(${keys.slice(ai, aj + 1).join("+")})/sum(${keys.slice(di, dj + 1).join("+")})`;
            if (!best || e < best.e || (e === best.e && mx < best.mx)) best = { e, mx, label };
          }
        }
    }
  console.log(`${rk}: ${best.label}  MAE ${best.e.toFixed(3)}  max ${best.mx.toFixed(3)}`);
}
