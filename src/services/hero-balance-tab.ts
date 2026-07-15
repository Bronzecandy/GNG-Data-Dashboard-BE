import { prisma } from "../utils/prisma";
import { formatDateOnly } from "../utils/dates";
import {
  GT_DIAMOND_TIERS,
  HERO_CLASS_NAMES,
  HERO_MASTERY_NAMES,
  RANK_TIERS,
  normalizeHeroIds,
} from "./bean/mappings";
import type { TabData } from "./tabs.service";

function label(vi: string, en: string) {
  return { vi, en };
}

export interface HeroBalanceRowDto {
  dt: string;
  season_id: number;
  mode: string;
  rank_tier: string;
  rank_tier_order: number;
  class_id: number;
  mastery_id: number;
  games: number;
  sum_damage: number;
  sum_healing: number;
  sum_kill: number;
  sum_assist: number;
}

export interface HeroBalancePayload {
  classNames: Record<string, string>;
  masteryNames: Record<string, string>;
  rankTiers: Array<{ id: string; order: number; label: string; gtDiamond: boolean }>;
  gtDiamondTiers: string[];
  rows: HeroBalanceRowDto[];
}

export async function loadHeroBalanceRows(): Promise<HeroBalanceRowDto[]> {
  const rows = await prisma.beanDailyFact.findMany({
    where: { metricId: "hero.balance" },
    orderBy: { dt: "asc" },
  });

  return rows
    .filter((r) => !((r.dims as Record<string, unknown>).empty === true))
    .map((r) => {
      const dims = r.dims as Record<string, unknown>;
      const measures = r.measures as Record<string, unknown>;
      const ids = normalizeHeroIds(Number(dims.class_id ?? 0), Number(dims.mastery_id ?? 0));
      return {
        dt: formatDateOnly(r.dt),
        season_id: Number(dims.season_id ?? 0),
        mode: String(dims.mode ?? "all"),
        rank_tier: String(dims.rank_tier ?? "other"),
        rank_tier_order: Number(dims.rank_tier_order ?? 99),
        class_id: ids.class_id,
        mastery_id: ids.mastery_id,
        games: Number(measures.games ?? 0),
        sum_damage: Number(measures.sum_damage ?? 0),
        sum_healing: Number(measures.sum_healing ?? 0),
        sum_kill: Number(measures.sum_kill ?? 0),
        sum_assist: Number(measures.sum_assist ?? 0),
      };
    });
}

export function buildHeroBalancePayload(rows: HeroBalanceRowDto[]): HeroBalancePayload {
  const classNames: Record<string, string> = {};
  for (const [id, name] of Object.entries(HERO_CLASS_NAMES)) {
    classNames[id] = name;
  }
  const masteryNames: Record<string, string> = {};
  for (const [id, name] of Object.entries(HERO_MASTERY_NAMES)) {
    masteryNames[id] = name;
  }

  return {
    classNames,
    masteryNames,
    rankTiers: RANK_TIERS.map((t) => ({
      id: t.id,
      order: t.order,
      label: t.label,
      gtDiamond: t.gtDiamond,
    })),
    gtDiamondTiers: [...GT_DIAMOND_TIERS],
    rows,
  };
}

function dateRangeFromRows(rows: HeroBalanceRowDto[]): { start: string; end: string } {
  if (rows.length === 0) return { start: "2025-12-01", end: formatDateOnly(new Date()) };
  return { start: rows[0]!.dt, end: rows[rows.length - 1]!.dt };
}

export async function buildHeroBalanceTabFromRows(rows: HeroBalanceRowDto[]): Promise<TabData> {
  const heroBalance = buildHeroBalancePayload(rows);
  return {
    id: "hero-balance",
    label: label("Hero Balance", "Hero Balance"),
    dateRange: dateRangeFromRows(rows),
    integrationReady: true,
    tabFilters: ["rank", "mode"],
    heroBalance,
    metrics: [],
  };
}
