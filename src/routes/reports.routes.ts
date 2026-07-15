import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { requireActive, requireAuth, type AuthedRequest } from "../middleware/auth";
import { formatDateOnly } from "../utils/dates";
import {
  createHeroBalanceReportRun,
  type HeroBalanceReportType,
} from "../services/hero-balance-report.service";
import { HERO_CLASS_NAMES, HERO_MASTERY_NAMES, RANK_TIERS } from "../services/bean/mappings";

const router = Router();

const manualSentimentSchema = z
  .object({
    notes: z.string().max(8000).optional(),
    images: z
      .array(
        z.object({
          name: z.string().max(120),
          mime: z.string().max(64),
          dataUrl: z.string().max(3_000_000).refine((s) => s.startsWith("data:image/"), {
            message: "dataUrl must be a data:image/* URL",
          }),
        }),
      )
      .max(5)
      .optional(),
  })
  .optional();

const createSchema = z.object({
  type: z.enum(["hero_balance_daily", "hero_balance_weekly"]),
  rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excludeMasteryIds: z.array(z.number().int().positive()).optional(),
  minRankOrder: z.number().int().min(0).max(99).nullable().optional(),
  manualSentiment: manualSentimentSchema,
});

function serializeRun(run: {
  id: string;
  type: string;
  rangeStart: Date;
  rangeEnd: Date;
  status: string;
  html: string | null;
  payloadJson: unknown;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: run.id,
    type: run.type,
    rangeStart: formatDateOnly(run.rangeStart),
    rangeEnd: formatDateOnly(run.rangeEnd),
    status: run.status,
    html: run.html,
    payloadJson: run.payloadJson,
    model: run.model,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    error: run.error,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

router.get("/meta/hero-balance", requireAuth, requireActive, (_req, res) => {
  const classes = Object.entries(HERO_CLASS_NAMES).map(([id, name]) => ({
    id: Number(id),
    name,
    masteries: Object.entries(HERO_MASTERY_NAMES)
      .filter(([mid]) => Math.floor(Number(mid) / 1000) === Number(id))
      .map(([mid, mname]) => ({ id: Number(mid), name: mname })),
  }));
  res.json({
    success: true,
    data: {
      classes,
      rankTiers: RANK_TIERS.filter((t) => t.id !== "other").map((t) => ({
        id: t.id,
        order: t.order,
        label: t.label,
      })),
    },
  });
});

router.get("/", requireAuth, requireActive, async (_req, res, next) => {
  try {
    const runs = await prisma.reportRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({
      success: true,
      data: runs.map((r) => ({
        ...serializeRun(r),
        html: undefined,
        payloadJson: undefined,
        hasHtml: !!r.html,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, requireActive, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const run = await prisma.reportRun.findUnique({ where: { id } });
    if (!run) {
      res.status(404).json({ success: false, error: "Report not found" });
      return;
    }
    res.json({ success: true, data: serializeRun(run) });
  } catch (err) {
    next(err);
  }
});

router.post("/hero-balance", requireAuth, requireActive, async (req: AuthedRequest, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const { type, rangeStart, rangeEnd, excludeMasteryIds, minRankOrder, manualSentiment } =
      parsed.data;
    const run = await createHeroBalanceReportRun({
      type: type as HeroBalanceReportType,
      rangeStart,
      rangeEnd,
      createdBy: req.authUser?.id,
      filters: {
        excludeMasteryIds: excludeMasteryIds ?? [],
        minRankOrder: minRankOrder ?? null,
        manualSentiment,
      },
    });
    res.status(202).json({ success: true, data: serializeRun(run) });
  } catch (err) {
    next(err);
  }
});

export default router;