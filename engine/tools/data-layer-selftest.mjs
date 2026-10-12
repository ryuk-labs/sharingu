// tools/data-layer-selftest.mjs — the scoped data layer (sprint 6, 6.2; src/data.js) holds, offline: no wrangler, no network.
//   A · orgSql writes the reader's org in ({org}, {orgbucket}) and nothing else; a token with no signed-in org is refused
//   B · the sign-in: signIn takes the org of the row the credential found, one request reads one org, an env with no slot or a
//       row with no org is refused; signInEnv and platformEnv hand back a NEW env, never touching the one they were given
//   C · caches know the org: a request memo (src/reqmemo.js) is keyed by the org, the sign-in's own lookups are not; the isolate
//       caches (src/data.js orgCache) are keyed by the raw binding, then the org
//   D · the one rule that finds a project resolves a slug inside the reader's org (src/project.js keyInOrg, core.js projectArg);
//       projectClause scopes the org-level rows to the reader's org
//   E · the real worker (src/index.js over node:sqlite, two orgs in one database, through the door): org 2's owner reads its own
//       slug as its own project, never org 1's of the same slug, and none of org 1's rows by id or by name; org 1 reads as
//       before; each org's brand is its own row, its owner its own; the running counts' org-level bucket is each org's own.
//       Every "none of org 1's" check has its instrument: the same read as org 1 finds the row, so the refusal is the org's.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const imp = (p) => import(pathToFileURL(join(ENGINE, p)).href);
const D = await imp("src/data.js");
const { reqMemo, signInMemo, installReqMemo, forgetReqMemo } = await imp("src/reqmemo.js");
const { keyInOrg, projectClause } = await imp("src/project.js");
const { projectArg } = await imp("src/core.js");
const { timedD1, newTiming } = await imp("src/timing.js");
const { sqliteWorker, sha } = await imp("tools/fixtures/sqlite-worker.mjs");

let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`); };
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e && e.code === code; } };
const rejectsCode = async (p, code) => { try { await p; return false; } catch (e) { return e && e.code === code; } };

console.log("A · orgSql");
{
  const q = "SELECT * FROM t WHERE org = {org} AND p = {orgbucket} AND j = '{}' AND f = '{title body}'";
  ok(D.orgSql(q, 1) === "SELECT * FROM t WHERE org = 1 AND p = '' AND j = '{}' AND f = '{title body}'", "org 1: {org} is 1, {orgbucket} is '' (the statement every org-1 read always ran), other braces untouched");
  const two = D.orgSql(q, 2);
  ok(two.includes("org = 2") && two.includes("p = ('o2' || char(45, 45))"), `org 2: {org} is 2, {orgbucket} its key prefix written char(45, 45) -> ${two.slice(26, 70)}`);
  const sq = new DatabaseSync(":memory:");
  ok(sq.prepare("SELECT " + D.orgSql("{orgbucket}", 2) + " AS b").get().b === "o2--" && sq.prepare("SELECT " + D.orgSql("{orgbucket}", 1) + " AS b").get().b === "", "SQLite reads org 2's bucket as 'o2--' (migrate-067's bucket) and org 1's as ''");
  ok(D.orgSql("SELECT 1 FROM t WHERE x = ?", null) === "SELECT 1 FROM t WHERE x = ?", "a statement naming no org passes untouched, signed in or not");
  ok(throwsCode(() => D.orgSql(q, null), "org_unknown") && throwsCode(() => D.orgSql(q, 0), "org_unknown") && throwsCode(() => D.orgSql(q, "1"), "org_unknown") && throwsCode(() => D.orgSql(q, 1.5), "org_unknown"),
    "a statement naming the org with no org (or a non-integer one: never text a caller sent) is refused org_unknown");
  const seen = [];
  const env = { DB: { prepare: (s) => { seen.push(s); return { s }; }, batch: async (l) => l } };
  ok(throwsCode(() => D.db(env).prepare("SELECT 1 FROM people WHERE org = {org}"), "org_unknown") && seen.length === 0, "db(env) with no sign-in: the statement never reaches D1");
  D.db(env).prepare("SELECT 1 FROM people WHERE key_hash = ?");
  ok(seen.length === 1 && seen[0] === "SELECT 1 FROM people WHERE key_hash = ?", "db(env) runs a statement that names no org before a sign-in (the sign-in's own lookup)");
  const e1 = D.platformEnv(env, 3);
  D.db(e1).prepare("SELECT 1 FROM people WHERE org = {org}");
  ok(seen[1] === "SELECT 1 FROM people WHERE org = 3", `platformEnv(env, 3): the statement names org 3 (${seen[1]})`);
  ok(D.addressDb(env).org === null && throwsCode(() => D.addressDb(env).prepare("SELECT * FROM org WHERE id = {org}"), "org_unknown") && D.addressDb(e1).org === 3,
    "addressDb: no org at the root before a sign-in (7.4b: the platform's own brand, never org 1's; a token is refused), the signed-in org after");
  { const ea = D.installOrgSlot({ DB: env.DB }); D.installAddress(ea, { org: 2, slug: "two" });
    ok(D.addressDb(ea).org === 2, "addressDb: under an org's address before a sign-in, the org the address serves (its own brand on its sign-in)"); }
}

console.log("B · the sign-in");
{
  const env = D.installOrgSlot({});
  ok(D.readerOrg(env) === null, "a fresh request: no org");
  D.signIn(env, { id: "p", org: 2 });
  const copy = { ...env };
  ok(D.readerOrg(env) === 2 && D.readerOrg(copy) === 2, "signIn takes the row's org; every copy of the request's env (the seam's { ...env }) reads it");
  ok(D.signIn(env, { id: "q", org: 2 }) && D.readerOrg(env) === 2, "a second sign-in into the same org is the same request");
  ok(throwsCode(() => D.signIn(env, { id: "r", org: 1 }), "org_mismatch") && D.readerOrg(env) === 2, "a sign-in into ANOTHER org in the same request is refused org_mismatch; the org stays");
  ok(throwsCode(() => D.signIn(D.installOrgSlot({}), { id: "x" }), "org_unknown") && throwsCode(() => D.signIn(D.installOrgSlot({}), { id: "x", org: "two" }), "org_unknown")
    && throwsCode(() => D.signIn(D.installOrgSlot({}), { id: "x", org: 0 }), "org_unknown") && throwsCode(() => D.signIn(D.installOrgSlot({}), { id: "x", org: 1.5 }), "org_unknown"),
    "a row with no org, or one that is no org id (text, 0, a fraction), signs nobody in (org_unknown)");
  const shared = {};
  ok(throwsCode(() => D.signIn(shared, { id: "p", org: 1 }), "org_unknown") && !(D.ORG_SLOT in shared), "an env with no request slot (the runtime's shared env) is refused, and nothing is written onto it");
  const fresh = D.signInEnv(env, { id: "s", org: 1 });
  ok(D.readerOrg(fresh) === 1 && D.readerOrg(env) === 2 && fresh[D.ORG_SLOT] !== env[D.ORG_SLOT], "signInEnv: a NEW env in the signed-in person's org (POST /login); the ambient request's org untouched");
  const pe = D.platformEnv(env, 5);
  ok(D.readerOrg(pe) === 5 && D.readerOrg(env) === 2 && throwsCode(() => D.platformEnv(env, 0), "org_unknown"), "platformEnv: a new env for one org (the cron); an org that is no org refused");
}

console.log("C · caches know the org");
{
  const m = installReqMemo({});
  const a = D.installOrgSlot(m), b = { ...a, [D.ORG_SLOT]: { org: 2 } };   // one memo Map, two orgs (a cross-org request cannot happen; the memo still keys it)
  a[D.ORG_SLOT].org = 1;
  let n = 0;
  const v1 = await reqMemo(a, "owner", async () => (++n, "org one's"));
  const v2 = await reqMemo(b, "owner", async () => (++n, "org two's"));
  const v1b = await reqMemo(a, "owner", async () => (++n, "again"));
  ok(v1 === "org one's" && v2 === "org two's" && v1b === "org one's" && n === 2, "reqMemo: the same key under org 1 and org 2 is two reads, two answers; org 1 again is its memo");
  let s = 0;
  await signInMemo(a, "auth:h", async () => ++s); await signInMemo(b, "auth:h", async () => ++s);
  ok(s === 1, "signInMemo (the credential's own lookup) is keyed by the credential, never by the org it is about to find");
  forgetReqMemo(b, "owner");
  let k = 0;
  await reqMemo(a, "owner", async () => ++k); await reqMemo(b, "owner", async () => ++k);
  ok(k === 1, "forgetReqMemo drops the forgetting org's memo only");
  const cache = new WeakMap(), raw = { prepare() {} };
  const t1 = { DB: timedD1(raw, newTiming()) }, t2 = { DB: timedD1(raw, newTiming()) };
  D.orgCache(t1, cache, 1).set("one"); D.orgCache(t2, cache, 2).set("two");
  ok(D.orgCache(t2, cache, 1).get() === "one" && D.orgCache(t1, cache, 2).get() === "two", "orgCache: two requests' timed proxies over ONE raw binding share the isolate cache, org by org");
  ok(D.orgCache({ DB: { prepare() {} } }, cache, 1).get() === undefined && D.orgCache({}, cache, 1) === null, "another binding never reads it; no binding, no cache");
  D.orgCache(t1, cache, 1).drop();
  ok(D.orgCache(t1, cache, 1).get() === undefined && D.orgCache(t1, cache, 2).get() === "two", "drop forgets one org's answer only");
}

console.log("D · a slug inside the reader's org");
{
  ok(keyInOrg(1, "shop") === "shop" && keyInOrg(1, "o2--shop") === "o2--shop", "org 1: a bare key is its own (unchanged); another org's key stays as typed (every lookup is org 1's: refused there)");
  ok(keyInOrg(2, "shop") === "o2--shop" && keyInOrg(2, "o2--shop") === "o2--shop", "org 2: its slug is o2--shop; its own key is itself");
  ok(keyInOrg(2, "o3--shop") === "o3--shop" && keyInOrg(2, "o1--x") === "o1--x" && keyInOrg(2, "x".repeat(39)) === "x".repeat(39) && keyInOrg(2, "Not A Key") === "Not A Key",
    "org 2: another org's key, a key the form forbids, a slug too long for the prefix and a non-key stay as typed (refused by the lookups, never another org's)");
  ok(keyInOrg(null, "shop") === "shop" && keyInOrg(2, "") === "" && keyInOrg(2, null) === null, "no org, no want: as typed");
  ok(projectArg("Shop ", [], 2).project === "o2--shop" && projectArg("shop", [], 1).project === "shop" && projectArg("shop").project === "shop" && projectArg(["shop"], [], 2).error === "project_forbidden",
    "projectArg: the one parse, with the reader's org (a bare slug in org 2 is o2--shop; org 1 and no org unchanged; a non-string still refused)");
  ok(JSON.stringify(projectClause({ filter: "eq", project: "o2--shop" }, "t.project")) === JSON.stringify({ sql: " AND t.project = ?", args: ["o2--shop"] })
    && projectClause({ filter: "null" }, "t.project").sql === " AND t.project IS NULL AND t.org = {org}" && projectClause({ filter: "none" }, "e.project").sql === " AND e.org = {org}",
    "projectClause: one project by key; the org-level rows and a project-less org read the reader's org only");
}

console.log("E · two orgs in one database, through the real worker");
{
  const w = await sqliteWorker({ org: "Northwind", projects: ["alpha", "shop"], people: [["p-o1", "Owen", "owner", "o1-key", []], ["p-m1", "Mia", "member", "m1-key", ["alpha"]]] });
  const T = "2026-09-02T00:00:00.000Z";
  w.db.prepare("INSERT INTO org (id, name, created_at, updated_at) VALUES (2, 'Southwind', ?, ?)").run(T, T);
  w.db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-o2','Ola','ola@two.test','owner',?,1,?,2)").run(sha("o2-key"), T);
  w.db.prepare("INSERT INTO projects (key,name,active,created_at) VALUES ('o2--shop','Their shop',1,?)").run(T);
  w.db.prepare("INSERT INTO people (id,name,email,role,key_hash,active,created_at,org) VALUES ('p-m2','Max','max@two.test','member',?,1,?,2)").run(sha("m2-key"), T);
  w.db.prepare("INSERT INTO project_seats (person_id,project_key,role,created_at) VALUES ('p-m2','o2--shop','member',?)").run(T);
  const X = w.db.prepare("INSERT INTO transmission (id,submitter,lane,kind,what,route,status,eval,project,created_at,org) VALUES (?,?,?,?,?,?,?,0,?,?,?)");
  X.run("T-20260902-001", "p-o1", "leader", "note", "org one secret note", "owner", "routed", "shop", T, 1);
  X.run("T-20260902-002", "p-o1", "leader", "note", "org one org-level note", "owner", "routed", null, T, 1);
  X.run("T-20260902-003", "p-o2", "leader", "note", "org two org-level note", "owner", "routed", null, T, 2);
  X.run("T-20260902-004", "p-o2", "leader", "note", "org two shop note", "owner", "routed", "o2--shop", T, 2);
  const read2 = await w.mcp("read", { project: "shop", kind: "contribution" }, "o2-key");
  const ids2 = ((read2.out && read2.out.items) || []).map((x) => x.id);
  ok(read2.out && read2.out.project === "o2--shop" && ids2.includes("T-20260902-004") && !ids2.includes("T-20260902-001"), `org 2's owner names "shop": its own o2--shop (${ids2.join(",")}), never org 1's shop`);
  const read1 = await w.mcp("read", { project: "shop", kind: "contribution" }, "o1-key");
  ok(read1.out && read1.out.project === "shop" && ((read1.out.items) || []).some((x) => x.id === "T-20260902-001"), "the instrument: org 1's owner naming shop reads org 1's shop and its row");
  const one2 = await w.mcp("read", { ref: "T-20260902-001", project: "shop" }, "o2-key"), one1 = await w.mcp("read", { ref: "T-20260902-001", project: "shop" }, "o1-key");
  ok(one2.out && one2.out.error && !JSON.stringify(one2.out).includes("secret note") && one1.out && JSON.stringify(one1.out).includes("secret note"),
    `org 1's contribution by its id: org 2's owner reads nothing of it (${one2.out && one2.out.error}); the instrument: org 1's owner reads it`);
  const x2 = await w.mcp("read", { project: "o1--shop", kind: "goal" }, "o2-key"), x1 = await w.mcp("read", { project: "o2--shop", kind: "goal" }, "o1-key");
  ok(x2.out && x2.out.error === "project_forbidden" && x1.out && x1.out.error === "project_forbidden", "neither owner reads the other org's project by its full key: project_forbidden both ways");
  const who2 = await w.mcp("whoami", {}, "o2-key"), who1 = await w.mcp("whoami", {}, "o1-key");
  ok(JSON.stringify(who2.out.writeProjects) === '["o2--shop"]' && JSON.stringify(who1.out.writeProjects) === '["alpha","shop"]' && who2.out.org === "Southwind" && who1.out.org === "Northwind",
    `each owner's projects and org name are its own: org 2 ${JSON.stringify(who2.out.writeProjects)} ${who2.out.org}, org 1 ${JSON.stringify(who1.out.writeProjects)} ${who1.out.org}`);
  const page = async (key, path) => { const r = await w.fetch(new Request(w.origin + path, { headers: { accept: "text/html", authorization: `Bearer ${key}` } })); return { status: r.status, t: await r.text() }; };
  const ctl2 = await page("o2-key", "/control"), ctl1 = await page("o1-key", "/control");
  ok(ctl2.status === 200 && ctl2.t.includes("Max") && !ctl2.t.includes("Mia") && !ctl2.t.includes("Owen") && ctl1.t.includes("Mia") && !ctl1.t.includes("Max"),
    "Control: each admin's people are its own org's (org 2: Max, never Mia or Owen; org 1: Mia, never Max)");
  const home2 = await page("o2-key", "/home?project=shop");
  ok(home2.status === 200 && home2.t.includes("Southwind") && !home2.t.includes("Northwind") && !home2.t.includes("secret note"), "org 2's Home: its own brand (Southwind), none of org 1's");
  // the running counts: each org's org-level bucket is its own (the badge's pending rulings, src/hotsql.js OWNER_OPEN_COUNT_SQL)
  const buckets = w.db.prepare("SELECT project, SUM(n) AS n FROM transmission_open WHERE route = 'owner' GROUP BY project ORDER BY project").all().map((r) => `${r.project}=${r.n}`).join(",");
  ok(buckets === "=1,o2--=1,o2--shop=1,shop=1", `the tallies keep one org-level bucket per org ('' org 1's, o2-- org 2's): ${buckets}`);
  const { OWNER_OPEN_COUNT_SQL } = await imp("src/hotsql.js");
  const cnt = (org, filter) => w.db.prepare(D.orgSql(OWNER_OPEN_COUNT_SQL(filter, false), org)).get().n;
  ok(cnt(1, "null") === 1 && cnt(2, "null") === 1 && cnt(2, "none") === 2 && cnt(1, "none") === 2, `the org-level count reads the reader's bucket (org 1: ${cnt(1, "null")}, org 2: ${cnt(2, "null")}), a project-less read the reader's org alone (org 2: ${cnt(2, "none")} of the 4 rows)`);
  // an insert names the writer's org from the sign-in: org 2's member files, the row is org 2's (no people read for it)
  const filed = await w.mcp("open_items", { title: "a loop of org two" }, "m2-key");
  const loop = w.db.prepare("SELECT org FROM loops WHERE person_id = 'p-m2'").get();
  ok(!filed.isError && loop && loop.org === 2, `org 2's member opens an item: the row lands in org 2 (${loop && loop.org})`);
}

console.log(`${failed ? "✗" : "✓"} data-layer selftest: ${checks - failed} of ${checks} checks passed`);
process.exit(failed ? 1 : 0);
