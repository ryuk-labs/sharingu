// engine/tools/import/door.mjs — the importer's MCP client: POST <url>/mcp, JSON-RPC tools/call, `Authorization: Bearer`
// with the key the CLI read from SHARINGU_IMPORT_KEY. The key is only ever placed in that header — never logged, never
// echoed. A 429/5xx/network failure is retried with a backoff (safe: a batch's clientRef makes a repeat a no-op).
// It files as any client does: `preview` {project, clientRef, items}, then each part the preview answers with the write tool
// it names (file_contribution, save_knowledge, remove_knowledge: {previewId, items: that part's items, as previewed}; src/preview.js;
// fileParts and fileOps below), and reads back with `read` {project, kind, after} (src/extract.js readAnswer: {project,
// kind, items, next}). import/selftest.mjs drives it against the REAL worker (src/index.js over SQLite), so a wrong argument
// or a changed answer goes red there. Anything unexpected is printed, not guessed.
// Every call carries `x-count-rows: 1`, so the worker answers with its own D1 row count for the request in Server-Timing
// (src/timing.js: `d1-rows;…;desc="read=R written=W stmts=S unknown=U"`, every statement's meta summed, triggers and index
// entries included as D1 reports them). The client sums them: per call (rpc/tool answer `rows`) and in total
// (client.rows). A retried call's every attempt is counted (a 5xx after the batch landed still wrote its rows).

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// rowsOf(serverTiming) -> { read, written, stmts, unknown } | null (no d1-rows entry: an old worker, or a proxy dropped it)
export function rowsOf(header) {
  const m = /d1-rows;dur=[\d.]+;desc="read=(\d+) written=(\d+) stmts=(\d+) unknown=(\d+)"/.exec(String(header || ""));
  return m ? { read: Number(m[1]), written: Number(m[2]), stmts: Number(m[3]), unknown: Number(m[4]) } : null;
}
const zeroRows = () => ({ read: 0, written: 0, stmts: 0, unknown: 0, calls: 0, uncounted: 0 });
function addRows(into, r) {
  into.calls += 1;
  if (!r) { into.uncounted += 1; return into; }
  for (const k of ["read", "written", "stmts", "unknown"]) into[k] += r[k];
  return into;
}

export function mcpClient(url, key) {
  const H = { "user-agent": "sharingu-import-brain/1.0", authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json", "x-count-rows": "1" };
  let seq = 0;
  const total = zeroRows();
  async function rpc(method, params) {
    let last = "";
    const rows = zeroRows();
    const done = (o) => { for (const k of Object.keys(total)) total[k] += rows[k]; return { ...o, rows }; };
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await sleep(800 * 2 ** (attempt - 1));
      let res;
      try { res = await fetch(url + "/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }) }); }
      catch (e) { last = `network: ${e.message}`; continue; }
      addRows(rows, rowsOf(res.headers.get("server-timing")));
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) { last = `HTTP ${res.status}: ${text.slice(0, 200)}`; continue; }
      if (!res.ok) return done({ error: `HTTP ${res.status}: ${text.slice(0, 500)}` });
      let d;
      try { d = JSON.parse(text); } catch { return done({ error: `HTTP ${res.status}, not JSON: ${text.slice(0, 300)}` }); }
      if (d.error) return done({ error: `JSON-RPC ${d.error.code}: ${d.error.message}` });
      return done({ result: d.result });
    }
    return done({ error: `gave up after 5 tries (${last})` });
  }
  // tool(name, args) -> { ok, out, rows } · out is the tool's JSON answer (the door wraps it as content[0].text); rows the
  // worker's own D1 count for the call
  async function tool(name, args) {
    const r = await rpc("tools/call", { name, arguments: args });
    if (r.error) return { ok: false, out: r.error, rows: r.rows };
    const t = r.result && r.result.content && r.result.content[0] && r.result.content[0].text;
    let out;
    try { out = JSON.parse(t); } catch { out = t ?? r.result; }
    return { ok: !r.result.isError, out, rows: r.rows };
  }
  return { rpc, tool, rows: total };
}

// the door's refusal, printed in full (the errors are the point); an answer is summarised on one line
export const brief = (o) => (typeof o === "string" ? o : JSON.stringify(o)).slice(0, 240);

// pageOf(out) -> the number of rows a `read` page holds, the next cursor, and whether the shape was understood
export function pageOf(out) {
  if (out == null || typeof out !== "object") return { n: null, next: null };
  if (Array.isArray(out)) return { n: out.length, next: null };
  const list = ["items", "rows", "results", "list", "data"].map((k) => out[k]).find(Array.isArray);
  const next = out.next ?? out.cursor ?? out.nextCursor ?? null;
  if (list) return { n: list.length, next: next || null, total: typeof out.total === "number" ? out.total : typeof out.count === "number" ? out.count : null };
  if (typeof out.total === "number" || typeof out.count === "number") return { n: out.total ?? out.count, next: null, total: out.total ?? out.count };
  return { n: Object.keys(out).length ? 1 : 0, next: null, single: true };   // a one-row kind (aim, gtm) answers the row itself
}

// READ_PAGE — items a `read` list page holds at most (src/extract.js LIST_MAX)
export const READ_PAGE = 100;
// readPage(client, project, kind, after) -> one `read` list page: { ok, out, rows }
export const readPage = (client, project, kind, after, limit = READ_PAGE) => client.tool("read", { project, kind, limit, ...(after ? { after } : {}) });

// countStored(client, project, kind) -> { n, note } — pages through `read` (READ_PAGE a page) until no cursor
export async function countStored(client, project, kind) {
  let n = 0, cursor = null;
  for (let page = 0; page < 1000; page++) {
    const r = await readPage(client, project, kind, cursor);
    if (!r.ok) return { n: null, note: `read refused: ${brief(r.out)}` };
    const p = pageOf(r.out);
    if (p.n == null) return { n: null, note: `unrecognised answer: ${brief(r.out)}` };
    if (p.total != null && !p.next) return { n: p.total };
    n += p.n;
    if (!p.next || p.next === cursor) return { n, note: p.single ? "one-row answer" : undefined };
    cursor = p.next;
  }
  return { n, note: "stopped after 1000 pages" };
}

// THE SPLIT DOOR (sprint 19): the write tool `file` is gone. A preview answers parts [{tool, items (their numbers, from 1), ready
// (how many of them would file)}], each tool one of WRITE_TOOLS; each write tool takes {previewId, items: the SAME items of its
// part, in their order, only?, fileOnConfirm?, orgSlug?}. A grade is submit_grade's and an answer respond's (no preview).
// fileParts is THE one way every JS tool files a preview's items (the importer, the walks, the reviewer org, the suites'
// fixtures, the budget, the walkthrough): one call per part, in the preview's order.
export const WRITE_TOOLS = ["file_contribution", "save_knowledge", "remove_knowledge"];
// writeToolOf(item) -> the write tool that files an item, by its form (src/formats.js opOf: a contribution file_contribution's,
// a knowledge remove remove_knowledge's, any other knowledge op save_knowledge's); writeToolsOf(items) -> those of a list, in
// WRITE_TOOLS' order (the order a preview answers its parts)
export const writeToolOf = (it) => (it && typeof it === "object" && it.contribution ? "file_contribution" : it && it.op === "remove" ? "remove_knowledge" : "save_knowledge");
export const writeToolsOf = (items) => WRITE_TOOLS.filter((t) => (items || []).some((it) => writeToolOf(it) === t));
// partsOf(previewAnswer, items) -> [{ tool, numbers, items, ready }]: each part with ITS items picked from the items previewed
export const partsOf = (pv, items) => (pv && Array.isArray(pv.parts) ? pv.parts : []).map((p) => ({ tool: p.tool, numbers: p.items, items: p.items.map((n) => items[n - 1]), ready: p.ready }));
// fileParts(call, previewAnswer, items, { only?, extra?, skipUnready? }) -> { ok, out, rows, step?, parts: [{ tool, out }] }
//   call(tool, args) -> { ok, out, rows? } (the caller's own door call). Each part is filed with its tool, in order; the first
//   refusal stops the rest and is answered as it came (out), with step naming the tool. A part already filed on this previewId
//   (preview_filed) counts with its first receipt (a retry of the same previewId files only what did not land). skipUnready: a
//   part none of whose items would file (ready 0: every one unchanged, or left) is not called. out (every part's receipt as
//   one): { previewId, tools, complete, items, results (by i), counts, receipts: {tool: receipt}, id, route, status (the first
//   filed item's) }. rows: the calls' D1 counts summed (when call answers them).
export async function fileParts(call, pv, items, o = {}) {
  const rows = zeroRows();
  const add = (r) => { if (r) for (const k of Object.keys(rows)) rows[k] += r[k] || 0; };
  const parts = [];
  for (const p of partsOf(pv, items)) {
    if (o.skipUnready && !p.ready) continue;
    const r = await call(p.tool, { previewId: pv.previewId, items: p.items, ...(o.only ? { only: o.only } : {}), ...(o.extra || {}) });
    add(r && r.rows);
    let out = r && r.out;
    if (out && typeof out === "object" && out.error === "preview_filed" && out.receipt) out = { ...out.receipt, repeat: true };
    else if (!r || !r.ok || !out || typeof out !== "object" || out.error) return { ok: false, out, rows, step: p.tool, parts };
    parts.push({ tool: p.tool, out });
  }
  return { ok: true, rows, parts, out: mergeReceipts(pv.previewId, parts) };
}
// mergeReceipts(previewId, [{tool, out}]) -> the parts' receipts as one (fileParts' out)
function mergeReceipts(previewId, parts) {
  const all = (k) => parts.flatMap((p) => (Array.isArray(p.out[k]) ? p.out[k] : [])).sort((x, y) => x.i - y.i);
  const items = all("items"), results = all("results");
  const st = (s) => results.filter((x) => x.status === s).length;
  const r0 = results[0] || {}, f0 = (items[0] && items[0].filed) || {};
  return { previewId, tools: parts.map((p) => p.tool), complete: parts.every((p) => p.out.complete === true), items, results,
    counts: { filed: st("filed"), unchanged: st("unchanged"), left: st("left"), notFiled: st("not_filed") },
    receipts: Object.fromEntries(parts.map((p) => [p.tool, p.out])), id: r0.id || f0.id || null, route: f0.route || null, status: r0.status || f0.status || null };
}

// fileOps(client, { project, ops, clientRef }) -> { ok, out, rows, replay, wrote } — ONE batch through the door as any client
// files it: `preview` {project, clientRef, items: ops} (nothing filed: each item's verdict), then, when any item would change
// something, each part that would (fileParts, skipUnready) with its write tool and its items as previewed (each tool's knowledge
// lands all or nothing, under the batch's clientRef: <clientRef>:k the upserts, :kr the removes). An item the preview says
// needs more, or refuses, stops the batch before anything is filed: out is
// { error: "not_ready", items: [{ i, kind, key, verdict, reasons, refusal }] } — the door's own words. A batch whose every
// item the preview finds stored the same is a replay: nothing is filed (out.replay). rows: the calls' D1 counts summed
// (the preview, and one call per part filed).
export async function fileOps(client, { project, ops, clientRef }) {
  const rows = { read: 0, written: 0, stmts: 0, unknown: 0, calls: 0, uncounted: 0 };
  const add = (r) => { for (const k of Object.keys(rows)) rows[k] += (r && r[k]) || 0; };
  const pv = await client.tool("preview", { project, clientRef, items: ops });
  add(pv.rows);
  if (!pv.ok || !pv.out || typeof pv.out !== "object") return { ok: false, out: pv.out, rows, step: "preview" };
  if (pv.out.error) return { ok: false, out: pv.out, rows, step: "preview" };
  const items = Array.isArray(pv.out.items) ? pv.out.items : [];
  const stuck = items.filter((it) => it.verdict === "needs" || it.verdict === "refused");
  if (stuck.length || pv.out.notReady) {
    return { ok: false, rows, step: "preview", out: { error: "not_ready", previewId: pv.out.previewId || null, count: stuck.length || pv.out.notReady,
      items: stuck.slice(0, 100).map((it) => ({ i: it.i, kind: it.kind, key: it.key, verdict: it.verdict, reasons: it.reasons, ...(it.refusal ? { refusal: it.refusal } : {}), ...(it.needs ? { needs: it.needs } : {}) })) } };
  }
  const unchanged = items.filter((it) => it.verdict === "unchanged").length;
  if (!pv.out.ready) return { ok: true, rows, replay: true, wrote: false, out: { previewId: pv.out.previewId, replay: true, unchanged } };
  const f = await fileParts(client.tool, pv.out, ops, { skipUnready: true });
  add(f.rows);
  if (!f.ok) return { ok: false, out: f.out, rows, step: f.step };
  if (!f.out.complete) return { ok: false, out: f.out, rows, step: (f.parts.find((p) => p.out.complete !== true) || {}).tool };
  const res = f.out.results;
  const filed = res.filter((x) => x.status === "filed").length;
  const ledger = (res.find((x) => x.status === "filed" && x.id) || {}).id || null;
  return { ok: true, rows, replay: false, wrote: filed > 0, out: { previewId: pv.out.previewId, filed, unchanged, tools: f.out.tools, ...(ledger ? { ledger } : {}) } };
}
