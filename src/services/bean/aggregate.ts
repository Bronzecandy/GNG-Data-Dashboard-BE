import { num, pct } from "./row-utils";
import { scopedDims } from "./ingest-scope";
import { normalizeHeroIds } from "./mappings";
import type { MetricFactRow } from "./queries";

type Row = Record<string, unknown>;

function fact(isoDate: string, measures: Record<string, unknown>): MetricFactRow {
  return {
    dt: isoDate,
    dims: scopedDims(),
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

/** new.user_retention — one aggregated row (SQL: COUNT + AVG(flag)*100) */
export function aggregateNewUserRetention(rows: Row[], isoDate: string): MetricFactRow[] {
  const row = one(rows);
  if (!row) return [];
  return [fact(isoDate, { new_user: num(row.new_user), ...retentionMeasures(row) })];
}

export function aggregateNewDeviceRetention(rows: Row[], isoDate: string): MetricFactRow[] {
  const row = one(rows);
  if (!row) return [];
  return [fact(isoDate, { new_device: num(row.new_device), ...retentionMeasures(row) })];
}

export function aggregateActiveUser(
  dwsRows: Row[],
  dmRows: Row[],
  retRows: Row[],
  isoDate: string,
): MetricFactRow[] {
  const dws = one(dwsRows);
  const dm = one(dmRows);
  const ret = one(retRows);
  const dau = num(dws?.dau);
  return [
    fact(isoDate, {
      dau,
      a2: num(dm?.a2),
      a3: num(dm?.a3),
      a4: num(dm?.a4),
      a5: num(dm?.a5),
      a6: num(dm?.a6),
      a7: num(dm?.a7),
      a14: num(dm?.a14),
      a30: num(dm?.a30),
      ar2: pct(ret?.ar2),
      ar3: pct(ret?.ar3),
      ar4: pct(ret?.ar4),
      ar5: pct(ret?.ar5),
      ar6: pct(ret?.ar6),
      ar7: pct(ret?.ar7),
      ar14: pct(ret?.ar14),
      ar30: pct(ret?.ar30),
    }),
  ];
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
