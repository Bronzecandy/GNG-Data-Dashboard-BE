export const PERMISSION_KEYS = [
  "tab.new_user_retention",
  "tab.new_device_retention",
  "tab.active_user",
  "tab.active_online_time",
  "tab.revival",
  "tab.churn",
  "tab.newbie_stats",
  "tab.mode_matchmaking",
  "tab.performance",
  "tab.hack_cheat",
  "tab.hero_balance",
  "tab.create_report",
  "tab.report_bug",
  "tab.economy",
  "tab.google_review",
  "tab.others",
  "tab.season_settings",
  "admin",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type UserStatus = "PENDING" | "ACTIVE";

export const USER_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "USER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type PermissionMap = Record<PermissionKey, boolean>;

export interface AuthUserDto {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  role: UserRole;
  isPanelAdmin: boolean;
  permissions: PermissionMap;
}

export interface AdminUserDto extends AuthUserDto {
  createdAt: string;
}

export const TAB_IDS = [
  "new-user-retention",
  "new-device-retention",
  "active-user",
  "active-online-time",
  "revival",
  "churn",
  "admin-permissions",
  "season-settings",
  "newbie-stats",
  "mode-matchmaking",
  "performance",
  "hack-cheat-teamup",
  "hero-balance",
  "create-report",
  "report-bug",
  "economy",
  "google-review",
  "others",
] as const;

export type TabId = (typeof TAB_IDS)[number];

const TAB_TO_PERMISSION: Record<TabId, PermissionKey> = {
  "new-user-retention": "tab.new_user_retention",
  "new-device-retention": "tab.new_device_retention",
  "active-user": "tab.active_user",
  "active-online-time": "tab.active_online_time",
  revival: "tab.revival",
  churn: "tab.churn",
  "admin-permissions": "admin",
  "season-settings": "tab.season_settings",
  "newbie-stats": "tab.newbie_stats",
  "mode-matchmaking": "tab.mode_matchmaking",
  performance: "tab.performance",
  "hack-cheat-teamup": "tab.hack_cheat",
  "hero-balance": "tab.hero_balance",
  "create-report": "tab.create_report",
  "report-bug": "tab.report_bug",
  economy: "tab.economy",
  "google-review": "tab.google_review",
  others: "tab.others",
};

export function tabIdToPermission(tabId: string): PermissionKey | null {
  if (tabId in TAB_TO_PERMISSION) {
    return TAB_TO_PERMISSION[tabId as TabId];
  }
  return null;
}

export function emptyPermissions(): PermissionMap {
  const map = {} as PermissionMap;
  for (const k of PERMISSION_KEYS) map[k] = false;
  return map;
}

export function fullPermissions(): PermissionMap {
  const map = emptyPermissions();
  for (const k of PERMISSION_KEYS) map[k] = true;
  return map;
}
