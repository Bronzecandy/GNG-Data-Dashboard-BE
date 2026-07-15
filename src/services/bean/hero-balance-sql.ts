/** Spark SQL for hero.balance daily ingest from gng_ob.gamesummary */

function lit(dt: string): string {
  return dt.replace(/'/g, "''");
}

const RANK_TIER_SQL = `
    CASE
      WHEN cur_rank = 0 THEN 'no_rank'
      WHEN cur_rank BETWEEN 1 AND 3 THEN 'iron'
      WHEN cur_rank BETWEEN 4 AND 7 THEN 'bronze'
      WHEN cur_rank BETWEEN 8 AND 12 THEN 'silver'
      WHEN cur_rank BETWEEN 13 AND 17 THEN 'gold'
      WHEN cur_rank BETWEEN 18 AND 22 THEN 'platinum'
      WHEN cur_rank BETWEEN 23 AND 27 THEN 'diamond'
      WHEN cur_rank BETWEEN 28 AND 32 THEN 'legend'
      WHEN cur_rank = 33 THEN 'glory'
      WHEN cur_rank = 34 THEN 'supreme_glory'
      ELSE 'other'
    END`;

const RANK_ORDER_SQL = `
    CASE
      WHEN cur_rank = 0 THEN 0
      WHEN cur_rank BETWEEN 1 AND 3 THEN 1
      WHEN cur_rank BETWEEN 4 AND 7 THEN 2
      WHEN cur_rank BETWEEN 8 AND 12 THEN 3
      WHEN cur_rank BETWEEN 13 AND 17 THEN 4
      WHEN cur_rank BETWEEN 18 AND 22 THEN 5
      WHEN cur_rank BETWEEN 23 AND 27 THEN 6
      WHEN cur_rank BETWEEN 28 AND 32 THEN 7
      WHEN cur_rank = 33 THEN 8
      WHEN cur_rank = 34 THEN 9
      ELSE 99
    END`;

const CLASS_ID_SQL = `
    CASE
      WHEN COALESCE(mastery_id, 0) > 0 THEN class_id
      WHEN class_id >= 1000 THEN CAST(FLOOR(class_id / 1000.0) AS BIGINT)
      ELSE class_id
    END`;

const MASTERY_ID_SQL = `
    CASE
      WHEN COALESCE(mastery_id, 0) > 0 THEN mastery_id
      ELSE class_id
    END`;

function modeBlock(localDt: string, mode: string, levelFilter: string): string {
  const whereExtra = levelFilter ? ` AND ${levelFilter}` : "";
  return `
SELECT
  '${mode}' AS mode,
  season_id,
  ${RANK_TIER_SQL} AS rank_tier,
  ${RANK_ORDER_SQL} AS rank_tier_order,
  CAST(${CLASS_ID_SQL} AS BIGINT) AS class_id,
  CAST(${MASTERY_ID_SQL} AS BIGINT) AS mastery_id,
  COUNT(1) AS games,
  SUM(CAST(damage AS BIGINT)) AS sum_damage,
  SUM(CAST(healing_amount AS BIGINT)) AS sum_healing,
  SUM(CAST(kill_num AS BIGINT)) AS sum_kill,
  SUM(CAST(assist_down AS BIGINT)) AS sum_assist
FROM gng_ob.gamesummary
WHERE dt = '${lit(localDt)}'
  AND cur_rank IS NOT NULL
  AND class_id IS NOT NULL${whereExtra}
GROUP BY season_id, ${RANK_TIER_SQL}, ${RANK_ORDER_SQL}, ${CLASS_ID_SQL}, ${MASTERY_ID_SQL}`;
}

/** One query per day: all / solo / squad mode buckets via UNION ALL. */
export function heroBalanceSql(localDt: string): string {
  return [
    modeBlock(localDt, "all", ""),
    modeBlock(localDt, "solo", "level_id IN (20404, 20414)"),
    modeBlock(localDt, "squad", "level_id IN (20402, 20412, 20405, 20415, 40102)"),
  ].join("\nUNION ALL\n");
}