// tools/smoke/s66-after-org.mjs — sprint 21, slice 21.P part E2, "after the org" (the owner's MCQs of 2026-10-14: src/index.js POST
// /orgs and src/accounts.js openSession, src/orgpage.js renderOrgMade, src/connectcards.js, src/home.js's Connect card,
// src/controlpage.js connectBlocks), on the real local worker. The account is made as a person makes one (the operator's code,
// held in memory, then POST /signup); every key and token is held in memory, never printed.
//   · D17: a web POST /orgs answers the done page WITH the session cookie POST /login sets (__Host-, HttpOnly, Secure, SameSite=Lax,
//     Path=/, 90 days) and no Location; its one primary opens the org's address, where Home loads signed in; a cross-site POST /orgs
//     gets no session and makes nothing; the JSON POST /orgs sets no cookie
//   · D18: the done page leads with Connect your AI (the request's own MCP address, Claude's and ChatGPT's logos served by the
//     worker, the two commands), holds no "bearer", and the key only behind "Show the owner key"
//   · E21: the first Home opens on ONE Connect card above the empty cards; one contribution filed through the MCP takes it away
//   · E22: Control · Connect lists Claude and ChatGPT first, open
import { randomBytes } from "node:crypto";
import { smoke, expect, http as http0, operator, fileVia, sha, d1rows as rows, patientFetch, BASE } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
// the address's flood filter (LOGIN_LIMIT: /login, /signup and /orgs share one budget) refusing proves nothing: once more after its window
const paced = async (go) => { let r = await go(); if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 61000)); r = await go(); } return r; };
const http = (method, path, o) => paced(() => http0(method, path, o));
// a browser's form POST /orgs, as a same-origin page (or a cross-site one) sends it
const formOrgs = (fields, site = "same-origin") => paced(() => patientFetch(`${BASE}/orgs`, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html", "sec-fetch-site": site, ...(site === "cross-site" ? { origin: "https://evil.test" } : {}) },
  body: new URLSearchParams({ product: "After App", line: "After one line", stage: "building", ...fields, web: "1" }).toString() }));   // 21.4b: the product step
const COOKIE = /^__Host-ar_session=([^;]+); HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7776000$/;
const page = (path, token) => http0("GET", path, { cookie: token, accept: "text/html", nav: true, root: true });
async function account(email, pass) {
  const a = await operator("allow", "--email", email);
  expect(a.rc === 0 && a.code, () => `operator allow ${email}: rc ${a.rc} ${a.out.slice(0, 200)}`);
  const r = await http("POST", "/signup", { body: { email, code: a.code, password: pass, device: "smoke-s66" } });
  expect(r.status === 200 && r.json.account === "created", () => `the sign-up of ${email}: ${r.status} ${r.text.slice(0, 200)}`);
}
const S = {};

smoke("after the org · a web POST /orgs answers the done page WITH POST /login's session cookie, no Location; a cross-site one gets no session and makes nothing; the JSON one sets no cookie", async () => {
  S.email = `after-${TAG}@smoke.local`; S.pass = `smoke-after-pass-${TAG}`; S.slug = `after-${TAG}`;
  await account(S.email, S.pass);
  const fields = { email: S.email, password: S.pass, name: `After ${TAG}`, slug: S.slug };
  const x = await formOrgs(fields, "cross-site");
  expect(x.status === 403 && !x.headers.get("set-cookie") && !rows(`SELECT id FROM org WHERE slug = ${q(S.slug)}`).length, () => `the cross-site form: ${x.status}, cookie ${!!x.headers.get("set-cookie")}`);
  const f = await formOrgs(fields);
  S.done = await f.text();
  S.token = (COOKIE.exec(f.headers.get("set-cookie") || "") || [])[1];
  S.key = (/data-secret="owner-key">([0-9a-f]{40})</.exec(S.done) || [])[1];
  const org = rows(`SELECT id FROM org WHERE slug = ${q(S.slug)}`)[0] || {};
  const tok = S.token ? rows(`SELECT t.person_id, t.org, t.account_id, p.role, p.key_hash FROM tokens t JOIN people p ON p.id = t.person_id WHERE t.token_hash = ${q(sha(S.token))}`)[0] || {} : {};
  const acc = rows(`SELECT id FROM accounts WHERE email = ${q(S.email)}`)[0] || {};
  expect(f.status === 200 && S.token && S.key && !f.headers.get("location") && f.headers.get("cache-control") === "no-store" && tok.org === org.id && tok.role === "owner" && tok.key_hash === sha(S.key) && tok.account_id === acc.id,
    () => `the form: ${f.status}, cookie ${(f.headers.get("set-cookie") || "none").replace(/=[^;]+/, "=<token>")}, location ${f.headers.get("location")}; its session ${JSON.stringify({ ...tok, key_hash: tok.key_hash === sha(S.key || "") })} (org ${org.id})`);
  const e2 = `after-json-${TAG}@smoke.local`;
  await account(e2, S.pass);
  const j = await http("POST", "/orgs", { body: { email: e2, password: S.pass, name: `After Json ${TAG}`, slug: `after-json-${TAG}` } });
  expect(j.status === 200 && j.json && j.json.key && !j.setCookie, () => `the JSON creation: ${j.status}, cookie ${!!j.setCookie}`);
  return `a cross-site form 403, no cookie, no org; the web form 200 with __Host-ar_session (HttpOnly; Secure; SameSite=Lax; Path=/; 90 days), no Location: an account session on org ${org.id}'s new owner seat; the JSON creation 200, no cookie`;
});

smoke("after the org · the done page leads with Connect your AI (the MCP address, Claude's and ChatGPT's logos, the two commands), no \"bearer\", the key only behind Show the owner key; Open your org its one primary", async () => {
  expect(S.done && S.key, "the creation case did not run");
  const h = S.done;
  const fold = (/<details class="key-fold"[^>]*>[\s\S]*?<\/details>/.exec(h) || [""])[0];
  const logos = [...h.matchAll(/data-mark="(claude|chatgpt)"[^>]*><img src="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  const served = await Promise.all(logos.map(async ([, src]) => (await patientFetch(BASE + src)).headers.get("content-type")));
  const primaries = (h.match(/class="primary"|<button type="submit"|class="done-action"/g) || []).length;
  expect(/data-screen="org-made"/.test(h) && h.indexOf(">Connect your AI.<") > 0 && h.indexOf(">Connect your AI.<") < h.indexOf('data-region="connect-ai"') && h.indexOf('data-region="connect-ai"') < h.indexOf('<details class="key-fold"')
    && h.includes(`<code>${BASE}/mcp</code>`) && h.includes(`claude mcp add --transport http `) && h.includes(`codex mcp add `),
    () => `the head: Connect your AI ${h.indexOf(">Connect your AI.<")}, the cards ${h.indexOf('data-region="connect-ai"')}, the fold ${h.indexOf('<details class="key-fold"')}; the address ${h.includes(`<code>${BASE}/mcp</code>`)}`);
  expect(logos.map(([k]) => k).join() === "claude,chatgpt" && served.every((t) => t === "image/png"), () => `the logos: ${JSON.stringify(logos)} served ${served.join(", ")}`);
  expect(!/bearer/i.test(h) && /<summary>Show the owner key<\/summary>/.test(fold) && fold.includes(S.key) && h.split(S.key).length === 2 && /for your scripts and API calls/i.test(fold),
    () => `the key: no bearer ${!/bearer/i.test(h)}, folded ${fold.includes(S.key)}, once ${h.split(S.key).length - 1}`);
  expect(primaries === 1 && new RegExp(`<a class="primary" data-region="open-org" href="/${S.slug}">Open your org</a>`).test(h), () => `the primaries: ${primaries}`);
  return `Connect your AI first (the MCP address, Claude's and ChatGPT's logos as image/png, claude mcp add and codex mcp add), then the key folded behind Show the owner key (once, for scripts and API calls), no "bearer"; Open your org -> /${S.slug}, the one primary`;
});

smoke("after the org · the org's Home loads signed in and opens on ONE Connect card above the empty cards; one contribution through the MCP takes it away", async () => {
  expect(S.token && S.key, "the creation case did not run");
  const open = await page(`/${S.slug}`, S.token);
  const home = await page(`/${S.slug}/home`, S.token);
  const h = home.raw;
  const at = (r) => h.indexOf(`data-region="${r}"`);
  expect((open.status === 200 || (open.status === 302 && open.locationRaw === `/${S.slug}/home`)) && home.status === 200 && /data-screen="home"/.test(h) && (h.match(/data-region="connect-first"/g) || []).length === 1
    && at("connect-first") < at("metrics") && h.includes(`<code>${BASE}/mcp</code>`) && new RegExp(`href="/${S.slug}/control#ct-connect"`).test(h) && /Nothing contributed yet/.test(h),
    () => `the address ${open.status} ${open.locationRaw}; Home ${home.status}: connect-first ${at("connect-first")} (metrics ${at("metrics")})`);
  const f = await fileVia(S.key, { items: [{ contribution: { lane: "leader", kind: "note", what: `The first note of s66 ${TAG}`, why: "the first contribution takes the Connect card away" } }] });
  expect(!f.isError && f.step === "file", () => `the filing: ${f.step} ${JSON.stringify(f.out).slice(0, 300)}`);
  const after = await page(`/${S.slug}/home`, S.token);
  expect(after.status === 200 && !/data-region="connect-first"/.test(after.raw) && /data-region="metrics"/.test(after.raw), () => `Home after the filing: ${after.status}, the Connect card ${/data-region="connect-first"/.test(after.raw)}`);
  return `/${S.slug} ${open.status}; its Home signed in, the Connect card first (the MCP address, Control · Connect), the empty cards under it; one contribution through the MCP and it is gone`;
});

smoke("after the org · Control · Connect lists Claude and ChatGPT first, open, then the plugin, the key row and Codex", async () => {
  expect(S.token, "the creation case did not run");
  const c = await page(`/${S.slug}/control`, S.token);
  const conn = c.raw.slice(c.raw.indexOf('data-region="connect"'));
  const blocks = [...conn.matchAll(/data-client-block="([a-z-]+)"><details class="p-x"( open)?>/g)].map((m) => `${m[1]}${m[2] ? "(open)" : ""}`);
  expect(c.status === 200 && blocks.join() === "claude-connector(open),chatgpt(open),claude-plugin,claude-code,codex", () => `Control · Connect ${c.status}: ${blocks.join(", ")}`);
  return blocks.join(" · ");
});
