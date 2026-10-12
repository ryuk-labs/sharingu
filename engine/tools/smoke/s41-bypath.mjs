// tools/smoke/s41-bypath.mjs — sprint 7, 7.4 (docs/plan/PLATFORM.md §2 items 8 and 9: each org at agent.ryuklabs.io/<org> for
// every page; the AI at the one /mcp; one session per account, the org from the address and the membership): the front door by
// path on the real local worker. Runs after s40. It seeds the suites' org as the operator's tools do (settings.suites: its path
// name is plain, /suites), and holds every key in memory, never printed.
//   · org 1's pages at /<org 1>/… with a browser's session cookie: every page renders signed in, and every link, form and
//     script path on it carries /<org 1> (none left at the root but the platform's own doors)
//   · the old addresses: a page navigation to /home (and /, /map?…) with that cookie is sent to /<org 1>/home (the query
//     kept); with none, the sign-in (next kept); under an org's address with no credential, the sign-in — the same for a
//     name no org holds
//   · the suites' org's seat (an account with NO org-1 seat: 7.1's fork, closed) signs in at the root and lands on /suites;
//     its cookie reads /suites/home signed in, its links under /suites
//   · one session per account: the account's own passphrase opens ONE session that reads as its org-1 seat under /<org 1> and
//     as its suites seat under /suites; its root /home goes to the org picker (7.4b: an account in two orgs picks, s42)
//   · membership never told: org 1's session under /suites (no seat there), the suites seat's under /<org 1>, a bearer of org
//     1 under /suites and every credential under /no-such-org answer ONE body, 404
//   · bearer keys unchanged: /whoami and /read at the root answer from the key's org; under its own org's address too
//   · /mcp unchanged at the root; a cookie is no credential there; an MCP answer's links carry the reader's org path (org 1's
//     key: /<org 1>/…; the suites seat's key: /suites/…); a public file's link answers anyone under any address
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, ownerKey, sha, d1rows as rows, orgSlug, asAt, acceptWaiting } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const T = () => new Date().toISOString();
// the door, retried once when the socket failed (this case reads the local D1 between calls: the s37 scar), and once after the
// address's window when the flood filter (LOGIN_LIMIT) refused: that proves nothing
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && r.json && r.json.error === "too_many_attempts_ip") { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
const NAV = { accept: "text/html", nav: true };   // a page navigation (src/util.js isBrowserNavigation: Sec-Fetch-Dest document)
const login = async (email, password, next) => { const r = await http("POST", "/login", { body: { email, password, device: "smoke-s41", ...(next ? { next } : {}) } }); return { status: r.status, error: r.json && r.json.error, token: r.json && r.json.token }; };
const webLogin = async (email, password, next) => http("POST", "/login", { form: { email, password, web: "1", ...(next ? { next } : {}) } });
const secretOf = (t) => (String(t).match(/(?:API key\)|shown again): ([0-9a-f]{40})\b/) || [])[1] || null;
const add = async (adminKey, name, email) => { const k = secretOf((await http("POST", "/control", { key: adminKey, form: { action: "add-person", name, email } })).text); acceptWaiting(email); return k; };   // a seat that waits for its holder's yes (A1): accepted
const orgOf = (id) => ((rows(`SELECT org FROM people WHERE id = ${q(id)}`)[0]) || {}).org;
// the platform's own doors (src/orgpath.js PLATFORM_PATHS): the only root paths an org's page may link
const PLATFORM = new Set(["login", "logout", "signup", "orgs", "install", "mcp", "oauth", ".well-known", "health", "fonts", "favicon.svg"]);
// unprefixed(html, slug) -> the links, forms and script paths of a page that are NOT under /<slug> and not a platform door
function unprefixed(html, slug) {
  const out = [];
  for (const m of String(html).matchAll(/\b(?:href|action|src|formaction)="(\/[^"#]*)"/g)) {
    const seg = m[1].split(/[/?]/)[1] || "";
    if (seg !== slug && !PLATFORM.has(seg)) out.push(m[1]);
  }
  // a page's own script: a quoted app path that is not orgPath's argument would be fetched at the root
  const scripts = [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  for (const m of scripts.matchAll(/(?<!orgPath\()['"](\/(?:home|map|goals|gtm|build|decisions|broadcast|control|versions|search|updates|library|read|render|contribution|question|preview|profile|project|regrade)\b[^'"]*)['"]/g)) out.push("script:" + m[1]);
  return [...new Set(out)];
}
const S = {};   // what the first case leaves for the next ones
// mcp(key, tool, args) -> the tool's answer as the worker sent it (lib.mjs's own mcp() reads it with the org base taken off)
let rpc = 0;
async function mcp(key, name, args = {}) {
  const r = await http("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } } });
  let j = null; try { j = JSON.parse(r.raw); } catch { j = null; }
  const res = j && j.result;
  let out = null; try { out = JSON.parse(res.content[0].text); } catch { out = null; }
  return { out, isError: !res || !!res.isError };
}

smoke("bypath · org 1's pages at /<org 1>/… with a browser's session: every page renders signed in, every link, form and script path under /<org 1>; the old addresses redirect there", async () => {
  S.slug1 = orgSlug(1);
  expect(S.slug1, "org 1 holds no path name (migrate-072)");
  const me = (await http("GET", "/whoami", { key: ownerKey })).json || {};
  S.ownerEmail = me.email; S.ownerId = me.id;
  const one = await login(S.ownerEmail, ownerKey);
  expect(one.status === 200 && one.token, () => `org 1's owner signs in: ${one.status} ${one.error || ""}`);
  S.tok1 = one.token;
  const pages = ["/home", "/build", "/gtm", "/goals", "/decisions", "/map", "/map/screens", "/versions", "/broadcast", "/control", "/missing", "/library", "/changes", "/audit", "/profile", "/docs"];
  const bad = [], seen = [];
  for (const p of pages) {
    const r = await asAt(1, S.tok1, p, NAV);
    const loose = unprefixed(r.raw, S.slug1);   // the answer as sent (lib.mjs takes the base off .text for the older cases)
    seen.push(`${p} ${r.status}`);
    if (r.status !== 200 || !/data-region="avatar"/.test(r.raw) || !r.raw.includes(`data-org-base="/${S.slug1}"`) || loose.length) bad.push(`${p}: ${r.status}${loose.length ? ` loose ${loose.slice(0, 4).join(" ")}` : ""}`);
  }
  expect(!bad.length, () => `pages under /${S.slug1}: ${bad.join("; ")}`);
  // the old addresses: a navigation with the cookie lands on the same page in org 1, the query kept
  const h = await http("GET", "/home", { cookie: S.tok1, accept: "text/html", nav: true, root: true });
  const root = await http("GET", "/", { cookie: S.tok1, accept: "text/html", nav: true, root: true });
  const mq = await http("GET", "/map?layer=screens", { cookie: S.tok1, accept: "text/html", nav: true, root: true });
  expect(h.status === 302 && h.locationRaw === `/${S.slug1}/home` && root.status === 302 && root.locationRaw === `/${S.slug1}` && mq.status === 302 && mq.locationRaw === `/${S.slug1}/map?layer=screens`,
    () => `the old addresses: /home ${h.status} ${h.locationRaw}; / ${root.status} ${root.locationRaw}; /map?layer=screens ${mq.status} ${mq.locationRaw}`);
  // a cookie at the root signs no one in for a script (its org is its address's): 401, never another org's answer
  const rootJson = await http("GET", "/whoami", { cookie: S.tok1, root: true });
  // signed out: the root page is the sign-in with next; under an org's address the same rule, for a name no org holds too
  const so = await http("GET", "/home", NAV), so1 = await http("GET", `/${S.slug1}/home`, NAV), soX = await http("GET", `/no-such-org-${TAG}/home`, NAV);
  expect(rootJson.status === 401 && so.status === 302 && so.locationRaw === "/login?next=%2Fhome" && so1.status === 302 && so1.locationRaw === `/login?next=${encodeURIComponent(`/${S.slug1}/home`)}`
    && soX.status === 302 && soX.locationRaw === `/login?next=${encodeURIComponent(`/no-such-org-${TAG}/home`)}`,
    () => `a cookie at the root for a script ${rootJson.status}; signed out: /home ${so.status} ${so.locationRaw}; /${S.slug1}/home ${so1.status} ${so1.locationRaw}; /no-such-org/home ${soX.status} ${soX.locationRaw}`);
  return `${pages.length} pages under /${S.slug1} signed in, every path under it (${seen.slice(0, 3).join(", ")} …); /home -> /${S.slug1}/home, / -> /${S.slug1}, the query kept; a root cookie signs no one in (401); signed out: the sign-in with next, the same for a name no org holds`;
});

smoke("bypath · the suites' org's seat (no org-1 seat: 7.1's fork, closed) signs in at the root and reaches /suites/home; one ACCOUNT session reads as its seat in each org", async () => {
  expect(S.tok1, "the first bypath case did not run");
  const at = T(), n = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.suites = n; S.suitesKey = randomBytes(20).toString("hex");
  // the operator's tools seed the suites' org (settings.suites: migrate-072 gives it the plain path name "suites")
  rows(`INSERT INTO org (id, name, settings, created_at, updated_at, plan) VALUES (${n}, 'Suites', '{"suites":1}', ${q(at)}, ${q(at)}, 'local')`);
  rows(`INSERT INTO projects (key, name, active, created_at) VALUES ('o${n}--suite', 'Suite', 1, ${q(at)})`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('suites-owner-${n}', 'Suites Owner', ${q(`owner@suites${n}.local`)}, 'owner', ${q(sha(S.suitesKey))}, 1, ${q(at)}, ${n})`);
  S.slugS = orgSlug(n);
  expect(S.slugS === "suites", () => `the suites' org's path name: ${S.slugS}`);
  // a member of the suites' org only: an account with no org-1 seat (7.1 answered no_seat_here at org 1's address)
  S.email = `bypath-${TAG}@smoke.local`;
  S.seatKey = await add(S.suitesKey, "Bypath Member", S.email);
  expect(S.seatKey, "add-person in the suites' org minted no secret");
  const s = await login(S.email, S.seatKey);
  const sw = s.token ? (await http("GET", "/whoami", { key: s.token })).json || {} : {};
  const form = await webLogin(S.email, S.seatKey);
  const ck = (form.setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1];
  const home = ck ? await asAt(n, ck, "/home", NAV) : {};
  const loose = home.raw ? unprefixed(home.raw, "suites") : ["(no page)"];
  expect(s.status === 200 && orgOf(sw.id) === n && form.status === 302 && form.locationRaw === "/suites" && ck && home.status === 200 && /data-region="avatar"/.test(home.text) && !loose.length,
    () => `the suites seat: ${s.status} ${s.error || ""} as org ${orgOf(sw.id)}; the form lands ${form.status} ${form.locationRaw}; /suites/home ${home.status} ${loose.length ? `loose ${loose.slice(0, 4).join(" ")}` : ""}`);
  S.tokS = s.token;
  // one ACCOUNT session: org 1 seats the same email; the account's own passphrase (as the sign-up gives it) opens ONE session
  const k1 = await add(ownerKey, "Bypath Member (org 1)", S.email);
  const salt = randomBytes(16).toString("hex"), pass = `bypath-account-pass-${TAG}`;
  rows(`UPDATE accounts SET pass_hash = ${q(pbkdf2Sync(pass, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"))}, pass_salt = ${q(salt)} WHERE email = ${q(S.email)}`);
  const acct = await login(S.email, pass, `/${S.slug1}/home`);   // an account in two orgs names one (A1: the JSON sign-in never picks)
  const kind = acct.token ? (rows(`SELECT account_id FROM tokens WHERE token_hash = ${q(sha(acct.token))}`)[0] || {}).account_id : null;
  const in1 = acct.token ? await asAt(1, acct.token, "/whoami") : {}, inS = acct.token ? await asAt(n, acct.token, "/whoami") : {};
  const old = acct.token ? await http("GET", "/home", { cookie: acct.token, accept: "text/html", nav: true, root: true }) : {};
  expect(k1 && acct.status === 200 && kind && in1.status === 200 && orgOf(in1.json.id) === 1 && inS.status === 200 && orgOf(inS.json.id) === n && old.status === 302 && old.locationRaw === "/orgs?to=%2Fhome",
    () => `the account session (${kind ? "account" : "seat"}): under /${S.slug1} ${in1.status} as org ${in1.json && orgOf(in1.json.id)}; under /suites ${inS.status} as org ${inS.json && orgOf(inS.json.id)}; its root /home ${old.status} ${old.locationRaw}`);
  S.tokA = acct.token;
  return `the suites seat (no org-1 seat) signs in: whoami in org ${n}; the form lands on /suites; /suites/home signed in, every path under /suites; one account session reads its org-1 seat under /${S.slug1} and its suites seat under /suites; its root /home -> the org picker (7.4b: /orgs?to=%2Fhome)`;
});

smoke("bypath · membership is never told: a session or bearer with no seat at an address, and any credential at a name no org holds, answer ONE 404 body; bearer keys and /mcp unchanged; an MCP answer's links carry the reader's org path", async () => {
  expect(S.tokS && S.slugS, "the suites bypath case did not run");
  const x = `/no-such-org-${TAG}`;
  const probes = {
    "org 1's session under /suites": await http("GET", "/suites/home", { cookie: S.tok1, ...NAV }),
    "the suites seat's session under org 1": await http("GET", `/${S.slug1}/home`, { cookie: S.tokS, ...NAV }),
    "org 1's bearer under /suites": await http("GET", "/suites/whoami", { key: ownerKey }),
    "org 1's session under a name no org holds": await http("GET", `${x}/home`, { cookie: S.tok1, ...NAV }),
    "org 1's bearer under a name no org holds": await http("GET", `${x}/whoami`, { key: ownerKey }),
    "a platform door under an org": await http("GET", `/${S.slug1}/login`, NAV),
  };
  const bodies = new Set(Object.values(probes).map((r) => `${r.status}|${r.text}`));
  expect(bodies.size === 1 && Object.values(probes).every((r) => r.status === 404),
    () => `the not-here answers: ${Object.entries(probes).map(([k, r]) => `${k} ${r.status} ${JSON.stringify(r.text.slice(0, 40))}`).join("; ")}`);
  // bearer keys: the root answers from the key's org, as before; under its own org's address too
  const w0 = await http("GET", "/whoami", { key: ownerKey }), w1 = await http("GET", `/${S.slug1}/whoami`, { key: ownerKey }), wS = await http("GET", "/whoami", { key: S.seatKey });
  const rd = await http("GET", "/read?kind=goal&limit=2", { key: ownerKey });
  expect(w0.status === 200 && w0.json.id === S.ownerId && w1.status === 200 && w1.json.id === S.ownerId && wS.status === 200 && orgOf(wS.json.id) === S.suites && rd.status === 200 && Array.isArray(rd.json.items),
    () => `bearers: /whoami ${w0.status}, /${S.slug1}/whoami ${w1.status}, the suites key /whoami ${wS.status} (org ${wS.json && orgOf(wS.json.id)}), /read ${rd.status}`);
  // /mcp unchanged at the root: a key's tools/call answers; a cookie alone is no credential there
  const t = await mcp(ownerKey, "whoami", {});
  const ck = await http("POST", "/mcp", { cookie: S.tok1, body: { jsonrpc: "2.0", id: 1, method: "tools/list" }, root: true });
  expect(!t.isError && t.out && t.out.id === S.ownerId && ck.status === 401, () => `/mcp: a key's whoami ${t.isError ? "error" : t.out && t.out.id}; a cookie alone ${ck.status}`);
  // an MCP answer's links: under org 1's path for org 1's key, under /suites for the suites seat's key
  const g = await mcp(ownerKey, "read", { kind: "goal", limit: 3 });
  const hrefs1 = [g.out && g.out.href, ...((g.out && g.out.items) || []).map((i) => i.href)].filter(Boolean);
  const fs = await mcp(S.seatKey, "save_file", { content: "bypath", title: `Bypath ${TAG}`, group: "smoke", public: true });
  const deep = fs.out && fs.out.deeplink;
  expect(hrefs1.length && hrefs1.every((h) => h.startsWith(`/${S.slug1}/`)) && deep && new URL(deep).pathname.startsWith("/suites/artifact/"),
    () => `MCP links: org 1's read ${brief(hrefs1.slice(0, 3))}; the suites seat's file ${deep}`);
  // the public file by its link: anyone, under any address (ADR-055's ruled exception), the same body
  const path = new URL(deep).pathname, id = path.split("/").pop();
  const pub = await http("GET", path, {}), pubX = await http("GET", `${x}/artifact/${id}`, {}), pubRoot = await http("GET", `/artifact/${id}`, {});
  expect(pub.status === 200 && pubX.status === 200 && pubRoot.status === 200 && pub.text === "bypath" && pubX.text === pub.text,
    () => `the public file: ${path} ${pub.status}, under a name no org holds ${pubX.status}, at the root ${pubRoot.status}`);
  return `${Object.keys(probes).length} not-here probes, ONE 404 body; bearers at the root and under their own address unchanged; /mcp: a key answers, a cookie 401; MCP links under /${S.slug1} and /suites; a public file answers anyone under any address`;
});
