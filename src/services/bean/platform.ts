/** Normalize Bean system_platform values to ios | android | other. */
export const PLATFORM_IOS = "ios";
export const PLATFORM_ANDROID = "android";
export const PLATFORM_ALL = "all";

export function platformCaseSql(column: string): string {
  const c = `LOWER(TRIM(CAST(${column} AS string)))`;
  return `CASE
    WHEN ${c} IN ('ios', 'iphone', 'ipad', 'ipados', 'iphone os', 'apple') THEN '${PLATFORM_IOS}'
    WHEN ${c} IN ('android') THEN '${PLATFORM_ANDROID}'
    ELSE 'other'
  END`;
}

export function normalizePlatform(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase().trim();
  if (["ios", "iphone", "ipad", "ipados", "iphone os", "apple"].includes(v)) return PLATFORM_IOS;
  if (v === "android") return PLATFORM_ANDROID;
  return "other";
}
export function platformIosWhereSql(column: string): string {
  const c = `LOWER(TRIM(CAST(${column} AS string)))`;
  return `${c} IN ('ios', 'iphone', 'ipad', 'ipados', 'iphone os', 'apple')`;
}

export function platformAndroidWhereSql(column: string): string {
  const c = `LOWER(TRIM(CAST(${column} AS string)))`;
  return `${c} = 'android'`;
}