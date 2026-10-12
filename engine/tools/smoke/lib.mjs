// tools/smoke/lib.mjs — what every smoke case file shares: the door (HTTP to /mcp tools/call, the REST twins, POST /control
// for the people and projects a case needs), the case list, and `s`, the state earlier cases leave for later ones.
//   SMOKE_URL=http://127.0.0.1:<port> SMOKE_CREDS=<the org's credentials.env>   (tools/smoke.sh sets both)
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { reservedNames } from "../../src/orgnames.js";

export const BASE = String(process.env.SMOKE_URL || "").replace(/\/+$/, "");
const CREDS = process.env.SMOKE_CREDS || "";
if (!BASE || !CREDS) { console.error("usage: SMOKE_URL=<worker url> SMOKE_CREDS=<credentials.env> node tools/smoke.mjs (sh tools/smoke.sh sets both)"); process.exit(2); }
export const ownerKey = (readFileSync(CREDS, "utf8").match(/^[A-Z0-9_]+_AGENT_R_OWNER_KEY=(\S+)$/m) || [])[1];
if (!ownerKey) { console.error(`no *_AGENT_R_OWNER_KEY line in ${CREDS}`); process.exit(2); }

// ---- the door ----
// patientFetch: wrangler dev drops a socket when the shared Mini is briefly starved (another project's device runs), so a
// TRANSIENT connection failure is retried with patience. Only socket-level failures retry — an HTTP answer, whatever its
// status, is the case's own to judge and is never retried here.
export const patientFetch = async (...a) => {
  for (const wait of [250, 2000, 8000]) {
    try { return await globalThis.fetch(...a); }
    catch (e) {
      const s = String((e && e.message) || e) + String((e && e.cause) || "");
      if (!/fetch failed|socket|ECONNRESET|ECONNREFUSED|UND_ERR/i.test(s)) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return globalThis.fetch(...a);
};
const fetch = patientFetch;   // every door call in this module rides it
export const sha = (s) => createHash("sha256").update(s).digest("hex");
// a person's read-only credential (src/core.js resolveReadOnly): sha256(sha256(key) + the read-only suffix)
export const readOnlyOf = (key) => sha(sha(key) + ":agent-r-read-only:v1");
export async function http(method, path, { key, body, form, cookie, accept, root = false, nav = false } = {}) {
  const headers = { accept: accept || "application/json" };
  if (key) headers.authorization = "Bearer " + key;
  // a browser's session (sprint 7, 7.4: it signs in only under its org's address, /<org>/…), sent as a same-origin browser does
  if (cookie) { headers.cookie = "__Host-ar_session=" + cookie; headers["sec-fetch-site"] = "same-origin"; }
  // nav: a browser's page navigation (node's fetch says Sec-Fetch-Mode cors, a script, unless told otherwise)
  if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
  let payload;
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  // root: the request is sent exactly where the case names it (s41-bypath asks the root itself)
  const r = await fetch(BASE + (root ? path : await sessionPath(headers.cookie, path)), { method, headers, body: payload, redirect: "manual" });
  const raw = await r.text();
  // every case before s41 reads its answers as the routes they name: the org base each link carries (sprint 7, 7.4, src/orgpath.js)
  // is taken off here (tests follow the code: s41-bypath proves every link carries it)
  const text = await unbased(raw);
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text, raw, location: await unbased(r.headers.get("location") || ""), locationRaw: r.headers.get("location") || "", setCookie: r.headers.get("set-cookie") || "" };
}
let rpcId = 0;
// mcp(key, tool, args) -> the tool's answer (the JSON text parsed), with isError beside it
export async function mcp(key, name, args = {}) {
  const r = await http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } } });
  const res = r.json && r.json.result;
  if (!res) throw new Error(`/mcp ${name}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  const t = res.content && res.content[0] && res.content[0].text;
  let out; try { out = JSON.parse(t); } catch { out = t; }
  return { out, isError: !!res.isError };
}
export async function toolsList(key) {
  const r = await http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++rpcId, method: "tools/list" } });
  return ((r.json && r.json.result && r.json.result.tools) || []).map((t) => t.name);
}
// the admin's /control actions (src/admin.js); the answer is the page with its flash
export const control = (fields) => http("POST", "/control", { key: ownerKey, form: fields });
export async function personId(email) {
  const r = await http("GET", "/control/people", { key: ownerKey });
  const p = ((r.json && r.json.people) || []).find((x) => x.email === email);
  if (!p) throw new Error(`no person ${email} on GET /control/people`);
  return p.id;
}
// addPerson -> { id, key }: add-person answers the new secret once, in its flash
export async function addPerson(name, email) {
  const r = await control({ action: "add-person", name, email });
  const key = (r.text.match(/API key\): ([0-9a-f]{40})/) || [])[1];
  if (!key) throw new Error(`add-person ${email}: no secret in the answer (HTTP ${r.status})`);
  return { id: await personId(email), key };
}

// ---- the address (sprint 7, 7.4): each org at /<its path name> ----
// the platform's root doors (src/orgpath.js PLATFORM_PATHS): a cookie request to one of them is never sent under an address
const PLATFORM = new Set(["login", "logout", "signup", "orgs", "install", "mcp", "oauth", ".well-known", "health", "fonts", "favicon.svg"]);
let RESERVED = null;
// unbased(text) -> the text with every org base taken off its paths: "/<org>/home" -> "/home", "/<org>" -> "/". An org's path name
// is never a reserved name (src/orgnames.js: the registry's first segments and the platform's words), so a reserved name after it
// marks an org's path; the registry is read once from GET /capabilities
export async function unbased(text) {
  if (!text || !/\/[a-z0-9]/.test(text)) return text;
  if (!RESERVED) {
    const r = await fetch(BASE + "/capabilities", { headers: { accept: "application/json", authorization: "Bearer " + ownerKey } });
    const j = await r.json().catch(() => ({}));
    RESERVED = reservedNames((j.routes || []).map((x) => ({ p: x.path })));
  }
  const whole = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)([?#].*)?$/.exec(String(text));   // a Location that is the org's own root: "/<org>"
  if (whole && !RESERVED.has(whole[1])) return "/" + (whole[2] || "");
  return String(text).replace(/(^|[^\w.:/-])\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=(\/[a-z.-]+)?)/g, (m, pre, seg, next) => {
    if (RESERVED.has(seg)) return m;
    if (next && RESERVED.has(next.slice(1))) return pre;                       // /<org>/<route> -> /<route>
    return m;
  }).replace(/(https?:\/\/[^/\s"'<>]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\/([a-z.-]+))/g, (m, origin, seg, next) => (!RESERVED.has(seg) && RESERVED.has(next) ? origin : m))   // an absolute link
    .replace(/(\b(?:href|action|src)=["'])\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=["'?#])/g, (m, pre, seg) => (RESERVED.has(seg) ? m : `${pre}/`));   // href="/<org>" -> href="/"
}
const ADDR = new Map();
// sessionPath(cookieHeader, path) -> where a browser's session sends a request for `path`: under its org's address (the root's
// redirect names it: GET /home -> /<org>/home), a platform door at the root; a dead session, as it was
export async function sessionPath(cookieHeader, path) {
  const m = /__Host-ar_session=([^;]+)/.exec(String(cookieHeader || ""));
  const seg = (String(path).split(/[/?#]/)[1] || "").toLowerCase();
  if (!m || PLATFORM.has(seg)) return path;
  await unbased("/x");   // the reserved names, read once
  if (seg && RESERVED && !RESERVED.has(seg)) return path;   // already under an address (the case names one)
  let base = ADDR.get(m[1]);
  if (base === undefined) {
    const r = await fetch(BASE + "/home", { headers: { cookie: "__Host-ar_session=" + m[1], accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }, redirect: "manual" });
    let loc = r.headers.get("location") || "";
    // an ACCOUNT session in several orgs is sent to the org picker (sprint 7, 7.4b): its first org (org order: org 1 first, the
    // org the older cases read)
    if (loc.startsWith("/orgs")) {
      const p = await fetch(BASE + loc, { headers: { cookie: "__Host-ar_session=" + m[1], accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }, redirect: "manual" });
      loc = p.status === 200 ? ((/<a class="org-pick" href="([^"]+)"/.exec(await p.text()) || [])[1] || "") : (p.headers.get("location") || "");
    }
    const mm = /^\/([a-z0-9-]+)\/home$/.exec(loc);
    base = mm ? "/" + mm[1] : "";
    if (base) ADDR.set(m[1], base);
  }
  return base && !String(path).startsWith(base + "/") && path !== base ? base + path : path;
}
// orgSlug(org) -> the org's path name (the local D1); asAt(org, token, path) -> the page or JSON a session cookie reads under
// that org's address
export const orgSlug = (org) => (d1rows(`SELECT slug FROM org WHERE id = ${Number(org)}`)[0] || {}).slug;
export const asAt = (org, token, path, o = {}) => http(o.method || "GET", `/${orgSlug(org)}${path}`, { ...o, cookie: token });

// ---- the cases ----
// html(path, key) -> a page as a signed-in browser would get it (Accept: text/html, the key as the bearer)
export async function html(path, key = ownerKey) {
  const r = await fetch(BASE + path, { headers: { accept: "text/html", authorization: "Bearer " + key }, redirect: "manual" });
  const raw = await r.text();
  return { status: r.status, text: await unbased(raw), raw, location: r.headers.get("location") && await unbased(r.headers.get("location")) };
}
export const CASES = [];
export const smoke = (name, fn) => CASES.push({ name, fn });
export function expect(cond, detail) { if (!cond) throw new Error(typeof detail === "function" ? detail() : detail); }
export const brief = (v) => JSON.stringify(v).slice(0, 300);
export const s = { ledgers: [] };   // what earlier cases leave for later ones
export const G = (id, parent, extra = {}) => ({ kind: "goal", op: "upsert", data: { id, title: id.replace(/-/g, " "), parent, ...extra } });
export const goalIds = async (key = ownerKey) => ((await mcp(key, "read", { project: "smoke", kind: "goal", limit: 100 })).out.items || []).map((g) => g.id).sort().join(",");

// ---- D5: the writes and reads, as any client makes them now ----
// fileVia(key, { project?, items, clientRef?, eval?, only? }) -> { out, isError, preview } — preview, then file with the SAME
// items (the receipt, or the refusal at either step, with `step`)
export async function fileVia(key, { project, items, clientRef, eval: ev, only } = {}) {
  const pv = await mcp(key, "preview", { ...(project !== undefined ? { project } : {}), items, ...(clientRef ? { clientRef } : {}), ...(ev ? { eval: true } : {}) });
  if (pv.isError || !pv.out || !pv.out.previewId) return { ...pv, step: "preview", preview: pv.out };
  const f = await mcp(key, "file", { previewId: pv.out.previewId, items, ...(only ? { only } : {}) });
  return { ...f, step: "file", preview: pv.out };
}
// kwrite(key, { project?, ops, clientRef?, eval? }) -> { out, isError }: knowledge items through preview then file, answered in
// a compact shape (written: the items filed, ledger: its one row, replay: every item unchanged,
// or invalid_ops with errors[{ index, error, note }] from the preview's own needs and refusals, nothing filed)
export async function kwrite(key, { project, ops, clientRef, eval: ev } = {}) {
  const r = await fileVia(key, { project, items: ops, clientRef, eval: ev });
  const pv = r.preview || {};
  if (r.step === "preview") return { out: r.out, isError: true };
  const items = pv.items || [];
  const stuck = items.filter((it) => it.verdict === "needs" || it.verdict === "refused");
  if (stuck.length) return { isError: true, out: { error: "invalid_ops", project: pv.project, count: stuck.length,
    errors: stuck.map((it) => ({ index: it.i, kind: it.kind, id: it.key, error: (it.refusal && it.refusal.error) || (it.needs && (it.needs.error || it.needs.field)) || it.verdict, note: (it.reasons || []).join(" "), ...(it.needs && it.needs.formats ? { formats: it.needs.formats } : {}) })) } };
  if (!pv.ready) return { isError: false, out: { project: pv.project, replay: true, written: 0, removed: 0, byKind: {}, ledger: null, unchanged: items.length } };
  const res = (r.out && r.out.results) || [];
  const filed = res.filter((x) => x.status === "filed");
  const byKind = {}; let removed = 0;
  for (const x of filed) { const op = (ops || [])[x.i] || {}; if (op.op === "remove") removed++; else byKind[op.kind] = (byKind[op.kind] || 0) + 1; }
  return { isError: r.isError, out: r.isError ? r.out : { project: pv.project, written: filed.length, removed, byKind, unchanged: res.filter((x) => x.status === "unchanged").length, ledger: (filed[0] || {}).id || null,
    stripped: items.filter((it) => it.body && it.body.stripped).map((it) => ({ i: it.i, kind: it.kind, id: it.key, removed: it.body.stripped })), receipt: r.out } };
}
// contributions(key, project, { eval }) -> every contribution of the project the reader may read, newest first: `read`
// {kind: "contribution"} paged to its end (D5)
export async function contributions(key, project, { eval: ev } = {}) {
  const all = []; let after = null;
  for (let i = 0; i < 50; i++) {
    const o = (await mcp(key, "read", { ...(project ? { project } : {}), kind: "contribution", limit: 100, ...(after ? { after } : {}), ...(ev ? { eval: true } : {}) })).out || {};
    all.push(...(o.items || []));
    if (!o.next) break;
    after = o.next;
  }
  return all;
}
// kread(key, { project?, kind, id?, cursor?, limit?, cardKind?, q?, screen? }) -> the `read` answer (id is its ref, cursor its after)
export const kread = (key, { id, ref, cursor, after, ...a } = {}) => {
  let r = id ?? ref;
  if (r != null && a.kind === "card" && !String(r).startsWith("card/") && String(r).includes("|")) r = `card/${String(r).replace("|", "/")}`;   // a kind|id key
  return mcp(key, "read", { ...a, ...(r != null ? { ref: r } : {}), ...(cursor || after ? { after: cursor || after } : {}) });
};
// contribute(key, { project?, clientRef?, eval?, ...contribution }) -> { out: { id, route, status, … }, isError }
export async function contribute(key, { project, clientRef, eval: ev, ...c } = {}) {
  const r = await fileVia(key, { project, items: [{ contribution: { ...c, ...(clientRef ? { clientRef } : {}) } }], eval: ev });
  if (r.step === "preview") return r;
  const pv = (r.preview && r.preview.items && r.preview.items[0]) || {};
  if (r.isError || !r.out || r.out.error) return { ...r, verdict: pv.verdict };
  const it = (r.out.items && r.out.items[0] && r.out.items[0].filed) || {};
  return { isError: false, verdict: pv.verdict, preview: r.preview, out: { ...r.out, id: it.id || ((r.out.results || [])[0] || {}).id || null, route: it.route || null, status: it.status || null } };
}
// readTx(key, id, project) -> { out: the contribution row (with its grade) | the refusal } — `read` {ref: <id>}
// (D5: a contribution reads on its own project's scope, so the project is named)
export const readTx = async (key, id, project) => { const r = await mcp(key, "read", { ref: id, ...(project ? { project } : {}) }); return { ...r, out: r.out && r.out.item ? r.out.item : r.out }; };

// ---- the local D1 itself (sprint 6: the second org is seeded where no door makes one yet) ----
// d1(q) -> { rows } | { error }: one statement on the smoke's local D1 (tools/smoke.sh sets SMOKE_D1_*), a refusal kept as text
export function d1(q) {
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(db && cfg && persist, "SMOKE_D1_* not set (tools/smoke.sh sets them)");
  try {
    const out = execFileSync("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--json", "--command", q],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { rows: (JSON.parse(out)[0] || {}).results || [] };
  } catch (e) { return { error: `${e.stdout || ""}${e.stderr || ""}` }; }
}
// d1rows(q) -> the rows, or the case fails naming the statement
export const d1rows = (q) => { const r = d1(q); expect(!r.error, () => `D1: ${q.slice(0, 120)} — ${String(r.error).slice(0, 300)}`); return r.rows; };
// acceptWaiting(email) -> the seats of this email that WAITED for their holder's yes, now accepted (sprint 7's review, A1;
// migrate-074): an org's admin who seats an email whose account already stands elsewhere makes a pending seat; the cases written
// before A1 seat one account in two orgs, which now takes the holder's yes — given here as POST /orgs/seat gives it (active 1,
// pending 0). s45 drives the real door (the picker's Accept and Decline). Returns how many waited.
export const acceptWaiting = (email) => {
  const e = String(email).toLowerCase().trim().replace(/'/g, "''");
  const n = (d1rows(`SELECT COUNT(*) AS n FROM people WHERE pending = 1 AND email = '${e}'`)[0] || {}).n || 0;
  if (n) d1rows(`UPDATE people SET active = 1, pending = 0 WHERE pending = 1 AND email = '${e}'`);
  return n;
};
