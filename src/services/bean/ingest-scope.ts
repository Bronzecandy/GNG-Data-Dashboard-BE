/** Scoped ingest filters - default SG server + VN players (matches CSV validation). */

export interface IngestScope {
  region: string;
  ipRegion: string;
}

export function getIngestScope(): IngestScope {
  return {
    region: process.env.INGEST_REGION?.trim() || "SG",
    ipRegion: process.env.INGEST_IP_REGION?.trim() || "VN",
  };
}

function lit(v: string): string {
  return v.replace(/'/g, "''");
}

export function dayFilter(
  localDt: string,
  opts: { regionCol?: string; ipRegionCol?: string },
): string {
  const { region, ipRegion } = getIngestScope();
  const parts = [`local_dt = '${lit(localDt)}'`];
  if (opts.regionCol) parts.push(`${opts.regionCol} = '${lit(region)}'`);
  if (opts.ipRegionCol) parts.push(`${opts.ipRegionCol} = '${lit(ipRegion)}'`);
  return parts.join(" AND ");
}

/** gng_ob event tables partitioned by dt (YYYYMMDD string). */
export function obDayFilter(
  dt: string,
  opts: { regionCol?: string; ipRegionCol?: string },
): string {
  const { region, ipRegion } = getIngestScope();
  const parts = [`dt = '${lit(dt)}'`];
  if (opts.regionCol) parts.push(`${opts.regionCol} = '${lit(region)}'`);
  if (opts.ipRegionCol) parts.push(`${opts.ipRegionCol} = '${lit(ipRegion)}'`);
  return parts.join(" AND ");
}

export function scopedDims(): Record<string, string> {
  const { region, ipRegion } = getIngestScope();
  return { region, ip_region: ipRegion };
}
