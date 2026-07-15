import { deathReasonBucket, deviceTier, FE_MODE_IDS, feModeIdFromLevel, serverFromGsIp } from "../bean/mappings";
import { formatDateOnly } from "../../utils/dates";
import type { FactRow } from "./core";
import { num } from "./core";

export type MetricBlock = Record<string, unknown>;

export function factsByDate(facts: FactRow[]): Map<string, FactRow[]> {
  const map = new Map<string, FactRow[]>();
  for (const f of facts) {
    const iso = formatDateOnly(f.dt);
    const arr = map.get(iso) ?? [];
    arr.push(f);
    map.set(iso, arr);
  }
  return map;
}

export function sortedDates(facts: FactRow[]): string[] {
  return [...factsByDate(facts).keys()].sort();
}

export function sumMeasure(dayFacts: FactRow[], filter: (f: FactRow) => boolean, key: string): number {
  let total = 0;
  for (const f of dayFacts) {
    if (!filter(f)) continue;
    total += num(f.measures[key]);
  }
  return total;
}

export function ratio(numVal: number, den: number): number {
  if (den <= 0) return 0;
  return (numVal / den) * 100;
}

export function avgMeasure(dayFacts: FactRow[], filter: (f: FactRow) => boolean, numKey: string, denKey: string): number {
  const n = sumMeasure(dayFacts, filter, numKey);
  const d = sumMeasure(dayFacts, filter, denKey);
  if (d <= 0) return 0;
  return n / d;
}

export function pctDistribution(counts: Record<string, number>): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    out[k] = total > 0 ? Math.round((v / total) * 1000) / 10 : 0;
  }
  return out;
}

export function patchSeries(
  metric: MetricBlock,
  seriesData: Record<string, Array<{ date: string; value: number }>>,
): MetricBlock {
  const series = (metric.series as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    ...metric,
    series: series.map((s) => ({
      ...s,
      data: {
        ...(s.data as Record<string, unknown>),
        daily: seriesData[String(s.id)] ?? [],
      },
    })),
  };
}

export function patchDistribution(
  metric: MetricBlock,
  daily: Array<{ id: string; label?: unknown; value: number }>,
): MetricBlock {
  const dist = (metric.distribution as Record<string, unknown> | undefined) ?? {};
  const weekly = daily.map((d) => ({ ...d }));
  const monthly = daily.map((d) => ({ ...d }));
  return {
    ...metric,
    distribution: { ...dist, daily, weekly, monthly },
  };
}

export type DistributionBucketLike = { id: string; label?: unknown; value: number };

/** Pick snapshot distribution for the selected date window (prefers dateEnd, walks back for signal). */
export function pickDistributionForDateRange(
  byDate: Record<string, DistributionBucketLike[]>,
  dateStart: string,
  dateEnd: string,
): DistributionBucketLike[] {
  const lo = dateStart <= dateEnd ? dateStart : dateEnd;
  const hi = dateStart <= dateEnd ? dateEnd : dateStart;
  const inRange = Object.keys(byDate)
    .filter((d) => d >= lo && d <= hi)
    .sort();
  const hasSignal = (buckets: DistributionBucketLike[]) =>
    buckets.some((b) => b.value > 0);

  for (let i = inRange.length - 1; i >= 0; i--) {
    const buckets = byDate[inRange[i]!] ?? [];
    if (hasSignal(buckets)) return buckets;
  }
  // Selected window has no signal — walk back to the latest day on/before dateEnd
  const beforeEnd = Object.keys(byDate)
    .filter((d) => d <= hi)
    .sort();
  for (let i = beforeEnd.length - 1; i >= 0; i--) {
    const buckets = byDate[beforeEnd[i]!] ?? [];
    if (hasSignal(buckets)) return buckets;
  }
  const fallback = inRange.at(-1);
  if (fallback) return byDate[fallback] ?? [];
  const allDates = Object.keys(byDate).sort();
  return allDates.length ? (byDate[allDates.at(-1)!] ?? []) : [];
}

export function attachDistributionByDate(
  metric: MetricBlock,
  byDate: Record<string, DistributionBucketLike[]>,
  fallbackDate: string | undefined,
): MetricBlock {
  const dates = Object.keys(byDate).sort();
  const end = fallbackDate ?? dates.at(-1) ?? "";
  const start = dates[0] ?? end;
  const fallback = pickDistributionForDateRange(byDate, start, end);
  const patched = patchDistribution(metric, fallback);
  return { ...patched, distributionByDate: byDate };
}

export function patchMetricById(
  metrics: MetricBlock[],
  id: string,
  patch: (metric: MetricBlock) => MetricBlock,
): MetricBlock[] {
  return metrics.map((m) => (m.id === id ? patch(m) : m));
}

export function modeKeyToFeId(modeKey: string): string {
  const lid = modeKey.split(":")[0] ?? modeKey;
  return feModeIdFromLevel(lid);
}

/** Per product-mode report + match denominators for hack/team-up charts. */
export function aggregateReportByFeMode(
  day: FactRow[],
  reportKind: "hack_mode" | "teamup_mode",
): Record<string, { submissions: number; reportedMatches: number; totalMatches: number }> {
  const out: Record<string, { submissions: number; reportedMatches: number; totalMatches: number }> = {};
  for (const id of FE_MODE_IDS) {
    out[id] = { submissions: 0, reportedMatches: 0, totalMatches: 0 };
  }
  for (const row of day.filter((x) => x.dims.kind === "match_mode")) {
    const fe = modeKeyToFeId(String(row.dims.mode_key));
    out[fe]!.totalMatches += num(row.measures.cnt);
  }
  for (const row of day.filter((x) => x.dims.kind === reportKind)) {
    const fe = modeKeyToFeId(String(row.dims.mode_key));
    out[fe]!.submissions += num(row.measures.cnt);
    out[fe]!.reportedMatches += num(row.measures.cnt2);
  }
  return out;
}

/** @deprecated Prefer aggregateReportByFeMode — rolls up LK challenge variants. */
export function hackModeRollup(feMode: string): string {
  if (feMode === "lk_hell") return "lk_hell";
  if (feMode === "dcp_challenge") return "dcp_challenge";
  if (
    feMode === "lk_normal" ||
    feMode === "lk_challenge_solo" ||
    feMode === "lk_challenge_team"
  ) {
    return "lk_challenge";
  }
  if (feMode === "arena" || feMode === "pve") return "other_modes";
  return "other_modes";
}

export interface ModeAggMeasures {
  match_cnt: number;
  sum_wait: number;
  over_2min: number;
  over_5min: number;
  autofill_matches: number;
  bot_matches: number;
  evac_cnt: number;
  player_games: number;
  sum_gap: number;
}

export function emptyModeAgg(): ModeAggMeasures {
  return {
    match_cnt: 0,
    sum_wait: 0,
    over_2min: 0,
    over_5min: 0,
    autofill_matches: 0,
    bot_matches: 0,
    evac_cnt: 0,
    player_games: 0,
    sum_gap: 0,
  };
}

export function addModeAgg(target: ModeAggMeasures, row: FactRow, kind: "mm_agg" | "win" | "rank_gap"): void {
  if (kind === "mm_agg") {
    target.match_cnt += num(row.measures.match_cnt);
    target.sum_wait += num(row.measures.sum_wait);
    target.over_2min += num(row.measures.over_2min);
    target.over_5min += num(row.measures.over_5min);
    target.autofill_matches += num(row.measures.autofill_matches);
    target.bot_matches += num(row.measures.bot_matches);
    return;
  }
  if (kind === "win") {
    target.evac_cnt += num(row.measures.evac_cnt);
    target.player_games += num(row.measures.player_games);
    return;
  }
  target.match_cnt += num(row.measures.match_cnt);
  target.sum_gap += num(row.measures.sum_gap);
}

export function kpiFromPoints(points: Array<{ date: string; value: number }>): { value: number; change: number } {
  const latest = points.at(-1)?.value ?? 0;
  const prev = points.at(-2)?.value ?? latest;
  const change = prev !== 0 ? Math.round(((latest - prev) / prev) * 1000) / 10 : 0;
  return { value: latest, change };
}

export function totalMatchesPerDay(facts: FactRow[]): Array<{ date: string; value: number }> {
  const byDate = factsByDate(facts);
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, day]) => ({
      date,
      value: day.filter((f) => f.dims.kind === "mm_agg").reduce((s, f) => s + num(f.measures.match_cnt), 0),
    }));
}

export function hackSummarySeries(facts: FactRow[], measureKey: string): Array<{ date: string; value: number }> {
  const byDate = factsByDate(facts);
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, day]) => ({
      date,
      value: num(day.find((f) => f.dims.kind === "hack_summary")?.measures[measureKey]),
    }));
}

/** Patch overview KPI metrics (context_*) from shared daily series. */
export function patchTabContextMetrics(
  metrics: MetricBlock[],
  ctx: Record<string, Array<{ date: string; value: number }>>,
): MetricBlock[] {
  let out = metrics;
  for (const [metricId, points] of Object.entries(ctx)) {
    if (!points.length) continue;
    const seriesId = metricId.replace(/^context_/, "");
    out = patchMetricById(out, metricId, (m) => ({
      ...patchSeries(m, { [seriesId]: points }),
      kpi: kpiFromPoints(points),
    }));
  }
  return out;
}

export function aggregateModeSeries(
  facts: FactRow[],
  kind: string,
  valueFn: (dayFacts: FactRow[], feMode: string) => number,
): Record<string, Array<{ date: string; value: number }>> {
  const byDate = factsByDate(facts);
  const out: Record<string, Array<{ date: string; value: number }>> = {};
  for (const [date, dayFacts] of byDate) {
    const modeFacts = dayFacts.filter((f) => f.dims.kind === kind && f.dims.sub_key && f.dims.mode_key);
    const byMode = new Map<string, FactRow[]>();
    for (const f of modeFacts) {
      const feId = modeKeyToFeId(`${f.dims.sub_key}:${f.dims.mode_key}`);
      const arr = byMode.get(feId) ?? [];
      arr.push(f);
      byMode.set(feId, arr);
    }
    for (const [feMode, rows] of byMode) {
      const pts = out[feMode] ?? [];
      pts.push({ date, value: valueFn(rows, feMode) });
      out[feMode] = pts;
    }
  }
  for (const k of Object.keys(out)) {
    out[k]!.sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

export function patchHackCheatMetrics(metrics: MetricBlock[], facts: FactRow[]): MetricBlock[] {
  const byDate = factsByDate(facts);

  const hackReportsPerMatch: Record<string, Array<{ date: string; value: number }>> = {};
  const hackMatchPctByMode: Record<string, Array<{ date: string; value: number }>> = {};
  const teamupReports: Record<string, Array<{ date: string; value: number }>> = {};
  const teamupMatchPctByMode: Record<string, Array<{ date: string; value: number }>> = {};
  const banSeries: Record<string, Array<{ date: string; value: number }>> = {
    hack_submissions: [],
    matches_with_report: [],
    accounts_banned: [],
  };
  const violations: Record<string, Array<{ date: string; value: number }>> = { detected: [], punished: [] };
  const detectionBanRate: Array<{ date: string; value: number }> = [];
  const thresholdVolume: Record<string, Array<{ date: string; value: number }>> = { "3t": [], "5t": [], "10t": [] };
  const thresholdBanRate: Record<string, Array<{ date: string; value: number }>> = { "3t": [], "5t": [], "10t": [] };

  for (const modeId of FE_MODE_IDS) {
    hackReportsPerMatch[modeId] = [];
    hackMatchPctByMode[modeId] = [];
    teamupReports[modeId] = [];
    teamupMatchPctByMode[modeId] = [];
  }
  hackMatchPctByMode.all = [];

  for (const [date, day] of byDate) {
    const hack = day.find((x) => x.dims.kind === "hack_summary");
    const team = day.find((x) => x.dims.kind === "teamup_summary");
    const bans = day.find((x) => x.dims.kind === "bans");

    hackMatchPctByMode.all!.push({ date, value: ratio(num(hack?.measures.cnt2), num(hack?.measures.cnt3)) });

    const hackByMode = aggregateReportByFeMode(day, "hack_mode");
    const teamByMode = aggregateReportByFeMode(day, "teamup_mode");
    const allHackMatches = num(hack?.measures.cnt3);
    const allTeamMatches = num(team?.measures.cnt3);

    for (const modeId of FE_MODE_IDS) {
      const h = hackByMode[modeId]!;
      const t = teamByMode[modeId]!;
      const hackDen = h.totalMatches || allHackMatches;
      const teamDen = t.totalMatches || allTeamMatches;
      hackReportsPerMatch[modeId]!.push({ date, value: hackDen > 0 ? h.submissions / hackDen : 0 });
      hackMatchPctByMode[modeId]!.push({ date, value: ratio(h.reportedMatches, hackDen) });
      teamupReports[modeId]!.push({ date, value: teamDen > 0 ? t.submissions / teamDen : 0 });
      teamupMatchPctByMode[modeId]!.push({ date, value: ratio(t.reportedMatches, teamDen) });
    }

    banSeries.hack_submissions!.push({ date, value: num(hack?.measures.cnt) });
    banSeries.matches_with_report!.push({ date, value: num(hack?.measures.cnt2) });
    banSeries.accounts_banned!.push({ date, value: num(bans?.measures.cnt2) });

    const detected = sumMeasure(day, (x) => x.dims.kind === "violations" && x.dims.sub_key === "detected", "cnt");
    const punished = sumMeasure(day, (x) => x.dims.kind === "violations" && x.dims.sub_key === "punished", "cnt");
    for (const row of day.filter((x) => x.dims.kind === "violations")) {
      const key = String(row.dims.sub_key);
      (violations[key] ??= []).push({ date, value: num(row.measures.cnt) });
    }
    detectionBanRate.push({ date, value: ratio(punished, detected) });

    for (const key of ["3t", "5t", "10t"] as const) {
      const row = day.find((x) => x.dims.kind === "threshold" && x.dims.sub_key === key);
      const reported = num(row?.measures.cnt);
      const banned = num(row?.measures.cnt2);
      thresholdVolume[key]!.push({ date, value: reported });
      thresholdBanRate[key]!.push({ date, value: reported > 0 ? ratio(banned, reported) : 0 });
    }
  }

  const latest = sortedDates(facts)[sortedDates(facts).length - 1];
  const thresholdLabels = {
    "3t": { vi: "3 lan bi report", en: "Reported 3 times" },
    "5t": { vi: "5 lan bi report", en: "Reported 5 times" },
    "10t": { vi: ">=7 lan bi report", en: "Reported >=7 times" },
  } as const;

  const thresholdByDate: Record<string, Array<{ id: string; label: { vi: string; en: string }; value: number }>> = {};
  for (const [date, day] of byDate) {
    const buckets = [
      { id: "3t", label: thresholdLabels["3t"], value: 0 },
      { id: "5t", label: thresholdLabels["5t"], value: 0 },
      { id: "10t", label: thresholdLabels["10t"], value: 0 },
    ];
    for (const row of day.filter((x) => x.dims.kind === "threshold")) {
      const t = String(row.dims.sub_key);
      if (t === "4t") continue;
      const reported = num(row.measures.cnt);
      const punished = num(row.measures.cnt2);
      const bucket = buckets.find((b) => b.id === t);
      if (bucket && reported > 0) bucket.value = Math.round((punished / reported) * 1000) / 10;
    }
    thresholdByDate[date] = buckets;
  }

  const penaltyByDate: Record<string, Array<{ id: string; label: unknown; value: number }>> = {};
  const teamupDistByDate: Record<string, Array<{ id: string; label: unknown; value: number }>> = {};
  for (const [date, day] of byDate) {
    const penaltyCounts: Record<string, number> = {};
    for (const row of day.filter((x) => x.dims.kind === "penalty")) {
      const t = String(row.dims.sub_key).replace(/^l/i, "");
      if (t) penaltyCounts[`l${t}`] = (penaltyCounts[`l${t}`] ?? 0) + num(row.measures.cnt);
    }
    penaltyByDate[date] = Object.entries(pctDistribution(penaltyCounts)).map(([id, value]) => ({
      id, label: { vi: id, en: id }, value,
    }));
    const teamByMode = aggregateReportByFeMode(day, "teamup_mode");
    teamupDistByDate[date] = FE_MODE_IDS.map((id) => ({
      id, label: { vi: id, en: id }, value: teamByMode[id]!.submissions,
    }));
  }

  let m = patchMetricById(metrics, "hack_report", (x) => patchSeries(x, hackReportsPerMatch));
  m = patchMetricById(m, "hack_match_pct", (x) => patchSeries(x, hackMatchPctByMode));
  m = patchMetricById(m, "confirmed_ban", (x) => patchSeries(x, banSeries));
  m = patchMetricById(m, "ban_report_pct", (x) =>
    patchSeries(x, {
      efficiency: sortedDates(facts).map((date) => {
        const day = byDate.get(date) ?? [];
        const hack = day.find((r) => r.dims.kind === "hack_summary");
        const ban = day.find((r) => r.dims.kind === "bans");
        return { date, value: ratio(num(ban?.measures.cnt2), num(hack?.measures.cnt)) };
      }),
    }),
  );
  m = patchMetricById(m, "teamup_report", (x) => patchSeries(x, teamupReports));
  m = patchMetricById(m, "teamup_match_pct", (x) => patchSeries(x, teamupMatchPctByMode));
  m = patchMetricById(m, "violations_detected", (x) => patchSeries(x, violations));
  m = patchMetricById(m, "report_threshold_volume", (x) => patchSeries(x, thresholdVolume));
  m = patchMetricById(m, "report_threshold_ban_rate", (x) => patchSeries(x, thresholdBanRate));
  m = patchMetricById(m, "detection_ban_rate", (x) => patchSeries(x, { rate: detectionBanRate }));
  m = patchMetricById(m, "teamup_breakdown", (x) => {
    const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
    const byDateWithLabels: Record<string, Array<{ id: string; label: unknown; value: number }>> = {};
    for (const [date, dist] of Object.entries(teamupDistByDate)) {
      const total = dist.reduce((a, d) => a + d.value, 0);
      byDateWithLabels[date] = (buckets.length ? buckets : dist).map((b) => ({
        id: b.id,
        label: "label" in b ? b.label : { vi: b.id, en: b.id },
        value: total > 0 ? Math.round(((dist.find((d) => d.id === b.id)?.value ?? 0) / total) * 1000) / 10 : 0,
      }));
    }
    return attachDistributionByDate(x, byDateWithLabels, latest);
  });
  m = patchMetricById(m, "punishment_threshold", (x) => attachDistributionByDate(x, thresholdByDate, latest));
  m = patchMetricById(m, "penalty", (x) => {
    const buckets = ((x.distribution as { daily?: Array<{ id: string; label: unknown }> })?.daily ?? []);
    const byDateWithLabels: Record<string, Array<{ id: string; label: unknown; value: number }>> = {};
    for (const [date, dist] of Object.entries(penaltyByDate)) {
      byDateWithLabels[date] = buckets.map((b) => ({
        id: b.id, label: b.label, value: dist.find((d) => d.id === b.id)?.value ?? 0,
      }));
    }
    return attachDistributionByDate(x, byDateWithLabels, latest);
  });
  return m;
}
