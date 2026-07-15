import type { Request, Response, NextFunction } from "express";
import {
  verifySessionToken,
  readAuthCookie,
  getUserById,
  isAuthDisabled,
  demoAuthUser,
} from "../services/auth.service";
import type { AuthUserDto, PermissionKey } from "../types/auth";
import { tabIdToPermission } from "../types/auth";
import { hasPermission } from "../utils/permissions";

export type AuthedRequest = Request & { authUser?: AuthUserDto };

export async function attachAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (isAuthDisabled()) {
    req.authUser = demoAuthUser();
    next();
    return;
  }
  const token = readAuthCookie(req);
  if (!token) {
    next();
    return;
  }
  const userId = await verifySessionToken(token);
  if (!userId) {
    next();
    return;
  }
  const user = await getUserById(userId);
  if (user) req.authUser = user;
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  next();
}

export function requireActive(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  if (req.authUser.status !== "ACTIVE") {
    res.status(403).json({ success: false, error: "Account pending approval", code: "PENDING" });
    return;
  }
  next();
}

export function requirePanelAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser?.isPanelAdmin) {
    res.status(403).json({ success: false, error: "Admin access required", code: "FORBIDDEN" });
    return;
  }
  next();
}

export function requirePermission(permission: PermissionKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    if (req.authUser.status !== "ACTIVE") {
      res.status(403).json({ success: false, error: "Account pending approval", code: "PENDING" });
      return;
    }
    if (hasPermission(req.authUser, permission)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: "Permission denied",
      code: "PERMISSION_FORBIDDEN",
      permission,
    });
  };
}

export type ApiPermissionGuard = PermissionKey | "admin" | null;

export function resolvePermissionForApiPath(path: string): ApiPermissionGuard {
  if (path.startsWith("/admin") || path.startsWith("/users") || path === "/meta") {
    return "admin";
  }

  // Mounted at /api/tabs → path is /:tabId; full path may be /api/tabs/:tabId
  const fullMatch = path.match(/^\/tabs\/([^/]+)/);
  if (fullMatch) {
    return tabIdToPermission(decodeURIComponent(fullMatch[1]!));
  }

  const mountedMatch = path.match(/^\/([^/]+)$/);
  if (mountedMatch && mountedMatch[1] !== "tabs") {
    const perm = tabIdToPermission(decodeURIComponent(mountedMatch[1]!));
    if (perm) return perm;
  }

  return null;
}

export function apiPermissionGuard(req: AuthedRequest, res: Response, next: NextFunction): void {
  const permission = resolvePermissionForApiPath(req.path);
  if (permission === null) {
    next();
    return;
  }
  if (permission === "admin") {
    requirePanelAdmin(req, res, next);
    return;
  }
  requirePermission(permission)(req, res, next);
}
