import "../load-env";
import { getTabData } from "../services/tabs.service";
import { buildRealTabData } from "../services/tab-builders";
import { loadFacts, num } from "../services/tab-builders/core";
import { factsByDate, modeKeyToFeId, ratio } from "../services/tab-builders/template-utils";
import { prisma } from "../utils/prisma";

const ALL_TABS = [
  "new-user-retention",
  "new-device-retention",
  "active-user",
  "active-online-time",
  "revival",
  "churn",
  "economy",
  "hack-cheat-teamup",
  "mode-matchmaking",
  "performance",
  "newbie-stats",
  "hero-balance",
];

const SAMPLE = process.env.VERIFY_SAMPLE_DATE || "2026-07-10";
const TOL_PCT = 0.05;

type Check = { name: string; ok: boolean; detail: string };

function close(a: number, b: number, tol = TOL_PCT): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= tol;
}

function pt(
  metrics: unknown[],
  metricId: string,
  seriesId: string,
  date: string,
): number | undefined {
  const m = (
    metrics as Array<{
      id: string;
      series?: Array<{ id: string; data?: { daily?: Array<{ date: string; value: number }> } }>;
    }>
  ).find((x) => x.id === metricId);
  const s = m?.series?.find((x) => x.id === seriesId);
  return s?.data?.daily?.find((p) => p.date === date)?.value;
}

async function localMeasure(metricId: string, dt: Date, key: string): Promise<number> {
  const row = await prisma.beanDailyFact.findFirst({ where: { metricId, dt } });
  if (!row) return NaN;
  return Number((row.measures as Record<string, unknown>)[key] ?? 0);
}

async function main() {
  const checks: Check[] = [];
  let fail = 0;

  const push = (c: Check) => {
    checks.push(c);
    console.log(`  ${c.ok ? "OK" : "FAIL"} ${c.name}: ${c.detail}`);
    if (!c.ok) fail++;
  };

  console.log("=== Fact counts ===");
  const counts = await prisma.beanDailyFact.groupBy({ by: ["metricId"], _count: true });
  for (const c of counts.sort((a, b) => a.metricId.localeCompare(b.metricId))) {
    console.log(`  ${c.metricId}: ${c._count}`);
  }

  console.log("\n=== Tab build audit (VN) ===");
  for (const tabId of ALL_TABS) {
    const tab = tabId === "hero-balance" ? await getTabData(tabId, "VN") : await buildRealTabData(tabId, "VN");
    if (tabId === "hero-balance") {
      const rows = tab?.heroBalance?.rows?.filter((r) => r.dt === SAMPLE) ?? [];
      const games = rows.reduce((a, r) => a + r.games, 0);
      console.log(
        `${tabId}: heroRows=${rows.length} games=${games} range=${tab?.dateRange?.start}..${tab?.dateRange?.end}`,
      );
      push({
        name: "hero-balance sample rows",
        ok: rows.length > 0,
        detail: rows.length > 0 ? `${rows.length} rows, ${games} games` : `no rows on ${SAMPLE}`,
      });
      continue;
    }
    const metrics = tab?.metrics ?? [];
    const empty = (
      metrics as Array<{
        id: string;
        series?: Array<{ data?: { daily?: unknown[] } }>;
        distribution?: { daily?: unknown[] };
      }>
    )
      .filter((m) => {
        const sl = m.series?.reduce((n, s) => n + (s.data?.daily?.length ?? 0), 0) ?? 0;
        const dl = m.distribution?.daily?.length ?? 0;
        return sl === 0 && dl === 0;
      })
      .map((m) => m.id);
    const kpis = (metrics as Array<{ kpi?: unknown }>).filter((m) => m.kpi).length;
    console.log(`${tabId}: metrics=${metrics.length} empty=${empty.length ? empty.join(",") : "none"} kpis=${kpis}`);
    if (empty.length) push({ name: `${tabId} empty metrics`, ok: false, detail: empty.join(",") });
  }

  const dt = new Date(`${SAMPLE}T00:00:00Z`);
  console.log(`\n=== Logic checks (${SAMPLE}) ===`);

  const dau = await localMeasure("active.active_user", dt, "dau");
  const newUser = await localMeasure("new.user_retention", dt, "new_user");
  const r2 = await localMeasure("new.user_retention", dt, "r2");
  const newDevice = await localMeasure("new.device_retention", dt, "new_device");
  const deviceR2 = await localMeasure("new.device_retention", dt, "r2");
  const revival7 = await localMeasure("active.revival", dt, "revival7");
  const revival7Rate = await localMeasure("active.revival", dt, "revival7_rate");
  const c2 = await localMeasure("active.churn", dt, "c2");
  const c3 = await localMeasure("active.churn", dt, "c3");

  push({
    name: "revival7_rate = revival7/dau*100",
    ok: close(revival7Rate, dau > 0 ? (revival7 / dau) * 100 : 0),
    detail: `${revival7Rate} vs ${dau > 0 ? ((revival7 / dau) * 100).toFixed(2) : 0}`,
  });

  const hackRows = await prisma.beanDailyFact.findMany({ where: { metricId: "hack.stats", dt } });
  const hs = hackRows.find((r) => (r.dims as Record<string, unknown>).kind === "hack_summary")?.measures as
    | Record<string, unknown>
    | undefined;
  const submissions = num(hs?.cnt);
  const reportedMatches = num(hs?.cnt2);
  const totalMatches = num(hs?.cnt3);
  const banned = num(
    hackRows.find((r) => (r.dims as Record<string, unknown>).kind === "bans")?.measures?.cnt2,
  );

  const hackTab = await buildRealTabData("hack-cheat-teamup", "VN");
  const hackPctAll = pt(hackTab?.metrics ?? [], "hack_match_pct", "all", SAMPLE);
  const expectedHackPct = ratio(reportedMatches, totalMatches);
  push({
    name: "hack_match_pct all = cnt2/cnt3*100",
    ok: hackPctAll !== undefined && close(hackPctAll, expectedHackPct),
    detail: `${hackPctAll} vs ${expectedHackPct.toFixed(4)}`,
  });

  const banPct = pt(hackTab?.metrics ?? [], "ban_report_pct", "efficiency", SAMPLE);
  push({
    name: "ban_report_pct = banned/submissions*100",
    ok: banPct !== undefined && close(banPct, ratio(banned, submissions)),
    detail: `${banPct} vs ${ratio(banned, submissions).toFixed(4)}`,
  });

  const th3 = hackRows.find(
    (r) => (r.dims as Record<string, unknown>).kind === "threshold" && r.dims.sub_key === "3t",
  );
  const rep3 = num((th3?.measures as Record<string, unknown> | undefined)?.cnt);
  const pun3 = num((th3?.measures as Record<string, unknown> | undefined)?.cnt2);
  if (rep3 > 0) {
    const thTab = pt(hackTab?.metrics ?? [], "report_threshold_ban_rate", "3t", SAMPLE);
    push({
      name: "threshold 3t ban rate",
      ok: thTab !== undefined && close(thTab, ratio(pun3, rep3)),
      detail: `${thTab} vs ${ratio(pun3, rep3).toFixed(2)}`,
    });
  }

  const modeTab = await buildRealTabData("mode-matchmaking", "VN");
  const pickSumPct = [
    "lk_normal",
    "lk_challenge_solo",
    "lk_challenge_team",
    "lk_hell",
    "dcp_challenge",
    "arena",
    "pve",
    "other",
  ].reduce((a, id) => a + (pt(modeTab?.metrics ?? [], "mode_pickrate", id, SAMPLE) ?? 0), 0);
  push({
    name: "mode pickrate sum ~100%",
    ok: close(pickSumPct, 100, 1.5),
    detail: `sum=${pickSumPct.toFixed(2)}%`,
  });

  const modeFacts = await loadFacts("mode-matchmaking", "VN");
  const modeDay = factsByDate(modeFacts).get(SAMPLE) ?? [];
  const totalMm = modeDay
    .filter((x) => x.dims.kind === "mm_agg")
    .reduce((a, r) => a + num(r.measures.match_cnt), 0);
  const feModes = new Set(
    modeDay
      .filter((x) => x.dims.kind === "mm_agg")
      .map((r) => modeKeyToFeId(`${r.dims.sub_key}:${r.dims.mode_key}`)),
  );
  push({
    name: "mode mm_agg has rows",
    ok: totalMm > 0 && feModes.size >= 3,
    detail: `totalMatches=${totalMm} feModes=${feModes.size}`,
  });

  console.log(`\n=== MCP cross-check (${SAMPLE}, VN / SG scope) ===`);
  const mcpPairs: Array<[string, number, number]> = [
    ["dau", dau, 12083],
    ["new_user", newUser, 3298],
    ["r2", r2, 38.33],
    ["new_device", newDevice, 1855],
    ["device_r2", deviceR2, 45.93],
    ["revival7", revival7, 1579],
    ["c2", c2, 1353],
    ["c3", c3, 9],
  ];
  for (const [name, local, expected] of mcpPairs) {
    push({ name: `MCP ${name}`, ok: close(local, expected), detail: `local=${local} mcp=${expected}` });
  }

  console.log("\n=== Data coverage notes ===");
  console.log("  new.device_retention: source from 2025-06-04 (earlier dates N/A in source)");
  console.log("  hero.balance: source from 2025-12-01 (earlier dates N/A in source)");

  console.log(`\n=== Summary: ${checks.length} checks, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
