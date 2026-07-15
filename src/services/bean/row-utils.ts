import type { BeanQueryResult } from "./client";

export function rowsToObjects(result: BeanQueryResult): Record<string, unknown>[] {
  const { headers, rows } = result;
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
}

/** Parse warehouse local_dt YYYYMMDD to ISO date YYYY-MM-DD */
export function localDtToIso(localDt: string): string {
  const s = String(localDt).trim();
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s.slice(0, 10);
}

export function isoToLocalDt(iso: string): string {
  return iso.replace(/-/g, "");
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "\\N" || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function pct(v: unknown): number {
  return Math.round(num(v) * 100) / 100;
}

export function truthyFlag(v: unknown): boolean {
  return String(v).toLowerCase() === "true" || v === true || v === 1 || v === "1";
}
