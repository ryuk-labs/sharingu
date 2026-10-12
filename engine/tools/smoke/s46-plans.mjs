// tools/smoke/s46-plans.mjs — sprint 8, 8.1 (docs/plan/PLATFORM.md §4 sprint 8; migrate-075; src/plans.js): plans and usage on the
// real local worker, after s45. The case runs src/plans.js's planShownOf — the one read Control's Plan card and whoami's plan show
// (8.4) — through src/data.js as the worker runs it, against the smoke's local D1, after real door writes. An org of its own, made as a person makes one (the operator's code, POST
// /signup, POST /orgs); every key in memory, never printed.
//   · a fresh org's plan is free with the owner's ruled numbers; its usage is its founding seat and project, and zeros for the
//     month's items and the bytes stored
//   · it moves when a person (Control's add-person), a project (create_project) and two filings (a contribution, a knowledge
//     write: one ledger row each, the month's tally) land through the door — each by exactly what landed; its calls are counted
//   · every other org untouched: its plan and the usages a write moves (people, projects, items, storage) the same as before
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { smoke, expect, brief, http as http0, mcp, contribute, kwrite, G, d1rows } from "./lib.mjs";
import { planShownOf } from "../../src/plans.js";
import { asOrg } from "../fixtures/org.mjs";

const ENGINE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAG = randomBytes(3).toString("hex");
// the door, retried once when the socket failed, and once after the address's window when the flood filter refused (s40's rule:
// /login, /signup and /orgs share one budget, and s45 spent some of it)
const http1 = async (...a) => { try { return await http0(...a); } catch (e) { if (!/fetch failed|socket|ECONNRESET/i.test(String((e && e.message) || e) + String(e && e.cause))) throw e; await new Promise((r) => setTimeout(r, 50)); return http0(...a); } };
const http = async (method, path, o) => {
  let r = await http1(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many sign-in attempts from this address/.test(r.raw || "")) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http1(method, path, o); }
  return r;
};
const bare = (j) => brief(j && typeof j === "object" ? { ...j, key: j.key ? "<key>" : undefined } : j);
async function op(...args) {
  const { SMOKE_D1_PERSIST: persist, SMOKE_D1_CFG: cfg } = process.env;
  expect(persist && cfg, "SMOKE_D1_PERSIST and SMOKE_D1_CFG (tools/smoke.sh sets both)");
  const { rc, out } = await new Promise((done) => execFile("node", [join(ENGINE, "tools", "operator.mjs"), ...args, "--local", persist, "--config", cfg], { encoding: "utf8", maxBuffer: 1 << 24 },
    (e, stdout, stderr) => done({ rc: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: `${stdout || ""}${stderr || ""}` })));
  return { rc, code: (out.match(/^ {2}code: (\S+)$/m) || [])[1] || null };
}
// the local D1 as a D1 binding (each statement one wrangler call, its ?N binds written in as quoted values), so planShownOf runs
// exactly as the worker runs it: src/data.js writes the org in, then the statement reaches the database
const lit = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const LOCAL = { prepare(sql) { const w = (args) => ({ bind: (...a) => w(a), first: async () => d1rows(sql.replace(/\?(\d+)/g, (_, i) => lit(args[Number(i) - 1])))[0] || null }); return w([]); } };
const envOf = (org) => asOrg({ DB: LOCAL }, org);
const RULED_FREE = { people: 10, projects: 3, items_month: 1500, calls_day: 1000, burst_minute: 60, storage_bytes: 2 ** 30 };
// shownOf(org) -> { plan, allowed: { <limit>: n }, used: { <limit>: n } } (planShownOf's answer, its windows aside)
const shownOf = async (org) => {
  const s = await planShownOf(envOf(org));
  if (!s || !s.limits) return { plan: s ? s.plan : null, allowed: null, used: null };
  const of = (f) => Object.fromEntries(Object.entries(s.limits).map(([k, v]) => [k, v[f]]));
  return { plan: s.plan, allowed: of("allowed"), used: of("used") };
};
// what a write moves (the calls and the minute's burst move with the clock: a new day or minute reads 0)
const steady = (x) => JSON.stringify({ plan: x.plan, allowed: x.allowed, used: x.used && { people: x.used.people, projects: x.used.projects, items_month: x.used.items_month, storage_bytes: x.used.storage_bytes } });
const settle = () => new Promise((r) => setTimeout(r, 20));
const N = {};

smoke("plans · a fresh org's plan is free with the ruled numbers; its usage is its founding seat and project, zeros for the month's filings and the files", async () => {
  N.others = d1rows("SELECT id FROM org ORDER BY id").map((r) => Number(r.id));
  N.before = {};
  for (const o of N.others) N.before[o] = steady(await shownOf(o));
  N.email = `plans-${TAG}@smoke.local`; N.pass = `smoke-plans-pass-${TAG}`;
  const a = await op("allow", "--email", N.email);
  expect(a.rc === 0 && a.code, `operator allow: rc ${a.rc}`);
  const s = await http("POST", "/signup", { body: { email: N.email, code: a.code, password: N.pass, device: "smoke-s46" } });
  expect(s.status === 200 && s.json && s.json.account === "created", () => `the sign-up: ${s.status} ${bare(s.json)}`);
  const r = await http("POST", "/orgs", { body: { email: N.email, password: N.pass, name: `Plans ${TAG}`, slug: `plans-${TAG}`, project: "web", you: "Plans Owner" } });
  N.org = r.json && r.json.org && r.json.org.id; N.key = r.json && r.json.key; N.project = r.json && r.json.project && r.json.project.key;
  expect(r.status === 200 && N.org >= 2 && N.key && N.project, () => `POST /orgs: ${r.status} ${bare(r.json)}`);
  await settle();
  const shown = await shownOf(N.org), u = shown.used;
  N.u0 = u;
  expect(shown.plan === "free" && JSON.stringify(shown.allowed) === JSON.stringify(RULED_FREE)
    && u && u.people === 1 && u.projects === 1 && u.items_month === 0 && u.storage_bytes === 0,
    () => `org ${N.org}: ${brief(shown)}`);
  return `org ${N.org} (plans-${TAG}): plan free ${brief(shown.allowed)}; usage ${u.people} person, ${u.projects} project, ${u.items_month} items this month, ${u.storage_bytes} bytes, ${u.calls_day} calls today`;
});

smoke("plans · the usage moves by exactly what lands through the door: a person, a project, a contribution and a knowledge write", async () => {
  expect(N.key && N.u0, "the first plans case did not run");
  const p = await http("POST", "/control", { key: N.key, form: { action: "add-person", name: `Plans Member ${TAG}`, email: `plans-member-${TAG}@smoke.local` } });
  expect(/API key\): [0-9a-f]{40}/.test(p.text), () => `add-person: ${p.status}`);
  const cp = await mcp(N.key, "create_project", { key: "second", name: "Second" });
  expect(!cp.isError && cp.out && cp.out.created === true, () => `create_project: ${brief(cp.out)}`);
  const c = await contribute(N.key, { project: N.project, lane: "leader", kind: "note", what: `The first plans note ${TAG}`, why: "usage moves when a filing lands" });
  expect(!c.isError && c.out && c.out.id, () => `the contribution: ${brief(c.out)}`);
  const k = await kwrite(N.key, { project: N.project, ops: [G(`plans-root-${TAG}`, null), G(`plans-leaf-${TAG}`, `plans-root-${TAG}`)] });
  expect(!k.isError && k.out && k.out.written === 2, () => `the knowledge write: ${brief(k.out)}`);
  await settle();
  const u = (await shownOf(N.org)).used, u0 = N.u0;
  const tx = d1rows(`SELECT COUNT(*) AS n FROM transmission WHERE org = ${Number(N.org)}`)[0];
  expect(u.people === u0.people + 1 && u.projects === u0.projects + 1 && u.items_month === 2 && Number(tx.n) === 2 && u.storage_bytes === 0 && u.calls_day > u0.calls_day,
    () => `usage before ${brief(u0)}; after ${brief(u)}; ledger rows ${tx.n}`);
  return `people ${u0.people} -> ${u.people}, projects ${u0.projects} -> ${u.projects}, items ${u0.items_month} -> ${u.items_month} (1 contribution, 1 knowledge write of 2 items: one ledger row each, the ledger's ${tx.n}), bytes ${u.storage_bytes}, calls ${u0.calls_day} -> ${u.calls_day}`;
});

smoke("plans · every other org untouched: its plan and its usage the same after the new org's writes as before", async () => {
  expect(N.before, "the first plans case did not run");
  const moved = [];
  for (const o of N.others) { const now = steady(await shownOf(o)); if (now !== N.before[o]) moved.push(`org ${o}: ${N.before[o]} -> ${now}`); }
  expect(!moved.length && N.others.includes(1), () => moved.join(" · ").slice(0, 500) || "org 1 was not among them");
  const one = JSON.parse(N.before[1]);
  return `${N.others.length} orgs unchanged (org 1: plan ${one.plan}, ${one.used.people} people, ${one.used.projects} projects, ${one.used.items_month} items this month)`;
});
