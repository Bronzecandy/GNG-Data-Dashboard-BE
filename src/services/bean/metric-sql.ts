import { dayFilter, getIngestScope, obDayFilter } from "./ingest-scope";
import {
  escapeBracketSql,
  goldBracketSql,
  levelPoolSql,
  scopedGmmSubquery,
  truthySql,
} from "./metric-helpers";

export function economyStatsSql(localDt: string): string[] {
  const dt = localDt;
  const gmm = scopedGmmSubquery(dt, "m");
  const bracket = escapeBracketSql("CAST(g.evacuate_value AS DOUBLE)");
  return [
    `SELECT 'escape_avg' AS kind,
            CASE WHEN ${truthySql("g.is_win")} = 1 THEN 'win' ELSE 'all' END AS win_filter,
            CAST(NULL AS string) AS bracket,
            CAST(NULL AS string) AS level_pool,
            CAST(NULL AS string) AS gold_bracket,
            COUNT(*) AS cnt,
            SUM(CAST(g.evacuate_value AS DOUBLE)) AS sum_value
     FROM gng_ob.gamesummary g
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     WHERE g.dt = '${dt}'
       AND CAST(g.is_valid AS string) IN ('1','true')
       AND g.evacuate_value IS NOT NULL
     GROUP BY 2`,
    `SELECT 'escape_dist' AS kind,
            CASE WHEN ${truthySql("g.is_win")} = 1 THEN 'win' ELSE 'all' END AS win_filter,
            ${bracket} AS bracket,
            CAST(NULL AS string) AS level_pool,
            CAST(NULL AS string) AS gold_bracket,
            COUNT(*) AS cnt,
            SUM(CAST(g.evacuate_value AS DOUBLE)) AS sum_value
     FROM gng_ob.gamesummary g
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     WHERE g.dt = '${dt}'
       AND CAST(g.is_valid AS string) IN ('1','true')
       AND g.evacuate_value IS NOT NULL
     GROUP BY 2, 3`,
    `SELECT 'gold_dist' AS kind,
            CAST(NULL AS string) AS win_filter,
            CAST(NULL AS string) AS bracket,
            ${levelPoolSql("CAST(s.max_active_level AS BIGINT)")} AS level_pool,
            ${goldBracketSql("CAST(s.last_coins_value AS BIGINT)")} AS gold_bracket,
            COUNT(*) AS cnt,
            SUM(CAST(s.last_coins_value AS BIGINT)) AS sum_value
     FROM gng_cooked_ob.dws_user_active_account_d_s s
     WHERE ${dayFilter(localDt, { regionCol: "last_active_region", ipRegionCol: "last_active_ip_region" })}
       AND ${truthySql("s.is_a1")} = 1
       AND s.last_coins_value IS NOT NULL
     GROUP BY 4, 5`,
    `SELECT 'collection' AS kind,
            CAST(NULL AS string) AS win_filter,
            CAST(NULL AS string) AS bracket,
            CAST(NULL AS string) AS level_pool,
            CAST(NULL AS string) AS gold_bracket,
            COUNT(*) AS cnt,
            SUM(CAST(collection_value AS DOUBLE)) AS sum_value
     FROM (
       SELECT account_id, MAX(CAST(collection_value AS BIGINT)) AS collection_value
       FROM gng_ob.collectionsysterm
       WHERE ${obDayFilter(dt, { regionCol: "region", ipRegionCol: "ip_region" })}
       GROUP BY account_id
     ) t`,
  ];
}

export function hackStatsSql(localDt: string): string[] {
  const dt = localDt;
  const gmm = scopedGmmSubquery(dt, "m");
  return [
    `SELECT 'hack_summary' AS kind,
            CAST(NULL AS string) AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CASE WHEN CAST(r.report_type AS string) LIKE '%1%' THEN 1 ELSE 0 END) AS cnt,
            COUNT(DISTINCT CASE WHEN CAST(r.report_type AS string) LIKE '%1%' THEN r.match_id END) AS cnt2,
            COUNT(DISTINCT g.match_id) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_ob.gamesummary g
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     LEFT JOIN gng_ob.reportcheating r
       ON g.match_id = r.match_id AND g.account_id = r.account_id AND r.dt = '${dt}'
     WHERE g.dt = '${dt}' AND CAST(g.is_valid AS string) IN ('1','true')`,
    `SELECT 'hack_mode' AS kind,
            CAST(NULL AS string) AS sub_key,
            CONCAT(CAST(g.level_id AS string), ':', CAST(g.group_mode AS string)) AS mode_key,
            COUNT(*) AS cnt,
            COUNT(DISTINCT r.match_id) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_ob.reportcheating r
     INNER JOIN gng_ob.gamesummary g
       ON r.match_id = g.match_id AND r.account_id = g.account_id AND r.dt = g.dt
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     WHERE r.dt = '${dt}'
       AND CAST(r.report_type AS string) LIKE '%1%'
     GROUP BY mode_key`,
    `SELECT 'match_mode' AS kind,
            CAST(NULL AS string) AS sub_key,
            CONCAT(CAST(g.level_id AS string), ':', CAST(g.group_mode AS string)) AS mode_key,
            COUNT(DISTINCT g.match_id) AS cnt,
            CAST(0 AS BIGINT) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_ob.gamesummary g
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     WHERE g.dt = '${dt}' AND CAST(g.is_valid AS string) IN ('1','true')
     GROUP BY mode_key`,
    `SELECT 'teamup_summary' AS kind,
            CAST(NULL AS string) AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CASE WHEN CAST(r.report_type AS string) LIKE '%2%' THEN 1 ELSE 0 END) AS cnt,
            COUNT(DISTINCT CASE WHEN CAST(r.report_type AS string) LIKE '%2%' THEN r.match_id END) AS cnt2,
            COUNT(DISTINCT g.match_id) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_ob.gamesummary g
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     LEFT JOIN gng_ob.reportcheating r
       ON g.match_id = r.match_id AND g.account_id = r.account_id AND r.dt = '${dt}'
     WHERE g.dt = '${dt}' AND CAST(g.is_valid AS string) IN ('1','true')`,
    `SELECT 'teamup_mode' AS kind,
            CAST(NULL AS string) AS sub_key,
            CONCAT(CAST(g.level_id AS string), ':', CAST(g.group_mode AS string)) AS mode_key,
            COUNT(*) AS cnt,
            COUNT(DISTINCT r.match_id) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_ob.reportcheating r
     INNER JOIN gng_ob.gamesummary g
       ON r.match_id = g.match_id AND r.account_id = g.account_id AND r.dt = g.dt
     INNER JOIN ${gmm} ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = '${dt}'
     WHERE r.dt = '${dt}'
       AND CAST(r.report_type AS string) LIKE '%2%'
     GROUP BY mode_key`,
    `SELECT 'bans' AS kind,
            CAST(NULL AS string) AS sub_key,
            CAST(NULL AS string) AS mode_key,
            COUNT(*) AS cnt,
            COUNT(DISTINCT account_id) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_ban_record_d_i
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'violations' AS kind,
            'detected' AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CAST(illegal_team_cnt AS BIGINT)) AS cnt,
            CAST(0 AS BIGINT) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_illegal_teaming_new_d_i
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'violations' AS kind,
            'punished' AS sub_key,
            CAST(NULL AS string) AS mode_key,
            COUNT(DISTINCT illegal_account_id) AS cnt,
            CAST(0 AS BIGINT) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_illegal_teaming_result_d_i
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'threshold' AS kind,
            '3t' AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CAST(reported_users_single_3t AS BIGINT)) AS cnt,
            SUM(CAST(punished_users_report_single_3t AS BIGINT)) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_report_stats_h_s
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'threshold' AS kind,
            '4t' AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CAST(reported_match_cnt_single_4t AS BIGINT)) AS cnt,
            CAST(0 AS BIGINT) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_report_stats_h_s
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'threshold' AS kind,
            '5t' AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CAST(reported_users_single_5t AS BIGINT)) AS cnt,
            SUM(CAST(punished_users_report_single_5t AS BIGINT)) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_report_stats_h_s
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'threshold' AS kind,
            '10t' AS sub_key,
            CAST(NULL AS string) AS mode_key,
            SUM(CAST(reported_users_10t AS BIGINT)) AS cnt,
            SUM(CAST(punished_users_reported_10t AS BIGINT)) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_report_stats_h_s
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'`,
    `SELECT 'penalty' AS kind,
            CAST(type AS string) AS sub_key,
            CAST(NULL AS string) AS mode_key,
            COUNT(DISTINCT illegal_account_id) AS cnt,
            CAST(0 AS BIGINT) AS cnt2,
            CAST(0 AS BIGINT) AS cnt3,
            CAST(0 AS BIGINT) AS cnt4
     FROM gng_cooked_ob.ads_user_hack_illegal_teaming_result_d_i
     WHERE utc_8_dt = '${localDt}' AND region = 'SG'
     GROUP BY type`,
  ];
}

export function modeMatchStatsSql(localDt: string): string[] {
  const dt = localDt;
  const botFlag = `MAX(CASE WHEN CAST(is_timeout AS string) NOT IN ('0','\\\\N') AND is_timeout IS NOT NULL THEN 1 ELSE 0 END)`;
  const autofillFlag = `MAX(CASE WHEN CAST(auto_group AS string) IN ('1','true') THEN 1 ELSE 0 END)`;
  return [
    `SELECT 'mm_agg' AS kind,
            CAST(level_id AS string) AS sub_key,
            CAST(group_mode AS string) AS mode_key,
            COUNT(*) AS match_cnt,
            SUM(wait_secs) AS sum_wait,
            SUM(over_2min) AS over_2min,
            SUM(over_5min) AS over_5min,
            SUM(bot_flag) AS bot_matches,
            SUM(autofill_flag) AS autofill_matches,
            CAST(0 AS BIGINT) AS evac_cnt,
            CAST(0 AS BIGINT) AS player_games,
            CAST(0 AS DOUBLE) AS sum_gap
     FROM (
       SELECT match_id,
              MAX(CAST(level_id AS string)) AS level_id,
              MAX(CAST(group_mode AS string)) AS group_mode,
              MAX(CAST(wait_time_secs AS DOUBLE)) AS wait_secs,
              MAX(CASE WHEN CAST(wait_time_secs AS DOUBLE) > 120 THEN 1 ELSE 0 END) AS over_2min,
              MAX(CASE WHEN CAST(wait_time_secs AS DOUBLE) > 300 THEN 1 ELSE 0 END) AS over_5min,
              ${botFlag} AS bot_flag,
              ${autofillFlag} AS autofill_flag
       FROM gng_ob.gamematchmaking
       WHERE ${obDayFilter(dt, { regionCol: "region", ipRegionCol: "ip_region" })}
         AND match_id IS NOT NULL AND match_id != '0'
         AND CAST(warm_match_type AS string) = '0'
         AND CAST(level_id AS string) != '0'
       GROUP BY match_id
     ) t
     GROUP BY level_id, group_mode`,
    `SELECT 'win' AS kind,
            CAST(m.level_id AS string) AS sub_key,
            CAST(m.group_mode AS string) AS mode_key,
            CAST(0 AS BIGINT) AS match_cnt,
            CAST(0 AS DOUBLE) AS sum_wait,
            CAST(0 AS BIGINT) AS over_2min,
            CAST(0 AS BIGINT) AS over_5min,
            CAST(0 AS BIGINT) AS bot_matches,
            CAST(0 AS BIGINT) AS autofill_matches,
            SUM(CASE WHEN ${truthySql("g.is_evacuate")} = 1 THEN 1 ELSE 0 END) AS evac_cnt,
            COUNT(*) AS player_games,
            CAST(0 AS DOUBLE) AS sum_gap
     FROM gng_ob.gamesummary g
     INNER JOIN gng_ob.gamematchmaking m
       ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = m.dt
     WHERE g.dt = '${dt}'
       AND m.region = 'SG' AND m.ip_region = 'VN'
       AND CAST(g.is_valid AS string) IN ('1','true')
     GROUP BY m.level_id, m.group_mode`,
    `SELECT 'bot_teammate' AS kind,
            CAST(NULL AS string) AS sub_key,
            CAST(NULL AS string) AS mode_key,
            COUNT(*) AS match_cnt,
            CAST(0 AS DOUBLE) AS sum_wait,
            SUM(CASE WHEN max_bot >= 2 THEN 1 ELSE 0 END) AS over_2min,
            CAST(0 AS BIGINT) AS over_5min,
            CAST(0 AS BIGINT) AS bot_matches,
            CAST(0 AS BIGINT) AS autofill_matches,
            CAST(0 AS BIGINT) AS evac_cnt,
            CAST(0 AS BIGINT) AS player_games,
            CAST(0 AS DOUBLE) AS sum_gap
     FROM (
       SELECT ge.match_id, MAX(CAST(ge.bot_teammate_num AS BIGINT)) AS max_bot
       FROM gng_ob.gameend ge
       INNER JOIN gng_ob.gamematchmaking m
         ON ge.match_id = m.match_id AND ge.account_id = m.account_id AND ge.dt = m.dt
       WHERE ge.dt = '${dt}' AND m.region = 'SG' AND m.ip_region = 'VN'
       GROUP BY ge.match_id
     ) t`,
    `SELECT 'rank_gap' AS kind,
            CAST(t.level_id AS string) AS sub_key,
            CAST(t.group_mode AS string) AS mode_key,
            COUNT(*) AS match_cnt,
            CAST(0 AS DOUBLE) AS sum_wait,
            CAST(0 AS BIGINT) AS over_2min,
            CAST(0 AS BIGINT) AS over_5min,
            CAST(0 AS BIGINT) AS bot_matches,
            CAST(0 AS BIGINT) AS autofill_matches,
            CAST(0 AS BIGINT) AS evac_cnt,
            CAST(0 AS BIGINT) AS player_games,
            SUM(rank_gap) AS sum_gap
     FROM (
       SELECT g.match_id,
              MAX(CAST(m.level_id AS string)) AS level_id,
              MAX(CAST(m.group_mode AS string)) AS group_mode,
              MAX(CAST(g.cur_rank AS BIGINT)) - MIN(CAST(g.cur_rank AS BIGINT)) AS rank_gap
       FROM gng_ob.gamesummary g
       INNER JOIN gng_ob.gamematchmaking m
         ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = m.dt
       WHERE g.dt = '${dt}' AND m.region = 'SG' AND m.ip_region = 'VN'
         AND g.cur_rank IS NOT NULL
       GROUP BY g.match_id
     ) t
     GROUP BY level_id, group_mode`,
    `SELECT 'equip_gap' AS kind,
            CAST(NULL AS string) AS sub_key,
            CAST(NULL AS string) AS mode_key,
            COUNT(*) AS match_cnt,
            CAST(0 AS DOUBLE) AS sum_wait,
            CAST(0 AS BIGINT) AS over_2min,
            CAST(0 AS BIGINT) AS over_5min,
            CAST(0 AS BIGINT) AS bot_matches,
            CAST(0 AS BIGINT) AS autofill_matches,
            CAST(0 AS BIGINT) AS evac_cnt,
            CAST(0 AS BIGINT) AS player_games,
            SUM(equip_gap) AS sum_gap
     FROM (
       SELECT ge.match_id,
              MAX(CAST(ge.quality_value AS DOUBLE)) - MIN(CAST(ge.quality_value AS DOUBLE)) AS equip_gap
       FROM gng_ob.gameend ge
       INNER JOIN gng_ob.gamematchmaking m
         ON ge.match_id = m.match_id AND ge.account_id = m.account_id AND ge.dt = m.dt
       WHERE ge.dt = '${dt}' AND m.region = 'SG' AND m.ip_region = 'VN'
         AND ge.quality_value IS NOT NULL
       GROUP BY ge.match_id
     ) t`,
  ];
}

export function perfSessionStatsSql(localDt: string): string[] {
  const dt = localDt;
  return [
    `SELECT 'device' AS kind,
            COALESCE(device_model, 'unknown') AS sub_key,
            CAST(NULL AS string) AS server_key,
            COUNT(*) AS session_cnt,
            SUM(CAST(avg_fps AS DOUBLE)) AS sum_fps,
            SUM(CAST(fps_data_b20_count AS DOUBLE)) AS sum_fps_b20,
            SUM(CAST(avg_ping AS DOUBLE)) AS sum_ping,
            SUM(CAST(ping_a300 AS DOUBLE)) AS sum_ping_a300,
            SUM(CAST(ping_total AS DOUBLE)) AS sum_ping_total,
            SUM(CAST(ping100200 AS DOUBLE)) AS ping100200,
            SUM(CAST(ping200300 AS DOUBLE)) AS ping200300,
            SUM(CAST(ping300400 AS DOUBLE)) AS ping300400,
            SUM(CAST(ping400500 AS DOUBLE)) AS ping400500
     FROM gng_ob.gameper
     WHERE ${obDayFilter(dt, { regionCol: "region", ipRegionCol: "ip_region" })}
       AND match_id IS NOT NULL AND match_id != '0'
     GROUP BY device_model`,
    `SELECT 'server' AS kind,
            CAST(NULL AS string) AS sub_key,
            COALESCE(gs_ip, 'unknown') AS server_key,
            COUNT(*) AS session_cnt,
            SUM(CAST(avg_fps AS DOUBLE)) AS sum_fps,
            SUM(CAST(fps_data_b20_count AS DOUBLE)) AS sum_fps_b20,
            SUM(CAST(avg_ping AS DOUBLE)) AS sum_ping,
            SUM(CAST(ping_a300 AS DOUBLE)) AS sum_ping_a300,
            SUM(CAST(ping_total AS DOUBLE)) AS sum_ping_total,
            SUM(CAST(ping100200 AS DOUBLE)) AS ping100200,
            SUM(CAST(ping200300 AS DOUBLE)) AS ping200300,
            SUM(CAST(ping300400 AS DOUBLE)) AS ping300400,
            SUM(CAST(ping400500 AS DOUBLE)) AS ping400500
     FROM gng_ob.gameper
     WHERE ${obDayFilter(dt, { regionCol: "region", ipRegionCol: "ip_region" })}
       AND match_id IS NOT NULL AND match_id != '0'
     GROUP BY gs_ip`,
  ];
}

export function newbieStatsSql(localDt: string): string[] {
  const churnFlag = truthySql("s.is_c7");
  const dt = localDt.replace(/-/g, "");
  const { region, ipRegion } = getIngestScope();
  const cohortJoin = `INNER JOIN gng_cooked_ob.dws_user_register_account_retention_d_i r
       ON r.account_id = s.account_id
      AND r.local_dt = s.register_local_dt
      AND r.region = '${region}' AND r.ip_region = '${ipRegion}'`;
  const cohortCte = `WITH cohort AS (
       SELECT account_id
       FROM gng_cooked_ob.dws_user_register_account_retention_d_i
       WHERE ${dayFilter(localDt, { regionCol: "region", ipRegionCol: "ip_region" })}
     )`;
  return [
    `SELECT 'day7' AS kind,
            'level' AS metric,
            CASE WHEN ${churnFlag} = 1 THEN 'churned' ELSE 'all' END AS segment,
            CAST(DATEDIFF(
              TO_DATE(i.local_dt, 'yyyyMMdd'),
              TO_DATE(s.register_local_dt, 'yyyyMMdd')
            ) AS string) AS day_offset,
            CAST(NULL AS string) AS sub_key,
            COUNT(*) AS cnt,
            SUM(CAST(s.max_active_level AS DOUBLE)) AS sum_value
     FROM gng_cooked_ob.dws_user_active_account_d_i i
     JOIN gng_cooked_ob.dws_user_active_account_d_s s
       ON i.account_id = s.account_id AND i.local_dt = s.local_dt
     ${cohortJoin}
     WHERE i.local_dt = '${localDt}'
       AND i.last_active_region = '${region}' AND i.last_active_ip_region = '${ipRegion}'
       AND s.register_local_dt IS NOT NULL
       AND DATEDIFF(TO_DATE(i.local_dt, 'yyyyMMdd'), TO_DATE(s.register_local_dt, 'yyyyMMdd')) BETWEEN 1 AND 7
     GROUP BY 3, 4`,
    `SELECT 'day7' AS kind,
            'gold' AS metric,
            CASE WHEN ${churnFlag} = 1 THEN 'churned' ELSE 'all' END AS segment,
            CAST(DATEDIFF(
              TO_DATE(s.local_dt, 'yyyyMMdd'),
              TO_DATE(s.register_local_dt, 'yyyyMMdd')
            ) AS string) AS day_offset,
            CAST(NULL AS string) AS sub_key,
            COUNT(*) AS cnt,
            SUM(CAST(s.last_coins_value AS DOUBLE)) AS sum_value
     FROM gng_cooked_ob.dws_user_active_account_d_s s
     ${cohortJoin}
     WHERE s.local_dt = '${localDt}'
       AND s.last_active_region = '${region}' AND s.last_active_ip_region = '${ipRegion}'
       AND s.register_local_dt IS NOT NULL
       AND DATEDIFF(TO_DATE(s.local_dt, 'yyyyMMdd'), TO_DATE(s.register_local_dt, 'yyyyMMdd')) BETWEEN 1 AND 7
     GROUP BY 3, 4`,
    `SELECT 'day7' AS kind,
            'matches' AS metric,
            CASE WHEN ${churnFlag} = 1 THEN 'churned' ELSE 'all' END AS segment,
            CAST(DATEDIFF(
              TO_DATE(i.local_dt, 'yyyyMMdd'),
              TO_DATE(s.register_local_dt, 'yyyyMMdd')
            ) AS string) AS day_offset,
            CAST(NULL AS string) AS sub_key,
            COUNT(*) AS cnt,
            SUM(CAST(i.day_active_game_times AS DOUBLE)) AS sum_value
     FROM gng_cooked_ob.dws_user_active_account_d_i i
     JOIN gng_cooked_ob.dws_user_active_account_d_s s
       ON i.account_id = s.account_id AND i.local_dt = s.local_dt
     ${cohortJoin}
     WHERE i.local_dt = '${localDt}'
       AND i.last_active_region = '${region}' AND i.last_active_ip_region = '${ipRegion}'
       AND s.register_local_dt IS NOT NULL
       AND DATEDIFF(TO_DATE(i.local_dt, 'yyyyMMdd'), TO_DATE(s.register_local_dt, 'yyyyMMdd')) BETWEEN 1 AND 7
     GROUP BY 3, 4`,
    `SELECT 'day7' AS kind,
            'collection' AS metric,
            CASE WHEN ${truthySql("t.is_c7")} = 1 THEN 'churned' ELSE 'all' END AS segment,
            '7' AS day_offset,
            CAST(NULL AS string) AS sub_key,
            COUNT(*) AS cnt,
            SUM(CAST(collection_value AS DOUBLE)) AS sum_value
     FROM (
       SELECT p.account_id,
              MAX(CAST(p.collection_value AS BIGINT)) AS collection_value,
              MAX(s.is_c7) AS is_c7
       FROM gng_ob.personalshow p
       INNER JOIN gng_cooked_ob.dws_user_active_account_d_s s
         ON p.account_id = s.account_id AND s.local_dt = '${localDt}'
       ${cohortJoin}
       WHERE p.dt = '${dt}'
         AND p.region = '${region}' AND p.ip_region = '${ipRegion}'
         AND DATEDIFF(TO_DATE(s.local_dt, 'yyyyMMdd'), TO_DATE(s.register_local_dt, 'yyyyMMdd')) = 7
       GROUP BY p.account_id
     ) t
     GROUP BY 3`,
    `${cohortCte}
     SELECT 'first20' AS kind,
            'winrate' AS metric,
            CASE WHEN ${truthySql("g.is_c7")} = 1 THEN 'churned' ELSE 'all' END AS segment,
            CAST(NULL AS string) AS day_offset,
            CAST(NULL AS string) AS sub_key,
            COUNT(*) AS cnt,
            SUM(CASE WHEN ${truthySql("g.is_evacuate")} = 1 THEN 1 ELSE 0 END) AS sum_value
     FROM (
       SELECT g.account_id, g.is_evacuate, s.is_c7 AS is_c7,
              ROW_NUMBER() OVER (PARTITION BY g.account_id ORDER BY g.ts) AS rn
       FROM gng_ob.gamesummary g
       INNER JOIN cohort c ON g.account_id = c.account_id
       INNER JOIN gng_ob.gamematchmaking m
         ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = m.dt
       LEFT JOIN gng_cooked_ob.dws_user_active_account_d_s s
         ON g.account_id = s.account_id AND s.local_dt = '${localDt}'
       WHERE m.region = '${region}' AND m.ip_region = '${ipRegion}'
         AND CAST(g.warm_match_type AS string) = '0'
         AND g.match_id IS NOT NULL AND g.match_id != '0'
     ) g
     WHERE rn <= 20
     GROUP BY segment`,
    `${cohortCte}
     SELECT 'first20' AS kind,
            'mode' AS metric,
            'all' AS segment,
            CAST(NULL AS string) AS day_offset,
            CAST(m.level_id AS string) AS sub_key,
            COUNT(*) AS cnt,
            CAST(0 AS DOUBLE) AS sum_value
     FROM (
       SELECT g.account_id, g.match_id, g.dt,
              ROW_NUMBER() OVER (PARTITION BY g.account_id ORDER BY g.ts) AS rn
       FROM gng_ob.gamesummary g
       INNER JOIN cohort c ON g.account_id = c.account_id
       INNER JOIN gng_ob.gamematchmaking m
         ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = m.dt
       WHERE m.region = '${region}' AND m.ip_region = '${ipRegion}'
         AND CAST(g.warm_match_type AS string) = '0'
     ) g
     INNER JOIN gng_ob.gamematchmaking m
       ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = m.dt
     WHERE g.rn <= 20
     GROUP BY sub_key`,
    `${cohortCte}
     SELECT 'first20' AS kind,
            'death' AS metric,
            'all' AS segment,
            CAST(NULL AS string) AS day_offset,
            CAST(g.death_reason AS string) AS sub_key,
            COUNT(*) AS cnt,
            CAST(0 AS DOUBLE) AS sum_value
     FROM (
       SELECT g.account_id, g.death_reason, g.ts,
              ROW_NUMBER() OVER (PARTITION BY g.account_id ORDER BY g.ts) AS rn
       FROM gng_ob.gamesummary g
       INNER JOIN cohort c ON g.account_id = c.account_id
       INNER JOIN gng_ob.gamematchmaking m
         ON g.match_id = m.match_id AND g.account_id = m.account_id AND g.dt = m.dt
       WHERE m.region = '${region}' AND m.ip_region = '${ipRegion}'
         AND CAST(g.warm_match_type AS string) = '0'
     ) g
     WHERE g.rn <= 20
     GROUP BY g.death_reason`,
  ];
}
