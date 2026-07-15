const rows = [
  { c2:5541,c3:8801,c4:10905,c5:12407,c6:15222,c7:19434,c14:31712,c30:4789, r2:40.37,r3:47.96,r4:51.38,r5:53.25,r6:57.17,r7:61.79,r14:67.46,r30:45.99 },
  { c2:5744,c3:8284,c4:10669,c5:12799,c6:14475,c7:18242,c14:34452,c30:4740, r2:40.96,r3:46.59,r4:50.75,r5:53.85,r6:55.84,r7:60.37,r14:69.3,r30:45.81 },
  { c2:6544,c3:7700,c4:10768,c5:12698,c6:15003,c7:17530,c14:37154,c30:4689, r2:43.86,r3:45.47,r4:51.12,r5:53.69,r6:56.65,r7:59.3,r14:71.19,r30:45.49 },
  { c2:6403,c3:8575,c4:10471,c5:12725,c6:14659,c7:17091,c14:39645,c30:4784, r2:43.82,r3:47.95,r4:50.9,r5:53.97,r6:56.14,r7:58.88,r14:72.69,r30:45.27 },
  { c2:5537,c3:8605,c4:10548,c5:12939,c6:14777,c7:16916,c14:40998,c30:5061, r2:42.06,r3:48.73,r4:51.55,r5:54.67,r6:56.61,r7:58.8,r14:73.4,r30:45.5 },
];
const keys = ['c2','c3','c4','c5','c6','c7','c14','c30'];
const pct=(a,b)=>a/b*100;
const sumR=(row,i,j)=>{let s=0;for(let k=i;k<=j;k++)s+=row[keys[k]];return s;};
const mae=(fn,rk)=>rows.reduce((s,r)=>s+Math.abs(fn(r)-r[rk]),0)/rows.length;

function searchRate(rk, ni, maxTerms=2) {
  let best={mae:Infinity,label:''};
  const add=(label,fn)=>{const e=mae(fn,rk); if(e<best.mae) best={mae:e,label};};
  // numerator: sum of up to maxTerms buckets from indices 0..ni
  const idxs=[];
  for(let a=0;a<=ni;a++) idxs.push([a]);
  for(let a=0;a<=ni;a++) for(let b=a;b<=ni;b++) if(maxTerms>=2) idxs.push([a,b]);
  for(let a=0;a<=ni;a++) for(let b=a;b<=ni;b++) for(let c=b;c<=ni;c++) if(maxTerms>=3) idxs.push([a,b,c]);

  for (const numIdx of idxs) {
    const numLabel = numIdx.length===1?`c${keys[numIdx[0]].slice(1)}`:`sum(${numIdx.map(i=>keys[i]).join('+')})`;
    const numFn = row => numIdx.reduce((s,i)=>s+row[keys[i]],0);
    for (let di=0; di<keys.length; di++) for (let dj=di; dj<keys.length; dj++) {
      add(`${numLabel}/sum(${keys[di]}..${keys[dj]})`, row=>pct(numFn(row),sumR(row,di,dj)));
    }
    for (let dj=0; dj<keys.length; dj++) add(`${numLabel}/c${keys[dj].slice(1)}`, row=>pct(numFn(row),row[keys[dj]]));
    for (let a=0;a<keys.length;a++) for(let b=a;b<keys.length;b++)
      add(`${numLabel}/(c${keys[a].slice(1)}+c${keys[b].slice(1)})`, row=>pct(numFn(row),row[keys[a]]+row[keys[b]]));
  }
  return best;
}

for (const [rk,ni] of [['r2',0],['r6',4],['r30',7]]) {
  const best=searchRate(rk,ni,3);
  console.log(rk, best.label, 'MAE', best.mae.toFixed(3));
}
