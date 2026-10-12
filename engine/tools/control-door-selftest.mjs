// control-door-selftest.mjs — UI-B12a (2026-09-30), Scope 7 of 02_AGENT_R/next-batch-ui-b12-control.md (the brain): POST
// /control is the ONE admin write door, declared in contracts/door.json. It is an ABOVE route (it never reaches the BELOW
// gate's central read-only and csrfRefused refusals), so it carries every refusal itself, and this selftest proves each
// one through the REAL default export of src/index.js (the cf-workers stub loader) over the Home fixture's real SQLite D1
// (tools/fixtures/home-d1.mjs homeFixtureEnv), the tools/verb-door-selftest.mjs way. A session cookie is a real tokens row
// sent as __Host-ar_session, exactly what POST /login mints.
//
// The world: the fixture's owner Owen Park (p-o) is the org's ONE real admin; Rae Kim (p-c) is a seat on alpha; the suites'
// fixed owner (eval-fixed-owner, role owner, active: a run in progress) is an admin too, and never counts as a REAL one.
//   1 · a seat's POST of EVERY action (Bearer, and a same-origin cookie) -> 403, D1 unchanged (the door refuses
//       independently of the render: QB963C7EE's "hiding is not enforcement" half)
//   2 · the admin's cross-origin cookie POST -> 403, D1 unchanged (csrfRefused)
//   3 · the admin's read-only credential as a Bearer header -> 403 (the read-only refusal's own words), D1 unchanged; in ?k=
//       it signs no one in (G2 M2) -> the sign-in, D1 unchanged
//   4 · the admin's FULL key in ?k= with no header and no cookie signs no one in (G2 M2: a key in an address is no credential)
//       -> the sign-in, D1 unchanged; the same key as a Bearer with a stray ?k=, and a same-origin cookie with a stray ?k=,
//       still write (the header or the cookie signs in; the stray ?k= is ignored)
//   5 · set-role: O makes Rae an admin; O demotes self (Rae remains: allowed; a member since migrate-044); Rae demotes self as
//       the last REAL admin with the eval-fixed owner active -> 200 "Nothing done", Rae still admin, to member AND to partner
//       (sprint 2: the guard is SET_ROLE_SQL's, for either role); a bad role -> "Nothing done", nothing written
//   6 · add-person role=owner (and "Owner", " owner ") -> 200 "Nothing done — Provisioning seats a person…", nobody created
//   7 · remove-person: the eval-fixed owner (an admin) removing the last REAL admin -> "Nothing done", nobody archived
//   8 · the one-time secret of add-person and rotate-key rides the response BODY only (sha256 of it = the new key_hash), with
//       no Location header, and a later GET /control/people and GET /control never carry it
//   9 · an OAuth caller (ctx.props naming the admin, what the provider hands an MCP client; its token no minted key) POSTing
//       /control is refused 401 (THE sign-in rule: a bearer is a script), nothing written: the route resolves with no props
//  10 · (UI-B12b, the fold from B12a's adversarial review c7ce4f0a) Reissue revokes that person's sessions: Rae's session answers
//       /whoami 200; the admin reissues Rae's key (rotate-key); Rae's old session AND old key answer 401, every tokens row of
//       Rae's is revoked, and the admin's own session (the one that pressed) still answers 200
//  11 · (UI-B12b, the same review) the admin's READ-ONLY credential reads GET /control/people as the admin reads it (the same
//       people, reader.admin true, reader.readOnly true) with EVERY can.* false and READ_ONLY_REASON, and its GET /control page
//       draws every data-door="POST /control" control disabled (F6), none enabled
//  12 · (G2 M2, the independent review) a key in the address reads nothing: GET /control?k=<the admin's full key> and
//       ?k=<their read-only credential> are not signed in (the sign-in, and its Location never carries the key); the same key
//       with a same-origin cookie and a stray ?k= still draws enabled controls; GET /control/people's reader is [admin, id]
// And a MUTATION PROOF per guard (each call site rewritten in a scratch copy of src/): the owner gate, the read-only refusal,
// csrfRefused, the add-person owner refusal, set-role's and remove-person's eval exclusion, the props kept off the /control
// resolve, Reissue's session revoke (UI-B12b), the read-only fold in readControl (UI-B12b), and (G2 M2) a ?k= sign-in put back
// into resolveReader — each disabled
// must let its refused case through, so a future silent unwiring turns THIS check red. The secret checker is proven both
// ways on a synthetic answer. Exits 1 on any fail. Run in the gate.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
register(pathToFileURL(join(ENGINE, "tools", "cf-workers-stub-loader.mjs")));
const { homeFixtureEnv } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "home-d1.mjs")).href);
const { default: handler } = await import(pathToFileURL(join(ENGINE, "src", "index.js")).href);
const { READ_ONLY_REASON } = await import(pathToFileURL(join(ENGINE, "src", "controlread.js")).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex");

const ORIGIN = "https://org.test";
const COOKIE = "__Host-ar_session";   // src/core.js SESSION_COOKIE
const RO_SUFFIX = ":agent-r-read-only:v1";   // src/core.js READ_ONLY_SUFFIX
const KEY = { O: "owner-full-key", C: "seat-full-key", EO: "eval-owner-key" };
const TOK = { O: "owner-session", C: "seat-session" };
const ID = { O: "p-o", C: "p-c", EO: "eval-fixed-owner" };
const ACTIONS = ["add-person", "rotate-key", "set-role", "set-access-hats", "add-project", "grant-seat", "revoke-seat", "remove-person",
  "set-title", "set-password", "archive-project", "activate-project", "clean-eval"];
const FORM = { "add-person": { name: "Door Person", email: "door-new@northwind.test" }, "rotate-key": { personId: "p-a" },
  "set-role": { personId: "p-c", role: "admin" }, "set-access-hats": { personId: "p-c", accessHat: "finance" }, "add-project": { key: "door-proj", name: "Door Project" }, "grant-seat": { personId: "p-c", projectKey: "beta" },
  "revoke-seat": { personId: "p-a", projectKey: "alpha" }, "remove-person": { personId: "p-a" }, "set-title": { personId: "p-a", title: "Door Title" },
  "set-password": { personId: "p-a", password: "door-pass-1234" }, "archive-project": { projectKey: "alpha" }, "activate-project": { projectKey: "beta" }, "clean-eval": {} };

function world() {
  const fx = homeFixtureEnv();
  const q = fx.sqlite;
  // a BRAIN object answers arrayBuffer() and its metadata like R2's
  const get0 = fx.env.BRAIN.get;
  fx.env.BRAIN.get = async (k) => { const o = await get0(k); if (!o) return o; const t = await o.text();
    return { ...o, size: t.length, arrayBuffer: async () => new TextEncoder().encode(t).buffer, httpMetadata: { contentType: "application/json" } }; };
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-o'").run(sha(KEY.O));
  q.prepare("UPDATE people SET key_hash = ? WHERE id = 'p-c'").run(sha(KEY.C));
  q.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES (?,?,?,?,?,?,?,1)")
    .run(ID.EO, "Eval Owner", "eval-owner@example.com", "owner", sha(KEY.EO), 1, new Date(Date.now() - 60000).toISOString());
  const exp = new Date(Date.now() + 86400000).toISOString(), at = new Date().toISOString();
  // sprint 7, 7.4: org 1's row (its address, /northwind, migrate-072's derived slug): a browser's session signs in under it
  // sprint 8 (8.2f, main's ruling): the harness's org rides the local-only plan (seeded by home-d1), never the ruled free
  q.prepare("INSERT OR IGNORE INTO org (id, name, created_at, updated_at, plan) VALUES (1, 'Northwind', ?, ?, 'local')").run(at, at);
  const T = q.prepare("INSERT INTO tokens (token_hash, person_id, device, created_at, expires_at, revoked, org) VALUES (?,?,?,?,?,0,1)");
  T.run(sha(TOK.O), ID.O, "selftest", at, exp);
  T.run(sha(TOK.C), ID.C, "selftest", at, exp);
  const snap = () => JSON.stringify(["people", "project_seats", "projects", "tokens"].map((t) => q.prepare("SELECT * FROM " + t + " ORDER BY 1, 2").all()))
    + "|" + q.prepare("SELECT COUNT(*) AS n FROM events").get().n + "|" + q.prepare("SELECT COUNT(*) AS n FROM transmission").get().n;
  const roleOf = (id) => (q.prepare("SELECT role FROM people WHERE id = ?").get(id) || {}).role;
  const activeOf = (id) => (q.prepare("SELECT active FROM people WHERE id = ?").get(id) || {}).active;
  return { env: fx.env, q, snap, roleOf, activeOf };
}
const ctx = { waitUntil() {}, passThroughOnException() {} };

// who: { bearer, cookie, site, qk } -> the request's credential shape
async function call(h, w, path, { bearer = null, cookie = null, site = "same-origin", qk = null, method = "GET", form = null, accept = "text/html", props = null } = {}) {
  const headers = { accept };
  if (bearer) headers.authorization = "Bearer " + bearer;
  if (cookie) { headers.cookie = `${COOKIE}=${cookie}`; if (site) headers["sec-fetch-site"] = site; if (site === "cross-site") headers.origin = "https://evil.example"; }
  let body;
  if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
  // sprint 7, 7.4: a browser's session signs in only under its org's address (/<org>/…); a bearer answers at the root too
  const base = cookie ? "/" + w.q.prepare("SELECT slug FROM org WHERE id = 1").get().slug : "";
  const u = ORIGIN + base + path + (qk ? (path.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(qk) : "");
  const r = await h.fetch(new Request(u, { method, headers, body, redirect: "manual" }), w.env, props ? { ...ctx, props } : ctx);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { j = null; }
  return { status: r.status, location: r.headers.get("location") || "", text, j };
}
const post = (h, w, form, cred) => call(h, w, "/control", { ...cred, method: "POST", form });
const flashOf = (t) => (/Nothing done[^<]*/.exec(t || "") || [""])[0];

// a secret in an answer: a 40-hex token whose sha256 is the given key_hash (TOKEN_PREFIX is "")
function secretIn(text, keyHash) {
  for (const s of (text || "").match(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/g) || []) if (keyHash && sha(s) === keyHash) return s;
  return null;
}
// the secret verdict: in the body, never a Location, never a later GET
const secretOk = (r, keyHash, later) => { const s = secretIn(r.text, keyHash); return !!s && !r.location.includes(s) && !later.includes(s) && r.status === 200; };

// ---- the cases, as a probe: returns every observation, asserts when asked ----
async function probe(h, label, assert) {
  const out = {};
  // 1 · a seat's POST of every action
  {
    const w = world();
    out.seat = {};
    for (const a of ACTIONS) {
      const before = w.snap();
      const b = await post(h, w, { action: a, ...FORM[a] }, { bearer: KEY.C });
      const c = await post(h, w, { action: a, ...FORM[a] }, { cookie: TOK.C });
      out.seat[a] = { bearer: b.status, cookie: c.status, same: w.snap() === before };
    }
  }
  // 2-4 · the hardening, as the admin (a benign add-project each time)
  {
    const w = world();
    const f = (k) => ({ action: "add-project", key: k, name: "Hard " + k });
    const roK = sha(sha(KEY.O) + RO_SUFFIX);
    const cases = { cross: { cookie: TOK.O, site: "cross-site" }, roK: { qk: roK }, roBearer: { bearer: roK }, fullK: { qk: KEY.O } };
    out.hard = {};
    for (const [k, cred] of Object.entries(cases)) {
      const before = w.snap();
      const r = await post(h, w, f("hard-" + k.toLowerCase()), cred);
      out.hard[k] = { status: r.status, same: w.snap() === before, text: r.text };
    }
    for (const [k, cred] of Object.entries({ bearerStray: { bearer: KEY.O, qk: KEY.O }, cookieStray: { cookie: TOK.O, qk: KEY.O } })) {
      const r = await post(h, w, f("ok-" + k.toLowerCase()), cred);
      out.hard[k] = { status: r.status, made: !!w.q.prepare("SELECT 1 FROM projects WHERE key = ?").get("ok-" + k.toLowerCase()) };
    }
  }
  // 5 · set-role
  {
    const w = world();
    const r1 = await post(h, w, { action: "set-role", personId: ID.C, role: "admin" }, { bearer: KEY.O });
    out.promote = { status: r1.status, role: w.roleOf(ID.C), text: r1.text };
    const read = await call(h, w, "/control/people", { bearer: KEY.C, accept: "application/json" });
    out.promotedRead = read.j && read.j.reader ? read.j.reader.admin : null;
    const r2 = await post(h, w, { action: "set-role", personId: ID.O, role: "seated" }, { bearer: KEY.O });
    out.demoteO = { status: r2.status, role: w.roleOf(ID.O) };
    const before = w.snap();
    const r3 = await post(h, w, { action: "set-role", personId: ID.C, role: "seated" }, { bearer: KEY.C });
    out.lastAdmin = { status: r3.status, role: w.roleOf(ID.C), eo: w.roleOf(ID.EO), same: w.snap() === before, flash: flashOf(r3.text) };
    const r3p = await post(h, w, { action: "set-role", personId: ID.C, role: "partner" }, { bearer: KEY.C });
    out.lastAdminP = { status: r3p.status, role: w.roleOf(ID.C), same: w.snap() === before, flash: flashOf(r3p.text) };
    const before2 = w.snap();
    const r4 = await post(h, w, { action: "set-role", personId: ID.O, role: "owner" }, { bearer: KEY.C });
    out.badRole = { status: r4.status, same: w.snap() === before2, flash: flashOf(r4.text) };
  }
  // 6 · add-person role=owner
  {
    const w = world();
    out.addOwner = [];
    for (const role of ["owner", "Owner", " owner "]) {
      const before = w.snap();
      const r = await post(h, w, { action: "add-person", name: "Would Be Owner", email: "would-owner@northwind.test", role }, { bearer: KEY.O });
      out.addOwner.push({ role, status: r.status, same: w.snap() === before, flash: flashOf(r.text),
        rows: w.q.prepare("SELECT COUNT(*) AS n FROM people WHERE email = 'would-owner@northwind.test'").get().n });
    }
  }
  // 7 · remove-person: the eval-fixed owner removing the last REAL admin
  {
    const w = world();
    const before = w.snap();
    const r = await post(h, w, { action: "remove-person", personId: ID.O }, { bearer: KEY.EO });
    out.removeLast = { status: r.status, active: w.activeOf(ID.O), same: w.snap() === before, flash: flashOf(r.text) };
  }
  // 8 · the one-time secret
  {
    const w = world();
    const a = await post(h, w, { action: "add-person", name: "Secret Person", email: "secret-new@northwind.test" }, { bearer: KEY.O, accept: "*/*" });
    const row = w.q.prepare("SELECT id, role, key_hash FROM people WHERE email = 'secret-new@northwind.test'").get() || {};
    const rot = await post(h, w, { action: "rotate-key", personId: "p-a" }, { bearer: KEY.O });
    const rotHash = (w.q.prepare("SELECT key_hash FROM people WHERE id = 'p-a'").get() || {}).key_hash;
    const later = (await call(h, w, "/control/people", { bearer: KEY.O, accept: "application/json" })).text + (await call(h, w, "/control", { bearer: KEY.O })).text;
    out.secret = { add: secretOk(a, row.key_hash, later), addRole: row.role, rotate: secretOk(rot, rotHash, later), addLoc: a.location, rotLoc: rot.location, addStatus: a.status, rotStatus: rot.status };
  }
  // 9 · OAuth: what the provider hands an OAuth MCP caller (ctx.props naming the admin, with its token as a Bearer that is no
  // minted key) never authenticates POST /control: the route resolves with no props, so it answers the sign-in, nothing written
  {
    const w = world();
    const before = w.snap();
    // (7.5b) the props carry the admin's stamp, as every grant does: a VALID grant, still never a /control credential
    const { credEpoch } = await import(pathToFileURL(join(ENGINE, "src", "oauthgrants.js")).href);
    const cred = await credEpoch(w.q.prepare("SELECT key_hash, pass_hash FROM people WHERE id = ?").get(ID.O));
    const r = await post(h, w, { action: "add-project", key: "oauth-proj", name: "OAuth Project" }, { bearer: "oauth-user:grant:secret", props: { personId: ID.O, scope: ["mcp:read", "mcp:write"], cred } });
    out.oauth = { status: r.status, location: r.location, same: w.snap() === before };
  }
  // 10 · Reissue revokes that person's sessions (the admin presses on a same-origin session cookie)
  {
    const w = world();
    const who = (cred) => call(h, w, "/whoami", { ...cred, accept: "application/json" }).then((x) => x.status);
    const before = await who({ bearer: TOK.C });
    const r = await post(h, w, { action: "rotate-key", personId: ID.C }, { cookie: TOK.O });
    out.reissue = { before, status: r.status, session: await who({ bearer: TOK.C }), oldKey: await who({ bearer: KEY.C }), own: await who({ bearer: TOK.O }),
      live: w.q.prepare("SELECT COUNT(*) AS n FROM tokens WHERE person_id = ? AND revoked = 0").get(ID.C).n,
      ownerLive: w.q.prepare("SELECT COUNT(*) AS n FROM tokens WHERE person_id = ? AND revoked = 0").get(ID.O).n };
  }
  // 11 · the admin's read-only credential: the admin's read, every can.* false with its reason; the page's controls all disabled
  {
    const w = world();
    const roK = sha(sha(KEY.O) + RO_SUFFIX);
    const ro = (await call(h, w, "/control/people", { bearer: roK, accept: "application/json" })).j || {};
    const full = (await call(h, w, "/control/people", { bearer: KEY.O, accept: "application/json" })).j || {};
    const page = await call(h, w, "/control", { bearer: roK });
    const btns = (page.text.match(/<button[^>]*data-door="POST \/control"[^>]*>/g) || []);
    const ids = (j) => (j.people || []).map((p) => p.id).join(",");
    out.readOnly = { status: page.status, admin: !!(ro.reader || {}).admin, flag: (ro.reader || {}).readOnly === true, sameIds: ids(ro) === ids(full) && !!ids(ro),
      anyCan: (ro.people || []).some((p) => ["role", "remove", "seat", "reissue"].some((k) => (p.can || {})[k])),
      reasons: [...new Set((ro.people || []).map((p) => (p.can || {}).reason))],
      buttons: btns.length, enabled: btns.filter((b) => !/\sdisabled[\s>]/.test(b)).length };
  }
  // 12 · a key in the address reads nothing (G2 M2)
  {
    const w = world();
    const roK = sha(sha(KEY.O) + RO_SUFFIX);
    const view = (t) => {
      const btns = t.match(/<button[^>]*data-door="POST \/control"[^>]*>/g) || [];
      const why = (b) => { const m = /aria-describedby="([^"]+)"/.exec(b); if (!m) return "";
        const p = new RegExp(`<p[^>]*\\sid="${m[1]}"[^>]*>([\\s\\S]*?)</p>`).exec(t); return p ? p[1].replace(/&#39;/g, "'") : ""; };
      const off = btns.filter((b) => /\sdisabled[\s>]/.test(b));
      return { buttons: btns.length, enabled: btns.length - off.length, reasons: [...new Set(off.map(why))] };
    };
    const kp = await call(h, w, "/control", { qk: KEY.O });
    const stray = await call(h, w, "/control", { cookie: TOK.O, qk: KEY.O });
    const roq = await call(h, w, "/control", { qk: roK });
    const json = (await call(h, w, "/control/people", { bearer: KEY.O, accept: "application/json" })).j || {};
    out.keyParam = { status: kp.status, location: kp.location, ...view(kp.text), stray: view(stray.text), roStatus: roq.status, roLocation: roq.location, ro: view(roq.text), jsonReader: Object.keys(json.reader || {}).sort().join(",") };
  }
  if (assert) {
    const KP = out.keyParam;
    const signIn = (st, loc) => st === 302 && /^\/login\?next=/.test(loc) && !loc.includes("k=");
    ok(signIn(KP.status, KP.location) && KP.buttons === 0 && signIn(KP.roStatus, KP.roLocation) && KP.ro.buttons === 0,
      `${label} 12 · a key in the address reads nothing (G2 M2): GET /control?k=<the admin's full key> -> ${KP.status} ${KP.location}, ?k=<the read-only credential> -> ${KP.roStatus} ${KP.roLocation}, no control drawn, the key never in the Location`);
    ok(KP.stray.enabled > 0 && KP.jsonReader === "admin,id",
      `${label} 12 · ...a same-origin cookie with a stray ?k= still draws ${KP.stray.enabled} enabled control(s); GET /control/people's reader keys [${KP.jsonReader}]`);
    // D1b item 5 (THE sign-in rule): a caller carrying a bearer header no person resolves for is refused 401, never sent to sign-in
    ok(out.oauth.status === 401 && out.oauth.same, `${label} 9 · an OAuth caller (ctx.props naming the admin, its token as a Bearer) POSTs add-project -> ${out.oauth.status} ${out.oauth.location || ""}, D1 ${out.oauth.same ? "unchanged" : "MOVED"}`);
    const bad = Object.entries(out.seat).filter(([, v]) => v.bearer !== 403 || v.cookie !== 403 || !v.same).map(([a, v]) => `${a} ${v.bearer}/${v.cookie}${v.same ? "" : " D1 MOVED"}`);
    ok(bad.length === 0, `${label} 1 · a seat's POST /control of each of the ${ACTIONS.length} actions (Bearer and a same-origin cookie) -> 403, D1 unchanged${bad.length ? ": " + bad.join(" · ") : ""}`);
    const H = out.hard;
    ok(H.cross.status === 403 && H.cross.same, `${label} 2 · the admin's cross-origin cookie POST -> ${H.cross.status}, D1 ${H.cross.same ? "unchanged" : "MOVED"}`);
    ok(H.roBearer.status === 403 && H.roBearer.same && /read-only credential/.test(H.roBearer.text) && [302, 401].includes(H.roK.status) && H.roK.same,
      `${label} 3 · the admin's read-only credential as a Bearer header -> ${H.roBearer.status} (the read-only refusal's own words); in ?k= -> ${H.roK.status} (no one signed in); D1 unchanged`);
    ok([302, 401].includes(H.fullK.status) && H.fullK.same,
      `${label} 4 · the admin's FULL key in ?k= with no header and no cookie -> ${H.fullK.status} (a key in an address signs no one in, G2 M2), D1 ${H.fullK.same ? "unchanged" : "MOVED"}`);
    ok(H.bearerStray.status === 200 && H.bearerStray.made && H.cookieStray.status === 200 && H.cookieStray.made,
      `${label} 4 · ...a Bearer with a stray ?k= (${H.bearerStray.status}) and a same-origin cookie with a stray ?k= (${H.cookieStray.status}) still write`);
    ok(out.promote.status === 200 && out.promote.role === "owner" && out.promotedRead === true, `${label} 5 · set-role: O makes Rae an admin -> ${out.promote.status}, role ${out.promote.role}, Rae reads reader.admin ${out.promotedRead}`);
    ok(out.demoteO.status === 200 && out.demoteO.role === "member", `${label} 5 · O demotes self while Rae is an admin -> ${out.demoteO.status}, role ${out.demoteO.role} (co-admins; never zero)`);
    ok(out.lastAdmin.status === 200 && out.lastAdmin.role === "owner" && out.lastAdmin.eo === "owner" && out.lastAdmin.same && /last admin/.test(out.lastAdmin.flash),
      `${label} 5 · Rae demoting self as the last REAL admin (the eval-fixed owner active) -> ${out.lastAdmin.status} "${out.lastAdmin.flash}", role ${out.lastAdmin.role}, D1 ${out.lastAdmin.same ? "unchanged" : "MOVED"}`);
    ok(out.lastAdminP.status === 200 && out.lastAdminP.role === "owner" && out.lastAdminP.same && /last admin/.test(out.lastAdminP.flash),
      `${label} 5 · ...and to partner (sprint 2) -> ${out.lastAdminP.status} "${out.lastAdminP.flash}", role ${out.lastAdminP.role}, D1 ${out.lastAdminP.same ? "unchanged" : "MOVED"}`);
    ok(out.badRole.status === 200 && out.badRole.same && /set-role needs/.test(out.badRole.flash), `${label} 5 · set-role role=owner (not admin|seated) -> "${out.badRole.flash}", nothing written`);
    const ao = out.addOwner.filter((x) => x.status !== 200 || !x.same || x.rows || !/Provisioning seats a person; make an admin with the role control/.test(x.flash));
    ok(ao.length === 0, `${label} 6 · add-person role ${out.addOwner.map((x) => JSON.stringify(x.role)).join(", ")} -> 200 "Nothing done — Provisioning seats a person…", nobody created${ao.length ? ": " + JSON.stringify(ao) : ""}`);
    ok(out.removeLast.status === 200 && out.removeLast.active === 1 && out.removeLast.same && /last active admin/.test(out.removeLast.flash),
      `${label} 7 · the eval-fixed owner removing the last REAL admin -> "${out.removeLast.flash}", still active, D1 ${out.removeLast.same ? "unchanged" : "MOVED"}`);
    const S = out.secret;
    const RI = out.reissue;
    ok(RI.before === 200 && RI.status === 200 && RI.session === 401 && RI.oldKey === 401 && RI.live === 0 && RI.own === 200 && RI.ownerLive === 1,
      `${label} 10 · Reissue: Rae's session answered ${RI.before}; after the admin's rotate-key (${RI.status}) her old session answers ${RI.session} and her old key ${RI.oldKey}, ${RI.live} live session row(s) of hers left; the admin's own session still answers ${RI.own} (${RI.ownerLive} live)`);
    const RO = out.readOnly;
    ok(RO.status === 200 && RO.admin && RO.flag && RO.sameIds && !RO.anyCan && RO.reasons.length === 1 && /read-only credential/.test(RO.reasons[0] || "") && /admin/.test(RO.reasons[0] || "") && RO.buttons > 0 && RO.enabled === 0,
      `${label} 11 · the admin's read-only credential reads the admin's roster (reader.admin ${RO.admin}, readOnly ${RO.flag}) with every can.* false ("${RO.reasons.join(" | ")}"); its GET /control (${RO.status}) draws ${RO.buttons} POST /control control(s), ${RO.enabled} enabled`);
    ok(S.add && S.rotate && S.addRole === "member" && !S.addLoc && !S.rotLoc && S.addStatus === 200 && S.rotStatus === 200,
      `${label} 8 · the add-person (role ${S.addRole}) and rotate-key secrets ride the body only (sha256 = the new key_hash): add ${S.add}, rotate ${S.rotate}, no Location, never on a later GET /control/people or GET /control`);
  }
  return out;
}
await probe(handler, "head", true);

// the secret checker, both ways on a synthetic answer: it finds a real one, and refuses one in a Location or a later GET
{
  const s = "a".repeat(8) + "0123456789abcdef0123456789abcdef", h = sha(s);
  ok(s.length === 40 && secretOk({ status: 200, text: `<p>copy it now: ${s}</p>`, location: "" }, h, "{}"), "the secret checker passes a body-only secret");
  ok(!secretOk({ status: 200, text: `<p>${s}</p>`, location: `/control?secret=${s}` }, h, "{}") && !secretOk({ status: 200, text: `<p>${s}</p>`, location: "" }, h, `{"k":"${s}"}`)
     && !secretOk({ status: 200, text: "<p>nothing</p>", location: "" }, h, "{}"),
    "the secret checker goes red on a secret in a Location, on a later GET, and on no secret in the body (it can fail)");
}

// ---- the mutation proofs: each guard disabled in a scratch src/ lets its refused case through ----
const MUTATIONS = [
  { name: "the owner gate", needle: `      if (request.method !== "GET" && !owner) {
        return servePage(env, { active: "control", owner: false, reader, status: 403, cache: "private, no-store",
          content: renderDenied({ what: "Only an admin can change who holds a seat, a role or a key. Nothing was changed." }) });`,
    mutate: (x) => x.replace(`if (request.method !== "GET" && !owner)`, `if (false && request.method !== "GET" && !owner)`),
    probe: (o) => `${o.seat["add-project"].bearer} ${o.seat["add-project"].same ? "unchanged" : "moved"}`, want: (s) => s === "200 moved" },
  { name: "the read-only refusal", needle: `      if (reader.readOnly && request.method !== "GET") {`,
    mutate: (x) => x.replace("if (reader.readOnly", "if (false && reader.readOnly"),
    probe: (o) => `${o.hard.roBearer.status} ${o.hard.roBearer.same ? "unchanged" : "moved"}`, want: (s) => s === "200 moved" },
  { name: "csrfRefused", needle: `      if (csrfRefused(request, url, reader)) {
        return servePage(env, { active: "control", owner: true, reader, status: 403, cache: "private, no-store",
          content: renderDenied({ what: "That change did not come from this site, so it was refused." }) });`,
    mutate: (x) => x.replace("if (csrfRefused(", "if (false && csrfRefused("),
    probe: (o) => `${o.hard.cross.status} ${o.hard.cross.same ? "unchanged" : "moved"}`, want: (s) => s === "200 moved" },
  { name: "the add-person owner refusal (D3b)", file: "admin.js", needle: `    if (role.toLowerCase() === ADMIN_ROLE) {`,
    mutate: (x) => x.replace("if (role.toLowerCase()", "if (false && role.toLowerCase()"),
    probe: (o) => String(o.addOwner[0].rows), want: (s) => s === "1" },
  { name: "set-role's eval exclusion (D3a)", file: "admin.js", needle: `const OTHER_REAL_ADMINS = "(SELECT COUNT(*) FROM people WHERE role='owner' AND active=1 AND org = {org} AND id<>?" + NOT_EVAL_SEAT_SQL("id") + ")";`,
    mutate: (x) => x.replace(` + NOT_EVAL_SEAT_SQL("id") + ")"`, ` + ")"`),
    probe: (o) => `${o.lastAdmin.role} ${o.removeLast.active}`, want: (s) => s === "member 0" },
  // sprint 2 (migrate-044): the demotion is SET_ROLE_SQL's, to member or to partner; its guard dropped lets the last admin go
  { name: "set-role's guard inside the ONE statement", file: "admin.js", needle: `export const SET_ROLE_SQL = "UPDATE people SET role=? WHERE id=? AND active=1 AND org = {org} AND role<>? AND (role<>'owner' OR " + OTHER_REAL_ADMINS + ">=1)";`,
    mutate: () => `export const SET_ROLE_SQL = "UPDATE people SET role=? WHERE id=? AND active=1 AND org = {org} AND role<>? AND (role<>'owner' OR ? IS NOT NULL)";`,
    probe: (o) => String(o.lastAdmin.role), want: (s) => s === "member" },
  { name: "the OAuth props never reaching /control", needle: `      const reader = await resolveReader(request, env, url, { readOnlyOk: true }).catch(() => null);
      if (!reader) return signInOr401(request, url);
      const owner = reader.role === "owner";`,
    mutate: (x) => x.replace("{ readOnlyOk: true })", "{ readOnlyOk: true, props: ctx && ctx.props })"),
    probe: (o) => `${o.oauth.status} ${o.oauth.same ? "unchanged" : "moved"}`, want: (s) => s === "200 moved" },
  // UI-B12b: Reissue's session revoke removed -> Rae's old session still answers after the reissue
  // sprint 7's review (B1): remove-person runs the same REVOKE line (its seat sessions), so the needle carries rotate-key's own
  // preceding comment to stay unique
  { name: "Reissue's session revoke (UI-B12b)", file: "admin.js", needle: `      // a sign-in still in flight on the old secret mints nothing after the UPDATE above (LOGIN_SESSION_SQL's EXISTS, U-REISSUE)\n      await db(env).prepare(REVOKE_SESSIONS_SQL).bind(personId).run();\n`,
    mutate: () => "",
    probe: (o) => `${o.reissue.session} ${o.reissue.live}`, want: (s) => s === "200 1" },
  // UI-B12b: the read-only fold removed from readControl -> the read-only credential reads every can.* true, its page enabled
  { name: "the read-only fold in readControl (UI-B12b)", file: "controlread.js", needle: `  const writes = admin && !readOnly;`,
    mutate: () => `  const writes = admin;`,
    probe: (o) => `${o.readOnly.anyCan} ${o.readOnly.enabled > 0}`, want: (s) => s === "true true" },
  // G2 M2: a ?k= sign-in put back into resolveReader (on the read-only-safe routes /control resolves through) -> the full key
  // in the address reads Control again
  { name: "no sign-in by a key in the address (G2 M2)", file: "core.js", needle: `  return bearerKey ? await resolveReadOnly(bearerKey, env) : null;`,
    mutate: (x) => `  const kq = url.searchParams.get("k"); if (kq) { const p = await authenticate(new Request(url.toString(), { headers: { authorization: "Bearer " + kq } }), env); if (p) return { ...p, readOnly: false }; }\n` + x,
    probe: (o) => `${o.keyParam.status} ${o.keyParam.buttons > 0}`, want: (s) => s === "200 true" },
];
// 13 · (sprint 3 S3b) Invite seats exactly what its form ticks; a script naming no project seats a member on the org's SOLE
//      project (ADR-100) and a Partner nowhere; eval=1 mints one of the suites' seats (eval-fixed-*)
{
  const w = world();
  w.q.prepare("UPDATE projects SET active = 0 WHERE key <> 'alpha'").run();
  const add = async (email, role, extra = {}) => { await post(handler, w, { action: "add-person", name: email, email, role, ...extra }, { bearer: KEY.O });
    const p = w.q.prepare("SELECT id FROM people WHERE email = ?").get(email); return { id: p && p.id, seats: p ? w.q.prepare("SELECT project_key FROM project_seats WHERE person_id = ?").all(p.id).map((r) => r.project_key) : null }; };
  const m0 = await add("s3b-m0@northwind.test", "member"), p0 = await add("s3b-p0@northwind.test", "partner");
  const m1 = await add("s3b-m1@northwind.test", "member", { seatsChosen: "1" }), p1 = await add("s3b-p1@northwind.test", "partner", { seatsChosen: "1", projectKey: "alpha" });
  const e0 = await add("s3b-e0@northwind.test", "member", { eval: "1" });
  ok(JSON.stringify(m0.seats) === '["alpha"]' && JSON.stringify(p0.seats) === "[]" && JSON.stringify(m1.seats) === "[]" && JSON.stringify(p1.seats) === '["alpha"]' && /^eval-fixed-/.test(e0.id || ""),
    `13 · one active project: a script's member is seated on it (${m0.seats}), a script's Partner nowhere (${p0.seats}); the form (seatsChosen) seats exactly what it ticks: none (${m1.seats}), alpha for a Partner (${p1.seats}); eval=1 mints ${e0.id}`);
}

for (const m of MUTATIONS) {
  const mutDir = mkdtempSync(join(ENGINE, ".control-door-mutation-"));
  try {
    cpSync(join(ENGINE, "src"), join(mutDir, "src"), { recursive: true });
    const p = join(mutDir, "src", m.file || "index.js");
    const original = readFileSync(p, "utf8");
    if (original.split(m.needle).length !== 2) { ok(false, `mutation ${m.name}: the guard is not found exactly once in src/${m.file || "index.js"} — this selftest is stale against its shape`); continue; }
    writeFileSync(p, original.replace(m.needle, m.mutate(m.needle)));
    const { default: mutated } = await import(pathToFileURL(join(mutDir, "src", "index.js")).href);
    const s = m.probe(await probe(mutated, "mutated", false));
    ok(m.want(s), m.want(s) ? `mutation ${m.name}: disabled, its refused case goes through (${s}) — this check is load-bearing` : `mutation ${m.name}: disabled, still got ${s} — this check is NOT load-bearing`);
  } finally {
    rmSync(mutDir, { recursive: true, force: true });
  }
}

console.log(`control-door-selftest: ${checks - failed} pass · ${failed} fail`);
process.exit(failed ? 1 : 0);
