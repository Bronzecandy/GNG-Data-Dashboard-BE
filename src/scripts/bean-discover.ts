import "../load-env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getBeanConfig, runQuery, type BeanConfig, type BeanQueryResult } from "../services/bean/client";

/**
 * TEMPORARY table profiler for the Bean Hive warehouse.
 *
 * NOTE: Bean blocks SHOW / DESCRIBE / information_schema (SQL rules + per-table
 * permission). Only SELECT is allowed. So we cannot blindly discover tables.
 * Instead, provide the table names you have access to (from the Bean web
 * console) and this script profiles each via SELECT-based introspection:
 *   - SELECT * ... LIMIT n     -> column names (headers) + sample rows
 *   - GROUP BY <dim>           -> distinct dimension values (ID -> meaning)
 *   - MIN/MAX <date col>       -> available date range
 *
 * Usage (from be/):
 *   # list tables in be/discovery/tables.txt (one fully-qualified name per line)
 *   npx tsx src/scripts/bean-discover.ts
 *   npx tsx src/scripts/bean-discover.ts --tables db.table_a,db.table_b
 *   npx tsx src/scripts/bean-discover.ts --sample-limit 30
 */

const OUT_DIR = path.resolve(process.cwd(), "discovery");
const TABLES_FILE = path.join(OUT_DIR, "tables.txt");

const DIMENSION_COLS = [
  "level_id",
  "cur_rank",
  "rank",
  "group_mode",
  "mode",
  "warm_match_type",
  "match_type",
  "gs_ip",
  "server",
  "region",
  "hero_id",
  "hero",
  "hero_class",
  "device_tier",
  "device",
  "platform",
  "os",
];

interface Args {
  tables: string[];
  sampleLimit: number;
  dt: string;
  dateCol: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const fromFlag = (get("--tables") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let tables = fromFlag;
  if (tables.length === 0 && existsSync(TABLES_FILE)) {
    tables = readFileSync(TABLES_FILE, "utf-8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
  }
  return {
    tables,
    sampleLimit: Number(get("--sample-limit") ?? "20"),
    dt: get("--dt") ?? "20251208",
    dateCol: get("--date-col") ?? "dt",
  };
}

async function safeRun(cfg: BeanConfig, sql: string): Promise<BeanQueryResult | null> {
  try {
    return await runQuery(cfg, sql);
  } catch (err) {
    console.warn(`  ! failed: ${sql}\n    ${(err as Error).message.slice(0, 200)}`);
    return null;
  }
}

function writeJson(name: string, data: unknown): void {
  writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2), "utf-8");
}

function safeName(fq: string): string {
  return fq.replace(/[^a-z0-9_]+/gi, "_");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const args = parseArgs();
  const cfg = getBeanConfig();

  if (args.tables.length === 0) {
    console.log("[discover] No tables provided.");
    console.log(`[discover] Add fully-qualified table names to ${TABLES_FILE} (one per line),`);
    console.log("[discover] or pass --tables db.table_a,db.table_b");
    console.log("[discover] (Bean blocks SHOW/DESCRIBE, so table names must come from the Bean console.)");
    return;
  }

  console.log(`[discover] cluster=${cfg.clusterUrn}`);
  console.log(`[discover] profiling ${args.tables.length} table(s), scoped to ${args.dateCol}='${args.dt}'`);
  const catalog: Record<string, unknown> = {};

  for (const fq of args.tables) {
    console.log(`\n[discover] === ${fq} ===`);

    // Sample scoped to one partition to avoid full-table scans on huge tables.
    // Fall back to unfiltered if the table has no such date column.
    let scoped = true;
    let sample = await safeRun(
      cfg,
      `SELECT * FROM ${fq} WHERE ${args.dateCol} = '${args.dt}' LIMIT ${args.sampleLimit}`,
    );
    if (!sample) {
      scoped = false;
      sample = await safeRun(cfg, `SELECT * FROM ${fq} LIMIT ${args.sampleLimit}`);
    }
    if (!sample) {
      catalog[fq] = { error: "sample query failed (no access or bad name)" };
      continue;
    }
    const columns = sample.headers;
    const colLower = columns.map((c) => c.toLowerCase());
    const hasDateCol = colLower.includes(args.dateCol.toLowerCase());
    const whereDt = scoped && hasDateCol ? ` WHERE ${args.dateCol} = '${args.dt}'` : "";
    console.log(`  ${columns.length} columns: ${columns.join(", ")}`);

    // distinct dimension values (scoped to the sample day when possible)
    const distinct: Record<string, unknown[]> = {};
    for (const dim of DIMENSION_COLS) {
      if (colLower.includes(dim)) {
        const d = await safeRun(
          cfg,
          `SELECT ${dim} AS v, COUNT(*) AS c FROM ${fq}${whereDt} GROUP BY ${dim} ORDER BY c DESC LIMIT 50`,
        );
        if (d) distinct[dim] = d.rows;
      }
    }

    const profile = {
      columns,
      scopedTo: whereDt ? `${args.dateCol}=${args.dt}` : "unfiltered",
      sampleRows: sample.rows.slice(0, 5),
      distinct,
    };
    catalog[fq] = profile;
    writeJson(`profile_${safeName(fq)}.json`, profile);
  }

  writeJson("catalog.json", catalog);
  console.log(`\n[discover] done. Raw output in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[discover] FAILED:", err);
  process.exit(1);
});
