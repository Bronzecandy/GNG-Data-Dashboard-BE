import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import path from "path";

/**
 * Merge profile_*.json files into docs/bean/gng-data-catalog-generated.md
 *
 * Usage: npx tsx src/scripts/bean-catalog-merge.ts
 */

const OUT_DIR = path.resolve(process.cwd(), "discovery");
const DOC = path.resolve(process.cwd(), "../docs/bean/gng-data-catalog-generated.md");

interface Profile {
  table?: string;
  status: string;
  columns?: string[];
  scopedTo?: string;
  error?: string;
  notes?: string[];
  payloadFields?: string[];
}

function main() {
  if (!existsSync(OUT_DIR)) {
    console.error("No discovery/ folder");
    process.exit(1);
  }

  const profiles: Profile[] = [];
  for (const f of readdirSync(OUT_DIR)) {
    if (!f.startsWith("profile_") || !f.endsWith(".json")) continue;
    try {
      profiles.push(JSON.parse(readFileSync(path.join(OUT_DIR, f), "utf-8")) as Profile);
    } catch {
      /* skip */
    }
  }

  profiles.sort((a, b) => (a.table ?? "").localeCompare(b.table ?? ""));

  const byDb: Record<string, Profile[]> = {};
  for (const p of profiles) {
    const t = p.table ?? "unknown";
    const db = t.includes(".") ? t.split(".")[0]! : "unknown";
    (byDb[db] ??= []).push(p);
  }

  const lines: string[] = [
    "# GNG Data Catalog — Auto-generated",
    "",
    `Generated from ${profiles.length} profile files in \`be/discovery/\`.`,
    "Re-run: `npx tsx src/scripts/bean-catalog-merge.ts` after bulk discover.",
    "",
  ];

  for (const db of Object.keys(byDb).sort()) {
    const list = byDb[db]!;
    const ok = list.filter((p) => p.status === "ok");
    const partial = list.filter((p) => p.status === "partial");
    const err = list.filter((p) => p.status !== "ok" && p.status !== "partial");
    lines.push(`## Database \`${db}\` (${ok.length} ok, ${partial.length} partial, ${err.length} failed)`, "");

    for (const p of [...ok, ...partial]) {
      lines.push(`### \`${p.table}\`${p.status === "partial" ? " _(partial — STRUCT)_" : ""}`);
      lines.push(`- Partition filter used: ${p.scopedTo ?? "?"}`);
      if (p.notes?.length) {
        for (const note of p.notes) lines.push(`- Note: ${note}`);
      }
      lines.push(`- Columns (${p.columns!.length}): \`${p.columns!.join("`, `")}\``);
      lines.push("");
    }

    if (err.length > 0) {
      lines.push("### Failed tables", "");
      for (const p of err) {
        lines.push(`- \`${p.table}\`: ${p.error ?? "unknown"}`);
      }
      lines.push("");
    }
  }

  writeFileSync(DOC, lines.join("\n"), "utf-8");
  console.log(`Wrote ${DOC} (${profiles.length} profiles)`);
}

main();
