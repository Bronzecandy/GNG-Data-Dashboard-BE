/**
 * Backfill metrics not already running elsewhere (economy, hack, newbie).
 * Resumes from watermark. Use while mode/perf backfills run separately.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const beRoot = path.resolve(__dirname, "../..");
const start = process.argv[2] || process.env.HISTORY_START_DATE || "2025-01-02";
const end = process.argv[3] || process.env.HISTORY_END_DATE || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const metrics = ["economy.stats", "hack.stats", "newbie.stats"];

function run(metric) {
  console.log(`\n>>> ${metric} ${start} -> ${end}`);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "ingest:backfill", "--", start, end, metric],
      {
        cwd: beRoot,
        env: {
          ...process.env,
          BEAN_INGEST_CONCURRENCY: "1",
          BEAN_BACKFILL_RESUME: "1",
        },
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${metric} exited ${code}`))));
  });
}

for (const metric of metrics) {
  await run(metric);
}
console.log("\nPending metrics backfilled.");
