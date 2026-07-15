import "../load-env";
import { getBeanConfig, runQuery } from "../services/bean/client";
import { getMetricDef } from "../services/bean/queries";
import { isoToLocalDt } from "../services/bean/row-utils";

async function probe(date: string) {
  const cfg = getBeanConfig();
  const def = getMetricDef("active.active_user")!;
  const localDt = isoToLocalDt(date);
  const sql = def.rawSql(localDt)[0]!;
  const r = await runQuery(cfg, sql, date);
  console.log(date, "dau=", r.rows[0]?.[0]);
}

async function main() {
  for (const d of ["2026-04-14", "2026-04-15", "2026-05-01", "2026-06-01", "2026-07-07"]) {
    await probe(d);
  }
}
main();
