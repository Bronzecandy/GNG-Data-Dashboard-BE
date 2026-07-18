import { num, pct } from "./row-utils";
import { scopedDims } from "./ingest-scope";
import { PLATFORM_ALL, PLATFORM_ANDROID, PLATFORM_IOS } from "./platform";
import { normalizeHeroIds } from "./mappings";
import type { MetricFactRow } from "./queries";

type Row = Record<string, unknown>;

function fact(isoDate: string, measures: Record<string, unknown>, platform = PLATFORM_ALL): MetricFactRow {
  return {
    dt: isoDate,
    dims: { ...scopedDims(), platform },
    measures,
  };
}

/** First aggregated row from a single-row SQL result (SUM/AVG/COUNT). */
function one(rows: Row[]): Row | null {
  return rows.length > 0 ? rows[0]! : null;
}

const RET_KEYS = ["r2", "r3", "r4", "r5", "r6", "r7", "r14", "r30"];

function retentionMeasures(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of RET_KEYS) out[k] = pct(row[k]);
  return out;
}

/** new.user_retention — total + per-platform (iOS/Android) */
export function aggregateNewUserRetention(parts: Row[][], isoDate: string): MetricFactRow[] {
  const out: MetricFactRow[] = [];
  const total = one(parts[0]);
  if (total) {
    out.push(fact(isoDate, { new_user: num(total.new_user), ...retentionMeasures(total) }, PLATFORM_ALL));
  }
  const ios = one(parts[1]);
  if (ios) {
    out.push(fact(isoDate, { new_user: num(ios.new_user), ...retentionMeasures(ios) }, PLATFORM_IOS));
  }
  const android = one(parts[2]);
  if (android) {
    out.push(fact(isoDate, { new_user: num(android.new_user), ...retentionMeasures(android) }, PLATFORM_ANDROID));
  }
  return out;
}

export function aggregateNewDeviceRetention(rows: Row[], isoDate: string): MetricFactRow[] {
  const row = one(rows);
  if (!row) return [];
  return [fact(isoDate, { new_device: num(row.new_device), ...retentionMeasures(row) })];
}

export function aggregateActiveUser(parts: Row[][], isoDate: string): MetricFactRow[] {
  const dwsTotal = one(parts[0]);
  const dwsIos = one(parts[1]);
  const dwsAndroid = one(parts[2]);
  const dmTotal = one(parts[3]);
  const dmIos = one(parts[4]);
  const dmAndroid = one(parts[5]);
  const retTotal = one(parts[6]);
  const retIos = one(parts[7]);
  const retAndroid = one(parts[8]);

  type Acc = {
    dau?: number;
    a2?: number;
    a3?: number;
    a4?: number;
    a5?: number;
    a6?: number;
    a7?: number;
    a14?: number;
    a30?: number;
    ar2?: number;
    ar3?: number;
    ar4?: number;
    ar5?: number;
    ar6?: number;
    ar7?: number;
    ar14?: number;
    ar30?: number;
  };

  const byPlatform = new Map<string, Acc>();
  const touch = (p: string): Acc => {
    let acc = byPlatform.get(p);
    if (!acc) {
      acc = {};
      byPlatform.set(p, acc);
    }
    return acc;
  };

  if (dwsTotal) touch(PLATFORM_ALL).dau = num(dwsTotal.dau);
  if (dwsIos) touch(PLATFORM_IOS).dau = num(dwsIos.dau);
  if (dwsAndroid) touch(PLATFORM_ANDROID).dau = num(dwsAndroid.dau);
  if (dmTotal) {
    const a = touch(PLATFORM_ALL);
    a.a2 = num(dmTotal.a2);
    a.a3 = num(dmTotal.a3);
    a.a4 = num(dmTotal.a4);
    a.a5 = num(dmTotal.a5);
    a.a6 = num(dmTotal.a6);
    a.a7 = num(dmTotal.a7);
    a.a14 = num(dmTotal.a14);
    a.a30 = num(dmTotal.a30);
  }
  if (dmIos) {
    const a = touch(PLATFORM_IOS);
    a.a2 = num(dmIos.a2);
    a.a3 = num(dmIos.a3);
    a.a4 = num(dmIos.a4);
    a.a5 = num(dmIos.a5);
    a.a6 = num(dmIos.a6);
    a.a7 = num(dmIos.a7);
    a.a14 = num(dmIos.a14);
    a.a30 = num(dmIos.a30);
  }
  if (dmAndroid) {
    const a = touch(PLATFORM_ANDROID);
    a.a2 = num(dmAndroid.a2);
    a.a3 = num(dmAndroid.a3);
    a.a4 = num(dmAndroid.a4);
    a.a5 = num(dmAndroid.a5);
    a.a6 = num(dmAndroid.a6);
    a.a7 = num(dmAndroid.a7);
    a.a14 = num(dmAndroid.a14);
    a.a30 = num(dmAndroid.a30);
  }
  if (retTotal) {
    const a = touch(PLATFORM_ALL);
    a.ar2 = pct(retTotal.ar2);
    a.ar3 = pct(retTotal.ar3);
    a.ar4 = pct(retTotal.ar4);
    a.ar5 = pct(retTotal.ar5);
    a.ar6 = pct(retTotal.ar6);
    a.ar7 = pct(retTotal.ar7);
    a.ar14 = pct(retTotal.ar14);
    a.ar30 = pct(retTotal.ar30);
  }
  if (retIos) {
    const a = touch(PLATFORM_IOS);
    a.ar2 = pct(retIos.ar2);
    a.ar3 = pct(retIos.ar3);
    a.ar4 = pct(retIos.ar4);
    a.ar5 = pct(retIos.ar5);
    a.ar6 = pct(retIos.ar6);
    a.ar7 = pct(retIos.ar7);
    a.ar14 = pct(retIos.ar14);
    a.ar30 = pct(retIos.ar30);
  }
  if (retAndroid) {
    const a = touch(PLATFORM_ANDROID);
    a.ar2 = pct(retAndroid.ar2);
    a.ar3 = pct(retAndroid.ar3);
    a.ar4 = pct(retAndroid.ar4);
    a.ar5 = pct(retAndroid.ar5);
    a.ar6 = pct(retAndroid.ar6);
    a.ar7 = pct(retAndroid.ar7);
    a.ar14 = pct(retAndroid.ar14);
    a.ar30 = pct(retAndroid.ar30);
  }

  const out: MetricFactRow[] = [];
  for (const [platform, acc] of byPlatform) {
    if (platform !== PLATFORM_ALL && acc.dau == null && acc.a2 == null && acc.ar2 == null) continue;
    out.push(
      fact(
        isoDate,
        {
          dau: num(acc.dau),
          a2: num(acc.a2),
          a3: num(acc.a3),
          a4: num(acc.a4),
          a5: num(acc.a5),
          a6: num(acc.a6),
          a7: num(acc.a7),
          a14: num(acc.a14),
          a30: num(acc.a30),
          ar2: num(acc.ar2),
          ar3: num(acc.ar3),
          ar4: num(acc.ar4),
          ar5: num(acc.ar5),
          ar6: num(acc.ar6),
          ar7: num(acc.ar7),
          ar14: num(acc.ar14),
          ar30: num(acc.ar30),
        },
        platform,
      ),
    );
  }
  return out;
}

export function aggregateOnlineTime(rows: Row[], isoDate: string): MetricFactRow[] {
  const row = one(rows);
  if (!row) return [];
  return [
    fact(isoDate, {
      dau: num(row.dau),
      game_partition_users: num(row.game_partition_users),
      avg_rank_match: pct(row.avg_rank_match),
      avg_casual_match: pct(row.avg_casual_match),
      avg_lobby_time: pct(row.avg_lobby_time),
      avg_survival_time: pct(row.avg_survival_time),
    }),
  ];
}

export function aggregateRevival(rows: Row[], isoDate: string): MetricFactRow[] {
  const row = one(rows);
  if (!row) return [];
  const n = num(row.dau);
  const r7 = num(row.revival7);
  const r14 = num(row.revival14);
  const r30 = num(row.revival30);
  const r60 = num(row.revival60);
  const rate = (v: number) => (n > 0 ? pct((v / n) * 100) : 0);
  return [
    fact(isoDate, {
      dau: n,
      revival7: r7,
      revival14: r14,
      revival30: r30,
      revival60: r60,
      revival7_rate: rate(r7),
      revival14_rate: rate(r14),
      revival30_rate: rate(r30),
      revival60_rate: rate(r60),
    }),
  ];
}

export function aggregateChurn(rows: Row[], isoDate: string): MetricFactRow[] {
  const row = one(rows);
  if (!row) return [];
  const total = num(row.account_total);
  const c2 = num(row.c2);
  const c3 = num(row.c3);
  const c4 = num(row.c4);
  const c5 = num(row.c5);
  const c6 = num(row.c6);
  const c7 = num(row.c7);
  const c14 = num(row.c14);
  const c30 = num(row.c30);
  return [
    fact(isoDate, {
      account_total: total,
      c2,
      c3,
      c4,
      c5,
      c6,
      c7,
      c14,
      c30,
      // Churn rates are not stored here — GNG dashboard uses an unknown formula;
      // counts-only until we get the official rate SQL from GNG.
    }),
  ];
}

function multiFact(
  isoDate: string,
  dims: Record<string, unknown>,
  measures: Record<string, unknown>,
): MetricFactRow {
  return { dt: isoDate, dims: { scope: "global", ...scopedDims(), ...dims }, measures };
}

function aggregateGroupedRows(rows: Row[], isoDate: string, dimKeys: string[]): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const row of rows) {
    const dims: Record<string, unknown> = {};
    for (const k of dimKeys) {
      const v = row[k];
      if (v !== null && v !== undefined && v !== "\\N" && String(v) !== "") {
        dims[k] = String(v);
      }
    }
    const measures: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (dimKeys.includes(k) || k === "kind") continue;
      measures[k] = num(v);
    }
    if (Object.keys(measures).length === 0) continue;
    facts.push(multiFact(isoDate, dims, measures));
  }
  return facts;
}

const ECONOMY_DIMS = ["kind", "win_filter", "bracket", "level_pool", "gold_bracket"];
const HACK_DIMS = ["kind", "sub_key", "mode_key"];
const MODE_DIMS = ["kind", "sub_key", "mode_key"];
const PERF_DIMS = ["kind", "sub_key", "server_key"];
const NEWBIE_DIMS = ["kind", "metric", "segment", "day_offset", "sub_key"];

export function aggregateEconomyStats(parts: Row[][], isoDate: string): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const part of parts) {
    facts.push(...aggregateGroupedRows(part, isoDate, ECONOMY_DIMS));
  }
  return facts;
}

export function aggregateHackStats(parts: Row[][], isoDate: string): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const part of parts) {
    facts.push(...aggregateGroupedRows(part, isoDate, HACK_DIMS));
  }
  return facts;
}

export function aggregateModeMatchStats(parts: Row[][], isoDate: string): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const part of parts) {
    facts.push(...aggregateGroupedRows(part, isoDate, MODE_DIMS));
  }
  return facts.filter((f) => f.dims.kind !== "mm");
}

export function aggregatePerfSessionStats(parts: Row[][], isoDate: string): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const part of parts) {
    facts.push(...aggregateGroupedRows(part, isoDate, PERF_DIMS));
  }
  return facts;
}

export function aggregateNewbieStats(parts: Row[][], isoDate: string): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const part of parts) {
    facts.push(...aggregateGroupedRows(part, isoDate, NEWBIE_DIMS));
  }
  return facts;
}

/** hero.balance — many rows per day (season/mode/rank/class/mastery); additive measures */
export function aggregateHeroBalance(rows: Row[], isoDate: string): MetricFactRow[] {
  const facts: MetricFactRow[] = [];
  for (const row of rows) {
    const games = num(row.games);
    if (games <= 0) continue;
    const ids = normalizeHeroIds(num(row.class_id), num(row.mastery_id));
    facts.push({
      dt: isoDate,
      dims: {
        scope: "global",
        season_id: num(row.season_id),
        mode: String(row.mode ?? "all"),
        rank_tier: String(row.rank_tier ?? "other"),
        rank_tier_order: num(row.rank_tier_order),
        class_id: ids.class_id,
        mastery_id: ids.mastery_id,
      },
      measures: {
        games,
        sum_damage: num(row.sum_damage),
        sum_healing: num(row.sum_healing),
        sum_kill: num(row.sum_kill),
        sum_assist: num(row.sum_assist),
      },
    });
  }
  return facts;
}
