// tools/data-selftest.mjs — sprint 21, slice 21.4b, THE DATA (the owner's approved data collection of 2026-10-14; migrate-081's
// access_requests data columns and org_profile; src/requestaccess.js readConsent, sourceOf, clearStale; src/orgprofile.js the product
// step; src/orgs.js createOrg's batch; src/operatorread.js and src/operatorpage.js the operator page; src/cron.js), through the REAL
// worker (src/index.js over node:sqlite built from boot.sql, tools/fixtures/sqlite-worker.mjs; its emails into the local capture).
//   D1 · readConsent: the two required boxes each a field when unticked (the terms first), a form's "1"/"on" and JSON's true/1 tick
//        a box, the optional two 0 unless ticked; CONSENT_VERSION a day; the four boxes the owner's words
//   D2 · sourceOf: site, showcase and direct are kept (any case, trimmed), anything else — none, a stranger's word, a list, a
//        URL — is direct; GET /request-access?from=site carries it as the form's hidden field, an unknown tag as direct
//   D3 · the join at the door: a required box left empty is 422, the error ON the box (aria-invalid, its words under it, the focus),
//        the other answers kept (never the passphrase), NOTHING filed and nothing sent; JSON 422 bad_request_access {field}; with
//        both boxes and ?from=site: the row holds the four answers, the words' version and the time (the request's own), source site
//   D4 · the verification names the account (account_id: the account it made, account_at: the verification's time); the team's
//        alert names the source, never the person's name or email
//   D5 · readProductStep: the product, its line and its stage required (each named, in the form's order); a text past its length,
//        a choice off its list, a single choice given twice, an object, are the field's error; a multi choice comes back in the
//        list's order; not required and nothing answered -> no profile; not required and anything answered -> read strictly
//   D6 · the org form: the product step drawn under the org's fields (its legend, the one line about the data, every choice a real
//        checkbox or radio inside its chip, the optional ones said so); a web POST without the product -> 422 marked on the field,
//        NO org, every answer kept as sent; complete -> 200, the org, its org_profile row (the JSON arrays, the singles) and the
//        request naming the org (org_id, org_at) — in ONE batch (a profile the table refuses lands no org either); a script's JSON
//        with no step: the org, no profile; with part of it: 422 bad_org naming the first missing field
//   D7 · the operator page's door: org 1's admin 200 (the screen, the funnel's five tiles, the line); org 1's member, another org's
//        admin (at its own address, at org 1's, at the root) each the ONE not-here 404, the same bytes; no session: a browser to
//        the sign-in, a script 401
//   D8 · its decisions: Approve (same-origin, a cookie) -> approved, ONE "You're in" captured and counted; Decline -> declined with
//        declined_at; a request not in line -> refused, nothing changed; a cross-site POST -> 403, nothing changed; the cap: with
//        the 50 places taken Approve is refused, nothing changed, nothing sent
//   D9 · the funnel's numbers and shape: ONE aggregate statement over the newest FUNNEL_ROWS (a SCAN in rowid order: no sort, no
//        temp tree; the sign-in probe on idx_account_sessions_account), capped past them; one page of people a SEARCH on
//        idx_access_requests_people with the org and its profile each by its primary key; the keyset's next page
//   D10 · THE CLEARING: exactly the declined requests 90+ days after their decline and the approved ones with no org 90+ days after
//        their approval are cleared; CLEAR_FIELDS emptied, every other field as it was; a cleared one is not taken again; CLEAR_BATCH
//        a run (the rest the next run); each statement a SEARCH of its partial index; the cron runs it once a run; a cleared approval
//        holds no beta place and approves no org
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) turns its case(s) red, by an assertion, never a crash.
// Exit 1 on any failure. A gate step (every tools/*-selftest.mjs).
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash, pbkdf2Sync } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const pbkdf2 = (pw, salt) => pbkdf2Sync(pw, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
const SALT = "00112233445566778899aabbccddeeff";

let MUT = {};
const mod = (f) => import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), f)).href);

const PASS = "a-long-passphrase-1";
const PROFILE = { name: "Ada Lovelace", email: "ada@analytical.test", company: "Analytical Engines", role: "Founder", team_size: "2-10", website: "analytical.test", ai_tools: "Claude" };
const JOIN = { ...PROFILE, password: PASS, confirm: PASS, consent_terms: "1", consent_keep: "1" };
const STEP = { product: "Engine", line: "Computes tables", stage: "building" };

async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"], ["one-mia", "Mia", "member", "one-mia-key", [], "mia@one.test"]],
    orgs: [{ id: 2, name: "Two", projects: ["beta"], people: [["two-owner", "Owner Two", "owner", "two-owner-key", [], "owner@two.test"]] }] });
  w.env.MAIL_CAPTURE = "kv";
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  const call = async (method, path, { body, form, cookie, key, nav = false, headers: extra = {} } = {}) => {
    const headers = { accept: form || nav ? "text/html" : "application/json", ...extra };
    if (cookie) { headers.cookie = "__Host-ar_session=" + cookie; headers["sec-fetch-site"] = headers["sec-fetch-site"] || "same-origin"; }
    if (key) headers.authorization = "Bearer " + key;
    if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    let r;
    try { r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" })); }
    catch (e) { return { status: 500, text: String((e && e.message) || e), json: null, location: "", cookie: "" }; }
    const text = await r.text();
    await w.settle();
    let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, text, json, location: r.headers.get("location") || "", cookie: ((r.headers.get("set-cookie") || "").match(/__Host-ar_session=([^;]*)/) || [])[1] || "" };
  };
  const join = (fields, extra) => call("POST", "/request-access", { form: { web: "1", ...fields }, ...extra });
  const mails = async () => Promise.all(((await w.env.OAUTH_KV.list({ prefix: "mail-capture:" })).keys || []).map(async (k) => JSON.parse(await w.env.OAUTH_KV.get(k.name))));
  const linkOf = (m) => ((/\/account\/verify\/([0-9a-f]{48})/.exec((m && m.text) || "") || [])[1]) || null;
  const verified = async (fields = {}) => {
    const email = String(fields.email || JOIN.email).toLowerCase();
    await join({ ...JOIN, ...fields });
    const ms = (await mails()).filter((m) => m.to === email && linkOf(m));
    const v = await call("POST", "/account/verify", { form: { web: "1", token: linkOf(ms[ms.length - 1]), password: fields.password || PASS } });
    return { email, cookie: v.cookie, row: one("SELECT * FROM access_requests WHERE email = ?", email) };
  };
  // the account passphrase of a seat's account (set by SQL), then its browser session (POST /login's JSON answer's token)
  const sessionOf = async (email, pass = "an-account-passphrase") => {
    w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ? WHERE email = ?").run(pbkdf2(pass, SALT), SALT, email);
    const r = await call("POST", "/login", { body: { email, password: pass } });
    return (r.json && r.json.token) || "";
  };
  const slug = (id = 1) => one("SELECT slug FROM org WHERE id = ?", id).slug;
  return { w, q, one, call, join, mails, verified, sessionOf, slug };
}
// fold a page's text for comparing two answers (the request's own nonce-free bytes)
const same = (a, b) => a.status === b.status && a.text === b.text;
// put(db, id, o) — a verified request by SQL (the line's fixtures)
const put = (db, id, o = {}) => db.prepare("INSERT INTO access_requests (id, email, name, company, role, team_size, status, verified_at, created_at, updated_at, approved_at, declined_at, org_id, source, website, linkedin, x, github, ai_tools, use_case, account_id, account_at, consent_version, consent_at, consent_terms, consent_keep, consent_updates, consent_call) " +
  "VALUES (?, ?, ?, ?, 'Founder', '11-50', ?, ?, ?, ?, ?, ?, ?, 'site', 'https://x.test/', 'https://www.linkedin.com/in/x', 'https://x.com/x', 'https://github.com/x', 'Claude', 'One line', 'acc-x', ?, '2026-10-14', ?, 1, 1, 1, 0)")
  .run(id, `${id}@line.test`, `Name ${id}`, `Company ${id}`, o.status || "open", o.verified || "2026-06-01T00:00:00.000Z", o.created || "2026-06-01T00:00:00.000Z", o.updated || "2026-06-01T00:00:00.000Z",
    o.approved || null, o.declined || null, o.org == null ? null : o.org, o.verified || "2026-06-01T00:00:00.000Z", o.created || "2026-06-01T00:00:00.000Z");

const CASES = {
  async D1() {
    const { readConsent, CONSENT_VERSION, CONSENT_BOXES } = await mod("requestaccess.js");
    const none = readConsent({}), noKeep = readConsent({ consent_terms: "1" }), form = readConsent({ consent_terms: "on", consent_keep: "1", consent_call: "1" }), json = readConsent({ consent_terms: true, consent_keep: 1, consent_updates: true });
    const junk = readConsent({ consent_terms: "yes", consent_keep: "1" });
    return [
      [none.field === "consent_terms" && noKeep.field === "consent_keep" && junk.field === "consent_terms", `D1 · the required boxes, each its field when unticked, the terms first (${none.field}, ${noKeep.field}; "yes" ticks nothing: ${junk.field})`],
      [JSON.stringify(form.consent) === JSON.stringify({ terms: 1, keep: 1, updates: 0, call: 1 }) && JSON.stringify(json.consent) === JSON.stringify({ terms: 1, keep: 1, updates: 1, call: 0 }),
        `D1 · a form's "1"/"on" and JSON's true/1 tick a box; the optional two 0 unless ticked (${JSON.stringify(form.consent)} ${JSON.stringify(json.consent)})`],
      [/^\d{4}-\d{2}-\d{2}$/.test(CONSENT_VERSION) && CONSENT_BOXES.map(([k, r]) => `${k}:${r}`).join() === "consent_terms:true,consent_keep:true,consent_updates:false,consent_call:false"
        && CONSENT_BOXES[0][2] === "I agree to the Terms and the Privacy policy" && CONSENT_BOXES[1][2] === "sharingu may keep this profile to review my request and email me about the beta"
        && CONSENT_BOXES[2][2] === "Email me product updates" && CONSENT_BOXES[3][2] === "You may ask me for a 20-minute feedback call",
        `D1 · the words' version is a day (${CONSENT_VERSION}); the four boxes the owner's words, two required then two optional`],
    ];
  },
  async D2() {
    const { sourceOf } = await mod("requestaccess.js");
    const kept = ["site", "showcase", "direct", " SITE ", "Showcase"].map(sourceOf), odd = [undefined, null, "", "evil", "site?x=1", "https://www.sharingu.xyz/", ["site"], { site: 1 }, "sitex"].map(sourceOf);
    const W = await world();
    const g = await W.call("GET", "/request-access?from=site", { nav: true }), u = await W.call("GET", "/request-access?from=%3Cscript%3E", { nav: true }), n = await W.call("GET", "/request-access", { nav: true });
    const hidden = (r) => (/<input type="hidden" name="from" value="([^"]*)">/.exec(r.text) || [])[1];
    return [
      [kept.join() === "site,showcase,direct,site,showcase" && odd.every((s) => s === "direct"), `D2 · the whitelist: ${kept.join()}; anything else direct (${odd.join()})`],
      [hidden(g) === "site" && hidden(u) === "direct" && hidden(n) === "direct" && !/script/.test(u.text.match(/name="from"[^>]*>/)[0]), `D2 · ?from= rides the form as a hidden field: site -> ${hidden(g)}, a stranger's tag -> ${hidden(u)}, none -> ${hidden(n)}`],
    ];
  },
  async D3() {
    const W = await world();
    const before = JSON.stringify(W.q("SELECT * FROM access_requests"));
    const noTerms = await W.join({ ...JOIN, consent_terms: undefined, consent_updates: "1" }), noKeep = await W.join({ ...JOIN, consent_keep: undefined });
    const j = await W.call("POST", "/request-access", { body: { ...JOIN, consent_keep: false } });
    const nothing = JSON.stringify(W.q("SELECT * FROM access_requests")) === before && (await W.mails()).length === 0;
    const marked = (r, k) => new RegExp(`<input type="checkbox" id="${k}" name="${k}" value="1" required[^>]*aria-invalid="true" autofocus aria-describedby="err-${k}"`).test(r.text) && new RegExp(`data-field-error="${k}"`).test(r.text);
    const ok = await W.join({ ...JOIN, consent_updates: "1", from: "site" });
    const row = W.one("SELECT * FROM access_requests WHERE email = ?", JOIN.email) || {};
    const { CONSENT_VERSION } = await mod("requestaccess.js");
    const stranger = await W.join({ ...JOIN, email: "b@two.test", from: "a-tracker" });
    const srow = W.one("SELECT source, consent_updates, consent_call FROM access_requests WHERE email = 'b@two.test'") || {};
    return [
      [noTerms.status === 422 && marked(noTerms, "consent_terms") && !marked(noTerms, "consent_keep") && noKeep.status === 422 && marked(noKeep, "consent_keep"),
        `D3 · a required box left empty: 422 (${noTerms.status}, ${noKeep.status}), the error on the box itself (aria-invalid, its words, the focus)`],
      [/id="consent_updates" name="consent_updates" value="1" checked/.test(noTerms.text) && /value="Analytical Engines"/.test(noTerms.text) && !noTerms.text.includes(PASS) && !/<div class="state state-error"/.test(noTerms.text),
        "D3 · the form comes back with its answers (the optional box still ticked, the company), never the passphrase, no banner above"],
      [j.status === 422 && j.json && j.json.error === "bad_request_access" && j.json.field === "consent_keep" && nothing, `D3 · JSON: 422 ${j.json && j.json.error} {field: ${j.json && j.json.field}}; nothing filed, nothing sent by the three`],
      [ok.status === 303 && row.status === "unverified" && row.consent_version === CONSENT_VERSION && row.consent_at === row.created_at && row.consent_terms === 1 && row.consent_keep === 1 && row.consent_updates === 1 && row.consent_call === 0 && row.source === "site",
        `D3 · with both boxes and ?from=site: filed (${ok.status}) with the four answers, the words' version (${row.consent_version}) and the time (the request's own), source ${row.source}`],
      [srow.source === "direct" && srow.consent_updates === 0 && srow.consent_call === 0, `D3 · a stranger's tag is stored as direct (${srow.source}); unticked optional boxes 0`],
    ];
  },
  async D4() {
    const W = await world();
    const v = await W.verified({ from: "showcase" });
    const acc = W.one("SELECT id FROM accounts WHERE email = ?", v.email) || {};
    const team = (await W.mails()).find((m) => m.to === "ryuk@ryuklabs.io" && /^New beta request/.test(m.subject)) || {};
    return [
      [v.row.status === "open" && v.row.account_id === acc.id && !!acc.id && v.row.account_at === v.row.verified_at, `D4 · the verification names its account (${v.row.account_id === acc.id}) at its own time (${v.row.account_at === v.row.verified_at})`],
      [/Source: showcase/.test(team.text || "") && !/Ada Lovelace|ada@analytical\.test/i.test((team.text || "") + (team.html || "") + (team.subject || "")),
        `D4 · the team's alert names the source (${/Source: showcase/.test(team.text || "")}), never the person's name or email`],
    ];
  },
  async D5() {
    const { readProductStep: R, PRODUCT_MAX } = await mod("orgprofile.js");
    const full = R({ ...STEP, kinds: ["api", "web"], ais: "codex", places: ["slack", "github"], first_want: "gtm", people: "6-20" }, { required: true });
    const miss = ["product", "line", "stage"].map((f) => R({ ...STEP, [f]: "" }, { required: true }).field);
    const bad = [
      R({ ...STEP, product: "x".repeat(PRODUCT_MAX.product + 1) }, { required: true }).field, R({ ...STEP, line: "y".repeat(PRODUCT_MAX.line + 1) }, { required: true }).field,
      R({ ...STEP, stage: "hype" }, { required: true }).field, R({ ...STEP, kinds: ["web", "blockchain"] }, { required: true }).field, R({ ...STEP, first_want: ["gtm", "picture"] }, { required: true }).field,
      R({ ...STEP, product: ["a", "b"] }, { required: true }).field, R({ ...STEP, ais: [{ x: 1 }] }, { required: true }).field, R({ ...STEP, people: "500" }, { required: true }).field,
    ];
    const none = R({}, { required: false }), part = R({ kinds: ["web"] }, { required: false }), empties = R({ kinds: [], product: "  " }, { required: false });
    const p = full.profile || {};
    return [
      [JSON.stringify(p) === JSON.stringify({ product: "Engine", line: "Computes tables", stage: "building", kinds: ["web", "api"], ais: ["codex"], places: ["github", "slack"], first_want: "gtm", people: "6-20" }),
        `D5 · a whole answer reads, each multi choice in the list's order (${JSON.stringify(p)})`],
      [miss.join() === "product,line,stage" && R({}, { required: true }).field === "product", `D5 · the three required, each named (${miss.join()})`],
      [bad.join() === "product,line,stage,kinds,first_want,product,ais,people", `D5 · past its length, off its list, a single given twice, an object: each its field (${bad.join()})`],
      [none.profile === null && !none.field && part.field === "product" && empties.profile === null, `D5 · not required: nothing (or only empties) -> no profile; anything -> read strictly (${part.field})`],
    ];
  },
  async D6() {
    const W = await world();
    const v = await W.verified();
    W.w.db.prepare("UPDATE access_requests SET status = 'approved', approved_at = ?1 WHERE email = ?2").run(new Date().toISOString(), v.email);
    const g = await W.call("GET", "/orgs/new", { cookie: v.cookie, nav: true });
    const { PRODUCT_NOTE, PRODUCT_CHOICES } = await mod("orgprofile.js");
    const inputs = Object.entries(PRODUCT_CHOICES).every(([k, c]) => c.values.every(([val]) => new RegExp(`<label class="chip"><input type="${c.multi ? "checkbox" : "radio"}" name="${k}" value="${val.replace(/[+]/g, "\\+")}"`).test(g.text)));
    const step = /<fieldset class="build" data-region="product-step">\s*<legend>What you'll build with sharingu<\/legend>/.test(g.text) && g.text.includes(PRODUCT_NOTE.replace(/'/g, "&#39;"))
      && /name="product" required/.test(g.text) && /name="line" required/.test(g.text) && (g.text.match(/<span class="opt">optional, any<\/span>/g) || []).length === 3 && (g.text.match(/<span class="opt">optional<\/span>/g) || []).length >= 2;
    const base = { web: "1", email: v.email, password: PASS, name: "Analytical Engines", slug: "analytical" };
    const s0 = JSON.stringify([W.q("SELECT * FROM org"), W.q("SELECT * FROM org_profile")]);
    const pairs = (o, extra = []) => [...Object.entries(o), ...extra];
    const bare = await W.call("POST", "/orgs", { cookie: v.cookie, form: base });
    const miss = await W.call("POST", "/orgs", { cookie: v.cookie, form: pairs({ ...base, line: "Computes tables", stage: "idea" }, [["kinds", "api"], ["kinds", "agent"], ["ais", "claude-code"]]) });
    const kept = /data-field-error="product"/.test(miss.text) && /id="product" name="product" required maxlength="80" value=""[^>]*aria-invalid="true" autofocus/.test(miss.text)
      && /name="kinds" value="api" checked/.test(miss.text) && /name="kinds" value="agent" checked/.test(miss.text) && !/name="kinds" value="web" checked/.test(miss.text) && /name="stage" value="idea" checked/.test(miss.text) && /value="Computes tables"/.test(miss.text);
    const unchanged = JSON.stringify([W.q("SELECT * FROM org"), W.q("SELECT * FROM org_profile")]) === s0;
    const made = await W.call("POST", "/orgs", { cookie: v.cookie, form: pairs({ ...base, ...STEP, first_want: "decisions", people: "2-5" }, [["kinds", "mobile"], ["kinds", "web"], ["places", "notion"]]) });
    const org = W.one("SELECT id FROM org WHERE slug = 'analytical'") || {};
    const prof = W.one("SELECT * FROM org_profile WHERE org = ?", org.id || 0) || {};
    const req = W.one("SELECT org_id, org_at FROM access_requests WHERE email = ?", v.email) || {};
    const orgAt = W.one("SELECT created_at FROM org WHERE id = ?", org.id || 0) || {};
    // a script's JSON: no step -> no profile; part of it -> 422 naming the first missing field
    const sb = await W.verified({ email: "babbage@analytical.test" });
    W.w.db.prepare("UPDATE access_requests SET status = 'approved', approved_at = ?1 WHERE email = ?2").run(new Date().toISOString(), sb.email);
    const part = await W.call("POST", "/orgs", { body: { email: sb.email, password: PASS, name: "Difference", slug: "difference", stage: "idea" } });
    const js = await W.call("POST", "/orgs", { body: { email: sb.email, password: PASS, name: "Difference", slug: "difference" } });
    const jorg = js.json && js.json.org ? js.json.org.id : 0;
    // ONE batch: a profile the table refuses (a stage its CHECK does not hold, past the door) lands no org either
    const { createOrg, orgFields } = await mod("orgs.js");
    const cv = await W.verified({ email: "clement@analytical.test" });
    W.w.db.prepare("UPDATE access_requests SET status = 'approved', approved_at = ?1 WHERE email = ?2").run(new Date().toISOString(), cv.email);
    const orgs0 = W.one("SELECT COUNT(*) AS n FROM org").n;
    const { installOrgSlot } = await mod("data.js");
    let threw = false;
    try { await createOrg(installOrgSlot({ ...W.w.env }), new URL(W.w.origin), orgFields({ email: cv.email, password: PASS, name: "Clement", slug: "clement" }), { profile: { ...STEP, stage: "hype", kinds: [], ais: [], places: [] } }); } catch { threw = true; }
    return [
      [g.status === 200 && step && inputs, `D6 · the org form draws the product step: its legend, the one line about the data, every choice a real input inside its chip, the optional ones said so (${g.status})`],
      [bare.status === 422 && /data-field-error="product"/.test(bare.text) && miss.status === 422 && kept && unchanged, `D6 · a web POST with no step at all (${bare.status}) or without the product (${miss.status}): 422 marked on the field, NO org, every answer kept as sent`],
      [made.status === 200 && !!org.id && prof.product === "Engine" && prof.line === "Computes tables" && prof.stage === "building" && prof.kinds === '["web","mobile"]' && prof.ais === "[]" && prof.places === '["notion"]' && prof.first_want === "decisions" && prof.people === "2-5"
        && req.org_id === org.id && req.org_at === orgAt.created_at && prof.created_at === orgAt.created_at,
        `D6 · complete: the org (${org.id}), its profile (${JSON.stringify([prof.stage, prof.kinds, prof.places])}) and the request naming it (${req.org_id}), all at the org's own time`],
      [part.status === 422 && part.json && part.json.error === "bad_org" && part.json.field === "product" && js.status === 200 && jorg && !W.one("SELECT 1 AS x FROM org_profile WHERE org = ?", jorg),
        `D6 · a script's JSON: part of the step 422 bad_org {field: ${part.json && part.json.field}}; none of it -> the org (${js.status}), no profile`],
      [threw && W.one("SELECT COUNT(*) AS n FROM org").n === orgs0 && !W.one("SELECT 1 AS x FROM org WHERE slug = 'clement'"), `D6 · ONE batch: a profile the table refuses lands no org either (${threw ? "refused" : "landed"})`],
    ];
  },
  async D7() {
    const W = await world();
    const s1 = W.slug(1), s2 = W.slug(2);
    const admin = await W.call("GET", `/${s1}/operator`, { key: "one-owner-key", nav: true });
    const member = await W.call("GET", `/${s1}/operator`, { key: "one-mia-key", nav: true });
    const otherOwn = await W.call("GET", `/${s2}/operator`, { key: "two-owner-key", nav: true });
    const otherAt1 = await W.call("GET", `/${s1}/operator`, { key: "two-owner-key", nav: true });
    const otherRoot = await W.call("GET", `/operator`, { key: "two-owner-key", nav: true });
    const otherPost = await W.call("POST", `/${s2}/operator`, { key: "two-owner-key", form: { action: "approve", request: "x" } });
    const anon = await W.call("GET", `/${s1}/operator`, { nav: true }), script = await W.call("GET", `/${s1}/operator`);
    const nf = await W.call("GET", `/${s1}/no-such-page-here`, { key: "two-owner-key", nav: true });
    const refused = [member, otherOwn, otherAt1, otherRoot, otherPost];
    return [
      [admin.status === 200 && /data-screen="operator"/.test(admin.text) && ["requested", "verified", "approved", "signed-up", "orgs"].every((k) => new RegExp(`data-metric="${k}"`).test(admin.text)) && /data-region="operator-filter"/.test(admin.text),
        `D7 · org 1's admin: 200 the operator page, the funnel's five tiles and the filter (${admin.status})`],
      [refused.every((r) => r.status === 404 && same(r, member)) && same(member, nf) && !refused.some((r) => /data-screen="operator"|funnel/.test(r.text)),
        `D7 · org 1's member, another org's admin at its own address, at org 1's, at the root, and its POST: each the ONE not-here 404 (${refused.map((r) => r.status).join("/")}), the same bytes as an unknown address`],
      [anon.status === 302 && /^\/login/.test(anon.location) && script.status === 401, `D7 · no session: a browser to the sign-in (${anon.status} ${anon.location}), a script 401 (${script.status})`],
    ];
  },
  async D8() {
    const W = await world();
    const s1 = W.slug(1);
    const cookie = await W.sessionOf("owner@one.test");
    const a = await W.verified({ email: "first@line.test", company: "First Co" }), b = await W.verified({ email: "second@line.test", company: "Second Co" });
    const ra = W.one("SELECT id FROM access_requests WHERE email = ?", a.email).id, rb = W.one("SELECT id FROM access_requests WHERE email = ?", b.email).id;
    const page = await W.call("GET", `/${s1}/operator`, { cookie, nav: true });
    const before = JSON.stringify(W.q("SELECT * FROM access_requests ORDER BY id")), m0 = (await W.mails()).length;
    const cross = await W.call("POST", `/${s1}/operator`, { cookie, form: { action: "approve", request: ra }, headers: { "sec-fetch-site": "cross-site", origin: "https://evil.test" } });
    const crossNothing = cross.status === 403 && JSON.stringify(W.q("SELECT * FROM access_requests ORDER BY id")) === before && (await W.mails()).length === m0;
    const ap = await W.call("POST", `/${s1}/operator?status=open`, { cookie, form: { action: "approve", request: ra } });
    const arow = W.one("SELECT status, approved_at FROM access_requests WHERE id = ?", ra);
    const ins = (await W.mails()).filter((m) => m.to === a.email && m.subject === "You're in");
    const counted = W.one("SELECT COALESCE(SUM(n), 0) AS n FROM mail_days").n;
    const de = await W.call("POST", `/${s1}/operator`, { cookie, form: { action: "decline", request: rb } });
    const brow = W.one("SELECT status, declined_at, updated_at FROM access_requests WHERE id = ?", rb);
    const s2 = JSON.stringify(W.q("SELECT * FROM access_requests ORDER BY id")), m2 = (await W.mails()).length;
    const again = await W.call("POST", `/${s1}/operator`, { cookie, form: { action: "approve", request: rb } }), odd = await W.call("POST", `/${s1}/operator`, { cookie, form: { action: "approve", request: "r'; DROP" } });
    const still = JSON.stringify(W.q("SELECT * FROM access_requests ORDER BY id")) === s2 && (await W.mails()).length === m2;
    // the cap: 50 places taken (approved requests with no org), the next Approve refused, nothing changed or sent
    for (let i = 0; i < 50; i++) put(W.w.db, `cap-${String(i).padStart(2, "0")}`, { status: "approved", approved: "2026-10-14T00:00:00.000Z" });
    const c = await W.verified({ email: "third@line.test", company: "Third Co" });
    const rc = W.one("SELECT id FROM access_requests WHERE email = ?", c.email).id;
    const s3 = JSON.stringify(W.q("SELECT * FROM access_requests ORDER BY id")), m3 = (await W.mails()).length;
    const capped = await W.call("POST", `/${s1}/operator`, { cookie, form: { action: "approve", request: rc } });
    return [
      [page.status === 200 && page.text.includes(`data-request="${ra}"`) && /data-form="approve"/.test(page.text) && /data-form="decline"/.test(page.text) && /First Co/.test(page.text) && /first@line\.test/.test(page.text),
        `D8 · the line on the page: each open request, its profile, Approve and Decline (${page.status})`],
      [crossNothing, `D8 · a cross-site POST: 403 (${cross.status}), nothing changed, nothing sent`],
      [ap.status === 200 && /data-flash="approved"/.test(ap.text) && arow.status === "approved" && !!arow.approved_at && ins.length === 1 && ins[0].from.email === "hello@sharingu.xyz" && counted >= 1,
        `D8 · Approve: approved (${arow.status}), ONE "You're in" captured (${ins.length}), counted in the cap (${counted})`],
      [de.status === 200 && /data-flash="declined"/.test(de.text) && brow.status === "declined" && !!brow.declined_at && brow.declined_at === brow.updated_at, `D8 · Decline: declined with declined_at (${brow.status} ${brow.declined_at})`],
      [again.status === 200 && /data-flash="refused"/.test(again.text) && /not in line/.test(again.text) && odd.status === 200 && /data-flash="refused"/.test(odd.text) && still,
        "D8 · a request not in line, an id that is none: refused on the page, nothing changed, nothing sent"],
      [capped.status === 200 && /data-flash="refused"/.test(capped.text) && /places are taken/.test(capped.text) && JSON.stringify(W.q("SELECT * FROM access_requests ORDER BY id")) === s3 && (await W.mails()).length === m3,
        "D8 · the cap: with the 50 places taken Approve is refused, nothing changed, nothing sent"],
    ];
  },
  async D9() {
    const { FUNNEL_SQL, PEOPLE_SQL, FUNNEL_ROWS, PAGE_ROWS, readOperator } = await mod("operatorread.js");
    const W = await world();
    const db = W.w.db;
    // the people: 3 open, 2 approved (one signed in again after it, one with an org), 1 declined, 1 unverified
    put(db, "f-o1", { verified: "2026-10-01T01:00:00.000Z" }); put(db, "f-o2", { verified: "2026-10-01T02:00:00.000Z" }); put(db, "f-o3", { verified: "2026-10-01T03:00:00.000Z" });
    put(db, "f-a1", { status: "approved", verified: "2026-10-01T04:00:00.000Z", approved: "2026-10-02T00:00:00.000Z" });
    put(db, "f-a2", { status: "approved", verified: "2026-10-01T05:00:00.000Z", approved: "2026-10-02T00:00:00.000Z", org: 2 });
    db.prepare("UPDATE access_requests SET account_id = 'acc-a1' WHERE id = 'f-a1'").run();
    db.prepare("UPDATE access_requests SET org_at = '2026-10-03T00:00:00.000Z', account_id = 'acc-a2' WHERE id = 'f-a2'").run();
    db.prepare("INSERT INTO account_sessions (token_hash, account_id, device, created_at, expires_at) VALUES ('h1', 'acc-a1', 'web', '2026-10-02T06:00:00.000Z', '2099-01-01T00:00:00.000Z')").run();
    db.prepare("INSERT INTO account_sessions (token_hash, account_id, device, created_at, expires_at) VALUES ('h0', 'acc-x', 'web', '2026-06-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')").run();
    db.prepare("INSERT INTO org_profile (org, product, line, stage, kinds, created_at) VALUES (2, 'Two App', 'Two line', 'launched', '[\"api\"]', '2026-10-03T00:00:00.000Z')").run();
    put(db, "f-d1", { status: "declined", verified: "2026-10-01T06:00:00.000Z", declined: "2026-10-02T00:00:00.000Z" });
    db.prepare("INSERT INTO access_requests (id, email, name, company, role, team_size, status, created_at, updated_at) VALUES ('f-u1', 'u@line.test', 'U', 'U Co', 'R', '1', 'unverified', ?1, ?1)").run("2026-10-04T00:00:00.000Z");
    const f = db.prepare(FUNNEL_SQL).get(FUNNEL_ROWS);
    const env = W.w.env;
    const { installOrgSlot } = await mod("data.js");
    const read = await readOperator(installOrgSlot({ ...env }), { status: "approved" });
    const a2 = read.people.find((p) => p.id === "f-a2") || {};
    const fplan = db.prepare("EXPLAIN QUERY PLAN " + FUNNEL_SQL).all(1).map((r) => r.detail);
    const pplan = db.prepare("EXPLAIN QUERY PLAN " + PEOPLE_SQL).all("open", "", "", 21).map((r) => r.detail);
    // the bound: past FUNNEL_ROWS the newest are read; the keyset's next page
    for (let i = 0; i < FUNNEL_ROWS + 5; i++) put(db, `b-${String(i).padStart(4, "0")}`, { verified: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0").slice(-3)}Z` });
    const big = db.prepare(FUNNEL_SQL).get(FUNNEL_ROWS);
    const p1 = await readOperator(installOrgSlot({ ...env }), { status: "open" }), p2 = await readOperator(installOrgSlot({ ...env }), { status: "open", after: p1.next });
    const ordered = [...p1.people, ...p2.people].map((p) => `${p.at.verified}~${p.id}`);
    return [
      [f.requested === 7 && f.verified === 6 && f.approved === 2 && f.signed_up === 2 && f.orgs === 1 && f.open === 3 && f.declined === 1 && f.cleared === 0,
        `D9 · the funnel: requested 7, verified 6, approved 2, signed up 2 (one signed in again after it, one made its org), org created 1; open 3, declined 1 (${JSON.stringify(f)})`],
      [a2.org && a2.org.slug === W.slug(2) && a2.product && a2.product.product === "Two App" && JSON.stringify(a2.product.answers[0]) === '["Stage",["Launched"]]' && JSON.stringify(a2.product.answers[1]) === '["What it is",["API"]]'
        && a2.consent.version === "2026-10-14" && a2.consent.boxes.map((x) => `${x.key}:${x.given}`).join() === "consent_terms:true,consent_keep:true,consent_updates:true,consent_call:false" && a2.source === "site" && a2.teamSize === "11 to 50",
        `D9 · an approved person's row: the org it founded, its product answers, its consent and source (${JSON.stringify(a2.product)})`],
      [fplan.some((d) => /^SCAN access_requests$/.test(d)) && !fplan.some((d) => /TEMP B-TREE/.test(d)) && fplan.some((d) => /SEARCH s USING (COVERING )?INDEX idx_account_sessions_account/.test(d)),
        `D9 · the funnel is ONE aggregate over the newest rows: a scan in rowid order (no sort), the sign-in probe on its index (${fplan.join(" | ")})`],
      [/^SEARCH r USING INDEX idx_access_requests_people \(status=\?/.test(pplan[0] || "") && pplan.some((d) => /SEARCH o USING INTEGER PRIMARY KEY/.test(d)) && pplan.some((d) => /SEARCH p USING INTEGER PRIMARY KEY/.test(d)) && !pplan.some((d) => /TEMP B-TREE|^SCAN/.test(d)),
        `D9 · one page of people: a SEARCH on idx_access_requests_people, the org and its profile each by primary key, no sort (${pplan.join(" | ")})`],
      [big.requested === FUNNEL_ROWS && p1.people.length === PAGE_ROWS && p1.more && p2.people.length === PAGE_ROWS && ordered.every((k, i) => !i || ordered[i - 1] < k) && p1.funnel.capped && p1.people[0].place === 1 && p2.people[0].place === PAGE_ROWS + 1,
        `D9 · bounded: ${FUNNEL_ROWS + 12} requests read as the newest ${big.requested} (capped); two pages of ${PAGE_ROWS} in line order, the keyset's next, the places counted on (${p2.people[0] && p2.people[0].place})`],
    ];
  },
  async D10() {
    const { clearStale, CLEAR_DECLINED_SQL, CLEAR_ABANDONED_SQL, CLEAR_FIELDS, CLEAR_BATCH } = await mod("requestaccess.js");
    const { runCron } = await mod("cron.js");
    const { betaCount, mayFound } = await mod("accounts.js");
    const W = await world();
    const db = W.w.db;
    const NOW = "2026-10-14T12:00:00.000Z", OLD = "2026-07-15T11:00:00.000Z", YOUNG = "2026-07-17T00:00:00.000Z";   // 91 days and 89 days before
    put(db, "c-d-old", { status: "declined", declined: OLD }); put(db, "c-d-young", { status: "declined", declined: YOUNG });
    put(db, "c-a-old", { status: "approved", approved: OLD }); put(db, "c-a-org", { status: "approved", approved: OLD, org: 2 }); put(db, "c-a-young", { status: "approved", approved: YOUNG });
    put(db, "c-open", { verified: "2026-01-01T00:00:00.000Z" });
    const all = () => Object.fromEntries(W.q("SELECT * FROM access_requests ORDER BY id").map((r) => [r.id, r]));
    const before = all();
    const placesBefore = await betaCount({ DB: W.w.env.DB });
    const r1 = await clearStale({ DB: W.w.env.DB }, NOW);
    const after = all();
    const cleared = Object.keys(after).filter((id) => after[id].cleared_at);
    const EMPTY = { name: "", company: "", role: "", website: null, linkedin: null, x: null, github: null, ai_tools: null, use_case: null, account_id: null };
    const exact = ["c-d-old", "c-a-old"].every((id) => {
      const a = after[id], b = before[id];
      const goneOk = Object.entries(EMPTY).every(([k, v]) => a[k] === v) && a.email === `cleared:${id}`;
      const keptOk = Object.keys(b).filter((k) => !CLEAR_FIELDS.includes(k) && !["cleared_at", "updated_at"].includes(k)).every((k) => a[k] === b[k]);
      return goneOk && keptOk && a.cleared_at === NOW && a.updated_at === NOW;
    });
    const untouched = ["c-d-young", "c-a-org", "c-a-young", "c-open"].every((id) => JSON.stringify(after[id]) === JSON.stringify(before[id]));
    const r2 = await clearStale({ DB: W.w.env.DB }, NOW);
    const again = all();
    const placesAfter = await betaCount({ DB: W.w.env.DB });
    const mayOld = await mayFound({ DB: W.w.env.DB }, "c-a-old@line.test");
    const plans = [CLEAR_DECLINED_SQL, CLEAR_ABANDONED_SQL].map((s) => db.prepare("EXPLAIN QUERY PLAN " + s).all("x", "y", 1).map((r) => r.detail).join(" | "));
    // the batch: CLEAR_BATCH a run, the rest the next; the cron runs it once a run
    for (let i = 0; i < CLEAR_BATCH + 5; i++) put(db, `c-many-${String(i).padStart(3, "0")}`, { status: "declined", declined: OLD });
    const b1 = await clearStale({ DB: W.w.env.DB }, NOW);
    const cron = await runCron(W.w.env, Date.parse(NOW));
    return [
      [r1.declined === 1 && r1.abandoned === 1 && cleared.sort().join() === "c-a-old,c-d-old" && untouched, `D10 · exactly the declined one 90+ days after its decline and the approved one with no org 90+ days after its approval (${cleared.join(", ")}); the young, the one with an org, the open one untouched`],
      [exact, `D10 · CLEAR_FIELDS emptied (${CLEAR_FIELDS.join(", ")}; the email "cleared:<id>"), every other field as it was (status, dates, team size, source, consent), cleared_at the run's time`],
      [r2.declined === 0 && r2.abandoned === 0 && JSON.stringify(again["c-d-old"]) === JSON.stringify(after["c-d-old"]), "D10 · a cleared request is never taken again"],
      [placesBefore.approved === 3 && placesAfter.approved === 2 && mayOld === false, `D10 · a cleared approval holds no beta place (${placesBefore.approved} -> ${placesAfter.approved} approved with no org) and approves no org by its old email (${mayOld})`],
      [plans.every((p) => /SEARCH access_requests USING INDEX idx_access_requests_(declined|abandoned) \((declined|approved)_at<\?\)/.test(p) && !/SCAN access_requests/.test(p)),
        `D10 · each selection a SEARCH of its partial index, never a scan (${plans.join(" || ")})`],
      [b1.declined === CLEAR_BATCH && cron.clear && cron.clear.declined === 5 && cron.clear.abandoned === 0, `D10 · ${CLEAR_BATCH} a run (${b1.declined}), the rest by the next: the cron's own step (${JSON.stringify(cron.clear)})`],
    ];
  },
};

// THE MUTANTS: each a scratch copy of src/ with one rule broken, which must turn its case red by an assertion
const MUTANTS = [
  { name: "the consent's required boxes not required", file: "src/requestaccess.js",
    from: "  for (const [k, required] of CONSENT_BOXES) if (required && !ticked(i[k])) return { field: k };", to: "", red: ["D1", "D3"] },
  { name: "the source taken as typed", file: "src/requestaccess.js",
    from: "return REQUEST_SOURCES.includes(s) ? s : \"direct\"; };", to: "return s || \"direct\"; };", red: ["D2"] },
  { name: "the verification names no account", file: "src/accounts.js",
    from: "    db(env).prepare(VERIFY_LINK_SQL).bind(out.email, at, row.id),\n", to: "", red: ["D4"] },
  { name: "the web form's product step not required", file: "src/index.js",
    from: "const product = readProductStep(raw, { required: isWeb });", to: "const product = readProductStep(raw, { required: false });", red: ["D6"] },
  { name: "the product profile never written", file: "src/orgs.js",
    from: "        ...(profile ? [db(fe).prepare(FOUND_PROFILE_SQL)", to: "        ...(false ? [db(fe).prepare(FOUND_PROFILE_SQL)", red: ["D6"] },
  { name: "the operator page open to any org's admin", file: "src/operatorread.js",
    from: "readerOrg(env) === HOME_ORG && Number(reader.org) === HOME_ORG && reader.role === \"owner\"", to: "reader.role === \"owner\"", red: ["D7"] },
  { name: "the operator page open to org 1's members", file: "src/operatorread.js",
    from: "Number(reader.org) === HOME_ORG && reader.role === \"owner\"", to: "Number(reader.org) === HOME_ORG", red: ["D7"] },
  { name: "the operator page's decisions without the same-origin guard", file: "src/index.js",
    from: "      if (csrfRefused(request, url, reader)) return page({ ok: false, words: \"That decision did not come from this site", to: "      if (false) return page({ ok: false, words: \"That decision did not come from this site", red: ["D8"] },
  { name: "the operator page's Approve past the cap", file: "src/operatorread.js",
    from: "  if (places.left < 1) return { refused:", to: "  if (false) return { refused:", red: ["D8"] },
  { name: "the clearing without its 90 days", file: "src/requestaccess.js",
    from: "export const clearLine = (at) => new Date(Date.parse(at) - CLEAR_DAYS * 86400000).toISOString();", to: "export const clearLine = (at) => at;", red: ["D10"] },
  { name: "the request never names the org it founded", file: "src/orgs.js",
    from: "        db(fe).prepare(FOUND_REQUEST_SQL).bind(account.email, at, account.id),\n", to: "", red: ["D6"] },
  { name: "a cleared approval still holding a place", file: "src/beta.js",
    from: "WHERE r.status = 'approved' AND r.cleared_at IS NULL AND", to: "WHERE r.status = 'approved' AND", red: ["D10"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".data-mutation-"));
    cpSync(join(ENGINE, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, m.file), s = readFileSync(p, "utf8");
    if (s.split(m.from).length !== 2) { ok(false, `mutant "${m.name}": its needle is not found exactly once in ${m.file} (update this selftest with the code)`); continue; }
    writeFileSync(p, s.replace(m.from, m.to));
    MUT = { src: join(dir, "src") };
    const reds = [];
    for (const name of m.red) { const res = await runCase(name); reds.push(res.some(([c, l]) => !c && !/ threw: /.test(l)) && !res.some(([, l]) => / threw: /.test(l))); }
    ok(reds.every(Boolean), `mutant "${m.name}" turns ${m.red.join(" and ")} red (${reds.map((r, i) => `${m.red[i]} ${r ? "red" : "GREEN"}`).join(", ")})`);
  } finally { MUT = {}; if (dir) rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${failed ? "✗" : "✓"} data selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
