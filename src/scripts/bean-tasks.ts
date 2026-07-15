import "../load-env";
import { getBeanConfig, getNonTerminalTasks } from "../services/bean/client";

/** List current non-terminal (queued/running) Bean tasks. */
async function main() {
  const cfg = getBeanConfig();
  const tasks = await getNonTerminalTasks(cfg);
  console.log(`[tasks] non-terminal count: ${tasks.length}`);
  for (const t of tasks) {
    console.log(JSON.stringify(t));
  }
}

main()
  .catch((err) => {
    console.error("[tasks] FAILED:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
