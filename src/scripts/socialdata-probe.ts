import fs from "node:fs";
import path from "node:path";
import "../load-env";
import { getUsession, socialdataBaseUrl } from "../services/socialdata/auth";
import { sdQuery, sdQueryProbe } from "../services/socialdata/client";
import {
  INTROSPECTION_QUERY,
  listQueryFields,
  scanSchemaForKeywords,
  unwrapTypeName,
  type IntrospectionSchema,
} from "../services/socialdata/introspection";

const DISCOVERY_DIR = path.resolve(process.cwd(), "discovery", "socialdata");
const DOCS_PATH = path.resolve(process.cwd(), "..", "docs", "socialdata", "comment-probe-findings.md");

const GNG_SLUG_CANDIDATES = [
  "gng",
  "gngsg",
  "gngvn",
  "gg",
  "goldandglory",
  "gold-and-glory",
  "gnglobal",
  "gnglobalsg",
  "gngsgvn",
];

type ProbeReport = {
  ranAt: string;
  baseUrl: string;
  auth: { ok: boolean; me?: unknown; error?: string };
  app: { id?: number; name?: string; slug?: string; error?: string };
  schemaKeywords: ReturnType<typeof scanSchemaForKeywords>;
  queryFields: ReturnType<typeof listQueryFields>;
  channels: unknown[];
  apiConnectedChannels: unknown[];
  channelMetrics: unknown[];
  commentProbes: Array<{ label: string; ok: boolean; data?: unknown; error?: string }>;
  conclusions: string[];
};

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function statusLabel(status: unknown): string {
  const n = Number(status);
  if (n === 3) return "API_CONNECTED";
  if (n === 1) return "PUBLIC_CRAWL";
  return `status_${status}`;
}

async function authSmoke(): Promise<{ ok: boolean; me?: unknown; error?: string }> {
  try {
    const res = await sdQuery<{ me: { id: number; name: string; email: string; role: unknown } }>(
      `query getMe { me { id name email role } }`,
    );
    return { ok: true, me: res.data?.me };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function introspect(): Promise<IntrospectionSchema | null> {
  try {
    const res = await sdQuery<{ __schema: IntrospectionSchema["__schema"] }>(INTROSPECTION_QUERY);
    if (!res.data?.__schema) return null;
    return { __schema: res.data.__schema };
  } catch (err) {
    console.warn("[sd:probe] introspection failed:", err);
    return null;
  }
}

async function discoverApp(): Promise<{ id?: number; name?: string; slug?: string; error?: string }> {
  for (const slug of GNG_SLUG_CANDIDATES) {
    const res = await sdQueryProbe<{ appBySlug: { id: number; name: string; slug: string } | null }>(
      `query appBySlug($slug: String!) { appBySlug(slug: $slug) { id name slug } }`,
      { slug },
    );
    const app = res.data?.appBySlug;
    if (app?.id) {
      console.log(`[sd:probe] found app slug=${slug} id=${app.id} name=${app.name}`);
      return { id: app.id, name: app.name, slug: app.slug };
    }
  }

  // Fallback: search apps query if schema exposes it
  const appsRes = await sdQueryProbe<{ apps: Array<{ id: number; name: string; slug: string }> }>(
    `query apps { apps { id name slug } }`,
  );
  const apps = appsRes.data?.apps ?? [];
  const gng = apps.find(
    (a) =>
      /gold|glory|gng/i.test(a.name) ||
      /gold|glory|gng/i.test(a.slug),
  );
  if (gng) {
    return { id: gng.id, name: gng.name, slug: gng.slug };
  }

  return {
    error: `No Gold & Glory app found. Tried slugs: ${GNG_SLUG_CANDIDATES.join(", ")}. apps query returned ${apps.length} app(s).`,
  };
}

async function listChannels(appId: number): Promise<unknown[]> {
  const res = await sdQueryProbe<{
    listChannel: { total: number; results: unknown[] };
  }>(
    `query listChannel($appId: UInt32!) {
      listChannel(page: 1, perPage: 100, appId: $appId) {
        total
        results { id plat sub alias name url status privacy }
      }
    }`,
    { appId },
  );
  if (res.errors?.length) return [];
  return res.data?.listChannel?.results ?? [];
}

function isApiConnected(ch: Record<string, unknown>): boolean {
  if (ch.credential && typeof ch.credential === "object") return true;
  const status = Number(ch.status);
  if (status === 3) return true;
  const conn = String(ch.connectionStatus ?? ch.connectStatus ?? "").toUpperCase();
  return conn.includes("API_CONNECTED") || conn.includes("CONNECTED");
}

async function fetchChannelMetrics(appId: number, channelId: number): Promise<unknown> {
  const res = await sdQueryProbe<{ getChannel: unknown }>(
    `query getChannel($id: UInt32!, $appId: UInt32!) {
      getChannel(id: $id, withMetrics: true, appId: $appId) {
        id plat sub alias name url status metrics privacy
      }
    }`,
    { id: channelId, appId },
  );
  return res.data?.getChannel ?? res.errors;
}

async function probeCommentPaths(
  schema: IntrospectionSchema | null,
  appId: number,
  channels: Array<Record<string, unknown>>,
): Promise<ProbeReport["commentProbes"]> {
  const probes: ProbeReport["commentProbes"] = [];

  const add = (label: string, res: Awaited<ReturnType<typeof sdQueryProbe>>) => {
    if (res.errors?.length) {
      probes.push({ label, ok: false, error: res.errors.map((e) => e.message).join("; ") });
    } else {
      probes.push({ label, ok: true, data: res.data });
    }
  };

  // postTypes + platforms (documented in schema sidebar screenshot)
  add("postTypes", await sdQueryProbe(`query { postTypes { id name alias } }`));
  add("platforms", await sdQueryProbe(`query { platforms { id name alias } }`));
  add("getMetricsByLevel(1)", await sdQueryProbe(`query { getMetricsByLevel(level: 1) { id name alias } }`));

  const sampleChannel = channels[0];
  const channelId = sampleChannel ? Number(sampleChannel.id) : undefined;

  // Dynamic probes from introspection query fields
  if (schema) {
    const { matchingQueryFields } = scanSchemaForKeywords(schema);
    for (const f of matchingQueryFields) {
      if (!/comment|post|video|feed|content|item|message|reply/i.test(f.name)) continue;
      if (f.name === "postTypes" || f.name === "platforms") continue;

      const vars: Record<string, unknown> = {};
      if (f.args.some((a) => a.startsWith("appId"))) vars.appId = appId;
      if (f.args.some((a) => a.startsWith("channelId") || a.startsWith("id:"))) {
        if (channelId) vars.channelId = channelId;
        if (channelId) vars.id = channelId;
      }
      if (f.args.some((a) => a.startsWith("limit"))) vars.limit = 5;

      const argList = f.args.map((a) => a.split(":")[0]!.trim()).filter(Boolean);
      const varDecl = argList.map((a) => `$${a}: ${a === "limit" ? "Int" : "UInt32!"}`).join(", ");
      const callArgs = argList.map((a) => `${a}: $${a}`).join(", ");

      const returnType = getTypeFieldsForProbe(schema, f.returnType);
      const fieldSelection = returnType || "id";

      const query =
        argList.length > 0
          ? `query probe_${f.name}(${varDecl}) { ${f.name}(${callArgs}) { ${fieldSelection} } }`
          : `query probe_${f.name} { ${f.name} { ${fieldSelection} } }`;

      add(`dynamic:${f.name}`, await sdQueryProbe(query, vars));
    }
  }

  // Common explicit comment/post probes
  const explicit: Array<{ label: string; query: string; variables?: Record<string, unknown> }> = [
    {
      label: "posts(appId)",
      query: `query posts($appId: UInt32!, $limit: Int) {
        posts(appId: $appId, limit: $limit) { id title content text createdAt channelId }
      }`,
      variables: { appId, limit: 5 },
    },
    {
      label: "getPosts(appId)",
      query: `query getPosts($appId: UInt32!, $limit: Int) {
        getPosts(appId: $appId, limit: $limit) { id title content text createdAt }
      }`,
      variables: { appId, limit: 5 },
    },
    {
      label: "comments(appId)",
      query: `query comments($appId: UInt32!, $limit: Int) {
        comments(appId: $appId, limit: $limit) { id text content author createdAt }
      }`,
      variables: { appId, limit: 5 },
    },
    {
      label: "getComments(channelId)",
      query: `query getComments($channelId: UInt32!, $limit: Int) {
        getComments(channelId: $channelId, limit: $limit) { id text content author createdAt }
      }`,
      variables: { channelId: channelId ?? 0, limit: 5 },
    },
    {
      label: "videos(channelId)",
      query: `query videos($channelId: UInt32!, $limit: Int) {
        videos(channelId: $channelId, limit: $limit) { id title url comments { id text author } }
      }`,
      variables: { channelId: channelId ?? 0, limit: 3 },
    },
    {
      label: "channelPosts(channelId)",
      query: `query channelPosts($channelId: UInt32!, $limit: Int) {
        channelPosts(channelId: $channelId, limit: $limit) { id text content comments { id text } }
      }`,
      variables: { channelId: channelId ?? 0, limit: 3 },
    },
  ];

  for (const e of explicit) {
    if (e.variables && "channelId" in e.variables && !channelId) continue;
    add(e.label, await sdQueryProbe(e.query, e.variables));
  }

  return probes;
}

function getTypeFieldsForProbe(schema: IntrospectionSchema, typeName: string): string | null {
  const t = schema.__schema.types.find((x) => x.name === typeName);
  if (!t?.fields?.length) return null;
  const scalarFields = t.fields
    .filter((f) => {
      const n = unwrapTypeName(f.type);
      return !n.startsWith("__") && !["JSON", "Query", "Mutation"].includes(n);
    })
    .slice(0, 12)
    .map((f) => {
      const n = unwrapTypeName(f.type);
      if (n === "Comment" || /comment/i.test(f.name)) {
        return `${f.name} { id text content author createdAt }`;
      }
      return f.name;
    });
  return scalarFields.join("\n          ") || null;
}

function buildConclusions(report: ProbeReport): string[] {
  const out: string[] = [];

  if (!report.auth.ok) {
    out.push("Authentication failed — set SOCIALDATA_USESSION or provide SOCIALDATA_GOOGLE_CREDENTIALS service-account JSON.");
    return out;
  }

  if (!report.app.id) {
    out.push("Gold & Glory app not discovered — verify slug/app access with Socialdata admin.");
  } else {
    out.push(`Gold & Glory resolved: appId=${report.app.id}, slug=${report.app.slug}, name=${report.app.name}.`);
  }

  const connected = report.apiConnectedChannels.length;
  out.push(`Channels total=${report.channels.length}, API_CONNECTED=${connected}.`);

  const successfulComment = report.commentProbes.filter((p) => {
    if (!p.ok || !p.data) return false;
    const s = JSON.stringify(p.data);
    return /comment|text|content|message|reply/i.test(s) && s.length > 80;
  });

  if (successfulComment.length > 0) {
    out.push(
      `Comment-like data may be available via: ${successfulComment.map((p) => p.label).join(", ")}.`,
    );
  } else {
    const anyOk = report.commentProbes.filter((p) => p.ok);
    if (anyOk.length > 0) {
      out.push("Some post/metadata queries succeeded but no comment text payloads were returned in samples.");
    } else {
      out.push(
        "No comment retrieval query succeeded. Socialdata API likely exposes channel-level metrics only (followers, views, videos, reactions) — not individual player comments.",
      );
    }
  }

  const commentTypes = report.schemaKeywords.matchingTypes.filter((t) => /comment/i.test(t.name));
  if (commentTypes.length === 0) {
    out.push("Schema introspection found no Comment-related GraphQL types.");
  } else {
    out.push(`Schema has comment-related types: ${commentTypes.map((t) => t.name).join(", ")}.`);
  }

  return out;
}

function writeFindings(report: ProbeReport): void {
  ensureDir(path.dirname(DOCS_PATH));
  const lines: string[] = [
    "# Socialdata API — Comment Probe Findings",
    "",
    `Generated: ${report.ranAt}`,
    `Base URL: ${report.baseUrl}`,
    "",
    "## Authentication",
    "",
    report.auth.ok
      ? `- OK — logged in as **${(report.auth.me as { email?: string })?.email ?? "unknown"}**`
      : `- FAILED — ${report.auth.error}`,
    "",
    "## Gold & Glory App",
    "",
  ];

  if (report.app.id) {
    lines.push(`- **appId:** ${report.app.id}`);
    lines.push(`- **slug:** ${report.app.slug}`);
    lines.push(`- **name:** ${report.app.name}`);
  } else {
    lines.push(`- Not found: ${report.app.error ?? "unknown"}`);
  }

  lines.push("", "## Channels", "", `- Total: ${report.channels.length}`);
  lines.push(`- API_CONNECTED: ${report.apiConnectedChannels.length}`, "");

  if (report.apiConnectedChannels.length > 0) {
    lines.push("### API_CONNECTED sample", "", "```json");
    lines.push(JSON.stringify(report.apiConnectedChannels.slice(0, 5), null, 2));
    lines.push("```", "");
  }

  lines.push("## Schema — comment/post related", "", "### Query fields", "");
  for (const f of report.schemaKeywords.matchingQueryFields) {
    lines.push(`- \`${f.name}(${f.args.join(", ")})\` 뿯↽ ${f.returnType}`);
  }

  lines.push("", "### Types", "");
  for (const t of report.schemaKeywords.matchingTypes.slice(0, 30)) {
    lines.push(`- **${t.name}** (${t.kind}): ${t.fields.slice(0, 8).join(", ")}`);
  }

  lines.push("", "## Comment probe results", "");
  for (const p of report.commentProbes) {
    lines.push(`### ${p.label}`, "");
    if (p.ok) {
      lines.push("```json");
      lines.push(JSON.stringify(p.data, null, 2).slice(0, 2500));
      lines.push("```", "");
    } else {
      lines.push(`Error: ${p.error}`, "");
    }
  }

  lines.push("## Conclusions", "");
  for (const c of report.conclusions) {
    lines.push(`- ${c}`);
  }

  lines.push(
    "",
    "## Next steps",
    "",
    "1. If comment text is required and not in GraphQL, use platform APIs (YouTube/TikTok/Facebook) with OAuth credentials from `API_CONNECTED` channels.",
    "2. Re-run: `cd be && npm run sd:probe` after setting `SOCIALDATA_USESSION` or service-account credentials.",
    "3. Raw artifacts: `be/discovery/socialdata/`.",
    "",
  );

  fs.writeFileSync(DOCS_PATH, lines.join("\n"), "utf8");
}

async function main(): Promise<void> {
  ensureDir(DISCOVERY_DIR);
  console.log(`[sd:probe] base=${socialdataBaseUrl()}`);
  console.log("[sd:probe] resolving session...");

  try {
    await getUsession();
  } catch (err) {
    console.warn("[sd:probe] session error:", err instanceof Error ? err.message : err);
  }

  const report: ProbeReport = {
    ranAt: new Date().toISOString(),
    baseUrl: socialdataBaseUrl(),
    auth: await authSmoke(),
    app: {},
    schemaKeywords: { matchingTypes: [], matchingQueryFields: [] },
    queryFields: [],
    channels: [],
    apiConnectedChannels: [],
    channelMetrics: [],
    commentProbes: [],
    conclusions: [],
  };

  if (!report.auth.ok) {
    report.conclusions = buildConclusions(report);
    writeJson(path.join(DISCOVERY_DIR, "probe-report.json"), report);
    writeFindings(report);
    console.error("[sd:probe] auth failed — see docs/socialdata/comment-probe-findings.md");
    process.exitCode = 1;
    return;
  }

  console.log("[sd:probe] auth OK:", report.auth.me);

  const schema = await introspect();
  if (schema) {
    writeJson(path.join(DISCOVERY_DIR, "schema.json"), schema);
    report.schemaKeywords = scanSchemaForKeywords(schema);
    report.queryFields = listQueryFields(schema);
    writeJson(path.join(DISCOVERY_DIR, "schema-keywords.json"), report.schemaKeywords);
    writeJson(path.join(DISCOVERY_DIR, "query-fields.json"), report.queryFields);
    console.log(
      `[sd:probe] introspection OK — ${report.queryFields.length} query fields, ${report.schemaKeywords.matchingTypes.length} keyword types`,
    );
  }

  report.app = await discoverApp();
  if (report.app.id) {
    writeJson(path.join(DISCOVERY_DIR, "app.json"), report.app);
  }

  if (report.app.id) {
    const raw = await listChannels(report.app.id);
    report.channels = raw;
    writeJson(path.join(DISCOVERY_DIR, "channels.json"), raw);

    const asRecords = raw as Array<Record<string, unknown>>;
    report.apiConnectedChannels = asRecords.filter(isApiConnected).map((ch) => ({
      ...ch,
      connectionStatus: statusLabel(ch.status),
    }));
    writeJson(path.join(DISCOVERY_DIR, "channels-api-connected.json"), report.apiConnectedChannels);
    console.log(
      `[sd:probe] channels=${raw.length}, API_CONNECTED=${report.apiConnectedChannels.length}`,
    );

    const sampleIds = (report.apiConnectedChannels as Array<{ id: number }>)
      .slice(0, 3)
      .map((c) => c.id);
    for (const id of sampleIds) {
      report.channelMetrics.push(await fetchChannelMetrics(report.app.id!, id));
    }
    writeJson(path.join(DISCOVERY_DIR, "channel-metrics-sample.json"), report.channelMetrics);

    report.commentProbes = await probeCommentPaths(schema, report.app.id, asRecords);
    writeJson(path.join(DISCOVERY_DIR, "comment-probes.json"), report.commentProbes);
  }

  report.conclusions = buildConclusions(report);
  writeJson(path.join(DISCOVERY_DIR, "probe-report.json"), report);
  writeFindings(report);

  console.log("[sd:probe] done — findings:", DOCS_PATH);
  for (const c of report.conclusions) {
    console.log(`  - ${c}`);
  }
}

main().catch((err) => {
  console.error("[sd:probe] FAILED:", err);
  process.exit(1);
});
