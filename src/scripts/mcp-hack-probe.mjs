import fs from "fs";
import https from "https";
import os from "os";
import path from "path";

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function post(url, token, payload, sessionId) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let jsonText = raw.trim();
        if (jsonText.includes("data:")) {
          const lines = jsonText.split(/\r?\n/).filter((l) => l.startsWith("data:"));
          jsonText = lines.at(-1).slice(5).trim();
        }
        try {
          resolve({ json: JSON.parse(jsonText), sid: res.headers["mcp-session-id"] || sessionId });
        } catch {
          reject(new Error(`parse fail: ${raw.slice(0, 400)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function readQuery(url, token, sql) {
  let { json, sid } = await post(url, token, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dau-check", version: "1.0" } },
  });
  if (json.error) throw new Error(JSON.stringify(json.error));
  await post(url, token, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sid).catch(() => {});
  ({ json } = await post(url, token, {
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "read_query", arguments: { query: sql, engine: "olap", catalog: "default_catalog" } },
  }, sid));
  if (json.error) throw new Error(JSON.stringify(json.error));
  const r = json.result || {};
  if (r.structuredContent?.result) return String(r.structuredContent.result);
  return (r.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

const envPath = path.join(os.homedir(), ".config", "gng-data-explorer", "starrocks.env");
const env = loadEnv(envPath);
const maxDate = await readQuery(env.STARROCKS_MCP_URL, env.STARROCKS_MCP_TOKEN, "SELECT MAX(date) AS max_date FROM gng.ads_user_active_user_d_i");
console.log("max_date:", maxDate.trim());
const dauSql = `SELECT date, region, SUM(dau) AS dau, SUM(active_device) AS active_device FROM gng.ads_user_active_user_d_i WHERE date = (SELECT MAX(date) FROM gng.ads_user_active_user_d_i) AND region IN ('VN','ID','MY','TH','BR','MX','AR','CO','PH','JP','US','ALL') GROUP BY date, region ORDER BY CASE WHEN region='ALL' THEN 0 WHEN region='VN' THEN 1 ELSE 2 END, region LIMIT 20`;
const dau = await readQuery(env.STARROCKS_MCP_URL, env.STARROCKS_MCP_TOKEN, dauSql);
console.log("dau_rows:\n" + dau.trim());
