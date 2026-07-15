import fs from "fs";
import https from "https";
import { loadStarrocksEnv, mcpReadQuery } from "./mcp-config.mjs";

const { url, token } = loadStarrocksEnv();
const maxDate = await mcpReadQuery(
  url,
  token,
  "SELECT MAX(date) AS max_date FROM gng.ads_user_active_user_d_i",
);
console.log("max_date:", maxDate.trim());
const dauSql = `SELECT date, region, SUM(dau) AS dau, SUM(active_device) AS active_device FROM gng.ads_user_active_user_d_i WHERE date = (SELECT MAX(date) FROM gng.ads_user_active_user_d_i) AND region IN ('VN','ID','MY','TH','BR','MX','AR','CO','PH','JP','US','ALL') GROUP BY date, region ORDER BY CASE WHEN region='ALL' THEN 0 WHEN region='VN' THEN 1 ELSE 2 END, region LIMIT 20`;
const dau = await mcpReadQuery(url, token, dauSql);
console.log("dau_rows:\n" + dau.trim());
