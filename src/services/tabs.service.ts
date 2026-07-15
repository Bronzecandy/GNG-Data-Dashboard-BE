import { readFile } from "fs/promises";
import path from "path";
import NodeCache from "node-cache";
import { prisma } from "../utils/prisma";
import type { TabId } from "../types/auth";
import { TAB_IDS } from "../types/auth";
import { getMetricsForTab } from "./bean/queries";
import { buildRealTabData, isRealDataTab } from "./tab-builders";
import { buildHeroBalancePayload, buildHeroBalanceTabFromRows, loadHeroBalanceRows } from "./hero-balance-tab";
import { formatDateOnly, yesterdayUtc } from "../utils/dates";

function defaultHistoryEnd(): string {
  return process.env.HISTORY_END_DATE?.trim() || formatDateOnly(yesterdayUtc());
}

function defaultHistoryStart(): string {
  return process.env.HISTORY_START_DATE?.trim() || "2025-01-02";
}

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export interface LocalizedLabel {
  vi: string;
  en: string;
}

export interface TabData {
  id: string;
  label: LocalizedLabel;
  dateRange: { start: string; end: string };
  metrics: unknown[];
  tabFilters?: string[];
  integrationReady?: boolean;
  heroBalance?: import("./hero-balance-tab").HeroBalancePayload;
}

const TAB_LABELS: Record<string, LocalizedLabel> = {
  "new-user-retention": { vi: "Retention Summary", en: "Retention Summary" },
  "new-device-retention": { vi: "New Device Retention", en: "New Device Retention" },
  "active-user": { vi: "Active User", en: "Active User" },
  "active-online-time": { vi: "Active Online Time", en: "Active Online Time" },
  revival: { vi: "Revival", en: "Revival" },
  churn: { vi: "Churn", en: "Churn" },
  "admin-permissions": { vi: "Phân quyền", en: "Permissions" },
  "season-settings": { vi: "Cài đặt mùa", en: "Season Settings" },
  "player-stats": { vi: "Key Stats", en: "Key Stats" },
  "newbie-stats": { vi: "Người mới", en: "Newbie" },
  "mode-matchmaking": { vi: "Mode & Matchmaking", en: "Mode & Matchmaking" },
  performance: { vi: "Hiệu năng", en: "Performance" },
  "hack-cheat-teamup": { vi: "Hack / Cheat / Teamup", en: "Hack / Cheat / Teamup" },
  "hero-balance": { vi: "Hero Balance", en: "Hero Balance" },
  "report-bug": { vi: "Report Bug", en: "Report Bug" },
  economy: { vi: "Kinh tế", en: "Economy" },
  "google-review": { vi: "Google Review", en: "Google Review" },
  others: { vi: "Khác", en: "Others" },
};

function seedDataPath(tabId: string): string {
  const fromEnv = process.env.FE_PUBLIC_DATA_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv, `${tabId}.json`);
  }
  return path.resolve(process.cwd(), "seed-data", `${tabId}.json`);
}

async function loadSeedFallback(tabId: string): Promise<TabData> {
  const filePath = seedDataPath(tabId);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as TabData;
  } catch {
    return {
      id: tabId,
      label: TAB_LABELS[tabId] ?? { vi: tabId, en: tabId },
      dateRange: { start: defaultHistoryStart(), end: defaultHistoryEnd() },
      metrics: [],
    };
  }
}

async function hasFactsForTab(tabId: string): Promise<boolean> {
  const metrics = getMetricsForTab(tabId);
  if (metrics.length === 0) return false;

  const fact = await prisma.beanDailyFact.findFirst({
    where: { metricId: { in: metrics.map((m) => m.metricId) } },
    select: { id: true },
  });
  return fact !== null;
}

export async function getTabData(tabId: string, ipRegion = "VN"): Promise<TabData> {
  const cacheKey = `tab:${tabId}:${ipRegion}`;
  const cached = cache.get<TabData>(cacheKey);
  if (cached) return cached;

  if (tabId === "admin-permissions" || tabId === "season-settings") {
    const empty: TabData = {
      id: tabId,
      label: TAB_LABELS[tabId]!,
      dateRange: { start: defaultHistoryStart(), end: defaultHistoryEnd() },
      metrics: [],
      integrationReady: true,
    };
    cache.set(cacheKey, empty);
    return empty;
  }

  if (tabId === "hero-balance") {
    const hasFacts = await hasFactsForTab(tabId);
    if (hasFacts) {
      const rows = await loadHeroBalanceRows();
      const built = await buildHeroBalanceTabFromRows(rows);
      cache.set(cacheKey, built);
      return built;
    }
    const empty: TabData = {
      id: tabId,
      label: TAB_LABELS[tabId]!,
      dateRange: { start: defaultHistoryStart(), end: defaultHistoryEnd() },
      metrics: [],
      tabFilters: ["rank", "mode"],
      integrationReady: true,
    };
    cache.set(cacheKey, empty);
    return empty;
  }

  if (isRealDataTab(tabId)) {
    const hasFacts = await hasFactsForTab(tabId);
    if (hasFacts) {
      const built = await buildRealTabData(tabId, ipRegion);
      if (built) {
        cache.set(cacheKey, built);
        return built;
      }
    }
    const empty: TabData = {
      id: tabId,
      label: TAB_LABELS[tabId] ?? { vi: tabId, en: tabId },
      dateRange: { start: defaultHistoryStart(), end: defaultHistoryEnd() },
      metrics: [],
    };
    cache.set(cacheKey, empty);
    return empty;
  }

  const seed = await loadSeedFallback(tabId);
  cache.set(cacheKey, seed);
  return seed;
}

export function listTabIds(): TabId[] {
  return [...TAB_IDS];
}

export function clearTabCache(): void {
  cache.flushAll();
}
