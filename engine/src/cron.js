// src/cron.js — the cron (twice a day, ADR-016; src/index.js workerHandler.scheduled hands it the run). Sprint 6, 6.4
// (docs/plan/PLATFORM.md §4: the cron loops over orgs inside its CPU): ONE database holds many orgs, so every step runs once
// per org, as the deployment for that org (src/data.js platformEnv: never a caller's request), each best-effort — one org's
// or one step's failure never stops the rest:
//   1. the report backfill (ADR-074, src/core.js backfillReports): the org's own rows, its owner, its domain;
//   2. the nightly backup into the org's own storage prefix (PRD A3 / ADR-082 §4, src/backup.js; o<org>/backups/d1/<day>/…),
//      recorded as ONE events row of the org's, success or failure (G2 item 9: never silent; Control · Admin shows it);
//   3. the expired previews of the org's projects (sprint 3 D3, src/preview.js prunePreviews).
// And ONCE a run, before the orgs (sprint 21, 21.4b): THE 90-DAY CLEARING of the platform's requests for a beta place (src/requestaccess.js
// clearStale: a declined request 90 days after its decline, an approved one that founded no org 90 days after its approval — the
// profile emptied, the counts kept; at most CLEAR_BATCH of each kind a run, by two partial indexes: a bounded step). The requests are
// no org's rows, so it runs on the deployment's own env, before any org's; its failure, like any step's, stops nothing.
// THE BOUND: at most CRON_ORGS_PER_RUN orgs a run, in id order. With more orgs than that, each run starts where the window
// of the run before ended (cronWindow: the window moves by the budget with each half-day of the schedule, so no state is
// kept and every org comes round within ceil(orgs / budget) runs); today's handful all fit every run. The org list is ONE
// statement on the org table (ids only).
import { db, platformEnv } from "./data.js";
import { backfillReports, backupDump } from "./core.js";
import { inRequest, setOrgBase } from "./orgpath.js";
import { recordBackup } from "./backup.js";
import { getTenantConfig } from "./tenant.js";
import { prunePreviews } from "./preview.js";
import { clearStale } from "./requestaccess.js";   // sprint 21, 21.4b: the 90-day clearing

export const CRON_ORGS_PER_RUN = 20;
const HALF_DAY_MS = 12 * 3600e3;   // the schedule: twice a day (wrangler.jsonc triggers)
export const CRON_ORGS_SQL = "SELECT id FROM org ORDER BY id";

// cronWindow(ids, at, budget) -> the orgs this run serves: every one when they fit the budget, else `budget` of them in id
// order (wrapping), starting at (the run's half-day number × budget) mod the count
export function cronWindow(ids, at, budget = CRON_ORGS_PER_RUN) {
  if (ids.length <= budget) return ids.slice();
  const start = (Math.floor(at / HALF_DAY_MS) * budget) % ids.length;
  return Array.from({ length: budget }, (_, i) => ids[(start + i) % ids.length]);
}

// runCron(env, at) -> { clear, orgs: [ids this run], ran: [{ org, backfill, backup, prune }] } (each step's result or its error;
// clear: { declined, abandoned } the requests cleared, or its error)
export async function runCron(env, at = Date.now()) {
  let clear;
  try { clear = await clearStale(env, new Date(at).toISOString()); } catch (e) { clear = { error: String((e && e.message) || e).slice(0, 200) }; }
  const all = ((await db(env).prepare(CRON_ORGS_SQL).all()).results || []).map((r) => Number(r.id)).filter((n) => Number.isSafeInteger(n) && n >= 1);
  const orgs = cronWindow(all, at);
  const ran = [];
  for (const org of orgs) {
    const one = platformEnv(env, org);
    const out = { org };
    const said = (e) => String((e && e.message) || e).slice(0, 200);
    // ADR-074: origin = the org's domain (its row's settings, src/tenant.js — the cron has no request URL)
    // sprint 7, 7.4: the report's links carry the org's address (src/orgpath.js), the cron's own context per org
    try { const r = await inRequest(async () => { const t = await getTenantConfig(one); setOrgBase(t.slug); return backfillReports(one, t.domain, false); }); out.backfill = r.backfilled || 0; } catch (e) { out.backfill = { error: said(e) }; }
    try {
      const r = await backupDump(one, false);
      out.backup = r.key;
      try { await recordBackup(one, r); } catch { /* the record's own failure never stops the cron */ }
    } catch (e) {
      out.backup = { error: said(e) };
      try { await recordBackup(one, { error: said(e) }); } catch { /* the same */ }
    }
    try { out.prune = (await prunePreviews(one, at)).deleted; } catch (e) { out.prune = { error: said(e) }; }
    ran.push(out);
  }
  return { clear, orgs, ran };
}
