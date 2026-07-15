import { getIngestScope } from "./ingest-scope";

function lit(v: string): string {
  return v.replace(/'/g, "''");
}

/** Scoped gamematchmaking rows for VN players on SG server (one day). */
export function scopedGmmSubquery(dt: string, alias = "m"): string {
  const { region, ipRegion } = getIngestScope();
  return `(
    SELECT account_id, match_id, level_id, group_mode, game_mode, match_mode,
           wait_time_secs, is_timeout, auto_group, level, cal_rank, rank_level
    FROM gng_ob.gamematchmaking
    WHERE dt = '${lit(dt)}'
      AND region = '${lit(region)}'
      AND ip_region = '${lit(ipRegion)}'
      AND match_id IS NOT NULL AND match_id != '0'
      AND CAST(warm_match_type AS string) = '0'
      AND CAST(level_id AS string) != '0'
  ) ${alias}`;
}

export function escapeBracketSql(col: string): string {
  return `CASE
    WHEN ${col} < 5000 THEN 'lt5k'
    WHEN ${col} < 15000 THEN '5k_15k'
    WHEN ${col} < 30000 THEN '15k_30k'
    WHEN ${col} < 45000 THEN '30k_45k'
    WHEN ${col} < 70000 THEN '45k_70k'
    ELSE 'gt70k'
  END`;
}

export function levelPoolSql(col: string): string {
  return `CASE
    WHEN ${col} < 10 THEN 'lt10'
    WHEN ${col} < 20 THEN '10_20'
    WHEN ${col} < 30 THEN '20_30'
    WHEN ${col} < 40 THEN '30_40'
    ELSE 'gt40'
  END`;
}

export function goldBracketSql(col: string): string {
  return `CASE
    WHEN ${col} < 10000 THEN '1_10k'
    WHEN ${col} < 50000 THEN '10k_50k'
    WHEN ${col} < 100000 THEN '50k_100k'
    WHEN ${col} < 200000 THEN '100k_200k'
    WHEN ${col} < 500000 THEN '200k_500k'
    WHEN ${col} < 1000000 THEN '500k_1m'
    ELSE 'gt1m'
  END`;
}

export function truthySql(col: string): string {
  return `CASE WHEN CAST(${col} AS string) IN ('true','1') THEN 1 ELSE 0 END`;
}
