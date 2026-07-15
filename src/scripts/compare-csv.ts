import "../load-env";
import { readFileSync } from "fs";
import { prisma } from "../utils/prisma";
import { formatDateOnly } from "../utils/dates";

const CSV_DIR = process.env.CSV_DIR || "C:/Users/thanhnam.tran_ctv/Downloads";

const FILES: Record<string, { file: string; metricId: string; map: (row: Record<string, string>) => Record<string, unknown> }> = {
  retention: {
    file: "gng Retention Summary 7-2-2026, 2-19-20 PM.csv",
    metricId: "new.user_retention",
    map: (r) => ({ new_user: Number(r.new_user ?? r["New User"]), r2: Number(r.r2 ?? r.R2) }),
  },
  device: {
    file: "gng New Device Retention 7-2-2026, 2-19-00 PM.csv",
    metricId: "new.device_retention",
    map: (r) => ({ new_device: Number(r.new_device ?? r["New Device"]), r2: Number(r.r2 ?? r.R2) }),
  },
  active: {
    file: "gng Active User 7-2-2026, 2-20-27 PM.csv",
    metricId: "active.active_user",
    map: (r) => ({ dau: Number(r.dau ?? r.DAU), ar2: Number(r.ar2 ?? r.Ar2) }),
  },
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function loadCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? "";
    });
    return row;
  });
}

async function compare(key: string) {
  const spec = FILES[key]!;
  const path = `${CSV_DIR}/${spec.file}`;
  const rows = loadCsv(path);
  console.log(`\n=== ${spec.metricId} vs ${spec.file} ===`);
  for (const csv of rows) {
    const date = csv.local_dt ?? csv.date ?? csv.Date ?? csv["Local Dt"];
    if (!date) continue;
    const iso = date.includes("-") ? date.slice(0, 10) : `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const expected = spec.map(csv);
    const fact = await prisma.beanDailyFact.findFirst({
      where: { metricId: spec.metricId, dt: new Date(`${iso}T00:00:00Z`) },
    });
    if (!fact) {
      console.log(`  ${iso}: MISSING in DB`);
      continue;
    }
    const m = fact.measures as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(expected)) {
      const got = Number(m[k]);
      const exp = Number(v);
      const ok = Math.abs(got - exp) < 0.02 || (exp === 0 && got === 0);
      parts.push(`${k} csv=${exp} db=${got} ${ok ? "OK" : "MISMATCH"}`);
    }
    console.log(`  ${iso}: ${parts.join(" | ")}`);
  }
}

async function main() {
  const counts = await prisma.beanDailyFact.groupBy({
    by: ["metricId"],
    _count: { _all: true },
  });
  console.log("=== DB fact counts ===");
  for (const c of counts.sort((a, b) => a.metricId.localeCompare(b.metricId))) {
    console.log(`  ${c.metricId}: ${c._count._all}`);
  }
  const au = await prisma.beanDailyFact.findMany({
    where: { metricId: "active.active_user" },
    orderBy: { dt: "asc" },
    select: { dt: true },
  });
  if (au.length) {
    console.log(`\nactive.active_user range: ${formatDateOnly(au[0]!.dt)} -> ${formatDateOnly(au[au.length - 1]!.dt)} (${au.length} days)`);
  }
  for (const key of Object.keys(FILES)) await compare(key);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
