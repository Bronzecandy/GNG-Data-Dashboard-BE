import { Router } from "express";
import { prisma } from "../utils/prisma";
import { requireActive, requireAuth, requirePanelAdmin } from "../middleware/auth";
import { parseDateOnly, formatDateOnly } from "../utils/dates";

const router = Router();

router.get("/", requireAuth, requireActive, async (_req, res, next) => {
  try {
    const seasons = await prisma.season.findMany({ orderBy: { startDate: "asc" } });
    res.json({
      success: true,
      data: seasons.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: formatDateOnly(s.startDate),
        endDate: formatDateOnly(s.endDate),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, requirePanelAdmin, async (req, res, next) => {
  try {
    const { name, startDate, endDate } = req.body as {
      name?: string;
      startDate?: string;
      endDate?: string;
    };
    if (!name?.trim() || !startDate || !endDate) {
      res.status(400).json({ success: false, error: "name, startDate, endDate required" });
      return;
    }
    const season = await prisma.season.create({
      data: {
        name: name.trim(),
        startDate: parseDateOnly(startDate),
        endDate: parseDateOnly(endDate),
      },
    });
    res.json({
      success: true,
      data: {
        id: season.id,
        name: season.name,
        startDate: formatDateOnly(season.startDate),
        endDate: formatDateOnly(season.endDate),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, requirePanelAdmin, async (req, res, next) => {
  try {
    const { name, startDate, endDate } = req.body as {
      name?: string;
      startDate?: string;
      endDate?: string;
    };
    const season = await prisma.season.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(startDate ? { startDate: parseDateOnly(startDate) } : {}),
        ...(endDate ? { endDate: parseDateOnly(endDate) } : {}),
      },
    });
    res.json({
      success: true,
      data: {
        id: season.id,
        name: season.name,
        startDate: formatDateOnly(season.startDate),
        endDate: formatDateOnly(season.endDate),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, requirePanelAdmin, async (req, res, next) => {
  try {
    await prisma.season.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    next(err);
  }
});

export default router;
