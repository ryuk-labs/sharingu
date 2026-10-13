// tools/request-access-selftest.mjs — sprint 21, slice 21.1 (migrate-081; src/requestaccess.js, src/requestpage.js, POST and GET
// /request-access, GET /request-access/<token>; src/beta.js and src/accounts.js betaCount): request access, the pure reading of a
// profile and the door through the REAL worker (src/index.js over node:sqlite built from boot.sql, tools/fixtures/sqlite-worker.mjs).
//   R1 · a full profile reads, each field normalised: the email lower-cased, the text folded, the website's bare domain an https
//        address, the LinkedIn handle, the X @handle (and a twitter.com address) and the GitHub address each the service's own
//        address; the optional fields left empty read as none
//   R2 · each required field missing (name, email, company, role, team size) is named; a team size outside the five; an email
//        with no @, with a space, outside plain ASCII; a field past its length
//   R3 · the addresses, strictly: javascript:, data:, ftp:, a user and password, a host with no dot are no website; an X, LinkedIn
//        or GitHub value on another host or of another shape is refused; a LinkedIn company page is kept as one
//   R4 · the pages: GET /request-access is the form (each field, required and optional apart, the honeypot out of sight); GET
//        /login carries the one way to it
//   R5 · a full request by form: 303 to /request-access/<48 hex>; ONE open row, its email lower-cased, only the link's hash kept
//        (the token in no row); the link's page names the person and the company
//   R6 · THE FIRST REQUEST STANDS (the owner's ruling, 2026-10-13): a repeat for the same email (another case, another profile) is
//        a 303 to /request-access/asked, a page that says the email asked and names nothing typed; the row unchanged; the first
//        link still opens it; two at once make one row, the second the repeat
//   R7 · an email that already holds an account: the same answer's shape, a row, the account untouched; the JSON door answers the
//        same 303
//   R8 · the honeypot filled: the same answer's shape, NO row, its link the 404
//   R9 · the refusals, nothing written: a bad email 422 naming the field (a form: the page with its words and the values kept; JSON
//        bad_request_access {field}); a cross-site form 403; the address's flood filter 429; a wrong and a malformed token one
//        404 page; the door under an org's address is not there (the platform's root only)
//   R10 · the beta count: BETA_ORGS_SQL and BETA_CODES_SQL are each ONE aggregate (SELECT COUNT), and the worker's betaCount answers
//        what the operator's betaPlaces answers over the same database ({cap 50, taken, left})
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red, by an assertion, never a crash.
// Exit 1 on any failure. A gate step.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, d1 } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { betaPlaces } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const T0 = "2026-10-01T00:00:00.000Z";

let MUT = {};
const mod = (f) => import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), f)).href);

const FULL = { name: "  Ada   Lovelace ", email: " Ada@Analytical.Test ", company: "Analytical Engines", role: "Founder", team_size: "2-10",
  website: "analytical.test/about", linkedin: "ada-lovelace", x: "@ada", github: "https://github.com/ada-l/", ai_tools: "Claude,\n ChatGPT", use_case: "Share what\tour AI learns." };

async function world() {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [["one-owner", "Owner One", "owner", "one-owner-key", [], "owner@one.test"]] });
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  const call = async (method, path, { body, form, headers: extra = {} } = {}) => {
    const headers = { accept: form ? "text/html" : "application/json", ...extra };
    let payload;
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    // an exception the worker lets out reads as the runtime answers it, a 500 (a mutant's broken write is a red assertion, not a crash)
    let r;
    try { r = await w.fetch(new Request(w.origin + path, { method, headers, body: payload, redirect: "manual" })); }
    catch (e) { return { status: 500, text: String((e && e.message) || e), json: null, location: "", keys: [] }; }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, text, json, location: r.headers.get("location") || "", keys: [...r.headers.keys()].sort() };
  };
  const ask = (fields, extra) => call("POST", "/request-access", { form: { web: "1", ...fields }, ...extra });
  const rows = () => q("SELECT * FROM access_requests ORDER BY created_at, id");
  const tokenOf = (r) => (/^\/request-access\/([0-9a-f]{48})$/.exec(r.location) || [])[1] || null;
  // the answer's shape: everything but the token (a new one each time)
  const shape = (r) => JSON.stringify([r.status, r.keys, r.location.replace(/[0-9a-f]{48}$/, "<token>"), r.text]);
  return { w, q, call, ask, rows, tokenOf, shape };
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
    const g = await W.call("GET", "/request-access", { headers: { accept: "text/html" } });
    const fields = ["name", "email", "company", "role", "team_size", "website", "linkedin", "x", "github", "ai_tools", "use_case", "trap"];
    const required = (n) => new RegExp(`<(?:input|select)[^>]*name="${n}"[^>]*\\brequired\\b`).test(g.text);
    const login = await W.call("GET", "/login", { headers: { accept: "text/html" } });
    return [
      [g.status === 200 && /action="\/request-access"/.test(g.text) && fields.every((f) => new RegExp(`name="${f}"`).test(g.text)), `R4 · GET /request-access is the form, every field on it (${g.status})`],
      [["name", "email", "company", "role", "team_size"].every(required) && !["website", "linkedin", "x", "github", "ai_tools", "use_case", "trap"].some(required) && (g.text.match(/class="opt">optional</g) || []).length === 6,
        "R4 · the five required fields are required, the six optional ones say so"],
      [/<div class="trap" aria-hidden="true">[\s\S]*?name="trap" tabindex="-1"/.test(g.text) && /\.trap\{position:absolute;left:-10000px/.test(g.text), "R4 · the honeypot sits out of sight, out of the tab order"],
      [login.status === 200 && /<a href="\/request-access"[^>]*>Request access<\/a>/.test(login.text), "R4 · GET /login carries the one way to request access"],
    ];
  },
  async R5() {
    const W = await world();
    const r = await W.ask(FULL);
    const t = W.tokenOf(r), rows = W.rows();
    const row = rows[0] || {};
    const inRows = JSON.stringify(W.q("SELECT * FROM access_requests")).includes(t || "\u0000");
    const page = t ? await W.call("GET", `/request-access/${t}`, { headers: { accept: "text/html" } }) : { status: 0, text: "" };
    return [
      [r.status === 303 && !!t && r.text === "", `R5 · a full request: ${r.status} -> ${r.location}`],
      [rows.length === 1 && row.email === "ada@analytical.test" && row.status === "open" && row.token_hash === sha(`sharingu-request:v1:${t}`) && !inRows && row.created_at === row.updated_at && row.approved_at === null,
        `R5 · one open row, the email lower-cased, only the link's hash kept (${rows.length} rows, ${row.email}, ${row.status})`],
      [page.status === 200 && /data-screen="request-received"/.test(page.text) && /Ada Lovelace/.test(page.text) && /data-request-company>Analytical Engines</.test(page.text),
        `R5 · the link's page names the person and the company (${page.status})`],
    ];
  },
  async R6() {
    const W = await world();
    const a = await W.ask(FULL);
    const before = JSON.stringify(W.rows());
    const b = await W.ask({ ...FULL, email: "ADA@analytical.test", company: "Difference Engines", role: "CTO", x: "" });
    const asked = await W.call("GET", b.location || "/request-access/asked", { headers: { accept: "text/html" } });
    const first = await W.call("GET", `/request-access/${W.tokenOf(a)}`, { headers: { accept: "text/html" } });
    // two at once for a new email: one row, one link, the other the repeat
    const [c1, c2] = await Promise.all([W.ask({ ...FULL, email: "twice@one.test" }), W.ask({ ...FULL, email: "twice@one.test", company: "Second" })]);
    const twice = W.q("SELECT company FROM access_requests WHERE email = 'twice@one.test'");
    return [
      [a.status === 303 && W.tokenOf(a) && b.status === 303 && b.location === "/request-access/asked" && !b.text, `R6 · a repeat is a 303 to the asked page (${b.status} -> ${b.location})`],
      [asked.status === 200 && asked.text.includes("This email has already asked for a place. The link from your first request shows your place.") && /href="\/login"/.test(asked.text)
        && !/Difference Engines|Analytical Engines|Ada|CTO/.test(asked.text), `R6 · the asked page says so and names nothing typed (${asked.status})`],
      [JSON.stringify(W.rows().filter((r) => r.email === "ada@analytical.test")) === before, "R6 · the repeat changed nothing: one row, the first profile, its link and its times as they were"],
      [first.status === 200 && /Analytical Engines/.test(first.text) && !/Difference Engines/.test(first.text), `R6 · the first link still opens the first request (${first.status})`],
      [twice.length === 1 && [c1, c2].filter((r) => W.tokenOf(r)).length === 1 && [c1, c2].filter((r) => r.location === "/request-access/asked").length === 1,
        `R6 · two at once make one row (${twice.length}), one link, the other the repeat`],
      [(await W.call("GET", "/request-access/asked", { headers: { accept: "text/html" } })).status === 200 && !(await mod("requestaccess.js")).REQUEST_TOKEN_RE.test("asked"), "R6 · the asked page's path is no token's shape"],
    ];
  },
  async R7() {
    const W = await world();
    W.w.db.prepare("INSERT INTO accounts (id, email, created_at, updated_at) VALUES ('acc-held', 'held@one.test', ?, ?)").run(T0, T0);
    const accounts = JSON.stringify(W.q("SELECT * FROM accounts ORDER BY id"));
    const fresh = await W.ask({ ...FULL, email: "new@one.test" });
    const held = await W.ask({ ...FULL, email: "Held@One.test" });
    const viaJson = await W.call("POST", "/request-access", { body: { ...FULL, email: "json@one.test" } });
    return [
      [held.status === 303 && W.shape(held) === W.shape(fresh), `R7 · an account's email answers what a new email answers (${held.status})`],
      [W.q("SELECT email FROM access_requests ORDER BY email").map((r) => r.email).join() === "held@one.test,json@one.test,new@one.test" && JSON.stringify(W.q("SELECT * FROM accounts ORDER BY id")) === accounts,
        "R7 · each is a request; the account is untouched"],
      [viaJson.status === 303 && /^\/request-access\/[0-9a-f]{48}$/.test(viaJson.location), `R7 · the JSON door answers the same 303 (${viaJson.status})`],
    ];
  },
  async R8() {
    const W = await world();
    const real = await W.ask({ ...FULL, email: "real@one.test" });
    const n = W.rows().length;
    const trap = await W.ask({ ...FULL, email: "bot@one.test", trap: "http://spam.test" });
    const page = await W.call("GET", `/request-access/${W.tokenOf(trap)}`, { headers: { accept: "text/html" } });
    return [
      [trap.status === 303 && W.shape(trap) === W.shape(real), `R8 · the honeypot filled answers the same shape (${trap.status})`],
      [W.rows().length === n && !W.q("SELECT 1 FROM access_requests WHERE email = 'bot@one.test'").length && page.status === 404, `R8 · no row written (${W.rows().length - n} new), its link the 404 (${page.status})`],
    ];
  },
  async R9() {
    const W = await world();
    const { REQUEST_FIELD_WORDS } = await mod("requestpage.js");
    const bad = await W.ask({ ...FULL, email: "not an email" });
    const badJson = await W.call("POST", "/request-access", { body: { ...FULL, team_size: "" } });
    const cross = await W.ask(FULL, { headers: { "sec-fetch-site": "cross-site" } });
    W.w.env.LOGIN_LIMIT = { limit: async () => ({ success: false }) };
    const flood = await W.ask(FULL, { headers: { "cf-connecting-ip": "203.0.113.9" } });
    delete W.w.env.LOGIN_LIMIT;
    const wrong = await W.call("GET", `/request-access/${"ab".repeat(24)}`, { headers: { accept: "text/html" } });
    const odd = await W.call("GET", "/request-access/not-a-token", { headers: { accept: "text/html" } });
    const slug = W.q("SELECT slug FROM org WHERE id = 1")[0].slug;
    const under = await W.call("GET", `/${slug}/request-access`, { headers: { accept: "text/html" } });
    return [
      [bad.status === 422 && bad.text.includes(REQUEST_FIELD_WORDS.email.replace(/'/g, "&#39;")) && /value="Analytical Engines"/.test(bad.text) && badJson.status === 422 && badJson.json && badJson.json.error === "bad_request_access" && badJson.json.field === "team_size",
        `R9 · a bad field: the form again naming it, its values kept (${bad.status}); JSON bad_request_access {field ${badJson.json && badJson.json.field}}`],
      [cross.status === 403 && /Cross-site request refused/.test(cross.text) && flood.status === 429, `R9 · a cross-site form ${cross.status}; the flood filter ${flood.status}`],
      [W.rows().length === 0, `R9 · nothing written by any refusal (${W.rows().length} rows)`],
      [wrong.status === 404 && odd.status === 404 && wrong.text === odd.text && /data-screen="request-missing"/.test(wrong.text), `R9 · a wrong and a malformed token are one 404 page (${wrong.status}, ${odd.status})`],
      [under.status === 404 && !/name="trap"/.test(under.text), `R9 · under an org's address the door is not there (${under.status})`],
    ];
  },
  async R10() {
    const B = await mod("beta.js");
    const { betaCount } = await mod("accounts.js");
    const one = (sql) => /^SELECT COUNT\((?:\*|DISTINCT s\.email)\) AS n FROM /.test(sql) && !/;\s*\S/.test(sql) && (sql.match(/\bSELECT\b/g) || []).length <= 2;
    const W = await world();
    const db = W.w.db;
    for (let id = 2; id <= 5; id++) db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (?, ?, ?, ?, 'free')").run(id, `Org ${id}`, T0, T0);
    db.prepare("INSERT INTO org (id, name, settings, created_at, updated_at, plan) VALUES (6, 'Suites', '{\"suites\":true}', ?, ?, 'free')").run(T0, T0);
    db.prepare("INSERT INTO org (id, name, created_at, updated_at, plan) VALUES (7, 'Reviewer', ?, ?, 'reviewer')").run(T0, T0);
    const code = (id, email, exp) => db.prepare("INSERT INTO signup_codes (id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(id, email, sha(id), T0, exp);
    code("c1", "open@x.test", "2099-01-01T00:00:00.000Z"); code("c2", "late@x.test", "2020-01-01T00:00:00.000Z");
    const worker = await betaCount({ DB: d1(db) });
    const op = await betaPlaces(d1(db));
    return [
      [one(B.BETA_ORGS_SQL) && one(B.BETA_CODES_SQL), "R10 · each beta statement is ONE aggregate (SELECT COUNT)"],
      [worker.cap === 50 && worker.orgs === 4 && worker.codes === 1 && worker.taken === 5 && worker.left === 45 && op.taken === worker.taken && op.left === worker.left && op.cap === worker.cap,
        `R10 · the worker's betaCount answers the operator's count (${JSON.stringify(worker)}; operator ${op.taken} taken, ${op.left} left)`],
    ];
  },
};

// ---- the mutants: each must turn its case(s) red ----
const MUTANTS = [
  { name: "the honeypot ignored", file: "src/index.js",
    from: "const token = trapped(body) ? newRequestToken() : await fileRequest(env, read.request);", to: "const token = await fileRequest(env, read.request);", red: ["R8"] },
  { name: "the repeat updating the first request", file: "src/requestaccess.js",
    from: "ON CONFLICT (email) WHERE status = 'open' DO NOTHING\"", to: "ON CONFLICT (email) WHERE status = 'open' DO UPDATE SET company = excluded.company, token_hash = excluded.token_hash\"", red: ["R6"] },
  { name: "the repeat handed a link (the insert's change unread)", file: "src/requestaccess.js",
    from: "return ((res && res.meta && res.meta.changes) || 0) >= 1 ? token : null;", to: "return token;", red: ["R6"] },
  { name: "the private page read by the raw token", file: "src/requestaccess.js",
    from: ".bind(await requestTokenHash(token)).first()", to: ".bind(token).first()", red: ["R5"] },
  { name: "the email kept as typed", file: "src/requestaccess.js", from: "  r.email = normEmail(r.email);\n", to: "", red: ["R1", "R6"] },
  { name: "the website's scheme unchecked", file: "src/requestaccess.js",
    from: "if ((u.protocol !== \"https:\" && u.protocol !== \"http:\") || u.username || u.password || !/^[a-z0-9-]+(\\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;\n  return u.href;",
    to: "return u.href;", red: ["R3"] },
  { name: "the request door without the same-origin guard", file: "src/index.js",
    from: "if (crossSiteLogin(request, url)) return isForm ? page(403, \"Cross-site request refused.\") : json({ error: \"cross_site_request_access\" }, 403);", to: "", red: ["R9"] },
  { name: "the sign-in without its request-access link", file: "src/login.js",
    from: ": action === \"/login\" ? REQUEST_ACCESS_LINK : \"\",", to: ": \"\",", red: ["R4"] },
  { name: "the beta's codes counted expired too", file: "src/beta.js",
    from: "AND s.expires_at > ?1 ", to: "AND ?1 IS NOT NULL ", red: ["R10"] },
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
