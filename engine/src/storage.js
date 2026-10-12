// src/storage.js — THE storage keys (sprint 6, 6.4; docs/plan/PLATFORM.md §2 item 5: storage carries the org). One bucket holds
// every org's objects; every R2 read and write the worker makes goes through this module, as every statement goes through
// src/data.js, and the org an object lies under is the READER's (the sign-in; the cron's, src/data.js platformEnv), never a
// parameter. tools/check-scoped-data.py (a gate step) fails the raw binding (.BRAIN) and an R2 key written outside this file.
//
// THE KEY: o<org>/<logical key>. The logical key is what the code always wrote (renders/<project>/<hash>,
// inbox/artifacts/<month>/<person>/<hash>.<ext>, inbox/handoffs/[eval/]<month>/<id>.json, backups/d1/<day>/…) and what D1 keeps
// (artifacts.r2_key); the org prefix is added here alone, for EVERY org (org 1 too): the org's number, as the project key
// carries it (o<org>--<slug>, migrate-067), so renaming an org never moves an object. No new key can equal an old one: every
// logical key starts with one of ROOTS, and no root is o<n>/.
//
//   store(env)            the reader's org's objects: { org, keyOf(k), put(k, body, opts), get(k), head(k), sweep(prefix) }
//   storeOfRow(env, row)  the objects of the org a D1 row names (row.org): ONLY for a file read by its exact id after the row's
//                         own rule admitted the reader (src/core.js mayReadArtifact: a public file's link answers from any org,
//                         ADR-055 as ruled 2026-10-06; anything else only inside its own org). tools/check-scoped-data.py names
//                         its two callers.
//
// A key without the org prefix (a bare logical key, as the code before 6.4 wrote) is read by NO org, org 1 included: the
// sprint-6 ship copied org 1's under o1/ and deleted them (tools/ship/r2-org-keys.mjs, kept for a self-hosted install's move).
import { readerOrg } from "./data.js";

// the three roots every logical key starts with (anything else is never written, and a read of it answers no object)
export const ROOTS = ["inbox/", "renders/", "backups/"];
const ROOT_RE = /^(?:inbox|renders|backups)\//;
// orgPrefix(org) -> "o<org>/"; ORG_KEY_RE reads it back
export const orgPrefix = (org) => `o${org}/`;
export const ORG_KEY_RE = /^o([1-9]\d*)\//;

// ---- the logical keys (the only place they are spelled) ----
// a render's body: content-addressed per project, so the same bytes are stored once and a retry is harmless
export const renderKey = (project, hash) => `renders/${project}/${hash}`;
// a banked file: the month's inbox, then its owner's id (a person's, or CRON_REPORT_OWNER for the cron's batch reports)
export const artifactKey = (month, owner, hash, ext) => `inbox/artifacts/${month}/${owner}/${hash}.${ext}`;
export const CRON_REPORT_OWNER = "agent-r";
// a batch report the cron banked: its body under the engine's own owner segment, which no person's id ever is
export const CRON_REPORT_KEY_RE = /^inbox\/artifacts\/[^/]+\/agent-r\//;
// a session's report (wrap_up / POST /handoff); a suite's under its own prefix, which clean-eval sweeps
export const HANDOFF_EVAL_PREFIX = "inbox/handoffs/eval/";
export const handoffKey = (isEval, month, id) => `${isEval ? HANDOFF_EVAL_PREFIX : "inbox/handoffs/"}${month}/${id}.json`;
// the backup: one object per page and the manifest under the day; the suites' window its own object
export const backupDayPrefix = (day) => `backups/d1/${day}/`;
export const backupEvalKey = (day) => `backups/d1/${day}.eval.json`;

const validOrg = (o) => Number.isSafeInteger(o) && o >= 1;
const fail = (code, note) => Object.assign(new Error(`${code}: ${note}`), { code });
// logical(k) -> k, or refused: only a key under one of ROOTS is ever stored (a READ of any other key answers no object without
// reaching the bucket: an old row naming a key of an earlier era reads as missing, never as a 500)
function logical(k) {
  const s = String(k ?? "");
  if (!ROOT_RE.test(s)) throw fail("storage_key", `not a storage key: ${s.slice(0, 60)}`);
  return s;
}
const isKey = (k) => ROOT_RE.test(String(k ?? ""));

function handle(env, org) {
  const b = env && env.BRAIN;
  const at = (k) => orgPrefix(org) + logical(k);
  return {
    org,
    // keyOf(k) -> where the object lies (an answer naming the backup's manifest)
    keyOf: at,
    put: (k, body, opts) => b.put(at(k), body, opts),
    async get(k) { return isKey(k) ? b.get(at(k)) : null; },
    // head(k) -> the object's metadata, or null (also when the binding has no head: a unit test's bare bucket)
    async head(k) {
      if (!b || typeof b.head !== "function" || !isKey(k)) return null;
      return b.head(at(k));
    },
    // sweep(prefix) -> how many objects under the org's prefix were deleted
    async sweep(prefix) {
      const p = at(prefix);
      let n = 0, cursor;
      do {
        const page = await b.list({ prefix: p, cursor });
        for (const o of page.objects) { await b.delete(o.key); n++; }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return n;
    },
  };
}

// store(env) -> the signed-in reader's org's objects (no sign-in: refused, never org 1's)
export function store(env) {
  const org = readerOrg(env);
  if (!validOrg(org)) throw fail("org_unknown", "a storage key names the org and no one is signed in");
  return handle(env, org);
}
// storeOfRow(env, row) -> the objects of the org the row names (a file read by its exact id; see the header)
export function storeOfRow(env, row) {
  const org = Number(row && row.org);
  if (!validOrg(org)) throw fail("org_unknown", "the file's row carries no org");
  return handle(env, org);
}
// hasStore(env) -> whether this env carries a bucket at all (a unit test's env may not)
export const hasStore = (env) => !!(env && env.BRAIN);
