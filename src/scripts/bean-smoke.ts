import "../load-env";
import { smokeTest } from "../services/bean/client";

async function main() {
  console.log("[bean:smoke] running SELECT 1...");
  const result = await smokeTest();
  console.log("[bean:smoke] headers:", result.headers);
  console.log("[bean:smoke] rows:", result.rows);
  console.log("[bean:smoke] OK");
}

main().catch((err) => {
  console.error("[bean:smoke] FAILED:", err);
  process.exit(1);
});
