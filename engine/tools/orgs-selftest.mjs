// tools/orgs-selftest.mjs — sprint 7, slice 7.3 (docs/plan/PLATFORM.md §2 items 1, 2, 6, 8 and 9; migrate-072; src/orgs.js
// createOrg, src/orgpage.js, POST /orgs and GET /orgs/new): create an org, through the REAL worker (src/index.js over node:sqlite
// built from boot.sql, tools/fixtures/sqlite-worker.mjs) holding two orgs — org 1 (the org the address serves until slice 7.4)
// and org 2. Accounts are made as a person makes one: the operator's code (tools/operator.mjs allowEmail), then POST /signup.
// Each case builds a fresh world.
//   O1 · an account signed up by the operator's code creates an org (JSON): the org row (its name, its path name, its founder
//        account, its creator seat and its home project), the OWNER seat joined to that account (its email, its account id, the
//        key's hash), the first project o<id>--<slug>; the answer's key is that seat's own secret; nothing else changed
//   O2 · the pages: GET /orgs/new (the six fields, posting to /orgs, the platform's wordmark); a form creation answers the made
//        page with the key ONCE, folded behind "Show the owner key" under Connect your AI, no Location, no-store, and (sprint 21,
//        21.P D17) its session: the cookie POST /login sets, an ACCOUNT session on the new owner seat, which opens the org's Home
//        signed in; the JSON creation sets no cookie; a cross-site form is 403 before anything is read (no session)
//   O3 · refused before anything is read (no row, no attempt): a malformed email, passphrase, name, address (eight shapes),
//        first project or name; a RESERVED address (a route's first segment, the platform's own words) 409 org_name_reserved
//   O4 · the account proof, ONE answer (401 invalid_account, the same body): no account; an account with no passphrase yet (a
//        migrated person) with their seat's own secret; a wrong passphrase; a SEAT's secret of an account that has one (what
//        an org's admin minted never creates an org) — each writing only its attempt; 8 failures lock the account (the right
//        passphrase then 429)
//   O5 · the limit (one org per account: 409 org_limit) and the taken address (409 org_name_taken), each nothing written, and
//        both under a race (two creations at once: exactly one lands)
//   O6 · an existing id: the next id read is forced to org 2's once — the batch fails WHOLE (org 2 unchanged: no owner seat, no
//        project, its row as it was) and the creation lands at the next free id
//   O7 · the wall: the new owner's key reads its org alone (whoami, Control's people, org 1's project refused), files a
//        contribution through /mcp into its project; orgs 1 and 2 unchanged; Control's add-person in the NEW org joins an
//        existing account by its email (an org-1 member) and makes a new email's account with NO passphrase (7.2's code then
//        gives it one); set-password on the joined seat is refused (account_elsewhere)
//   O8 · the key is in no row (only its sha256) and in no answer but the creation's own
//   O9 · migrate-072's default path name for an org the operator's tools insert with none (org 1 and the suites' org plain,
//        any other <name>-<id>; a held one, a name of no letters, a cleared slug)
//   O10 · (sprint 7's review, D3) the plain base is never a name the platform uses: the reserved list written in the two slug
//        triggers by the newest migration that makes them (migrate-072, re-made by migrate-081) and boot.sql EQUALS the derivation
//        (src/orgnames.js reservedNames over CAPABILITIES, the path-name form) —
//        red the day a route is added until a migration re-creates them; a self-hosted org 1 named "Support" (and a suites' org
//        named "Docs") gets <base>-<id> and stays reachable at its address; the same database with the list taken out gives
//        "support", which the router never serves as an org (the inline mutation: red without the fix)
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red.
// Exit 1 on any failure. A gate step.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { allowEmail } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
const { pbkdf2 } = await import(pathToFileURL(join(ENGINE, "src", "util.js")).href);
const { NEXT_ORG_SQL } = await import(pathToFileURL(join(ENGINE, "src", "orgs.js")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const SALT = "00112233445566778899aabbccddeeff";

let MUT = {};
const SEEN = [];   // every response body of the clean run (O8 reads it)
async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [
    ["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"],
    ["one-mia", "Mia One", "member", "one-mia-key", ["alpha"], "mia@one.test"]],
    orgs: [{ id: 2, name: "Two", projects: ["shop"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", [], "owner@two.test"]] }] });
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  const DB = d1(w.db);
  const call = async (method, path, { key, body, form, headers: extra = {} } = {}) => {
    const headers = { accept: form ? "text/html" : "application/json", ...extra };
    if (key) headers.authorization = "Bearer " + key;
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = null; }
    SEEN.push(text);
    return { status: r.status, text, json, location: r.headers.get("location"), cookie: r.headers.get("set-cookie"), cache: r.headers.get("cache-control") };
  };
  // an account as a person gets one: the operator's code, then POST /signup with a passphrase
  const account = async (email, password) => {
    const a = await allowEmail(DB, email);
    const r = await call("POST", "/signup", { body: { email, code: a.code, password } });
    if (r.status !== 200) throw new Error(`sign-up of ${email}: ${r.status} ${r.text.slice(0, 200)}`);
    return one("SELECT id, email FROM accounts WHERE email = ?", email);
  };
  const create = (fields) => call("POST", "/orgs", { body: fields });
  const mcp = async (key, name, args = {}) => {
    const r = await call("POST", "/mcp", { key, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    let out = null; try { out = JSON.parse(r.json.result.content[0].text); } catch { out = r.json; }
    return { out, isError: !!(r.json && r.json.result && r.json.result.isError) };
  };
  const attempts = (ok = 0) => one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = ?", ok).n;
  // every row of the tables a creation writes (and the accounts): what a refusal must not move
  const snap = () => JSON.stringify([q("SELECT * FROM org ORDER BY id"), q("SELECT * FROM people ORDER BY id"), q("SELECT * FROM projects ORDER BY key"), q("SELECT * FROM accounts ORDER BY id"),
    q("SELECT * FROM tokens ORDER BY token_hash"), q("SELECT * FROM project_seats ORDER BY person_id, project_key")]);
  // org `n`'s own rows (orgs 1 and 2: the wall's instrument)
  const orgRows = (n) => JSON.stringify([q("SELECT * FROM org WHERE id = ?", n), q("SELECT * FROM people WHERE org = ? ORDER BY id", n), q("SELECT * FROM projects WHERE org = ? ORDER BY key", n),
    q("SELECT * FROM transmission WHERE org = ? ORDER BY id", n), q("SELECT * FROM tokens WHERE org = ? ORDER BY token_hash", n)]);
  return { w, q, one, DB, call, account, create, mcp, attempts, snap, orgRows };
}
const PASS = "a-long-account-passphrase";
const base = (o = {}) => ({ email: "ada@fresh.test", password: PASS, name: "Ada Works", slug: "ada-works", ...o });

const CASES = {
  async O1() {
    const W = await world(), out = [];
    const acc = await W.account("ada@fresh.test", PASS);
    const one0 = W.orgRows(1), two0 = W.orgRows(2);
    const r = await W.create(base({ project: "web", projectName: "The web app", you: "Ada" }));
    const n = r.json && r.json.org && r.json.org.id;
    const org = W.one("SELECT * FROM org WHERE id = ?", n) || {};
    const seats = W.q("SELECT * FROM people WHERE org = ?", n);
    const proj = W.q("SELECT key, name, org, slug, active, eval FROM projects WHERE org = ?", n);
    out.push([r.status === 200 && n === 3 && r.json.org.slug === "ada-works" && r.json.project.key === "o3--web" && /^[0-9a-f]{40}$/.test(r.json.key || "") && r.json.mcp === `${W.w.origin}/mcp` && !r.cookie,
      `O1 · the creation: ${r.status}, org ${n} ${r.json && r.json.org && r.json.org.slug}, project ${r.json && r.json.project && r.json.project.key}, a 40-hex key, the MCP address, no cookie (${!!r.cookie})`]);
    out.push([org.name === "Ada Works" && org.slug === "ada-works" && org.created_by_account === acc.id && seats.length === 1 && org.created_by === seats[0].id && org.home === "o3--web",
      `O1 · the org row: its name, its path name, founded by the account, created by its owner seat, home o3--web (${JSON.stringify({ slug: org.slug, by: org.created_by === (seats[0] || {}).id, home: org.home })})`]);
    const s = seats[0] || {};
    out.push([s.role === "owner" && s.active === 1 && s.email === "ada@fresh.test" && s.account_id === acc.id && s.name === "Ada" && s.key_hash === sha(r.json.key) && s.pass_hash === await pbkdf2(r.json.key, s.pass_salt),
      `O1 · the owner seat: role ${s.role}, the account's (${s.account_id === acc.id}), the key's hash and its seat secret (S-019)`]);
    out.push([proj.length === 1 && proj[0].key === "o3--web" && proj[0].org === 3 && proj[0].slug === "web" && proj[0].name === "The web app" && proj[0].active === 1 && proj[0].eval === 0,
      `O1 · the first project: ${JSON.stringify(proj)}`]);
    const acct = W.one("SELECT pass_hash FROM accounts WHERE id = ?", acc.id);
    out.push([W.orgRows(1) === one0 && W.orgRows(2) === two0 && acct.pass_hash && acct.pass_hash !== s.pass_hash, `O1 · orgs 1 and 2 unchanged; the account keeps its own passphrase (the seat's secret is the key)`]);
    const d = await W.create(base({ email: "bea@fresh.test", slug: "bea-co" }));
    out.push([d.status === 401, `O1 · (the defaults need an account) ${d.status}`]);
    await W.account("bea@fresh.test", PASS);
    const e = await W.create(base({ email: "bea@fresh.test", name: "Bea Co", slug: "bea-co" }));
    const bs = W.one("SELECT name FROM people WHERE org = ?", e.json && e.json.org && e.json.org.id) || {};
    out.push([e.status === 200 && e.json.project.key === `o${e.json.org.id}--bea-co` && e.json.project.name === "Bea Co" && bs.name === "bea",
      `O1 · the defaults: the first project is the address (${e.json && e.json.project && e.json.project.key}), named as the org; the seat named by the email's first part (${bs.name})`]);
    return out;
  },
  async O2() {
    const W = await world(), out = [];
    const p = await W.call("GET", "/orgs/new", { headers: { accept: "text/html" } });
    out.push([p.status === 200 && /action="\/orgs"/.test(p.text) && ["email", "password", "name", "slug", "project", "you"].every((f) => new RegExp(`name="${f}"`).test(p.text)) && /org\.test\//.test(p.text) && p.cache === "no-store" && !/class="wm-org"/.test(p.text),
      `O2 · GET /orgs/new: ${p.status}, the six fields posting to /orgs, the address's host before the path name, the platform's wordmark (no org's)`]);
    const acc = await W.account("ada@fresh.test", PASS);
    const f = await W.call("POST", "/orgs", { form: { ...base(), web: "1" } });
    const key = (/data-secret="owner-key">([0-9a-f]{40})</.exec(f.text) || [])[1];
    const n = (W.one("SELECT id FROM org WHERE slug = 'ada-works'") || {}).id;
    const fold = (/<details class="key-fold"[^>]*>[\s\S]*?<\/details>/.exec(f.text) || [""])[0];
    out.push([f.status === 200 && !!key && W.one("SELECT key_hash FROM people WHERE org = ?", n).key_hash === sha(key) && !f.location && f.cache === "no-store" && /class="wm-org">Ada Works</.test(f.text)
      && /data-region="first-project">[\s\S]*?Ada Works \(ada-works\)</.test(f.text) && !/o3--/.test(f.text) && f.text.includes(`<code>${W.w.origin}/mcp</code>`)
      && /<summary>Show the owner key<\/summary>/.test(fold) && fold.includes(key) && f.text.indexOf("Connect your AI") < f.text.indexOf(`<details class="key-fold"`) && !/bearer/i.test(f.text) && /<a class="primary" data-region="open-org" href="\/ada-works">Open your org</.test(f.text),
      `O2 · a form creation: ${f.status}, the made page leading with Connect your AI (the MCP address), the owner key once (its hash the seat's) folded behind Show the owner key, no "bearer", Open your org; no Location, no-store; the org's name in the wordmark, its project by name and slug (never o3--)`]);
    // D17: signed in at once — POST /login's own cookie, an ACCOUNT session (the account the passphrase proved) on the NEW owner seat
    const tok = (/^__Host-ar_session=([^;]+); HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7776000$/.exec(f.cookie || "") || [])[1];
    const row = tok ? W.one("SELECT person_id, account_id, org, revoked FROM tokens WHERE token_hash = ?", sha(tok)) || {} : {};
    const owner = W.one("SELECT id FROM people WHERE org = ? AND role = 'owner'", n) || {};
    const home = tok ? await W.call("GET", "/ada-works/home", { headers: { accept: "text/html", cookie: `__Host-ar_session=${tok}`, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } }) : { status: 0, text: "" };
    out.push([!!tok && row.person_id === owner.id && row.account_id === acc.id && row.org === n && row.revoked === 0 && home.status === 200 && /data-screen="home"/.test(home.text) && /data-region="connect-first"/.test(home.text),
      `O2 · the form's creator is signed in: the session cookie with POST /login's attributes (${f.cookie ? f.cookie.replace(/=[^;]+/, "=<token>") : "none"}), an account session on the new owner seat (${row.person_id === owner.id}, account ${row.account_id === acc.id}, org ${row.org}); /ada-works/home ${home.status}, signed in, the Connect card first`]);
    // an account with a seat elsewhere (Mia, a member of org 1, her account's own passphrase): ONE session, on the seat the creation made
    await W.w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = 'mia@one.test'").run(await pbkdf2("mia-account-pass", SALT), SALT);
    const mf = await W.call("POST", "/orgs", { form: { email: "mia@one.test", password: "mia-account-pass", name: "Mia Co", slug: "mia-co", web: "1" } });
    const mt = (/^__Host-ar_session=([^;]+);/.exec(mf.cookie || "") || [])[1];
    const mrow = mt ? W.one("SELECT person_id, account_id, org FROM tokens WHERE token_hash = ?", sha(mt)) || {} : {};
    const mseat = W.one("SELECT p.id, p.account_id, p.org FROM people p JOIN org o ON o.id = p.org WHERE o.slug = 'mia-co'") || {};
    out.push([mf.status === 200 && !!mt && mrow.person_id === mseat.id && mrow.account_id === mseat.account_id && mrow.org === mseat.org && W.one("SELECT COUNT(*) AS n FROM tokens WHERE account_id = ?", mseat.account_id).n === 1,
      `O2 · an account with a seat in another org: one session, on the new org's owner seat (${mrow.person_id === mseat.id}, org ${mrow.org}), never its org-1 seat`]);
    const s0 = W.snap(), a0 = W.attempts(0) + W.attempts(1);
    const x = await W.call("POST", "/orgs", { form: { ...base({ email: "ada@fresh.test", slug: "cross-site" }), web: "1" }, headers: { "sec-fetch-site": "cross-site", origin: "https://evil.test" } });
    const xj = await W.call("POST", "/orgs", { body: base({ slug: "cross-site" }), headers: { "sec-fetch-site": "cross-site", origin: "https://evil.test" } });
    out.push([x.status === 403 && xj.status === 403 && xj.json.error === "cross_site_org" && !x.cookie && !xj.cookie && W.snap() === s0 && W.attempts(0) + W.attempts(1) === a0,
      `O2 · a cross-site form and JSON: ${x.status} / ${xj.status} ${xj.json && xj.json.error}, nothing written, not even an attempt`]);
    const bad = await W.call("POST", "/orgs", { form: { ...base({ slug: "login" }), web: "1" } });
    out.push([bad.status === 409 && /belongs to the platform/.test(bad.text) && /value="ada@fresh\.test"/.test(bad.text) && !bad.text.includes(PASS), `O2 · a refused form re-renders with what was typed but the passphrase (${bad.status})`]);
    return out;
  },
  async O3() {
    const W = await world(), out = [];
    await W.account("ada@fresh.test", PASS);
    const s0 = W.snap(), a0 = W.attempts(0) + W.attempts(1);
    const fields = [["email", { email: "not-an-email" }], ["password", { password: "" }], ["name", { name: "" }], ["name", { name: "x".repeat(81) }],
      ...["A", "a", "a--b", "-ab", "ab-", "x y", "ab_c", "y".repeat(41)].map((slug) => ["slug", { slug }]),
      ["project", { project: "a--b" }], ["project", { project: "p".repeat(31) }], ["project", { slug: "a".repeat(31) }], ["you", { you: "y".repeat(81) }]];
    const seen = [];
    for (const [field, o] of fields) { const r = await W.create(base(o)); seen.push(r.status === 422 && r.json.error === "bad_org" && r.json.field === field ? null : `${JSON.stringify(o).slice(0, 40)} -> ${r.status} ${r.json && r.json.error}/${r.json && r.json.field}`); }
    out.push([seen.every((x) => x === null), `O3 · ${fields.length} malformed fields, each 422 bad_org naming its field${seen.filter(Boolean).length ? `: ${seen.filter(Boolean).join("; ")}` : ""}`]);
    const reserved = ["login", "mcp", "docs", "orgs", "signup", "oauth", "goals", "control", "contribution", "map", "api", "admin", "health", "install", "fonts", "render", "new"];
    const rs = [];
    for (const slug of reserved) { const r = await W.create(base({ slug, name: "Taken name" })); if (!(r.status === 409 && r.json.error === "org_name_reserved")) rs.push(`${slug} ${r.status}`); }
    out.push([rs.length === 0, `O3 · ${reserved.length} reserved addresses (a route's first segment, the platform's words) each 409 org_name_reserved${rs.length ? `: ${rs.join(", ")}` : ""}`]);
    out.push([W.snap() === s0 && W.attempts(0) + W.attempts(1) === a0, `O3 · nothing written, not even an attempt (checked before anything is read)`]);
    return out;
  },
  async O4() {
    const W = await world(), out = [];
    // mia (org 1) has an account with NO passphrase and her seat's own secret; the owner of org 1 holds an account passphrase
    await W.w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'one-mia'").run(await pbkdf2("mia-seat-secret", SALT), SALT);
    await W.w.db.prepare("UPDATE people SET pass_hash = ?, pass_salt = ? WHERE id = 'one-owner'").run(await pbkdf2("owner-seat-secret", SALT), SALT);
    await W.w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = 'owner@one.test'").run(await pbkdf2("owner-account-pass", SALT), SALT);
    const s0 = W.snap(), f0 = W.attempts(0);
    const tries = [["no account", base({ email: "nobody@fresh.test" })], ["an account with no passphrase, its seat's secret", base({ email: "mia@one.test", password: "mia-seat-secret" })],
      ["... its seat's key", base({ email: "mia@one.test", password: "one-mia-key" })], ["a wrong passphrase", base({ email: "owner@one.test", password: "not-the-passphrase" })],
      ["a seat's secret of an account that has a passphrase", base({ email: "owner@one.test", password: "owner-seat-secret" })], ["... its seat's key", base({ email: "owner@one.test", password: "one-owner-key" })]];
    const bodies = new Set(), seen = [];
    for (const [what, f] of tries) { const r = await W.create(f); bodies.add(`${r.status} ${r.text}`); seen.push(`${what}: ${r.status}`); }
    out.push([bodies.size === 1 && [...bodies][0].startsWith("401 ") && /invalid_account/.test([...bodies][0]) && W.snap() === s0 && W.attempts(0) === f0 + tries.length,
      `O4 · ${tries.length} proofs refused with ONE answer (${[...bodies].map((b) => b.slice(0, 40)).join(" | ")}); rows unchanged; ${W.attempts(0) - f0} attempts counted (${seen.join("; ")})`]);
    const ok = await W.create(base({ email: "owner@one.test", password: "owner-account-pass", slug: "one-owner-org" }));
    out.push([ok.status === 200, `O4 · the instrument: the same account with its own passphrase creates (${ok.status})`]);
    await W.account("lock@fresh.test", PASS);
    for (let i = 0; i < 8; i++) await W.create(base({ email: "lock@fresh.test", password: `wrong-${i}`, slug: "locked-org" }));
    const s1 = W.snap();
    const locked = await W.create(base({ email: "lock@fresh.test", slug: "locked-org" }));
    out.push([locked.status === 429 && locked.json.error === "too_many_attempts" && W.snap() === s1, `O4 · 8 failures lock the account: the right passphrase then ${locked.status} ${locked.json && locked.json.error}, nothing written`]);
    return out;
  },
  async O5() {
    const W = await world(), out = [];
    await W.account("ada@fresh.test", PASS); await W.account("bea@fresh.test", PASS); await W.account("cy@fresh.test", PASS); await W.account("dee@fresh.test", PASS);
    const first = await W.create(base());
    const s0 = W.snap();
    const again = await W.create(base({ slug: "ada-two", name: "Ada Two" }));
    const taken = await W.create(base({ email: "bea@fresh.test", name: "Bea", slug: "ada-works" }));
    out.push([first.status === 200 && again.status === 409 && again.json.error === "org_limit" && taken.status === 409 && taken.json.error === "org_name_taken" && W.snap() === s0,
      `O5 · a second org by one account ${again.status} ${again.json && again.json.error}; another account's taken address ${taken.status} ${taken.json && taken.json.error}; nothing written`]);
    const race = await Promise.all([W.create(base({ email: "bea@fresh.test", slug: "bea-one", name: "Bea One" })), W.create(base({ email: "bea@fresh.test", slug: "bea-two", name: "Bea Two" }))]);
    const beaOrgs = W.q("SELECT o.id FROM org o JOIN accounts a ON a.id = o.created_by_account WHERE a.email = 'bea@fresh.test'").length;
    out.push([race.filter((r) => r.status === 200).length === 1 && race.some((r) => r.json && r.json.error === "org_limit") && beaOrgs === 1,
      `O5 · two creations by one account at once: ${race.map((r) => `${r.status} ${(r.json && (r.json.error || r.json.org.slug))}`).join(" / ")}; the account founded ${beaOrgs}`]);
    const race2 = await Promise.all([W.create(base({ email: "cy@fresh.test", slug: "same-name", name: "Cy" })), W.create(base({ email: "dee@fresh.test", slug: "same-name", name: "Dee" }))]);
    out.push([race2.filter((r) => r.status === 200).length === 1 && race2.some((r) => r.json && r.json.error === "org_name_taken") && W.q("SELECT id FROM org WHERE slug = 'same-name'").length === 1
      && W.q("SELECT o.id FROM org o LEFT JOIN people p ON p.org = o.id WHERE p.id IS NULL").length === 0,
      `O5 · two accounts after one address at once: ${race2.map((r) => `${r.status} ${(r.json && (r.json.error || r.json.org.slug))}`).join(" / ")}; one org holds it; no org without its owner`]);
    return out;
  },
  async O6() {
    const W = await world(), out = [];
    await W.account("ada@fresh.test", PASS);
    const two0 = W.orgRows(2), one0 = W.orgRows(1);
    // the next id read answers org 2's (a restore or another creation landed in between): once
    const raw = W.w.env.DB, prep = raw.prepare;
    let forced = 0;
    raw.prepare = (sql) => (sql === NEXT_ORG_SQL && !forced++ ? prep("SELECT 2 AS n") : prep(sql));
    const r = await W.create(base());
    raw.prepare = prep;
    const n = r.json && r.json.org && r.json.org.id;
    out.push([forced >= 1 && r.status === 200 && n === 3 && W.orgRows(2) === two0 && W.orgRows(1) === one0 && W.q("SELECT id FROM people WHERE org = 3").length === 1,
      `O6 · the next id forced to org 2's: the batch failed whole (org 2 unchanged: ${W.orgRows(2) === two0}), the creation landed at org ${n} (${r.status})`]);
    return out;
  },
  async O7() {
    const W = await world(), out = [];
    await W.account("ada@fresh.test", PASS);
    const one0 = W.orgRows(1), two0 = W.orgRows(2);
    const r = await W.create(base({ project: "web" }));
    const key = r.json.key;
    const me = (await W.call("GET", "/whoami", { key })).json || {};
    const ppl = (await W.call("GET", "/control/people", { key })).json || {};
    const alpha = await W.mcp(key, "read", { project: "alpha", kind: "goal" });
    out.push([me.role === "owner" && W.one("SELECT org FROM people WHERE id = ?", me.id).org === 3 && (ppl.people || []).length === 1 && alpha.isError && /project_forbidden/.test(JSON.stringify(alpha.out)),
      `O7 · the new owner reads its org alone: whoami ${me.role} of org 3; Control lists ${(ppl.people || []).length} person; org 1's project refused (${JSON.stringify(alpha.out).slice(0, 60)})`]);
    const items = [{ contribution: { lane: "leader", kind: "note", what: "The first note of Ada Works", why: "the new org files through the door" } }];
    const pv = await W.mcp(key, "preview", { items });
    const fl = pv.out && pv.out.previewId ? await W.mcp(key, "file_contribution", { previewId: pv.out.previewId, items }) : { out: null };
    const tx = W.q("SELECT id, project, org FROM transmission WHERE org = 3");
    out.push([tx.length === 1 && tx[0].project === "o3--web" && tx[0].org === 3, `O7 · the owner's key files a contribution through /mcp into o3--web (${JSON.stringify(tx)})`]);
    const add = async (name, email) => { const a = await W.call("POST", "/control", { key, form: { action: "add-person", name, email } }); return (/API key\): ([0-9a-f]{40})/.exec(a.text) || [])[1]; };
    const miaAcc = W.one("SELECT account_id FROM people WHERE id = 'one-mia'").account_id;
    const k1 = await add("Mia in Ada", "mia@one.test"), k2 = await add("Newt", "newt@fresh.test");
    const mia3 = W.one("SELECT id, account_id, org FROM people WHERE email = 'mia@one.test' AND org = 3") || {};
    const newt = W.one("SELECT p.org, a.pass_hash FROM people p JOIN accounts a ON a.id = p.account_id WHERE p.email = 'newt@fresh.test'") || {};
    out.push([!!k1 && !!k2 && mia3.account_id === miaAcc && mia3.org === 3 && newt.org === 3 && newt.pass_hash === null,
      `O7 · Control's add-person in the new org: an org-1 member's email joins her account (${mia3.account_id === miaAcc}); a new email's account is made with no passphrase (${newt.pass_hash === null})`]);
    const sp = await W.call("POST", "/control", { key, form: { action: "set-password", personId: mia3.id, password: "ada-sets-mia" } });
    const nc = await allowEmail(W.DB, "newt@fresh.test");
    const su = await W.call("POST", "/signup", { body: { email: "newt@fresh.test", code: nc.code, password: "newts-own-passphrase" } });
    out.push([/account_elsewhere/.test(sp.text) && su.status === 200 && su.json.account === "set", `O7 · set-password on the joined seat refused (account_elsewhere); the new person's code sign-up gives their account its passphrase (${su.json && su.json.account})`]);
    out.push([W.orgRows(1) === one0 && W.orgRows(2) === two0, `O7 · orgs 1 and 2 unchanged by the creation and everything the new owner did`]);
    return out;
  },
  async O9() {
    const W = await world(), out = [];
    const ins = (id, name, settings = null) => W.w.db.prepare("INSERT INTO org (id, name, settings, created_at, updated_at) VALUES (?, ?, ?, 't', 't')").run(id, name, settings);
    ins(5, "Suites", '{"suites":true}'); ins(6, "Ryuklabs"); ins(7, "  Ünïcode!! "); ins(8, "Lots --- of___dashes...."); ins(9, "Login");
    const got = Object.fromEntries(W.q("SELECT id, slug FROM org ORDER BY id").map((r) => [r.id, r.slug]));
    const want = { 1: "one", 2: "two-2", 5: "suites", 6: "ryuklabs-6", 7: "org-7", 8: "lots-of-dashes-8", 9: "login-9" };
    out.push([Object.entries(want).every(([k, v]) => got[k] === v), `O9 · the default path names: ${JSON.stringify(got)}`]);
    W.w.db.prepare("UPDATE org SET slug = NULL WHERE id = 8").run();
    let refused = false; try { W.w.db.prepare("UPDATE org SET slug = 'a--b' WHERE id = 8").run(); } catch { refused = true; }
    out.push([W.one("SELECT slug FROM org WHERE id = 8").slug === "lots-of-dashes-8" && refused, `O9 · a cleared slug is derived again; a malformed one is refused by the CHECK`]);
    return out;
  },
  async O10() {
    const out = [];
    const { reservedNames } = await import(pathToFileURL(join(ENGINE, "src", "orgnames.js")).href);
    const { capabilitiesOf } = await import(pathToFileURL(join(ENGINE, "tools", "check-org-names.mjs")).href);
    const FORM = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/;
    const want = [...reservedNames(capabilitiesOf(join(ENGINE, "src")))].filter((n) => n.length >= 2 && FORM.test(n)).sort();
    const listsOf = (sql) => [...sql.matchAll(/AND s\.b NOT IN \(([^)]*)\) THEN s\.b/g)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).sort());
    // the newest migration that writes the two slug triggers (migrate-072 made them; a migration adding a route's first segment
    // re-creates them with the new list: migrate-081, sprint 21's /request-access) and boot.sql
    const latest = readdirSync(ENGINE).filter((f) => /^migrate-\d{3}\.sql$/.test(f)).sort()
      .filter((f) => readFileSync(join(ENGINE, f), "utf8").includes("CREATE TRIGGER IF NOT EXISTS org_slug_on_insert")).pop();
    const mig = readFileSync(join(ENGINE, latest), "utf8"), boot = readFileSync(join(ENGINE, "boot.sql"), "utf8");
    const lists = [...listsOf(mig), ...listsOf(boot)];
    out.push([lists.length === 4 && lists.every((l) => JSON.stringify(l) === JSON.stringify(want)),
      `O10 · the reserved list in ${latest}'s and boot.sql's two slug triggers (${lists.length} lists, ${lists.map((l) => l.length).join("/")} names) equals the derivation (${want.length} names of the path-name form)`]);
    // a self-hosted org 1 named "Support", a suites' org named "Docs": <base>-<id>, reachable at their address
    const { DatabaseSync } = await import("node:sqlite");
    const slugOf = (bootSql) => { const d = new DatabaseSync(":memory:"); d.exec(bootSql);
      d.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (1, 'Support', 't', 't')").run();
      d.prepare("INSERT INTO org (id, name, settings, created_at, updated_at) VALUES (2, 'Docs', '{\"suites\":true}', 't', 't')").run();
      return d.prepare("SELECT id, slug FROM org ORDER BY id").all().map((r) => r.slug).join(","); };
    const got = slugOf(boot), unfixed = slugOf(boot.replace(/\n {8}AND s\.b NOT IN \([^)]*\) THEN s\.b/g, " THEN s.b"));
    const w = await sqliteWorker({ org: "Support", projects: ["alpha"], src: MUT.src, people: [["s-owner", "Owner", "owner", "support-owner-key", [], "owner@support.test"]] });
    const slug = w.db.prepare("SELECT slug FROM org WHERE id = 1").get().slug;
    const r = await w.fetch(new Request(`${w.origin}/${slug}/whoami`, { headers: { accept: "application/json", authorization: "Bearer support-owner-key" } }));
    const me = await r.json().catch(() => ({}));
    out.push([got === "support-1,docs-2" && unfixed === "support,docs" && slug === "support-1" && r.status === 200 && me.id === "s-owner",
      `O10 · a self-hosted org 1 named "Support" and a suites' org named "Docs" get ${got} (without the list: ${unfixed}, names the router never serves as an org); /${slug}/whoami answers ${r.status} (${me.id})`]);
    return out;
  },
};

// ---- the mutants: each must turn its case(s) red ----
const MUTANTS = [
  { name: "any passphrase creates for an existing account (a seat's secret, an admin's key)", file: "src/orgs.js",
    from: "if (proof.verdict !== \"ok\" || !proof.account) return", to: "if (!proof.account) return", red: ["O4"] },
  { name: "the org row founded by no account (the one-org limit gone)", file: "src/orgs.js",
    from: "VALUES ({org}, ?1, ?2, ?3, ?4, ?4)", to: "VALUES ({org}, ?1, ?2, NULL, ?4, ?4)", red: ["O5"] },
  { name: "a reserved address accepted", file: "src/orgs.js",
    from: "  if (sp === \"reserved\") return { error: \"org_name_reserved\", field: \"slug\", status: 409 };\n", to: "", red: ["O3"] },
  { name: "an existing org's id taken over (the org insert ignored, the seat lands in that org)", file: "src/orgs.js",
    from: "\"INSERT INTO org (id, name, slug", to: "\"INSERT OR IGNORE INTO org (id, name, slug", red: ["O6"] },
  { name: "a refused proof counts no attempt", file: "src/accounts.js",
    from: "  await countSignIn(env, { ...out, vouched: ok }, ok);   // only the account's own passphrase gets here as ok: it vouches\n  return { ...out, verdict: !ok ? \"wrong\" : account.invited_org != null ? \"invited\" : \"ok\" };", to: "  return { ...out, verdict: !ok ? \"wrong\" : account.invited_org != null ? \"invited\" : \"ok\" };", red: ["O4"] },
  { name: "the proof skips the lockout", file: "src/accounts.js",
    from: "  if (await lockOf(env, account ? account.id : null, e, out.client)) return { ...out, verdict: \"locked\" };\n  const comparable", to: "  const comparable", red: ["O4"] },
  { name: "the creation without the same-origin guard", file: "src/index.js",
    from: "if (crossSiteLogin(request, url)) return isForm ? page(403, \"Cross-site request refused.\") : json({ error: \"cross_site_org\" }, 403);", to: "", red: ["O2"] },
  // sprint 21, 21.P D17: the session is the form's alone, on the seat this creation made
  { name: "the made page signs no one in", file: "src/index.js",
    from: "...(opened ? { \"set-cookie\": sessionSetCookie(opened.token) } : {})", to: "", red: ["O2"] },
  { name: "the form's session minted on hashes the new seat does not hold (the conditional mint must then mint nothing)", file: "src/orgs.js",
    from: "seat: { id: personId, org: n, key_hash: kh, pass_hash: ph } }", to: "seat: { id: personId, org: n, key_hash: \"x\", pass_hash: ph } }", red: ["O2"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
{
  // O8: one creation, then every text of the world and every response of the run: the key is in no row and in no answer but its own
  const W = await world();
  await W.account("ada@fresh.test", PASS);
  const at = SEEN.length;
  const r = await W.create(base());
  const key = r.json && r.json.key;
  const tables = W.q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'k_find%'").map((t) => t.name);
  let hits = 0;
  for (const t of tables) for (const row of W.q(`SELECT * FROM "${t}"`)) if (JSON.stringify(row).includes(key)) hits++;
  const inAnswers = SEEN.filter((t, i) => i !== at && t.includes(key)).length;
  ok(r.status === 200 && !!key && hits === 0 && inAnswers === 0 && W.one("SELECT COUNT(*) AS n FROM people WHERE key_hash = ?", sha(key)).n === 1,
    `O8 · the key is in no row (${tables.length} tables read: ${hits} hits; its sha256 is the seat's key_hash) and in none of the run's other ${SEEN.length - 1} answers (${inAnswers})`);
}

for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".orgs-mutation-"));
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, m.file), s = readFileSync(p, "utf8");
    if (s.split(m.from).length !== 2) { ok(false, `mutant "${m.name}": its needle is not found exactly once in ${m.file} (update this selftest with the code)`); continue; }
    writeFileSync(p, s.replace(m.from, m.to));
    MUT = { src: join(dir, "src") };
    const reds = [];
    // red by an assertion of the case, never by a crash (a mutant that only breaks the world proves nothing)
    for (const name of m.red) { const res = await runCase(name); reds.push(res.some(([c, l]) => !c && !/ threw: /.test(l)) && !res.some(([, l]) => / threw: /.test(l))); }
    ok(reds.every(Boolean), `mutant "${m.name}" turns ${m.red.join(" and ")} red (${reds.map((r, i) => `${m.red[i]} ${r ? "red" : "GREEN"}`).join(", ")})`);
  } finally { MUT = {}; if (dir) rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${failed ? "✗" : "✓"} orgs selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
