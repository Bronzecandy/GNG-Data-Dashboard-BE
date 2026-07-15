import "../load-env";
import { readFileSync, writeFileSync } from "fs";
import { getBeanConfig, runQuery } from "../services/bean/client";

/**
 * Ad-hoc Bean query runner.
 *
 * Usage:
 *   npx tsx src/scripts/bean-explore.ts "SELECT 1"
 *   npx tsx src/scripts/bean-explore.ts --file query.sql --json out.json
 */
async function main() {
  const args = process.argv.slice(2);

  const jsonIdx = args.indexOf("--json");
  let jsonOut: string | undefined;
  if (jsonIdx !== -1) {
    jsonOut = args[jsonIdx + 1];
    args.splice(jsonIdx, 2);
  }

  const fileIdx = args.indexOf("--file");
  let sql: string;
  if (fileIdx !== -1) {
    const file = args[fileIdx + 1];
    args.splice(fileIdx, 2);
    sql = readFileSync(file!, "utf-8").replace(/;\s*$/, "").trim();
  } else {
    sql = args.join(" ").trim();
  }

  if (!sql) {
    console.error('Usage: bean-explore.ts "<SQL>" [--json out.json]  |  --file query.sql');
    process.exit(1);
  }

  const cfg = getBeanConfig();
  console.log(`[bean:explore] cluster=${cfg.clusterUrn}`);
  console.log(`[bean:explore] SQL: ${sql}`);

  const started = Date.now();
  const result = await runQuery(cfg, sql);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`[bean:explore] ${result.rows.length} rows in ${elapsed}s`);
  console.log("headers:", result.headers);
  const preview = result.rows.slice(0, 100);
  for (const row of preview) {
    console.log(row.join(" | "));
  }
  if (result.rows.length > preview.length) {
    console.log(`... (${result.rows.length - preview.length} more rows)`);
  }

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(result, null, 2), "utf-8");
    console.log(`[bean:explore] wrote ${jsonOut}`);
  }
}

main().catch((err) => {
  console.error("[bean:explore] FAILED:", err);
  process.exit(1);
});
