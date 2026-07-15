import "./load-env";
import cron from "node-cron";
import { createApp } from "./app";
import { dailyIngestAll } from "./services/ingest";

const PORT = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

if (process.env.DISABLE_INGEST_CRON !== "true") {
  cron.schedule(
    "0 */2 * * *",
    () => {
      console.log("[cron] 2h ingest starting");
      dailyIngestAll().catch((err) => console.error("[cron] 2h ingest failed:", err));
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );
  console.log("[cron] scheduled ingest every 2 hours (Asia/Ho_Chi_Minh)");
}
