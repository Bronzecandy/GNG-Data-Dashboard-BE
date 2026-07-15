import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth";
import { attachAuth } from "../middleware/auth";
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  createSessionToken,
  setAuthCookie,
  clearAuthCookie,
  redirectAfterLogin,
  isAuthDisabled,
  demoAuthUser,
} from "../services/auth.service";

const router = Router();

router.get("/google", (_req, res) => {
  if (isAuthDisabled()) {
    res.status(404).json({ success: false, error: "Auth disabled" });
    return;
  }
  try {
    res.redirect(getGoogleAuthUrl());
  } catch (err) {
    console.error("[auth] google redirect:", err);
    res.status(500).json({ success: false, error: "Google OAuth not configured" });
  }
});

router.get("/google/callback", async (req, res) => {
  if (isAuthDisabled()) {
    res.status(404).json({ success: false, error: "Auth disabled" });
    return;
  }
  try {
    const code = String(req.query.code ?? "");
    if (!code) {
      res.status(400).json({ success: false, error: "Missing code" });
      return;
    }
    const user = await handleGoogleCallback(code);
    const token = await createSessionToken(user.id);
    setAuthCookie(res, token);
    res.redirect(redirectAfterLogin(user));
  } catch (err) {
    console.error("[auth] callback:", err);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

router.get("/me", attachAuth, (req: AuthedRequest, res) => {
  if (isAuthDisabled()) {
    res.json({ success: true, data: demoAuthUser() });
    return;
  }
  if (!req.authUser) {
    res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  res.json({ success: true, data: req.authUser });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

export default router;
