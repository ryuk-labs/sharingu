// tools/email-selftest.mjs — sprint 21, slice 21.4a (src/email.js THE SEND and THE CAP; src/mails.js the emails; migrate-081's mail_days
// and mail_addresses): the one send every email goes through, over a node:sqlite D1 built from boot.sql (tools/fixtures/sqlite-worker.mjs
// d1), its transport a recorder or the local capture.
//   E1 · the window: dayOf is the UTC day; the window is the 31 days that end today (its first day counted, the day before it not);
//        addressDigest is one digest per address whatever its case, never the address itself
//   E2 · THE CAP: with 2,899 counted in the window the next counted send goes (2,900), the one after is refused "cap" and its
//        message is never built; a day before the window is deleted by the next send and never counted
//   E3 · atomic: with ONE unit left, two sends at once — exactly one goes
//   E4 · the per-address limit: three counted sends a day to one address, the fourth refused "address_limit" WITHOUT spending the
//        cap (mail_days unmoved); another address still goes; the next day the address goes again (yesterday's rows deleted);
//        mail_addresses holds a digest, never the address; a send not held to it (perAddress false) touches no address row
//   E5 · the alert: at the cap the first refusal of the day sends the team ONE alert (to ryuk@, cc acie@, uncounted), the next
//        refusal none; the next day one again
//   E6 · a team send (counted false) moves no counter and goes even at the cap
//   E7 · the mailer: MAIL_CAPTURE "kv" writes the local capture (the binding never called), the EMAIL binding otherwise (called with
//        From hello@sharingu.xyz, to, cc, subject, html, text), none at all "no_mailer" with nothing counted; a send that throws is
//        "send_failed" with its code; build() answering null is "nothing"; mailPaused says the cap
//   E8 · the emails: each of the six has its subject, an HTML card (at most one orange button, its link again as text, no image but
//        the origin's own /assets/, no image at all without an origin) and a plain-text twin carrying the same link; a person's
//        value is escaped; the team's new-request email names the company, role and team size, never a name or an email
// And the MUTATION PROOF: each named mutant (a scratch copy of src/) must turn its case(s) red, by an assertion, never a crash.
// Exit 1 on any failure. A gate step.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { d1, kv } = await import(pathToFileURL(join(ENGINE, "tools", "fixtures", "sqlite-worker.mjs")).href);
let MUT = {};
const mod = (f) => import(pathToFileURL(join(MUT.src || join(ENGINE, "src"), f)).href);

// a fresh database (boot.sql) and a recording mailer
function world() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(ENGINE, "boot.sql"), "utf8"));
  const sent = [];
  const mailer = { kind: "test", send: async (m) => { sent.push(m); } };
  const counted = () => Number(db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM mail_days").get().n);
  return { db, env: { DB: d1(db) }, sent, mailer, counted };
}
const MSG = { subject: "S", html: "<p>h</p>", text: "t" };
const DAY = "2026-10-14T12:00:00.000Z", NEXT = "2026-10-15T12:00:00.000Z";

const CASES = {
  async E1() {
    const E = await mod("email.js");
    const W = world();
    W.db.prepare("INSERT INTO mail_days (day, n) VALUES ('2026-09-14', 7), ('2026-09-13', 100)").run();
    const inWindow = await E.mailPaused(W.env, DAY);
    const sum = Number(W.db.prepare(E.MAIL_WINDOW_SQL).get(E.windowStartOf(DAY)).n);
    const a = await E.addressDigest("Ada@X.test"), b = await E.addressDigest(" ada@x.test ");
    return [
      [E.dayOf(DAY) === "2026-10-14" && E.windowStartOf(DAY) === "2026-09-14" && E.MAIL_WINDOW_DAYS === 31 && E.MAIL_CAP === 2900 && E.MAIL_PER_ADDRESS_DAY === 3,
        `E1 · the window: the 31 days that end today (${E.windowStartOf(DAY)} to ${E.dayOf(DAY)}), the cap ${E.MAIL_CAP}, three a day to one address`],
      [sum === 7 && !inWindow, `E1 · the window's first day counted, the day before it not (${sum})`],
      [a === b && /^[0-9a-f]{64}$/.test(a) && !a.includes("ada"), "E1 · one digest per address whatever its case and spaces, never the address"],
    ];
  },
  async E2() {
    const E = await mod("email.js");
    const W = world();
    W.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?), ('2026-01-01', 5000)").run(E.windowStartOf(DAY), E.MAIL_CAP - 1);
    let built = 0;
    const build = () => { built++; return MSG; };
    const one = await E.sendMail(W.env, W.mailer, { to: "a@x.test", at: DAY, build });
    const two = await E.sendMail(W.env, W.mailer, { to: "b@x.test", at: DAY, build });
    return [
      [one.sent === true && W.counted() === E.MAIL_CAP && W.sent.filter((m) => m.to === "a@x.test").length === 1, `E2 · at 2,899 the next counted send goes (${W.counted()})`],
      [two.sent === false && two.reason === "cap" && built === 1 && !W.sent.some((m) => m.to === "b@x.test"), `E2 · at 2,900 the next is refused "${two.reason}", its message never built (${built} built)`],
      [!W.db.prepare("SELECT 1 FROM mail_days WHERE day = '2026-01-01'").get(), "E2 · a day before the window deleted by the next send"],
    ];
  },
  async E3() {
    const E = await mod("email.js");
    const W = world();
    W.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?)").run(E.windowStartOf(DAY), E.MAIL_CAP - 1);
    const both = await Promise.all([E.sendMail(W.env, W.mailer, { to: "a@x.test", at: DAY, build: () => MSG }), E.sendMail(W.env, W.mailer, { to: "b@x.test", at: DAY, build: () => MSG })]);
    return [[both.filter((r) => r.sent).length === 1 && W.counted() === E.MAIL_CAP, `E3 · one unit left, two at once: exactly one goes (${both.map((r) => r.sent ? "sent" : r.reason).join(", ")})`]];
  },
  async E4() {
    const E = await mod("email.js");
    const W = world();
    const go = (to, at = DAY, o = {}) => E.sendMail(W.env, W.mailer, { to, at, build: () => MSG, ...o });
    const first3 = [await go("a@x.test"), await go("A@x.test"), await go("a@x.test")];
    const c3 = W.counted();
    const fourth = await go("a@x.test");
    const c4 = W.counted();
    const other = await go("b@x.test");
    const next = await go("a@x.test", NEXT);
    const rows = W.db.prepare("SELECT day, address, n FROM mail_addresses ORDER BY day, address").all();
    const before = W.db.prepare("SELECT COUNT(*) AS n FROM mail_addresses").get().n;
    const unheld = await go("a@x.test", NEXT, { perAddress: false });
    return [
      [first3.every((r) => r.sent) && fourth.sent === false && fourth.reason === "address_limit" && c3 === 3 && c4 === c3, `E4 · three to one address (any case), the fourth "${fourth.reason}" and the cap unmoved by it (${c3} -> ${c4})`],
      [other.sent && next.sent && rows.every((r) => r.day === "2026-10-15") && rows.length === 1 && !JSON.stringify(rows).includes("x.test"),
        `E4 · another address still goes; the next day the address goes again, yesterday's rows deleted; a digest, never the address (${rows.length} row)`],
      [unheld.sent && W.db.prepare("SELECT COUNT(*) AS n FROM mail_addresses").get().n === before && W.db.prepare("SELECT n FROM mail_addresses").get().n === 1, "E4 · a send not held to the limit touches no address row"],
    ];
  },
  async E5() {
    const E = await mod("email.js");
    const W = world();
    W.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?)").run(E.windowStartOf(NEXT), E.MAIL_CAP);
    const r = [await E.sendMail(W.env, W.mailer, { to: "a@x.test", at: DAY, build: () => MSG }), await E.sendMail(W.env, W.mailer, { to: "b@x.test", at: DAY, build: () => MSG })];
    const day1 = W.sent.filter((m) => m.to === E.TEAM_TO);
    await E.sendMail(W.env, W.mailer, { to: "c@x.test", at: NEXT, build: () => MSG });
    const both = W.sent.filter((m) => m.to === E.TEAM_TO);
    return [
      [r.every((x) => x.reason === "cap") && day1.length === 1 && day1[0].cc === E.TEAM_CC && /paused/i.test(day1[0].subject) && /2900|2,900/.test(day1[0].text) && W.counted() === E.MAIL_CAP,
        `E5 · at the cap: ONE alert to ${E.TEAM_TO} cc ${E.TEAM_CC} for two refusals ("${day1[0] && day1[0].subject}"), uncounted`],
      [both.length === 2, `E5 · the next day one again (${both.length})`],
    ];
  },
  async E6() {
    const E = await mod("email.js");
    const W = world();
    W.db.prepare("INSERT INTO mail_days (day, n) VALUES (?, ?)").run(E.windowStartOf(DAY), E.MAIL_CAP);
    const before = JSON.stringify(W.db.prepare("SELECT * FROM mail_days").all());
    const r = await E.sendMail(W.env, W.mailer, { to: E.TEAM_TO, cc: E.TEAM_CC, counted: false, at: DAY, build: () => MSG });
    return [[r.sent && JSON.stringify(W.db.prepare("SELECT * FROM mail_days").all()) === before && W.db.prepare("SELECT COUNT(*) AS n FROM mail_addresses").get().n === 0 && W.sent[0].cc === E.TEAM_CC,
      "E6 · a team send moves no counter and goes even at the cap"]];
  },
  async E7() {
    const E = await mod("email.js");
    const W = world();
    const calls = [];
    const binding = { send: async (m) => { calls.push(m); } };
    const K = kv();
    const cap = E.mailerOf({ MAIL_CAPTURE: "kv", OAUTH_KV: K, EMAIL: binding }), bind = E.mailerOf({ EMAIL: binding }), none = E.mailerOf({});
    await E.sendMail(W.env, cap, { to: "a@x.test", at: DAY, build: () => MSG });
    const keys = (await K.list({ prefix: E.MAIL_CAPTURE_PREFIX })).keys;
    const stored = keys.length ? JSON.parse(await K.get(keys[0].name)) : {};
    await E.sendMail(W.env, bind, { to: "b@x.test", cc: "c@x.test", at: DAY, build: () => MSG });
    const c0 = W.counted();
    const nm = await E.sendMail(W.env, none, { to: "d@x.test", at: DAY, build: () => MSG });
    const c1 = W.counted();
    const failing = { kind: "test", send: async () => { throw Object.assign(new Error("boom"), { code: "E_DELIVERY" }); } };
    const failed = await E.sendMail(W.env, failing, { to: "e@x.test", at: DAY, build: () => MSG });
    const nothing = await E.sendMail(W.env, W.mailer, { to: "f@x.test", at: DAY, build: () => null });
    W.db.prepare("INSERT INTO mail_days (day, n) VALUES ('2026-09-20', ?)").run(E.MAIL_CAP);
    return [
      [cap.kind === "capture" && keys.length === 1 && stored.to === "a@x.test" && stored.from.email === "hello@sharingu.xyz" && stored.subject === "S" && calls.filter((m) => m.to === "a@x.test").length === 0,
        "E7 · MAIL_CAPTURE kv: the message in the local capture (its KV, mail-capture:…), the binding never called"],
      [bind.kind === "binding" && calls.length === 1 && calls[0].from.email === "hello@sharingu.xyz" && calls[0].from.name === "sharingu" && calls[0].to === "b@x.test" && calls[0].cc === "c@x.test" && calls[0].html && calls[0].text,
        "E7 · otherwise the EMAIL binding: From sharingu <hello@sharingu.xyz>, to, cc, subject, html and text"],
      [none === null && nm.reason === "no_mailer" && c1 === c0, `E7 · no binding and no capture: "${nm.reason}", nothing counted`],
      [failed.sent === false && failed.reason === "send_failed" && failed.code === "E_DELIVERY" && nothing.reason === "nothing" && (await E.mailPaused(W.env, DAY)) === true,
        `E7 · a send that throws "${failed.reason}" (${failed.code}); build null "${nothing.reason}"; mailPaused at the cap`],
    ];
  },
  async E8() {
    const M = await mod("mails.js");
    const o = "https://agent.example.test";
    const evil = "<script>x</script>";
    const all = {
      verify: M.verifyMail({ origin: o, link: `${o}/account/verify/${"a".repeat(48)}`, name: evil }), already: M.alreadyMail({ origin: o }),
      inMail: M.inMail({ origin: o, name: "Ada", company: evil }), reset: M.resetMail({ origin: o, link: `${o}/account/reset/${"b".repeat(48)}` }),
      team: M.teamRequestMail({ origin: o, request: { id: "r1", company: "Analytical", role: "Founder", team_size: "2-10", name: "Ada Lovelace", email: "ada@x.test" } }),
      cap: M.capMail({ total: 2900, cap: 2900, days: 31 }),
    };
    const off = Object.entries(all).filter(([k, m]) => {
      const imgs = m.html.match(/<img [^>]*src="([^"]+)"/g) || [];
      const button = (m.html.match(/border-bottom-width:3px/g) || []).length;
      const link = (/<a href="([^"]+)" style="display:inline-block/.exec(m.html) || [])[1];
      return !(m.subject && /^<!doctype html>/.test(m.html) && m.text && button <= 1 && (!link || (m.text.includes(link) && m.html.split(link).length >= 3))
        && imgs.every((x) => x.includes(`src="${o}/assets/brand/uchan-mark.png`)) && imgs.length <= 1 && (k !== "cap" || imgs.length === 0) && !/<script/.test(m.html));
    }).map(([k]) => k);
    return [
      [off.length === 0, `E8 · six emails, each a subject, an HTML card (at most one orange button, its link again as text, no image but our own, none without an origin) and a plain-text twin with the link (off: ${off.join(", ") || "none"})`],
      [all.verify.html.includes("&lt;script&gt;") && all.inMail.html.includes("&lt;script&gt;") && all.verify.subject === "Verify your email" && all.inMail.subject === "You're in" && all.reset.subject === "Reset your passphrase",
        "E8 · a person's value escaped; the subjects as ruled (Verify your email, You're in, Reset your passphrase)"],
      [/Analytical/.test(all.team.text) && /Founder/.test(all.team.text) && /2-10/.test(all.team.text) && !/Ada|ada@/.test(all.team.text + all.team.html + all.team.subject), "E8 · the team's new-request email: company, role, team size, never a name or an email"],
    ];
  },
};

const MUTANTS = [
  { name: "the cap never checked", file: "src/email.js", from: "(SELECT COALESCE(SUM(w.n), 0) FROM mail_days w WHERE w.day >= ?2) < ?3 ", to: "?3 IS NOT NULL ", red: ["E2", "E3"] },
  { name: "the refused address spending the cap (no nonce guard)", file: "src/email.js",
    from: "AND (?4 IS NULL OR EXISTS (SELECT 1 FROM mail_addresses m WHERE m.day = ?1 AND m.address = ?4 AND m.nonce = ?5))", to: "AND (?4 IS NULL OR ?5 IS NOT NULL)", red: ["E4"] },
  { name: "no per-address limit", file: "src/email.js", from: "WHERE mail_addresses.n < ?4\"", to: "WHERE ?4 IS NOT NULL\"", red: ["E4"] },
  { name: "the alert every refusal", file: "src/email.js",
    from: "  if (!changed(await db(env).prepare(MAIL_ALERT_SQL).bind(dayOf(at)).run())) return;", to: "  await db(env).prepare(MAIL_ALERT_SQL).bind(dayOf(at)).run();", red: ["E5"] },
  { name: "a window of 32 days", file: "src/email.js", from: "(MAIL_WINDOW_DAYS - 1) * 86400000", to: "MAIL_WINDOW_DAYS * 86400000", red: ["E1"] },
  { name: "the capture beside the binding (both)", file: "src/email.js",
    from: "  if (env && env.MAIL_CAPTURE === \"kv\") return env.OAUTH_KV ? captureMailer(env.OAUTH_KV) : null;\n", to: "", red: ["E7"] },
  { name: "the team's email naming the person", file: "src/mails.js", from: "  facts: [[\"Company\", request.company],", to: "  facts: [[\"Name\", request.name], [\"Company\", request.company],", red: ["E8"] },
];

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const runCase = async (name) => { try { return await CASES[name](); } catch (e) { return [[false, `${name} threw: ${String((e && e.stack) || e).slice(0, 400)}`]]; } };
for (const name of Object.keys(CASES)) for (const [c, l] of await runCase(name)) ok(c, l);
for (const m of MUTANTS) {
  let dir = null;
  try {
    dir = mkdtempSync(join(ENGINE, ".email-mutation-"));
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
console.log(`${failed ? "✗" : "✓"} email selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
