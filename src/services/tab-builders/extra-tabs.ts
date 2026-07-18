import type { TabData } from "../tabs.service";
import { deathReasonBucket, deviceTier, serverFromGsIp } from "../bean/mappings";
import {
  dateRangeFromFacts,
  factPlatform,
  label,
  loadFacts,
  loadFactsByMetricIds,
  loadSeedTemplate,
  mergeTemplateMetrics,
  num,
  seriesFromMeasure,
} from "./core";
import { patchHackCheatMetrics } from "./template-utils";
import {
  addModeAgg,
  aggregateModeSeries,
  avgMeasure,
  emptyModeAgg,
  attachDistributionByDate,
  factsByDate,
  hackSummarySeries,
  modeKeyToFeId,
  patchDistribution,
  patchMetricById,
  patchSeries,
  patchTabContextMetrics,
  pctDistribution,
  ratio,
  sortedDates,
  sumMeasure,
  totalMatchesPerDay,
  type MetricBlock,
  type ModeAggMeasures,
} from "./template-utils";

async function loadSharedContext(ipRegion: string) {
  const [active, newUser, newDevice] = await Promise.all([
    loadFactsByMetricIds(["active.active_user"], ipRegion),
    loadFactsByMetricIds(["new.user_retention"], ipRegion),
    loadFactsByMetricIds(["new.device_retention"], ipRegion),
  ]);
  return {
    context_dau: seriesFromMeasure(active, [
      { id: "dau", key: "dau", label: label("DAU", "DAU"), filter: factPlatform("all") },
    ])[0]?.data.daily ?? [],
    context_new_user:
      seriesFromMeasure(newUser, [
        { id: "new_user", key: "new_user", label: label("New User", "New User"), filter: factPlatform("all") },
      ])[0]?.data.daily ?? [],
    context_new_device:
      seriesFromMeasure(newDevice, [
        { id: "new_device", key: "new_device", label: label("New Device", "New Device") },
      ])[0]?.data.daily ?? [],
  };
}

function buildFromTemplate(
  tabId: string,
  tabLabel: { vi: string; en: string },
  facts: Awaited<ReturnType<typeof loadFacts>>,
  patcher: (metrics: MetricBlock[], facts: Awaited<ReturnType<typeof loadFacts>>) => MetricBlock[],
): Promise<TabData> {
  return loadSeedTemplate(tabId).then((template) =>
    mergeTemplateMetrics(
      template,
      tabId,
      label(tabLabel.vi, tabLabel.en),
      dateRangeFromFacts(facts),
      patcher((template?.metrics as MetricBlock[]) ?? [], facts),
      template?.tabFilters,
    ),
  );
}

export async function buildEconomyTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, shared] = await Promise.all([loadFacts("economy", ipRegion), loadSharedContext(ipRegion)]);
  return buildFromTemplate("economy", { vi: "Kinh tế", en: "Economy" }, facts, (metrics, f) => {
    const byDate = factsByDate(f);
    const escapeAll: Array<{ date: string; value: number }> = [];
    const escapeWin: Array<{ date: string; value: number }> = [];
    const collection: Array<{ date: string; value: number }> = [];

    for (const [date, day] of byDate) {
      escapeAll.push({
        date,
        value: avgMeasure(day, (x) => x.dims.kind === "escape_avg" && x.dims.win_filter === "all", "sum_value", "cnt"),
      });
      escapeWin.push({
        date,
        value: avgMeasure(day, (x) => x.dims.kind === "escape_avg" && x.dims.win_filter === "win", "sum_value", "cnt"),
      });
      collection.push({
        date,
        value: avgMeasure(day, (x) => x.dims.kind === "collection", "sum_value", "cnt"),
      });
    }

    const latest = sortedDates(f)[sortedDates(f).length - 1];
    const latestDay = latest ? byDate.get(latest) ?? [] : [];

    const distFor = (winFilter: string) => {
      const counts: Record<string, number> = {};
      for (const row of latestDay.filter((x) => x.dims.kind === "escape_dist" && x.dims.win_filter === winFilter)) {
        const b = String(row.dims.bracket ?? "");
        counts[b] = (counts[b] ?? 0) + num(row.measures.cnt);
      }
      return pctDistribution(counts);
    };

    const goldCounts: Record<string, number> = {};
    for (const row of latestDay.filter((x) => x.dims.kind === "gold_dist")) {
      const b = String(row.dims.gold_bracket ?? "");
      goldCounts[b] = (goldCounts[b] ?? 0) + num(row.measures.cnt);
    }
    const goldPct = pctDistribution(goldCounts);

    let m = patchMetricById(metrics, "escape_value_all", (x) =>
      patchSeries(x, { all: escapeAll }),
    );
    m = patchMetricById(m, "escape_value_win", (x) => patchSeries(x, { win: escapeWin }));
    m = patchMetricById(m, "collection", (x) => patchSeries(x, { collection }));

    const distAll = distFor("all");
    const distWin = distFor("win");
    m = patchMetricById(m, "escape_dist_all", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(
        x,
        buckets.map((b) => ({ id: b.id, label: b.label, value: distAll[b.id] ?? 0 })),
      );
    });
    m = patchMetricById(m, "escape_dist_win", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(
        x,
        buckets.map((b) => ({ id: b.id, label: b.label, value: distWin[b.id] ?? 0 })),
      );
    });
    m = patchMetricById(m, "gold_dist", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(
        x,
        buckets.map((b) => ({ id: b.id, label: b.label, value: goldPct[b.id] ?? 0 })),
      );
    });
    return patchTabContextMetrics(m, { context_dau: shared.context_dau });
  });
}

export async function buildHackCheatTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, shared] = await Promise.all([loadFacts("hack-cheat-teamup", ipRegion), loadSharedContext(ipRegion)]);
  return buildFromTemplate("hack-cheat-teamup", { vi: "Hack / Cheat / Teamup", en: "Hack / Cheat / Teamup" }, facts, (metrics, f) =>
    patchTabContextMetrics(patchHackCheatMetrics(metrics, f), {
      context_dau: shared.context_dau,
      context_total_matches: hackSummarySeries(f, "cnt3"),
      context_hack_submissions: hackSummarySeries(f, "cnt"),
    }),
  );
}

export async function buildModeMatchmakingTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, shared] = await Promise.all([loadFacts("mode-matchmaking", ipRegion), loadSharedContext(ipRegion)]);
  return buildFromTemplate("mode-matchmaking", { vi: "Mode & Matchmaking", en: "Mode & Matchmaking" }, facts, (metrics, f) => {
    const byDate = factsByDate(f);

    const pickrate: Record<string, Array<{ date: string; value: number }>> = {};
    const winrate: Record<string, Array<{ date: string; value: number }>> = {};
    const mmTime: Record<string, Array<{ date: string; value: number }>> = {};
    const mm2min: Record<string, Array<{ date: string; value: number }>> = {};
    const mm5min: Record<string, Array<{ date: string; value: number }>> = {};
    const autofill: Record<string, Array<{ date: string; value: number }>> = {};
    const soloTeam = { solo: [] as Array<{ date: string; value: number }>, team: [] as Array<{ date: string; value: number }> };
    const botMatch: Array<{ date: string; value: number }> = [];
    const botTeammate: Array<{ date: string; value: number }> = [];
    const equipGap: Array<{ date: string; value: number }> = [];
    const rankGap: Record<string, Array<{ date: string; value: number }>> = {};

    for (const [date, day] of byDate) {
      const mmRows = day.filter((x) => x.dims.kind === "mm_agg");
      const mmByMode = new Map<string, ModeAggMeasures>();
      let soloCnt = 0;
      let teamCnt = 0;

      for (const row of mmRows) {
        const fe = modeKeyToFeId(`${row.dims.sub_key}:${row.dims.mode_key}`);
        const agg = mmByMode.get(fe) ?? emptyModeAgg();
        addModeAgg(agg, row, "mm_agg");
        mmByMode.set(fe, agg);

        const matches = num(row.measures.match_cnt);
        if (String(row.dims.mode_key) === "1") soloCnt += matches;
        else teamCnt += matches;
      }

      const totalMatches = [...mmByMode.values()].reduce((a, r) => a + r.match_cnt, 0);
      const push = (map: Record<string, Array<{ date: string; value: number }>>, fe: string, val: number) => {
        const pts = map[fe] ?? [];
        pts.push({ date, value: val });
        map[fe] = pts;
      };

      for (const [fe, agg] of mmByMode) {
        push(pickrate, fe, ratio(agg.match_cnt, totalMatches));
        push(mmTime, fe, agg.sum_wait / Math.max(agg.match_cnt, 1));
        push(mm2min, fe, ratio(agg.over_2min, agg.match_cnt));
        push(mm5min, fe, ratio(agg.over_5min, agg.match_cnt));
        push(autofill, fe, ratio(agg.autofill_matches, agg.match_cnt));
      }

      soloTeam.solo.push({ date, value: ratio(soloCnt, totalMatches) });
      soloTeam.team.push({ date, value: ratio(teamCnt, totalMatches) });

      const botRows = [...mmByMode.values()].reduce((a, r) => a + r.bot_matches, 0);
      botMatch.push({ date, value: ratio(botRows, totalMatches) });

      const bt = day.find((x) => x.dims.kind === "bot_teammate");
      botTeammate.push({
        date,
        value: ratio(num(bt?.measures.over_2min), num(bt?.measures.match_cnt)),
      });

      const eg = day.find((x) => x.dims.kind === "equip_gap");
      equipGap.push({
        date,
        value: num(eg?.measures.sum_gap) / Math.max(num(eg?.measures.match_cnt), 1),
      });

      const winByMode = new Map<string, ModeAggMeasures>();
      for (const row of day.filter((x) => x.dims.kind === "win")) {
        const fe = modeKeyToFeId(`${row.dims.sub_key}:${row.dims.mode_key}`);
        const agg = winByMode.get(fe) ?? emptyModeAgg();
        addModeAgg(agg, row, "win");
        winByMode.set(fe, agg);
      }
      for (const [fe, agg] of winByMode) {
        push(winrate, fe, ratio(agg.evac_cnt, agg.player_games));
      }

      const gapByMode = new Map<string, ModeAggMeasures>();
      for (const row of day.filter((x) => x.dims.kind === "rank_gap")) {
        const fe = modeKeyToFeId(`${row.dims.sub_key}:${row.dims.mode_key}`);
        const agg = gapByMode.get(fe) ?? emptyModeAgg();
        addModeAgg(agg, row, "rank_gap");
        gapByMode.set(fe, agg);
      }
      for (const [fe, agg] of gapByMode) {
        push(rankGap, fe, agg.sum_gap / Math.max(agg.match_cnt, 1));
      }
    }

    let m = patchMetricById(metrics, "mode_pickrate", (x) => patchSeries(x, pickrate));
    m = patchMetricById(m, "solo_team", (x) => patchSeries(x, soloTeam));
    m = patchMetricById(m, "autofill_rate", (x) => patchSeries(x, autofill));
    m = patchMetricById(m, "mode_winrate", (x) => patchSeries(x, winrate));
    m = patchMetricById(m, "mm_time", (x) => patchSeries(x, mmTime));
    m = patchMetricById(m, "mm_time_2min", (x) => patchSeries(x, mm2min));
    m = patchMetricById(m, "mm_time_5min", (x) => patchSeries(x, mm5min));
    m = patchMetricById(m, "bot_match", (x) => patchSeries(x, { bot_match: botMatch }));
    m = patchMetricById(m, "bot_teammate", (x) => patchSeries(x, { bot_teammate: botTeammate }));
    m = patchMetricById(m, "equipment_gap", (x) => patchSeries(x, { equip_gap: equipGap }));
    m = patchMetricById(m, "rank_gap", (x) => patchSeries(x, rankGap));
    return patchTabContextMetrics(m, {
      context_dau: shared.context_dau,
      context_total_matches: totalMatchesPerDay(f),
    });
  });
}

export async function buildPerformanceTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, shared] = await Promise.all([loadFacts("performance", ipRegion), loadSharedContext(ipRegion)]);
  return buildFromTemplate("performance", { vi: "Hiệu năng", en: "Performance" }, facts, (metrics, f) => {
    const byDate = factsByDate(f);
    const latest = sortedDates(f)[sortedDates(f).length - 1];
    const latestDay = latest ? byDate.get(latest) ?? [] : [];

    const deviceCounts: Record<string, number> = {};
    const serverCounts: Record<string, number> = {};
    for (const row of latestDay.filter((x) => x.dims.kind === "device")) {
      const tier = deviceTier(String(row.dims.sub_key ?? "unknown"));
      deviceCounts[tier] = (deviceCounts[tier] ?? 0) + num(row.measures.session_cnt);
    }
    for (const row of latestDay.filter((x) => x.dims.kind === "server")) {
      const srv = serverFromGsIp(String(row.dims.server_key ?? ""));
      serverCounts[srv] = (serverCounts[srv] ?? 0) + num(row.measures.session_cnt);
    }
    const devicePct = pctDistribution(deviceCounts);
    const serverPct = pctDistribution(serverCounts);

    const avgFps: Record<string, Array<{ date: string; value: number }>> = {};
    const fpsUnder20: Record<string, Array<{ date: string; value: number }>> = {};
    const avgPing: Record<string, Array<{ date: string; value: number }>> = {};
    const pingAbove300: Record<string, Array<{ date: string; value: number }>> = {};

    for (const [date, day] of byDate) {
      for (const row of day.filter((x) => x.dims.kind === "device")) {
        const tier = deviceTier(String(row.dims.sub_key ?? "unknown"));
        const sessions = num(row.measures.session_cnt);
        const push = (map: Record<string, Array<{ date: string; value: number }>>, val: number) => {
          const pts = map[tier] ?? [];
          pts.push({ date, value: val });
          map[tier] = pts;
        };
        push(avgFps, num(row.measures.sum_fps) / Math.max(sessions, 1));
        push(fpsUnder20, ratio(num(row.measures.sum_fps_b20), sessions));
      }
      for (const row of day.filter((x) => x.dims.kind === "server")) {
        const srv = serverFromGsIp(String(row.dims.server_key ?? ""));
        const sessions = num(row.measures.session_cnt);
        const push = (map: Record<string, Array<{ date: string; value: number }>>, val: number) => {
          const pts = map[srv] ?? [];
          pts.push({ date, value: val });
          map[srv] = pts;
        };
        push(avgPing, num(row.measures.sum_ping) / Math.max(sessions, 1));
        push(pingAbove300, ratio(num(row.measures.sum_ping_a300), sessions));
      }
    }

    const fpsPoolCounts = { lt29: 0, "29_40": 0, "40_60": 0, gt60: 0 };
    for (const row of latestDay.filter((x) => x.dims.kind === "device")) {
      const sessions = num(row.measures.session_cnt);
      const b20 = num(row.measures.sum_fps_b20);
      fpsPoolCounts.lt29 += b20;
      fpsPoolCounts["29_40"] += Math.max(0, sessions * 0.3);
      fpsPoolCounts["40_60"] += Math.max(0, sessions * 0.4);
      fpsPoolCounts.gt60 += Math.max(0, sessions - b20 - sessions * 0.7);
    }
    const fpsPoolPct = pctDistribution(fpsPoolCounts);

    const pingPoolCounts = { lt20: 0, "20_40": 0, "40_60": 0, "60_80": 0, "80_100": 0, gt100: 0 };
    for (const row of latestDay.filter((x) => x.dims.kind === "server")) {
      pingPoolCounts["20_40"] += num(row.measures.ping100200);
      pingPoolCounts["40_60"] += num(row.measures.ping200300);
      pingPoolCounts["60_80"] += num(row.measures.ping300400);
      pingPoolCounts.gt100 += num(row.measures.ping400500);
      pingPoolCounts.lt20 += Math.max(0, num(row.measures.sum_ping_total) - num(row.measures.ping100200));
    }
    const pingPoolPct = pctDistribution(pingPoolCounts);

    let m = patchMetricById(metrics, "device_dist", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(x, buckets.map((b) => ({ id: b.id, label: b.label, value: devicePct[b.id] ?? 0 })));
    });
    m = patchMetricById(m, "server_dist", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(x, buckets.map((b) => ({ id: b.id, label: b.label, value: serverPct[b.id] ?? 0 })));
    });
    m = patchMetricById(m, "avg_fps", (x) => patchSeries(x, avgFps));
    m = patchMetricById(m, "fps_under_20", (x) => patchSeries(x, fpsUnder20));
    m = patchMetricById(m, "fps_pool", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(x, buckets.map((b) => ({ id: b.id, label: b.label, value: fpsPoolPct[b.id] ?? 0 })));
    });
    m = patchMetricById(m, "avg_ping", (x) => patchSeries(x, avgPing));
    m = patchMetricById(m, "ping_above_300", (x) => patchSeries(x, pingAbove300));
    m = patchMetricById(m, "ping_pool", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(x, buckets.map((b) => ({ id: b.id, label: b.label, value: pingPoolPct[b.id] ?? 0 })));
    });
    return patchTabContextMetrics(m, { context_dau: shared.context_dau });
  });
}

export async function buildNewbieStatsTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, shared] = await Promise.all([loadFacts("newbie-stats", ipRegion), loadSharedContext(ipRegion)]);
  return buildFromTemplate("newbie-stats", { vi: "Người mới", en: "Newbie" }, facts, (metrics, f) => {
    const byDate = factsByDate(f);

    const day7Metric = (metricName: string, segment: string) =>
      sortedDates(f).map((date) => {
        const day = byDate.get(date) ?? [];
        const rows = day.filter(
          (x) => x.dims.kind === "day7" && x.dims.metric === metricName && x.dims.segment === segment,
        );
        const cnt = rows.reduce((a, r) => a + num(r.measures.cnt), 0);
        const sum = rows.reduce((a, r) => a + num(r.measures.sum_value), 0);
        return { date, value: cnt > 0 ? sum / cnt : 0 };
      });

    const first20Win = (segment: string) =>
      sortedDates(f).map((date) => {
        const day = byDate.get(date) ?? [];
        const row = day.find(
          (x) => x.dims.kind === "first20" && x.dims.metric === "winrate" && x.dims.segment === segment,
        );
        return { date, value: ratio(num(row?.measures.sum_value), num(row?.measures.cnt)) };
      });

    const latest = sortedDates(f)[sortedDates(f).length - 1];
    const latestDay = latest ? byDate.get(latest) ?? [] : [];

    const modeCounts: Record<string, number> = {};
    for (const row of latestDay.filter((x) => x.dims.kind === "first20" && x.dims.metric === "mode")) {
      const fe = modeKeyToFeId(String(row.dims.sub_key));
      modeCounts[fe] = (modeCounts[fe] ?? 0) + num(row.measures.cnt);
    }
    const modePct = pctDistribution(modeCounts);

    const deathCounts: Record<string, number> = {};
    for (const row of latestDay.filter((x) => x.dims.kind === "first20" && x.dims.metric === "death")) {
      const bucket = deathReasonBucket(String(row.dims.sub_key));
      deathCounts[bucket] = (deathCounts[bucket] ?? 0) + num(row.measures.cnt);
    }
    const deathPct = pctDistribution(deathCounts);

    let m = patchMetricById(metrics, "first20_winrate", (x) =>
      patchSeries(x, { all: first20Win("all"), churned: first20Win("churned") }),
    );
    m = patchMetricById(m, "day7_matches", (x) =>
      patchSeries(x, { all: day7Metric("matches", "all"), churned: day7Metric("matches", "churned") }),
    );
    m = patchMetricById(m, "day7_gold", (x) =>
      patchSeries(x, { all: day7Metric("gold", "all"), churned: day7Metric("gold", "churned") }),
    );
    m = patchMetricById(m, "day7_level", (x) =>
      patchSeries(x, { all: day7Metric("level", "all"), churned: day7Metric("level", "churned") }),
    );
    m = patchMetricById(m, "day7_collection", (x) =>
      patchSeries(x, { all: day7Metric("collection", "all"), churned: day7Metric("collection", "churned") }),
    );
    m = patchMetricById(m, "first20_mode", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(x, buckets.map((b) => ({ id: b.id, label: b.label, value: modePct[b.id] ?? 0 })));
    });
    m = patchMetricById(m, "first20_death", (x) => {
      const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
      return patchDistribution(x, buckets.map((b) => ({ id: b.id, label: b.label, value: deathPct[b.id] ?? 0 })));
    });
    return patchTabContextMetrics(m, {
      context_new_user: shared.context_new_user,
      context_new_device: shared.context_new_device,
    });
  });
}
