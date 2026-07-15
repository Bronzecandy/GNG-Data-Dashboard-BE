const rows = [
  { c2:5541,c3:8801,c4:10905,c5:12407,c6:15222,c7:19434,c14:31712,c30:4789, r2:40.37,r3:47.96,r4:51.38,r5:53.25,r6:57.17,r7:61.79,r14:67.46,r30:45.99 },
  { c2:5744,c3:8284,c4:10669,c5:12799,c6:14475,c7:18242,c14:34452,c30:4740, r2:40.96,r3:46.59,r4:50.75,r5:53.85,r6:55.84,r7:60.37,r14:69.3,r30:45.81 },
  { c2:6544,c3:7700,c4:10768,c5:12698,c6:15003,c7:17530,c14:37154,c30:4689, r2:43.86,r3:45.47,r4:51.12,r5:53.69,r6:56.65,r7:59.3,r14:71.19,r30:45.49 },
  { c2:6403,c3:8575,c4:10471,c5:12725,c6:14659,c7:17091,c14:39645,c30:4784, r2:43.82,r3:47.95,r4:50.9,r5:53.97,r6:56.14,r7:58.88,r14:72.69,r30:45.27 },
  { c2:5537,c3:8605,c4:10548,c5:12939,c6:14777,c7:16916,c14:40998,c30:5061, r2:42.06,r3:48.73,r4:51.55,r5:54.67,r6:56.61,r7:58.8,r14:73.4,r30:45.5 },
];
const keys = ['c2','c3','c4','c5','c6','c7','c14','c30'];
const rateKeys = ['r2','r3','r4','r5','r6','r7','r14','r30'];
const pct = (a,b) => a/b*100;

function sumRange(row, i, j) {
  let s = 0;
  for (let k = i; k <= j; k++) s += row[keys[k]];
  return s;
}

function mae(fn) {
  let total = 0;
  for (const row of rows) {
    for (const rk of rateKeys) {
      const pred = fn(row, rk);
      if (!Number.isFinite(pred)) return Infinity;
      total += Math.abs(pred - row[rk]);
    }
  }
  return total / (rows.length * rateKeys.length);
}

function maeOne(fn, rk) {
  let total = 0;
  for (const row of rows) {
    const pred = fn(row, rk);
    if (!Number.isFinite(pred)) return Infinity;
    total += Math.abs(pred - row[rk]);
  }
  return total / rows.length;
}

// Per-rate exhaustive search
for (let ri = 0; ri < rateKeys.length; ri++) {
  const rk = rateKeys[ri];
  const ni = ri; // numerator bucket index matches rate order
  let best = { mae: Infinity, label: '' };

  // num = single bucket ni
  for (let dj = 0; dj < keys.length; dj++) {
    for (let dk = dj; dk < keys.length; dk++) {
      const label = `c${keys[ni].slice(1)} / sum(c${keys[dj].slice(1)}..c${keys[dk].slice(1)})`;
      const fn = (row) => pct(row[keys[ni]], sumRange(row, dj, dk));
      const err = maeOne(fn, rk);
      if (err < best.mae) best = { mae: err, label };
    }
  }

  // num = sum(ci..cj) / sum(ck..cl)
  for (let ai = 0; ai <= ni; ai++) {
    for (let aj = ai; aj <= ni; aj++) {
      for (let di = 0; di < keys.length; di++) {
        for (let dj = di; dj < keys.length; dj++) {
          const label = `sum(c${keys[ai].slice(1)}..c${keys[aj].slice(1)}) / sum(c${keys[di].slice(1)}..c${keys[dj].slice(1)})`;
          const fn = (row) => pct(sumRange(row, ai, aj), sumRange(row, di, dj));
          const err = maeOne(fn, rk);
          if (err < best.mae) best = { mae: err, label };
        }
      }
    }
  }

  // single / single
  for (let dj = 0; dj < keys.length; dj++) {
    const label = `c${keys[ni].slice(1)} / c${keys[dj].slice(1)}`;
    const fn = (row) => pct(row[keys[ni]], row[keys[dj]]);
    const err = maeOne(fn, rk);
    if (err < best.mae) best = { mae: err, label };
  }

  // single / (single + single) adjacent pairs
  for (let dj = 0; dj < keys.length; dj++) {
    for (let dk = dj + 1; dk < keys.length; dk++) {
      const label = `c${keys[ni].slice(1)} / (c${keys[dj].slice(1)}+c${keys[dk].slice(1)})`;
      const fn = (row) => pct(row[keys[ni]], row[keys[dj]] + row[keys[dk]]);
      const err = maeOne(fn, rk);
      if (err < best.mae) best = { mae: err, label };
    }
  }

  console.log(rk.toUpperCase(), 'best', best.label, 'MAE', best.mae.toFixed(3));
  for (const row of rows) {
    const evalPred = (() => {
      const l = best.label;
      const get = (k) => row['c'+k];
      if (l.includes('sum')) {
        const m = l.match(/sum\(c(\d+)..c(\d+)\) \/ sum\(c(\d+)..c(\d+)\)/);
        if (m) {
          const idx = (x) => keys.indexOf('c'+x);
          return pct(sumRange(row, idx(m[1]), idx(m[2])), sumRange(row, idx(m[3]), idx(m[4])));
        }
        const m2 = l.match(/c(\d+) \/ sum\(c(\d+)..c(\d+)\)/);
        if (m2) {
          const idx = (x) => keys.indexOf('c'+x);
          return pct(row['c'+m2[1]], sumRange(row, idx(m2[2]), idx(m2[3])));
        }
      }
      const m3 = l.match(/c(\d+) \/ \(c(\d+)\+c(\d+)\)/);
      if (m3) return pct(get(m3[1]), get(m3[2])+get(m3[3]));
      const m4 = l.match(/c(\d+) \/ c(\d+)/);
      if (m4) return pct(get(m4[1]), get(m4[2]));
      return NaN;
    })();
    console.log('  pred', evalPred.toFixed(2), 'csv', row[rk]);
  }
}
