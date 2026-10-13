// tools/listing-walk.mjs — listing/test-cases.md's five positive and three negative cases, each walked by the account its
// heading names, on a reviewer world (tools/make-reviewer-org.mjs). ONE walk for both places it runs: smoke case s51 calls
// walkCases() on its fresh local world; the operator runs this file on live after a refresh, against the codes file the
// refresh wrote (its "<role> <email> code: <code>" lines), before any code goes into a store's form:
//   node tools/listing-walk.mjs --url https://agent.sharingu.xyz --codes ~/.sharingu/reviewer-credentials.txt [--slug sharingu-review]
// It files what a reviewer would (P3's and P5's notes, P4's accepted goal) into the Sample project, each part by the write tool
// its preview names (sprint 19: file_contribution, save_knowledge); it prints each case's verdict and never a code, a token or a
// key. Exit 0: all eight green; 1: a case red; 2: usage.
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contractInventory, REPO } from "./make-listing-docs.mjs";
import { door, ROLES } from "./make-reviewer-org.mjs";

const expect = (cond, detail) => { if (!cond) throw new Error(typeof detail === "function" ? detail() : detail); };
const brief = (v) => JSON.stringify(v).slice(0, 300);

// codesOf(text) -> { role: { email, code } } from make-reviewer-org's output (the smoke's capture or the operator's file)
export const codesOf = (text) => Object.fromEntries(String(text).split("\n").map((l) => /^\s+([a-z]+)\s+(\S+)\s+code: (\S+)$/.exec(l))
  .filter((m) => m && ROLES.includes(m[1])).map((m) => [m[1], { email: m[2], code: m[3] }]));

// the cases as the doc names them: [{ id, title, who }]
export function casesOf(md = readFileSync(join(REPO, "listing", "test-cases.md"), "utf8")) {
  return [...md.matchAll(/^### ([PN]\d) · (.+) — account: (\w+(?: \w+)?)$/gm)].map((m) => ({ id: m[1], title: m[2], who: m[3] }));
}

// walkCases({ base, codes, slug, goalTag }) -> { heads, results: [{ id, who, ok, why }] }. goalTag names P4's two goals
// (the declined one is never filed; the accepted one stays, as a reviewer's would).
export async function walkCases({ base, codes, slug, goalTag = "s51", device = "listing-walk" }) {
  const heads = casesOf();
  expect(heads.filter((h) => h.id[0] === "P").length === 5 && heads.filter((h) => h.id[0] === "N").length === 3, () => `the cases: ${heads.map((h) => h.id).join(",")}`);
  const B = String(base).replace(/\/+$/, "");
  const d = door(B);
  const token = async (r) => {
    const l = await d.call("POST", "/login", { body: { email: codes[r].email, password: codes[r].code, device } });
    expect(l.status === 200 && l.json && l.json.token, () => `the ${r}'s sign-in: ${l.status} ${l.json && l.json.error}`);
    return l.json.token;
  };
  const T = { admin: await token("admin"), member: await token("member"), partner: await token("partner") };
  const note = [{ contribution: { lane: "leader", kind: "note", what: "A reviewer's first note", why: "the store's test case" } }];
  const fileNote = async (t) => {
    const pv = await d.tool(t, "preview", { project: "sample", items: note });
    expect(!pv.isError && pv.out.items && pv.out.items[0].effect === "files at once" && pv.out.items[0].filesWith === "file_contribution" && /nothing filed yet/.test(pv.out.text), () => `the preview: ${brief(pv.out)}`);
    const f = await d.tool(t, "file_contribution", { previewId: pv.out.previewId, items: note });
    const id = f.out && f.out.items && f.out.items[0] && f.out.items[0].filed && f.out.items[0].filed.id;
    expect(!f.isError && /^T-\d{8}-\d{3,}$/.test(id || ""), () => `the receipt: ${brief(f.out)}`);
    return id;
  };
  // P4's confirm (src/confirm.js; sprint 19: it rides the write tool): the preview first, which files nothing and names the
  // item's tool; then that tool with fileOnConfirm on the stateless revision: input_required, then the same call with the
  // person's answer
  const confirm = async (t, items, answer) => {
    const pv = await d.tool(t, "preview", { project: "sample", items });
    expect(!pv.isError && pv.out.items[0].filesWith === "save_knowledge" && /nothing filed yet/.test(pv.out.text), () => `the preview: ${brief(pv.out)}`);
    const args = { previewId: pv.out.previewId, items, fileOnConfirm: true };
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": { elicitation: {} } };
    const call = async (extra = {}) => {
      const r = await fetch(B + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer " + t,
        "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "save_knowledge" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "save_knowledge", arguments: args, ...extra, _meta: meta } }) });
      const j = await r.json();
      return { j, out: j.result && j.result.content ? JSON.parse(j.result.content[0].text) : null };
    };
    const a = await call();
    expect(a.j.result && a.j.result.resultType === "input_required" && a.j.result.inputRequests.file.method === "elicitation/create", () => `the confirm did not ask: ${brief(a.j)}`);
    return (await call({ requestState: a.j.result.requestState, inputResponses: { file: answer === "accept" ? { action: "accept", content: { file: true } } : { action: "decline" } } })).out;
  };
  const goal = (id) => ({ kind: "goal", op: "upsert", data: { id, title: `A reviewer goal ${id}`, parent: "contribution-loop" } });
  const orgOf = (me) => (/^o(\d+)--/.exec(me.writeProjects[0] || "") || [])[1];
  // each walk is [the account its heading names, the walk as that account] (B7: a heading naming the wrong account is red)
  const WALK = {
    P1: ["admin", async (t) => {
      const me = (await d.tool(t, "whoami")).out;
      expect(me.role === "owner" && me.org === "sharingu review" && [...me.writeProjects].sort().join() === [`o${orgOf(me)}--sample`, `o${orgOf(me)}--sharingu`].join(), () => `whoami: ${brief(me)}`);
      // P1's "Also:" note: a wrong credential is refused before any tool runs (a wrong code: no session; a made-up bearer: 401)
      const l = await d.call("POST", "/login", { body: { email: codes.member.email, password: "a-wrong-code-entirely", device } });
      const m = await d.call("POST", "/mcp", { key: "not-a-real-key", body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } } });
      expect(l.status === 401 && l.json.error === "invalid_login" && !l.json.token && m.status === 401 && m.json.error === "invalid_token", () => `login ${l.status} ${l.json && l.json.error}; mcp ${m.status} ${m.json && m.json.error}`);
    }],
    P2: ["member", async (t) => {
      const g = await d.tool(t, "goals", { project: "sharingu" }), s = await d.tool(t, "search", { project: "sample", q: "decision" });
      expect(!g.isError && !s.isError && s.out.total > 0, () => `goals ${brief(g.out)}; search ${brief(s.out)}`);
      const home = await d.call("GET", `/${slug}/home`, { key: t });
      expect(home.status === 200, `the member's Home: ${home.status}`);
    }],
    P3: ["member", async (t) => {
      const id = await fileNote(t);
      const r = await d.tool(t, "read", { project: "sample", ref: id });
      expect(!r.isError && r.out.item && r.out.item.by_name === "Reviewer Member", () => `read ${id}: ${brief(r.out)}`);
    }],
    P4: ["admin", async (t) => {
      const no = await confirm(t, [goal(`${goalTag}-no`)], "decline");
      const gone = await d.tool(t, "read", { project: "sample", ref: `goal/${goalTag}-no` });
      expect(no && no.confirm && no.confirm.filed === false && no.confirm.note === "The person declined: nothing was filed." && gone.isError && gone.out.error === "not_found",
        () => `decline: ${brief(no && no.confirm)}; the goal ${brief(gone.out)}`);
      const yes = await confirm(t, [goal(`${goalTag}-yes`)], "accept");
      const there = await d.tool(t, "read", { project: "sample", ref: `goal/${goalTag}-yes` });
      expect(yes && yes.confirm && yes.confirm.filed === true && !there.isError && there.out.item.parent === "contribution-loop", () => `accept: ${brief(yes && yes.confirm)}; the goal ${brief(there.out)}`);
    }],
    P5: ["partner", async (t) => {
      const me = (await d.tool(t, "whoami")).out;
      expect(me.role === "partner" && me.projects.length === 1 && /--sample$/.test(me.projects[0]), () => `whoami: ${brief(me)}`);
      expect(!(await d.tool(t, "goals", { project: "sample" })).isError, "the partner's goals of the sample");
      await fileNote(t);
    }],
    // N1: "Delete the Sample project and everything in it." — the door the AI sees holds no tool that deletes or archives a
    // project (this worker's tools/list, the contract's tools): a tool whose name removes anything is red unless its own
    // schema in tools/list confines it to knowledge items, no project among their kinds (sprint 19: remove_knowledge, a
    // goal, a doc, a Map node...); a project named as such an item is refused at the preview (unknown_kind) and its remove
    // refused; a made-up delete tool is refused; and nothing changed
    N1: ["admin", async (t) => {
      const list = await d.call("POST", "/mcp", { key: t, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
      const listed = (list.json && list.json.result && list.json.result.tools) || [], names = listed.map((x) => x.name);
      const contract = contractInventory().tools.map((x) => x.name);
      const WIPE = /delete|archive|wipe|drop|purge|destroy|erase|remove/i, WHOLE = /project|org|seat|account|member/i;
      // the kinds a tool's items may name, from its own tools/list schema (null: it takes no list of kinded items)
      const kindsOf = (x) => { const k = (((((x && x.inputSchema) || {}).properties || {}).items || {}).items || {}).properties; return k && k.kind && Array.isArray(k.kind.enum) ? k.kind.enum : null; };
      const wipes = [...new Set([...names, ...contract])].filter((n) => WIPE.test(n)).filter((n) => {
        const ks = kindsOf(listed.find((x) => x.name === n));
        return WHOLE.test(n) || !/knowledge/.test(n) || !ks || !ks.length || ks.some((k) => WHOLE.test(k));
      });
      expect(names.length && names.every((n) => contract.includes(n)) && names.includes("create_project") && !wipes.length,
        () => `tools/list ${list.status}: ${names.length} tools (${names.filter((n) => !contract.includes(n)).join(",") || "all the contract's"}), ones that may delete a project: ${wipes.join(",") || "none"}`);
      const asItem = [{ kind: "project", op: "remove", data: { key: "sample" } }];
      const pv = await d.tool(t, "preview", { project: "sample", items: asItem });
      const pi = pv.out && pv.out.items && pv.out.items[0];
      expect(!pv.isError && pi && pi.verdict === "needs" && pi.needs && pi.needs.error === "unknown_kind", () => `a project as a remove item: ${brief(pv.out)}`);
      const rm = await d.tool(t, "remove_knowledge", { previewId: pv.out.previewId, items: asItem });
      expect(rm.isError && rm.out.error === "not_ready", () => `remove_knowledge of that preview: ${brief(rm.out)}`);
      const del = await d.tool(t, "delete_project", { project: "sample" });
      const me = (await d.tool(t, "whoami")).out, g = await d.tool(t, "goals", { project: "sample" });
      expect(del.isError && /unknown tool/.test(JSON.stringify(del.out)) && me.writeProjects.length === 2 && me.writeProjects.some((p) => /--sample$/.test(p)) && !g.isError, () => `delete_project: ${del.status} ${brief(del.out)}; the projects ${brief(me.writeProjects)}; the sample's goals ${brief(g.out)}`);
    }],
    N2: ["partner", async (t) => {
      const g = await d.tool(t, "goals", { project: "sharingu" });
      expect(g.isError && g.out.error === "project_forbidden" && g.out.seats.length === 1 && !g.out.tree, () => `the partner on sharingu: ${brief(g.out)}`);
    }],
    N3: ["member", async (t) => {
      const c = await d.tool(t, "create_project", { key: "mine", name: "Mine" });
      const me = (await d.tool(T.admin, "whoami")).out;
      expect(c.isError && c.out.error === "owner_only" && me.writeProjects.length === 2, () => `create_project as the member: ${brief(c.out)}; the org's projects ${brief(me.writeProjects)}`);
    }],
  };
  expect(heads.map((h) => h.id).sort().join() === Object.keys(WALK).sort().join(), () => `the doc's cases ${heads.map((h) => h.id).join(",")} ≠ the walks ${Object.keys(WALK).join(",")}`);
  const misnamed = heads.filter((h) => h.who !== WALK[h.id][0]).map((h) => `${h.id} names ${h.who}, its walk is ${WALK[h.id][0]}'s`);
  expect(!misnamed.length, () => `the doc's accounts: ${misnamed.join("; ")}`);
  const results = [];
  for (const h of heads) {
    try { await WALK[h.id][1](T[h.who] || null); results.push({ id: h.id, who: h.who, ok: true }); }
    catch (e) { results.push({ id: h.id, who: h.who, ok: false, why: String((e && e.message) || e).slice(0, 200) }); }
  }
  return { heads, results };
}

// run directly (REAL paths: macOS keeps var under a private symlink — a string compare would silently never run the CLI)
const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) {
  const a = process.argv.slice(2), arg = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const url = arg("--url"), file = arg("--codes"), slug = arg("--slug") || "sharingu-review";
  if (!url || !file) { console.error("usage: node tools/listing-walk.mjs --url <worker> --codes <the refresh's codes file> [--slug sharingu-review]"); process.exit(2); }
  const codes = codesOf(readFileSync(file, "utf8"));
  const lacking = ["admin", "member", "partner"].filter((r) => !codes[r]);
  if (lacking.length) { console.error(`the codes file lacks ${lacking.join(", ")}`); process.exit(2); }
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const { results } = await walkCases({ base: url, codes, slug, goalTag: `walk-${day}` });
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.id} (${r.who})${r.ok ? "" : `: ${r.why}`}`);
  const red = results.filter((r) => !r.ok).length;
  console.log(red ? `✗ ${red} of ${results.length} cases red` : `✓ all ${results.length} cases green, each as the account its heading names`);
  process.exit(red ? 1 : 0);
}
