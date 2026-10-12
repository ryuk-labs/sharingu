// timing.js — the always-on Server-Timing seam (build0925-home-latency). One request-scoped accumulator per
// request (never module-global: concurrent requests share an isolate), and thin timing wrappers over the RAW
// bindings — D1 (env.DB), R2 (env.BRAIN), KV (env.OAUTH_KV) — installed ONCE at workerHandler.fetch, before the
// project seam copies the env (src/project.js: the copies keep these bindings). Spans are KIND-LEVEL names and durations only — never an object key, a
// person id or SQL (a public page carries this header too). The response body is never touched.
//
// What a span means: `dur` is the SUM of every call of that kind in this request (so concurrent calls can sum
// past `total`), `desc` carries the call count. An R2 get's body read (text/json/arrayBuffer) is added to r2-get's
// dur but not to its n — n is the number of gets R2 served. `io` is the wall time during which at least one I/O call was in
// flight (the union of the intervals) — `total` minus `io` is time spent with no I/O pending (CPU, if the
// runtime's clock advances during it). NAMED LIMIT: on Cloudflare's edge the clock does not advance during
// synchronous CPU (Spectre mitigation), so `render` (the shell() call) reads ~0 there — it is honest on a local
// runtime only. Every wrapper rethrows the ORIGINAL error unchanged (isD1Quota inspects it).

export const TIMING = Symbol.for("sharingu.timing");
const KINDS = ["d1", "r2-get", "r2-head", "r2-list", "r2-put", "r2-delete", "kv", "fetch", "render"];
const clock = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

export function newTiming() {
  return { t0: clock(), spans: Object.create(null), ivals: [] };
}

function record(t, kind, start, end, count = true) {
  const s = t.spans[kind] || (t.spans[kind] = { ms: 0, n: 0 });
  s.ms += end - start; if (count) s.n += 1;
  if (kind !== "render") t.ivals.push([start, end]);
}

// timeAsync(t, kind, fn) — runs fn(), records its duration whether it resolves or throws, and returns/rethrows
// exactly what fn did (the same promise value, the same error object).
// count=false adds the time but not a call (an R2 body read is part of its get: n counts gets, dur covers both).
export function timeAsync(t, kind, fn, count = true) {
  if (!t) return fn();
  const start = clock();
  let p;
  try { p = fn(); } catch (e) { record(t, kind, start, clock(), count); throw e; }
  return Promise.resolve(p).then(
    (v) => { record(t, kind, start, clock(), count); return v; },
    (e) => { record(t, kind, start, clock(), count); throw e; });
}

export function timeSync(t, kind, fn) {
  if (!t) return fn();
  const start = clock();
  try { return fn(); } finally { record(t, kind, start, clock()); }
}

// The accumulator travels on env under a Symbol (object spread copies own symbol keys, so the ws seam's
// `{ ...env, BRAIN }` keeps it); no string key is added to env.
export const timingOf = (env) => (env && env[TIMING]) || null;

// ---- D1 ----------------------------------------------------------------------------------------------------
const REAL = Symbol.for("sharingu.timing.real");
// REAL_BINDING — the raw binding under a timed D1 (db[REAL_BINDING]): an isolate memo keys on it (src/core.js orgProjectsOnce),
// never on the per-request proxy
export const REAL_BINDING = REAL;
// The free tier's D1 budget is ROWS (5M read, 100k written a day), not calls: every statement's own meta
// (rows_read, rows_written) is summed per request and leaves in the header as `d1-rows` (tools/page-budget.mjs reads
// it). first() returns no meta, so it counts as a statement with unknown rows — unless the request asked for a full
// count (t.countFirst, set from the `x-count-rows: 1` request header by the budget tool): then a bare first() is
// answered from all(), which runs the same statement and carries its meta.
function countRows(t, res) {
  const r = t.rows || (t.rows = { read: 0, written: 0, stmts: 0, unknown: 0 });
  for (const x of Array.isArray(res) ? res : [res]) {
    r.stmts += 1;
    const m = x && typeof x === "object" && !Array.isArray(x) ? x.meta : null;
    if (m && Number.isFinite(Number(m.rows_read))) { r.read += Number(m.rows_read); r.written += Number(m.rows_written) || 0; }
    else r.unknown += 1;
  }
  return res;
}
function timedStmt(stmt, t) {
  return new Proxy(stmt, {
    get(target, prop) {
      if (prop === REAL) return target;
      if (prop === "bind") return (...a) => timedStmt(target.bind(...a), t);
      if (prop === "first") {
        return (...a) => (a.length || !t.countFirst
          ? timeAsync(t, "d1", () => target.first(...a)).then((v) => { countRows(t, null); return v; })
          : timeAsync(t, "d1", () => target.all()).then((res) => { countRows(t, res); return (res && res.results && res.results[0]) ?? null; }));
      }
      if (prop === "all" || prop === "run" || prop === "raw") {
        return (...a) => timeAsync(t, "d1", () => target[prop](...a)).then((res) => countRows(t, res));
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
export function timedD1(db, t) {
  if (!db || !t) return db;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === REAL) return target;
      if (prop === "prepare") return (sql) => timedStmt(target.prepare(sql), t);
      if (prop === "batch") return (stmts) => timeAsync(t, "d1", () => target.batch((stmts || []).map((s) => (s && s[REAL]) || s))).then((res) => countRows(t, res));
      if (prop === "exec") return (...a) => timeAsync(t, "d1", () => target.exec(...a));
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

// ---- R2 ----------------------------------------------------------------------------------------------------
// get() resolves when the object's metadata arrives; the body is read later (text/json/arrayBuffer/blob) — that
// read is I/O too, so a returned object's body readers are timed as r2-get as well. Every other property
// (httpEtag, writeHttpMetadata, body, size…) reads straight off the real object.
function timedR2Object(obj, t) {
  if (!obj || typeof obj !== "object") return obj;
  return new Proxy(obj, {
    get(target, prop) {
      if (prop === "text" || prop === "json" || prop === "arrayBuffer" || prop === "blob" || prop === "bytes") {
        const f = target[prop];
        return typeof f === "function" ? (...a) => timeAsync(t, "r2-get", () => f.apply(target, a), false) : f;
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
export function timedR2(bucket, t) {
  if (!bucket || !t) return bucket;
  return new Proxy(bucket, {
    get(target, prop) {
      if (prop === "get") return (...a) => timeAsync(t, "r2-get", () => target.get(...a)).then((o) => timedR2Object(o, t));
      if (prop === "head") return (...a) => timeAsync(t, "r2-head", () => target.head(...a));
      if (prop === "list") return (...a) => timeAsync(t, "r2-list", () => target.list(...a));
      if (prop === "put") return (...a) => timeAsync(t, "r2-put", () => target.put(...a));
      if (prop === "delete") return (...a) => timeAsync(t, "r2-delete", () => target.delete(...a));
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

// ---- KV ----------------------------------------------------------------------------------------------------
export function timedKV(kv, t) {
  if (!kv || !t) return kv;
  return new Proxy(kv, {
    get(target, prop) {
      if (prop === "get" || prop === "put" || prop === "delete" || prop === "list" || prop === "getWithMetadata") {
        return (...a) => timeAsync(t, "kv", () => target[prop](...a));
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

// timedEnv(env, t) — the per-request env: the same bindings, timed, plus the accumulator under TIMING.
export function timedEnv(env, t) {
  if (!env || !t) return env;
  const out = { ...env, [TIMING]: t };
  if (env.DB) out.DB = timedD1(env.DB, t);
  if (env.BRAIN) out.BRAIN = timedR2(env.BRAIN, t);
  if (env.OAUTH_KV) out.OAUTH_KV = timedKV(env.OAUTH_KV, t);
  return out;
}

// timedFetch(env, …) — an outbound subrequest, timed as `fetch` when a request accumulator is present.
export function timedFetch(env, ...a) { return timeAsync(timingOf(env), "fetch", () => fetch(...a)); }

function unionMs(ivals) {
  if (!ivals.length) return 0;
  const s = ivals.slice().sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = s[0];
  for (let i = 1; i < s.length; i++) {
    const [a, b] = s[i];
    if (a > ce) { total += ce - cs; cs = a; ce = b; } else if (b > ce) ce = b;
  }
  return total + (ce - cs);
}

// serverTimingHeader(t) — `d1;dur=12.3;desc="n=4", r2-get;dur=…, …, io;dur=…, total;dur=…`. Every kind is
// listed (dur=0 n=0 when unused) so a reader sees an absent kind as measured-zero, not as missing.
export function serverTimingHeader(t) {
  const f = (x) => (Math.round(x * 10) / 10).toString();
  const parts = KINDS.map((k) => { const s = t.spans[k] || { ms: 0, n: 0 }; return `${k};dur=${f(s.ms)};desc="n=${s.n}"`; });
  const r = t.rows || { read: 0, written: 0, stmts: 0, unknown: 0 };
  parts.push(`d1-rows;dur=0;desc="read=${r.read} written=${r.written} stmts=${r.stmts} unknown=${r.unknown}"`);
  parts.push(`io;dur=${f(unionMs(t.ivals))}`);
  parts.push(`total;dur=${f(clock() - t.t0)}`);
  return parts.join(", ");
}

// withServerTiming(res, t, path) — adds the header to an HTML page or /health; any other response passes
// through untouched. A response with immutable headers is re-wrapped around the SAME body stream.
export function withServerTiming(res, t, path) {
  if (!res || !t || res.webSocket) return res;
  const ct = (res.headers && res.headers.get("content-type")) || "";
  if (!(path === "/health" || ct.toLowerCase().startsWith("text/html") || t.countFirst)) return res;   // the budget tool reads JSON doors too
  const v = serverTimingHeader(t);
  try { res.headers.set("server-timing", v); return res; } catch {
    const r = new Response(res.body, res);
    r.headers.set("server-timing", v);
    return r;
  }
}
