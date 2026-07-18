import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../../utils/prisma";
import type { LocalizedLabel, TabData } from "../tabs.service";
import { getMetricsForTab } from "../bean/queries";
import { deviceTier, serverFromGsIp } from "../bean/mappings";
import { addDays, formatDateOnly } from "../../utils/dates";

export interface FactRow {
  dt: Date;
  dims: Record<string, unknown>;
  measures: Record<string, unknown>;
}

export function label(vi: string, en: string): LocalizedLabel {
  return { vi, en };
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function matchesIpRegion(dims: Record<string, unknown>, ipRegion: string): boolean {
  const rip = String(dims.ip_region ?? "ALL");
  return rip === ipRegion || rip === "ALL" || dims.scope === "global";
}

function addMeasures(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = num(target[key]) + num(value);
  }
}

/** perf.session_stats has ~500k+ raw rows; fold device_model/server rows in batches to keep the API responsive. */
async function loadPerfFactsAggregated(ipRegion = "VN"): Promise<FactRow[]> {
  const metricId = "perf.session_stats";
  const bounds = await prisma.beanDailyFact.aggregate({
    where: { metricId },
    _min: { dt: true },
    _max: { dt: true },
  });
  if (!bounds._min.dt || !bounds._max.dt) return [];

  const buckets = new Map<string, FactRow>();
  const batchDays = 45;
  let cursor = bounds._min.dt;

  while (cursor <= bounds._max.dt) {
    const batchEnd = addDays(cursor, batchDays - 1);
    const end = batchEnd > bounds._max.dt ? bounds._max.dt : batchEnd;

    const rows = await prisma.beanDailyFact.findMany({
      where: { metricId, dt: { gte: cursor, lte: end } },
      select: { dt: true, dims: true, measures: true },
      orderBy: { dt: "asc" },
    });

    for (const row of rows) {
      const dims = row.dims as Record<string, unknown>;
      if (isEmptyPlaceholder(dims)) continue;
      if (!matchesIpRegion(dims, ipRegion)) continue;

      const kind = String(dims.kind ?? "");
      let aggDims: Record<string, unknown>;
      if (kind === "device") {
        aggDims = { kind: "device", sub_key: deviceTier(String(dims.sub_key ?? "unknown")) };
      } else if (kind === "server") {
        aggDims = { kind: "server", server_key: serverFromGsIp(String(dims.server_key ?? "")) };
      } else {
        aggDims = dims;
      }

      const key = `${formatDateOnly(row.dt)}|${kind}|${JSON.stringify(aggDims)}`;
      const existing = buckets.get(key);
      if (existing) {
        addMeasures(existing.measures, row.measures as Record<string, unknown>);
      } else {
        buckets.set(key, {
          dt: row.dt,
          dims: aggDims,
          measures: { ...(row.measures as Record<string, unknown>) },
        });
      }
    }

    cursor = addDays(end, 1);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return [...buckets.values()].sort((a, b) => a.dt.getTime() - b.dt.getTime());
}

function isEmptyPlaceholder(dims: Record<string, unknown>): boolean {
  return dims.empty === true;
}

export async function loadFacts(tabId: string, ipRegion = "VN"): Promise<FactRow[]> {
  const metrics = getMetricsForTab(tabId);
  if (metrics.length === 0) return [];
  if (tabId === "performance") {
    return loadPerfFactsAggregated(ipRegion);
  }

  const metricIds = metrics.map((m) => m.metricId);
  return loadFactsByMetricIds(metricIds, ipRegion);
}

export async function loadFactsByMetricIds(metricIds: string[], ipRegion = "VN"): Promise<FactRow[]> {
  if (metricIds.length === 0) return [];
  const rows = await prisma.beanDailyFact.findMany({
    where: { metricId: { in: metricIds } },
    select: { dt: true, dims: true, measures: true },
    orderBy: { dt: "asc" },
  });
  return rows
    .filter((r) => {
      const dims = r.dims as Record<string, unknown>;
      return !isEmptyPlaceholder(dims) && matchesIpRegion(dims, ipRegion);
    })
    .map((r) => ({
      dt: r.dt,
      dims: r.dims as Record<string, unknown>,
      measures: r.measures as Record<string, unknown>,
    }));
}

export function dateRangeFromFacts(facts: FactRow[]): { start: string; end: string } {
  if (facts.length === 0) {
    return { start: "2025-01-02", end: formatDateOnly(new Date()) };
  }
  return {
    start: formatDateOnly(facts[0]!.dt),
    end: formatDateOnly(facts[facts.length - 1]!.dt),
  };
}

function seedDataPath(tabId: string): string {
  const fromEnv = process.env.FE_PUBLIC_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv, `${tabId}.json`);
  return path.resolve(process.cwd(), "seed-data", `${tabId}.json`);
}

export async function loadSeedTemplate(tabId: string): Promise<TabData | null> {
  try {
    const raw = await readFile(seedDataPath(tabId), "utf-8");
    return JSON.parse(raw) as TabData;
  } catch {
    return null;
  }
}

export type SeriesPoint = { date: string; value: number };

export function factPlatform(platform: string) {
  return (f: FactRow) => String(f.dims.platform ?? "all") === platform;
}

/** True when ios/android facts exist with non-zero values for a key measure. */
export function platformBreakdownAvailable(facts: FactRow[], measureKey: string): boolean {
  return facts.some((f) => {
    const p = String(f.dims.platform ?? "");
    if (p !== "ios" && p !== "android") return false;
    return num(f.measures[measureKey]) > 0;
  });
}

export function seriesFromMeasure(
  facts: FactRow[],
  specs: Array<{ id: string; key: string; label: LocalizedLabel; filter?: (f: FactRow) => boolean }>,
): Array<{ id: string; label: LocalizedLabel; data: { daily: SeriesPoint[] } }> {
  return specs.map((spec) => {
    const points: SeriesPoint[] = [];
    const byDate = new Map<string, number>();
    for (const f of facts) {
      if (spec.filter && !spec.filter(f)) continue;
      const iso = formatDateOnly(f.dt);
      byDate.set(iso, num(f.measures[spec.key]));
    }
    for (const [date, value] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      points.push({ date, value });
    }
    return { id: spec.id, label: spec.label, data: { daily: points } };
  });
}

export function dailyTrend(
  facts: FactRow[],
  valueFn: (dayFacts: FactRow[]) => number,
  filter?: (f: FactRow) => boolean,
): SeriesPoint[] {
  const byDate = new Map<string, FactRow[]>();
  for (const f of facts) {
    if (filter && !filter(f)) continue;
    const iso = formatDateOnly(f.dt);
    const arr = byDate.get(iso) ?? [];
    arr.push(f);
    byDate.set(iso, arr);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayFacts]) => ({ date, value: valueFn(dayFacts) }));
}

export function mergeTemplateMetrics(
  template: TabData | null,
  tabId: string,
  tabLabel: LocalizedLabel,
  dateRange: { start: string; end: string },
  metrics: TabData["metrics"],
  tabFilters?: string[],
): TabData {
  return {
    id: tabId,
    label: template?.label ?? tabLabel,
    dateRange,
    tabFilters: tabFilters ?? template?.tabFilters,
    integrationReady: true,
    metrics,
  };
}
