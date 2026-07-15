import type { AuthUserDto, PermissionKey, PermissionMap } from "../types/auth";
import { PERMISSION_KEYS, emptyPermissions } from "../types/auth";
import { isSuperAdmin } from "./user-roles";

export function permissionsFromRows(
  rows: Array<{ permissionKey: string; granted: boolean }>,
): PermissionMap {
  const map = emptyPermissions();
  for (const r of rows) {
    const k = r.permissionKey as PermissionKey;
    if (PERMISSION_KEYS.includes(k) && r.granted) map[k] = true;
  }
  return map;
}

export function hasPermission(user: AuthUserDto, key: PermissionKey): boolean {
  if (isSuperAdmin(user.role)) return true;
  return user.permissions[key] === true;
}

export function hasAnyPermission(user: AuthUserDto, keys: PermissionKey[]): boolean {
  return keys.some((k) => hasPermission(user, k));
}
