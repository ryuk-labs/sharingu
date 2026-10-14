// tools/google-selftest.mjs — sprint 21, slice 21.4c (Google sign-in: src/google.js, src/googlepage.js, src/accounts.js GOOGLE
// SIGN-IN, src/oauth.js connectByGoogle, the /auth/google/… doors, tools/operator.mjs set-google-client): the pure logic, then the
// flow through the REAL worker (src/index.js over node:sqlite, tools/fixtures/sqlite-worker.mjs) against tools/fake-google.mjs on a
// loopback port (the config's GOOGLE_LOCAL_IDP), its emails into the local capture. Nothing leaves this machine: no request reaches
// Google, and the requests name https://agent.sharingu.xyz (a registered origin) only as the worker's own URL, answered in-process.
//   G1 · THE ID TOKEN: a good token verifies; refused — another aud, another iss, expired, iat in the future, a bad signature, alg
//        none, HS256 (keyed by the public modulus), a kid the keys lack (why "kid"), email_verified false or missing, a wrong
//        nonce, no sub; identityOf takes the account's spelling and refuses a non-ASCII email
//   G2 · PKCE: RFC 7636's own vector (appendix B); a fresh verifier is 43 URL-safe characters
//   G3 · THE ORIGINS AND THE ENDPOINTS: only the origins stored WITH the client redirect (a workers.dev name, a preview, a loopback
//        without the local IdP never; a client stored without origins, or with an http one off loopback, is no client; the worker's
//        source names no deployment's domain); Google's own endpoints unless GOOGLE_LOCAL_IDP is a loopback host:port (a URL, another host, a path:
//        Google's); PRODUCTION IGNORES IT: wrangler.jsonc and the tenant template name no GOOGLE_LOCAL_IDP, and only
//        tools/lib-r-local.sh writes it
//   G4 · THE STATE: one record per start (its nonce and verifier with it, the state's hash its key, never the state); taken once
//        (a second take is null), expired is null; sameState; the authorization request carries S256, the scope and select_account
//   G5 · THE CLIENT IN KV: clientProblem; the operator's set-google-client reads a mode-600 file only (644 refused, nothing read),
//        stores the config's custom domains as the client's origins (a config with none takes --origin; none at all, or both,
//        refused), prints "stored" and the id's last characters, never the secret; clear, then a second clear refused
//   G6 · NO CLIENT STORED: no button on /login, /request-access or the paused page, and every Google door one plain 404 page
//   G7 · STORED: the button on /login (its next carried), /request-access (its source), the paused page and the connect page; none
//        on an origin Google does not know
//   G8 · JOIN BY GOOGLE: the start -> Google -> the callback 303 to the form; the form Google filled in (the email locked and never
//        sent, the name filled in, the passphrase optional); its POST — a typed email ignored, no passphrase — files the request
//        ALREADY VERIFIED (open, in line, the account linked with its Google subject and no passphrase, the source), a stranger's
//        unverified join for the email gone, NO verification email, the team's alert; 303 /account signed in; the ticket spent (410)
//   G9 · SIGN-IN, an account in line (verified by email): an account session at /account, its Google subject linked
//   G10 · SIGN-IN, a seated account: its org's session and landing; the same email by ANOTHER Google account refused (403), and that
//        Google account refused for another account's email (linked elsewhere)
//   G11 · THE STATE'S BINDING: the same callback again (its cookie kept) refused, nothing signed in; in another browser (no cookie)
//        refused; Google's error answer refused; the start under an org's address the one not-here 404
//   G12 · A TOKEN REFUSED end to end: another aud, an unverified email, alg none — one plain page, no session cookie, nothing linked
//   G13 · NO ACCOUNT on sign-in: "No account yet" with Join the beta, the form then Google's
//   G14 · THE CONNECT PAGE: a client registered; its authorize page carries the Google form (no link); the start by GET refused, a
//        cross-site POST refused; Google signs the owner in and the authorization completes: the client gets its code, which its
//        token request redeems, and the token reads whoami as that seat
//   G15 · NOTHING CHANGES for an account Google never signed in (a reviewer's, @review.sharingu.xyz): its passphrase signs in, its
//        subject stays none; a seat another org adds for a Google-linked email waits for its yes (SEAT_CONSENT_SQL), and its invite
//        holds (INVITE_SEAT_USE_SQL)
//   G16 · THE STEP-UP (the owner's ruling, 2026-10-14): an approved Google-only account, its Google sign-in fresh: /orgs/new asks no
//        passphrase and its form creates the org (the session's email, not the form's); its session proven over 10 minutes ago (moved
//        by SQL): the passphrase field and Continue with Google back to the form, the POST refused 401 with the offer, nothing made —
//        Google again lands on the form and creates it; a passphrase account unchanged (its field required, an empty one 422, its
//        passphrase creates the org); a JSON POST /orgs with that fresh session and no passphrase still 422
//        AND (the sprint end's review) a Google-only person SEATED in another org (an org session, not an account session): its fresh
//        Google sign-in is the step-up too (the proof recorded beside the org session), its form creates its org; the org form's top
//        bar says Sign out to an account session and to an org session, Sign in to no session
//   G17 · WHO GOOGLE ANSWERS FOR: identityOf's authoritative (gmail.com, googlemail.com, a hosted domain the token names as the
//        email's own; never another hd, never none); an account whose email Google does not run: the callback's link page (its
//        passphrase asked, the email locked, nothing linked, no session), a wrong passphrase the page again (401, still unlinked,
//        counted), the right one links and signs in — its earlier sessions ended (THE FIRST LINK IS A RESET); a new person on such an
//        email: "No account yet" for the emailed join (no ticket, never the Google form); a cross-site link POST refused
//   G18 · THE FIRST LINK IS A RESET (the invite squat): an org's admin redeems an invite for a stranger's email (the passphrase the
//        link set: accounts.invited_org) and signs in with it; the email's owner signs in by Google: the squatter's session revoked,
//        that passphrase and its mark gone (it signs in nowhere now), the seat WAITING for the owner's yes (the picker, never the org
//        entered), the account's open reset link spent; then a reset by email unlinks the Google subject
//   G19 · AN ADD-PERSON SHELL is no one's: its email joins the beta as anyone's (the verification email, never "already"; its
//        passphrase then the account's); a seatless shell joins through Google (the form Google filled in, the shell's own account
//        linked: no 409)
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red, by an assertion, never a crash.
// Exit 1 on any failure.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash, pbkdf2Sync } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { sqliteWorker, kv } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
const { startFakeGoogle } = await import(pathToFileURL(join(ENGINE, "tools", "fake-google.mjs")).href);

let MUT = {};
const mod = (f) => import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), f)).href);
const O = "https://agent.sharingu.xyz";
const CLIENT = { client_id: "123456789012-fake0client.apps.googleusercontent.com", client_secret: "GOCSPX-fake-secret-for-tests" };
const STORED = { ...CLIENT, origins: [O, "https://agent.example.test"] };   // as the operator stores it: with the deployment's origins
const fake = await startFakeGoogle({ clientId: CLIENT.client_id, clientSecret: CLIENT.client_secret });
const JWKS = (await (await fetch(fake.origin + "/jwks")).json()).keys;
const PASS = "a-long-passphrase-1";
const PROFILE = { company: "Gee Works", role: "Founder", team_size: "2-10", consent_terms: "1", consent_keep: "1" };

// world({ client }) -> the worker over a fresh database (org 1 "One", its owner owner@one.test), the fake as its IdP, the client stored
async function world({ client = true } = {}) {
  const w = await sqliteWorker({ org: "One", projects: ["alpha"], src: MUT.src, people: [["one-owner", "Owner One", "owner", "one-owner-key", ["alpha"], "owner@one.test"]] });
  w.env.MAIL_CAPTURE = "kv";
  w.env.GOOGLE_LOCAL_IDP = fake.address;
  const { GOOGLE_CLIENT_KEY } = await mod("google.js");
  if (client) await w.env.OAUTH_KV.put(GOOGLE_CLIENT_KEY, JSON.stringify(STORED));
  const one = (sql, ...a) => w.db.prepare(sql).get(...a);
  const q = (sql, ...a) => w.db.prepare(sql).all(...a);
  // a browser: a cookie jar (Set-Cookie applied, Max-Age=0 removing), same-origin form posts, page navigations
  const browser = () => {
    const jar = new Map();
    const call = async (method, path, { form, nav = false, origin = O, headers: extra = {} } = {}) => {
      const headers = { accept: "text/html", ...extra };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      if (nav) { headers["sec-fetch-dest"] = "document"; headers["sec-fetch-mode"] = "navigate"; }
      let body;
      if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; headers["sec-fetch-site"] = headers["sec-fetch-site"] || "same-origin"; body = new URLSearchParams(form).toString(); }
      let r;
      try { r = await w.fetch(new Request(origin + path, { method, headers, body, redirect: "manual" })); }
      catch (e) { return { status: 500, text: String((e && e.message) || e), location: "", cookies: [] }; }
      const text = await r.text();
      await w.settle();
      const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      for (const c of cookies) { const m = /^([^=]+)=([^;]*)/.exec(c); if (m) { if (/Max-Age=0\b/.test(c) || !m[2]) jar.delete(m[1]); else jar.set(m[1], m[2]); } }
      return { status: r.status, text, location: r.headers.get("location") || "", cookies };
    };
    return { jar, call };
  };
  // google(b, intent, identity, { query, form }) -> { start, back, cb }: the start (a link, or the connect page's form), the fake's
  // answer (the redirect back), then the callback in the same browser
  const google = async (b, intent, identity, { query = {}, form = null } = {}) => {
    // a Workspace's token names its hosted domain: by default the email's own (Google runs the mailbox); hd: null for none
    fake.next({ ...(identity.email && !("hd" in identity) ? { hd: String(identity.email).split("@")[1].toLowerCase() } : {}), ...identity });
    const start = form ? await b.call("POST", "/auth/google/start", { form: { intent, ...form } }) : await b.call("GET", `/auth/google/start?${new URLSearchParams({ intent, ...query })}`, { nav: true });
    if (!start.location.startsWith(fake.origin + "/authorize?")) return { start, back: "", cb: null };
    const a = await fetch(start.location, { redirect: "manual" });
    const back = a.headers.get("location") || "";
    const cb = back.startsWith(O + "/auth/google/callback") ? await b.call("GET", back.slice(O.length), { nav: true }) : null;
    return { start, back, cb };
  };
  const mails = async () => Promise.all(((await w.env.OAUTH_KV.list({ prefix: "mail-capture:" })).keys || []).map(async (k) => JSON.parse(await w.env.OAUTH_KV.get(k.name))));
  // verifiedByEmail(email): the account flow's own join and verification (21.4a), an account with a passphrase and no seat
  const verifiedByEmail = async (email, name = "Mail Person") => {
    const b = browser();
    await b.call("POST", "/request-access", { form: { web: "1", name, email, password: PASS, confirm: PASS, ...PROFILE } });
    const m = (await mails()).filter((x) => x.to === email && /\/account\/verify\//.test(x.text)).pop();
    const t = (/\/account\/verify\/([0-9a-f]{48})/.exec((m && m.text) || "") || [])[1];
    await b.call("POST", "/account/verify", { form: { web: "1", token: t, password: PASS } });
    return b;
  };
  const slug = () => one("SELECT slug FROM org WHERE id = 1").slug;
  return { w, one, q, browser, google, mails, verifiedByEmail, slug };
}
const who = (n, extra = {}) => ({ sub: `sub-${n}`, email: `${n}@gee.test`, email_verified: true, name: `Person ${n}`, ...extra });
const sha = (x) => createHash("sha256").update(x).digest("hex");
const SALT = "00112233445566778899aabbccddeeff";
const pbkdf = (pw) => pbkdf2Sync(pw, Buffer.from(SALT, "hex"), 100000, 32, "sha256").toString("hex");

const CASES = {
  async G1() {
    const { verifyIdToken, identityOf } = await mod("google.js");
    const t = Math.floor(Date.now() / 1000);
    const base = { iss: fake.origin, aud: CLIENT.client_id, azp: CLIENT.client_id, sub: "s1", email: "Ada@Gee.Test", email_verified: true, name: "Ada", nonce: "n1", iat: t, exp: t + 600 };
    const v = (claims, o = {}, opts = {}) => verifyIdToken(fake.mint({ ...base, ...claims }, o), { keys: JWKS, clientId: CLIENT.client_id, nonce: "n1", issuers: [fake.origin], ...opts });
    const why = async (claims, o, opts) => (await v(claims, o, opts)).why || "ok";
    const good = await v({});
    const miss = { ...base }; delete miss.email_verified;
    const noVer = await verifyIdToken(fake.mint(miss), { keys: JWKS, clientId: CLIENT.client_id, nonce: "n1", issuers: [fake.origin] });
    const got = {
      aud: await why({ aud: "other.apps.googleusercontent.com", azp: "other.apps.googleusercontent.com" }), iss: await why({ iss: "https://accounts.example.com" }),
      exp: await why({ exp: t - 3600 }), iat: await why({ iat: t + 3600 }), sig: await why({}, { badSig: true }), none: await why({}, { alg: "none" }),
      hs: await why({}, { alg: "HS256" }), kid: await why({}, { kid: "not-a-kid" }), unverified: await why({ email_verified: false }), str: await why({ email_verified: "true" }),
      nonce: await why({ nonce: "n2" }), sub: await why({ sub: "" }), gissuer: await why({}, {}, { issuers: ["https://accounts.google.com", "accounts.google.com"] }),
    };
    const id = identityOf({ ...base, name: "  Ada\n Lovelace " });
    return [
      [good.ok === true && good.claims.sub === "s1", "G1 · a good token (RS256, the fake's key, our aud, its iss, the nonce, a verified email) verifies"],
      [got.aud === "aud" && got.iss === "iss" && got.gissuer === "iss", `G1 · another aud, another iss (and the fake's iss against Google's two) refused (${got.aud}, ${got.iss}, ${got.gissuer})`],
      [got.exp === "exp" && got.iat === "iat", `G1 · expired, and issued in the future past the skew, refused (${got.exp}, ${got.iat})`],
      [got.sig === "signature" && got.none === "alg" && got.hs === "alg" && got.kid === "kid", `G1 · a bad signature, alg none, HS256 and an unknown kid refused (${got.sig}, ${got.none}, ${got.hs}, ${got.kid})`],
      [got.unverified === "email_unverified" && got.str === "email_unverified" && noVer.why === "email_unverified", `G1 · email_verified false, the string "true" and missing refused (${got.unverified}, ${got.str}, ${noVer.why})`],
      [got.nonce === "nonce" && got.sub === "sub", `G1 · a wrong nonce and no sub refused (${got.nonce}, ${got.sub})`],
      [id && id.email === "ada@gee.test" && id.name === "Ada Lovelace" && id.sub === "s1" && identityOf({ ...base, email: "adá@gee.test" }) === null,
        `G1 · identityOf: the account's spelling, the name folded; a non-ASCII email none (${JSON.stringify(id)})`],
    ];
  },
  async G2() {
    const { challengeOf, newVerifier } = await mod("google.js");
    const v = newVerifier();
    return [
      [(await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")) === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "G2 · S256 of RFC 7636's appendix B verifier is its challenge"],
      [/^[A-Za-z0-9_-]{43}$/.test(v) && v !== newVerifier(), `G2 · a fresh verifier: 43 URL-safe characters, never the same twice (${v.length})`],
    ];
  },
  async G3() {
    const { redirectUriFor, endpointsOf, clientProblem, googleClient, GOOGLE, GOOGLE_CLIENT_KEY } = await mod("google.js");
    const local = { GOOGLE_LOCAL_IDP: "127.0.0.1:8949" };
    const wrangler = readFileSync(join(ENGINE, "wrangler.jsonc"), "utf8"), tmpl = readFileSync(join(ENGINE, "wrangler.tenant.template.jsonc"), "utf8");
    const lib = readFileSync(join(ENGINE, "tools", "lib-r-local.sh"), "utf8");
    const src = readFileSync(join(MUT.src || join(ENGINE, "src"), "google.js"), "utf8");
    const withLoop = { ...STORED, origins: [...STORED.origins, "http://127.0.0.1:8890"] };
    const stored = async (c) => { const env = { OAUTH_KV: kv() }; await env.OAUTH_KV.put(GOOGLE_CLIENT_KEY, JSON.stringify(c)); return googleClient(env); };
    return [
      [redirectUriFor({}, STORED, O) === O + "/auth/google/callback" && redirectUriFor({}, STORED, "https://agent.example.test") === "https://agent.example.test/auth/google/callback",
        "G3 · each origin stored with the client redirects to its own callback"],
      [["https://ryuklabs-agent-r.ryuk.workers.dev", "https://abc123-ryuklabs-agent-r.ryuk.workers.dev", "http://agent.sharingu.xyz", "https://agent.sharingu.xyz.evil.test", "http://127.0.0.1:8890", "https://agent.sharingu.xyz/x", "https://agent.ryuklabs.io"].every((o) => redirectUriFor({}, withLoop, o) === "")
        && redirectUriFor({}, null, O) === "" && redirectUriFor({}, CLIENT, O) === "",
        "G3 · any other origin (a workers.dev name, a preview, http, a lookalike, a loopback without the local IdP, a path, an origin not stored) has no redirect; nor does no client, or one without origins"],
      [redirectUriFor(local, withLoop, "http://127.0.0.1:8890") === "http://127.0.0.1:8890/auth/google/callback" && redirectUriFor(local, STORED, "http://127.0.0.1:8890") === "" && redirectUriFor(local, withLoop, "https://x.workers.dev") === "",
        "G3 · with the local IdP, a loopback origin the client names redirects too (the local worker's own), and still no other"],
      [clientProblem(STORED) === "" && !!clientProblem(CLIENT) && !!clientProblem({ ...CLIENT, origins: [] }) && !!clientProblem({ ...CLIENT, origins: ["http://agent.example.test"] }) && !!clientProblem({ ...CLIENT, origins: [O + "/x"] })
        && (await stored(CLIENT)) === null && (await stored(STORED)).origins.join() === STORED.origins.join(),
        "G3 · a client stored without origins (or with an http origin off loopback, or a path) is no client: no Google"],
      [!/agent\.sharingu\.xyz|agent\.ryuklabs\.io|REGISTERED_ORIGINS/.test(src), "G3 · src/google.js names no deployment's domain (the origins are the stored client's)"],
      [endpointsOf({}) === GOOGLE && endpointsOf(local).token === "http://127.0.0.1:8949/token" && endpointsOf(local).issuers[0] === "http://127.0.0.1:8949"
        && ["http://127.0.0.1:8949", "evil.test:80", "127.0.0.1:8949/x", "127.0.0.2:8949", "localhost", "127.0.0.1:0", " 127.0.0.1:8949"].every((x) => endpointsOf({ GOOGLE_LOCAL_IDP: x }) === GOOGLE),
        "G3 · Google's own endpoints unless GOOGLE_LOCAL_IDP is exactly a loopback host:port (a URL, another host, a path, a stray space: Google's)"],
      [GOOGLE.token === "https://oauth2.googleapis.com/token" && GOOGLE.authorize === "https://accounts.google.com/o/oauth2/v2/auth" && GOOGLE.jwks === "https://www.googleapis.com/oauth2/v3/certs",
        "G3 · Google's endpoints are its discovery document's"],
      [!/GOOGLE_LOCAL_IDP/.test(wrangler) && !/GOOGLE_LOCAL_IDP/.test(tmpl) && /"GOOGLE_LOCAL_IDP": ' \+ json\.dumps\("127\.0\.0\.1:"/.test(lib),
        "G3 · PRODUCTION IGNORES IT: wrangler.jsonc and the tenant template name no GOOGLE_LOCAL_IDP; tools/lib-r-local.sh writes it into every local config"],
    ];
  },
  async G4() {
    const { startFlow, takeFlow, sameState } = await mod("google.js");
    const env = { OAUTH_KV: kv() };
    const f = await startFlow(env, CLIENT, { intent: "signin", redirect: O + "/auth/google/callback" });
    const keys = (await env.OAUTH_KV.list({ prefix: "google-state:" })).keys.map((k) => k.name);
    const u = new URL(f.url);
    const raw = JSON.parse(await env.OAUTH_KV.get(keys[0]));
    const first = await takeFlow(env, f.state), again = await takeFlow(env, f.state);
    const g = await startFlow(env, CLIENT, { intent: "join", redirect: O + "/auth/google/callback" });
    const k2 = (await env.OAUTH_KV.list({ prefix: "google-state:" })).keys[0].name;
    await env.OAUTH_KV.put(k2, JSON.stringify({ ...JSON.parse(await env.OAUTH_KV.get(k2)), exp: Date.now() - 1 }));
    const challenge = createHash("sha256").update(raw.verifier).digest("base64url");
    return [
      [keys.length === 1 && keys[0] === "google-state:" + createHash("sha256").update(f.state).digest("hex") && !keys[0].includes(f.state) && raw.nonce && raw.verifier,
        "G4 · one record per start, under the state's hash (never the state), with its nonce and its verifier"],
      [first && first.intent === "signin" && again === null && (await takeFlow(env, g.state)) === null && (await takeFlow(env, "zz")) === null,
        "G4 · taken once (a second take null), an expired one null, a malformed state null"],
      [(await sameState(f.state, f.state)) && !(await sameState(f.state, g.state)) && !(await sameState(f.state, "")) && !(await sameState("", "")),
        "G4 · sameState: only the same 64 hex"],
      [u.searchParams.get("code_challenge_method") === "S256" && u.searchParams.get("code_challenge") === challenge && u.searchParams.get("scope") === "openid email profile"
        && u.searchParams.get("prompt") === "select_account" && u.searchParams.get("nonce") === raw.nonce && u.searchParams.get("state") === f.state && u.searchParams.get("client_id") === CLIENT.client_id
        && u.searchParams.get("redirect_uri") === O + "/auth/google/callback" && !u.searchParams.has("client_secret"),
        "G4 · the authorization request: S256 of the kept verifier, openid email profile, select_account, the nonce and state, our redirect, never the secret"],
    ];
  },
  async G5() {
    const { clientProblem, GOOGLE_CLIENT_KEY } = await mod("google.js");
    const { run } = await import(pathToFileURL(join(ENGINE, "tools", "operator.mjs")).href);
    const dir = mkdtempSync(join(tmpdir(), "google-selftest-"));
    try {
      const cfg = join(dir, "wrangler.jsonc"), file = join(dir, "google-oauth.env"), loose = join(dir, "loose.env");
      const base = { name: "x", d1_databases: [{ binding: "DB", database_name: "x-db", database_id: "0" }], kv_namespaces: [{ binding: "OAUTH_KV", id: "k" }] };
      writeFileSync(cfg, JSON.stringify({ ...base, routes: [{ pattern: "agent.example.test", custom_domain: true }, { pattern: "other.example.test/*", zone_name: "example.test" }, { pattern: "two.example.test", custom_domain: true }] }));
      const bare = join(dir, "bare.jsonc");
      writeFileSync(bare, JSON.stringify(base));
      writeFileSync(file, `GOOGLE_CLIENT_ID=${CLIENT.client_id}\nexport GOOGLE_CLIENT_SECRET="${CLIENT.client_secret}"\n`); chmodSync(file, 0o600);
      writeFileSync(loose, readFileSync(file)); chmodSync(loose, 0o644);
      const K = kv(), out = [];
      const opOn = (c, ...a) => run([...a, "--local", dir, "--config", c], { open: async () => ({ KV: K, database: "test:KV", close: async () => {} }), say: (x) => out.push(x), err: (x) => out.push(x) });
      const op = (...a) => opOn(cfg, ...a);
      const rLoose = await op("set-google-client", "--file", loose), afterLoose = await K.get(GOOGLE_CLIENT_KEY);
      const rBoth = await op("set-google-client", "--file", file, "--origin", "http://127.0.0.1:8787"), rNone = await opOn(bare, "set-google-client", "--file", file), afterNone = await K.get(GOOGLE_CLIENT_KEY);
      const rBareHttp = await opOn(bare, "set-google-client", "--file", file, "--origin", "http://agent.example.test"), afterHttp = await K.get(GOOGLE_CLIENT_KEY);
      const rBare = await opOn(bare, "set-google-client", "--file", file, "--origin", "http://127.0.0.1:8787"), bareStored = JSON.parse((await K.get(GOOGLE_CLIENT_KEY)) || "{}");
      const rSet = await op("set-google-client", "--file", file), stored = JSON.parse((await K.get(GOOGLE_CLIENT_KEY)) || "{}");
      const rClear = await op("clear-google-client"), rAgain = await op("clear-google-client");
      const said = out.join("\n");
      return [
        [clientProblem(STORED) === "" && !!clientProblem({ ...STORED, client_id: "abc" }) && !!clientProblem({ ...STORED, client_secret: "short" }) && !!clientProblem(null),
          "G5 · clientProblem: a Google client id and a printable secret (and its origins), nothing else"],
        [rLoose === 1 && afterLoose === null && /chmod 600/.test(said), `G5 · a file others may read is refused, nothing stored (rc ${rLoose})`],
        [rSet === 0 && stored.client_id === CLIENT.client_id && stored.client_secret === CLIENT.client_secret && /stored/.test(said) && said.includes("…client"),
          `G5 · set-google-client stores the two values from the mode-600 file and says "stored" and the id's tail (rc ${rSet})`],
        [JSON.stringify(stored.origins) === JSON.stringify(["https://agent.example.test", "https://two.example.test"]) && clientProblem(stored) === "",
          `G5 · with them the config's custom domains as the client's origins (a zone route is no custom domain) (${JSON.stringify(stored.origins)})`],
        [rNone === 1 && rBoth === 1 && rBareHttp === 1 && afterNone === null && afterHttp === null && rBare === 0 && JSON.stringify(bareStored.origins) === JSON.stringify(["http://127.0.0.1:8787"]),
          `G5 · a config with no custom domain takes --origin (a loopback http one; plain http elsewhere refused); none at all, or --origin beside the routes, refused, nothing stored (rc ${rNone}, ${rBoth}, ${rBareHttp}, ${rBare})`],
        [!said.includes(CLIENT.client_secret) && !said.includes(CLIENT.client_id), "G5 · nothing printed holds the secret or the whole id"],
        [rClear === 0 && rAgain === 1 && (await K.get(GOOGLE_CLIENT_KEY)) === null, `G5 · clear removes it; a second clear refused (rc ${rClear}, ${rAgain})`],
      ];
    } finally { rmSync(dir, { recursive: true, force: true }); }
  },
  async G6() {
    const W = await world({ client: false }), b = W.browser();
    const { MAIL_CAP, windowStartOf } = await mod("email.js");
    W.w.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?)").run(windowStartOf(new Date().toISOString()), MAIL_CAP);
    const login = await b.call("GET", "/login", { nav: true }), req = await b.call("GET", "/request-access", { nav: true }), sent = await b.call("GET", "/account/sent", { nav: true });
    const s1 = await b.call("GET", "/auth/google/start?intent=signin", { nav: true }), cb = await b.call("GET", "/auth/google/callback?code=x&state=" + "a".repeat(64), { nav: true });
    return [
      [[login, req, sent].every((r) => r.status === 200 && !/data-region="google"/.test(r.text) && !/Continue with Google/.test(r.text)), "G6 · no client stored: no button on /login, /request-access or the paused page"],
      [s1.status === 404 && /data-why="off"/.test(s1.text) && !s1.location && fake.authorized.length === 0 && cb.status === 400 && /data-screen="google-refused"/.test(cb.text),
        `G6 · the start is one plain 404 page (nothing sent to Google), a callback one refusal (${s1.status}, ${cb.status})`],
    ];
  },
  async G7() {
    const W = await world(), b = W.browser();
    const { MAIL_CAP, windowStartOf } = await mod("email.js");
    const login = await b.call("GET", "/login?next=" + encodeURIComponent(`/${W.slug()}/home`), { nav: true }), req = await b.call("GET", "/request-access?from=site", { nav: true });
    W.w.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?)").run(windowStartOf(new Date().toISOString()), MAIL_CAP);
    const sent = await b.call("GET", "/account/sent", { nav: true });
    const elsewhere = await b.call("GET", "/login", { nav: true, origin: "https://org.test" });
    const href = (t) => ((/class="google-btn" href="([^"]+)"/.exec(t) || [])[1] || "").replace(/&amp;/g, "&");
    return [
      [/data-google="signin"/.test(login.text) && href(login.text) === `/auth/google/start?intent=signin&next=${encodeURIComponent(`/${W.slug()}/home`)}` && /Continue with Google/.test(login.text),
        `G7 · /login carries Continue with Google, its next with it (${href(login.text)})`],
      [/data-google="join"/.test(req.text) && href(req.text) === "/auth/google/start?intent=join&from=site", `G7 · /request-access carries it with the source (${href(req.text)})`],
      [/data-screen="account-paused"/.test(sent.text) && /data-google="join"/.test(sent.text) && /Continue with Google instead/.test(sent.text), "G7 · the paused page: Continue with Google instead"],
      [elsewhere.status === 200 && !/data-region="google"/.test(elsewhere.text), "G7 · none on an origin Google does not know"],
      [(login.text.match(/class="primary"|<button type="submit">/g) || []).length === 1, "G7 · the page's one orange primary stays its own (the Google button is no primary)"],
    ];
  },
  async G8() {
    const W = await world(), b = W.browser(), id = who("joiner");
    // a stranger's unverified join for the same email first (its passphrase not the person's)
    await W.browser().call("POST", "/request-access", { form: { web: "1", name: "Stranger", email: id.email, password: "a-strangers-passphrase", confirm: "a-strangers-passphrase", ...PROFILE } });
    const before = (await W.mails()).length;
    const g = await W.google(b, "join", id, { query: { from: "site" } });
    const form = await b.call("GET", "/request-access", { nav: true });
    const post = await b.call("POST", "/request-access", { form: { web: "1", google: "1", name: "Person Joiner", email: "evil@else.test", company: "Gee Works", role: "Founder", team_size: "2-10", consent_terms: "1", consent_keep: "1", from: "direct" } });
    const acct = W.one("SELECT id, pass_hash, google_sub FROM accounts WHERE email = ?", id.email);
    const rows = W.q("SELECT status, verified_at, account_id, source FROM access_requests WHERE email = ?", id.email);
    const ms = (await W.mails()).slice(before);
    const status = await b.call("GET", "/account", { nav: true });
    const again = await b.call("POST", "/request-access", { form: { web: "1", google: "1", name: "Person Joiner", company: "Gee Works", role: "Founder", team_size: "2-10", consent_terms: "1", consent_keep: "1" } });
    return [
      [g.start.status === 302 && g.cb && !g.cb.cookies.some((c) => /^__Host-ar_session=/.test(c)) && g.cb.status === 303 && g.cb.location === "/request-access" && g.cb.cookies.some((c) => /^__Host-g_join=[0-9a-f]{64};.*HttpOnly; Secure; SameSite=Lax/.test(c)),
        `G8 · the start -> Google -> the callback 303 to the join form, its ticket in a __Host- cookie (${g.cb && g.cb.status} ${g.cb && g.cb.location})`],
      [/data-google-join/.test(form.text) && /data-google-locked/.test(form.text) && form.text.includes(`value="${id.email}" readonly`) && !/name="email"/.test(form.text) && /value="Person joiner"|value="Person Joiner"/i.test(form.text)
        && !/id="password" name="password" required/.test(form.text) && /Verified by Google/.test(form.text) && !/data-region="google"/.test(form.text),
        "G8 · the form Google filled in: the email locked and never sent, the name filled in, the passphrase optional, no button"],
      [post.status === 303 && post.location === "/account" && post.cookies.some((c) => /^__Host-ar_session=t_a_/.test(c)) && post.cookies.some((c) => /^__Host-g_join=;/.test(c)),
        `G8 · its POST: 303 /account with an account session, the ticket's cookie cleared (${post.status} ${post.location})`],
      [!W.one("SELECT 1 AS x FROM accounts WHERE email = 'evil@else.test'") && acct && acct.google_sub === id.sub && acct.pass_hash === null
        && rows.length === 1 && rows[0].status === "open" && rows[0].verified_at && rows[0].account_id === acct.id && rows[0].source === "site",
        `G8 · filed ALREADY VERIFIED: the account (its Google subject, no passphrase), the request open and in line, its account, the source; the typed email ignored; the stranger's join gone (${rows.length} row)`],
      [!ms.some((m) => /Verify your email/.test(m.subject)) && ms.some((m) => m.to === "acie@ryuklabs.io" && /Gee Works/.test(m.subject) && !/joiner/i.test(m.text + m.subject)),
        `G8 · no verification email; the team's alert (company, no name or email) (${ms.map((m) => m.subject).join(" | ")})`],
      [status.status === 200 && /data-screen="account-in-line"/.test(status.text) && again.status === 410 && /data-screen="request-access"/.test(again.text),
        `G8 · /account in line; the ticket spent: the form again says so (${status.status}, ${again.status})`],
    ];
  },
  async G9() {
    const W = await world();
    await W.verifiedByEmail("mailed@gee.test");
    const b = W.browser();
    const g = await W.google(b, "signin", { sub: "sub-mailed", email: "Mailed@Gee.Test", email_verified: true, name: "M" });
    const acct = W.one("SELECT google_sub, pass_hash FROM accounts WHERE email = 'mailed@gee.test'");
    const page = await b.call("GET", "/account", { nav: true });
    return [
      [g.cb && g.cb.status === 302 && g.cb.location === "/account" && /^t_a_/.test(b.jar.get("__Host-ar_session") || "") && !b.jar.has("__Host-g_state"),
        `G9 · an account in line signs in to its account session at /account, the state's cookie cleared (${g.cb && g.cb.status} ${g.cb && g.cb.location})`],
      [acct.google_sub === "sub-mailed" && !!acct.pass_hash && page.status === 200 && /data-screen="account-in-line"/.test(page.text), "G9 · its Google subject linked on first use, its passphrase kept; /account reads"],
    ];
  },
  async G10() {
    const W = await world();
    await W.verifiedByEmail("other@gee.test");
    const b = W.browser(), slug = W.slug();
    const g = await W.google(b, "signin", { sub: "sub-owner", email: "owner@one.test", email_verified: true, name: "Owner" }, { query: { next: `/${slug}/home` } });
    const home = await b.call("GET", `/${slug}/home`, { nav: true });
    const b2 = W.browser(), wrong = await W.google(b2, "signin", { sub: "sub-intruder", email: "owner@one.test", email_verified: true, name: "Intruder" });
    const b3 = W.browser(), moved = await W.google(b3, "signin", { sub: "sub-owner", email: "other@gee.test", email_verified: true, name: "Owner" });
    return [
      [g.cb && g.cb.status === 302 && g.cb.location === `/${slug}/home` && !!b.jar.get("__Host-ar_session") && home.status === 200 && /data-screen|<main/.test(home.text),
        `G10 · a seated account: its org's session, landing on next (${g.cb && g.cb.status} ${g.cb && g.cb.location}; home ${home.status})`],
      [W.one("SELECT google_sub FROM accounts WHERE email = 'owner@one.test'").google_sub === "sub-owner", "G10 · its Google subject linked"],
      [wrong.cb && wrong.cb.status === 403 && /data-why="other_sub"/.test(wrong.cb.text) && !b2.jar.has("__Host-ar_session") && W.one("SELECT google_sub FROM accounts WHERE email = 'owner@one.test'").google_sub === "sub-owner",
        `G10 · the same email by another Google account refused, nothing signed in, the link unchanged (${wrong.cb && wrong.cb.status})`],
      [moved.cb && moved.cb.status === 403 && /data-why="linked_elsewhere"/.test(moved.cb.text) && !b3.jar.has("__Host-ar_session") && W.one("SELECT google_sub FROM accounts WHERE email = 'other@gee.test'").google_sub === null,
        `G10 · that Google account refused for another account's email (${moved.cb && moved.cb.status})`],
    ];
  },
  async G11() {
    const W = await world(), b = W.browser();
    const g = await W.google(b, "signin", { sub: "sub-owner", email: "owner@one.test", email_verified: true, name: "Owner" });
    const cookie = /^__Host-g_state=([0-9a-f]{64})/.exec(g.start.cookies.find((c) => c.startsWith("__Host-g_state=")) || "");
    const replay = W.browser(); replay.jar.set("__Host-g_state", cookie ? cookie[1] : "");
    const r1 = await replay.call("GET", g.back.slice(O.length), { nav: true });
    const other = W.browser();
    fake.next({ sub: "sub-owner", email: "owner@one.test", email_verified: true });
    const s2 = await W.browser().call("GET", "/auth/google/start?intent=signin", { nav: true });   // a flow started in one browser…
    const back2 = (await fetch(s2.location, { redirect: "manual" })).headers.get("location");
    const r2 = await other.call("GET", back2.slice(O.length), { nav: true });   // …finished in another: no cookie
    const b4 = W.browser(), denied = await W.google(b4, "signin", { deny: true });
    const under = await W.browser().call("GET", `/${W.slug()}/auth/google/start?intent=signin`, { nav: true, headers: { cookie: "__Host-ar_session=x" } });
    return [
      [g.cb && g.cb.status === 302 && r1.status === 400 && /data-why="expired"/.test(r1.text) && !r1.cookies.some((c) => /^__Host-ar_session=[^;]/.test(c)),
        `G11 · the same callback again, its cookie kept: refused, nothing signed in (${r1.status})`],
      [r2.status === 400 && !other.jar.has("__Host-ar_session"), `G11 · a callback carried into another browser (no state cookie): refused (${r2.status})`],
      [denied.cb && denied.cb.status === 400 && /data-why="cancelled"/.test(denied.cb.text), `G11 · Google's error answer: refused (${denied.cb && denied.cb.status})`],
      [under.status === 404 && /data-screen="not-found"/.test(under.text), `G11 · under an org's address the start is the one not-here 404 (${under.status})`],
    ];
  },
  async G12() {
    const W = await world();
    const tries = [["aud", who("aud1", { aud: "999-other.apps.googleusercontent.com" })], ["unverified", who("unv1", { email_verified: false })], ["none", who("none1", { alg: "none" })],
      ["missing", who("miss1", { email_verified: null })], ["nonce", who("nonce1", { nonce: "not-the-flow-nonce" })]];
    const out = [];
    for (const [k, id] of tries) { const b = W.browser(); const g = await W.google(b, "signin", id); out.push([k, g.cb, b]); }
    const nothing = !W.one("SELECT 1 AS x FROM accounts WHERE google_sub IS NOT NULL") && !W.one("SELECT 1 AS x FROM access_requests");
    return [
      [out.every(([, cb, b]) => cb && cb.status === 401 && /data-screen="google-refused"/.test(cb.text) && !b.jar.has("__Host-ar_session") && !b.jar.has("__Host-g_join")),
        `G12 · another aud, an unverified email, alg none, no email_verified, another nonce: one plain 401 page each, no session, no ticket (${out.map(([k, cb]) => `${k} ${cb && cb.status}`).join(", ")})`],
      [/data-why="unverified"/.test(out[1][1].text) && nothing, "G12 · the unverified one says so; nothing linked, nothing filed"],
    ];
  },
  async G13() {
    const W = await world(), b = W.browser();
    const g = await W.google(b, "signin", who("newbie"));
    const form = await b.call("GET", "/request-access", { nav: true });
    return [
      [g.cb && g.cb.status === 200 && /data-screen="google-no-account"/.test(g.cb.text) && g.cb.text.includes("newbie@gee.test") && /href="\/request-access"[^>]*>Join the beta/.test(g.cb.text) && b.jar.has("__Host-g_join"),
        `G13 · no account: "No account yet" with Join the beta, the ticket set (${g.cb && g.cb.status})`],
      [/data-google-join/.test(form.text) && form.text.includes('value="newbie@gee.test" readonly'), "G13 · Join the beta then opens the form Google filled in"],
    ];
  },
  async G14() {
    const W = await world(), b = W.browser();
    const reg = await W.w.fetch(new Request(O + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://client.example/cb"], client_name: "Test App", token_endpoint_auth_method: "none" }) }));
    const client = await reg.json();
    const verifier = "v".repeat(50), challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = `/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: "https://client.example/cb", code_challenge: challenge, code_challenge_method: "S256", state: "s-client", scope: "mcp:read mcp:write" })}`;
    const page = await b.call("GET", authorize, { nav: true });
    const oauthReq = ((/<form method="POST" action="\/auth\/google\/start"[\s\S]*?name="oauth_req" value="([^"]+)"/.exec(page.text) || [])[1] || "");
    const byLink = await W.browser().call("GET", "/auth/google/start?intent=connect&oauth_req=" + encodeURIComponent(oauthReq), { nav: true });
    const cross = await W.browser().call("POST", "/auth/google/start", { form: { intent: "connect", oauth_req: oauthReq }, headers: { "sec-fetch-site": "cross-site" } });
    const g = await W.google(b, "connect", { sub: "sub-owner", email: "owner@one.test", email_verified: true, name: "Owner" }, { form: { oauth_req: oauthReq } });
    const to = g.cb ? new URL(g.cb.location) : null;
    let whoami = null;
    if (to && to.searchParams.get("code")) {
      const tok = await (await W.w.fetch(new Request(O + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code: to.searchParams.get("code"), redirect_uri: "https://client.example/cb", client_id: client.client_id, code_verifier: verifier }).toString() }))).json();
      const r = await W.w.fetch(new Request(O + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok.access_token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }) }));
      try { whoami = JSON.parse(JSON.parse(await r.text()).result.content[0].text); } catch { whoami = null; }
    }
    return [
      [page.status === 200 && !!oauthReq && /data-google="connect"/.test(page.text) && !/href="\/auth\/google\/start\?intent=connect/.test(page.text), "G14 · the connect page carries the Google form (its authorize request on it), never a link"],
      [byLink.status === 400 && cross.status === 403, `G14 · the connect's start by GET refused, a cross-site POST refused (${byLink.status}, ${cross.status})`],
      [g.start.status === 303 && g.cb && g.cb.status === 302 && to && to.origin + to.pathname === "https://client.example/cb" && to.searchParams.get("state") === "s-client" && !!to.searchParams.get("code"),
        `G14 · Google signs the owner in and the authorization completes: the client gets its code and its state (${g.cb && g.cb.status} ${to && to.origin})`],
      [whoami && JSON.stringify(whoami).includes("owner@one.test"), `G14 · the code redeemed, the token reads whoami as that seat (${JSON.stringify(whoami || {}).slice(0, 120)})`],
    ];
  },
  async G15() {
    const W = await world();
    const { SEAT_CONSENT_SQL, INVITE_SEAT_USE_SQL } = await mod("accounts.js");
    const rev = await W.verifiedByEmail("reviewer-claude@review.sharingu.xyz", "Reviewer");
    await rev.call("GET", "/logout", { nav: true });
    const again = await W.browser().call("POST", "/login", { form: { web: "1", email: "reviewer-claude@review.sharingu.xyz", password: PASS } });
    const g = await W.google(W.browser(), "signin", { sub: "sub-owner", email: "owner@one.test", email_verified: true });
    const consent = W.one(SEAT_CONSENT_SQL.replace("{org}", "2"), "owner@one.test");
    const holds = W.one(INVITE_SEAT_USE_SQL.replace("{org}", "1"), "one-owner");
    return [
      [again.status === 302 && again.location === "/account" && W.one("SELECT google_sub FROM accounts WHERE email = 'reviewer-claude@review.sharingu.xyz'").google_sub === null,
        `G15 · an account Google never signed in (a reviewer's): its passphrase signs in, its subject none (${again.status} ${again.location})`],
      [g.cb && g.cb.status === 302 && consent && Number(consent.ask) === 1 && holds && Number(holds.holds) === 1,
        "G15 · a Google-linked account stands: another org's seat for its email waits for its yes; its seat's invite holds (no link sets a passphrase on it)"],
    ];
  },
  async G16() {
    const W = await world();
    const approve = (email) => W.w.db.prepare("UPDATE access_requests SET status = 'approved', approved_at = ? WHERE email = ? AND status = 'open'").run(new Date().toISOString(), email);
    const org = (slug, extra = {}) => ({ web: "1", name: `Org ${slug}`, slug, product: "Gee", line: "A tool for gee", stage: "building", ...extra });
    const founded = (email) => W.one("SELECT o.slug FROM org o JOIN accounts a ON a.id = o.created_by_account WHERE a.email = ?", email);
    const joined = async (n) => {
      const b = W.browser(), id = who(n);
      await W.google(b, "join", id);
      await b.call("POST", "/request-access", { form: { web: "1", google: "1", name: id.name, ...PROFILE } });
      approve(id.email);
      return { b, id };
    };
    // fresh: no passphrase asked, the org made with the session's email
    const f = await joined("fresh1");
    const fresh = await f.b.call("GET", "/orgs/new", { nav: true });
    const json = await W.w.fetch(new Request(O + "/orgs", { method: "POST", headers: { "content-type": "application/json", cookie: `__Host-ar_session=${f.b.jar.get("__Host-ar_session")}` },
      body: JSON.stringify({ email: f.id.email, name: "Json Org", slug: "json-org" }) }));
    const made = await f.b.call("POST", "/orgs", { form: org("fresh-one", { email: "someone@else.test" }) });
    // stale: the passphrase field and Google again; the POST refused with the offer; Google again lands on the form, which creates it
    const t = await joined("stale1");
    W.w.db.prepare("UPDATE account_sessions SET proven_at = ? WHERE account_id = (SELECT id FROM accounts WHERE email = ?)").run(new Date(Date.now() - 11 * 60000).toISOString(), t.id.email);
    const staleForm = await t.b.call("GET", "/orgs/new", { nav: true });
    const staleTry = await t.b.call("POST", "/orgs", { form: org("stale-one", { email: t.id.email }) }), staleMade = !!founded(t.id.email);
    const again = await W.google(t.b, "signin", t.id, { query: { next: "/orgs/new" } });
    const madeAfter = await t.b.call("POST", "/orgs", { form: org("stale-one", { email: t.id.email }) });
    // a passphrase account: unchanged
    const p = await W.verifiedByEmail("pass1@gee.test");
    approve("pass1@gee.test");
    const passForm = await p.call("GET", "/orgs/new", { nav: true });
    const empty = await p.call("POST", "/orgs", { form: org("pass-one", { email: "pass1@gee.test" }) }), emptyMade = !!founded("pass1@gee.test");
    const typed = await p.call("POST", "/orgs", { form: org("pass-one", { email: "pass1@gee.test", password: PASS }) });
    // a Google-only person SEATED in another org (org 1, by SQL as an admin's add-person seats it): its Google sign-in opens an ORG session
    const s = await joined("seated1");
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('seated-one', 'Seated', ?, 'member', ?, 1, ?, 1)").run(s.id.email, sha("seated-key"), new Date().toISOString());
    const sb = W.browser(), sg = await W.google(sb, "signin", s.id, { query: { next: "/orgs/new" } });
    const seatedForm = await sb.call("GET", "/orgs/new", { nav: true });
    const seatedMade = await sb.call("POST", "/orgs", { form: org("seated-one", { email: s.id.email }) });
    const anonForm = await W.browser().call("GET", "/orgs/new", { nav: true });
    return [
      [fresh.status === 200 && /data-region="google-step-up"/.test(fresh.text) && !/name="password"/.test(fresh.text) && fresh.text.includes(`value="${f.id.email}"`),
        `G16 · fresh: /orgs/new asks no passphrase, the email the session's (${fresh.status})`],
      [made.status === 200 && /data-screen="org-made"/.test(made.text) && founded(f.id.email) && founded(f.id.email).slug === "fresh-one" && !W.one("SELECT 1 AS x FROM accounts WHERE email = 'someone@else.test'"),
        `G16 · fresh: its form creates the org with no passphrase, for the session's account (a typed email ignored) (${made.status})`],
      [json.status === 422 && !W.one("SELECT 1 AS x FROM org WHERE slug = 'json-org'"), `G16 · a JSON POST /orgs with that fresh session and no passphrase: unchanged, 422 (${json.status})`],
      [/name="password"/.test(staleForm.text) && /data-region="google-step-up"/.test(staleForm.text) && /intent=signin&amp;next=%2Forgs%2Fnew/.test(staleForm.text),
        "G16 · stale: the passphrase field, and Continue with Google back to the form beside it"],
      [staleTry.status === 401 && /more than 10 minutes old/.test(staleTry.text) && /data-region="google-step-up"/.test(staleTry.text) && !staleMade,
        `G16 · stale: the POST refused 401 with the offer, nothing made (${staleTry.status})`],
      [again.cb && again.cb.status === 302 && again.cb.location === "/orgs/new" && madeAfter.status === 200 && founded(t.id.email) && founded(t.id.email).slug === "stale-one",
        `G16 · Google again lands on the form, which creates the org (${again.cb && again.cb.location}, ${madeAfter.status})`],
      [/<input type="password" id="password" name="password" autocomplete="current-password" required/.test(passForm.text) && !/google-step-up/.test(passForm.text)
        && empty.status === 422 && !emptyMade && typed.status === 200 && founded("pass1@gee.test").slug === "pass-one",
        `G16 · a passphrase account unchanged: its field required, empty 422, its passphrase creates the org (${empty.status}, ${typed.status})`],
      [sg.cb && sg.cb.status === 302 && !/^t_a_/.test(sb.jar.get("__Host-ar_session") || "") && /data-region="google-step-up"/.test(seatedForm.text) && !/name="password"/.test(seatedForm.text)
        && seatedMade.status === 200 && founded(s.id.email) && founded(s.id.email).slug === "seated-one",
        `G16 · a Google-only person seated elsewhere (an ORG session): the fresh step-up on its form, which creates its org (${sg.cb && sg.cb.status}, ${seatedMade.status})`],
      [/data-region="sign-out-link"/.test(fresh.text) && !/data-region="sign-in-link"/.test(fresh.text) && /data-region="sign-out-link"/.test(seatedForm.text) && /data-region="sign-in-link"/.test(anonForm.text) && !/data-region="sign-out-link"/.test(anonForm.text),
        "G16 · the org form's top bar: Sign out to an account session and to an org session, Sign in to no session"],
    ];
  },
  async G17() {
    const { identityOf } = await mod("google.js");
    const base = { sub: "s", email_verified: true };
    const auth = (email, hd) => (identityOf({ ...base, email, ...(hd === undefined ? {} : { hd }) }) || {}).authoritative;
    const W = await world();
    // an account whose email Google does not run (an outside address a Google account was made on), verified by email (a passphrase)
    const owner = await W.verifiedByEmail("out@outside.test");
    const before = W.one("SELECT COUNT(*) AS n FROM account_sessions WHERE revoked = 0 AND account_id = (SELECT id FROM accounts WHERE email = 'out@outside.test')").n;
    const b = W.browser(), g = await W.google(b, "signin", { sub: "sub-out", email: "out@outside.test", email_verified: true, name: "Out", hd: null });
    const unlinked = W.one("SELECT google_sub FROM accounts WHERE email = 'out@outside.test'").google_sub, signedAfterLinkPage = b.jar.has("__Host-ar_session");
    const fails0 = W.one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0").n;
    const wrong = await b.call("POST", "/auth/google/link", { form: { password: "not-the-passphrase-1" } });
    const stillUnlinked = W.one("SELECT google_sub FROM accounts WHERE email = 'out@outside.test'").google_sub, fails1 = W.one("SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0").n;
    const signedAfterWrong = b.jar.has("__Host-ar_session");
    const xb = W.browser(); xb.jar.set("__Host-g_link", b.jar.get("__Host-g_link") || "");   // the same ticket, posted from another site
    const cross = await xb.call("POST", "/auth/google/link", { form: { password: PASS }, headers: { "sec-fetch-site": "cross-site" } });
        const right = await b.call("POST", "/auth/google/link", { form: { password: PASS } });
    const linked = W.one("SELECT google_sub, pass_hash FROM accounts WHERE email = 'out@outside.test'");
    const oldEnded = W.one("SELECT COUNT(*) AS n FROM account_sessions WHERE revoked = 0 AND account_id = (SELECT id FROM accounts WHERE email = 'out@outside.test')").n;
    const ownerStatus = await owner.call("GET", "/account", { nav: true });
    const nb = W.browser(), ng = await W.google(nb, "join", { sub: "sub-new-out", email: "new@outside.test", email_verified: true, name: "New", hd: null });
    return [
      [auth("a@gmail.com") === true && auth("a@googlemail.com") === true && auth("a@gee.test", "gee.test") === true && auth("a@gee.test", "GEE.test") === true
        && auth("a@gee.test") === false && auth("a@gee.test", "other.test") === false && auth("a@sub.gee.test", "gee.test") === false,
        "G17 · authoritative: gmail.com, googlemail.com, or the email's own domain as the token's hd; no hd, another hd, a subdomain: not"],
      [before >= 1 && g.cb && g.cb.status === 200 && /data-screen="google-link"/.test(g.cb.text) && g.cb.text.includes('value="out@outside.test" readonly') && g.cb.cookies.some((c) => /^__Host-g_link=[0-9a-f]{64};.*HttpOnly; Secure; SameSite=Lax/.test(c))
        && !signedAfterLinkPage && unlinked === null,
        `G17 · an account on an outside email: the link page (the passphrase asked, the email locked), nothing linked, no session (${g.cb && g.cb.status})`],
      [wrong.status === 401 && /data-screen="google-link"/.test(wrong.text) && /data-field-error/.test(wrong.text) && stillUnlinked === null && fails1 === fails0 + 1 && !signedAfterWrong && cross.status === 403,
        `G17 · a wrong passphrase: the page again (401), still unlinked, the attempt counted (${fails0} -> ${fails1}); a cross-site POST refused (${cross.status})`],
      [right.status === 302 && right.location === "/account" && /^t_a_/.test(b.jar.get("__Host-ar_session") || "") && linked.google_sub === "sub-out" && !!linked.pass_hash && !b.jar.has("__Host-g_link")
        && oldEnded === 1 && ownerStatus.status === 302,
        `G17 · the right one links and signs in (${right.status} ${right.location}); the account's earlier session ended (the old browser sent to sign in: ${ownerStatus.status})`],
      [ng.cb && ng.cb.status === 200 && /data-screen="google-no-account"/.test(ng.cb.text) && /data-vouched="0"/.test(ng.cb.text) && !nb.jar.has("__Host-g_join") && !W.one("SELECT 1 AS x FROM accounts WHERE email = 'new@outside.test'"),
        `G17 · a new person on an outside email: "No account yet" for the emailed join, no Google ticket (${ng.cb && ng.cb.status})`],
    ];
  },
  async G18() {
    const W = await world(), at = new Date().toISOString();
    // org 1's admin seats victim@gee.test and redeems the invite itself (as THE INVITE LINK leaves it: the passphrase, the org's mark)
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('victim-seat', 'Victim', 'victim@gee.test', 'member', ?, 1, ?, 1)").run(sha("victim-seat-key"), at);
    W.w.db.prepare("UPDATE accounts SET pass_hash = ?, pass_salt = ?, invited_org = 1 WHERE email = 'victim@gee.test'").run(pbkdf("the-squatters-passphrase"), SALT);
    const squat = await W.w.fetch(new Request(O + "/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "victim@gee.test", password: "the-squatters-passphrase" }) }));
    const sq = await squat.json().catch(() => ({}));
    const acct = W.one("SELECT id FROM accounts WHERE email = 'victim@gee.test'").id;
    W.w.db.prepare("INSERT INTO account_resets (token_hash, account_id, created_at, expires_at) VALUES ('reset-open', ?, ?, ?)").run(acct, at, new Date(Date.now() + 600000).toISOString());
    const b = W.browser(), g = await W.google(b, "signin", { sub: "sub-victim", email: "victim@gee.test", email_verified: true, name: "Victim" });
    const a = W.one("SELECT google_sub, pass_hash, pass_salt, invited_org FROM accounts WHERE id = ?", acct);
    const seat = W.one("SELECT active, pending FROM people WHERE id = 'victim-seat'");
    const live = W.one("SELECT COUNT(*) AS n FROM tokens WHERE revoked = 0 AND token_hash = ?", sha(String(sq.token || ""))).n;
    const resetUsed = W.one("SELECT used_at FROM account_resets WHERE token_hash = 'reset-open'").used_at;
    const again = await W.w.fetch(new Request(O + "/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "victim@gee.test", password: "the-squatters-passphrase" }) }));
    const picker = await b.call("GET", "/orgs", { nav: true });
    // then a reset by email (the mailbox's proof) unlinks the subject
    await W.browser().call("POST", "/account/forgot", { form: { web: "1", email: "victim@gee.test" } });
    const m = (await W.mails()).filter((x) => x.to === "victim@gee.test" && /\/account\/reset\//.test(x.text)).pop();
    const t = (/\/account\/reset\/([0-9a-f]{48})/.exec((m && m.text) || "") || [])[1];
    const reset = await W.browser().call("POST", "/account/reset", { form: { web: "1", token: t, password: PASS, confirm: PASS } });
    const afterReset = W.one("SELECT google_sub FROM accounts WHERE id = ?", acct).google_sub;
    return [
      [squat.status === 200 && !!sq.token && g.cb && g.cb.status === 302 && live === 0, `G18 · the squatter's session (made with the invite's passphrase) is revoked by the owner's first Google sign-in (${g.cb && g.cb.status}, live ${live})`],
      [a.google_sub === "sub-victim" && a.pass_hash === null && a.pass_salt === null && a.invited_org === null && again.status === 401,
        `G18 · the invite's passphrase and its mark gone with the link: it signs in nowhere now (${again.status})`],
      [seat.active === 0 && seat.pending === 1 && g.cb.location === "/orgs" && /data-region|data-screen/.test(picker.text) && picker.text.includes("victim-seat"),
        `G18 · the seat WAITS for the owner's yes: the picker, never the org entered (${g.cb.location}; active ${seat.active}, pending ${seat.pending})`],
      [!!resetUsed, "G18 · the account's open reset link spent with the link"],
      [reset.status === 303 && afterReset === null, `G18 · a reset by email unlinks the Google subject (${reset.status}, ${afterReset})`],
    ];
  },
  async G19() {
    const W = await world(), at = new Date().toISOString();
    // two add-person shells (an account made by seating its email, no passphrase, no subject): one seated, one whose seat is gone
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('shell-a', 'Shell A', 'shella@gee.test', 'member', ?, 1, ?, 1)").run(sha("shell-a-key"), at);
    W.w.db.prepare("INSERT INTO people (id, name, email, role, key_hash, active, created_at, org) VALUES ('shell-b', 'Shell B', 'shellb@gee.test', 'member', ?, 1, ?, 1)").run(sha("shell-b-key"), at);
    W.w.db.prepare("UPDATE people SET active = 0 WHERE id = 'shell-b'").run();
    const shellA = W.one("SELECT id FROM accounts WHERE email = 'shella@gee.test'").id, shellB = W.one("SELECT id FROM accounts WHERE email = 'shellb@gee.test'").id;
    await W.browser().call("POST", "/request-access", { form: { web: "1", name: "Shell A", email: "shella@gee.test", password: PASS, confirm: PASS, ...PROFILE } });
    const ms = (await W.mails()).filter((m) => m.to === "shella@gee.test");
    const t = (/\/account\/verify\/([0-9a-f]{48})/.exec(((ms[ms.length - 1]) || {}).text || "") || [])[1];
    const v = await W.browser().call("POST", "/account/verify", { form: { web: "1", token: t, password: PASS } });
    const a = W.one("SELECT id, pass_hash FROM accounts WHERE email = 'shella@gee.test'");
    const b = W.browser(), id = { sub: "sub-shellb", email: "shellb@gee.test", email_verified: true, name: "Shell B" };
    const g = await W.google(b, "join", id);
    const post = await b.call("POST", "/request-access", { form: { web: "1", google: "1", name: "Shell B", ...PROFILE } });
    const bb = W.one("SELECT id, google_sub FROM accounts WHERE email = 'shellb@gee.test'"), req = W.one("SELECT status, account_id FROM access_requests WHERE email = 'shellb@gee.test'");
    return [
      [ms.length === 1 && /Verify your email/.test(ms[0].subject) && !!t && v.status === 303 && a.id === shellA && !!a.pass_hash,
        `G19 · a seated shell's email joins as anyone's: the verification email (${ms.map((m) => m.subject).join(" | ")}), then the passphrase the shell's own (${v.status})`],
      [g.cb && g.cb.status === 303 && g.cb.location === "/request-access" && post.status === 303 && bb.id === shellB && bb.google_sub === "sub-shellb" && req && req.status === "open" && req.account_id === shellB,
        `G19 · a seatless shell joins through Google: the shell's own account linked, its request open (${g.cb && g.cb.status}, ${post.status} ${post.location})`],
    ];
  },
};

// ---- the mutants: each must turn its case(s) red ----
const MUTANTS = [
  { name: "the nonce not checked", file: "src/google.js",
    from: "  if (typeof nonce !== \"string\" || !nonce || claims.nonce !== nonce) return { ok: false, why: \"nonce\" };\n", to: "", red: ["G1", "G12"] },
  { name: "an unverified email taken", file: "src/google.js",
    from: "  if (claims.email_verified !== true || typeof claims.email !== \"string\" || !claims.email) return { ok: false, why: \"email_unverified\" };\n", to: "", red: ["G1", "G12"] },
  { name: "any alg taken (the token picks its verifier)", file: "src/google.js",
    from: "  if (head.alg !== \"RS256\") return { ok: false, why: \"alg\" };\n", to: "  if (head.alg === \"none\" || head.alg === \"HS256\") return { ok: true, claims };\n", red: ["G1"] },
  { name: "the audience not checked", file: "src/google.js",
    from: "  if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId) && claims.azp === clientId))) return { ok: false, why: \"aud\" };\n  if (claims.azp != null && claims.azp !== clientId) return { ok: false, why: \"aud\" };\n", to: "", red: ["G1", "G12"] },
  { name: "the state not bound to the browser (the query's state taken alone)", file: "src/index.js",
    from: "      if (!(await sameState(q.get(\"state\"), held))) return refused(\"expired\");\n      const rec = await takeFlow(env, held);", to: "      const rec = await takeFlow(env, q.get(\"state\"));", red: ["G11"] },
  { name: "the state kept after its use", file: "src/google.js",
    from: "  await env.OAUTH_KV.delete(key);\n  let rec = null;", to: "  let rec = null;", red: ["G4", "G11"] },
  { name: "a different Google account taken for a linked one", file: "src/accounts.js",
    from: "  if (account.google_sub !== g) return { ...out, account, verdict: \"other_sub\" };\n", to: "", red: ["G10"] },
  { name: "the join takes the email from the form", file: "src/index.js",
    from: "  const read = readRequest({ ...body, email: who.email }), consent = readConsent(body);", to: "  const read = readRequest({ ...body, email: body.email || who.email }), consent = readConsent(body);", red: ["G8"] },
  { name: "the connect started by a link", file: "src/index.js",
    from: "      if (!GOOGLE_INTENTS.includes(intent) || (intent === \"connect\") !== post) return refused(\"failed\", 400);", to: "      if (!GOOGLE_INTENTS.includes(intent)) return refused(\"failed\", 400);", red: ["G14"] },
  { name: "any origin redirects", file: "src/google.js",
    from: "  return client.origins.includes(u.origin) ? u.origin + CALLBACK_PATH : \"\";", to: "  return u.origin + CALLBACK_PATH;", red: ["G3", "G7"] },
  { name: "a stored origin not checked (http off loopback, a path)", file: "src/google.js",
    from: "  return c.origins.map(originProblem).find(Boolean) || \"\";\n", to: "  return \"\";\n", red: ["G3"] },
  { name: "the step-up's freshness not checked", file: "src/accounts.js",
    from: "  if (googleFreshness(row) !== \"fresh\") return { ...out, verdict: \"stale\" };\n", to: "", red: ["G16"] },
  { name: "the step-up taken from a passphrase's session", file: "src/accounts.js",
    from: "s.revoked = 0 AND s.expires_at > ?2 AND s.proven_how = 'google' AND a.google_sub IS NOT NULL\";", to: "s.revoked = 0 AND s.expires_at > ?2\";", red: ["G16"] },
  { name: "Google taken as answering for every domain", file: "src/google.js",
    from: "  const authoritative = GOOGLE_MAIL_DOMAINS.includes(domain) || (typeof claims.hd === \"string\" && claims.hd.toLowerCase() === domain);", to: "  const authoritative = true;", red: ["G17"] },
  { name: "the first link ends no session", file: "src/accounts.js",
    from: "db(env).prepare(GOOGLE_LINK_END_TOKENS_SQL).bind(id), ", to: "", red: ["G18"] },
  { name: "the first link keeps an invite's passphrase", file: "src/accounts.js",
    from: "pass_hash = CASE WHEN invited_org IS NULL THEN pass_hash END, \" +\n  \"pass_salt = CASE WHEN invited_org IS NULL THEN pass_salt END, invited_org = NULL WHERE", to: "invited_org = NULL WHERE", red: ["G18"] },
  { name: "an invite-made account's seats entered silently", file: "src/accounts.js",
    from: "    db(env).prepare(GOOGLE_LINK_SEATS_WAIT_SQL).bind(id), ", to: "    ", red: ["G18"] },
  { name: "a reset keeps the Google link", file: "src/accounts.js", from: "invited_org = NULL, google_sub = NULL, updated_at = ?2", to: "invited_org = NULL, updated_at = ?2", red: ["G18"] },
  { name: "an add-person shell held as an account", file: "src/accounts.js", from: "  return !!(a && (a.pass_hash != null || a.google_sub != null));", to: "  return !!a;", red: ["G19"] },
  { name: "no Google proof on an org session", file: "src/index.js",
    from: "  if (!seatless && signin.session === \"account\") await putGoogleProof(env, opened.token, signin.account.id);\n", to: "", red: ["G16"] },
  { name: "the local IdP taken from any value", file: "src/google.js",
    from: "  const m = /^(127\\.0\\.0\\.1|localhost):([1-9][0-9]{1,4})$/.exec(v);", to: "  const m = /^(.+):([0-9]+)$/.exec(v.replace(/^https?:\\/\\//, \"\"));", red: ["G3"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };

try {
  for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
  for (const m of MUTANTS) {
    let dir = null;
    try {
      dir = mkdtempSync(join(ENGINE, ".google-mutation-"));
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
} finally { await fake.close(); }
console.log(`${failed ? "✗" : "✓"} google selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
