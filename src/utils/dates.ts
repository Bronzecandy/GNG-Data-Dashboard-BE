import { createHash } from "crypto";

export function stableDimsKey(dims: Record<string, unknown>): string {
  const sorted = Object.keys(dims)
    .sort()
    .reduce(
      (acc, k) => {
        acc[k] = dims[k];
        return acc;
      },
      {} as Record<string, unknown>,
    );
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32);
}

export function parseDateOnly(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function yesterdayUtc(): Date {
  const now = new Date();
  const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  y.setUTCDate(y.getUTCDate() - 1);
  return y;
}

const DEFAULT_INGEST_TZ = "Asia/Ho_Chi_Minh";

/** Calendar date YYYY-MM-DD in a given IANA timezone (e.g. Asia/Ho_Chi_Minh). */
export function formatDateInTimeZone(date: Date, timeZone = DEFAULT_INGEST_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Hour 0–23 in a given IANA timezone. */
export function hourInTimeZone(date: Date, timeZone = DEFAULT_INGEST_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(hour) % 24;
}

export function ingestTimeZone(): string {
  return process.env.INGEST_TIMEZONE?.trim() || DEFAULT_INGEST_TZ;
}

export function todayInIngestTz(now = new Date()): string {
  return formatDateInTimeZone(now, ingestTimeZone());
}

export function yesterdayInIngestTz(now = new Date()): string {
  return formatDateOnly(addDays(parseDateOnly(todayInIngestTz(now)), -1));
}

export function dateRangeInclusive(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/** Month buckets as [startISO, endISO] inclusive for Bean range queries */
export function monthRangesInclusive(fromIso: string, toIso: string): Array<{ from: string; to: string }> {
  const from = parseDateOnly(fromIso);
  const to = parseDateOnly(toIso);
  const ranges: Array<{ from: string; to: string }> = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 0));
    const clampedStart = start < from ? from : start;
    const clampedEnd = end > to ? to : end;
    ranges.push({ from: formatDateOnly(clampedStart), to: formatDateOnly(clampedEnd) });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return ranges;
}
