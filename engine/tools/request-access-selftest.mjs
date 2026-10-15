// tools/request-access-selftest.mjs — sprint 21, slices 21.1, 21.2 and 21.4a (migrate-081; src/requestaccess.js, src/requestpage.js,
// src/accountpage.js, src/accounts.js THE ACCOUNT FLOW, src/email.js; POST /request-access and the /account/… doors): joining the beta,
// the verification, the account session, the sign-in, the resend, the reset and the cap at the door, through the REAL worker
// (src/index.js over node:sqlite built from boot.sql, tools/fixtures/sqlite-worker.mjs; its emails into the local capture, the
// config's MAIL_CAPTURE: src/email.js THE MAILER).
//   R1 · a full profile reads, each field normalised: the email lower-cased, the text folded, the website's bare domain an https
//        address, the LinkedIn handle, the X @handle (and a twitter.com address) and the GitHub address each the service's own
//        address; the optional fields left empty read as none
//   R2 · each required field missing (name, email, company, role, team size) is named; a team size outside the five; an email
//        with no @, with a space, outside plain ASCII; a field past its length
//   R3 · the addresses, strictly: javascript:, data:, ftp:, a user and password, a host with no dot are no website; an X, LinkedIn
//        or GitHub value on another host or of another shape is refused; a LinkedIn company page is kept as one
//   R4 · the form: the five required fields, the passphrase twice and (21.4b) the two consent boxes required, the six optional fields
//        and the two optional boxes say so, the honeypot out of
//        sight; GET /login carries Join the beta, Forgot your passphrase? and the resend; a short or differing passphrase is the
//        form again marked on its field, nothing written, never echoed
//   R5 · a join: 303 to /account/sent; ONE unverified row (the email lower-cased; the passphrase's pbkdf2 hash and salt; only the
//        link's hash, its token in no row; 24 hours), NO account; ONE email in the capture, From hello@sharingu.xyz, "Verify your
//        email", its link /account/verify/<48 hex> in the HTML (one orange button, the link as text, no remote image but our own
//        /assets/) and in its plain-text twin
//   R6 · THE SAME ANSWER: a new email, an email that holds an account, the honeypot and a second join each answer the same 303
//        (status, headers, location, body); the account's email, its passphrase untouched, gets "you already have an account"
//        (sign in, or reset) and a request whose link goes to no one, so a sign-in with the joined passphrase then answers the same
//        "check your inbox" as a new email's, and a resend for it sends nothing; the honeypot files and sends nothing; a second
//        join is a second unverified row
//   R7 · THE VERIFICATION: the link's GET shows the confirm page and changes nothing; a wrong passphrase is 401, the request still
//        unverified, the attempt counted; the right one: 303 to /account with an ACCOUNT session (its own table, prefix t_a_), the
//        account made with the joined passphrase, the request open (verified_at), its hashes cleared, the email's other unverified
//        join deleted; the team's email to acie@ cc ryuk@: company, role, team size, never the person's name or email; the same link
//        again, the other join's link and an expired one are ONE 404 page with a resend
//   R8 · THE SIGN-IN: before verifying, the joined passphrase is 403 check your inbox (the email filled in its resend), another is
//        the one 401; after, a browser's sign-in is 302 to /account with an account session; a script's stays 403 no_seat_here
//   R9 · THE ACCOUNT SESSION'S REACH: it opens /account (in line: its place, the beta's count, the track), and sends / there; it
//        signs in NOWHERE else — an org's address sends it to the sign-in, /mcp and /whoami 401 as a cookie or a bearer, the picker
//        is the sign-in rule; /orgs/new sends it back to /account and POST /orgs with its passphrase is 403 org_waiting until the
//        approval; /logout ends it
//   R10 · APPROVED: /account says the place is open (Create your org); /orgs/new comes filled in from the request; the form's POST
//        /orgs with the passphrase makes the org, signs in its owner seat and ends the account session
//   R11 · THE RESEND: a live unverified join gets a NEW link (the old one dead, the new one live); an unknown email the same 303,
//        nothing sent; three emails a day to one address, then nothing (the old link still works)
//   R12 · THE RESET: /account/forgot answers the same for an account's email and an unknown one (form and JSON); the account's
//        email gets one link (30 minutes, its hash only); its GET is the form; a differing passphrase 422; the POST sets it, ends
//        EVERY session of the account (an org session in its org, its account session), signs in fresh (303 /account); the link
//        once; an expired link 404; the old passphrase fails, the new one signs in
//   R13 · the place in line by VERIFICATION time (1 + the open requests verified before, ties by id; approved, declined and
//        unverified never counted); REQUEST_PLACE_SQL one statement, its two counts each a SEARCH of the line index (the earlier ones
//        COVERING); APPROVED_PROFILE_SQL one SEARCH on the email index; MAY_FOUND_SQL and ACCOUNT_STANDING_SQL never scan signup_codes
//        (idx_signup_used: an email's used codes) nor access_requests; the beta count's statements each one aggregate, the worker's
//        betaCount the operator's betaPlaces (an approved request with no org holds a place); betaWords' rules
//   R14 · the refusals, nothing written: a cross-site POST to each door 403; the flood filter 429; a bad email 422; under an org's
//        address /request-access and /account are the one not-here 404; the next join deletes an expired unverified request
//   R15 · THE CAP at the door: with 2,900 counted in the window a join answers the same 303, files nothing, sends nothing to the
//        person; /account/sent says email checks are paused (no Google client stored: no button; tools/google-selftest.mjs G7 offers
//        it); the team's cap alert is captured ONCE however many refusals
//   R16 · THE ONE RULE (src/accounts.js ACCOUNT_HELD, the owner's MCQ of 2026-10-15): a seat holder with no passphrase and no subject
//        (the world's org owner) joins -> the same 303, "you already have an account", nothing verifiable, a resend sends nothing; an
//        OLD live link for it (filed under the old rule) opens nothing (GET and POST the dead page), its passphrase still none, no
//        session, the request not in line, and the batch's spend and account upsert each refuse a held email on their own, as
//        Google's join upsert does; the "already" email says why a seated person is not put in line; forgot -> reset sets its first
//        passphrase, so the owner seat waits (R17): the picker says so and names the org, accepted there, then the passphrase signs
//        in to the seat; a shell no one holds (its seat gone): forgot sends nothing, it joins as new and its verification sets its
//        passphrase; a waiting seat and an invite mark hold too, and the waiting seat's holder's reset sets the passphrase, the seat
//        still waiting (the picker)
//   R17 · THE FIRST PASSPHRASE WAITS (the owner's MCQ, 2026-10-15): a reset that gives an account its first passphrase of its
//        holder's own makes its active seats wait — (a) seated with none: waits, the picker; (b) an invite's: waits, the mark
//        cleared; (c) its own passphrase: unchanged; (d) a waiting seat only: unchanged; (e) Google-linked: unchanged; the statement
//        never revives an archived seat and moves nothing without its reset's spend
//   R18 · THE DECLINE GUARD: the org's only real owner cannot decline its waiting seat (JSON 409 only_owner; the form back to the
//        picker, which says so; the seat still waits), an eval seat is no real owner; a member's Decline, and an owner's while
//        another real owner is active, work as before
//   R19 · a waiting seat's sign-in never lands on its org's page: the picker, even when next names that org (landingFor)
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red, by an assertion, never a crash.
// Exit 1 on any failure. A gate step.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash, pbkdf2Sync } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { betaPlaces } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const pbkdf2 = (pw, salt) => pbkdf2Sync(pw, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
const T0 = "2026-10-01T00:00:00.000Z";

let MUT = {};
const mod = (f) => import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), f)).href);

const PASS = "a-long-passphrase-1";
const FULL = { name: "  Ada   Lovelace ", email: " Ada@Analytical.Test ", company: "Analytical Engines", role: "Founder", team_size: "2-10",
  website: "analytical.test/about", linkedin: "ada-lovelace", x: "@ada", github: "https://github.com/ada-l/", ai_tools: "Claude,\n ChatGPT", use_case: "Share what\tour AI learns." };
const JOIN = { ...FULL, password: PASS, confirm: PASS, consent_terms: "1", consent_keep: "1" };   // 21.4b: the two required boxes ticked

async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"]] });
  w.env.MAIL_CAPTURE = "kv";   // the local capture (src/email.js THE MAILER), as every local config carries it
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
    // an exception the worker lets out reads as the runtime answers it, a 500 (a mutant's broken write is a red assertion, not a crash)
    let r;
    try { r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" })); }
    catch (e) { return { status: 500, text: String((e && e.message) || e), json: null, location: "", keys: [], cookie: "" }; }
    const text = await r.text();
    await w.settle();   // the after-answer work (the emails) done before the case reads them
    let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, text, json, location: r.headers.get("location") || "", keys: [...r.headers.keys()].sort(), cookie: ((r.headers.get("set-cookie") || "").match(/__Host-ar_session=([^;]*)/) || [])[1] || "" };
  };
  const join = (fields, extra) => call("POST", "/request-access", { form: { web: "1", ...fields }, ...extra });
  const rows = () => q("SELECT * FROM access_requests ORDER BY created_at, id");
  // the captured emails, in the order sent (the capture's keys' own order: src/email.js captureMailer)
  const mails = async () => Promise.all(((await w.env.OAUTH_KV.list({ prefix: "mail-capture:" })).keys || []).map(async (k) => JSON.parse(await w.env.OAUTH_KV.get(k.name))));
  const linkOf = (m, kind = "verify") => ((new RegExp(`/account/${kind}/([0-9a-f]{48})`).exec((m && m.text) || "") || [])[1]) || null;
  const lastLink = async (to, kind = "verify") => { const ms = (await mails()).filter((m) => m.to === to && linkOf(m, kind)); return linkOf(ms[ms.length - 1], kind); };
  // the answer's shape: everything a reader of the answer sees
  const shape = (r) => JSON.stringify([r.status, r.keys, r.location, r.text]);
  // verified(email): a join verified at the door, its account session's token answered
  const verified = async (fields = {}) => {
    const email = String(fields.email || JOIN.email).toLowerCase().trim();
    await join({ ...JOIN, ...fields });
    const t = await lastLink(email);
    const v = await call("POST", "/account/verify", { form: { web: "1", token: t, password: fields.password || PASS } });
    return { email, token: t, cookie: v.cookie, answer: v };
  };
  const slug = () => one("SELECT slug FROM org WHERE id = 1").slug;
  return { w, q, one, call, join, rows, mails, linkOf, lastLink, shape, verified, slug };
}


const CASES = {
  async R1() {
    const { readRequest } = await mod("requestaccess.js");
    const r = readRequest(FULL).request || {};
    const empty = readRequest({ ...FULL, website: " ", linkedin: "", x: undefined, github: null, ai_tools: "", use_case: "  " }).request || {};
    return [
      [r.name === "Ada Lovelace" && r.email === "ada@analytical.test" && r.company === "Analytical Engines" && r.role === "Founder" && r.team_size === "2-10",
        `R1 · the required fields read, folded and the email lower-cased (${JSON.stringify([r.name, r.email, r.team_size])})`],
      [r.website === "https://analytical.test/about" && r.linkedin === "https://www.linkedin.com/in/ada-lovelace" && r.x === "https://x.com/ada" && r.github === "https://github.com/ada-l",
        `R1 · each address built by the door (${JSON.stringify([r.website, r.linkedin, r.x, r.github])})`],
      [r.ai_tools === "Claude, ChatGPT" && r.use_case === "Share what our AI learns.", `R1 · the free text folded to one line (${JSON.stringify([r.ai_tools, r.use_case])})`],
      [["website", "linkedin", "x", "github", "ai_tools", "use_case"].every((f) => empty[f] === null), "R1 · an empty optional field reads as none"],
      [readRequest({ ...FULL, x: "https://twitter.com/ada?s=20" }).request?.x === "https://x.com/ada" && readRequest({ ...FULL, linkedin: "https://www.linkedin.com/in/ada-lovelace/?trk=x" }).request?.linkedin === "https://www.linkedin.com/in/ada-lovelace",
        "R1 · a twitter.com address reads as x.com's; a LinkedIn address's trailing slash and query are dropped"],
    ];
  },
  async R2() {
    const { readRequest, REQUEST_MAX } = await mod("requestaccess.js");
    const field = (over) => readRequest({ ...FULL, ...over }).field || "";
    const missing = ["name", "email", "company", "role", "team_size"].map((f) => [f, field({ [f]: "  " })]);
    return [
      [missing.every(([f, got]) => f === got), `R2 · each required field missing is named (${missing.map(([f, g]) => `${f}->${g || "none"}`).join(", ")})`],
      [field({ team_size: "12" }) === "team_size" && field({ team_size: "1" }) === "" && field({ team_size: "201+" }) === "", "R2 · a team size outside the five is named; 1 and 201+ read"],
      [["ada.analytical.test", "ada @analytical.test", "adá@analytical.test", "ada@analytical"].every((e) => field({ email: e }) === "email"), "R2 · an email with no @, a space, a letter outside ASCII or no dot in its domain is named"],
      [field({ name: "a".repeat(REQUEST_MAX.name + 1) }) === "name" && field({ use_case: "w ".repeat(REQUEST_MAX.use_case) }) === "use_case" && field({ ai_tools: "t".repeat(REQUEST_MAX.ai_tools + 1) }) === "ai_tools",
        "R2 · a field past its length is named"],
      [readRequest(null).field === "name" && readRequest([]).field === "name", "R2 · a body that is no object reads as every field missing"],
    ];
  },
  async R3() {
    const { readRequest } = await mod("requestaccess.js");
    const field = (over) => readRequest({ ...FULL, ...over }).field || "";
    const badWeb = ["javascript:alert(1)", "data:text/html,x", "ftp://analytical.test", "https://ada:pw@analytical.test", "localhost", "https://intranet/"];
    const badProfiles = [["x", "https://evil.test/ada"], ["x", "ada.lovelace"], ["x", "@this_handle_is_too_long"], ["linkedin", "https://linkedin.evil.test/in/ada"], ["linkedin", "https://www.linkedin.com/feed/"],
      ["github", "https://gitlab.com/ada"], ["github", "-ada"], ["github", "https://github.com/ada/repo"]];
    const company = readRequest({ ...FULL, linkedin: "linkedin.com/company/analytical-engines" }).request || {};
    return [
      [badWeb.every((v) => field({ website: v }) === "website"), `R3 · no website: ${badWeb.filter((v) => field({ website: v }) !== "website").join(", ") || "each of " + badWeb.length + " refused"}`],
      [badProfiles.every(([f, v]) => field({ [f]: v }) === f), `R3 · a profile on another host or of another shape is refused (${badProfiles.filter(([f, v]) => field({ [f]: v }) !== f).map(([f, v]) => `${f} ${v}`).join(", ") || badProfiles.length + " refused"})`],
      [company.linkedin === "https://www.linkedin.com/company/analytical-engines", `R3 · a LinkedIn company page is kept as one (${company.linkedin})`],
    ];
  },
  async R4() {
    const W = await world();
    const { REQUEST_FIELD_WORDS } = await mod("requestpage.js");
    const g = await W.call("GET", "/request-access", { nav: true });
    const fields = ["name", "email", "company", "role", "team_size", "password", "confirm", "website", "linkedin", "x", "github", "ai_tools", "use_case", "consent_terms", "consent_keep", "consent_updates", "consent_call", "from", "trap"];
    const required = (n) => new RegExp(`<(?:input|select)[^>]*name="${n}"[^>]*\\brequired\\b`).test(g.text);
    const login = await W.call("GET", "/login", { nav: true });
    const short = await W.join({ ...JOIN, password: "short", confirm: "short" }), differ = await W.join({ ...JOIN, confirm: "another-long-passphrase" });
    return [
      [g.status === 200 && /action="\/request-access"/.test(g.text) && fields.every((f) => new RegExp(`name="${f}"`).test(g.text)), `R4 · GET /request-access is the form, every field on it (${g.status})`],
      [["name", "email", "company", "role", "team_size", "password", "confirm", "consent_terms", "consent_keep"].every(required) && !["website", "linkedin", "x", "github", "ai_tools", "use_case", "consent_updates", "consent_call", "trap"].some(required) && (g.text.match(/class="opt">optional</g) || []).length === 8
        && /<input type="password" id="password" name="password" required minlength="12" autocomplete="new-password"/.test(g.text),
        "R4 · the five required fields, the passphrase twice (new-password, at least 12) and (21.4b) the two consent boxes are required, the six optional fields and the two optional boxes say so"],
      [/<div class="trap" aria-hidden="true">[\s\S]*?name="trap" tabindex="-1"/.test(g.text) && /\.trap\{position:absolute;left:-10000px/.test(g.text), "R4 · the honeypot sits out of sight, out of the tab order"],
      [login.status === 200 && /<a href="\/request-access"[^>]*>Join the beta<\/a>/.test(login.text) && /<a href="\/account\/forgot"[^>]*>Forgot your passphrase\?<\/a>/.test(login.text) && /<a href="\/account\/resend"[^>]*>Didn&#39;t get the email\? Resend<\/a>|<a href="\/account\/resend"[^>]*>Didn't get the email\? Resend<\/a>/.test(login.text),
        "R4 · GET /login carries Join the beta, Forgot your passphrase? and Didn't get the email? Resend"],
      [short.status === 422 && /data-field-error="password"/.test(short.text) && differ.status === 422 && /data-field-error="confirm"/.test(differ.text) && short.text.includes(REQUEST_FIELD_WORDS.password)
        && !short.text.includes("short\"") && !differ.text.includes(PASS) && W.rows().length === 0 && (await W.mails()).length === 0,
        `R4 · a short passphrase (${short.status}) and two that differ (${differ.status}): the form marked on the field, never echoed, nothing written or sent`],
    ];
  },
  async R5() {
    const W = await world();
    const r = await W.join(JOIN);
    const rows = W.rows(), row = rows[0] || {};
    const ms = await W.mails(), m = ms[0] || {};
    const t = W.linkOf(m);
    const life = Date.parse(row.verify_expires || "") - Date.parse(row.created_at || "");
    return [
      [r.status === 303 && r.location === "/account/sent" && r.text === "", `R5 · a join: ${r.status} -> ${r.location}`],
      [rows.length === 1 && row.email === "ada@analytical.test" && row.status === "unverified" && row.verified_at === null && row.pass_salt && row.pass_hash === pbkdf2(PASS, row.pass_salt)
        && t && row.verify_hash === sha(`sharingu-verify:v1:${t}`) && !JSON.stringify(W.q("SELECT * FROM access_requests")).includes(t) && Math.abs(life - 24 * 3600 * 1000) < 5000,
        `R5 · one unverified row: the email lower-cased, the passphrase's pbkdf2 hash and salt, only the link's hash (its token in no row), live 24 hours (${rows.length} rows, ${row.status})`],
      [W.q("SELECT * FROM accounts WHERE email = 'ada@analytical.test'").length === 0, "R5 · no account yet: nothing reads an unverified passphrase"],
      [ms.length === 1 && m.to === "ada@analytical.test" && m.from && m.from.email === "hello@sharingu.xyz" && m.from.name === "sharingu" && m.subject === "Verify your email"
        && m.text.includes(`${W.w.origin}/account/verify/${t}`) && m.html.includes(`href="${W.w.origin}/account/verify/${t}"`) && (m.html.match(/border-bottom-width:3px/g) || []).length === 1
        && (m.html.match(/<img [^>]*src="([^"]+)"/g) || []).every((x) => x.includes(`${W.w.origin}/assets/brand/uchan-mark.png`)) && /Ada Lovelace/.test(m.text) && /24 hours/.test(m.text),
        `R5 · ONE email in the capture From hello@sharingu.xyz: "${m.subject}", the link in its button and as text, its plain-text twin, one orange button, no image but our own`],
    ];
  },
  async R6() {
    const W = await world();
    W.w.db.prepare("INSERT INTO accounts (id, email, pass_hash, pass_salt, created_at, updated_at) VALUES ('acc-held', 'held@one.test', 'h0', 's0', ?, ?)").run(T0, T0);
    const fresh = await W.join({ ...JOIN, email: "new@one.test" });
    const held = await W.join({ ...JOIN, email: "Held@One.test" });
    const trap = await W.join({ ...JOIN, email: "bot@one.test", trap: "http://spam.test" });
    const again = await W.join({ ...JOIN, email: "new@one.test", company: "Second" });
    const viaJson = await W.call("POST", "/request-access", { body: { ...JOIN, email: "json@one.test" } });
    const ms = await W.mails(), by = (to) => ms.filter((m) => m.to === to);
    // the join then a sign-in with the joined passphrase: the same answer for the account's email as for a new one (no enumeration)
    const sNew = await W.call("POST", "/login", { form: { web: "1", email: "new@one.test", password: PASS } }), sHeld = await W.call("POST", "/login", { form: { web: "1", email: "held@one.test", password: PASS } });
    const n0 = (await W.mails()).length;
    await W.call("POST", "/account/resend", { form: { web: "1", email: "held@one.test" } });
    const resentHeld = (await W.mails()).length - n0;
    return [
      [[held, trap, again].every((r) => W.shape(r) === W.shape(fresh)) && fresh.status === 303, `R6 · a new email, an account's, the honeypot and a second join: ONE answer (${[fresh, held, trap, again].map((r) => r.status).join("/")})`],
      [W.q("SELECT status FROM access_requests WHERE email = 'held@one.test'").map((r) => r.status).join() === "unverified" && JSON.stringify(W.q("SELECT pass_hash, pass_salt FROM accounts WHERE id = 'acc-held'")) === JSON.stringify([{ pass_hash: "h0", pass_salt: "s0" }])
        && by("held@one.test").length === 1 && by("held@one.test")[0].subject === "You already have a sharingu account" && /\/login/.test(by("held@one.test")[0].text) && /\/account\/forgot/.test(by("held@one.test")[0].text)
        && !W.linkOf(by("held@one.test")[0]), "R6 · the account's email: its passphrase untouched, one \"you already have an account\" email (sign in, or reset), a request whose link goes to no one"],
      [sNew.status === 403 && W.shape({ ...sHeld, text: sHeld.text.split("held@one.test").join("<e>") }) === W.shape({ ...sNew, text: sNew.text.split("new@one.test").join("<e>") }) && /data-screen="account-sent"/.test(sHeld.text) && resentHeld === 0,
        `R6 · then a sign-in with the joined passphrase answers the same for the account's email as for a new one (${sNew.status} / ${sHeld.status}); a resend for the account's email sends nothing`],
      [W.q("SELECT 1 FROM access_requests WHERE email = 'bot@one.test'").length === 0 && by("bot@one.test").length === 0, "R6 · the honeypot: nothing filed, nothing sent"],
      [W.q("SELECT company FROM access_requests WHERE email = 'new@one.test' AND status = 'unverified' ORDER BY created_at").map((r) => r.company).join() === "Analytical Engines,Second" && by("new@one.test").length === 2
        && W.linkOf(by("new@one.test")[0]) !== W.linkOf(by("new@one.test")[1]), "R6 · a second join is a second unverified request with its own link (the first VERIFIED one stands: R7)"],
      [viaJson.status === 303 && viaJson.location === "/account/sent", `R6 · the JSON door answers the same 303 (${viaJson.status})`],
    ];
  },
  async R7() {
    const W = await world();
    await W.join({ ...JOIN, password: "a-strangers-passphrase", confirm: "a-strangers-passphrase", company: "Stranger" });   // someone else's join for her address
    const stranger = await W.lastLink("ada@analytical.test");
    await W.join(JOIN);
    const t = await W.lastLink("ada@analytical.test");
    const before = JSON.stringify(W.rows());
    const g = await W.call("GET", `/account/verify/${t}`, { nav: true });
    const unchangedByGet = JSON.stringify(W.rows()) === before;
    const a0 = W.one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0").n;
    const wrong = await W.call("POST", "/account/verify", { form: { web: "1", token: t, password: "a-strangers-passphrase" } });
    const afterWrong = W.one("SELECT status FROM access_requests WHERE verify_hash = ?", sha(`sharingu-verify:v1:${t}`)) || {};
    const ok = await W.call("POST", "/account/verify", { form: { web: "1", token: t, password: PASS } });
    const req = W.q("SELECT * FROM access_requests WHERE email = 'ada@analytical.test'");
    const acct = W.one("SELECT * FROM accounts WHERE email = 'ada@analytical.test'") || {};
    const sess = ok.cookie ? W.one("SELECT * FROM account_sessions WHERE token_hash = ?", sha(ok.cookie)) || {} : {};
    const team = (await W.mails()).filter((m) => m.to === "acie@ryuklabs.io");
    const again = await W.call("GET", `/account/verify/${t}`, { nav: true }), againPost = await W.call("POST", "/account/verify", { form: { web: "1", token: t, password: PASS } });
    const other = await W.call("GET", `/account/verify/${stranger}`, { nav: true });
    // an expired link: a fresh join whose end is set in the past
    await W.join({ ...JOIN, email: "late@one.test" });
    const lt = await W.lastLink("late@one.test");
    W.w.db.prepare("UPDATE access_requests SET verify_expires = '2026-01-01T00:00:00.000Z' WHERE email = 'late@one.test'").run();
    const late = await W.call("GET", `/account/verify/${lt}`, { nav: true }), latePost = await W.call("POST", "/account/verify", { form: { web: "1", token: lt, password: PASS } });
    return [
      [g.status === 200 && /data-screen="account-verify"/.test(g.text) && /value="ada@analytical\.test"/.test(g.text) && /name="token" value="[0-9a-f]{48}"/.test(g.text) && unchangedByGet,
        `R7 · the link's GET is the confirm page (its email, the passphrase asked) and changes nothing (${g.status}, rows unchanged ${unchangedByGet})`],
      [wrong.status === 401 && /not the passphrase this request chose/.test(wrong.text) && afterWrong.status === "unverified" && W.one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0").n === a0 + 1,
        `R7 · a wrong passphrase (the stranger's: the mailbox alone proves nothing): ${wrong.status}, still unverified, the attempt counted`],
      [ok.status === 303 && ok.location === "/account" && /^t_a_[0-9a-f]{40}$/.test(ok.cookie) && sess.account_id === acct.id && sess.revoked === 0 && !W.one("SELECT 1 AS x FROM tokens WHERE token_hash = ?", sha(ok.cookie)),
        `R7 · verified: 303 -> ${ok.location}, an ACCOUNT session (its own table, never tokens: ${ok.cookie ? "t_a_<40 hex>" : "none"})`],
      [acct.pass_hash && acct.pass_hash === pbkdf2(PASS, acct.pass_salt) && req.length === 1 && req[0].status === "open" && req[0].verified_at && req[0].pass_hash === null && req[0].pass_salt === null && req[0].verify_hash === null && req[0].company === "Analytical Engines",
        `R7 · one write: the account holds the joined passphrase, the request open (verified ${req[0] && req[0].verified_at}), its hashes cleared, the stranger's join gone (${req.length} request)`],
      [team.length === 1 && team[0].cc === "ryuk@ryuklabs.io" && /Analytical Engines/.test(team[0].text) && /Founder/.test(team[0].text) && /2-10/.test(team[0].text) && !/Ada Lovelace|Lovelace|ada@analytical/i.test(team[0].text + team[0].html + team[0].subject),
        `R7 · the team's ONE email to acie@ cc ryuk@: company, role, team size, never her name or email ("${team[0] && team[0].subject}")`],
      [again.status === 404 && againPost.status === 404 && other.status === 404 && late.status === 404 && latePost.status === 404 && again.text === other.text && other.text === late.text && /data-screen="account-link-dead"/.test(late.text) && /action="\/account\/resend"/.test(late.text)
        && W.one("SELECT status FROM access_requests WHERE email = 'late@one.test'").status === "unverified",
        `R7 · the link again, the stranger's link and an expired one: ONE 404 page with a resend (${[again, againPost, other, late, latePost].map((x) => x.status).join("/")})`],
    ];
  },
  async R8() {
    const W = await world();
    await W.join(JOIN);
    const early = await W.call("POST", "/login", { form: { web: "1", email: "ada@analytical.test", password: PASS } });
    const earlyJ = await W.call("POST", "/login", { body: { email: "ada@analytical.test", password: PASS } });
    const wrong = await W.call("POST", "/login", { form: { web: "1", email: "ada@analytical.test", password: "not-the-passphrase" } });
    const nobody = await W.call("POST", "/login", { form: { web: "1", email: "nobody@one.test", password: "not-the-passphrase" } });
    const t = await W.lastLink("ada@analytical.test");
    await W.call("POST", "/account/verify", { form: { web: "1", token: t, password: PASS } });
    const web = await W.call("POST", "/login", { form: { web: "1", email: "ada@analytical.test", password: PASS } });
    const js = await W.call("POST", "/login", { body: { email: "ada@analytical.test", password: PASS } });
    return [
      [early.status === 403 && /data-screen="account-sent"/.test(early.text) && /id="resend-email"[^>]*value="ada@analytical\.test"/.test(early.text) && !early.cookie && earlyJ.status === 403 && earlyJ.json && earlyJ.json.error === "email_unverified",
        `R8 · before verifying, the joined passphrase: check your inbox and its resend (${early.status}; JSON ${earlyJ.json && earlyJ.json.error}), nothing signed in`],
      [wrong.status === 401 && nobody.status === 401 && wrong.text === nobody.text, `R8 · another passphrase is the one 401 an unknown email gets (${wrong.status}, ${nobody.status})`],
      [web.status === 302 && web.location === "/account" && /^t_a_/.test(web.cookie) && js.status === 403 && js.json && js.json.error === "no_seat_here" && !js.json.token,
        `R8 · verified: a browser's sign-in lands on /account with an account session (${web.status} -> ${web.location}); a script's stays 403 no_seat_here`],
    ];
  },
  async R9() {
    const W = await world();
    await W.join({ ...JOIN, email: "bob@one.test", name: "Bob" });   // Bob asks first and verifies second: the line is by verification
    const v = await W.verified();
    const bob = await W.call("POST", "/account/verify", { form: { web: "1", token: await W.lastLink("bob@one.test"), password: PASS } });
    const bobPage = await W.call("GET", "/account", { cookie: bob.cookie, nav: true });
    const ck = v.cookie, s = W.slug();
    const status = await W.call("GET", "/account", { cookie: ck, nav: true });
    const root = await W.call("GET", "/", { cookie: ck, nav: true });
    const org = await W.call("GET", `/${s}/home`, { cookie: ck, nav: true }), orgJ = await W.call("GET", `/${s}/whoami`, { cookie: ck });
    const mcpC = await W.call("POST", "/mcp", { cookie: ck, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } } });
    const mcpB = await W.call("POST", "/mcp", { key: ck, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } } });
    const who = await W.call("GET", "/whoami", { key: ck }), pick = await W.call("GET", "/orgs", { cookie: ck, nav: true });
    const newOrg = await W.call("GET", "/orgs/new", { cookie: ck, nav: true });
    const create = await W.call("POST", "/orgs", { body: { email: v.email, password: PASS, name: "Analytical Engines", slug: "analytical" } });
    const out = await W.call("GET", "/logout", { cookie: ck, nav: true }), after = await W.call("GET", "/account", { cookie: ck, nav: true });
    return [
      [status.status === 200 && /data-screen="account-in-line"/.test(status.text) && /data-request-place>1</.test(status.text) && /data-beta-count>0 of 50 places taken</.test(status.text)
        && /<li data-step="in-line" aria-current="step">/.test(status.text) && /href="\/logout"[^>]*>Sign out</.test(status.text) && !/href="\/login"[^>]*>Sign in</.test(status.text),
        `R9 · /account: in line, its place, the beta's count, the track, Sign out in the top bar (${status.status})`],
      [/data-request-place>2</.test(bobPage.text) && /Thank you, Bob/.test(bobPage.text), `R9 · Bob, who asked first and verified second, is place ${(/data-request-place>(\d+)</.exec(bobPage.text) || [])[1]}: the line is by verification`],
      [root.status === 302 && root.location === "/account", `R9 · / sends it to /account (${root.status} ${root.location})`],
      [org.status === 302 && /^\/login\?next=/.test(org.location) && orgJ.status === 401 && mcpC.status === 401 && mcpB.status === 401 && who.status === 401 && pick.status === 302 && /^\/login/.test(pick.location),
        `R9 · it signs in nowhere else: an org's address ${org.status} (the sign-in), its JSON ${orgJ.status}, /mcp as a cookie ${mcpC.status} and a bearer ${mcpB.status}, /whoami ${who.status}, the picker ${pick.status}`],
      [newOrg.status === 302 && newOrg.location === "/account" && create.status === 403 && create.json && create.json.error === "org_waiting" && !W.one("SELECT 1 AS x FROM org WHERE slug = 'analytical'"),
        `R9 · before the approval: /orgs/new -> ${newOrg.location}; POST /orgs with its own passphrase ${create.status} ${create.json && create.json.error}, nothing made`],
      [out.status === 302 && W.one("SELECT revoked FROM account_sessions WHERE token_hash = ?", sha(ck)).revoked === 1 && after.status === 302 && /^\/login/.test(after.location), `R9 · /logout ends it (then /account ${after.status})`],
    ];
  },
  async R10() {
    const W = await world();
    const v = await W.verified();
    W.w.db.prepare("UPDATE access_requests SET status = 'approved', approved_at = ?1, updated_at = ?1 WHERE email = ?2").run(new Date().toISOString(), v.email);
    const status = await W.call("GET", "/account", { cookie: v.cookie, nav: true });
    const form = await W.call("GET", "/orgs/new", { cookie: v.cookie, nav: true });
    const val = (f) => (new RegExp(`id="${f}"[^>]*value="([^"]*)"`).exec(form.text) || [])[1];
    const made = await W.call("POST", "/orgs", { cookie: v.cookie, form: { web: "1", email: val("email"), password: PASS, name: val("name"), slug: val("slug"), you: val("you"), product: "Engine", line: "Computes tables", stage: "idea" } });
    const org = W.one("SELECT id, name, slug FROM org WHERE slug = 'analytical-engines'") || {};
    const tok = made.cookie ? W.one("SELECT person_id, org FROM tokens WHERE token_hash = ?", sha(made.cookie)) || {} : {};
    return [
      [status.status === 200 && /data-screen="account-approved"/.test(status.text) && /<a class="primary" href="\/orgs\/new"[^>]*>Create your org</.test(status.text) && /<li data-step="approved" aria-current="step">/.test(status.text),
        `R10 · approved: /account says the place is open, Create your org the one primary (${status.status})`],
      [form.status === 200 && val("email") === v.email && val("name") === "Analytical Engines" && val("you") === "Ada Lovelace" && val("slug") === "analytical-engines" && /id="password"[^>]*autofocus/.test(form.text),
        `R10 · /orgs/new filled in from the request: ${val("email")}, ${val("name")}, ${val("slug")}, ${val("you")}; the passphrase asked again`],
      [made.status === 200 && org.name === "Analytical Engines" && tok.org === org.id && W.one("SELECT revoked FROM account_sessions WHERE token_hash = ?", sha(v.cookie)).revoked === 1,
        `R10 · POST /orgs made the org (${made.status}), signed in its owner seat (org ${tok.org}), and ended the account session`],
    ];
  },
  async R11() {
    const W = await world();
    await W.join(JOIN);
    const t1 = await W.lastLink("ada@analytical.test");
    const r = await W.call("POST", "/account/resend", { form: { web: "1", email: "ADA@analytical.test" } });
    const t2 = await W.lastLink("ada@analytical.test");
    const g1 = await W.call("GET", `/account/verify/${t1}`, { nav: true }), g2 = await W.call("GET", `/account/verify/${t2}`, { nav: true });
    const n0 = (await W.mails()).length;
    const unknown = await W.call("POST", "/account/resend", { form: { web: "1", email: "nobody@one.test" } });
    const n1 = (await W.mails()).length;
    const third = await W.call("POST", "/account/resend", { form: { web: "1", email: "ada@analytical.test" } });   // the third email today
    const t3 = await W.lastLink("ada@analytical.test");
    const fourth = await W.call("POST", "/account/resend", { form: { web: "1", email: "ada@analytical.test" } });
    const g3 = await W.call("GET", `/account/verify/${t3}`, { nav: true });
    const bad = await W.call("POST", "/account/resend", { form: { web: "1", email: "not an email" } });
    return [
      [r.status === 303 && r.location === "/account/sent" && t2 && t2 !== t1 && g1.status === 404 && g2.status === 200, `R11 · a resend: a NEW link (${g2.status}), the old one dead (${g1.status})`],
      [W.shape(unknown) === W.shape(r) && n1 === n0, "R11 · an unknown email: the same 303, nothing sent"],
      [third.status === 303 && t3 !== t2 && W.shape(fourth) === W.shape(r) && (await W.lastLink("ada@analytical.test")) === t3 && g3.status === 200 && (await W.mails()).filter((m) => m.to === "ada@analytical.test").length === 3,
        "R11 · three emails a day to one address, then nothing: the fourth answers the same and sends none, the third's link still works"],
      [bad.status === 422 && /data-screen="account-resend"/.test(bad.text), `R11 · a bad email is the form again (${bad.status})`],
    ];
  },
  async R12() {
    const W = await world();
    const v = await W.verified();
    // an org session too: the account's seat in org 1 (an admin's add-person), signed in by its passphrase
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('one-ada', 'Ada', 'ada@analytical.test', 'member', 'kh', 1, ?, 1)").run(T0);
    const login = await W.call("POST", "/login", { body: { email: v.email, password: PASS } });
    const orgTok = login.json && login.json.token;
    const fa = await W.call("POST", "/account/forgot", { form: { web: "1", email: v.email } }), fn = await W.call("POST", "/account/forgot", { form: { web: "1", email: "nobody@one.test" } });
    const ja = await W.call("POST", "/account/forgot", { body: { email: v.email } }), jn = await W.call("POST", "/account/forgot", { body: { email: "nobody@one.test" } });
    const resets = (await W.mails()).filter((m) => m.subject === "Reset your passphrase");
    const rt = W.linkOf(resets[0], "reset");
    const row = rt ? W.one("SELECT * FROM account_resets WHERE token_hash = ?", sha(`sharingu-reset:v1:${rt}`)) || {} : {};
    const life = Date.parse(row.expires_at || "") - Date.parse(row.created_at || "");
    const g = await W.call("GET", `/account/reset/${rt}`, { nav: true });
    const NEW = "a-brand-new-passphrase";
    const differ = await W.call("POST", "/account/reset", { form: { web: "1", token: rt, password: NEW, confirm: "something-else-entirely" } });
    const set = await W.call("POST", "/account/reset", { form: { web: "1", token: rt, password: NEW, confirm: NEW } });
    const ended = { org: W.one("SELECT revoked FROM tokens WHERE token_hash = ?", sha(orgTok || "-")) || {}, acct: W.one("SELECT revoked FROM account_sessions WHERE token_hash = ?", sha(v.cookie)) || {} };
    const again = await W.call("POST", "/account/reset", { form: { web: "1", token: rt, password: NEW, confirm: NEW } });
    // a second link, expired
    await W.call("POST", "/account/forgot", { form: { web: "1", email: v.email } });
    const rt2 = W.linkOf((await W.mails()).filter((m) => m.subject === "Reset your passphrase").pop(), "reset");
    W.w.db.prepare("UPDATE account_resets SET expires_at = '2026-01-01T00:00:00.000Z' WHERE token_hash = ?").run(sha(`sharingu-reset:v1:${rt2}`));
    const late = await W.call("GET", `/account/reset/${rt2}`, { nav: true });
    const oldPw = await W.call("POST", "/login", { body: { email: v.email, password: PASS } }), newPw = await W.call("POST", "/login", { body: { email: v.email, password: NEW } });
    return [
      [!!orgTok && fa.status === 200 && fa.text === fn.text && /data-screen="account-forgot-sent"/.test(fa.text) && ja.status === 200 && JSON.stringify(ja.json) === JSON.stringify(jn.json) && ja.json.sent === true,
        `R12 · /account/forgot: the same answer for an account's email and an unknown one (form ${fa.status} = ${fn.status}; JSON the same)`],
      [resets.length === 2 && resets.every((m) => m.to === v.email) && rt && row.used_at === null && Math.abs(life - 30 * 60 * 1000) < 5000 && !JSON.stringify(W.q("SELECT * FROM account_resets")).includes(rt),
        `R12 · the account's email gets the links (${resets.length}: the form's and the JSON's), each 30 minutes, only its hash kept`],
      [g.status === 200 && /data-screen="account-reset"/.test(g.text) && differ.status === 422 && /data-screen="account-reset"/.test(differ.text), `R12 · the link's GET is the form (${g.status}); two that differ 422`],
      [set.status === 303 && set.location === "/login" || (set.status === 303 && !!set.cookie), `R12 · set: ${set.status} -> ${set.location}, signed in fresh (${set.cookie ? "a new session" : "none"})`],
      [ended.org.revoked === 1 && ended.acct.revoked === 1, `R12 · EVERY session of the account ended: its org session in org 1 (${ended.org.revoked}), its account session (${ended.acct.revoked})`],
      [again.status === 404 && late.status === 404 && oldPw.status === 401 && newPw.status === 200 && newPw.json && newPw.json.token,
        `R12 · the link once (${again.status}); an expired link ${late.status}; the old passphrase ${oldPw.status}, the new one signs in (${newPw.status})`],
    ];
  },
  async R13() {
    const { REQUEST_PLACE_SQL, APPROVED_PROFILE_SQL } = await mod("requestaccess.js");
    const { betaWords } = await mod("requestpage.js");
    const B = await mod("beta.js");
    const { betaCount, MAY_FOUND_SQL, ACCOUNT_STANDING_SQL } = await mod("accounts.js");
    const W = await world();
    const db = W.w.db;
    const put = (id, at, status = "open") => db.prepare("INSERT INTO access_requests (id, email, name, company, role, team_size, status, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'Founder', '2-10', ?, ?, ?, ?)")
      .run(id, `${id}@line.test`, `Name ${id}`, `Company ${id}`, status, status === "unverified" ? null : at, "2026-10-13T00:00:00.000Z", at);
    put("r-z", "2026-10-13T08:00:00.000Z", "approved"); put("r-y", "2026-10-13T08:30:00.000Z", "declined"); put("r-u", "2026-10-13T08:40:00.000Z", "unverified");
    put("r-0", "2026-10-13T09:00:00.000Z"); put("r-b", "2026-10-13T10:00:00.000Z"); put("r-a", "2026-10-13T10:00:00.000Z"); put("r-c", "2026-10-13T11:00:00.000Z");
    const place = (id) => { const r = db.prepare("SELECT id, verified_at FROM access_requests WHERE id = ?").get(id); return db.prepare(REQUEST_PLACE_SQL).get(r.verified_at, r.id).place; };
    const before = ["r-0", "r-a", "r-b", "r-c"].map(place);
    db.prepare("UPDATE access_requests SET status = 'approved', approved_at = '2026-10-13T12:00:00.000Z' WHERE id = 'r-0'").run();
    const after = ["r-a", "r-c"].map(place);
    const plan = db.prepare("EXPLAIN QUERY PLAN " + REQUEST_PLACE_SQL).all("x", "y").map((r) => r.detail);
    const prefill = db.prepare("EXPLAIN QUERY PLAN " + APPROVED_PROFILE_SQL).all("x").map((r) => r.detail);
    const found = db.prepare("EXPLAIN QUERY PLAN " + MAY_FOUND_SQL).all("x").map((r) => r.detail), standing = db.prepare("EXPLAIN QUERY PLAN " + ACCOUNT_STANDING_SQL).all("a", "x").map((r) => r.detail);
    const noScan = (plan) => !plan.some((d) => /^SCAN (?!CONSTANT ROW)/.test(d)) && plan.some((d) => /^SEARCH \S+ USING (?:COVERING )?INDEX idx_signup_used \(email=\?\)/.test(d));
    const one = (sql) => /^SELECT COUNT\((?:\*|DISTINCT s\.email)\) AS n FROM /.test(sql) && !/;\s*\S/.test(sql);
    for (let id = 2; id <= 5; id++) db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, 'free')").run(id, `Org ${id}`, T0, T0);
    db.prepare("INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES ('c1', 'open@x.test', 'h', ?, '2099-01-01T00:00:00.000Z')").run(T0);
    const worker = await betaCount({ DB: d1(db) }), op = await betaPlaces(d1(db));
    return [
      [before.join(",") === "1,2,3,4" && after.join(",") === "1,3", `R13 · the places by verification: 1,2,3,4 (ties by id; approved, declined, unverified never counted: ${before.join(",")}); after the first's approval ${after.join(",")}`],
      [plan.length === 5 && plan.filter((d) => /^SEARCH access_requests USING (?:COVERING )?INDEX idx_access_requests_line /.test(d)).length === 2 && /COVERING INDEX idx_access_requests_line \(verified_at<\?\)/.test(plan.join("|")) && !plan.some((d) => /^SCAN access_requests/.test(d)),
        `R13 · the place is one statement, its two counts each a SEARCH of the line index, the earlier ones COVERING (${plan.join(" | ")})`],
      [prefill.length === 1 && /^SEARCH access_requests USING INDEX idx_access_requests_email \(email=\? AND status=\?\)$/.test(prefill[0]), `R13 · the org form's prefill is one SEARCH on the email index (${prefill.join(" | ")})`],
      [noScan(found) && noScan(standing), `R13 · may it found an org, and where it stands: signup_codes by idx_signup_used, never a scan (${found.join(" | ")} || ${standing.join(" | ")})`],
      [one(B.BETA_ORGS_SQL) && one(B.BETA_CODES_SQL) && one(B.BETA_APPROVED_SQL) && worker.orgs === 4 && worker.codes === 1 && worker.approved === 2 && worker.taken === 7 && op.taken === worker.taken && op.left === worker.left,
        `R13 · the beta's count: three aggregates; the worker's betaCount is the operator's (${JSON.stringify(worker)}; the two approved requests with no org hold places)`],
      [betaWords({ taken: 7, cap: 50 }) === "7 of 50 places taken" && betaWords({ taken: 50, cap: 50 }) === "All 50 places taken" && betaWords({ taken: 51, cap: 50 }) === "All 50 places taken" && betaWords(null) === "" && betaWords({ taken: -1, cap: 50 }) === "",
        "R13 · betaWords: N of the cap, all taken at or past it, nothing for no count"],
    ];
  },
  async R14() {
    const W = await world();
    const x = { headers: { "sec-fetch-site": "cross-site" } };
    const s0 = JSON.stringify([W.rows(), W.q("SELECT * FROM account_resets"), W.q("SELECT * FROM accounts")]);
    const cross = [await W.join(JOIN, x), await W.call("POST", "/account/verify", { form: { web: "1", token: "ab".repeat(24), password: PASS }, ...x }),
      await W.call("POST", "/account/resend", { form: { web: "1", email: "a@one.test" }, ...x }), await W.call("POST", "/account/forgot", { form: { web: "1", email: "owner@one.test" }, ...x }),
      await W.call("POST", "/account/reset", { form: { web: "1", token: "ab".repeat(24), password: PASS, confirm: PASS }, ...x })];
    W.w.env.LOGIN_LIMIT = { limit: async () => ({ success: false }) };
    const flood = [await W.join(JOIN, { headers: { "cf-connecting-ip": "203.0.113.9" } }), await W.call("POST", "/account/forgot", { form: { web: "1", email: "owner@one.test" }, headers: { "cf-connecting-ip": "203.0.113.9" } })];
    delete W.w.env.LOGIN_LIMIT;
    const nothing = JSON.stringify([W.rows(), W.q("SELECT * FROM account_resets"), W.q("SELECT * FROM accounts")]) === s0 && (await W.mails()).length === 0;
    const bad = await W.join({ ...JOIN, email: "not an email" });
    const under = [await W.call("GET", `/${W.slug()}/request-access`, { nav: true }), await W.call("GET", `/${W.slug()}/account/forgot`, { nav: true })];
    await W.join({ ...JOIN, email: "old@one.test" });
    W.w.db.prepare("UPDATE access_requests SET verify_expires = '2026-01-01T00:00:00.000Z' WHERE email = 'old@one.test'").run();
    await W.join({ ...JOIN, email: "next@one.test" });
    return [
      [cross.every((r) => r.status === 403) && flood.every((r) => r.status === 429) && nothing, `R14 · a cross-site POST to each door ${cross.map((r) => r.status).join("/")}; the flood filter ${flood.map((r) => r.status).join("/")}; nothing written, nothing sent`],
      [bad.status === 422 && /data-field-error="email"/.test(bad.text) && /value="Analytical Engines"/.test(bad.text) && !bad.text.includes(PASS), `R14 · a bad email: the form again naming it, its values kept but the passphrase (${bad.status})`],
      [under.every((r) => r.status === 404 && !/name="trap"|data-screen="account-forgot"/.test(r.text)), `R14 · under an org's address the doors are not there (${under.map((r) => r.status).join("/")})`],
      [W.q("SELECT 1 FROM access_requests WHERE email = 'old@one.test'").length === 0 && W.q("SELECT 1 FROM access_requests WHERE email = 'next@one.test'").length === 1, "R14 · the next join deleted the expired unverified request (the cleanup on write)"],
    ];
  },
  async R15() {
    const { MAIL_CAP, windowStartOf } = await mod("email.js");
    const W = await world();
    W.w.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?)").run(windowStartOf(new Date().toISOString()), MAIL_CAP);
    const ref = await (await world()).join(JOIN);   // the answer under the cap, from a world with room
    const a = await W.join(JOIN), b = await W.join({ ...JOIN, email: "b@one.test" }), f = await W.call("POST", "/account/forgot", { form: { web: "1", email: "owner@one.test" } });
    const sent = await W.call("GET", "/account/sent", { nav: true });
    const ms = await W.mails();
    return [
      [W.shape(a) === W.shape(ref) && W.shape(b) === W.shape(ref) && W.rows().length === 0 && !ms.some((m) => m.to !== "acie@ryuklabs.io"),
        `R15 · at the cap a join answers the same 303, files nothing and sends the person nothing (${a.status}, ${W.rows().length} rows)`],
      [sent.status === 200 && /data-screen="account-paused"/.test(sent.text) && /Email checks are paused/.test(sent.text) && /Try again in a few days/.test(sent.text)
        && !/data-region="google"/.test(sent.text) && /data-screen="account-paused"/.test(f.text),
        `R15 · /account/sent and the forgot answer say email checks are paused; no Google client stored: no button, try again later (${sent.status})`],
      [ms.length === 1 && ms[0].to === "acie@ryuklabs.io" && ms[0].cc === "ryuk@ryuklabs.io" && /paused/i.test(ms[0].subject) && Number(W.one("SELECT n FROM mail_days WHERE day = ?", windowStartOf(new Date().toISOString())).n) === MAIL_CAP,
        `R15 · the team's cap alert captured ONCE for three refusals (${ms.length}); the count unmoved`],
    ];
  },
  async R16() {
    const A = await mod("accounts.js");
    const W = await world();
    const acct = (e) => W.one("SELECT id, pass_hash, invited_org, google_sub FROM accounts WHERE email = ?", e) || {};
    const by = async (to) => (await W.mails()).filter((m) => m.to === to);
    const ALREADY = "You already have a sharingu account";
    // THE SEAT HOLDER: the world's org owner — an active owner seat, its account with no passphrase, no subject, no mark (it signs in
    // by the seat's own secret), the live owner's shape
    const OWNER = "owner@one.test", o0 = acct(OWNER);
    const fresh = await W.join({ ...JOIN, email: "someone-new@one.test" });
    const held = await W.join({ ...JOIN, email: OWNER });
    const oMails = await by(OWNER);
    const n0 = (await W.mails()).length;
    await W.call("POST", "/account/resend", { form: { web: "1", email: OWNER } });
    const resent = (await W.mails()).length - n0;
    // AN OLD LIVE LINK (filed under the old rule, as the live owner's one unverified request is): the join's request given a live token
    const T = "ab".repeat(24), H = sha(`sharingu-verify:v1:${T}`);
    W.w.db.prepare("UPDATE access_requests SET verify_hash = ? WHERE email = ? AND status = 'unverified'").run(H, OWNER);
    const oldReq = W.one("SELECT id FROM access_requests WHERE email = ?", OWNER);
    const oldGet = await W.call("GET", `/account/verify/${T}`, { nav: true });
    const oldPost = await W.call("POST", "/account/verify", { form: { web: "1", token: T, password: PASS } });
    const afterOld = { a: acct(OWNER), reqs: W.q("SELECT status FROM access_requests WHERE email = ?", OWNER).map((r) => r.status).join(),
      sessions: W.one("SELECT COUNT(*) AS n FROM account_sessions WHERE account_id = ?", o0.id).n };
    // the batch's own guards, read directly (each a defense behind the open link's): the spend refuses a held email; the account's
    // upsert never sets a held account's passphrase even under a spent request
    const at = new Date().toISOString();
    const spend = W.w.db.prepare(A.VERIFY_SPEND_SQL).run(at, oldReq.id, H).changes;
    // Google's join takes no held account either (GOOGLE_JOIN_ACCOUNT_SQL's upsert, read directly: the seated shell keeps no subject)
    const gjoin = W.w.db.prepare(A.GOOGLE_JOIN_ACCOUNT_SQL).run("acc-gjoin", OWNER, null, null, "sub-squat", at).changes;
    const afterGJoin = acct(OWNER);
    // FORGOT -> RESET -> SIGN IN: the seat holder sets a passphrase by the "already" email's advice; it lands in its seat
    await W.call("POST", "/account/forgot", { form: { web: "1", email: OWNER } });
    const rt = await W.lastLink(OWNER, "reset");
    const NEW = "the-owner-sets-a-passphrase";
    const reset = await W.call("POST", "/account/reset", { form: { web: "1", token: rt, password: NEW, confirm: NEW } });
    const oSet = acct(OWNER), oWait = W.one("SELECT active, pending FROM people WHERE id = 'one-owner'");
    // THE FIRST PASSPHRASE WAITS: the reset made the owner seat wait; the picker names the org with the reset's words; accepted there
    const picker = await W.call("GET", "/orgs?seat=reset", { cookie: reset.cookie, nav: true });
    const accept = await W.call("POST", "/orgs/seat", { form: { seat: "one-owner", answer: "accept" }, cookie: reset.cookie });
    const login = await W.call("POST", "/login", { body: { email: OWNER, password: NEW } });
    const seatOf = login.json && login.json.token ? (W.one("SELECT person_id FROM tokens WHERE token_hash = ?", sha(login.json.token)) || {}).person_id : null;
    // A SHELL NO ONE HOLDS (seated once, its seat gone): forgot sends nothing; it joins as new, and its verification sets the passphrase
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('gone', 'Gone', 'gone@one.test', 'member', 'kh-gone', 1, ?, 1)").run(T0);
    W.w.db.prepare("UPDATE people SET active = 0 WHERE id = 'gone'").run();
    const g0 = acct("gone@one.test");
    await W.call("POST", "/account/forgot", { form: { web: "1", email: "gone@one.test" } });
    const goneForgot = (await by("gone@one.test")).length;
    const gv = await W.verified({ email: "gone@one.test" });
    const gMails = await by("gone@one.test"), g1 = acct("gone@one.test");
    // A WAITING SEAT holds the account; so does an invite mark (the clause read alone: an account the mark alone holds)
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, pending, created_at, org) VALUES ('waits', 'Waits', 'waits@one.test', 'member', 'kh-waits', 0, 1, ?, 1)").run(T0);
    W.w.db.prepare("INSERT INTO accounts (id, email, invited_org, created_at, updated_at) VALUES ('acc-marked', 'marked@one.test', 1, ?, ?)").run(T0, T0);
    await W.join({ ...JOIN, email: "waits@one.test" });
    await W.join({ ...JOIN, email: "marked@one.test" });
    const wMails = await by("waits@one.test"), mMails = await by("marked@one.test");
    // the waiting seat's holder resets too: the passphrase set, the seat still waiting, the session anchored there (the picker)
    await W.call("POST", "/account/forgot", { form: { web: "1", email: "waits@one.test" } });
    const wt = await W.lastLink("waits@one.test", "reset");
    const wReset = await W.call("POST", "/account/reset", { form: { web: "1", token: wt, password: NEW, confirm: NEW } });
    const wSeat = W.one("SELECT active, pending FROM people WHERE id = 'waits'"), wAcct = acct("waits@one.test");
    // the account's upsert under a spent request (a request made 'open' by hand, as a spend that slipped through would leave it): a
    // held account keeps its NULL passphrase
    W.w.db.prepare("INSERT INTO access_requests (id, email, name, company, role, team_size, status, verified_at, created_at, updated_at) VALUES ('slipped', 'marked@one.test', 'M', 'C', 'Founder', '2-10', 'open', ?, ?, ?)").run(at, at, at);
    W.w.db.prepare(A.VERIFY_ACCOUNT_SQL).run("acc-new-id", "marked@one.test", "h-slipped", "s-slipped", at, "slipped");
    const marked = acct("marked@one.test");
    return [
      [!o0.pass_hash && !o0.google_sub && !o0.invited_org && W.shape(held) === W.shape(fresh),
        `R16 · the seat holder (an owner seat, no passphrase, no subject): its join answers the same 303 as a new email's (${held.status})`],
      [oMails.length === 1 && oMails[0].subject === ALREADY && !W.linkOf(oMails[0]) && oMails[0].text.includes("If an org gave you a seat, that seat is your account") && oMails[0].html.includes("If an org gave you a seat") && resent === 0 && W.q("SELECT status FROM access_requests WHERE email = ?", OWNER).map((r) => r.status).join() === "unverified",
        `R16 · it gets "you already have an account", no link (${oMails.map((m) => m.subject).join(" | ")}); its request unverified, its link sent to no one; a resend sends nothing (${resent})`],
      [oldGet.status === 404 && oldPost.status === 404 && !oldPost.cookie && !afterOld.a.pass_hash && afterOld.reqs === "unverified" && Number(afterOld.sessions) === 0,
        `R16 · an OLD live link for it opens nothing: GET ${oldGet.status}, POST ${oldPost.status} (the dead page), its passphrase still none, no session, the request not in line (${afterOld.reqs})`],
      [spend === 0, `R16 · the verification's spend refuses a held email inside the batch too (${spend} changed)`],
      [gjoin === 0 && afterGJoin.google_sub === null && afterGJoin.id === o0.id, `R16 · Google's join upsert takes no seated shell (${gjoin} changed, subject ${afterGJoin.google_sub})`],
      [!!rt && reset.status === 303 && !!reset.cookie && reset.location === "/orgs?seat=reset" && !!oSet.pass_hash && oSet.id === o0.id && oWait.active === 0 && oWait.pending === 1,
        `R16 · forgot gives the seat holder a reset; the reset sets its FIRST passphrase, so its owner seat waits: the picker (${reset.status} -> ${reset.location})`],
      [picker.status === 200 && picker.text.includes("Passphrase set. Your seats wait for your yes") && picker.text.includes(`data-pending="${W.slug()}"`) && accept.status === 303 && accept.location === "/orgs?seat=accepted",
        `R16 · the picker says what happens next and names the org (${picker.status}); accepted there (${accept.status} -> ${accept.location})`],
      [login.status === 200 && seatOf === "one-owner" && login.json.role === "owner",
        `R16 · then the new passphrase signs in to the owner seat (${login.status}, ${seatOf})`],
      [!!g0.id && !g0.pass_hash && goneForgot === 0 && gMails.length === 1 && /Verify your email/.test(gMails[0].subject) && gv.answer.status === 303 && g1.id === g0.id && !!g1.pass_hash
        && W.one("SELECT status FROM access_requests WHERE email = 'gone@one.test'").status === "open",
        `R16 · a shell no one holds (its seat gone): forgot sends nothing (${goneForgot}); it joins as new (${gMails.map((m) => m.subject).join(" | ")}), its verification sets the shell's passphrase, its request in line`],
      [wMails.length === 1 && wMails[0].subject === ALREADY && mMails.length === 1 && mMails[0].subject === ALREADY,
        `R16 · a waiting seat holds the account, and so does an invite mark: each join gets "you already have an account" (${wMails.length}, ${mMails.length})`],
      [!!wt && wReset.status === 303 && wReset.location === "/orgs" && !!wAcct.pass_hash && wSeat.active === 0 && wSeat.pending === 1,
        `R16 · the waiting seat's holder resets: the passphrase set, the seat still waiting for its yes, the picker (${wReset.status} -> ${wReset.location})`],
      [marked.id === "acc-marked" && !marked.pass_hash, `R16 · the verification's account upsert never sets a held account's passphrase, even under a spent request (${marked.pass_hash})`],
    ];
  },
  async R17() {
    const A = await mod("accounts.js");
    const W = await world();
    const NEW = "a-first-passphrase-of-mine";
    const seatRow = (id) => W.one("SELECT active, pending FROM people WHERE id = ?", id) || {};
    const acct = (e) => W.one("SELECT id, pass_hash, invited_org, google_sub FROM accounts WHERE email = ?", e) || {};
    const seat = (id, email, { active = 1, pending = 0 } = {}) =>
      W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, pending, created_at, org) VALUES (?, ?, ?, 'member', ?, ?, ?, ?, 1)").run(id, id, email, "kh-" + id, active, pending, T0);
    const reset = async (email) => {
      await W.call("POST", "/account/forgot", { form: { web: "1", email } });
      const t = await W.lastLink(email, "reset");
      return W.call("POST", "/account/reset", { form: { web: "1", token: t, password: NEW, confirm: NEW } });
    };
    // the shapes, each its own account: (a) seated, no passphrase · (b) an invite's passphrase and mark · (c) its own passphrase ·
    // (d) a waiting seat only · (e) a Google subject, no passphrase
    seat("s-none", "none@one.test");
    seat("s-inv", "inv@one.test"); W.w.db.prepare("UPDATE accounts SET pass_hash = 'hi', pass_salt = 'si', invited_org = 1 WHERE email = 'inv@one.test'").run();
    seat("s-own", "own@one.test"); W.w.db.prepare("UPDATE accounts SET pass_hash = 'ho', pass_salt = 'so' WHERE email = 'own@one.test'").run();
    seat("s-pend", "pend@one.test", { active: 0, pending: 1 });
    seat("s-goo", "goo@one.test"); W.w.db.prepare("UPDATE accounts SET google_sub = 'sub-goo' WHERE email = 'goo@one.test'").run();
    const a = await reset("none@one.test"), b = await reset("inv@one.test"), c = await reset("own@one.test"), d = await reset("pend@one.test"), e = await reset("goo@one.test");
    const slug = "/" + W.slug();
    // the statement read directly: an archived seat is never revived, and nothing moves without THIS reset's spend
    const at = new Date().toISOString();
    seat("s-arch", "arch@one.test", { active: 0, pending: 0 });
    const archId = acct("arch@one.test").id;
    W.w.db.prepare("INSERT INTO account_resets (token_hash, account_id, created_at, expires_at, used_at) VALUES ('th-arch', ?, ?, ?, ?)").run(archId, at, at, at);
    W.w.db.prepare(A.RESET_SEATS_WAIT_SQL).run(archId, at, "th-arch");
    seat("s-unspent", "unspent@one.test");
    const unspent = W.w.db.prepare(A.RESET_SEATS_WAIT_SQL).run(acct("unspent@one.test").id, at, "th-never-spent").changes;
    return [
      [a.status === 303 && a.location === "/orgs?seat=reset" && seatRow("s-none").active === 0 && seatRow("s-none").pending === 1 && !!acct("none@one.test").pass_hash,
        `R17 · (a) seated, no passphrase: the reset's first passphrase makes the seat WAIT; the picker (${a.status} -> ${a.location})`],
      [b.status === 303 && b.location === "/orgs?seat=reset" && seatRow("s-inv").pending === 1 && seatRow("s-inv").active === 0 && acct("inv@one.test").invited_org === null && acct("inv@one.test").pass_hash !== "hi",
        `R17 · (b) an invite's passphrase: the seat waits, the mark cleared, the passphrase the holder's own (${b.status} -> ${b.location})`],
      [c.status === 303 && c.location === slug && seatRow("s-own").active === 1 && seatRow("s-own").pending === 0,
        `R17 · (c) its own passphrase before: unchanged, the seat active, its org (${c.status} -> ${c.location})`],
      [d.status === 303 && d.location === "/orgs" && seatRow("s-pend").active === 0 && seatRow("s-pend").pending === 1,
        `R17 · (d) a waiting seat only: unchanged, still waiting, the picker with no reset words (${d.status} -> ${d.location})`],
      [e.status === 303 && e.location === slug && seatRow("s-goo").active === 1 && acct("goo@one.test").google_sub === null,
        `R17 · (e) Google-linked, no passphrase: unchanged, the seat active, its org; the reset unlinks the subject (${e.status} -> ${e.location})`],
      [seatRow("s-arch").active === 0 && seatRow("s-arch").pending === 0 && unspent === 0 && seatRow("s-unspent").active === 1,
        `R17 · the wait never revives an archived seat, and moves nothing without this reset's spend (${unspent} changed)`],
    ];
  },
  async R18() {
    const { EVAL_SEAT_PREFIX } = await mod("util.js");
    const W = await world();
    const NEW = "a-first-passphrase-of-mine";
    const row = (id) => W.one("SELECT active, pending FROM people WHERE id = ?", id) || {};
    const reset = async (email) => {
      await W.call("POST", "/account/forgot", { form: { web: "1", email } });
      const t = await W.lastLink(email, "reset");
      return (await W.call("POST", "/account/reset", { form: { web: "1", token: t, password: NEW, confirm: NEW } })).cookie;
    };
    const decline = (cookie, seat) => W.call("POST", "/orgs/seat", { form: { seat, answer: "decline" }, cookie });
    // THE DECLINE GUARD: the org's only real owner, its seat waiting after its first passphrase (R16's shape)
    const c1 = await reset("owner@one.test");
    const json1 = await W.call("POST", "/orgs/seat", { body: { seat: "one-owner", answer: "decline" }, cookie: c1 });
    const form1 = await decline(c1, "one-owner");
    const page1 = await W.call("GET", "/orgs?seat=only_owner", { cookie: c1, nav: true });
    const kept1 = row("one-owner");
    // an eval seat is no real owner: still refused
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES (?, 'Eval Owner', 'eval-owner@one.test', 'owner', 'kh-eval', 1, ?, 1)").run(EVAL_SEAT_PREFIX + "owner", T0);
    const form2 = await decline(c1, "one-owner"), kept2 = row("one-owner");
    // a member's Decline works as before
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('mem', 'Mem', 'mem@one.test', 'member', 'kh-mem', 1, ?, 1)").run(T0);
    const cm = await reset("mem@one.test");
    const memWaited = row("mem").pending === 1;
    const formM = await decline(cm, "mem"), memAfter = row("mem");
    // an owner's Decline while ANOTHER real owner is active in the org works
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('co-owner', 'Co Owner', 'co@one.test', 'owner', 'kh-co', 1, ?, 1)").run(T0);
    const form3 = await decline(c1, "one-owner"), after3 = row("one-owner");
    return [
      [json1.status === 409 && json1.json && json1.json.error === "only_owner" && form1.status === 303 && form1.location === "/orgs?seat=only_owner" && kept1.active === 0 && kept1.pending === 1,
        `R18 · the org's ONLY owner cannot decline its waiting seat: JSON ${json1.status} ${json1.json && json1.json.error}, the form -> ${form1.location}; the seat still waits`],
      [page1.status === 200 && /only owner: accept it, or leave it waiting/.test(page1.text),
        `R18 · the picker says so in plain words (${page1.status})`],
      [form2.location === "/orgs?seat=only_owner" && kept2.pending === 1, `R18 · an eval seat is no real owner: still refused (${form2.location})`],
      [memWaited && formM.status === 303 && formM.location === "/orgs?seat=declined" && memAfter.active === 0 && memAfter.pending === 0,
        `R18 · a member's waiting seat declines as before (${formM.location})`],
      [form3.status === 303 && form3.location === "/orgs?seat=declined" && after3.active === 0 && after3.pending === 0,
        `R18 · an owner's Decline while another real owner is active works (${form3.location})`],
    ];
  },
  async R19() {
    const W = await world();
    const NEW = "a-first-passphrase-of-mine";
    await W.call("POST", "/account/forgot", { form: { web: "1", email: "owner@one.test" } });
    const t = await W.lastLink("owner@one.test", "reset");
    await W.call("POST", "/account/reset", { form: { web: "1", token: t, password: NEW, confirm: NEW } });
    // the owner seat waits (R16); a browser's sign-in whose next names that very org lands on the picker, never the org's page
    const next = `/${W.slug()}/home`;
    const web = await W.call("POST", "/login", { form: { web: "1", email: "owner@one.test", password: NEW, next } });
    return [
      [web.status === 302 && web.location === "/orgs" && W.one("SELECT pending FROM people WHERE id = 'one-owner'").pending === 1,
        `R19 · a waiting seat's sign-in with next ${next} lands on the picker (${web.status} -> ${web.location})`],
    ];
  },
};

// ---- the mutants: each must turn its case(s) red ----
const MUTANTS = [
  { name: "the honeypot ignored", file: "src/index.js",
    from: "if (!trapped(body)) await afterAnswer(c, () => joinMail(", to: "await afterAnswer(c, () => joinMail(", red: ["R6"] },
  { name: "an account's email files nothing (a join then a sign-in tells which emails hold an account)", file: "src/index.js",
    from: "    await fileRequest(env, r, { pass, tokenHash: await verifyTokenHash(held ? newLinkToken() : token), consent, source });", to: "    if (!held) await fileRequest(env, r, { pass, tokenHash: await verifyTokenHash(token), consent, source });", red: ["R6"] },
  { name: "an account's email sent a verification link", file: "src/index.js",
    from: "    return held ? alreadyMail({ origin }) : verifyMail(", to: "    return verifyMail(", red: ["R6"] },
  { name: "the verification without the passphrase (the mailbox alone)", file: "src/accounts.js",
    from: "  if (!(await secretMatches(password, row))) { await countSignIn(env, out, false); return { verdict: \"wrong\" }; }\n", to: "", red: ["R7"] },
  { name: "an expired link still opens", file: "src/accounts.js",
    from: "FROM access_requests WHERE verify_hash = ?1 AND status = 'unverified' AND verify_expires > ?2 \" +", to: "FROM access_requests WHERE verify_hash = ?1 AND status = 'unverified' AND ?2 IS NOT NULL \" +", red: ["R7"] },
  { name: "the email's other joins kept", file: "src/accounts.js",
    from: "    db(env).prepare(VERIFY_DROP_OTHERS_SQL).bind(out.email, row.id, at),\n", to: "", red: ["R7"] },
  { name: "the team's email naming the person", file: "src/mails.js",
    from: "  facts: [[\"Company\", request.company],", to: "  facts: [[\"Name\", request.name], [\"Email\", request.email], [\"Company\", request.company],", red: ["R7"] },
  { name: "an unverified join's passphrase never compared (the sign-in says nothing)", file: "src/accounts.js",
    from: "    return { ...out, verdict: ok ? \"unverified\" : \"wrong\" };", to: "    return { ...out, verdict: \"wrong\" };", red: ["R8"] },
  { name: "the account session read as an org session (minted in tokens)", file: "src/accounts.js",
    from: "export const isAccountSessionToken = (t) => String(t == null ? \"\" : t).startsWith(ACCOUNT_SESSION_PREFIX);", to: "export const isAccountSessionToken = () => false;", red: ["R9"] },
  { name: "org creation ignores the approval", file: "src/accounts.js",
    from: "  if (ok && account.invited_org == null && !(await mayFound(env, e))) return { ...out, verdict: \"waiting\" };\n", to: "", red: ["R9"] },
  { name: "the resend replacing the link before the email may go", file: "src/email.js",
    from: "    if (addr && !changed(res[2])) return { sent: false, reason: \"address_limit\" };", to: "    if (addr && !changed(res[2])) { await build(); return { sent: false, reason: \"address_limit\" }; }", red: ["R11"] },
  { name: "the reset leaving the org sessions", file: "src/accounts.js",
    from: "    db(env).prepare(RESET_END_TOKENS_SQL).bind(id, at, th),\n", to: "", red: ["R12"] },
  { name: "the forgot answer telling which emails hold an account", file: "src/index.js",
    from: "      if (!isWeb) return json({ sent: true, note:", to: "      if (!isWeb) return json({ sent: await accountHolds(env, e), note:", red: ["R12"] },
  { name: "the place by the request's filing, not its verification", file: "src/requestaccess.js",
    from: "  const row = await db(env).prepare(REQUEST_PLACE_SQL).bind(String(r.verified_at), String(r.id)).first();", to: "  const row = await db(env).prepare(REQUEST_PLACE_SQL).bind(String(r.created_at || \"\"), String(r.id)).first();", red: ["R9"] },
  { name: "the verify door without the same-origin guard", file: "src/index.js",
    from: "if (crossSiteLogin(request, url)) return isForm ? accountPage(renderLinkDead({ brand }), 403) : json({ error: \"cross_site_verify\" }, 403);", to: "", red: ["R14"] },
  { name: "the cleanup on write left out", file: "src/requestaccess.js",
    from: "    db(env).prepare(REQUEST_CLEANUP_SQL).bind(at),\n", to: "", red: ["R14"] },
  { name: "the cap's alert every refusal", file: "src/email.js",
    from: "  if (!changed(await db(env).prepare(MAIL_ALERT_SQL).bind(dayOf(at)).run())) return;", to: "  await db(env).prepare(MAIL_ALERT_SQL).bind(dayOf(at)).run();", red: ["R15"] },
  { name: "the count past the cap said as it is", file: "src/requestpage.js",
    from: "return taken >= cap ? `All ${cap} places taken` : `${taken} of ${cap} places taken`;", to: "return `${taken} of ${cap} places taken`;", red: ["R13"] },
  { name: "the approved requests holding no place", file: "src/beta.js",
    from: "WHERE r.status = 'approved' AND r.cleared_at IS NULL AND (?2 IS NULL OR r.email <> ?2) ", to: "WHERE r.status = 'never' AND r.cleared_at IS NULL AND (?2 IS NULL OR r.email <> ?2) ", red: ["R13"] },
  // THE FIRST PASSPHRASE WAITS (R16, R17): the statement, each clause of its test, and its guards
  { name: "a first-passphrase reset enters the seats silently (no wait)", file: "src/accounts.js",
    from: "    db(env).prepare(RESET_SEATS_WAIT_SQL).bind(id, at, th),\n", to: "", red: ["R16", "R17"] },
  { name: "a passphrase-less account's reset not a first passphrase", file: "src/accounts.js",
    from: "(${u}.pass_hash IS NULL OR ${u}.invited_org IS NOT NULL)`;", to: "${u}.invited_org IS NOT NULL`;", red: ["R17"] },
  { name: "an invite's passphrase taken as the holder's own", file: "src/accounts.js",
    from: "(${u}.pass_hash IS NULL OR ${u}.invited_org IS NOT NULL)`;", to: "${u}.pass_hash IS NULL`;", red: ["R17"] },
  { name: "a Google-linked account's seats made to wait", file: "src/accounts.js",
    from: "`${u}.google_sub IS NULL AND (${u}.pass_hash IS NULL", to: "`(${u}.pass_hash IS NULL", red: ["R17"] },
  { name: "the wait revives an archived seat", file: "src/accounts.js",
    from: "WHERE account_id = ?1 AND active = 1 \" +\n  `AND EXISTS (SELECT 1 FROM accounts u WHERE u.id = ?1 AND ${FIRST_PASSPHRASE(\"u\")}) AND ${RESET_SPENT}`;",
    to: "WHERE account_id = ?1 \" +\n  `AND EXISTS (SELECT 1 FROM accounts u WHERE u.id = ?1 AND ${FIRST_PASSPHRASE(\"u\")}) AND ${RESET_SPENT}`;", red: ["R17"] },
  { name: "the wait without the reset's spend", file: "src/accounts.js",
    from: "${FIRST_PASSPHRASE(\"u\")}) AND ${RESET_SPENT}`;", to: "${FIRST_PASSPHRASE(\"u\")}) AND ?2 IS NOT NULL AND ?3 IS NOT NULL`;", red: ["R17"] },
  { name: "Google's join takes a held account", file: "src/accounts.js",
    from: "  `WHERE NOT ${ACCOUNT_HELD(\"accounts\")}`;\n// the account THIS batch", to: "  `WHERE 1 = 1`;\n// the account THIS batch", red: ["R16"] },
  { name: "the resend blind to a held account", file: "src/index.js",
    from: "  if (!join || await accountHolds(env, email)) return null;", to: "  if (!join) return null;", red: ["R16"] },
  // THE DECLINE GUARD (R18)
  { name: "the only owner's Decline taken (no guard)", file: "src/accounts.js",
    from: "INVITED_ELSEWHERE + \" AND \" + ANOTHER_REAL_OWNER;", to: "INVITED_ELSEWHERE;", red: ["R18"] },
  { name: "an eval seat counted as another real owner", file: "src/accounts.js",
    from: "o.id <> people.id\" + NOT_EVAL_SEAT_SQL(\"o.id\") + \"))\";", to: "o.id <> people.id))\";", red: ["R18"] },
  { name: "the landing sends a waiting seat to its org's page", file: "src/index.js",
    from: "signin.seat && !signin.pendingOnly && Number(signin.seat.org)", to: "signin.seat && Number(signin.seat.org)", red: ["R19"] },
  // THE ONE RULE (R16): each clause of ACCOUNT_HELD, and each guard of the verification that reads it
  { name: "the old rule: a seat holds no account (a seat holder with no passphrase joins as new)", file: "src/accounts.js",
    from: "${a}.invited_org IS NOT NULL ` +\n  `OR EXISTS (SELECT 1 FROM people hp WHERE hp.account_id = ${a}.id AND (hp.active = 1 OR hp.pending = 1)))`;", to: "${a}.invited_org IS NOT NULL)`;", red: ["R16"] },
  { name: "a waiting seat holds no account", file: "src/accounts.js",
    from: "hp.account_id = ${a}.id AND (hp.active = 1 OR hp.pending = 1)))`;", to: "hp.account_id = ${a}.id AND hp.active = 1))`;", red: ["R16"] },
  { name: "an invite mark holds no account", file: "src/accounts.js",
    from: "${a}.google_sub IS NOT NULL OR ${a}.invited_org IS NOT NULL ` +", to: "${a}.google_sub IS NOT NULL ` +", red: ["R16"] },
  { name: "every account held (a shell no one holds could never join)", file: "src/accounts.js",
    from: "  return !!(r && Number(r.held) === 1);", to: "  return !!r;", red: ["R16"] },
  { name: "a held email's link opens", file: "src/accounts.js",
    from: "verify_expires > ?2 \" +\n  `AND NOT ${EMAIL_HELD(\"access_requests.email\")}`;", to: "verify_expires > ?2\";", red: ["R16"] },
  { name: "the verification's spend blind to a held email", file: "src/accounts.js",
    from: "v.status <> 'unverified') \" +\n  `AND NOT ${EMAIL_HELD(\"access_requests.email\")}`;", to: "v.status <> 'unverified')\";", red: ["R16"] },
  { name: "the verification's upsert sets a held account's passphrase", file: "src/accounts.js",
    from: "updated_at = excluded.updated_at WHERE NOT ${ACCOUNT_HELD(\"accounts\")}`;\n// 3 ·", to: "updated_at = excluded.updated_at`;\n// 3 ·", red: ["R16"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".request-access-mutation-"));
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
console.log(`${failed ? "✗" : "✓"} request-access selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
