import dotenv from "dotenv";

const DEFAULT_BASE = "https://crawly-slt.ingarena.net";

export interface CrawlyTopic {
  id: number;
  name: string;
  i18n_name?: Record<string, string>;
}

export interface CrawlyGameMeta {
  code: string;
  platforms?: string[];
  regions?: string[];
  topics?: CrawlyTopic[];
  categories?: Array<{ id: number; name: string }>;
}

export interface CrawlyAiItem {
  id?: string | number;
  content?: string;
  text?: string;
  title?: string;
  body?: string;
  comment?: string;
  en_comment?: string;
  en_content?: string;
  en_title?: string;
  sentiment_tag?: string;
  sentiment?: string | number;
  sentiment_label?: string;
  topic?: string | number;
  topic_name?: string;
  category?: string | number;
  category_name?: string;
  region?: string;
  platform?: string;
  created_at?: string;
  publish_time?: string;
  [key: string]: unknown;
}

function crawlyConfig() {
  let token = process.env.CRAWLY_TOKEN?.trim();
  if (!token) {
    dotenv.config({ override: true });
    token = process.env.CRAWLY_TOKEN?.trim();
  }
  const baseUrl = (process.env.CRAWLY_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const game = process.env.CRAWLY_GAME || "GNG";
  const region = process.env.CRAWLY_REGION || "VN";
  return { baseUrl, token, game, region };
}

async function crawlyGet<T>(path: string, query: Record<string, string | number | undefined>): Promise<T> {
  const { baseUrl, token } = crawlyConfig();
  if (!token) throw new Error("CRAWLY_TOKEN is not set");

  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Crawly ${path} ${res.status}: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

function asList(payload: unknown): CrawlyAiItem[] {
  if (Array.isArray(payload)) return payload as CrawlyAiItem[];
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;

  // Crawly SLT: { code:200, data: { count, data: [...] } }
  if (o.data && typeof o.data === "object") {
    const nested = o.data as Record<string, unknown>;
    if (Array.isArray(nested.data)) return nested.data as CrawlyAiItem[];
    if (Array.isArray(nested.items)) return nested.items as CrawlyAiItem[];
    if (Array.isArray(nested.list)) return nested.list as CrawlyAiItem[];
  }

  for (const key of ["data", "items", "list", "results", "comments", "posts"]) {
    if (Array.isArray(o[key])) return o[key] as CrawlyAiItem[];
  }
  return [];
}

function pageMeta(payload: unknown): { count: number; hasMore: boolean; pageSize: number } {
  if (!payload || typeof payload !== "object") return { count: 0, hasMore: false, pageSize: 0 };
  const o = payload as Record<string, unknown>;
  const data = o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o;
  const list = asList(payload);
  return {
    count: Number(data.count ?? list.length) || 0,
    hasMore: Boolean(data.has_more),
    pageSize: Number(data.limit ?? list.length) || list.length,
  };
}

/** Convert ISO / date-only to Asia/Bangkok (UTC+7) unix seconds, matching Crawly UI day codes. */
export function toCrawlyUnix(isoOrDate: string, endOfDay = false): number {
  const raw = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const suffix = endOfDay ? "T23:59:59+07:00" : "T00:00:00+07:00";
    return Math.floor(new Date(raw + suffix).getTime() / 1000);
  }
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) throw new Error(`Invalid Crawly time: ${isoOrDate}`);
  return Math.floor(ms / 1000);
}

export async function fetchGamesMetadata(games?: string): Promise<CrawlyGameMeta[]> {
  const { game: defaultGame } = crawlyConfig();
  const payload = await crawlyGet<unknown>("/api/external/v1/games/metadata", {
    games: games || defaultGame,
  });
  if (Array.isArray(payload)) return payload as CrawlyGameMeta[];
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.games)) return o.games as CrawlyGameMeta[];
    if (Array.isArray(o.data)) return o.data as CrawlyGameMeta[];
  }
  return [];
}

function balanceTopicIds(meta: CrawlyGameMeta | undefined): string | undefined {
  if (!meta?.topics?.length) return undefined;
  const hits = meta.topics.filter((t) => {
    const blob = `${t.name} ${JSON.stringify(t.i18n_name ?? {})}`.toLowerCase();
    return /balance|hero|class|mastery|op|up|nerf|buff/.test(blob);
  });
  if (!hits.length) return undefined;
  return hits.map((t) => t.id).join(",");
}

export interface CrawlySentimentBundle {
  game: string;
  region: string;
  comments: CrawlyAiItem[];
  posts: CrawlyAiItem[];
  topicFilter?: string;
  totalComments?: number;
  totalPosts?: number;
  startUnix?: number;
  endUnix?: number;
  error?: string;
}

async function fetchPagedList(opts: {
  path: string;
  baseQuery: Record<string, string | number | undefined>;
  maxItems: number;
  pageSize?: number;
}): Promise<{ items: CrawlyAiItem[]; total: number }> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 100);
  const items: CrawlyAiItem[] = [];
  let total = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore && items.length < opts.maxItems && page <= 10) {
    const payload = await crawlyGet<unknown>(opts.path, {
      ...opts.baseQuery,
      page,
      limit: pageSize,
    });
    const chunk = asList(payload);
    const meta = pageMeta(payload);
    total = meta.count || total;
    items.push(...chunk);
    hasMore = meta.hasMore && chunk.length > 0;
    page += 1;
    if (!chunk.length) break;
  }

  return { items: items.slice(0, opts.maxItems), total };
}

export async function fetchHeroBalanceSentiment(opts: {
  startIso: string;
  endIso: string;
  /** Max comments to pull into the report context (paginated). Default 250. */
  limit?: number;
  /** If true, also try topic-filtered pull for balance-related topics (merged). */
  preferBalanceTopics?: boolean;
}): Promise<CrawlySentimentBundle> {
  const { game, region } = crawlyConfig();
  const maxComments = opts.limit ?? 250;
  const maxPosts = Math.min(120, Math.max(40, Math.floor(maxComments / 2)));
  const warnings: string[] = [];

  const startUnix = toCrawlyUnix(opts.startIso, false);
  const endUnix = toCrawlyUnix(opts.endIso, true);

  let topics: string | undefined;
  try {
    const metas = await fetchGamesMetadata(game);
    const meta = metas.find((m) => m.code?.toUpperCase() === game.toUpperCase()) ?? metas[0];
    topics = balanceTopicIds(meta);
  } catch (err) {
    warnings.push(`metadata: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Match Crawly UI: unix start/end, valids=1,2,3, regions, game
  const common: Record<string, string | number | undefined> = {
    game,
    regions: region,
    start: startUnix,
    end: endUnix,
    valids: "1,2,3",
  };

  try {
    // Full window first (UI-parity). Topic filter alone under-samples (~30 vs 300+).
    const [commentsFull, postsFull] = await Promise.all([
      fetchPagedList({
        path: "/api/external/v1/comment-list-ai",
        baseQuery: common,
        maxItems: maxComments,
      }),
      fetchPagedList({
        path: "/api/external/v1/post-list-ai",
        baseQuery: common,
        maxItems: maxPosts,
      }),
    ]);

    let comments = commentsFull.items;
    let posts = postsFull.items;
    let totalComments = commentsFull.total;
    let totalPosts = postsFull.total;

    // Optional: merge a balance-topic slice so hero-balance chatter is represented
    if (opts.preferBalanceTopics !== false && topics) {
      try {
        const [cTopic, pTopic] = await Promise.all([
          fetchPagedList({
            path: "/api/external/v1/comment-list-ai",
            baseQuery: { ...common, topics },
            maxItems: Math.min(80, maxComments),
          }),
          fetchPagedList({
            path: "/api/external/v1/post-list-ai",
            baseQuery: { ...common, topics },
            maxItems: Math.min(40, maxPosts),
          }),
        ]);
        const seenC = new Set(comments.map((c) => String(c.id ?? c.platform_comment_id ?? "")));
        for (const c of cTopic.items) {
          const key = String(c.id ?? c.platform_comment_id ?? "");
          if (key && seenC.has(key)) continue;
          if (key) seenC.add(key);
          comments.push(c);
        }
        const seenP = new Set(posts.map((p) => String(p.id ?? p.platform_post_id ?? "")));
        for (const p of pTopic.items) {
          const key = String(p.id ?? p.platform_post_id ?? "");
          if (key && seenP.has(key)) continue;
          if (key) seenP.add(key);
          posts.push(p);
        }
        comments = comments.slice(0, maxComments);
        posts = posts.slice(0, maxPosts);
      } catch (err) {
        warnings.push(`topics: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      game,
      region,
      comments,
      posts,
      topicFilter: topics,
      totalComments,
      totalPosts,
      startUnix,
      endUnix,
      error: warnings.length ? warnings.join("; ") : undefined,
    };
  } catch (err) {
    return {
      game,
      region,
      comments: [],
      posts: [],
      startUnix,
      endUnix,
      error: [...warnings, err instanceof Error ? err.message : String(err)].join("; "),
    };
  }
}

export function summarizeSentimentItems(
  items: CrawlyAiItem[],
  cap = 40,
): Array<{ text: string; sentiment?: string; topic?: string; platform?: string }> {
  return items
    .slice(0, cap)
    .map((it) => {
      const text = String(
        it.comment ??
          it.en_comment ??
          it.content ??
          it.en_content ??
          it.text ??
          it.body ??
          it.title ??
          it.en_title ??
          "",
      ).slice(0, 400);
      const topics = Array.isArray(it.topics)
        ? (it.topics as Array<{ name?: string }>).map((t) => t.name).filter(Boolean).join(", ")
        : "";
      return {
        text,
        sentiment:
          it.sentiment_tag != null
            ? String(it.sentiment_tag)
            : it.sentiment_label != null
              ? String(it.sentiment_label)
              : it.sentiment != null
                ? String(it.sentiment)
                : undefined,
        topic: topics || String(it.topic_name ?? it.topic ?? ""),
        platform: it.platform != null ? String(it.platform) : undefined,
      };
    })
    .filter((x) => x.text.trim().length > 0);
}