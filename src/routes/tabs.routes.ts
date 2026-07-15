import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth";
import { requireActive } from "../middleware/auth";
import { getTabData, listTabIds } from "../services/tabs.service";
import { tabIdToPermission, type TabId } from "../types/auth";
import { hasPermission } from "../utils/permissions";

const router = Router();

router.use(requireActive);

router.get("/", (req: AuthedRequest, res) => {
  const user = req.authUser!;
  const tabs = listTabIds()
    .filter((tabId) => {
      const perm = tabIdToPermission(tabId);
      return perm && hasPermission(user, perm);
    })
    .map((tabId) => ({ id: tabId }));
  res.json({ success: true, data: tabs });
});

router.get("/:tabId", async (req: AuthedRequest, res) => {
  try {
    const tabId = String(req.params.tabId) as TabId;
    const perm = tabIdToPermission(tabId);
    if (!perm) {
      res.status(404).json({ success: false, error: "Unknown tab" });
      return;
    }
    if (!hasPermission(req.authUser!, perm)) {
      res.status(403).json({ success: false, error: "Permission denied", code: "PERMISSION_FORBIDDEN" });
      return;
    }
    const data = await getTabData(tabId);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[tabs] get:", err);
    res.status(500).json({ success: false, error: "Failed to load tab data" });
  }
});

export default router;
