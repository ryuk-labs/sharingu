// tools/smoke/s42-picker.mjs — sprint 7, 7.4b (docs/plan/PLATFORM.md §2 items 8 and 9: "sign-in lists the person's orgs; each org's
// brand on its own pages"): the org picker, the rail's org switcher, the brand of the front door and the one not-here page, on the
// real local worker. Runs after s41. It seeds an org of its own as the operator's tools do and holds every key in memory, never
// printed.
//   · an ACCOUNT in two orgs (org 1 and its own) signs in at the root with the account's passphrase -> the picker (GET /orgs)
//     lists exactly its two orgs; each link lands signed in at /<org>/home; its root page navigation goes to the picker
//   · a one-org account lands straight in its org (no picker); a SEAT session (a seat's own secret, the same account) never sees
//     the picker (GET /orgs sends it to its seat's org) nor the switcher
//   · the switcher: the account session's rail under either org lists exactly the account's orgs (the current one marked); a
//     one-org account's rail lists none
//   · the brand: the root's sign-in, sign-up and create-an-org wear sharingu's own; the sign-in a signed-out visit to the org's
//     address is sent to wears THAT org's name; the not-here answers are ONE body, in the platform's brand, naming no org
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { smoke, expect, http as http0, ownerKey, sha, d1rows as rows, orgSlug, acceptWaiting } from "./lib.mjs";

const TAG = randomBytes(3).toString("hex");
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const T = () => new Date().toISOString();
// the door, retried once when the socket failed, and once after the address's window when the flood filter refused (s41's rule)
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many sign-in attempts from this address/.test(r.raw || "")) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
const NAV = { accept: "text/html", nav: true };
const webLogin = async (email, password, next) => {
  const r = await http("POST", "/login", { form: { email, password, web: "1", ...(next ? { next } : {}) } });
  return { status: r.status, at: r.locationRaw, cookie: (r.setCookie.match(/__Host-ar_session=([^;]+)/) || [])[1] || "" };
};
const secretOf = (t) => (String(t).match(/(?:API key\)|shown again): ([0-9a-f]{40})\b/) || [])[1] || null;
const add = async (adminKey, name, email) => { const k = secretOf((await http("POST", "/control", { key: adminKey, form: { action: "add-person", name, email } })).text); acceptWaiting(email); return k; };   // a seat that waits for its holder's yes (A1): accepted
const accountPass = (email, pass) => {
  const salt = randomBytes(16).toString("hex");
  rows(`UPDATE accounts SET pass_hash = ${q(pbkdf2Sync(pass, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"))}, pass_salt = ${q(salt)} WHERE email = ${q(email)}`);
};
// picked(html) -> the picker's org links "slug=href"; switched(html) -> the rail switcher's; current(html) -> its marked org
const picked = (html) => [...String(html).matchAll(/<a class="org-pick" href="([^"]+)" data-org="([^"]+)"/g)].map((m) => `${m[2]}=${m[1]}`).sort();
const railSwitch = (html) => (String(html).match(/data-region="org-switcher"[\s\S]*?<\/details>/) || [""])[0];
const switched = (html) => [...railSwitch(html).matchAll(/<a href="([^"]+)" data-org="([^"]+)"/g)].map((m) => `${m[2]}=${m[1]}`).sort();
const current = (html) => (railSwitch(html).match(/data-org="([^"]+)" aria-current="true"/) || [])[1] || "";
const S = {};

smoke("picker · an account in two orgs signs in at the root -> the picker lists exactly its orgs; each link lands signed in at /<org>/home; a one-org account lands straight in", async () => {
  S.slug1 = orgSlug(1);
  const at = T(), n = rows("SELECT COALESCE(MAX(id), 1) + 1 AS n FROM org")[0].n;
  S.org = n; S.name = `Picker ${TAG}`; S.ownerKeyP = randomBytes(20).toString("hex");
  rows(`INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (${n}, ${q(S.name)}, ${q(at)}, ${q(at)}, 'local')`);
  rows(`INSERT INTO projects (key, name, active, created_at) VALUES ('o${n}--pick', 'Pick', 1, ${q(at)})`);
  rows(`INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('picker-owner-${n}', 'Picker Owner', ${q(`owner@picker${n}.local`)}, 'owner', ${q(sha(S.ownerKeyP))}, 1, ${q(at)}, ${n})`);
  S.slugP = orgSlug(n);
  expect(S.slug1 && S.slugP && S.slugP !== S.slug1, () => `the two orgs' path names: ${S.slug1}, ${S.slugP}`);
  // one account, a seat in each org (each admin's add-person), and the account's own passphrase (as the sign-up gives it)
  S.email = `picker-${TAG}@smoke.local`;
  S.k1 = await add(ownerKey, "Picker Two-Org", S.email);
  S.kP = await add(S.ownerKeyP, "Picker Two-Org", S.email);
  expect(S.k1 && S.kP, "add-person minted no secret in one of the orgs");
  S.pass = `picker-account-pass-${TAG}`;
  accountPass(S.email, S.pass);
  const acct = await webLogin(S.email, S.pass);
  expect(acct.status === 302 && acct.at === "/orgs" && acct.cookie, () => `the account's root sign-in lands ${acct.status} ${acct.at}`);
  S.acct = acct.cookie;
  const pick = await http("GET", "/orgs", { cookie: S.acct, ...NAV });
  const want = [`${S.slug1}=/${S.slug1}/home`, `${S.slugP}=/${S.slugP}/home`].sort();
  expect(pick.status === 200 && /data-region="org-picker"/.test(pick.raw) && picked(pick.raw).join(" ") === want.join(" ") && pick.raw.includes(`>${S.name}<`),
    () => `GET /orgs ${pick.status}: ${picked(pick.raw).join(" ")} (want ${want.join(" ")})`);
  // each link lands signed in, at that org (its base on the page, the person's rail)
  const landed = [];
  for (const href of picked(pick.raw).map((x) => x.split("=")[1])) {
    const r = await http("GET", href, { cookie: S.acct, ...NAV });
    const base = (r.raw.match(/<html\b[^>]*\sdata-org-base="([^"]+)"/) || [])[1];
    landed.push(`${href} ${r.status} ${base}`);
    expect(r.status === 200 && /data-region="avatar"/.test(r.raw) && base === href.replace(/\/home$/, ""), () => `the link ${href}: ${r.status} base ${base}`);
  }
  // its root page navigation goes to the picker, carrying the page
  const old = await http("GET", "/map?layer=screens", { cookie: S.acct, ...NAV, root: true });
  expect(old.status === 302 && old.locationRaw === "/orgs?to=" + encodeURIComponent("/map?layer=screens"), () => `the root /map with the account's cookie: ${old.status} ${old.locationRaw}`);
  // a one-org account: straight in, never a picker
  S.emailOne = `picker-one-${TAG}@smoke.local`;
  expect(await add(S.ownerKeyP, "Picker One-Org", S.emailOne), "add-person minted no secret");
  accountPass(S.emailOne, S.pass);
  const lone = await webLogin(S.emailOne, S.pass);
  S.lone = lone.cookie;
  const lp = lone.cookie ? await http("GET", "/orgs", { cookie: S.lone, ...NAV }) : {};
  expect(lone.status === 302 && lone.at === `/${S.slugP}` && lp.status === 302 && lp.locationRaw === `/${S.slugP}/home`,
    () => `a one-org account: lands ${lone.status} ${lone.at}; GET /orgs ${lp.status} ${lp.locationRaw}`);
  return `the account in two orgs lands on /orgs, which lists exactly ${want.join(" ")}; each link signed in (${landed.join("; ")}); its root /map -> /orgs?to=…; a one-org account lands on /${S.slugP}, GET /orgs -> /${S.slugP}/home`;
});

smoke("picker · a SEAT session never sees the picker or the switcher; the account session's switcher lists exactly its orgs, under either address", async () => {
  expect(S.acct && S.k1, "the first picker case did not run");
  const seat = await webLogin(S.email, S.k1);   // the org-1 seat's own secret (the key its admin minted): a SEAT session
  const kind = seat.cookie ? (rows(`SELECT account_id FROM tokens WHERE token_hash = ${q(sha(seat.cookie))}`)[0] || {}).account_id : "none";
  const sp = await http("GET", "/orgs", { cookie: seat.cookie, ...NAV });
  const sh = await http("GET", `/${S.slug1}/home`, { cookie: seat.cookie, ...NAV });
  expect(seat.status === 302 && seat.at === `/${S.slug1}` && !kind && sp.status === 302 && sp.locationRaw === `/${S.slug1}/home` && sh.status === 200 && !/data-region="org-switcher"/.test(sh.raw) && /data-region="org-name"/.test(sh.raw),
    () => `the seat session (${kind ? "account" : "seat"}): lands ${seat.status} ${seat.at}; GET /orgs ${sp.status} ${sp.locationRaw}; its rail ${sh.status} ${/data-region="org-switcher"/.test(sh.raw) ? "WITH a switcher" : "no switcher"}`);
  const want = [`${S.slug1}=/${S.slug1}/home`, `${S.slugP}=/${S.slugP}/home`].sort().join(" ");
  const h1 = await http("GET", `/${S.slug1}/home`, { cookie: S.acct, ...NAV }), hP = await http("GET", `/${S.slugP}/home`, { cookie: S.acct, ...NAV });
  expect(h1.status === 200 && hP.status === 200 && switched(h1.raw).join(" ") === want && switched(hP.raw).join(" ") === want && current(h1.raw) === S.slug1 && current(hP.raw) === S.slugP,
    () => `the account's switcher: under /${S.slug1} ${h1.status} [${switched(h1.raw).join(" ")}] current ${current(h1.raw)}; under /${S.slugP} ${hP.status} [${switched(hP.raw).join(" ")}] current ${current(hP.raw)}`);
  const lone = await http("GET", `/${S.slugP}/home`, { cookie: S.lone, ...NAV });
  expect(lone.status === 200 && !/data-region="org-switcher"/.test(lone.raw), () => `the one-org account's rail: ${lone.status} ${/data-region="org-switcher"/.test(lone.raw) ? "WITH a switcher" : ""}`);
  return `a seat session lands on /${S.slug1}, GET /orgs -> /${S.slug1}/home, its rail no switcher; the account's switcher lists exactly ${want} (the current marked under each); a one-org account's rail none`;
});

smoke("picker · the brand: the root's front door wears sharingu's own; the sign-in from an org's address wears that org's; the not-here answers are ONE page in the platform's brand", async () => {
  expect(S.slugP, "the first picker case did not run");
  const root = await http("GET", "/login", NAV), su = await http("GET", "/signup", NAV), on = await http("GET", "/orgs/new", NAV);
  const org1Name = (rows("SELECT name FROM org WHERE id = 1")[0] || {}).name;
  expect(root.raw.includes("<title>Sign in · sharingu</title>") && !root.raw.includes('class="wm-org"') && su.raw.includes("<title>Sign up · sharingu</title>") && !su.raw.includes('class="wm-org"')
    && on.status === 200 && !on.raw.includes('class="wm-org"') && !(org1Name && (root.raw.includes(org1Name) || su.raw.includes(org1Name))),
    () => `the root's front door: /login ${root.status}, /signup ${su.status}, /orgs/new ${on.status} — an org's name on it`);
  // the path a signed-out person takes: the org's address -> the sign-in, carrying it -> that org's brand
  const out = await http("GET", `/${S.slugP}/home`, NAV);
  const signIn = out.locationRaw ? await http("GET", out.locationRaw, NAV) : {};
  expect(out.status === 302 && out.locationRaw === `/login?next=${encodeURIComponent(`/${S.slugP}/home`)}` && signIn.status === 200
    && signIn.raw.includes(`<title>Sign in · ${S.name} · sharingu</title>`) && signIn.raw.includes(`<span class="wm-org">${S.name}</span>`),
    () => `the org's address signed out: ${out.status} ${out.locationRaw}; its sign-in ${signIn.status} ${(String(signIn.raw).match(/<title>[^<]*<\/title>/) || [""])[0]}`);
  // a sign-in from the org's address lands there (next names an org the account reaches)
  const back = await webLogin(S.email, S.pass, `/${S.slugP}/home`);
  expect(back.status === 302 && back.at === `/${S.slugP}/home`, () => `the sign-in from /${S.slugP}: lands ${back.status} ${back.at}`);
  // the not-here answers: one body, the platform's page, no org named
  const x = `/no-such-org-${TAG}`;
  const probes = {
    "the one-org account's session under org 1": await http("GET", `/${S.slug1}/home`, { cookie: S.lone, ...NAV }),
    "org 1's bearer under the picker org": await http("GET", `/${S.slugP}/whoami`, { key: ownerKey }),
    "the account's session under a name no org holds": await http("GET", `${x}/home`, { cookie: S.acct, ...NAV }),
    "the picker org's bearer under a name no org holds": await http("GET", `${x}/whoami`, { key: S.ownerKeyP }),
    "a platform door under an org": await http("GET", `/${S.slugP}/login`, NAV),
  };
  const bodies = new Set(Object.values(probes).map((r) => `${r.status}|${r.raw}`));
  const one = Object.values(probes)[0];
  expect(bodies.size === 1 && one.status === 404 && /data-region="not-found"/.test(one.raw) && one.raw.includes('href="/login"') && !one.raw.includes(S.name) && !(org1Name && one.raw.includes(org1Name)),
    () => `the not-here answers: ${bodies.size} bodies — ${Object.entries(probes).map(([k, r]) => `${k} ${r.status}`).join("; ")}`);
  return `/login, /signup, /orgs/new wear sharingu's own brand (no org named); /${S.slugP}/home signed out -> its sign-in, titled "Sign in · ${S.name} · sharingu"; a sign-in from there lands back; ${Object.keys(probes).length} not-here probes, ONE ${one.status} page in the platform's brand`;
});
