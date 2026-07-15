import type { BeanQueryResult } from "./client";
import { isoToLocalDt, rowsToObjects } from "./row-utils";
import { dayFilter, getIngestScope } from "./ingest-scope";
import {
  aggregateActiveUser,
  aggregateChurn,
  aggregateEconomyStats,
  aggregateHackStats,
  aggregateHeroBalance,
  aggregateModeMatchStats,
  aggregateNewbieStats,
  aggregateNewDeviceRetention,
  aggregateNewUserRetention,
  aggregateOnlineTime,
  aggregatePerfSessionStats,
  aggregateRevival,
} from "./aggregate";
import {
  economyStatsSql,
  hackStatsSql,
  modeMatchStatsSql,
  newbieStatsSql,
  perfSessionStatsSql,
} from "./metric-sql";
import { heroBalanceSql } from "./hero-balance-sql";

export type Grain = "daily";

export interface MetricFactRow {
  dims: Record<string, unknown>;
  measures: Record<string, unknown>;
  dt: string;
}

export interface MetricQueryDef {
  metricId: string;
  tabId: string;
  grain: Grain;
  /** Aggregated SELECT(s) for one day — each returns ~1 row, filtered to INGEST_REGION + INGEST_IP_REGION */
  rawSql: (localDt: string) => string[];
  aggregate: (parts: Record<string, unknown>[][], isoDate: string) => MetricFactRow[];
}

/** Spark-safe truthy flag: handles boolean columns ('true') and int/string 0/1. */
function flag(col: string): string {
  return `CASE WHEN CAST(${col} AS string) IN ('true','1') THEN 1 ELSE 0 END`;
}

/** AVG of a flag as a rounded percentage (0-100). */
function retPct(col: string, alias: string): string {
  return `ROUND(AVG(${flag(col)}) * 100, 2) AS ${alias}`;
}

/** SUM of a flag as an integer count. */
function flagCount(col: string, alias: string): string {
  return `SUM(${flag(col)}) AS ${alias}`;
}

/** WHERE clause for a JOINed table using a table alias prefix. */
function scopedWhere(
  localDt: string,
  alias: string,
  cols: { regionCol: string; ipRegionCol: string },
): string {
  const s = getIngestScope();
  const q = (v: string) => v.replace(/'/g, "''");
  return [
    `${alias}.local_dt = '${q(localDt)}'`,
    `${alias}.${cols.regionCol} = '${q(s.region)}'`,
    `${alias}.${cols.ipRegionCol} = '${q(s.ipRegion)}'`,
  ].join(" AND ");
}

export const METRIC_REGISTRY: Record<string, MetricQueryDef> = {
  "new.user_retention": {
    metricId: "new.user_retention",
    tabId: "new-user-retention",
    grain: "daily",
    rawSql: (localDt) => [
      `SELECT COUNT(*) AS new_user,
              ${retPct("is_r2", "r2")}, ${retPct("is_r3", "r3")}, ${retPct("is_r4", "r4")},
              ${retPct("is_r5", "r5")}, ${retPct("is_r6", "r6")}, ${retPct("is_r7", "r7")},
              ${retPct("is_r14", "r14")}, ${retPct("is_r30", "r30")}
       FROM gng_cooked_ob.dws_user_register_account_retention_d_i
       WHERE ${dayFilter(localDt, { regionCol: "region", ipRegionCol: "ip_region" })}`,
    ],
    aggregate: ([rows], iso) => aggregateNewUserRetention(rows, iso),
  },

  "new.device_retention": {
    metricId: "new.device_retention",
    tabId: "new-device-retention",
    grain: "daily",
    rawSql: (localDt) => [
      `SELECT COUNT(*) AS new_device,
              ${retPct("is_r2", "r2")}, ${retPct("is_r3", "r3")}, ${retPct("is_r4", "r4")},
              ${retPct("is_r5", "r5")}, ${retPct("is_r6", "r6")}, ${retPct("is_r7", "r7")},
              ${retPct("is_r14", "r14")}, ${retPct("is_r30", "r30")}
       FROM gng_cooked_ob.dws_user_register_device_retention_d_i
       WHERE ${dayFilter(localDt, { ipRegionCol: "first_ip_region" })}`,
    ],
    aggregate: ([rows], iso) => aggregateNewDeviceRetention(rows, iso),
  },

  "active.active_user": {
    metricId: "active.active_user",
    tabId: "active-user",
    grain: "daily",
    rawSql: (localDt) => [
      // DAU: per-account daily active (matches CSV); available from ~2025-01-02
      `SELECT COUNT(*) AS dau
       FROM gng_cooked_ob.dws_user_active_account_d_i
       WHERE ${dayFilter(localDt, { ipRegionCol: "last_active_ip_region" })}`,
      // A2–A30 rollups from dm (only populated ~2025-12+; optional enrichment)
      `SELECT SUM(A2) AS a2, SUM(A3) AS a3, SUM(A4) AS a4, SUM(A5) AS a5,
              SUM(A6) AS a6, SUM(A7) AS a7, SUM(A14) AS a14, SUM(A30) AS a30
       FROM gng_cooked_ob.dm_user_active_account_1d_i
       WHERE ${dayFilter(localDt, { ipRegionCol: "ip_region" })}`,
      // Active retention % — server region is last_active_region, not region
      `SELECT ${retPct("is_ar2", "ar2")}, ${retPct("is_ar3", "ar3")}, ${retPct("is_ar4", "ar4")},
              ${retPct("is_ar5", "ar5")}, ${retPct("is_ar6", "ar6")}, ${retPct("is_ar7", "ar7")},
              ${retPct("is_ar14", "ar14")}, ${retPct("is_ar30", "ar30")}
       FROM gng_cooked_ob.dws_user_active_account_retention_d_i
       WHERE ${dayFilter(localDt, { regionCol: "last_active_region", ipRegionCol: "last_active_ip_region" })}`,
    ],
    aggregate: ([dws, dm, ret], iso) => aggregateActiveUser(dws, dm, ret, iso),
  },

  "active.online_time": {
    metricId: "active.online_time",
    tabId: "active-online-time",
    grain: "daily",
    rawSql: (localDt) => [
      `SELECT COUNT(*) AS dau,
              SUM(CASE WHEN day_active_game_times > 0 THEN 1 ELSE 0 END) AS game_partition_users,
              ROUND(AVG(day_active_game_times), 2) AS avg_rank_match,
              ROUND(AVG(day_active_game_time), 2) AS avg_casual_match,
              ROUND(AVG(CASE WHEN day_active_game_times > 0
                THEN (day_active_online_time - day_active_survival_time) / day_active_game_times / 60 END), 2) AS avg_lobby_time,
              ROUND(AVG(CASE WHEN day_active_game_times > 0
                THEN day_active_survival_time / day_active_game_times / 60 END), 2) AS avg_survival_time
       FROM gng_cooked_ob.dws_user_active_account_d_i
       WHERE ${dayFilter(localDt, { regionCol: "last_active_region", ipRegionCol: "last_active_ip_region" })}`,
    ],
    aggregate: ([rows], iso) => aggregateOnlineTime(rows, iso),
  },

  "active.revival": {
    metricId: "active.revival",
    tabId: "revival",
    grain: "daily",
    rawSql: (localDt) => [
      `SELECT COUNT(*) AS dau,
              ${flagCount("s.is_revival7", "revival7")}, ${flagCount("s.is_revival14", "revival14")},
              ${flagCount("s.is_revival30", "revival30")}, ${flagCount("s.is_revival60", "revival60")}
       FROM gng_cooked_ob.dws_user_active_account_d_i i
       JOIN gng_cooked_ob.dws_user_active_account_d_s s
         ON i.account_id = s.account_id AND i.local_dt = s.local_dt
       WHERE ${scopedWhere(localDt, "i", { regionCol: "last_active_region", ipRegionCol: "last_active_ip_region" })}`,
    ],
    aggregate: ([rows], iso) => aggregateRevival(rows, iso),
  },

  "active.churn": {
    metricId: "active.churn",
    tabId: "churn",
    grain: "daily",
    rawSql: (localDt) => [
      `SELECT COUNT(*) AS account_total,
              ${flagCount("is_c2", "c2")}, ${flagCount("is_c3", "c3")}, ${flagCount("is_c4", "c4")},
              ${flagCount("is_c5", "c5")}, ${flagCount("is_c6", "c6")}, ${flagCount("is_c7", "c7")},
              ${flagCount("is_c14", "c14")}, ${flagCount("is_c30", "c30")}
       FROM gng_cooked_ob.dws_user_active_account_d_s
       WHERE ${dayFilter(localDt, { regionCol: "last_active_region", ipRegionCol: "last_active_ip_region" })}`,
    ],
    aggregate: ([rows], iso) => aggregateChurn(rows, iso),
  },

  "hero.balance": {
    metricId: "hero.balance",
    tabId: "hero-balance",
    grain: "daily",
    rawSql: (localDt) => [heroBalanceSql(localDt)],
    aggregate: ([rows], iso) => aggregateHeroBalance(rows, iso),
  },

  "economy.stats": {
    metricId: "economy.stats",
    tabId: "economy",
    grain: "daily",
    rawSql: economyStatsSql,
    aggregate: (parts, iso) => aggregateEconomyStats(parts, iso),
  },

  "hack.stats": {
    metricId: "hack.stats",
    tabId: "hack-cheat-teamup",
    grain: "daily",
    rawSql: hackStatsSql,
    aggregate: (parts, iso) => aggregateHackStats(parts, iso),
  },

  "mode.match_stats": {
    metricId: "mode.match_stats",
    tabId: "mode-matchmaking",
    grain: "daily",
    rawSql: modeMatchStatsSql,
    aggregate: (parts, iso) => aggregateModeMatchStats(parts, iso),
  },

  "perf.session_stats": {
    metricId: "perf.session_stats",
    tabId: "performance",
    grain: "daily",
    rawSql: perfSessionStatsSql,
    aggregate: (parts, iso) => aggregatePerfSessionStats(parts, iso),
  },

  "newbie.stats": {
    metricId: "newbie.stats",
    tabId: "newbie-stats",
    grain: "daily",
    rawSql: newbieStatsSql,
    aggregate: (parts, iso) => aggregateNewbieStats(parts, iso),
  },
};

export function getMetricsForTab(tabId: string): MetricQueryDef[] {
  return Object.values(METRIC_REGISTRY).filter((m) => m.tabId === tabId);
}

export function getAllMetricIds(): string[] {
  return Object.keys(METRIC_REGISTRY);
}

export function getMetricDef(metricId: string): MetricQueryDef | undefined {
  return METRIC_REGISTRY[metricId];
}

export function rowsFromResult(result: BeanQueryResult): Record<string, unknown>[] {
  return rowsToObjects(result);
}

export function ingestScopeLabel(): string {
  const s = getIngestScope();
  return `region=${s.region}, ip_region=${s.ipRegion}`;
}
