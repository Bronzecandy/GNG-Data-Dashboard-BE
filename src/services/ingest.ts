import { prisma } from "../utils/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { getBeanConfig, runQuery } from "./bean/client";
import { getAllMetricIds, getMetricDef, ingestScopeLabel, rowsFromResult } from "./bean/queries";
import type { MetricFactRow } from "./bean/queries";
import { isoToLocalDt } from "./bean/row-utils";
import {
  addDays,
  dateRangeInclusive,
  formatDateOnly,
  parseDateOnly,
  stableDimsKey,
  yesterdayUtc,
} from "../utils/dates";
import { runWithConcurrency } from "../utils/run-with-concurrency";

function queryDelayMs(): number {
  const n = Number(process.env.BEAN_QUERY_DELAY_MS ?? 1000);
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

function dayRetries(): number {
  const n = Number(process.env.BEAN_DAY_RETRIES ?? 5);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

function ingestConcurrency(): number {
  const n = Number(process.env.BEAN_INGEST_CONCURRENCY ?? 4);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 8) : 4;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EMPTY_DAY_DIMS: Record<string, unknown> = { scope: "ingest", empty: true };

/** Placeholder fact so gap backfill does not retry days where Bean returned no rows. */
export async function recordEmptyIngestDay(metricId: string, isoDate: string): Promise<void> {
  const cfg = getBeanConfig();
  const dt = parseDateOnly(isoDate);
  const dimsKey = stableDimsKey(EMPTY_DAY_DIMS);
  await prisma.beanDailyFact.upsert({
    where: {
      metricId_cluster_dt_dimsKey: { metricId, cluster: cfg.clusterUrn, dt, dimsKey },
    },
    create: {
      metricId,
      cluster: cfg.clusterUrn,
      dt,
      dimsKey,
      dims: EMPTY_DAY_DIMS as Prisma.InputJsonValue,
      measures: {} as Prisma.InputJsonValue,
    },
    update: { ingestedAt: new Date() },
  });
}

async function upsertOneFact(
  metricId: string,
  cluster: string,
  fact: MetricFactRow,
): Promise<void> {
  const dt = parseDateOnly(fact.dt);
  const dimsKey = stableDimsKey(fact.dims);
  await prisma.beanDailyFact.upsert({
    where: {
      metricId_cluster_dt_dimsKey: { metricId, cluster, dt, dimsKey },
    },
    create: {
      metricId,
      cluster,
      dt,
      dimsKey,
      dims: fact.dims as Prisma.InputJsonValue,
      measures: fact.measures as Prisma.InputJsonValue,
    },
    update: {
      dims: fact.dims as Prisma.InputJsonValue,
      measures: fact.measures as Prisma.InputJsonValue,
      ingestedAt: new Date(),
    },
  });
}

const UPSERT_BATCH_SIZE = 50;

async function upsertFacts(metricId: string, cluster: string, facts: MetricFactRow[]): Promise<number> {
  if (facts.length === 0) return 0;

  if (facts.length <= UPSERT_BATCH_SIZE) {
    for (const fact of facts) {
      await upsertOneFact(metricId, cluster, fact);
    }
    return facts.length;
  }

  let upserted = 0;
  for (let i = 0; i < facts.length; i += UPSERT_BATCH_SIZE) {
    const chunk = facts.slice(i, i + UPSERT_BATCH_SIZE);
    await Promise.all(chunk.map((fact) => upsertOneFact(metricId, cluster, fact)));
    upserted += chunk.length;
    if (upserted % 200 === 0 || upserted === facts.length) {
      console.log(`[ingest] ${metricId} upserted ${upserted}/${facts.length} rows`);
    }
  }
  return upserted;
}

async function getWatermark(metricId: string, cluster: string): Promise<Date | null> {
  const wm = await prisma.ingestionWatermark.findUnique({
    where: { metricId_cluster: { metricId, cluster } },
  });
  return wm?.lastDt ?? null;
}

/** Fetch raw rows from Bean (1 day) and aggregate on BE */
export async function ingestMetricForDay(metricId: string, isoDate: string): Promise<number> {
  const def = getMetricDef(metricId);
  if (!def) throw new Error(`Unknown metric: ${metricId}`);

  const cfg = getBeanConfig();
  const localDt = isoToLocalDt(isoDate);
  const sqls = def.rawSql(localDt);
  const parts: Record<string, unknown>[][] = [];

  for (let i = 0; i < sqls.length; i++) {
    const partLabel = `${metricId} ${isoDate} part ${i + 1}/${sqls.length}`;
    const result = await runQuery(cfg, sqls[i]!, partLabel);
    const rows = rowsFromResult(result);
    parts.push(rows);
    console.log(`[ingest] ${partLabel}: ${rows.length} agg row(s)`);
    if (i < sqls.length - 1) {
      const delay = queryDelayMs();
      if (delay > 0) await sleep(delay);
    }
  }

  const facts = def.aggregate(parts, isoDate);
  const upserted = await upsertFacts(metricId, cfg.clusterUrn, facts);
  return upserted;
}

/** Advance the resume watermark forward only (safe under concurrent, out-of-order day completion). */
async function advanceWatermark(metricId: string, cluster: string, dt: Date): Promise<void> {
  const existing = await getWatermark(metricId, cluster);
  if (existing && existing >= dt) return;
  await prisma.ingestionWatermark.upsert({
    where: { metricId_cluster: { metricId, cluster } },
    create: { metricId, cluster, lastDt: dt },
    update: { lastDt: dt },
  });
}

export async function ingestMetricForDayWithRetry(metricId: string, isoDate: string): Promise<number> {
  const attempts = dayRetries();
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ingestMetricForDay(metricId, isoDate);
    } catch (err) {
      lastErr = err;
      const wait = 8000 + i * 12_000;
      console.warn(
        `[ingest] ${metricId} ${isoDate} attempt ${i + 1}/${attempts} failed: ${(err as Error).message}. Retry in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

function dailyResumeStart(startDate: string, wm: Date | null): Date {
  const requested = parseDateOnly(startDate);
  if (!wm) return requested;
  const resume = addDays(wm, 1);
  return resume > requested ? resume : requested;
}

export async function backfillMetric(
  metricId: string,
  startDate: string,
  endDate?: string,
): Promise<number> {
  const cfg = getBeanConfig();
  const resume = process.env.BEAN_BACKFILL_RESUME !== "0";
  let from = parseDateOnly(startDate);
  if (resume) {
    const wm = await getWatermark(metricId, cfg.clusterUrn);
    from = dailyResumeStart(startDate, wm);
  }
  const to = parseDateOnly(endDate ?? formatDateOnly(yesterdayUtc()));

  if (from > to) {
    console.log(`[ingest] ${metricId} already complete through ${formatDateOnly(to)}`);
    return 0;
  }

  const run = await prisma.ingestionRun.create({
    data: { mode: "backfill", metricId, status: "RUNNING" },
  });

  const days = dateRangeInclusive(from, to);
  const concurrency = ingestConcurrency();
  let total = 0;
  let completed = 0;

  try {
    console.log(
      `[ingest] ${metricId} ${days.length} day(s) ${formatDateOnly(from)} -> ${formatDateOnly(to)} (SQL aggregate, concurrency=${concurrency})`,
    );
    await runWithConcurrency(days, concurrency, async (day) => {
      const iso = formatDateOnly(day);
      const n = await ingestMetricForDayWithRetry(metricId, iso);
      total += n;
      completed++;
      await advanceWatermark(metricId, cfg.clusterUrn, day);
      if (completed % 20 === 0 || completed === days.length) {
        console.log(`[ingest] ${metricId} progress ${completed}/${days.length} days, ${total} rows`);
      }
    });

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), rowsUpserted: total },
    });
    return total;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: msg, rowsUpserted: total },
    });
    throw err;
  }
}

export async function dailyIngestMetric(metricId: string): Promise<number> {
  const cfg = getBeanConfig();
  const wm = await getWatermark(metricId, cfg.clusterUrn);
  const start = dailyResumeStart(process.env.HISTORY_START_DATE || "2024-06-01", wm);
  const end = yesterdayUtc();
  if (start > end) return 0;
  return backfillMetric(metricId, formatDateOnly(start), formatDateOnly(end));
}

export async function backfillAll(startDate?: string, endDate?: string): Promise<void> {
  const start = startDate || process.env.HISTORY_START_DATE || "2024-06-01";
  const metricIds = getAllMetricIds();
  console.log(`[ingest] sequential backfill (${ingestScopeLabel()}), delay=${queryDelayMs()}ms`);

  for (const metricId of metricIds) {
    console.log(`[ingest] === metric ${metricId} ===`);
    const n = await backfillMetric(metricId, start, endDate);
    console.log(`[ingest] ${metricId} done: ${n} fact rows`);
  }
}

export async function dailyIngestAll(): Promise<void> {
  for (const metricId of getAllMetricIds()) {
    const n = await dailyIngestMetric(metricId);
    console.log(`[ingest] daily ${metricId}: ${n} rows`);
  }
}
