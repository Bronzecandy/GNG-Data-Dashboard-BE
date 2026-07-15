/**
 * Run new-metric backfills one at a time (avoids Bean 10-task cap).
 * Resumes from ingestion watermark when BEAN_BACKFILL_RESUME=1 (default).
 * Usage: node src/scripts/backfill-sequential.mjs [start] [end]
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const beRoot = path.resolve(__dirname, "../..");
const start = process.argv[2] || process.env.HISTORY_START_DATE || "2025-01-02";
const end = process.argv[3] || process.env.HISTORY_END_DATE || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const metrics = [
  "economy.stats",
  "hack.stats",
  "mode.match_stats",
  "perf.session_stats",
  "newbie.stats",
];

function run(metric) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log = path.join(beRoot, "discovery", `backfill-${metric}-${stamp}.log`);
  console.log(`\n>>> ${metric} ${start} -> ${end} (log: ${path.basename(log)})`);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "ingest:backfill", "--", start, end, metric],
      {
        cwd: beRoot,
        env: {
          ...process.env,
          BEAN_INGEST_CONCURRENCY: "2",
          BEAN_BACKFILL_RESUME: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );
    const out = (chunk) => process.stdout.write(chunk);
    child.stdout.on("data", out);
    child.stderr.on("data", out);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${metric} exited ${code}`))));
  });
}

for (const metric of metrics) {
  await run(metric);
}
console.log("\nAll metrics backfilled.");
