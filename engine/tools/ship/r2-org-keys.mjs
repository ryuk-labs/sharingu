#!/usr/bin/env node
// tools/ship/r2-org-keys.mjs — org 1's objects moved under their org's prefix (sprint 6, 6.4; docs/plan/PLATFORM.md §2 item 5 and
// §4 6.4: "org 1's objects copied; the old keys read for org 1 until the copy is verified, then deleted"). A SHIP tool: it runs on
// the deployment's credentials from the operator's machine, never through the worker (no app seat reaches another org's
// storage). Every old key is under one of the three roots (inbox/, renders/, backups/) and is org 1's: the only org that ever
// wrote before 6.4. Its new key is o1/<the same key> (src/storage.js). The sprint-6 code also read org 1's bare key on a miss, so
// the app served every object at every step below; from sprint 7 (7.0a) the worker reads o<org>/ alone, so an install still
// holding bare keys serves none of them until this tool's copy has run.
//
//   node tools/ship/r2-org-keys.mjs <step> --bucket <name> (--local <persist dir> | --live) [--state <file>] [--limit <n>] [--deep]
//       [--concurrency <n>] (copy's and delete's lanes: 4 on --live by default, 1 on --local)
//
//   plan    read-only: the bucket's objects by class — old (a root's bare key), copied (its o1/ twin is there), other orgs'
//           (o<n>/ for n > 1), a bare render of another org's project (renders/o<n>--…: a local database of the 6.1–6.3 code
//           only), and anything else (an earlier era's serve/…; never touched by this tool: listed for the operator)
//   copy    each old key without an o1/ twin: read it and write the twin with the same bytes, content type and custom metadata,
//           and RECORD the sha256 (and md5) of every twin it writes in the state file (`copied`: key -> { sha256, md5 }; sprint 6
//           review, finding 12). IDEMPOTENT: a twin already there is never written again (equal: done before; a twin THIS TOOL wrote that
//           differs: a conflict, never superseded — the copy went wrong; a twin it did not write, different and NEWER than the
//           old object: written by the new code since the deploy, the one the app serves — superseded, kept; different and
//           older: a conflict, kept and reported). --limit <n> copies at most n (the small batch first).
//   verify  every old key has its twin: equal size and etag (an MD5 for a single-part object; a multipart etag, or --deep,
//           compares the bytes' sha256), equal content type — or superseded, ONLY for a twin the state file does not claim (a
//           twin this tool wrote must MATCH: a corrupt copy is never "newer, so superseded", and the delete would remove the
//           only good bytes — R2 has no Time Travel). The count and a hash over the old keys' listing (key, size, etag) are
//           written to the state file beside `copied`. Exit 0 only when complete.
//   delete  REFUSES (exit 1, nothing deleted) unless the state file holds a COMPLETE verify of this bucket and a verify run NOW
//           is complete and lists exactly what that one listed (the same count and hash: nothing written to an old key since).
//           Then deletes the old keys it verified, and lists again: no old key left, every twin still there. A run with no
//           old key left answers "nothing to delete" (exit 0): it can run again.
//
// THE SHIP'S ORDER (after the code is live — the new code writes o<org>/ keys only, so no old key is written after it):
//   plan → copy --limit 20 → (the live walk reads an old object through o1/) → copy → verify → delete → verify (0 old left).
//   A copy BEFORE the deploy is safe too: the old code's later writes show as uncopied keys, and verify says so.
//
// BACKENDS: --local <dir> the miniflare state a local worker persists to (`wrangler dev --persist-to <dir>`, so <dir>/v3/r2),
// through wrangler's getPlatformProxy (nothing reaches Cloudflare); --live the Cloudflare API (the account's R2 objects:
// list, get, put, delete), with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment (source the deployment's
// credentials file first; nothing here prints either). The state file defaults to .runs/r2-org-keys/<local|live>-<bucket>.json.
// Exit: 0 done · 1 incomplete, refused or failed · 2 usage.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OLD_RE = /^(?:inbox|renders|backups)\//;
export const HOME = "o1/";
const MD5_RE = /^[0-9a-f]{32}$/;

// ---- the two backends: list(prefix?) -> [{ key, size, etag, contentType, uploaded }], get(key) -> { bytes, contentType,
// customMetadata } | null, put(key, bytes, { contentType, customMetadata }), delete(key), close() ----
export async function localBackend(persistDir, bucket) {
  const { getPlatformProxy } = await import(pathToFileURL(join(ENGINE, "node_modules", "wrangler", "wrangler-dist", "cli.js")).href);
  const tmp = mkdtempSync(join(tmpdir(), "r2-org-keys-"));
  const cfg = join(tmp, "wrangler.jsonc");
  writeFileSync(cfg, JSON.stringify({ name: "r2-org-keys", compatibility_date: "2026-08-01", r2_buckets: [{ binding: "BRAIN", bucket_name: bucket }] }));
  const proxy = await getPlatformProxy({ configPath: cfg, persist: { path: join(resolve(persistDir), "v3") }, remoteBindings: false });
  return bucketOf(proxy.env.BRAIN, bucket, async () => { await proxy.dispose(); rmSync(tmp, { recursive: true, force: true }); });
}
// bucketOf(b, bucket, close) -> the backend over an R2 binding already open (localBackend's; tools/org-undo.mjs opens D1 and R2 in
// one local proxy and hands its bucket here)
export function bucketOf(b, bucket, close = async () => {}) {
  return {
    name: `local:${bucket}`,
    binding: b,
    async list(prefix) {
      const out = []; let cursor;
      do {
        const p = await b.list({ prefix, cursor, limit: 1000, include: ["httpMetadata"] });
        for (const o of p.objects) out.push({ key: o.key, size: o.size, etag: String(o.etag || "").replace(/"/g, ""), contentType: (o.httpMetadata && o.httpMetadata.contentType) || null, uploaded: o.uploaded ? new Date(o.uploaded).getTime() : 0 });
        cursor = p.truncated ? p.cursor : undefined;
      } while (cursor);
      return out;
    },
    async get(key) {
      const o = await b.get(key);
      return o ? { bytes: new Uint8Array(await o.arrayBuffer()), contentType: (o.httpMetadata && o.httpMetadata.contentType) || null, customMetadata: o.customMetadata || {} } : null;
    },
    put: (key, bytes, { contentType, customMetadata } = {}) => b.put(key, bytes, { ...(contentType ? { httpMetadata: { contentType } } : {}), ...(customMetadata && Object.keys(customMetadata).length ? { customMetadata } : {}) }),
    delete: (key) => b.delete(key),
    close,
  };
}

export function liveBackend(bucket, env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error("--live needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (source the deployment's credentials file)");
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/objects`;
  const headers = { authorization: `Bearer ${token}`, "user-agent": "sharingu-r2-org-keys/1.0 (+https://github.com/ryuk-labs/sharingu)" };
  // Every request is bounded (a stalled connection once hung a live copy for two hours) and retried on a transient answer
  // (timeout, network drop, 429, 5xx). Safe: every call is idempotent and every body is in-memory bytes.
  const TIMEOUT_MS = Number(env.R2_TIMEOUT_MS || 120000), TRIES = Number(env.R2_TRIES || 6);
  const transient = (status) => status === 429 || status >= 500;
  const call = async (url, init = {}) => {
    const what = `${init.method || "GET"} ${url.replace(base, "<bucket>")}`;
    for (let attempt = 1; ; attempt++) {
      let r = null, err = null;
      try { r = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
      catch (e) { err = e; }
      if (r && (r.ok || r.status === 404)) return r;
      const reason = err ? `${err.name === "TimeoutError" ? `no answer in ${TIMEOUT_MS / 1000}s` : err.message}` : `HTTP ${r.status}`;
      if ((err || transient(r.status)) && attempt < TRIES) {
        if (r) await r.text().catch(() => {});
        const wait = Math.min(2000 * 2 ** (attempt - 1), 60000);
        console.error(`  ↻ ${what}: ${reason} — retry ${attempt}/${TRIES - 1} in ${wait / 1000}s`);
        await new Promise((ok) => setTimeout(ok, wait));
        continue;
      }
      throw new Error(`${what}: ${reason}${r ? ` ${(await r.text().catch(() => "")).slice(0, 200)}` : ""} (after ${attempt} attempt(s))`);
    }
  };
  const one = (key) => `${base}/${encodeURIComponent(key)}`;
  return {
    name: `live:${bucket}`,
    async list(prefix) {
      const out = []; let cursor = "";
      for (let n = 0; n < 100000; n++) {
        const q = new URLSearchParams({ per_page: "1000", ...(prefix ? { prefix } : {}), ...(cursor ? { cursor } : {}) });
        const j = await (await call(`${base}?${q}`)).json();
        for (const o of j.result || []) out.push({ key: o.key, size: Number(o.size), etag: String(o.etag || "").replace(/"/g, ""),
          contentType: (o.http_metadata && (o.http_metadata.contentType || o.http_metadata.content_type)) || null, uploaded: o.last_modified ? Date.parse(o.last_modified) : 0 });
        cursor = (j.result_info && j.result_info.cursor) || "";
        if (!cursor || (j.result_info && j.result_info.is_truncated === false) || !(j.result || []).length) break;
      }
      return out;
    },
    async get(key) {
      const r = await call(one(key));
      if (r.status === 404) return null;
      return { bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get("content-type"), customMetadata: {} };
    },
    put: (key, bytes, { contentType } = {}) => call(one(key), { method: "PUT", body: bytes, headers: contentType ? { "content-type": contentType } : {} }),
    delete: (key) => call(one(key), { method: "DELETE" }),
    async close() {},
  };
}

// ---- the steps (each takes a backend; the CLI below and tools/r2-org-keys-selftest.mjs drive them) ----
const sha = (u8) => createHash("sha256").update(u8).digest("hex");
// classify(objects) -> { old: Map(key -> o), twin: Map(key -> o of its o1/ twin), otherOrgs: n, other: [keys], foreign: [keys] }
export function classify(objects) {
  const old = new Map(), home = new Map(), other = [];
  let otherOrgs = 0;
  const foreign = [];
  for (const o of objects) {
    // a bare render of another org's project (renders/o<n>--<slug>/…, n > 1: only a local database run by the 6.1–6.3 code holds
    // one) is never org 1's: listed, never copied or deleted
    const m = /^renders\/o([1-9]\d*)--/.exec(o.key);
    if (m && m[1] !== "1") foreign.push(o.key);
    else if (OLD_RE.test(o.key)) old.set(o.key, o);
    else if (o.key.startsWith(HOME)) home.set(o.key.slice(HOME.length), o);
    else if (/^o[1-9]\d*\//.test(o.key)) otherOrgs++;
    else other.push(o.key);
  }
  const twin = new Map([...old.keys()].filter((k) => home.has(k)).map((k) => [k, home.get(k)]));
  return { old, twin, home, otherOrgs, other, foreign };
}
// listingOf(old) -> { n, hash }: the old keys' count and a hash over their (key, size, etag), sorted
export function listingOf(old) {
  const h = createHash("sha256");
  for (const k of [...old.keys()].sort()) { const o = old.get(k); h.update(`${k}\t${o.size}\t${o.etag}\n`); }
  return { n: old.size, hash: h.digest("hex") };
}
// sameObject(backend, a, b, deep) -> true when the two listings name the same bytes (and the same content type)
async function sameObject(backend, a, b, deep) {
  if (a.size !== b.size || (a.contentType || null) !== (b.contentType || null)) return false;
  if (!deep && MD5_RE.test(a.etag) && MD5_RE.test(b.etag)) return a.etag === b.etag;
  const [x, y] = [await backend.get(a.key), await backend.get(b.key)];
  return !!x && !!y && sha(x.bytes) === sha(y.bytes);
}

export async function plan(backend) {
  const c = classify(await backend.list());
  return { step: "plan", bucket: backend.name, old: c.old.size, copied: c.twin.size, toCopy: c.old.size - c.twin.size, home: c.home.size,
    otherOrgs: c.otherOrgs, other: c.other.length, otherKeys: c.other.slice(0, 20), foreign: c.foreign.length, foreignKeys: c.foreign.slice(0, 20), byRoot: Object.fromEntries(["inbox/", "renders/", "backups/"].map((r) => [r, [...c.old.keys()].filter((k) => k.startsWith(r)).length])) };
}

// copy(backend, { limit, deep, claimed, written }) -> the copy. `written` (an object the caller holds: key -> { sha256, md5 } of the
// bytes this run wrote to its twin, filled BEFORE each put, so a run that throws part way still names what it wrote) is what the
// CLI adds to the state file's `copied`. `claimed` (that map from earlier runs): a twin this tool wrote is never superseded.
// record(k, rec) is called BEFORE each put (the CLI appends it to a journal, so a killed run keeps its claims); progress(n, left)
// after each put
export async function copy(backend, { limit = Infinity, deep = false, claimed = {}, written = {}, record = null, progress = null, concurrency = 1 } = {}) {
  const c = classify(await backend.list());
  let copied = 0, already = 0, superseded = 0, repaired = 0;
  const conflicts = [], todo = [];
  for (const [k, o] of [...c.old].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const t = c.twin.get(k);
    if (t) {
      if (await sameObject(backend, o, { ...t, key: HOME + k }, deep)) { already++; continue; }
      // the same bytes (size and MD5 etag) under another content type: a copy that took the download's DEFAULT type for an
      // object stored with none (the live REST GET answers text/plain then) — re-put with the stored type, never a conflict
      if (o.size === t.size && MD5_RE.test(o.etag) && o.etag === t.etag) { if (todo.length < limit) { todo.push(k); repaired++; } continue; }
      if (!(k in claimed) && t.uploaded > o.uploaded) superseded++;
      else conflicts.push(k);
      continue;
    }
    if (todo.length < limit) todo.push(k);
  }
  // a few at once: each object is a GET and a PUT of ~1-3 s from the operator's machine; 4 lanes keep the account's API
  // under its rate limit (about 4 requests a second), and a 429 is retried by the backend anyway
  const lanes = Math.max(1, Math.min(Number(concurrency) || 1, 16));
  let next = 0;
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (next < todo.length) {
      const k = todo[next++];
      const body = await backend.get(k);
      if (!body) continue;   // deleted since the listing: nothing to copy
      written[k] = { sha256: sha(body.bytes), md5: createHash("md5").update(body.bytes).digest("hex") };
      if (record) record(k, written[k]);
      // the content type the LISTING stores (null when none was), never the download's header (a default for a typeless object)
      await backend.put(HOME + k, body.bytes, { contentType: c.old.get(k).contentType, customMetadata: body.customMetadata });
      copied++;
      if (progress) progress(copied, todo.length - copied);
    }
  }));
  const left = Math.max(0, c.old.size - c.twin.size - (copied - repaired));
  return { step: "copy", bucket: backend.name, old: c.old.size, copied, repaired, already, superseded, conflicts, left };
}

// claimedMatch(backend, k, o, t, rec, deep) -> true when the twin this tool wrote is the bytes it meant to write AND its old object's:
// by the listing's MD5 etags against the recorded md5 (a single-part object), else (a multipart etag, --deep, a record with no
// md5) the bytes' sha256 against the recorded sha256; the content types equal
async function claimedMatch(backend, k, o, t, rec, deep) {
  const want = typeof rec === "string" ? { sha256: rec } : rec || {};
  if (o.size !== t.size || (o.contentType || null) !== (t.contentType || null)) return false;
  if (!deep && want.md5 && MD5_RE.test(o.etag) && MD5_RE.test(t.etag)) return o.etag === want.md5 && t.etag === want.md5;
  const [x, y] = [await backend.get(k), await backend.get(HOME + k)];
  return !!x && !!y && sha(x.bytes) === want.sha256 && sha(y.bytes) === want.sha256;
}
// verify(backend, { deep, claimed }) -> the verify. `claimed`: the state file's `copied` (key -> { sha256, md5 }): such a twin must
// MATCH (claimedMatch: a corrupt write never passes as "newer, so superseded") — else it differs and the verify is incomplete.
export async function verify(backend, { deep = false, claimed = {} } = {}) {
  const c = classify(await backend.list());
  const missing = [], differ = [];
  let equal = 0, superseded = 0;
  for (const [k, o] of c.old) {
    const t = c.twin.get(k);
    if (!t) { missing.push(k); continue; }
    if (k in claimed) { if (await claimedMatch(backend, k, o, { ...t, key: HOME + k }, claimed[k], deep)) equal++; else differ.push(k); continue; }
    if (await sameObject(backend, o, { ...t, key: HOME + k }, deep)) equal++;
    else if (t.uploaded > o.uploaded) superseded++;
    else differ.push(k);
  }
  const l = listingOf(c.old);
  return { step: "verify", bucket: backend.name, old: c.old.size, equal, superseded, missing: missing.length, differ: differ.length,
    missingKeys: missing.slice(0, 20), differKeys: differ.slice(0, 20), complete: !missing.length && !differ.length, listing: l, at: new Date().toISOString() };
}

// del(backend, stamp) -> the deletion, or { refused } (nothing deleted)
export async function del(backend, stamp, { deep = false, concurrency = 1, progress = null } = {}) {
  const now = await verify(backend, { deep, claimed: (stamp && stamp.copied) || {} });
  if (!now.old) return { step: "delete", bucket: backend.name, deleted: 0, note: "nothing to delete: no old key is left" };
  if (!stamp || stamp.bucket !== backend.name || !stamp.complete) return { step: "delete", refused: "no complete verify of this bucket in the state file: run verify first", deleted: 0 };
  if (!now.complete) return { step: "delete", refused: `the copy is not complete now (${now.missing} missing, ${now.differ} differ): run copy, then verify`, deleted: 0, verify: now };
  if (now.listing.n !== stamp.listing.n || now.listing.hash !== stamp.listing.hash) {
    return { step: "delete", refused: `the old keys changed since the verify (${stamp.listing.n} then, ${now.listing.n} now): run copy, then verify again`, deleted: 0 };
  }
  const c = classify(await backend.list());
  let deleted = 0;
  // (an untwinned key cannot appear after a complete verify of the same listing; it is never deleted)
  const doomed = [...c.old.keys()].sort().filter((k) => c.twin.has(k));
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(concurrency) || 1, 16)) }, async () => {
    while (next < doomed.length) {
      await backend.delete(doomed[next++]);
      deleted++;
      if (progress) progress(deleted, doomed.length - deleted);
    }
  }));
  const after = classify(await backend.list());
  const kept = [...c.old.keys()].every((k) => after.home.has(k));
  return { step: "delete", bucket: backend.name, deleted, left: after.old.size, twinsKept: kept, ok: after.old.size === 0 && kept };
}

// ---- the CLI ----
async function main(argv) {
  const step = argv[0];
  const flag = (n) => { const i = argv.indexOf(n); return i > 0 ? argv[i + 1] : undefined; };
  const bucket = flag("--bucket"), local = flag("--local"), live = argv.includes("--live"), deep = argv.includes("--deep");
  const limit = flag("--limit") != null ? Math.max(0, Math.floor(Number(flag("--limit")))) : Infinity;
  // --concurrency <n> lanes for copy (default 4 on --live, where each object is a slow API round-trip; 1 on --local)
  if (!["plan", "copy", "verify", "delete"].includes(step) || !bucket || (!local === !live) || Number.isNaN(limit)) {
    console.error("usage: node tools/ship/r2-org-keys.mjs <plan|copy|verify|delete> --bucket <name> (--local <persist dir> | --live) [--state <file>] [--limit <n>] [--deep]");
    return 2;
  }
  const statePath = resolve(flag("--state") || join(ENGINE, ".runs", "r2-org-keys", `${live ? "live" : "local"}-${bucket}.json`));
  const backend = live ? liveBackend(bucket) : await localBackend(local, bucket);
  // the state file: the last verify's stamp and `copied` (every twin this tool wrote, key -> sha256), kept across runs
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
  if (state && state.bucket && state.bucket !== backend.name) { console.error(`✗ ${statePath} is the state of ${state.bucket}, not ${backend.name}`); await backend.close(); return 2; }
  const claimed = (state && state.copied) || {};
  // the journal: one line per twin, appended BEFORE its put — a run killed mid-copy (a reboot, SIGKILL) keeps every claim it
  // made; the next run merges it, and save() folds it into the state and empties it
  const journalPath = statePath + ".journal";
  if (existsSync(journalPath)) for (const line of readFileSync(journalPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const { k, rec } = JSON.parse(line); claimed[k] = rec; } catch { /* a torn last line: its put never ran either */ }
  }
  const save = (x) => {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ bucket: backend.name, ...x, copied: claimed }, null, 2) + "\n");
    if (existsSync(journalPath)) writeFileSync(journalPath, "");
  };
  try {
    let out, rc = 0;
    if (step === "plan") out = await plan(backend);
    else if (step === "copy") {
      // each twin's sha256 is recorded as it is written (before its put), kept even when a later put of the run throws; a copy
      // voids the last verify's stamp (delete needs a verify after it)
      const written = {}, t0 = Date.now();
      mkdirSync(dirname(statePath), { recursive: true });
      const record = (k, rec) => appendFileSync(journalPath, JSON.stringify({ k, rec }) + "\n");
      const progress = (n, left) => { if (n % 50 === 0 || left === 0) console.error(`  · copied ${n} · ${left} left · ${Math.round((Date.now() - t0) / 1000)}s`); };
      const concurrency = flag("--concurrency") != null ? Number(flag("--concurrency")) : (argv.includes("--live") ? 4 : 1);
      try { out = await copy(backend, { limit, deep, claimed, written, record, progress, concurrency }); } finally { Object.assign(claimed, written); save(state && state.listing ? { complete: false, listing: state.listing, at: state.at, old: state.old } : {}); }
      out.recorded = Object.keys(written).length; out.state = statePath;
      rc = out.conflicts.length ? 1 : 0;
    } else if (step === "verify") {
      out = await verify(backend, { deep, claimed });
      save({ complete: out.complete, listing: out.listing, at: out.at, old: out.old });
      out.state = statePath;
      rc = out.complete ? 0 : 1;
    } else {
      const lanes = flag("--concurrency") != null ? Number(flag("--concurrency")) : (argv.includes("--live") ? 4 : 1), t0 = Date.now();
      out = await del(backend, state, { deep, concurrency: lanes, progress: (n, left) => { if (n % 100 === 0 || left === 0) console.error(`  · deleted ${n} · ${left} left · ${Math.round((Date.now() - t0) / 1000)}s`); } });
      rc = out.refused || out.ok === false ? 1 : 0;
    }
    console.log(JSON.stringify(out, null, 2));
    return rc;
  } finally { await backend.close(); }
}

// run directly (REAL paths: a symlinked checkout or temp dir must still run the CLI)
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) {
  main(process.argv.slice(2)).then((rc) => process.exit(rc), (e) => { console.error(`✗ ${String((e && e.message) || e)}`); process.exit(1); });
}
