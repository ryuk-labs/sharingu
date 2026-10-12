// latency-selftest.mjs — build0925-home-latency: the Server-Timing seam (src/timing.js) and the per-request decision-rows
// memo, unit-tested against fake D1 / R2 / KV bindings — offline, no wrangler, no network.
// Proves: every binding shape callers rely on survives the wrappers (prepare().bind().first/all/run/raw, batch of
// wrapped statements, R2 object bodies + httpEtag/writeHttpMetadata); the
// ORIGINAL error object is rethrown (isD1Quota reads it); spans are per kind and carry no key/SQL; the header lands
// on HTML and /health only and never changes a body.
import { newTiming, timedEnv, timedD1, timedR2, timedKV, serverTimingHeader, withServerTiming, timeSync, timingOf, TIMING } from "../src/timing.js";
import { PROJECT } from "../src/project.js";
import { projectDecisionRows } from "../src/knowledge/decisions.js";
import { installReqMemo } from "../src/reqmemo.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗", m); } };
const tick = () => new Promise((r) => setTimeout(r, 2));

// ---- fakes -----------------------------------------------------------------------------------------------------
const quota = new Error("D1_ERROR: exceeded the daily row read limit (code: 7500)");
const realStmts = new WeakSet();   // a Proxy is never in here — so batch() proves it got the REAL statements
class FakeStmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; realStmts.add(this); }
  bind(...a) { return new FakeStmt(this.db, this.sql, a); }
  async first() { await tick(); this.db.calls++; if (this.sql.includes("QUOTA")) throw quota; return { sql: this.sql, args: this.args }; }
  async all() { await tick(); this.db.calls++; return { results: [{ n: this.args.length }] }; }
  async run() { await tick(); this.db.calls++; return { success: true }; }
  async raw() { await tick(); this.db.calls++; return [[1]]; }
}
class FakeD1 {
  constructor() { this.calls = 0; }
  prepare(sql) { return new FakeStmt(this, sql); }
  async batch(stmts) { this.calls++; return stmts.map((s) => { if (!realStmts.has(s)) throw new Error("batch got a wrapped statement"); return { results: [s.sql] }; }); }
  async exec(q) { this.calls++; return { count: 1, q }; }
}
const r2err = new Error("R2 get failed");
function fakeR2(store) {
  const b = {
    gets: [],
    async get(k, opts) {
      await tick(); b.gets.push(k);
      if (k === "lib/boom.json") throw r2err;
      if (!store.has(k)) return null;
      const v = store.get(k); const bytes = new TextEncoder().encode(v);
      const size = bytes.length;
      let used = false;
      return { key: k, size, etag: "e-" + k, httpEtag: '"e-' + k + '"', httpMetadata: { contentType: "application/json" }, customMetadata: {}, uploaded: new Date(0),
        writeHttpMetadata(h) { h.set("content-type", "application/json"); },
        get body() { used = true; return new Response(bytes).body; }, get bodyUsed() { return used; },
        async text() { if (used) throw new Error("body used twice"); used = true; return v; },
        async json() { used = true; return JSON.parse(v); },
        async arrayBuffer() { if (used) throw new Error("body used twice"); used = true; return bytes.buffer.slice(0); } };
    },
    async head(k) { await tick(); return store.has(k) ? { key: k } : null; },
    async list(o) { await tick(); return { objects: [...store.keys()].filter((k) => k.startsWith((o && o.prefix) || "")).map((key) => ({ key })), truncated: false }; },
    async put(k, v) { await tick(); store.set(k, String(v)); return { key: k }; },
    async delete(k) { await tick(); for (const x of [].concat(k)) store.delete(x); },
  };
  return b;
}
const kvStore = new Map([["n", "v"]]);
const fakeKV = { async get(k) { await tick(); return kvStore.get(k) || null; }, async put(k, v) { kvStore.set(k, v); } };

// ---- D1 --------------------------------------------------------------------------------------------------------
{
  const t = newTiming(); const raw = new FakeD1(); const db = timedD1(raw, t);
  const r1 = await db.prepare("SELECT secret_col FROM people WHERE key_hash = ?").bind("h1").first();
  ok(r1 && r1.args[0] === "h1", "prepare().bind().first() reaches the real statement with its args");
  ok((await db.prepare("SELECT 1").all()).results[0].n === 0, "prepare().all() works unbound");
  ok((await db.prepare("X").bind(1, 2).run()).success === true, "run() works");
  ok(Array.isArray(await db.prepare("X").raw()), "raw() works");
  const bs = await db.batch([db.prepare("A").bind(1), db.prepare("B")]);
  ok(bs.length === 2 && bs[0].results[0] === "A", "batch() of WRAPPED statements unwraps them for the real binding");
  let caught = null; try { await db.prepare("QUOTA").first(); } catch (e) { caught = e; }
  ok(caught === quota, "a D1 error is rethrown as the ORIGINAL object (isD1Quota reads it)");
  ok(t.spans.d1 && t.spans.d1.n === 6, "d1 span counts every call incl. batch + the failed one (got " + (t.spans.d1 && t.spans.d1.n) + ")");
  ok(timedD1(raw, null) === raw, "no accumulator → the raw binding, untouched");
}

// ---- R2 + KV + header ------------------------------------------------------------------------------------------
{
  const store = new Map([["lib/state.json", '{"generatedAt":"g"}'], ["inbox/x.json", "{}"]]);
  const raw = fakeR2(store); const t = newTiming(); const env = timedEnv({ DB: new FakeD1(), BRAIN: raw, OAUTH_KV: fakeKV, PLAIN_VAR: "w" }, t);
  ok(env[TIMING] === t && timingOf(env) === t && env.PLAIN_VAR === "w", "timedEnv keeps plain vars and carries the accumulator under a Symbol");
  ok(!Object.keys(env).some((k) => /tim/i.test(k)), "timedEnv adds no string key to env");
  const o = await env.BRAIN.get("lib/state.json");
  ok(o.httpEtag === '"e-lib/state.json"' && o.size > 0, "an R2 object's metadata reads straight through");
  ok(JSON.parse(await o.text()).generatedAt === "g", "an R2 object's text() works through the wrapper");
  const h = new Headers(); o.writeHttpMetadata(h); ok(h.get("content-type") === "application/json", "writeHttpMetadata keeps its this");
  ok((await env.BRAIN.get("lib/none.json")) === null, "an R2 miss is null");
  let caught = null; try { await env.BRAIN.get("lib/boom.json"); } catch (e) { caught = e; }
  ok(caught === r2err, "an R2 error is rethrown as the ORIGINAL object");
  ok((await env.BRAIN.head("lib/state.json")).key === "lib/state.json" && (await env.BRAIN.list({ prefix: "lib/" })).objects.length === 1, "head/list pass through");
  await env.BRAIN.put("inbox/y.json", "1");
  ok((await env.OAUTH_KV.get("n")) === "v", "KV get passes through");
  ok(t.spans["r2-get"].n === 3 && t.spans["r2-head"].n === 1 && t.spans["r2-list"].n === 1 && t.spans["r2-put"].n === 1 && t.spans.kv.n === 1,
    "per-kind spans: r2-get (n = 3 gets; the body read adds time, not a call), r2-head, r2-list, r2-put, kv (got r2-get n=" + t.spans["r2-get"].n + ")");
  timeSync(t, "render", () => "x".repeat(1000));
  const hv = serverTimingHeader(t);
  for (const k of ["d1", "r2-get", "r2-head", "r2-list", "r2-put", "kv", "fetch", "render", "io", "total"]) ok(new RegExp("(^|, )" + k + ";dur=[0-9.]+").test(hv), "header carries the " + k + " span");
  ok(!/serve\/|inbox|SELECT|key_hash|people/.test(hv), "header carries kind names and numbers only — no key, no SQL");

  // withServerTiming: HTML + /health only, body untouched, immutable headers survive
  const html = "<!doctype html><p>hi</p>";
  const r1 = withServerTiming(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }), t, "/home");
  ok(r1.headers.get("server-timing") && (await r1.text()) === html, "an HTML page gets Server-Timing and its body is byte-identical");
  const r2 = withServerTiming(new Response('{"ok":true}', { headers: { "content-type": "application/json" } }), t, "/health");
  ok(!!r2.headers.get("server-timing"), "/health (JSON) gets Server-Timing");
  const r3 = withServerTiming(new Response('{"a":1}', { headers: { "content-type": "application/json" } }), t, "/whoami");
  ok(r3.headers.get("server-timing") === null, "a JSON route other than /health is untouched");
  const r4 = withServerTiming(Response.redirect("https://x.test/login", 302), t, "/home");
  ok(r4.status === 302 && r4.headers.get("server-timing") === null, "a redirect (no content-type) passes through untouched");
  // a response whose headers refuse set() (Response.redirect / fetch passthrough shape) is re-wrapped, same body
  const real = new Response(html, { status: 203, headers: { "content-type": "text/html" } });
  const rh = real.headers;
  const immHeaders = new Proxy(rh, { get(tg, p) { if (p === "set") return () => { throw new TypeError("immutable"); }; const v = Reflect.get(tg, p, tg); return typeof v === "function" ? v.bind(tg) : v; } });
  Object.defineProperty(real, "headers", { value: immHeaders });
  const r5 = withServerTiming(real, t, "/map");
  ok(r5 !== real && r5.status === 203 && !!r5.headers.get("server-timing") && (await r5.text()) === html, "immutable headers → re-wrapped around the SAME body, status kept, header added");
}

// ---- the decision rows (src/knowledge/decisions.js projectDecisionRows -> decisionRows) --------------------
// Every face of one request (Decisions, Home, the badge, checkOptionAnswers) asks for the rows; the store memoizes them per
// request (src/reqmemo.js), so three calls, two of them concurrent, run ONE D1 statement, and the shared rows are frozen.
{
  let reads = 0;
  const DB = { prepare: () => ({ bind: () => ({ all: async () => { reads++; await tick();
    return { results: [{ qid: "QA0000001", question: "Which?", status: "open", who_owes: "owner", options_json: JSON.stringify([{ idx: 0, what: "a" }, { idx: 1, what: "b" }]) }] }; } }) }) };
  const req = installReqMemo({ [PROJECT]: "p1", DB });
  const [a1, b1] = await Promise.all([projectDecisionRows(req), projectDecisionRows(req)]);
  const c1 = await projectDecisionRows(req);
  ok(reads === 1 && a1.rows === b1.rows && b1.rows === c1.rows && a1.project === "p1" && a1.rows[0].whoOwes === "owner", `one request: 3 calls → 1 D1 statement, the same rows (got ${reads})`);
  let threw = false; try { a1.rows[0].status = "decided"; } catch { threw = true; }
  ok(threw && a1.rows[0].status === "open" && Object.isFrozen(a1.rows[0].options), "the shared rows are frozen: a caller cannot change what the next caller reads");
  await projectDecisionRows(installReqMemo({ [PROJECT]: "p1", DB }));
  ok(reads === 2, "the next request reads D1 again (nothing is kept across requests)");
}

console.log(`latency selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
