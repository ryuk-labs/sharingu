// write-door-selftest.mjs — the write doors that sit ABOVE the gate or carry their own refusals (hotfix-verb-csrf,
// 2026-09-28, and after): the owner ops POSTs behind requireOwnerKey (/backfill · /backup-dump) once accepted the owner's
// session cookie with no origin check, so a page on ANOTHER site could make a signed-in browser fire them through a simple
// cross-site POST (request.json() parses a text/plain body as happily as application/json; no CORS preflight).
//
// Drives the REAL default export of src/index.js (buildEntry(workerHandler), the artifact tools/ship.sh deploys)
// through handler.fetch(new Request(...)) over the Home fixture's real SQLite D1 (tools/fixtures/home-d1.mjs), the
// tools/rank-door-selftest.mjs way. A session cookie is a real tokens row (token_hash = sha256(token), not revoked, a
// future expiry) sent as __Host-ar_session, exactly what POST /login mints. Cases:
//   POST /backfill · /backup-dump (requireOwnerKey)
//     · the owner's Bearer key runs it (not 403)
//     · the owner's cookie, same-origin, runs it (not 403)
//     · the owner's cookie, CROSS-SITE text/plain, answers 403 cross_origin_session_write — red on main
//   POST /mcp (confirming the audit's exemption, not a fix)
//     · the owner's cookie alone, cross-site, calling a write tool (rank) is not served: the entry hands any request
//       whose Bearer is not a minted credential to the OAuth provider, which answers 401 — nothing written
//   POST /broadcast/publish · POST /broadcast/equip (sprint 3, D2 · B7: the REST twins of the `publish` and `equip` tools,
//   below the gate; Q60CCC574's "no tool, no key" is superseded by MCP.md §5)
//     · a Bearer key with no confirm answers the PREVIEW (200 preview:true) and writes nothing; with confirm: true it files
//     · a same-origin session cookie's press (the Broadcast page) is its own confirm: it publishes and equips (one filing each)
//     · a ?k= key and OAuth MCP props (ctx.props: never a REST credential) are 401, a CROSS-SITE session 403
//       cross_origin_session_write, a read-only key 403 read_only_credential, no credential 401 — and nothing is written
//   the reserved kinds (UI-B11a D4): kind publish or equip as a contribution item of POST /preview or the preview tool (the whole
//   batch, its plain note too) is refused reserved_kind, nothing filed; the check compares the
//   kind trimmed and lowercased ("Publish", " EQUIP "), and never catches a neighbour ("published", "equipment" file)
// And a MUTATION PROOF per fixed guard (tools/login-csrf-route-selftest.mjs's shape): each guard's call site rewritten
// to `if (false && csrfRefused(...))` in a scratch copy of src/, and the cross-site case must then go through — so a
// future silent unwiring turns THIS check red. Exits 1 on any fail. Run in the gate.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const { homeFixtureEnv, orgAddress } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex");

const ORIGIN = "https://org.test";
const COOKIE = "__Host-ar_session";   // src/core.js SESSION_COOKIE
const SEAT_KEY = "seat-key", OWNER_KEY = "owner-key", SEAT_TOK = "seat-session-token", OWNER_TOK = "owner-session-token";
const ROK = sha(sha(SEAT_KEY) + ":agent-r-read-only:v1");   // src/core.js READ_ONLY_SUFFIX: the seat's read-only key

// the org's address (sprint 7, 7.4): where a browser's session signs in; set by world()
let ADDRESS = "";
function world() {
  const fx = homeFixtureEnv();
  ADDRESS = orgAddress(fx.sqlite);
  fx.sqlite.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-c'").run(sha(SEAT_KEY));
  fx.sqlite.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-o'").run(sha(OWNER_KEY));
  const exp = new Date(Date.now() + 86400000).toISOString(), at = new Date().toISOString();
  const T = fx.sqlite.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (?,?,?,?,?,0,1)");
  T.run(sha(SEAT_TOK), "p-c", "selftest", at, exp);
  T.run(sha(OWNER_TOK), "p-o", "selftest", at, exp);
  // the selftest files as a suite does (eval-marked): its projects are a test run's own (G2: the eval mark is accepted only on
  // an eval project or from a test seat, src/core.js evalMarkRefused)
  fx.sqlite.prepare("UPDATE projects SET eval = 1").run();
  // every row a filing can leave: the transmission itself, its events and its refs
  const writes = () => fx.sqlite.prepare("SELECT (SELECT COUNT(*) FROM transmission) + (SELECT COUNT(*) FROM events) + (SELECT COUNT(*) FROM transmission_refs) AS n").get().n;
  const filed = () => fx.sqlite.prepare("SELECT COUNT(*) AS n FROM transmission").get().n;
  // (7.5b) an OAuth grant's props as the provider hands them: with its seat's stamp (credEpoch), as every grant carries one
  const grantOf = async (id, scope) => ({ personId: id, scope, cred: await credEpoch(fx.sqlite.prepare("SELECT key_hash, pass_hash FROM people WHERE id = ?").get(id)) });
  return { env: fx.env, writes, filed, grantOf };
}
const ctx = { waitUntil() {}, passThroughOnException() {} };

// shapes: bearer | cookie-same | cookie-bare (no SFS, no Origin) | cookie-cross | cookie-cross-origin-only
function headersFor(shape, { key, tok }) {
  if (shape === "bearer") return { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const h = { cookie: `${COOKIE}=${tok}` };
  if (shape === "cookie-same") return { ...h, "content-type": "application/json", "sec-fetch-site": "same-origin", origin: ORIGIN };
  if (shape === "cookie-bare") return { ...h, "content-type": "application/json" };
  if (shape === "cookie-cross") return { ...h, "content-type": "text/plain", "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", origin: "https://evil.example" };
  if (shape === "cookie-cross-origin-only") return { ...h, "content-type": "text/plain", origin: "https://evil.example" };
  throw new Error("unknown shape " + shape);
}
async function call(handler, env, path, shape, cred, body) {
  // sprint 7, 7.4: a browser's session signs in only under its org's address (/<org>/…); a bearer answers at the root too
  const base = String(shape).startsWith("cookie") ? ADDRESS : "";
  const r = await handler.fetch(new Request(ORIGIN + base + path, { method: "POST", headers: headersFor(shape, cred), body: JSON.stringify(body || {}) }), env, ctx);
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, j };
}
const SEAT = { key: SEAT_KEY, tok: SEAT_TOK }, OWNER = { key: OWNER_KEY, tok: OWNER_TOK };

// the requireOwnerKey probe: each owner ops POST, Bearer / same-origin cookie / cross-site cookie
const OPS = ["/backfill?eval=1", "/backup-dump?eval=1"];
async function probeOps(handler, label, assert) {
  const out = {};
  for (const path of OPS) {
    const w = world();
    const bearer = await call(handler, w.env, path, "bearer", OWNER, {});
    const same = await call(handler, w.env, path, "cookie-same", OWNER, {});
    const cross = await call(handler, w.env, path, "cookie-cross", OWNER, {});
    const seat = await call(handler, w.env, path, "bearer", SEAT, {});
    out[path] = cross.status;
    if (assert) {
      ok(bearer.status !== 403 && same.status !== 403 && seat.status === 403 && seat.j && seat.j.error === "owner_only",
        `${label}: POST ${path} runs for the owner by Bearer (${bearer.status}) and by a same-origin cookie (${same.status}); a seat is ${seat.status} ${seat.j && seat.j.error}`);
      ok(cross.status === 403 && cross.j && cross.j.error === "cross_origin_session_write",
        `${label}: POST ${path} from the owner's browser CROSS-SITE is refused: ${cross.status} ${cross.j && cross.j.error}`);
    }
  }
  return out;
}

// ---- 1. the real, unmodified routes ----
const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
const { credEpoch } = await import(pathToFileURL(join(ENGINE, "src", "oauthgrants.js")).href);
await probeOps(handler, "requireOwnerKey", true);

// /mcp: the audit's exemption, proven rather than asserted — a cookie is no credential at the MCP door
{
  const w = world();
  const n0 = w.writes();
  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "open_items", arguments: { title: "a cross-site write" } } };
  const r = await handler.fetch(new Request(ORIGIN + "/mcp", { method: "POST", headers: headersFor("cookie-cross", OWNER), body: JSON.stringify(rpc) }), w.env, ctx).catch((e) => ({ status: "threw: " + e.message }));
  ok(r.status === 401 && w.writes() === n0, `POST /mcp with the owner's session cookie alone, cross-site, calling the write tool open_items: ${r.status} (the OAuth provider's), nothing written — exempt, a cookie never reaches handleMcp`);
}

// ---- 1b. UI-B11a: Broadcast's two person verbs and the reserved kinds ----
// the probe, against whichever handler is passed (the real one, then each mutated one): returns the named statuses
async function probeBroadcast(handler, label, assert) {
  const w = world();
  const bearer = (key) => ({ authorization: `Bearer ${key}`, "content-type": "application/json" });
  const cookie = (site) => ({ cookie: `${COOKIE}=${SEAT_TOK}`, "content-type": "application/json", ...(site ? { "sec-fetch-site": site } : {}), ...(site === "cross-site" ? { origin: "https://evil.example" } : {}) });
  const post = async (path, headers, body, props) => {
    const r = await handler.fetch(new Request(ORIGIN + (headers.cookie ? ADDRESS : "") + path, { method: "POST", headers, body: JSON.stringify(body || {}) }), w.env, props ? { ...ctx, props } : ctx);
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = null; }
    return { status: r.status, j };
  };
  const item = (slug) => ({ lane: "leader", kind: "item", what: slug, why: "a kit the write door selftest publishes", touches: "skill", gapRefs: ["item/" + slug], proof: "https://src.example/" + slug });
  // D5: a contribution files as any client files it, preview then file (POST /preview, POST /file: the tools' REST twins)
  const fileOne = async (c) => {
    const items = [{ contribution: c }];
    const pv = await post("/preview", bearer(SEAT_KEY), { items, eval: true });
    if (!pv.j || !pv.j.previewId) return { status: pv.status, j: pv.j, preview: pv.j };
    const f = await post("/file", bearer(SEAT_KEY), { previewId: pv.j.previewId, items });
    const r0 = (f.j && f.j.results && f.j.results[0]) || {};
    return { status: f.status, j: f.j ? { ...f.j, id: r0.id || null } : f.j, preview: pv.j };
  };
  const it = await fileOne(item("vd-kit"));
  const id = it.j && it.j.id;
  const out = { item: it.status };
  const n0 = w.writes();
  out.pubBearer = await post("/broadcast/publish", bearer(SEAT_KEY), { id });            // no confirm: the preview
  out.pubK = await post(`/broadcast/publish?k=${SEAT_KEY}`, { "content-type": "application/json" }, { id, confirm: true });
  out.pubOauth = await post("/broadcast/publish", { "content-type": "application/json" }, { id, confirm: true }, await w.grantOf("p-c", ["mcp:read", "mcp:write"]));
  out.pubRo = await post("/broadcast/publish", bearer(ROK), { id, confirm: true });
  out.pubCross = await post("/broadcast/publish", cookie("cross-site"), { id });
  out.pubAnon = await post("/broadcast/publish", { "content-type": "application/json" }, { id, confirm: true });
  out.refusedWrote = w.writes() - n0;
  const f0 = w.filed();
  out.pub = await post("/broadcast/publish", cookie("same-origin"), { id }, {});   // workerd's own ctx: props {} on every request; a press
  out.pubFiled = w.filed() - f0;
  const it2 = await fileOne(item("vd-kit-two"));
  const f0b = w.filed();
  out.pubConfirm = await post("/broadcast/publish", bearer(SEAT_KEY), { id: it2.j && it2.j.id, confirm: true });   // a key files with confirm
  out.pubConfirmFiled = w.filed() - f0b;
  const EQ = { slug: "vd-kit", v: 1, project: "alpha", eval: true };   // a suite item: its versions count with eval (the shelf leaves it out without ?eval=1)
  const n1 = w.writes();
  out.eqBearer = await post("/broadcast/equip", bearer(SEAT_KEY), EQ);                   // no confirm: the preview
  out.eqK = await post(`/broadcast/equip?k=${SEAT_KEY}`, { "content-type": "application/json" }, { ...EQ, confirm: true });
  out.eqOauth = await post("/broadcast/equip", { "content-type": "application/json" }, { ...EQ, confirm: true }, await w.grantOf("p-c", ["mcp:read", "mcp:write"]));
  out.eqCross = await post("/broadcast/equip", cookie("cross-site"), EQ);
  out.eqRefusedWrote = w.writes() - n1;
  const f1 = w.filed();
  out.eq = await post("/broadcast/equip", cookie("same-origin"), EQ, {});
  out.eqFiled = w.filed() - f1;
  // the reserved kinds: every agent door refuses them in the preview, so nothing is filed (D5: preview then file is the door)
  const agent = (kind) => ({ lane: "leader", kind, what: kind, why: "an agent", touches: "skill", parent: id, gapRefs: ["item/vd-kit"] });
  const f2r = w.filed();
  out.resRest = await fileOne(agent("publish"));
  out.resCase = await fileOne(agent("Publish"));
  out.resSpace = await fileOne(agent(" EQUIP "));
  const pvBatch = await post("/preview", bearer(SEAT_KEY), { items: [{ contribution: { lane: "leader", kind: "note", what: "a plain note", why: "rides the same batch" } }, { contribution: agent("equip") }], eval: true });
  out.resBatch = pvBatch.j && pvBatch.j.previewId ? await post("/file", bearer(SEAT_KEY), { previewId: pvBatch.j.previewId, items: [{ contribution: { lane: "leader", kind: "note", what: "a plain note", why: "rides the same batch" } }, { contribution: agent("equip") }] }) : pvBatch;
  out.resBatchPreview = pvBatch.j;
  const rpc = (kind) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "preview", arguments: { items: [{ contribution: agent(kind) }], eval: true } } });
  const mcp = await post("/mcp", bearer(SEAT_KEY), rpc("publish"));
  try { out.resMcp = JSON.parse(mcp.j.result.content[0].text); } catch { out.resMcp = null; }
  out.reservedFiled = w.filed() - f2r;
  // never a neighbour: kind "published" and kind "equipment" still file
  const f2 = w.filed();
  out.near1 = await fileOne({ lane: "leader", kind: "published", what: "a published note", why: "not reserved", touches: ["notes"] });
  out.near2 = await fileOne({ lane: "leader", kind: "equipment", what: "an equipment note", why: "not reserved", touches: ["notes"] });
  out.nearFiled = w.filed() - f2;
  if (assert) {
    const pv = (r) => r.status === 200 && r.j && r.j.preview === true;
    ok(out.item === 200 && !!id, `${label}: the seat files a draft (kind item) by POST /preview then POST /file: ${out.item} ${id}`);
    ok(pv(out.pubBearer) && out.pubBearer.j.slug === "vd-kit" && out.pubBearer.j.v === 1 && /publish \{id: /.test(out.pubBearer.j.text || ""),
      `${label}: POST /broadcast/publish by a Bearer key with no confirm answers the preview: ${out.pubBearer.status} preview ${out.pubBearer.j && out.pubBearer.j.preview} v${out.pubBearer.j && out.pubBearer.j.v}`);
    ok(out.pubK.status === 401 && out.pubOauth.status === 401 && out.pubRo.status === 403 && out.pubRo.j && out.pubRo.j.error === "read_only_credential"
      && out.pubCross.status === 403 && out.pubCross.j && out.pubCross.j.error === "cross_origin_session_write" && out.pubAnon.status === 401 && out.refusedWrote === 0,
      `${label}: ?k= ${out.pubK.status}, OAuth props ${out.pubOauth.status}, a read-only key ${out.pubRo.status} ${out.pubRo.j && out.pubRo.j.error}, cross-site session ${out.pubCross.status}, no credential ${out.pubAnon.status}; the preview and the five refused presses wrote ${out.refusedWrote} rows`);
    ok(out.pub.status === 200 && out.pub.j && out.pub.j.v === 1 && out.pubFiled === 1, `${label}: a same-origin session's press publishes it, on workerd's own ctx (props {}): ${out.pub.status} v${out.pub.j && out.pub.j.v}, ${out.pubFiled} filing`);
    ok(out.pubConfirm.status === 200 && out.pubConfirm.j && out.pubConfirm.j.v === 1 && !out.pubConfirm.j.preview && out.pubConfirmFiled === 1, `${label}: a Bearer key with confirm: true publishes its own second draft: ${out.pubConfirm.status}, ${out.pubConfirmFiled} filing`);
    ok(pv(out.eqBearer) && out.eqK.status === 401 && out.eqOauth.status === 401 && out.eqCross.status === 403 && out.eqCross.j && out.eqCross.j.error === "cross_origin_session_write" && out.eqRefusedWrote === 0,
      `${label}: POST /broadcast/equip by a Bearer key with no confirm is the preview (${out.eqBearer.status}), ?k= ${out.eqK.status}, OAuth props ${out.eqOauth.status}, cross-site ${out.eqCross.status}; ${out.eqRefusedWrote} rows written`);
    ok(out.eq.status === 200 && out.eq.j && out.eq.j.project === "alpha" && out.eqFiled === 1, `${label}: a same-origin session's press equips v1 into alpha: ${out.eq.status}, ${out.eqFiled} filing`);
    // a refused item in the preview: verdict refused with the door's own refusal reserved_kind; file then refuses the call (not_ready)
    const refusedIn = (p) => p && Array.isArray(p.items) && p.items.some((x) => x.verdict === "refused" && x.refusal && x.refusal.error === "reserved_kind");
    const rk = (r) => refusedIn(r.preview) && r.status === 422 && r.j && r.j.error === "not_ready";
    ok(rk(out.resRest) && rk(out.resCase) && rk(out.resSpace) && refusedIn(out.resBatchPreview) && out.resBatch.status === 422 && out.resBatch.j && out.resBatch.j.error === "not_ready"
      && refusedIn(out.resMcp) && out.reservedFiled === 0,
      `${label}: kind publish ("publish", "Publish", " EQUIP ", an equip beside a plain note) is refused reserved_kind in the preview, by POST /preview and the preview tool, and file files none of it (${out.reservedFiled} filings)`);
    ok(out.near1.status === 200 && out.near2.status === 200 && out.nearFiled === 2, `${label}: never a neighbour: kind "published" (${out.near1.status}) and "equipment" (${out.near2.status}) file (${out.nearFiled} filings)`);
  }
  return out;
}
await probeBroadcast(handler, "Broadcast", true);

// ---- 2. the mutation proofs: each fixed guard's call site disabled must let the cross-site case through ----
const MUTATIONS = [
  { name: "requireOwnerKey", needle: `  if (csrfRefused(request, url, p)) return json({ error: "cross_origin_session_write" }, 403);`,
    probe: async (h) => (await probeOps(h, "mutated", false))["/backup-dump?eval=1"], want: (s) => s !== 403 },
  // D2 (B7): the preview gate of the REST twins: a Bearer press counted as a browser's own confirm files with no confirm
  // the same press line guards POST /render/restore (M6) below the Broadcast twins: the Broadcast one is found after its route's test
  { name: "Broadcast preview first", after: `(path === "/broadcast/publish" || path === "/broadcast/equip") && method === "POST"`,
    needle: `      const press = person.viaCookie === true;   // a signed-in browser's press is its own confirm`,
    mutate: (x) => x.replace("person.viaCookie === true", "true"), how: "every caller counted as a browser's press, a Bearer publish with no confirm",
    probe: async (h) => { const o = (await probeBroadcast(h, "mutated", false)).pubBearer; return `${o.status} ${o.j && o.j.preview ? "preview" : "filed"}`; }, want: (s) => s === "200 filed" },
  // the gate's own cookie-write check covers the twins now (they sit below it)
  { name: "Broadcast csrf (the gate)", needle: `    if (csrfRefused(request, url, person)) {
      return json({ error: "cross_origin_session_write", hint: "A web session may only write from its own origin. Use Authorization: Bearer for scripts." }, 403);
    }`, mutate: (x) => x.replace("if (csrfRefused(", "if (false && csrfRefused("), how: "the gate's csrfRefused disabled a cross-site session publish",
    probe: async (h) => (await probeBroadcast(h, "mutated", false)).pubCross.status, want: (s) => s === 200 },
  // D5: preview then file plans every contribution through the batch door (src/preview.js contributionPart ->
  // planTransmissionsBatch), so the batch's reserved-kind refusal is the one every client meets; fileTransmission's own check
  // (core.js) now guards only the engine's internal filers (rank, round, the answers), which never pass a reserved kind
  { name: "reserved_kind (batch)", file: "core.js", needle: `  if (resAt >= 0) return { all: items.map(() => reservedKind(items[resAt].kind, { item: resAt })) };`,
    mutate: (x) => x.replace("if (resAt >= 0)", "if (false && resAt >= 0)"), how: "the batch's reserved-kind refusal disabled a preview then file of kind publish",
    probe: async (h) => (await probeBroadcast(h, "mutated", false)).resRest.status, want: (s) => s === 200 },
];
for (const m of MUTATIONS) {
  const mutDir = mkdtempSync(join(ENGINE, ".write-door-mutation-"));
  try {
    cpSync(join(ENGINE, "src"), join(mutDir, "src"), { recursive: true });
    const indexPath = join(mutDir, "src", m.file || "index.js");
    const original = readFileSync(indexPath, "utf8");
    // `after`: the guard's call site is the first one past that anchor (a line pattern several doors share); else it is the
    // file's only one
    const from = m.after ? original.indexOf(m.after) : 0;
    const at = from < 0 ? -1 : original.indexOf(m.needle, from);
    const unique = m.after ? (from >= 0 && at >= 0 && original.indexOf(m.after, from + 1) < 0) : original.split(m.needle).length === 2;
    if (!unique || at < 0) {
      ok(false, `mutation ${m.name}: the guard's call site is not found exactly once in src/${m.file || "index.js"} — this selftest is stale against its shape and must be updated`);
      continue;
    }
    const mutatedText = m.mutate ? m.mutate(m.needle) : m.needle.replace("if (csrfRefused(", "if (false && csrfRefused(");
    writeFileSync(indexPath, original.slice(0, at) + mutatedText + original.slice(at + m.needle.length));
    const { default: mutated } = await import(pathToFileURL(join(mutDir, "src", "index.js")).href);
    const s = await m.probe(mutated);
    const how = m.how || `the guard rewritten to "if (false && csrfRefused(...))" the cross-site POST`;
    ok(m.want(s), m.want(s)
      ? `mutation ${m.name}: with ${how} goes through (${s}) — this check is load-bearing`
      : `mutation ${m.name}: with ${how} still got ${s} — this check is NOT load-bearing`);
  } finally {
    rmSync(mutDir, { recursive: true, force: true });
  }
}

console.log(`write-door-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
