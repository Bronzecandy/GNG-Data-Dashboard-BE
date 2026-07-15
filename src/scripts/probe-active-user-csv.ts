import "../load-env";
import { getBeanConfig, runQuery } from "../services/bean/client";

/** Cross-check active_user sources vs CSV sample (VN, 2026-01-01..05). */
const CSV: Record<string, { dau: number; a2: number; ar2: number }> = {
  "20260101": { dau: 11274, a2: 14920, ar2: 60.2 },
  "20260102": { dau: 10126, a2: 14613, ar2: 63.89 },
  "20260103": { dau: 9509, a2: 13165, ar2: 65.04 },
  "20260104": { dau: 9186, a2: 12510, ar2: 60.53 },
  "20260105": { dau: 7864, a2: 11490, ar2: 68.5 },
};

function flag(col: string): string {
  return `CASE WHEN CAST(${col} AS string) IN ('true','1') THEN 1 ELSE 0 END`;
}

async function main() {
  const cfg = getBeanConfig();
  console.log("=== active_user source cross-check vs CSV ===\n");

  for (const [localDt, exp] of Object.entries(CSV)) {
    const iso = `${localDt.slice(0, 4)}-${localDt.slice(4, 6)}-${localDt.slice(6, 8)}`;

    const dwsDau = await runQuery(
      cfg,
      `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='${localDt}' AND last_active_ip_region='VN'`,
      `${iso} dws dau`,
    );
    const dmAgg = await runQuery(
      cfg,
      `SELECT SUM(DAU) AS dau, SUM(A2) AS a2 FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='${localDt}' AND ip_region='VN'`,
      `${iso} dm agg`,
    );
    const ar2 = await runQuery(
      cfg,
      `SELECT ROUND(AVG(${flag("is_ar2")})*100,2) AS ar2 FROM gng_cooked_ob.dws_user_active_account_retention_d_i WHERE local_dt='${localDt}' AND last_active_ip_region='VN' AND last_active_region='SG'`,
      `${iso} ar2`,
    );

    const dws = Number(dwsDau.rows[0]?.[0]);
    const dmDau = Number(dmAgg.rows[0]?.[0]);
    const dmA2 = Number(dmAgg.rows[0]?.[1]);
    const ar = Number(ar2.rows[0]?.[0]);

    console.log(iso);
    console.log(`  CSV     dau=${exp.dau} a2=${exp.a2} ar2=${exp.ar2}%`);
    console.log(`  dws     dau=${dws} ${dws === exp.dau ? "OK" : "DIFF"}`);
    console.log(`  dm VN   dau=${dmDau} a2=${dmA2} ${dmDau === exp.dau && dmA2 === exp.a2 ? "OK" : "DIFF"}`);
    console.log(`  ar2 fix ar2=${ar}% ${Math.abs(ar - exp.ar2) < 0.15 ? "OK" : "DIFF"}`);
    console.log();
  }

  // Early 2025 sample (other metrics start ~2025-01-02)
  for (const localDt of ["20250102", "20250103"]) {
    const iso = `${localDt.slice(0, 4)}-${localDt.slice(4, 6)}-${localDt.slice(6, 8)}`;
    const dwsDau = await runQuery(
      cfg,
      `SELECT COUNT(*) AS dau FROM gng_cooked_ob.dws_user_active_account_d_i WHERE local_dt='${localDt}' AND last_active_ip_region='VN'`,
      `${iso} dws dau`,
    );
    const dmAgg = await runQuery(
      cfg,
      `SELECT SUM(DAU) AS dau, SUM(A2) AS a2 FROM gng_cooked_ob.dm_user_active_account_1d_i WHERE local_dt='${localDt}' AND ip_region='VN'`,
      `${iso} dm agg`,
    );
    console.log(`${iso} early: dws dau=${dwsDau.rows[0]?.[0]}, dm dau=${dmAgg.rows[0]?.[0]}, dm a2=${dmAgg.rows[0]?.[1]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
