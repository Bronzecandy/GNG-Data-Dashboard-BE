import "../load-env";
import { ingestMetricForDay } from "../services/ingest";

async function main() {
  const n = await ingestMetricForDay("active.active_user", "2026-04-15");
  console.log("upserted", n);
}
main();
