/**
 * ID -> display name lookups and terminology for GNG dashboard metrics.
 *
 * See docs/bean/gng-data-catalog.md for official level_id → product mode map.
 */

/** Canonical FE series ids for mode-split charts (product modes + other). */
export const FE_MODE_IDS = [
  "lk_normal",
  "lk_challenge_solo",
  "lk_challenge_team",
  "lk_hell",
  "dcp_challenge",
  "arena",
  "pve",
  "other",
] as const;

export type FeModeId = (typeof FE_MODE_IDS)[number];

/**
 * gng_ob.gamematchmaking.level_id — mode / level pool id.
 * Product mode names from game team (level_id only; group_mode ignored for buckets).
 */
export const LEVEL_ID: Record<string, string> = {
  "0": "Lobby / None",
  "20401": "LK Normal",
  "20402": "LK Challenge Team",
  "20403": "Mode 20403",
  "20404": "LK Challenge Solo",
  "20405": "LK Hell",
  "20412": "LK Challenge Team",
  "20414": "LK Challenge Solo",
  "20415": "LK Hell",
  "30105": "PvE",
  "30106": "PvE",
  "30107": "PvE",
  "40101": "Mode 40101",
  "40102": "DCP Challenge",
  "50301": "Arena Mode",
  "99901": "Special 99901",
  "99902": "Special 99902",
  "99903": "Special 99903",
  "99904": "Special 99904",
};

/** gng_ob.gamematchmaking.group_mode — queue/group mode (1 vs 3; solo/team TBD). */
export const GROUP_MODE: Record<string, string> = {
  "1": "Group Mode 1",
  "3": "Group Mode 3",
};

/** warm_match_type: 0 = real PvP match, 1 = warm-up (bot) match. */
export const WARM_MATCH_TYPE: Record<string, string> = {
  "0": "Real match",
  "1": "Warm-up",
};

/** Server region (region column). Data is VN players on the SG server. */
export const REGION: Record<string, string> = {
  SG: "Singapore",
  ID: "Indonesia",
  VN: "Vietnam",
};

/** Network type (login.network). */
export const NETWORK: Record<string, string> = {
  ReachableViaLocalAreaNetwork: "Wi-Fi",
  ReachableViaCarrierDataNetwork: "Mobile data",
};

export const TERMINOLOGY = {
  newbie: "Player whose first login is within the analysis range",
  oldbie: "Player who logged in before the range and is active within it",
  botMatch: "Match where is_timeout != 0 (any participant)",
  warmMatch: "warm_match_type != 0 — warm-up / bot match before real PvP",
  fpsThreshold: "FPS below 28 considered poor performance",
  lk: "LK Challenge — limited-time competitive mode",
  dcp: "DCP — daily challenge progression",
} as const;

export function lookup(map: Record<string, string>, id: string | number): string {
  return map[String(id)] ?? String(id);
}

/** Map level_id → FE product mode id (ignores group_mode). */
export function feModeIdFromLevel(levelId: string | number): FeModeId {
  const lid = String(levelId);
  if (lid === "20401") return "lk_normal";
  if (lid === "20414" || lid === "20404") return "lk_challenge_solo";
  if (lid === "20402" || lid === "20412") return "lk_challenge_team";
  if (lid === "20415" || lid === "20405") return "lk_hell";
  if (lid === "40102") return "dcp_challenge";
  if (lid === "50301") return "arena";
  if (lid === "30105" || lid === "30106" || lid === "30107") return "pve";
  return "other";
}

/** @deprecated group_mode ignored — use feModeIdFromLevel */
export function feModeId(levelId: string | number, _groupMode?: string | number): FeModeId {
  return feModeIdFromLevel(levelId);
}

const DEVICE_TIER_RULES: Array<{ tier: string; patterns: string[] }> = [
  { tier: "ultra", patterns: ["SM-S9", "SM-G9", "iPhone 1", "ROG", "Red Magic"] },
  { tier: "high", patterns: ["SM-A5", "SM-A7", "Pixel", "OnePlus", "POCO F"] },
  { tier: "mid", patterns: ["SM-A3", "Redmi", "OPPO", "vivo", "Realme", "Honor"] },
  { tier: "low", patterns: ["SM-J", "Galaxy J", "A03", "A04", "A05", "Y0"] },
];

export function deviceTier(deviceModel: string): string {
  const m = deviceModel.toUpperCase();
  for (const rule of DEVICE_TIER_RULES) {
    if (rule.patterns.some((p) => m.includes(p.toUpperCase()))) return rule.tier;
  }
  return "mid";
}

const GS_IP_PREFIX_TO_SERVER: Array<{ prefix: string; server: string }> = [
  { prefix: "43.173", server: "sg" },
  { prefix: "162.128", server: "hk" },
  { prefix: "103.", server: "jp" },
  { prefix: "52.", server: "us_west" },
  { prefix: "18.", server: "eu" },
];

export function serverFromGsIp(gsIp: string): string {
  const ip = gsIp.split(":")[0] ?? gsIp;
  for (const { prefix, server } of GS_IP_PREFIX_TO_SERVER) {
    if (ip.startsWith(prefix)) return server;
  }
  return "sg";
}

export const DEATH_REASON_BUCKETS: Record<string, { vi: string; en: string }> = {
  player: { vi: "Bị player giết", en: "Killed by player" },
  ai: { vi: "Bị AI giết", en: "Killed by AI" },
  environment: { vi: "Môi trường", en: "Environment" },
  extraction_fail: { vi: "Không tẩu thoát", en: "Extraction failed" },
  disconnect: { vi: "Disconnect", en: "Disconnect" },
  other: { vi: "Khác", en: "Other" },
};

export function deathReasonBucket(code: string | number): string {
  const c = Number(code);
  if (c === 0) return "extraction_fail";
  if (c >= 1 && c <= 5) return "player";
  if (c >= 6 && c <= 10) return "ai";
  if (c >= 11 && c <= 15) return "environment";
  if (c >= 16) return "disconnect";
  return "other";
}

/** gng_ob.gamesummary.class_id */
export const HERO_CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Oracle",
  3: "Ranger",
  4: "Rogue",
  5: "Sage",
  6: "Wizard",
  7: "Plague Doctor",
  8: "Cursed Knight",
  9: "Samurai",
  10: "Boxer",
};

/** gng_ob.gamesummary.mastery_id — English product labels */
export const HERO_MASTERY_NAMES: Record<number, string> = {
  1001: "Swordsman",
  1002: "Shield Guard",
  2001: "Frost Verdict",
  2002: "Everwatch Snowfall",
  3001: "Windrunner",
  3002: "Falling Star",
  4001: "Shadow Assault",
  4002: "Stroll",
  5001: "Light Chaser",
  5002: "Protector",
  6001: "Blazing",
  6002: "Ice",
  7001: "Harmonious Hand",
  7002: "Night Raven",
  8001: "Drinking Sins",
  8002: "Rampage",
  9001: "Break Momentum",
  9002: "Swift Thunder",
  10001: "Flash Strike",
};

/** Fix swapped/legacy gamesummary ids: mastery often lands in class_id with mastery_id=0. */
export function normalizeHeroIds(
  classId: number,
  masteryId: number,
): { class_id: number; mastery_id: number } {
  if (masteryId > 0 && classId > 0 && classId < 100) {
    return { class_id: classId, mastery_id: masteryId };
  }
  if ((!masteryId || masteryId <= 0) && classId >= 1000) {
    return { class_id: Math.floor(classId / 1000), mastery_id: classId };
  }
  if (classId >= 1000 && masteryId > 0 && masteryId < 100) {
    return { class_id: masteryId, mastery_id: classId };
  }
  return { class_id: classId, mastery_id: masteryId };
}

export interface RankTierDef {
  id: string;
  order: number;
  label: string;
  gtDiamond: boolean;
}

/** cur_rank tier buckets (detailed: legend / glory / supreme_glory). */
export const RANK_TIERS: RankTierDef[] = [
  { id: "no_rank", order: 0, label: "No Rank", gtDiamond: false },
  { id: "iron", order: 1, label: "Iron", gtDiamond: false },
  { id: "bronze", order: 2, label: "Bronze", gtDiamond: false },
  { id: "silver", order: 3, label: "Silver", gtDiamond: false },
  { id: "gold", order: 4, label: "Gold", gtDiamond: false },
  { id: "platinum", order: 5, label: "Platinum", gtDiamond: false },
  { id: "diamond", order: 6, label: "Diamond", gtDiamond: false },
  { id: "legend", order: 7, label: "Legend", gtDiamond: true },
  { id: "glory", order: 8, label: "Glory", gtDiamond: true },
  { id: "supreme_glory", order: 9, label: "Supreme Glory", gtDiamond: true },
  { id: "other", order: 99, label: "Other", gtDiamond: false },
];

export const HERO_MODES = ["all", "solo", "squad"] as const;
export type HeroMode = (typeof HERO_MODES)[number];

export const GT_DIAMOND_TIERS = new Set(
  RANK_TIERS.filter((t) => t.gtDiamond).map((t) => t.id),
);

export function heroClassName(classId: number): string {
  return HERO_CLASS_NAMES[classId] ?? `Unknown(${classId})`;
}

export function heroMasteryName(masteryId: number): string {
  return HERO_MASTERY_NAMES[masteryId] ?? `Unknown(${masteryId})`;
}
