import "../load-env";
import { readFileSync } from "fs";
import { prisma } from "../utils/prisma";

const CSV_PATH = "c:/Users/thanhnam.tran_ctv/Downloads/gng Churn 7-2-2026, 2-21-13 PM.csv";

const RATE_MAP = [
  { csv: "C2 Rate", db: "c2_rate" },
  { csv: "C3 Rate", db: "c3_rate" },
  { csv: "C4 Rate", db: "c4_rate" },
  { csv: "C5 Rate", db: "c5_rate" },
  { csv: "C6 Rate", db: "c6_rate" },
  { csv: "C7 Rate", db: "c7_rate" },
  { csv: "C14 Rate", db: "c14_rate" },
  { csv: "C30 Rate", db: "c30_rate" },
] as const;

function parsePct(s: string): number {
  return Number(String(s).replace("%", "").trim());
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (vals[i] ?? "").trim();
    });
    return row;
  });
}

async function main() {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf-8"));
  console.log("=== Churn CSV vs DB (counts + all rates) ===\n");

  let rateDiffSum = 0;
  let rateCells = 0;
  let countOk = 0;
  let countCells = 0;

  for (const csv of rows) {
    const iso = csv.Date;
    const fact = await prisma.beanDailyFact.findFirst({
      where: { metricId: "active.churn", dt: new Date(`${iso}T00:00:00Z`) },
    });
    if (!fact) {
      console.log(iso, "MISSING DB");
      continue;
    }
    const m = fact.measures as Record<string, number>;

    console.log(`--- ${iso} ---`);
    for (const key of ["C2", "C3", "C4", "C5", "C6", "C7", "C14", "C30"] as const) {
      const dbKey = key.toLowerCase() as keyof typeof m;
      const ok = Number(csv[key]) === m[dbKey];
      countCells++;
      if (ok) countOk++;
      console.log(`  ${key}: csv=${csv[key]} db=${m[dbKey]} ${ok ? "OK" : "MISMATCH"}`);
    }

    console.log("  rates:");
    for (const { csv: csvKey, db } of RATE_MAP) {
      const csvVal = parsePct(csv[csvKey]);
      const dbVal = m[db] ?? 0;
      const diff = Math.round((dbVal - csvVal) * 100) / 100;
      rateDiffSum += Math.abs(diff);
      rateCells++;
      const ok = Math.abs(diff) <= 0.01;
      console.log(
        `    ${csvKey}: csv=${csvVal}% db=${dbVal}% Δ${diff >= 0 ? "+" : ""}${diff}pp ${ok ? "OK" : ""}`,
      );
    }
    console.log();
  }

  console.log("Summary:");
  console.log(`  counts match: ${countOk}/${countCells}`);
  console.log(`  rates avg |Δ|: ${(rateDiffSum / rateCells).toFixed(3)}pp across ${rateCells} cells`);
}

main().finally(() => prisma.$disconnect());
