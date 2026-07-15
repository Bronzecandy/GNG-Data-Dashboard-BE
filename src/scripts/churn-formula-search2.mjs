const rows = [
  { c2:5541,c3:8801,c4:10905,c5:12407,c6:15222,c7:19434,c14:31712,c30:4789, r2:40.37,r3:47.96,r4:51.38,r5:53.25,r6:57.17,r7:61.79,r14:67.46,r30:45.99 },
  { c2:5744,c3:8284,c4:10669,c5:12799,c6:14475,c7:18242,c14:34452,c30:4740, r2:40.96,r3:46.59,r4:50.75,r5:53.85,r6:55.84,r7:60.37,r14:69.3,r30:45.81 },
  { c2:6544,c3:7700,c4:10768,c5:12698,c6:15003,c7:17530,c14:37154,c30:4689, r2:43.86,r3:45.47,r4:51.12,r5:53.69,r6:56.65,r7:59.3,r14:71.19,r30:45.49 },
  { c2:6403,c3:8575,c4:10471,c5:12725,c6:14659,c7:17091,c14:39645,c30:4784, r2:43.82,r3:47.95,r4:50.9,r5:53.97,r6:56.14,r7:58.88,r14:72.69,r30:45.27 },
  { c2:5537,c3:8605,c4:10548,c5:12939,c6:14777,c7:16916,c14:40998,c30:5061, r2:42.06,r3:48.73,r4:51.55,r5:54.67,r6:56.61,r7:58.8,r14:73.4,r30:45.5 },
];
const keys = ['c2','c3','c4','c5','c6','c7','c14','c30'];
const targets = [
  { rk:'r2', ni:0 },{ rk:'r3', ni:1 },{ rk:'r4', ni:2 },{ rk:'r5', ni:3 },
  { rk:'r6', ni:4 },{ rk:'r7', ni:5 },{ rk:'r14', ni:6 },{ rk:'r30', ni:7 },
];
const pct = (a,b) => a/b*100;
const sumR = (row,i,j)=>{let s=0;for(let k=i;k<=j;k++)s+=row[keys[k]];return s;};

function maeOne(predFn, rk) {
  let t=0; for (const row of rows) { const p=predFn(row); if(!Number.isFinite(p))return Infinity; t+=Math.abs(p-row[rk]); }
  return t/rows.length;
}

for (const {rk, ni} of targets) {
  const nk = keys[ni].slice(1);
  let best = { mae: Infinity, label: '' };

  const tryCand = (label, fn) => {
    const err = maeOne(fn, rk);
    if (err < best.mae) best = { mae: err, label };
  };

  // cN / cK
  for (let dj=0; dj<keys.length; dj++) tryCand(`c${nk}/c${keys[dj].slice(1)}`, row=>pct(row[keys[ni]],row[keys[dj]]));
  // cN / (cA+cB)
  for (let a=0;a<keys.length;a++) for (let b=a;b<keys.length;b++)
    tryCand(`c${nk}/(c${keys[a].slice(1)}+c${keys[b].slice(1)})`, row=>pct(row[keys[ni]],row[keys[a]]+row[keys[b]]));
  // cN / sum(ci..cj)
  for (let i=0;i<keys.length;i++) for (let j=i;j<keys.length;j++)
    tryCand(`c${nk}/sum(c${keys[i].slice(1)}..c${keys[j].slice(1)})`, row=>pct(row[keys[ni]],sumR(row,i,j)));
  // (cN+cM)/sum(...)
  for (let m=0;m<keys.length;m++)
    for (let i=0;i<keys.length;i++) for (let j=i;j<keys.length;j++)
      tryCand(`(c${nk}+c${keys[m].slice(1)})/sum(c${keys[i].slice(1)}..c${keys[j].slice(1)})`, row=>pct(row[keys[ni]]+row[keys[m]],sumR(row,i,j)));
  // sum(ci..cN)/sum(...)
  for (let i=0;i<=ni;i++)
    for (let di=0;di<keys.length;di++) for (let dj=di;dj<keys.length;dj++)
      tryCand(`sum(c${keys[i].slice(1)}..c${nk})/sum(c${keys[di].slice(1)}..c${keys[dj].slice(1)})`, row=>pct(sumR(row,i,ni),sumR(row,di,dj)));

  console.log(`\n=== ${rk.toUpperCase()} (${keys[ni]}) best: ${best.label} | MAE ${best.mae.toFixed(3)}% ===`);
}
