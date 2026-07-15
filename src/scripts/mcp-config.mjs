import fs from "fs";
import https from "https";
import os from "os";
import path from "path";

export const DEFAULT_MCP_URL = "https://sr-mcp.data.garenanow.com/mcp";
export const ENV_PATH = path.join(os.homedir(), ".config", "gng-data-explorer", "starrocks.env");

const URL_KEYS = ["STARROCKS_MCP_URL", "OPENCLAW_STARROCKS_MCP_URL"];
const TOKEN_KEYS = ["STARROCKS_MCP_TOKEN", "OPENCLAW_STARROCKS_MCP_TOKEN"];

function first(map, keys) {
  for (const key of keys) {
    const value = map[key]?.trim();
    if (value) return value;
  }
  return "";
}

export function loadStarrocksEnv(filePath = ENV_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath}. Create it with STARROCKS_MCP_URL and STARROCKS_MCP_TOKEN (see be/docs/mcp-setup.md).`,
    );
  }
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim().replace(/^\uFEFF/, "");
    out[key] = line.slice(i + 1).trim();
  }
  const url = first(out, URL_KEYS) || DEFAULT_MCP_URL;
  const token = first(out, TOKEN_KEYS);
  if (!token) {
    throw new Error(`No token in ${filePath}. Set STARROCKS_MCP_TOKEN=<bare-token>.`);
  }
  return { url, token, filePath };
}

function post(url, token, payload, sessionId) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const req = https.request(
      {
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
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          let jsonText = raw.trim();
          if (jsonText.includes("data:")) {
            const lines = jsonText.split(/\r?\n/).filter((l) => l.startsWith("data:"));
            jsonText = lines.at(-1).slice(5).trim();
          }
          try {
            resolve({
              status: res.statusCode,
              json: JSON.parse(jsonText),
              sid: res.headers["mcp-session-id"] || sessionId,
            });
          } catch {
            reject(new Error(`MCP parse fail (HTTP ${res.statusCode}): ${raw.slice(0, 400)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function mcpInitialize(url, token) {
  const { status, json, sid } = await post(url, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "data-dashboard-be", version: "1.0" },
    },
  });
  if (json.error) {
    const err = typeof json.error === "string" ? json.error : JSON.stringify(json.error);
    throw new Error(`MCP initialize failed (HTTP ${status}): ${err}`);
  }
  await post(url, token, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sid).catch(
    () => {},
  );
  return { sid, serverInfo: json.result?.serverInfo };
}

export async function mcpReadQuery(url, token, sql, engine = "olap", catalog = "default_catalog") {
  const { sid } = await mcpInitialize(url, token);
  const { status, json } = await post(
    url,
    token,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "read_query", arguments: { query: sql, engine, catalog } },
    },
    sid,
  );
  if (json.error) {
    const err = typeof json.error === "string" ? json.error : JSON.stringify(json.error);
    throw new Error(`read_query failed (HTTP ${status}): ${err}`);
  }
  const r = json.result || {};
  if (r.isError) {
    const text = (r.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    throw new Error(text || "read_query isError");
  }
  if (r.structuredContent?.result) return String(r.structuredContent.result);
  return (r.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}
