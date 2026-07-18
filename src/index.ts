import "./load-env";
import cron from "node-cron";
import { createApp } from "./app";
import { scheduledIngest } from "./services/ingest";
import { hourInTimeZone, ingestTimeZone } from "./utils/dates";

const PORT = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

if (process.env.DISABLE_INGEST_CRON !== "true") {
  const tz = ingestTimeZone();
  // Every 2 hours: 00,02,04,…,22 (Asia/Ho_Chi_Minh). At 02:00 & 04:00 also re-ingest yesterday.
  cron.schedule(
    "0 */2 * * *",
    () => {
      const hour = hourInTimeZone(new Date(), tz);
      console.log(`[cron] tick hour=${hour} (${tz})`);
      scheduledIngest().catch((err) => console.error("[cron] ingest failed:", err));
    },
    { timezone: tz },
  );
  console.log(`[cron] scheduled ingest every 2h (${tz}); +yesterday at 02:00 & 04:00`);
}
