import { DEFAULT_MCP_URL, ENV_PATH, loadStarrocksEnv, mcpReadQuery } from "./mcp-config.mjs";

function maskToken(token) {
  if (!token || token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

try {
  const { url, token, filePath } = loadStarrocksEnv();
  console.log("config_file:", filePath);
  console.log("mcp_url:", url);
  console.log("token:", maskToken(token), `(len=${token.length})`);
  console.log("default_url:", DEFAULT_MCP_URL);
  if (url !== DEFAULT_MCP_URL) {
    console.log("warn: URL is not production default. Prod =", DEFAULT_MCP_URL);
  }

  const ping = await mcpReadQuery(url, token, "SELECT 1 AS ok");
  console.log("ping:", ping.trim());

  const maxDate = await mcpReadQuery(
    url,
    token,
    "SELECT MAX(date) AS max_date FROM gng.ads_user_active_user_d_i LIMIT 1",
  );
  console.log("ads_user_active_user_d_i max_date:", maxDate.trim());
  console.log("status: OK — StarRocks MCP connected");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("status: FAILED —", msg);
  if (msg.includes("invalid_token") || msg.includes("401")) {
    console.error("");
    console.error("Likely causes:");
    console.error("  1. Token expired or revoked — regenerate personal MCP token");
    console.error("  2. Wrong MCP host — prod URL:", DEFAULT_MCP_URL);
    console.error("  3. Cursor ~/.cursor/mcp.json STARROCKS_AUTH out of sync with starrocks.env");
    console.error("");
    console.error("Fix: update token in both:");
    console.error("  -", ENV_PATH);
    console.error("  - ~/.cursor/mcp.json -> mcpServers.starrocks.env.STARROCKS_AUTH");
    console.error("Then reload MCP in Cursor Settings (MCP → starrocks → Restart).");
  } else if (msg.includes("Missing")) {
    console.error("Create", ENV_PATH, "— see be/docs/mcp-setup.md");
  }
  process.exit(1);
}
