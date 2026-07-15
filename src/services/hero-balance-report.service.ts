import { prisma } from "../utils/prisma";
import { callLLM } from "../utils/ai-client";
import { formatDateOnly, parseDateOnly } from "../utils/dates";
import { HERO_CLASS_NAMES, HERO_MASTERY_NAMES, RANK_TIERS } from "./bean/mappings";
import { loadHeroBalanceRows, type HeroBalanceRowDto } from "./hero-balance-tab";
import { fetchHeroBalanceSentiment, summarizeSentimentItems } from "./crawly.client";

export type HeroBalanceReportType = "hero_balance_daily" | "hero_balance_weekly";

export interface ManualSentimentImage {
  name: string;
  mime: string;
  dataUrl: string;
}

export interface ManualSentimentInput {
  notes?: string;
  images?: ManualSentimentImage[];
}

export interface HeroBalanceReportFilters {
  excludeMasteryIds?: number[];
  minRankOrder?: number | null;
  manualSentiment?: ManualSentimentInput;
}

export interface MasteryStatRow {
  mastery_id: number;
  mastery_name: string;
  class_id: number;
  class_name: string;
  games: number;
  pickrate_pct: number;
  avg_damage: number;
  avg_healing: number;
  avg_kill: number;
  avg_assist: number;
}

export interface ReportChartPayload {
  masteryPickrate: Array<{ id: string; label: string; value: number }>;
  dailyPickrate?: Array<{ date: string; series: Record<string, number> }>;
  damageHealingBars?: {
    categories: string[];
    series: Array<{ name: string; data: number[] }>;
  };
  killAssistBars?: {
    categories: string[];
    series: Array<{ name: string; data: number[] }>;
  };
  topMasteries: MasteryStatRow[];
  bottomMasteries: MasteryStatRow[];
}

function masteryName(id: number): string {
  return HERO_MASTERY_NAMES[id] ?? ("Mastery " + id);
}

function className(id: number): string {
  return HERO_CLASS_NAMES[id] ?? ("Class " + id);
}

function displayName(classId: number, masteryId: number): string {
  return className(classId) + " - " + masteryName(masteryId);
}

function aggregateMastery(rows: HeroBalanceRowDto[]): MasteryStatRow[] {
  const byMastery = new Map<number, HeroBalanceRowDto[]>();
  for (const r of rows) {
    if (!byMastery.has(r.mastery_id)) byMastery.set(r.mastery_id, []);
    byMastery.get(r.mastery_id)!.push(r);
  }
  const totalGames = rows.reduce((a, r) => a + r.games, 0) || 1;
  const out: MasteryStatRow[] = [];
  for (const [mastery_id, group] of byMastery) {
    if (!mastery_id) continue;
    const games = group.reduce((a, r) => a + r.games, 0);
    const g = games || 1;
    const sum_damage = group.reduce((a, r) => a + r.sum_damage, 0);
    const sum_healing = group.reduce((a, r) => a + r.sum_healing, 0);
    const sum_kill = group.reduce((a, r) => a + r.sum_kill, 0);
    const sum_assist = group.reduce((a, r) => a + r.sum_assist, 0);
    const class_id = group[0]?.class_id ?? 0;
    out.push({
      mastery_id,
      mastery_name: displayName(class_id, mastery_id),
      class_id,
      class_name: className(class_id),
      games,
      pickrate_pct: (games / totalGames) * 100,
      avg_damage: sum_damage / g,
      avg_healing: sum_healing / g,
      avg_kill: sum_kill / g,
      avg_assist: sum_assist / g,
    });
  }
  return out.sort((a, b) => b.pickrate_pct - a.pickrate_pct);
}

type StatBarGroup = {
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
};

function buildDamageHealingBars(rows: MasteryStatRow[]): StatBarGroup | undefined {
  const top = rows.slice(0, 8);
  if (!top.length) return undefined;
  return {
    categories: top.map((m) => m.mastery_name),
    series: [
      { name: "Avg Damage", data: top.map((m) => Number(m.avg_damage.toFixed(1))) },
      { name: "Avg Healing", data: top.map((m) => Number(m.avg_healing.toFixed(1))) },
    ],
  };
}

function buildKillAssistBars(rows: MasteryStatRow[]): StatBarGroup | undefined {
  const top = rows.slice(0, 8);
  if (!top.length) return undefined;
  return {
    categories: top.map((m) => m.mastery_name),
    series: [
      { name: "Avg Kill", data: top.map((m) => Number(m.avg_kill.toFixed(2))) },
      { name: "Avg Assist", data: top.map((m) => Number(m.avg_assist.toFixed(2))) },
    ],
  };
}

function dailyMasteryPickrate(rows: HeroBalanceRowDto[], topIds: number[]) {
  const byDate = new Map<string, HeroBalanceRowDto[]>();
  for (const r of rows) {
    if (!byDate.has(r.dt)) byDate.set(r.dt, []);
    byDate.get(r.dt)!.push(r);
  }
  const dates = [...byDate.keys()].sort();
  return dates.map((date) => {
    const dayRows = byDate.get(date)!;
    const total = dayRows.reduce((a, r) => a + r.games, 0) || 1;
    const series: Record<string, number> = {};
    for (const id of topIds) {
      const games = dayRows.filter((r) => r.mastery_id === id).reduce((a, r) => a + r.games, 0);
      series[String(id)] = (games / total) * 100;
    }
    return { date, series };
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeManualSentiment(input?: ManualSentimentInput): ManualSentimentInput {
  const notes = (input?.notes ?? "").trim().slice(0, 8000);
  const images = (input?.images ?? [])
    .filter((img) => img && typeof img.dataUrl === "string" && img.dataUrl.startsWith("data:image/"))
    .slice(0, 5)
    .map((img) => ({
      name: String(img.name || "proof").slice(0, 120),
      mime: String(img.mime || "image/png").slice(0, 64),
      dataUrl: img.dataUrl.slice(0, 3_000_000),
    }));
  return { notes, images };
}

function renderProofGallery(manual: ManualSentimentInput): string {
  const images = manual.images ?? [];
  if (!images.length) return "";

  const imgs = images
    .map(
      (img, i) =>
        "<figure class=\"proof-figure\">" +
        "<img src=\"" +
        img.dataUrl.replace(/"/g, "") +
        "\" alt=\"" +
        escapeHtml(img.name || "proof-" + (i + 1)) +
        "\"/>" +
        "<figcaption>" +
        escapeHtml(img.name || "Proof " + (i + 1)) +
        "</figcaption></figure>",
    )
    .join("");

  return (
    "<section class=\"report-proof\" id=\"report-proof\">" +
    "<div class=\"lang-block\" data-lang=\"vi\"><h2>Minh chung Sentiment</h2><h3>Anh minh chung</h3></div>" +
    "<div class=\"lang-block\" data-lang=\"en\"><h2>Sentiment Proof</h2><h3>Proof images</h3></div>" +
    "<div class=\"proof-gallery\">" +
    imgs +
    "</div></section>"
  );
}

function renderDatasetBlock(dataset: {
  rangeStart: string;
  rangeEnd: string;
  region: string;
  mode: string;
  userGroup: string;
  excludeMasteryNames: string[];
  crawlyComments: number;
  crawlyPosts: number;
  crawlyTotalComments?: number;
  crawlyTotalPosts?: number;
}): string {
  const excluded =
    dataset.excludeMasteryNames.length > 0
      ? dataset.excludeMasteryNames.map(escapeHtml).join(", ")
      : "None / Khong";
  const crawlyLine =
    "Crawly sample: " +
    dataset.crawlyComments +
    " comments / " +
    dataset.crawlyPosts +
    " posts" +
    (dataset.crawlyTotalComments != null
      ? " (window total ~" + dataset.crawlyTotalComments + " comments, ~" + (dataset.crawlyTotalPosts ?? 0) + " posts)"
      : "");

  const range = escapeHtml(dataset.rangeStart) + " -> " + escapeHtml(dataset.rangeEnd);
  const region = escapeHtml(dataset.region);
  const mode = escapeHtml(dataset.mode);
  const userGroup = escapeHtml(dataset.userGroup);
  return (
    "<section class=\"report-dataset\" id=\"report-dataset\">" +
    "<div class=\"lang-block\" data-lang=\"vi\">" +
    "<h2>Bo du lieu (Dataset)</h2><ul>" +
    "<li><strong>Khoang ngay:</strong> " + range + "</li>" +
    "<li><strong>Region:</strong> " + region + "</li>" +
    "<li><strong>Mode:</strong> " + mode + "</li>" +
    "<li><strong>Nhom user:</strong> " + userGroup + "</li>" +
    "<li><strong>Mastery loai tru:</strong> " + excluded + "</li>" +
    "<li><strong>" + escapeHtml(crawlyLine) + "</strong></li>" +
    "</ul></div>" +
    "<div class=\"lang-block\" data-lang=\"en\">" +
    "<h2>Dataset</h2><ul>" +
    "<li><strong>Date range:</strong> " + range + "</li>" +
    "<li><strong>Region:</strong> " + region + "</li>" +
    "<li><strong>Mode:</strong> " + mode + "</li>" +
    "<li><strong>User group:</strong> " + userGroup + "</li>" +
    "<li><strong>Excluded masteries:</strong> " + excluded + "</li>" +
    "<li><strong>" + escapeHtml(crawlyLine) + "</strong></li>" +
    "</ul></div></section>"
  );
}

function chartBootstrapScript(): string {
  return (
    "<script src=\"https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js\"></script>" +
    "<script>(function(){" +
    "function ready(fn){if(document.readyState!=='loading')fn();else document.addEventListener('DOMContentLoaded',fn);}" +
    "ready(function(){" +
    "var el=document.getElementById('report-chart-data');" +
    "if(!el||typeof echarts==='undefined')return;" +
    "var charts;try{charts=JSON.parse(el.textContent||'{}');}catch(e){return;}" +
    "function barH(domId,items,title){" +
    "var dom=document.getElementById(domId);if(!dom||!items||!items.length)return;" +
    "var c=echarts.init(dom);" +
    "c.setOption({title:{text:title,left:0,textStyle:{fontSize:14}}," +
    "tooltip:{trigger:'axis'},grid:{left:12,right:24,top:48,bottom:24,containLabel:true}," +
    "xAxis:{type:'value',axisLabel:{formatter:'{value}%'}}," +
    "yAxis:{type:'category',data:items.map(function(i){return i.label;}).reverse(),axisLabel:{interval:0,width:210,overflow:'truncate'}}," +
    "series:[{type:'bar',data:items.map(function(i){return i.value;}).reverse(),itemStyle:{color:'#2f6fed'}}]});" +
    "window.addEventListener('resize',function(){c.resize();});}" +
    "function grouped(domId,stat,title){" +
    "var dom=document.getElementById(domId);if(!dom||!stat||!stat.categories||!stat.categories.length)return;" +
    "var c=echarts.init(dom);" +
    "c.setOption({title:{text:title,left:0,textStyle:{fontSize:14}}," +
    "tooltip:{trigger:'axis'},legend:{top:28},grid:{left:12,right:24,top:70,bottom:100,containLabel:true}," +
    "xAxis:{type:'category',data:stat.categories,axisLabel:{rotate:28,interval:0,fontSize:10,width:90,overflow:'truncate'}}," +
    "yAxis:{type:'value'}," +
    "series:(stat.series||[]).map(function(s){return {name:s.name,type:'bar',data:s.data};})});" +
    "window.addEventListener('resize',function(){c.resize();});}" +
    "function lines(domId,daily,labels,title){" +
    "var dom=document.getElementById(domId);if(!dom||!daily||!daily.length)return;" +
    "var ids=Object.keys(daily[0].series||{});" +
    "var c=echarts.init(dom);" +
    "c.setOption({title:{text:title,left:0,textStyle:{fontSize:14}}," +
    "tooltip:{trigger:'axis'},legend:{top:28,type:'scroll'},grid:{left:12,right:24,top:70,bottom:40,containLabel:true}," +
    "xAxis:{type:'category',data:daily.map(function(d){return d.date;})}," +
    "yAxis:{type:'value',axisLabel:{formatter:'{value}%'}}," +
    "series:ids.map(function(id){return {name:(labels&&labels[id])||id,type:'line',smooth:true," +
    "data:daily.map(function(d){return d.series[id]||0;})};})});" +
    "window.addEventListener('resize',function(){c.resize();});}" +
    "barH('chart-pickrate',charts.masteryPickrate||[],'Mastery pickrate (%)');" +
    "grouped('chart-dmg-heal',charts.damageHealingBars,'Avg Damage & Healing');" +
    "grouped('chart-kill-assist',charts.killAssistBars,'Avg Kill & Assist');" +
    "var labelMap={};(charts.masteryPickrate||[]).forEach(function(m){labelMap[m.id]=m.label;});" +
    "lines('chart-daily',charts.dailyPickrate,labelMap,'Daily mastery pickrate (%)');" +
    "});})();</script>"
  );
}

function wrapHtml(
  title: string,
  bodyMarkdownOrHtml: string,
  charts: ReportChartPayload,
  manualSentiment?: ManualSentimentInput,
  dataset?: Parameters<typeof renderDatasetBlock>[0],
): string {
  const looksHtml = /<\/?(h1|h2|p|ul|ol|table|div|section)\b/i.test(bodyMarkdownOrHtml);
  const body = looksHtml
    ? bodyMarkdownOrHtml
    : bodyMarkdownOrHtml
        .split(/\n{2,}/)
        .map((block) => {
          const trimmed = block.trim();
          if (!trimmed) return "";
          if (trimmed.startsWith("# ")) return "<h1>" + escapeHtml(trimmed.slice(2)) + "</h1>";
          if (trimmed.startsWith("## ")) return "<h2>" + escapeHtml(trimmed.slice(3)) + "</h2>";
          if (trimmed.startsWith("### ")) return "<h3>" + escapeHtml(trimmed.slice(4)) + "</h3>";
          if (trimmed.startsWith("- ")) {
            const items = trimmed.split(/\n/).map((l) => l.replace(/^- /, "").trim());
            return "<ul>" + items.map((i) => "<li>" + escapeHtml(i) + "</li>").join("") + "</ul>";
          }
          return "<p>" + escapeHtml(trimmed).replace(/\n/g, "<br/>") + "</p>";
        })
        .join("\n");

  // Strip heavy base64 from chart JSON (images live in proof gallery only)
  const chartJson = JSON.stringify({
    masteryPickrate: charts.masteryPickrate,
    dailyPickrate: charts.dailyPickrate,
    damageHealingBars: charts.damageHealingBars,
    killAssistBars: charts.killAssistBars,
  }).replace(/</g, "\\u003c");

  const hasDaily = !!(charts.dailyPickrate && charts.dailyPickrate.length);
  const hasDmgHeal = !!(charts.damageHealingBars && charts.damageHealingBars.categories.length);
  const hasKillAssist = !!(charts.killAssistBars && charts.killAssistBars.categories.length);

  const chartsSection =
    "<section class=\"report-charts\" id=\"report-charts\">" +
    "<div class=\"lang-block\" data-lang=\"vi\"><h2>Bieu do</h2></div>" +
    "<div class=\"lang-block\" data-lang=\"en\"><h2>Charts</h2></div>" +
    "<div id=\"chart-pickrate\" class=\"chart-box\" style=\"height:" +
    Math.max(280, (charts.masteryPickrate?.length || 8) * 28) +
    "px\"></div>" +
    (hasDmgHeal ? "<div id=\"chart-dmg-heal\" class=\"chart-box\" style=\"height:380px\"></div>" : "") +
    (hasKillAssist ? "<div id=\"chart-kill-assist\" class=\"chart-box\" style=\"height:380px\"></div>" : "") +
    (hasDaily ? "<div id=\"chart-daily\" class=\"chart-box\" style=\"height:340px\"></div>" : "") +
    "</section>";

  const proof = renderProofGallery(manualSentiment ?? {});
  const datasetHtml = dataset ? renderDatasetBlock(dataset) : "";

  return (
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/>" +
    "<title>" +
    escapeHtml(title) +
    "</title>" +
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"/>" +
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin=\"anonymous\"/>" +
    "<link href=\"https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&amp;family=Noto+Sans:wght@400;600;700&amp;display=swap\" rel=\"stylesheet\"/>" +
    "<style>" +
    "body{font-family:'Be Vietnam Pro','Noto Sans',system-ui,-apple-system,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}" +
    "h1{font-size:1.75rem;border-bottom:2px solid #222;padding-bottom:8px}" +
    "h2{font-size:1.25rem;margin-top:1.6em}h3{font-size:1.05rem;margin-top:1.2em}" +
    "table{border-collapse:collapse;width:100%;margin:12px 0 20px}" +
    "th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f3f3}" +
    ".chart-box{width:100%;margin:16px 0 28px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa}" +
    ".proof-notes pre{white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:6px;border:1px solid #e0e0e0}" +
    ".proof-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:12px}" +
    ".proof-figure{margin:0}.proof-figure img{width:100%;height:auto;border:1px solid #ddd;border-radius:6px}" +
    ".proof-figure figcaption{font-size:0.85rem;color:#555;margin-top:6px}" +
    ".lang-toolbar{display:flex;gap:8px;align-items:center;margin:12px 0 20px;position:sticky;top:0;background:#fff;padding:10px 0;z-index:5;border-bottom:1px solid #eee}" +
    ".lang-toolbar button{font:inherit;padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#f7f7f7;cursor:pointer}" +
    ".lang-toolbar button.active{background:#2f6fed;color:#fff;border-color:#2f6fed}" +
    ".lang-block{display:none}.lang-vi .lang-block[data-lang=\"vi\"],.lang-en .lang-block[data-lang=\"en\"]{display:block}" +
    "</style></head><body class=\"lang-vi\">" +
    "<div class=\"lang-toolbar\" role=\"group\" aria-label=\"Language\">" +
    "<strong style=\"margin-right:8px\">Language</strong>" +
    "<button type=\"button\" data-set-lang=\"vi\" class=\"active\">VN</button>" +
    "<button type=\"button\" data-set-lang=\"en\">EN</button>" +
    "</div>" +
    "<h1>" +
    escapeHtml(title) +
    "</h1>" +
    datasetHtml +
    chartsSection +
    "<div class=\"report-body\">" +
    body +
    "</div>" +
    proof +
    "<script type=\"application/json\" id=\"report-chart-data\">" +
    chartJson +
    "</script>" +
    chartBootstrapScript() +
    "<script>(function(){function applyLang(lang){document.body.classList.remove('lang-vi','lang-en');document.body.classList.add(lang==='en'?'lang-en':'lang-vi');document.querySelectorAll('.lang-toolbar [data-set-lang]').forEach(function(btn){btn.classList.toggle('active',btn.getAttribute('data-set-lang')===lang);});}document.querySelectorAll('.lang-toolbar [data-set-lang]').forEach(function(btn){btn.addEventListener('click',function(){applyLang(btn.getAttribute('data-set-lang'));});});applyLang('vi');})();</script>" +
    "</body></html>"
  );
}

function buildSystemPrompt(kind: HeroBalanceReportType): string {
  const isWeekly = kind === "hero_balance_weekly";
  const cadence = isWeekly
    ? "WEEKLY: focus on day-over-day pickrate shifts and sustained combat-stat outliers; keep it short."
    : "DAILY: focus analysis on the themes in analyst notes, fused with Crawly samples and metric outliers; keep it short.";

  return [
    "You are a senior Data Analyst for multiplayer game balance (Garena Nightingale / GNG).",
    "Judge from data + play-experience (pressure, sustain, fairness). Do not dump spreadsheets.",
    "Always label masteries as \"Class - Mastery\" (e.g. Warrior - Swordsman).",
    "Use ONLY provided stats, analyst notes, and Crawly quotes. Never invent skill/kit details.",
    "Skill/kit docs may arrive later — do not fabricate abilities until then.",
    "",
    "LANGUAGE: provide BOTH Vietnamese and English, but NEVER side-by-side in the same visible block.",
    "Wrap each language version of each section in:",
    "  <div class=\"lang-block\" data-lang=\"vi\">...</div>",
    "  <div class=\"lang-block\" data-lang=\"en\">...</div>",
    "The page has a VN/EN toggle; only one language is shown at a time.",
    "Vietnamese must be natural and concise; English mirrors the same points.",
    "Do NOT use h3 labels like VI/EN. Put the real section heading (h2) inside each lang-block.",
    "",
    "LENGTH: concise and dense. Prefer bullets over long paragraphs.",
    "Target roughly: Summary <= 80 words/language, Evidence <= 6 bullets, Sentiment <= 5 bullets, Recommendations <= 4 bullets.",
    "Do NOT say that notes are primary or Crawly is secondary. Integrate both into one coherent read.",
    "Do NOT restate that charts exist unless citing a specific outlier.",
    "",
    "HTML structure (fragments only — no html/body):",
    "1) SUMMARY (include Dataset: Region / User group / date range in 1 short line)",
    "2) EVIDENCE (pickrate + damage/heal/kill/assist highlights)",
    "3) SENTIMENT (combine analyst notes + Crawly; reference proof image filenames if useful)",
    "4) RECOMMENDATIONS",
    "",
    cadence,
    "Output clean HTML (h2/h3/p/ul/table + lang-block wrappers). No fluff.",
  ].join("\n");
}

export async function buildHeroBalanceReportContext(opts: {
  type: HeroBalanceReportType;
  rangeStart: string;
  rangeEnd: string;
  filters?: HeroBalanceReportFilters;
}) {
  const all = await loadHeroBalanceRows();
  const exclude = new Set(opts.filters?.excludeMasteryIds ?? []);
  const minRank = opts.filters?.minRankOrder ?? null;
  const manualSentiment = sanitizeManualSentiment(opts.filters?.manualSentiment);

  const scoped = all.filter((r) => {
    if (r.dt < opts.rangeStart || r.dt > opts.rangeEnd) return false;
    if (r.mode !== "all") return false;
    if (exclude.has(r.mastery_id)) return false;
    if (minRank != null && r.rank_tier_order < minRank) return false;
    return true;
  });

  const masteryStats = aggregateMastery(scoped);
  const topMasteries = masteryStats.slice(0, 8);
  const bottomMasteries = [...masteryStats].sort((a, b) => a.pickrate_pct - b.pickrate_pct).slice(0, 5);
  const topIds = topMasteries.slice(0, 6).map((m) => m.mastery_id);

  const charts: ReportChartPayload = {
    masteryPickrate: masteryStats.slice(0, 15).map((m) => ({
      id: String(m.mastery_id),
      label: m.mastery_name,
      value: Number(m.pickrate_pct.toFixed(2)),
    })),
    damageHealingBars: buildDamageHealingBars(masteryStats),
    killAssistBars: buildKillAssistBars(masteryStats),
    topMasteries,
    bottomMasteries,
  };
  if (opts.type === "hero_balance_weekly") {
    charts.dailyPickrate = dailyMasteryPickrate(scoped, topIds);
  }

  const sentiment = await fetchHeroBalanceSentiment({
    startIso: opts.rangeStart,
    endIso: opts.rangeEnd,
    limit: opts.type === "hero_balance_weekly" ? 300 : 250,
  });

  const minRankLabel =
    minRank == null
      ? "all ranks"
      : ((RANK_TIERS.find((t) => t.order === minRank)?.label ?? ("order>=" + minRank)) + "+");

  return {
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    type: opts.type,
    filters: {
      excludeMasteryIds: [...exclude],
      excludeMasteryNames: [...exclude].map((id) => masteryName(id)),
      minRankOrder: minRank,
      minRankLabel,
    },
    masteryStats: masteryStats.slice(0, 25),
    charts,
    manualSentiment: {
      notes: manualSentiment.notes ?? "",
      imageCount: manualSentiment.images?.length ?? 0,
      imageNames: (manualSentiment.images ?? []).map((i) => i.name),
      // Keep images for HTML embedding; omit huge dataUrls from LLM prompt separately
      images: manualSentiment.images ?? [],
    },
    dataset: {
      rangeStart: opts.rangeStart,
      rangeEnd: opts.rangeEnd,
      region: sentiment.region,
      mode: "all",
      userGroup: minRank == null ? "All ranks" : (minRankLabel),
      excludeMasteryNames: [...exclude].map((id) => masteryName(id)),
      crawlyComments: sentiment.comments.length,
      crawlyPosts: sentiment.posts.length,
      crawlyTotalComments: sentiment.totalComments,
      crawlyTotalPosts: sentiment.totalPosts,
      crawlyStartUnix: sentiment.startUnix,
      crawlyEndUnix: sentiment.endUnix,
    },
    sentiment: {
      game: sentiment.game,
      region: sentiment.region,
      topicFilter: sentiment.topicFilter,
      error: sentiment.error,
      startUnix: sentiment.startUnix,
      endUnix: sentiment.endUnix,
      totalComments: sentiment.totalComments,
      totalPosts: sentiment.totalPosts,
      comments: summarizeSentimentItems(sentiment.comments, 80),
      posts: summarizeSentimentItems(sentiment.posts, 40),
      commentCount: sentiment.comments.length,
      postCount: sentiment.posts.length,
    },
  };
}

export async function generateHeroBalanceReport(opts: {
  reportId: string;
  type: HeroBalanceReportType;
  rangeStart: string;
  rangeEnd: string;
  filters?: HeroBalanceReportFilters;
}): Promise<void> {
  await prisma.reportRun.update({
    where: { id: opts.reportId },
    data: { status: "RUNNING", error: null },
  });

  try {
    const ctx = await buildHeroBalanceReportContext(opts);
    const title =
      opts.type === "hero_balance_weekly"
        ? "GNG Hero Balance Weekly Report (" + opts.rangeStart + " -> " + opts.rangeEnd + ")"
        : "GNG Hero Balance Daily Report (" + opts.rangeStart + " -> " + opts.rangeEnd + ")";

    const manualForPrompt = {
      notes: ctx.manualSentiment.notes,
      imageCount: ctx.manualSentiment.imageCount,
      imageNames: ctx.manualSentiment.imageNames,
      note:
        "Proof images are embedded in the final HTML report gallery. Reference them by filename when discussing sentiment.",
    };

    const userPrompt =
      "Report title: " +
      title +
      "\n\nDATASET:\n" +
      JSON.stringify(ctx.dataset, null, 2) +
      "\n\nFILTERS:\n" +
      JSON.stringify(ctx.filters, null, 2) +
            "\n\nANALYST NOTES (focus themes to analyze; integrate with Crawly, do not rank sources):\n" +
      JSON.stringify(manualForPrompt, null, 2) +
      "\n\nIN-GAME MASTERY STATS (JSON):\n" +
      JSON.stringify(ctx.masteryStats, null, 2) +
      "\n\nCRAWLY COMMUNITY SENTIMENT (VN):\n" +
      JSON.stringify(ctx.sentiment, null, 2) +
      "\n\nWrite a concise report body now (VN + EN in separate data-lang blocks for toggle).";

    const llm = await callLLM(buildSystemPrompt(opts.type), userPrompt);
    const html = wrapHtml(
      title,
      llm.content,
      ctx.charts,
      {
        notes: ctx.manualSentiment.notes,
        images: ctx.manualSentiment.images,
      },
      ctx.dataset,
    );

    // Persist payload without mega base64 duplication if needed — keep images for FE re-download consistency
    await prisma.reportRun.update({
      where: { id: opts.reportId },
      data: {
        status: "SUCCESS",
        html,
        payloadJson: ctx as object,
        model: llm.model,
        inputTokens: llm.inputTokens ?? null,
        outputTokens: llm.outputTokens ?? null,
      },
    });
  } catch (err) {
    await prisma.reportRun.update({
      where: { id: opts.reportId },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function createHeroBalanceReportRun(opts: {
  type: HeroBalanceReportType;
  rangeStart: string;
  rangeEnd: string;
  createdBy?: string;
  filters?: HeroBalanceReportFilters;
}) {
  const start = parseDateOnly(opts.rangeStart);
  const end = parseDateOnly(opts.rangeEnd);
  if (start > end) throw new Error("rangeStart must be <= rangeEnd");

  const manualSentiment = sanitizeManualSentiment(opts.filters?.manualSentiment);

  const run = await prisma.reportRun.create({
    data: {
      type: opts.type,
      rangeStart: start,
      rangeEnd: end,
      status: "PENDING",
      createdBy: opts.createdBy ?? null,
      payloadJson: {
        filters: {
          excludeMasteryIds: opts.filters?.excludeMasteryIds ?? [],
          minRankOrder: opts.filters?.minRankOrder ?? null,
          manualSentiment: {
            notes: manualSentiment.notes,
            imageCount: manualSentiment.images?.length ?? 0,
            imageNames: (manualSentiment.images ?? []).map((i) => i.name),
          },
        },
      },
    },
  });

  void generateHeroBalanceReport({
    reportId: run.id,
    type: opts.type,
    rangeStart: formatDateOnly(start),
    rangeEnd: formatDateOnly(end),
    filters: {
      ...opts.filters,
      manualSentiment,
    },
  });

  return run;
}