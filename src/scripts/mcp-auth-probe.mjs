import fs from "fs";
import https from "https";
import os from "os";
import path from "path";
import { loadStarrocksEnv } from "./mcp-config.mjs";

const { token } = loadStarrocksEnv();

async function probe(url, authHeader) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "auth-probe", version: "1" },
      },
    });
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
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
            jsonText = jsonText.split(/\r?\n/).filter((l) => l.startsWith("data:")).at(-1).slice(5).trim();
          }
          try {
            const json = JSON.parse(jsonText);
            resolve({
              http: res.statusCode,
              error: json.error ?? null,
              server: json.result?.serverInfo?.name ?? null,
            });
          } catch {
            resolve({ http: res.statusCode, error: "parse_fail", server: null });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ http: 0, error: e.message, server: null }));
    req.write(body);
    req.end();
  });
}

function decodeJwtPayload(tok) {
  const part = tok.startsWith("v2.") ? tok.slice(3).split(".")[0] : tok.split(".")[0];
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const payload = decodeJwtPayload(token);
console.log("token_meta:", {
  len: token.length,
  prefix: token.slice(0, 3),
  jwt: payload
    ? {
        aud: payload.aud,
        iss: payload.iss,
        type: payload.type,
        email: payload.email,
        iat: payload.iat,
        iat_date: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        exp: payload.exp ?? "(none in payload)",
      }
    : "decode_failed",
});

const hosts = [
  "https://sr-mcp.data.garenanow.com/mcp",
  "https://sr-test-mcp.data.garenanow.com/mcp",
];
const auths = [
  ["Bearer", `Bearer ${token}`],
  ["bare", token],
];

for (const host of hosts) {
  for (const [label, header] of auths) {
    const r = await probe(host, header);
    console.log(`${host} [${label}] -> HTTP ${r.http} error=${JSON.stringify(r.error)} server=${r.server}`);
  }
}
