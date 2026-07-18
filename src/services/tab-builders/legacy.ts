import type { TabData } from "../tabs.service";
import {
  dateRangeFromFacts,
  factPlatform,
  label,
  loadFacts,
  loadFactsByMetricIds,
  platformBreakdownAvailable,
  seriesFromMeasure,
} from "./core";
import { kpiFromPoints } from "./template-utils";

function attachKpi<T extends { series?: Array<{ data?: { daily?: Array<{ date: string; value: number }> } }> }>(
  metric: T,
  seriesIndex = 0,
): T {
  const pts = metric.series?.[seriesIndex]?.data?.daily ?? [];
  if (!pts.length) return metric;
  return { ...metric, kpi: kpiFromPoints(pts) };
}

async function dauOverviewSeries(ipRegion: string) {
  const active = await loadFactsByMetricIds(["active.active_user"], ipRegion);
  return seriesFromMeasure(active, [
    { id: "dau", key: "dau", label: label("DAU (VN)", "DAU (VN)"), filter: factPlatform("all") },
  ]);
}

function contextDauMetric(dauSeries: ReturnType<typeof seriesFromMeasure>) {
  const pts = dauSeries[0]?.data.daily ?? [];
  return {
    id: "context_dau",
    group: label("Tổng quan", "Overview"),
    label: label("DAU (VN)", "DAU (VN)"),
    description: label("Daily active users — shared context", "Daily active users — shared context"),
    chartType: "trend" as const,
    valueType: "absolute" as const,
    series: dauSeries,
    kpi: kpiFromPoints(pts),
  };
}

export async function buildNewUserRetentionTab(ipRegion = "VN"): Promise<TabData> {
  const facts = await loadFacts("new-user-retention", ipRegion);
  const rateCols = [
    { id: "r2", key: "r2", label: label("R2", "R2") },
    { id: "r3", key: "r3", label: label("R3", "R3") },
    { id: "r7", key: "r7", label: label("R7", "R7") },
    { id: "r14", key: "r14", label: label("R14", "R14") },
    { id: "r30", key: "r30", label: label("R30", "R30") },
  ];
  const retentionAll = seriesFromMeasure(
    facts,
    rateCols.map((c) => ({ ...c, filter: factPlatform("all") })),
  );
  const retentionIos = seriesFromMeasure(
    facts,
    rateCols.map((c) => ({ ...c, id: `${c.id}_ios`, filter: factPlatform("ios") })),
  );
  const retentionAndroid = seriesFromMeasure(
    facts,
    rateCols.map((c) => ({ ...c, id: `${c.id}_android`, filter: factPlatform("android") })),
  );
  const newUserAll = seriesFromMeasure(facts, [
    { id: "new_user", key: "new_user", label: label("New User", "New User"), filter: factPlatform("all") },
  ]);
  const newUserIos = seriesFromMeasure(facts, [
    { id: "new_user_ios", key: "new_user", label: label("New User iOS", "New User iOS"), filter: factPlatform("ios") },
  ]);
  const newUserAndroid = seriesFromMeasure(facts, [
    {
      id: "new_user_android",
      key: "new_user",
      label: label("New User Android", "New User Android"),
      filter: factPlatform("android"),
    },
  ]);
  return {
    id: "new-user-retention",
    label: label("Retention Summary", "Retention Summary"),
    dateRange: dateRangeFromFacts(facts),
    integrationReady: true,
    tabFilters: ["platform"],
    platformBreakdownAvailable: platformBreakdownAvailable(facts, "new_user"),
    metrics: [
      attachKpi({
        id: "new_user_retention_table",
        group: label("New User", "New User"),
        label: label("New User Retention", "New User Retention"),
        description: label("Retention R2-R30 by cohort date", "Retention R2-R30 by cohort date"),
        chartType: "trend",
        valueType: "percentage",
        series: [...retentionAll, ...retentionIos, ...retentionAndroid],
      }),
      attachKpi({
        id: "new_user_count",
        group: label("Volume", "Volume"),
        label: label("New Users", "New Users"),
        description: label("Daily new register count", "Daily new register count"),
        chartType: "trend",
        valueType: "absolute",
        series: [...newUserAll, ...newUserIos, ...newUserAndroid],
      }),
      {
        id: "new_user_ios_kpi",
        hideChart: true,
        group: label("Volume", "Volume"),
        label: label("New Users iOS", "New Users iOS"),
        description: label("Daily new users on iOS", "Daily new users on iOS"),
        chartType: "trend",
        valueType: "absolute",
        series: newUserIos,
        kpi: kpiFromPoints(newUserIos[0]?.data.daily ?? []),
      },
      {
        id: "new_user_android_kpi",
        hideChart: true,
        group: label("Volume", "Volume"),
        label: label("New Users Android", "New Users Android"),
        description: label("Daily new users on Android", "Daily new users on Android"),
        chartType: "trend",
        valueType: "absolute",
        series: newUserAndroid,
        kpi: kpiFromPoints(newUserAndroid[0]?.data.daily ?? []),
      },
    ],
  };
}

export async function buildNewDeviceRetentionTab(ipRegion = "VN"): Promise<TabData> {
  const facts = await loadFacts("new-device-retention", ipRegion);
  return {
    id: "new-device-retention",
    label: label("New Device Retention", "New Device Retention"),
    dateRange: dateRangeFromFacts(facts),
    integrationReady: true,
    metrics: [
      attachKpi({
        id: "device_retention_rates",
        group: label("Retention", "Retention"),
        label: label("Device Retention Rates", "Device Retention Rates"),
        description: label("R2-R30 device retention", "R2-R30 device retention"),
        chartType: "trend",
        valueType: "percentage",
        series: seriesFromMeasure(facts, [
          { id: "r2", key: "r2", label: label("R2", "R2") },
          { id: "r7", key: "r7", label: label("R7", "R7") },
          { id: "r14", key: "r14", label: label("R14", "R14") },
          { id: "r30", key: "r30", label: label("R30", "R30") },
        ]),
      }),
      attachKpi({
        id: "new_device_count",
        group: label("Volume", "Volume"),
        label: label("New Devices", "New Devices"),
        description: label("Daily new device count", "Daily new device count"),
        chartType: "trend",
        valueType: "absolute",
        series: seriesFromMeasure(facts, [
          { id: "new_device", key: "new_device", label: label("New Device", "New Device") },
        ]),
      }),
    ],
  };
}

export async function buildActiveUserTab(ipRegion = "VN"): Promise<TabData> {
  const facts = await loadFacts("active-user", ipRegion);
  const dauAll = seriesFromMeasure(facts, [
    { id: "dau", key: "dau", label: label("DAU", "DAU"), filter: factPlatform("all") },
  ]);
  const dauIos = seriesFromMeasure(facts, [
    { id: "dau_ios", key: "dau", label: label("DAU iOS", "DAU iOS"), filter: factPlatform("ios") },
  ]);
  const dauAndroid = seriesFromMeasure(facts, [
    { id: "dau_android", key: "dau", label: label("DAU Android", "DAU Android"), filter: factPlatform("android") },
  ]);
  const rollCols = [
    { id: "a2", key: "a2", label: label("A2", "A2") },
    { id: "a7", key: "a7", label: label("A7", "A7") },
    { id: "a14", key: "a14", label: label("A14", "A14") },
    { id: "a30", key: "a30", label: label("A30", "A30") },
  ];
  const arCols = [
    { id: "ar2", key: "ar2", label: label("Ar2", "Ar2") },
    { id: "ar7", key: "ar7", label: label("Ar7", "Ar7") },
    { id: "ar14", key: "ar14", label: label("Ar14", "Ar14") },
    { id: "ar30", key: "ar30", label: label("Ar30", "Ar30") },
  ];
  const rollingSeries = (platform: string) =>
    seriesFromMeasure(
      facts,
      rollCols.map((c) => ({
        ...c,
        id: platform === "all" ? c.id : `${c.id}_${platform}`,
        filter: factPlatform(platform),
      })),
    );
  const arSeries = (platform: string) =>
    seriesFromMeasure(
      facts,
      arCols.map((c) => ({
        ...c,
        id: platform === "all" ? c.id : `${c.id}_${platform}`,
        filter: factPlatform(platform),
      })),
    );
  return {
    id: "active-user",
    label: label("Active User", "Active User"),
    dateRange: dateRangeFromFacts(facts),
    integrationReady: true,
    tabFilters: ["platform"],
    platformBreakdownAvailable: platformBreakdownAvailable(facts, "dau"),
    metrics: [
      attachKpi({
        id: "dau_trend",
        group: label("DAU", "DAU"),
        label: label("DAU", "DAU"),
        description: label("Daily active users", "Daily active users"),
        chartType: "trend",
        valueType: "absolute",
        series: [...dauAll, ...dauIos, ...dauAndroid],
      }),
      {
        id: "dau_ios_kpi",
        hideChart: true,
        group: label("DAU", "DAU"),
        label: label("DAU iOS", "DAU iOS"),
        description: label("Daily active users on iOS", "Daily active users on iOS"),
        chartType: "trend",
        valueType: "absolute",
        series: dauIos,
        kpi: kpiFromPoints(dauIos[0]?.data.daily ?? []),
      },
      {
        id: "dau_android_kpi",
        hideChart: true,
        group: label("DAU", "DAU"),
        label: label("DAU Android", "DAU Android"),
        description: label("Daily active users on Android", "Daily active users on Android"),
        chartType: "trend",
        valueType: "absolute",
        series: dauAndroid,
        kpi: kpiFromPoints(dauAndroid[0]?.data.daily ?? []),
      },
      {
        id: "rolling_active",
        group: label("Rolling Active", "Rolling Active"),
        label: label("A2-A30", "A2-A30"),
        description: label("Rolling active users", "Rolling active users"),
        chartType: "trend",
        valueType: "absolute",
        series: [...rollingSeries("all"), ...rollingSeries("ios"), ...rollingSeries("android")],
      },
      {
        id: "active_retention_rates",
        group: label("Retention", "Retention"),
        label: label("Ar2-Ar30", "Ar2-Ar30"),
        description: label("Active user retention rates", "Active user retention rates"),
        chartType: "trend",
        valueType: "percentage",
        series: [...arSeries("all"), ...arSeries("ios"), ...arSeries("android")],
      },
    ],
  };
}

export async function buildActiveOnlineTimeTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, dauSeries] = await Promise.all([loadFacts("active-online-time", ipRegion), dauOverviewSeries(ipRegion)]);
  return {
    id: "active-online-time",
    label: label("Active Online Time", "Active Online Time"),
    dateRange: dateRangeFromFacts(facts),
    integrationReady: true,
    metrics: [
      contextDauMetric(dauSeries),
      {
        id: "online_time_metrics",
        group: label("Time", "Time"),
        label: label("Avg Online Time", "Avg Online Time"),
        description: label("Lobby and survival time (minutes)", "Lobby and survival time (minutes)"),
        chartType: "trend",
        valueType: "absolute",
        series: seriesFromMeasure(facts, [
          { id: "avg_lobby_time", key: "avg_lobby_time", label: label("Avg Lobby Time", "Avg Lobby Time") },
          { id: "avg_survival_time", key: "avg_survival_time", label: label("Avg Survival Time", "Avg Survival Time") },
        ]),
      },
      {
        id: "match_counts",
        group: label("Matches", "Matches"),
        label: label("Match Counts", "Match Counts"),
        description: label("Avg matches per user", "Avg matches per user"),
        chartType: "trend",
        valueType: "absolute",
        series: seriesFromMeasure(facts, [
          { id: "avg_rank_match", key: "avg_rank_match", label: label("Avg Rank Match", "Avg Rank Match") },
          { id: "avg_casual_match", key: "avg_casual_match", label: label("Avg Casual Match", "Avg Casual Match") },
          {
            id: "game_partition_users",
            key: "game_partition_users",
            label: label("Game Partition Users", "Game Partition Users"),
          },
        ]),
      },
    ],
  };
}

export async function buildRevivalTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, dauSeries] = await Promise.all([loadFacts("revival", ipRegion), dauOverviewSeries(ipRegion)]);
  const revivalSeries = seriesFromMeasure(facts, [
    { id: "revival7", key: "revival7", label: label("Revival7", "Revival7") },
    { id: "revival14", key: "revival14", label: label("Revival14", "Revival14") },
    { id: "revival30", key: "revival30", label: label("Revival30", "Revival30") },
  ]);
  return {
    id: "revival",
    label: label("Revival", "Revival"),
    dateRange: dateRangeFromFacts(facts),
    integrationReady: true,
    metrics: [
      contextDauMetric(dauSeries),
      attachKpi({
        id: "revival_counts",
        group: label("Revival", "Revival"),
        label: label("Revival Counts", "Revival Counts"),
        description: label("Revival user counts", "Revival user counts"),
        chartType: "trend",
        valueType: "absolute",
        series: revivalSeries,
      }),
      {
        id: "revival_rates",
        group: label("Rates", "Rates"),
        label: label("Revival Rates", "Revival Rates"),
        description: label("Revival rates %", "Revival rates %"),
        chartType: "trend",
        valueType: "percentage",
        series: seriesFromMeasure(facts, [
          { id: "revival7_rate", key: "revival7_rate", label: label("Revival7 Rate", "Revival7 Rate") },
          { id: "revival14_rate", key: "revival14_rate", label: label("Revival14 Rate", "Revival14 Rate") },
          { id: "revival30_rate", key: "revival30_rate", label: label("Revival30 Rate", "Revival30 Rate") },
        ]),
      },
    ],
  };
}

/** Churn counts only — rates paused until GNG confirms formula. */
export async function buildChurnTab(ipRegion = "VN"): Promise<TabData> {
  const [facts, dauSeries] = await Promise.all([loadFacts("churn", ipRegion), dauOverviewSeries(ipRegion)]);
  return {
    id: "churn",
    label: label("Churn", "Churn"),
    dateRange: dateRangeFromFacts(facts),
    integrationReady: true,
    metrics: [
      contextDauMetric(dauSeries),
      attachKpi({
        id: "churn_counts",
        group: label("Churn", "Churn"),
        label: label("Churn Counts", "Churn Counts"),
        description: label(
          "Churn bucket counts from dws_user_active_account_d_s",
          "Churn bucket counts from dws_user_active_account_d_s",
        ),
        chartType: "trend",
        valueType: "absolute",
        series: seriesFromMeasure(facts, [
          { id: "account_total", key: "account_total", label: label("Total Accounts", "Total Accounts") },
          { id: "c2", key: "c2", label: label("C2", "C2") },
          { id: "c3", key: "c3", label: label("C3", "C3") },
          { id: "c4", key: "c4", label: label("C4", "C4") },
          { id: "c5", key: "c5", label: label("C5", "C5") },
          { id: "c6", key: "c6", label: label("C6", "C6") },
          { id: "c7", key: "c7", label: label("C7", "C7") },
          { id: "c14", key: "c14", label: label("C14", "C14") },
          { id: "c30", key: "c30", label: label("C30", "C30") },
        ]),
      }, 1),
    ],
  };
}
