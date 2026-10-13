// day1-door-selftest.mjs — the ratchet for B7a THE DOOR (Q60CCC574: day-1 is ONE MCP URL + a key). Offline, no
// network, a fake env. Locks, per walk defect:
//   W11 initialize negotiates the client's protocol (echo if listed, else the newest) and carries `instructions`
//       — D5: five numbered calls, the ONE list Control · Connect shows (src/controlpage.js FIRST_CALLS): whoami · missing ·
//       formats · preview · file; then updates, the start-here read (`read` doc/start-here.md), ask, wrap_up;
//       a notification is 202 with no body; a JSON-RPC batch is answered as an array. D3b: the stateless revision
//       (MODERN_PROTOCOLS) answers server/discover with the same instructions and server name (the rest of that revision:
//       tools/dual-era-selftest.mjs).
//   W1  whoami carries org · activeProject · projectGloss · laneGloss · consentGloss, the old fields unchanged.
//   W6  project_required / project_forbidden say what to do (note + example), still refusals (ADR-100).
//   W7  every incomplete route names `missing`; the note + example complete it; the plain note path files (in lane leader
//       no kind is a plain note: plainNoteKind, the doors' default; no other lane is given a kind).
//   W9  `ask` records an unknown event (payload ask:true), answers asked + tempo 'with <owner>'; question_required.
//   security by absence: no land · deploy · publish · consent · reopen tool in the registry.
//   B7d (the re-walk, Q60CCC574): S1 start-here renders the gloss's own org-note sentence · S3 the lane gloss names
//       lane "leader" · S4a wrap_up takes `project` (schema, stamp, refusal) · S5 the reply's tempo + binding words ·
//       S6 the suggestion's note · S7c no ADR id in a schema property description.
//   U-MCP-tail-b (QE6B9CEBA, Q952CAE10): D3 projectArg on every shape (a non-string is project_forbidden at resolveProject,
//       doorProject and ask, never a throw, never coerced — a 1-element array is not a key); D4 an owner's stamp on an
//       ARCHIVED project neither defaults a read nor stamps a write (whoami's activeProject null), a live one answers as
//       before; D5 one project per answer call (an entry naming another project than its call is refused, nothing filed; a
//       named project's qid is validated against THAT project's pack, never the call's default read scope); D7 the read
//       project rule (a scope -> = ?, a single-project org -> no filter, a multi-project null scope -> IS NULL).
//   U-MCP (Q0D506BBC): resolveProject's rules — a named seat reads it, a non-seat is refused project_forbidden (the owner: any
//       ACTIVE project, never an inactive one), no project reads the active one, else the first in manifest ORDER the caller
//       may read (never a seatless project; seated nowhere: the root), on generated keys; the read never writes the stamp,
//       and a defaulted scope never re-stamps a write (a multi-seat write with no project still answers project_required).
// Run in the gate. (W10 lives in tools/handoff-selftest.mjs + tools/thread-selftest.mjs.)
import { orgRow } from "./fixtures/org-row.mjs";
import { ORG_SQL } from "../src/tenant.js";
import { asOrg, org1 } from "./fixtures/org.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleMcp, callTool, negotiateProtocol, instructionsFor, MCP_PROTOCOLS, MODERN_PROTOCOLS, META_PROTOCOL, META_CAPS, META_SERVER, START_HERE_DOC } from "../src/mcp.js";
import { FIRST_CALLS } from "../src/controlpage.js";
import { PROJECT_RULE, PROJECT_ARG, READ_PROJECT_RULE, seatName, whoamiFor, doorProject, laneGloss, consentGloss, projectGloss, activeProjectOf, orgNoteDefault, homeProjectOf, replyTempo, AUTO_NOTE, withSuggestionNote, projectArg, liveStampOf, PROJECT_ARG_NOTE, orgIsMultiProject } from "../src/core.js";
import { resolveProject, projectOf, projectScopeOf, projectClause, PROJECT } from "../src/project.js";
import { respondOptions } from "../src/qnaire.js";
import { entriesFrom, answerProjectOf, fileRound } from "../src/decisions.js";
import { startHereText } from "../src/starthere.js";
import { fileHandoffRecord, mcpHandoffReply } from "../src/handoff.js";
import { TEMPO_WORDS } from "../src/tempo.js";
import { gateGrade, completingExample, incompleteNote, PLAIN_NOTE, plainNoteKind } from "../src/transmission.js";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
let checks = 0, failed = 0;
const ok = (cond, label) => { checks++; if (!cond) { failed++; console.log(`  ✗ ${label}`); } };

// a fake env: R2 answers the keys in `r2`; D1 answers by SQL shape; every INSERT is recorded
// questions: { <project>: [{qid, question, status, options:[{what}], whoOwes}] } — the rows the knowledge store reads (k_questions)
function fakeEnv({ r2 = {}, org = null, seats = [], projects = [], loops = 0, names = {}, questions = {} } = {}) {
  const inserts = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { inserts.push({ sql, args }); return { success: true }; },
    first: async () => {
      if (sql === org1(ORG_SQL)) return org ? orgRow(org) : undefined;   // the org's own row (src/tenant.js)
      if (/COUNT\(\*\) AS n FROM loops/.test(sql)) return { n: loops };
      if (/FROM people WHERE role = 'owner'/.test(sql)) return { name: "Owner Person", title: null, role: "owner" };
      if (/SELECT key FROM projects WHERE key = \?/.test(sql)) return projects.includes(args[0]) ? { key: args[0] } : undefined;
      if (/SELECT name FROM projects WHERE key = \?/.test(sql)) return names[args[0]] ? { name: names[args[0]] } : undefined;
      return undefined;
    },
    all: async () => {
      if (/FROM project_seats s JOIN projects p/.test(sql)) return { results: seats.map((k) => ({ key: k, name: names[k] || k })) };
      if (/SELECT key FROM projects WHERE active = 1/.test(sql)) return { results: projects.map((k) => ({ key: k })) };
      if (/FROM k_questions t/.test(sql)) return { results: (questions[args[0]] || []).map((q) => ({ project: args[0], qid: q.qid, question: q.question, status: q.status, who_owes: q.whoOwes || null,
        options_json: JSON.stringify((q.options || []).map((o, idx) => ({ idx, what: o.what }))) })) };
      return { results: [] };
    },
  });
  return asOrg({   // a request signed in to org 1 (src/data.js)
    BRAIN: { get: async (k) => (k in r2 ? { text: async () => r2[k] } : null), list: async () => ({ objects: [] }), put: async (k, v) => { r2[k] = String(v); } },
    DB: { prepare: (sql) => stmt(sql), batch: async (ss) => Promise.all(ss.map((x) => x.run())) },
    _inserts: inserts,
  });
}
const req = (body) => ({ json: async () => body, headers: new Headers() });
const DEPS = { MCP_TOOLS: [], VERSION: "t", workerName: "test-agent-r" };
const ORG = { name: "Testorg" };

// ===================== W11 · the first reply =====================
{
  ok(JSON.stringify(MCP_PROTOCOLS) === JSON.stringify(["2025-06-18", "2025-03-26", "2024-11-05"]), "MCP_PROTOCOLS: the three revisions R honours, newest first");
  ok(negotiateProtocol("2025-06-18") === "2025-06-18" && negotiateProtocol("2024-11-05") === "2024-11-05" && negotiateProtocol("2025-03-26") === "2025-03-26", "a listed revision is echoed");
  ok(negotiateProtocol("2099-01-01") === "2025-06-18" && negotiateProtocol(undefined) === "2025-06-18", "an unknown or absent revision answers the newest");

  const env = fakeEnv({ org: ORG });
  const r = await (await handleMcp(req({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }), env, {}, new URL("https://x/mcp"), DEPS)).json();
  ok(r.result && r.result.protocolVersion === "2025-06-18", `initialize echoes 2025-06-18 -> ${r.result && r.result.protocolVersion}`);
  // sprint 3 S3b: the server is named for a person ("sharingu — <org>"), never the worker's infra name
  ok(r.result && r.result.serverInfo.name === "sharingu — Testorg" && !/agent-r/.test(JSON.stringify(r.result.serverInfo)), `serverInfo names the product and the org, not the worker -> ${r.result && r.result.serverInfo.name}`);
  ok(/^You are connected to sharingu, the shared brain of Testorg\./.test(String((r.result && r.result.instructions) || "")), "the first line names the product, sharingu");
  const ins = String((r.result && r.result.instructions) || "");
  const numbered = ins.split("\n").filter((l) => /^\d\. /.test(l));
  // D5: the first-run guide, five numbered steps in order: whoami → missing → formats → preview → the write tool each item names
  // (sprint 19: file_contribution, save_knowledge, remove_knowledge, each its own operation of the preview)
  ok(numbered.length === 5, `instructions carry exactly five numbered lines -> ${numbered.length}`);
  ok(FIRST_CALLS.join() === "whoami,missing,formats,preview,file_contribution,save_knowledge,remove_knowledge" && FIRST_CALLS.slice(0, 4).every((t, i) => new RegExp(`^${i + 1}\\. Call \`${t}\``).test(numbered[i] || ""))
    && /^5\. Call the write tool each item names/.test(numbered[4] || "") && FIRST_CALLS.slice(4).every((t) => (numbered[4] || "").includes(`\`${t}\``)) && !/`file`/.test(ins),
    `the steps are whoami, missing, formats, preview, then the write tool each item names (the three named; no \`file\`) -> ${numbered.map((l) => l.slice(0, 22)).join(" | ")}`);
  // W4 (B7b): the start-here doc always exists (the org's published copy, else the built-in text), so the line after the steps
  // names it even when nothing is published — and `read` answers it (tools/day1-reading-selftest.mjs proves the read)
  const after = ins.split("\n").slice(-1)[0] || "";
  ok(after.includes(`\`read\` {ref: "doc/${START_HERE_DOC}"}`) && /`updates` first/.test(after) && /`wrap_up`/.test(after), `with nothing published, the session line still names the start-here doc (built in), updates and wrap_up -> ${after}`);
  ok(/Testorg/.test(ins), "the instructions name the org");
  // sprint 12, 12.2: the four steps, written once — one line between the five calls and the session line names a new team's
  // four steps and the two fill skills (the plugin's, and on the starter shelf for any other client), preview then file
  { const lines = ins.split("\n"), at = lines.findIndex((l) => /^A new team's four steps:/.test(l));
    const four = lines[at] || "";
    ok(at === 6 && at < lines.length - 1 && /join and connect/.test(four) && /its people/.test(four) && /fill the product side/.test(four) && /fill the GTM side/.test(four)
      && four.includes("`fill-the-product-side`") && four.includes("`fill-the-gtm-side`") && four.includes("`weekly-review`") && /summaries and links only/.test(four)
      && /previewed, then filed/.test(four) && four.includes("`broadcast`") && four.includes('`equip` {slug: "preset:<slug>", v: <its version on the shelf>}') && /again with confirm: true/.test(four) && four.includes("`read`"),
      `12.2: the line after the five calls names the four steps and the two fill skills -> ${four || "(none)"}`); }

  const old = await (await handleMcp(req({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2024-11-05" } }), env, {}, new URL("https://x/mcp"), DEPS)).json();
  ok(old.result.protocolVersion === "2024-11-05", "an older client keeps its revision");

  const env2 = fakeEnv({ org: ORG });   // the start-here doc always exists (built in, or the project's own in D1)
  const r2 = await (await handleMcp(req({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }), env2, {}, new URL("https://x/mcp"), DEPS)).json();
  const last = r2.result.instructions.split("\n").slice(-1)[0] || "";
  ok(last.includes(`\`read\` {ref: "doc/${START_HERE_DOC}"}`), `the session line names the start-here doc on every initialize -> ${last}`);
  ok(instructionsFor({ org: "O", startHere: null }).split("\n").filter((l) => /^\d\. /.test(l)).length === 5, "instructionsFor is five numbered lines either way");

  const n = await handleMcp(req({ jsonrpc: "2.0", method: "notifications/initialized" }), env, {}, new URL("https://x/mcp"), DEPS);
  ok(n.status === 202 && (await n.text()) === "", `a notification -> 202, no body (got ${n.status})`);
  const b = await handleMcp(req([{ jsonrpc: "2.0", id: 7, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 8, method: "initialize", params: { protocolVersion: "2025-03-26" } }]), env, {}, new URL("https://x/mcp"), DEPS);
  const bj = await b.json();
  ok(Array.isArray(bj) && bj.length === 2 && bj[0].id === 7 && bj[1].id === 8 && bj[1].result.protocolVersion === "2025-03-26", `a batch answers an array, notifications carry none -> ${JSON.stringify(bj).slice(0, 120)}`);
  const bn = await handleMcp(req([{ jsonrpc: "2.0", method: "notifications/initialized" }]), env, {}, new URL("https://x/mcp"), DEPS);
  ok(bn.status === 202, "a batch of notifications only -> 202");
  // D3b: the stateless revision's first answer says the same
  ok(JSON.stringify(MODERN_PROTOCOLS) === JSON.stringify(["2026-07-28"]) && !MCP_PROTOCOLS.some((v) => MODERN_PROTOCOLS.includes(v)), "MODERN_PROTOCOLS: 2026-07-28, apart from the handshake revisions");
  const disc = { jsonrpc: "2.0", id: 9, method: "server/discover", params: { _meta: { [META_PROTOCOL]: "2026-07-28", [META_CAPS]: {} } } };
  const dr = await handleMcp({ json: async () => disc, headers: new Headers({ "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" }) }, env, {}, new URL("https://x/mcp"), DEPS);
  const dj = await dr.json();
  ok(dr.status === 200 && dj.result.instructions === r.result.instructions && JSON.stringify(dj.result._meta[META_SERVER]) === JSON.stringify(r.result.serverInfo), "server/discover carries initialize's instructions and server name");
}

// ===================== W1 · whoami =====================
{
  const person = { id: "p1", name: "Day One", email: "d@x", role: "internal-eng", lane: "code", token_project: null };
  const env = fakeEnv({ org: ORG, seats: ["alpha", "beta"], loops: 1 });
  const w = await whoamiFor(person, env);
  for (const f of ["id", "person", "email", "role", "lane", "openItems", "projects", "consent", "consentSelf", "consentMandated", "consentFloor"]) ok(f in w, `whoami keeps ${f}`);
  ok(w.org === "Testorg", `whoami names the org -> ${w.org}`);
  ok(w.activeProject === null && /2 projects \(alpha, beta\)/.test(w.projectGloss) && w.projectGloss.includes(PROJECT_RULE), `a multi-seat person: activeProject null, the gloss states the one project rule -> ${w.projectGloss}`);
  ok(/^Lane "code": `updates` shows you what changed in code first/.test(w.laneGloss), `laneGloss -> ${w.laneGloss}`);
  // B7d S3: a non-"all" lane still names lane "leader" for a plain note (one line)
  ok(w.laneGloss.endsWith(' Anyone may file a plain note in lane "leader".') && !/\n/.test(w.laneGloss) && !laneGloss("all").includes("leader"), `B7d S3: the lane gloss says anyone may file a plain note in "leader" -> ${w.laneGloss}`);
  ok(/^Consent "off": sharingu keeps only what you file/.test(w.consentGloss) && /\/profile/.test(w.consentGloss), `consentGloss -> ${w.consentGloss}`);
  ok(!/\n/.test(w.laneGloss + w.consentGloss + w.projectGloss), "each gloss is one line");
  ok(await activeProjectOf({ ...person, token_project: "beta" }, [{ key: "alpha" }, { key: "beta" }], env) === "beta", "a session stamp is the active project");
  ok(await activeProjectOf(person, [{ key: "solo" }], env) === "solo", "a single seat is the active project");
  ok(projectGloss("solo", ["solo"]).includes('"solo"'), "the gloss names the active project");
  // B7c: a multi-seat gloss names the org-note default — the fallback when the org marks no home project
  // B7d S1: with no home, the fallback says plainly that any of the person's projects is fine (never "pick the closest")
  ok(w.projectGloss.endsWith(" " + orgNoteDefault(null, ["alpha", "beta"])) && /any of your projects \(alpha, beta\) is fine\.$/.test(w.projectGloss) && !/closest|any seated project is accepted/.test(w.projectGloss), `B7c/B7d: no home project -> the gloss names the plain org-note default -> ${w.projectGloss}`);
  const wh = await whoamiFor(person, fakeEnv({ org: { name: "Testorg", home: "Beta" }, seats: ["alpha", "beta"] }));
  ok(wh.activeProject === null && wh.projectGloss.endsWith(' A note about the org rather than one project goes under "beta".') && wh.projectGloss.startsWith("You hold seats on 2 projects (alpha, beta) and none is active. " + PROJECT_RULE + " ") && !/\n/.test(wh.projectGloss), `B7c: a seated home project is named, activeProject stays null -> ${wh.projectGloss}`);
  const wo = await whoamiFor(person, fakeEnv({ org: { name: "Testorg", home: "gamma" }, seats: ["alpha", "beta"] }));
  ok(wo.projectGloss.endsWith(" " + orgNoteDefault(null, ["alpha", "beta"])) && !/gamma/.test(wo.projectGloss), `B7c: a home project the person holds no seat on is never named -> ${wo.projectGloss}`);
  ok(homeProjectOf({ home: "B" }) === "b" && homeProjectOf({ home: null }) === null && homeProjectOf(null) === null && homeProjectOf({}) === null, "B7c: homeProjectOf reads the org row's home, lowercased, else null");
  ok(projectGloss(null, ["alpha", "beta"], "beta").endsWith('goes under "beta".') && projectGloss("alpha", ["alpha", "beta"], "beta") === projectGloss("alpha", ["alpha", "beta"]) && projectGloss(null, [], "beta") === projectGloss(null, []), "B7c: home only feeds the multi-seat branch");
  ok(laneGloss("all").includes("every lane") && consentGloss("traces", false).includes("never your prompts") && consentGloss("traces+prompts", true).includes("minimum for your role"), "the other glosses read");
}

// ===================== W6 · the project refusals say what to do =====================
{
  const env = fakeEnv();
  const person = { id: "p1", role: "internal-eng" };
  const seats = [{ key: "alpha" }, { key: "beta" }];
  const r = await doorProject(person, {}, seats, env);
  ok(r.error === "project_required" && JSON.stringify(r.seats) === '["alpha","beta"]', "no project on a multi-seat write is still refused, seats listed (ADR-100: never a silent default)");
  ok(/^Add `project`: one of \[alpha, beta\]/.test(r.note || "") && r.example && r.example.project === "alpha", `project_required carries a note + an example -> ${r.note}`);
  // B7c: the refusal names the SAME org-note default as the gloss (one source), and is still a refusal
  ok(r.note.endsWith(" " + orgNoteDefault(null, ["alpha", "beta"])) && projectGloss(null, ["alpha", "beta"]).endsWith(" " + orgNoteDefault(null, ["alpha", "beta"])), `B7c: project_required names the gloss's org-note default -> ${r.note}`);
  const rh = await doorProject(person, {}, seats, fakeEnv({ org: { name: "Testorg", home: "beta" } }));
  ok(rh.error === "project_required" && !rh.project && rh.note.endsWith(' goes under "beta".') && rh.example.project === "alpha", `B7c: with a seated home project the refusal names it, never stamps it -> ${rh.note}`);
  const rx = await doorProject(person, {}, seats, asOrg({ DB: env.DB }));
  ok(rx.error === "project_required" && rx.note.endsWith(" " + orgNoteDefault(null, ["alpha", "beta"])), "B7c: no tenant readable -> the refusal still carries the fallback sentence");
  const f = await doorProject(person, { project: "gamma" }, seats, env);
  ok(f.error === "project_forbidden" && /one of \[alpha, beta\]/.test(f.note || "") && f.example.project === "alpha", `project_forbidden says which to use -> ${f.note}`);
  const one = await doorProject(person, {}, [{ key: "solo" }], env);
  ok(one.project === "solo" && !one.error, "a single seat still stamps silently");
}

// ===================== W7 · incomplete says how to complete =====================
{
  const vs = (raw) => { const list = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean); return { list, ok: list.every((x) => x === "010"), unknown: list.filter((x) => x !== "010"), reserved: [] }; };
  const vc = (list) => ({ available: true, ok: list.every((c) => c === "comp-a"), list, unknown: list.filter((c) => c !== "comp-a") });
  const base = { what: "w", why: "y", touches: ["t"] };
  const g = (sub) => gateGrade(sub, vs, vc);
  const a = g({ lane: "code", ...base });
  // the one-pass fix 1 (owner, 2026-10-01): screens only when it changes one, components never required (touches say it)
  ok(a.route === "incomplete" && JSON.stringify(a.grade.missing) === '["proof"]', `code that says what it touches needs only proof -> ${JSON.stringify(a.grade.missing)}`);
  const b = g({ lane: "code", ...base, screens: "010" });
  ok(b.route === "incomplete" && JSON.stringify(b.grade.missing) === '["proof"]', `code with a screen in the Map needs only proof -> ${JSON.stringify(b.grade.missing)}`);
  const b2 = g({ lane: "code", ...base, screens: "999", components: ["nope"] });
  ok(b2.route === "incomplete" && JSON.stringify(b2.grade.missing) === '["screens","proof","components"]', `a screen and a component not in the Map and no proof name all three -> ${JSON.stringify(b2.grade.missing)}`);
  const c = g({ lane: "code", ...base, screens: "010", components: ["comp-a"], proof: "works fine" });
  ok(c.route === "incomplete" && JSON.stringify(c.grade.missing) === '["proof"]', `a narration proof names proof -> ${JSON.stringify(c.grade.missing)}`);
  const d = g({ lane: "design", kind: "screen", ...base });
  ok(d.route === "incomplete" && JSON.stringify(d.grade.missing) === '["screens"]', `a screen design with no screen names screens -> ${JSON.stringify(d.grade.missing)}`);
  const e = g({ lane: "gtm", ...base });
  ok(e.route === "incomplete" && JSON.stringify(e.grade.missing) === '["proof"]', `gtm with no link names proof -> ${JSON.stringify(e.grade.missing)}`);
  const f = g({ lane: "leader", what: "w" });
  ok(JSON.stringify(f.grade.missing) === '["why","touches"]' && f.grade.binding === false, "the three lines keep their own missing (unchanged)");
  const done = g({ lane: "code", ...base, screens: "010", components: ["comp-a"], proof: "npm test -> exit 0, 3 passing" });
  ok(done.route === "auto" && !("missing" in done.grade), "a complete filing carries no missing");
  const ex = completingExample("code", b2.grade.missing);
  ok(Object.keys(ex).join(",") === "screens,proof,components" && /exit 0/.test(ex.proof), `the example completes every missing field -> ${JSON.stringify(ex)}`);
  ok(/^https?:/.test(completingExample("gtm", ["proof"]).proof), "gtm's proof example is a link");
  const note = incompleteNote("code", b2.grade.missing);
  ok(/missing: screens, proof, components\./.test(note) && /plain note — lane "leader", kind "note"/.test(note), `the note names the gaps and the plain note path -> ${note}`);
  const plain = g({ ...PLAIN_NOTE, ...base });
  ok(plain.route === "auto" && plain.grade.binding === true, `the plain note (lane leader, kind note) files binding with the three lines only -> ${plain.route}`);
  // the door's default (owner, 2026-10-13): in lane leader no kind IS a plain note; no other lane is given a kind
  const kinds = [{ lane: "leader" }, { lane: "Leader", kind: "" }, { lane: "leader", kind: "  " }, { lane: "leader", kind: null }, { lane: "leader", kind: "decision" }, { lane: "code" }, { lane: "design", kind: "" }]
    .map((b) => plainNoteKind({ ...b, what: "w" }).kind);
  ok(JSON.stringify(kinds) === JSON.stringify(["note", "note", "note", "note", "decision", undefined, ""]), `a kind-less leader filing becomes kind note, every other kind and lane as sent -> ${JSON.stringify(kinds)}`);
  const sym = Symbol("door"), sent = { lane: "leader", what: "w", why: "y", [sym]: 1 };
  const shaped = plainNoteKind(sent);
  ok(shaped !== sent && !("kind" in sent) && shaped[sym] === 1 && plainNoteKind(shaped) === shaped, "the default copies (the body as sent unchanged, its door marks kept) and is idempotent");
  const bare = g(plainNoteKind({ lane: "leader", what: "w", why: "y" }));
  ok(bare.route === "auto" && bare.grade.binding === true, `a leader filing with no kind and no touches files as a plain note -> ${bare.route} ${JSON.stringify(bare.grade.missing || [])}`);
  const codeBare = g(plainNoteKind({ lane: "code", what: "w", why: "y" }));
  ok(codeBare.route === "incomplete" && JSON.stringify(codeBare.grade.missing) === '["touches"]', `a code filing with no kind and no touches still needs touches -> ${JSON.stringify(codeBare.grade.missing)}`);
}

// ===================== W9 · ask =====================
{
  const env = fakeEnv();
  const person = { id: "p1", name: "Day One", role: "internal-eng" };
  const TOOLS = [{ name: "ask", owner: false, write: true }];
  const r = await callTool("ask", { question: "Who reviews my first note?", about: "onboarding" }, person, env, new URL("https://x/mcp"), TOOLS);
  ok(r.asked === true && typeof r.id === "string" && r.tempo === "with Owner Person" && /`updates`/.test(r.next), `ask answers asked + id + tempo 'with <owner>' + next -> ${JSON.stringify(r)}`);
  const ins = env._inserts.find((i) => /^INSERT INTO events/.test(i.sql));
  const pl = ins ? JSON.parse(ins.args[5]) : {};
  ok(ins && ins.args[0] === r.id && ins.args[2] === "p1" && ins.args[3] === "unknown", "ask writes ONE events row, kind unknown, for the asker, under the returned id");
  ok(pl.what === "Who reviews my first note?" && pl.ask === true && pl.about === "onboarding" && !("eval" in pl), `the payload carries what + ask + about -> ${JSON.stringify(pl)}`);
  const ev = fakeEnv();
  await callTool("ask", { question: "q", eval: true }, person, ev, new URL("https://x/mcp"), TOOLS);
  ok(JSON.parse(ev._inserts[0].args[5]).eval === 1, "an eval ask carries the eval mark (hidden from the thread)");
  const miss = await callTool("ask", { question: "  " }, person, fakeEnv(), new URL("https://x/mcp"), TOOLS);
  ok(miss.error === "question_required" && /question/.test(miss.note), "an empty question is refused with a next step");
}

// ===================== security by absence + every tool a one-line human description =====================
{
  const src = readFileSync(join(ENGINE, "src", "index.js"), "utf8");
  const reg = src.slice(src.indexOf("const MCP_TOOLS = ["), src.indexOf("\n];", src.indexOf("const MCP_TOOLS = [")));
  const names = [...reg.matchAll(/\{ name:"([a-z_]+)"/g)].map((m) => m[1]);
  ok(names.length >= 30 && names.includes("ask"), `the registry parses (${names.length} tools) and carries ask`);
  // publish_version is the owner's snapshot of the project's knowledge (docs/plan/ARCHITECTURE.md §3), not Broadcast's Publish
  // sprint 3 D2 (MCP.md §5 "Agents: publish, equip", which supersedes Q60CCC574): Broadcast's publish and equip are tools now,
  // each previewed first; every other human verb (land, deploy, consent, reopen) still has no tool
  const human = names.filter((n) => /(^|_)(land|deploy|publish|consent|reopen)(_|$)/.test(n) && !["publish_version", "publish"].includes(n));
  ok(human.length === 0, `no human-verb tool at the door (publish and equip, previewed first, aside) -> ${human.join(",") || "none"}`);
  const descs = [...reg.matchAll(/\{ name:"([a-z_]+)"[^\n]*?desc:"((?:[^"\\]|\\.)*)"/g)];
  const internal = descs.filter((m) => /\b(M-)?ADR-\d|\bT\d+b?\)|\(T\d/.test(m[2])).map((m) => m[1]);
  ok(descs.length === names.length && internal.length === 0, `every tool has a one-line description with no internal ref -> ${internal.join(",") || "clean"}`);
  // B7d S7c: the PROPERTY descriptions a newcomer's client shows carry no ADR / M-ADR id either
  const propIds = [...reg.matchAll(/description:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).filter((d) => /\b(M-)?ADR-\d/.test(d));
  ok(propIds.length === 0, `B7d S7c: no schema property description carries an ADR id -> ${propIds.join(" | ") || "clean"}`);
  // B7d S4a: wrap_up advertises `project` like every other write (D5: its short form, PROJECT_ARG; the one rule is PROJECT_RULE)
  const sh = reg.slice(reg.indexOf('{ name:"wrap_up"'), reg.indexOf('{ name:"search"'));
  ok(/\bproject:\{type:"string",description:PROJECT_ARG\}/.test(sh), "B7d S4a: wrap_up's schema carries `project` (D5: PROJECT_ARG, the write's short form of the one rule)");
}

// ===================== B7d · the re-walk's snags (pure halves; tools/day1-reading-selftest.mjs + evals E-DAY1t.. read the rest) =====================
{
  // S1 — start-here renders the SAME org-note sentence the gloss renders (orgNoteDefault), never a promise the gloss cannot keep
  const noHome = startHereText({ org: "O", engine: "E", owner: "Olive" });
  const wp = (noHome.split("## Which project")[1] || "").split("\n## ")[0];
  ok(wp.includes(orgNoteDefault(null)) && !/`projectGloss` names/.test(noHome) && !/closest|any seated project is accepted/.test(noHome), `B7d S1: start-here (no home) carries the plain org-note sentence -> ${orgNoteDefault(null)}`);
  const withHome = startHereText({ org: "O", engine: "E", owner: "Olive", home: "beta" });
  ok(withHome.includes(orgNoteDefault("beta")) && projectGloss(null, ["alpha", "beta"], "beta").endsWith(" " + orgNoteDefault("beta")), "B7d S1: start-here (home declared) carries the SAME sentence the gloss renders for a seated home");
  ok(/`wrap_up`/.test(wp) && /`respond`/.test(wp) && /`preview`/.test(wp) && /`updates` shows which project/.test(wp), "B7d S4: start-here's project rule names every filing write, and says updates shows the project");
  // S5 — the filing reply wears start-here's word; binding is explained; route/status stay
  ok(replyTempo("auto", "routed") === "in" && replyTempo("owner", "open", "Olive") === "with Olive" && replyTempo("incomplete", "open") === "needs more", "B7d S5: replyTempo maps auto -> in, owner -> with <owner>, incomplete -> needs more");
  ok(["auto", "owner", "incomplete"].every((r) => { const w = replyTempo(r, "routed", "Olive"); return TEMPO_WORDS.includes(w.startsWith("with ") ? "with" : w); }), "B7d S5: every reply tempo is one of the five words");
  const an = AUTO_NOTE({ binding: true, tempo: "in" });
  ok(/counts on the record \(binding\)/.test(an) && /Where it stands: in\./.test(an) && !/auto-sync/.test(an), `B7d S5: the auto note says what binding means, in plain words -> ${an}`);
  // D5: the receipt is file's ({i, n, status, id} per item): no tempo, binding or suggestion field to explain
  ok(/receipt names each item with its status and its id/.test(noHome) && /`effect`/.test(noHome) && !/`binding`|`tempo`|`suggestion`/.test(noHome), "B7d S5 (D5): start-here explains file's receipt, and names no field it does not carry");
  // S6 — the suggestion says it is optional and what it does
  const sg = withSuggestionNote({ goalRef: "onboarding", title: "Onboarding", why: "lane" });
  ok(sg.goalRef === "onboarding" && /^Optional: resend with goalRef "onboarding"/.test(sg.note) && /nothing changes either way/.test(sg.note) && withSuggestionNote(null) === null, `B7d S6: the suggestion carries its explanation -> ${sg.note}`);
}

// ===================== B7d S4a · wrap_up takes `project` =====================
{
  const person = { id: "p1", name: "Day One", role: "internal-eng" };
  const env = fakeEnv({ seats: ["alpha", "beta"] });
  const r = await fileHandoffRecord(person, { summary: "a report", project: "beta" }, env, "mcp");
  const ev = env._inserts.find((i) => /INSERT INTO events/.test(i.sql) && i.args[3] === "exit");
  const pl = ev ? JSON.parse(ev.args[4]) : {};
  ok(r.filed === true && pl.project === "beta" && !("project" in r) && !("project" in (r.receipt || {})), `B7d S4a: a named, seated project is stamped on the report's exit event (no new receipt field) -> ${JSON.stringify(pl.project)}`);
  const envF = fakeEnv({ seats: ["alpha", "beta"] });
  const f = await fileHandoffRecord(person, { summary: "a report", project: "gamma" }, envF, "mcp");
  ok(f.error === "project_forbidden" && /one of \[alpha, beta\]/.test(f.note) && !envF._inserts.some((i) => /INSERT INTO events/.test(i.sql)), `B7d S4a: a project the person holds no seat on is refused before anything is filed -> ${f.error}`);
  const fm = mcpHandoffReply(f, "a report");
  ok(fm.error === "project_forbidden" && !("status" in fm), "B7d S4a: the MCP reply carries the refusal as the other tools do");
  const envS = fakeEnv({ seats: ["solo"] });
  await fileHandoffRecord(person, { summary: "a report" }, envS, "mcp");
  const evS = envS._inserts.find((i) => /INSERT INTO events/.test(i.sql) && i.args[3] === "exit");
  ok(evS && JSON.parse(evS.args[4]).project === "solo", "B7d S4a: a single-seat report is stamped with its one project, no field needed");
  // B7e C2: on REST (the REST door, which sends no project) a multi-seat summary-only report still files, unstamped
  const envM = fakeEnv({ seats: ["alpha", "beta"] });
  const m = await fileHandoffRecord(person, { summary: "a report" }, envM, "rest");
  const evM = envM._inserts.find((i) => /INSERT INTO events/.test(i.sql) && i.args[3] === "exit");
  ok(m.filed === true && evM && !("project" in JSON.parse(evM.args[4])), "B7d S4a/B7e C2: a multi-seat summary-only REST report without `project` still files, unstamped (never a guess)");
}

// ===================== B7e · the day-1 walk's blocking snags (r109) =====================
{
  const vs = () => ({ list: [], ok: true, unknown: [], reserved: [] });
  const vc = (list) => ({ available: true, ok: true, list, unknown: [] });
  const g = (sub) => gateGrade(sub, vs, vc);
  // C1 — touches is optional for the plain note ONLY
  const pn = g({ lane: "leader", kind: "note", what: "hello from a new seat", why: "saying hello" });
  ok(pn.route === "auto" && pn.grade.binding === true && !("missing" in pn.grade), `B7e C1: a plain note (leader/note) with no touches files binding -> ${pn.route} ${JSON.stringify(pn.grade.missing)}`);
  const pnRisk = g({ lane: "leader", kind: "note", what: "change the payment vendor", why: "y" });
  ok(pnRisk.grade.binding === true && pnRisk.route !== "incomplete", `B7e C1: the risk check still runs on a touches-less plain note -> ${pnRisk.route}`);
  for (const sub of [{ lane: "leader" }, { lane: "leader", kind: "change" }, { lane: "code", kind: "note" }, { lane: "design", kind: "note" }, { lane: "gtm" }, { lane: "ba", kind: "note" }, { lane: "vendor" }]) {
    const r = g({ ...sub, what: "w", why: "y" });
    ok(r.route === "incomplete" && (r.grade.missing || []).includes("touches"), `B7e C1: ${sub.lane}/${sub.kind || "-"} with no touches still names missing:touches -> ${JSON.stringify(r.grade.missing)}`);
  }
  ok(!/touches only/.test(incompleteNote("code", ["proof"])) && /what and why only \(touches optional\)/.test(incompleteNote("code", ["proof"])), "B7e C1: the incomplete note offers the plain note as what and why only");
  const src = readFileSync(join(ENGINE, "src", "index.js"), "utf8");
  const reg = src.slice(src.indexOf("const MCP_TOOLS = ["), src.indexOf("\n];", src.indexOf("const MCP_TOOLS = [")));
  const slice = (name) => { const i = reg.indexOf(`{ name:"${name}"`); const j = reg.indexOf("{ name:", i + 5); return reg.slice(i, j < 0 ? undefined : j); };
  // D5: a contribution is filed as a preview item; its shape is the registry's (formats {shape}), which says the same
  const { formatsAnswer } = await import("../src/formats.js");
  const lt = ((formatsAnswer({ shape: "leader" }).fields || []).find((x) => x.name === "touches") || {});
  ok(!lt.required && /leave it out for a plain note/.test(lt.hint || ""), "B7e C1: the leader shape (formats) does not require touches, and says a plain note leaves it out");
  const sh = startHereText({ org: "O", engine: "E", owner: "Olive" });
  const step4 = (sh.split("4. Contribute one thing.")[1] || "").split("\n5. ")[0];
  ok(!/"touches": \[/.test(step4) && /`touches`.*optional for a plain note/.test(step4), "B7e C1: start-here's plain-note example carries no touches and says it is optional");

  // C2 — ONE project rule, in the same words, everywhere a newcomer reads it
  // D5: the write tools carry the short form, PROJECT_ARG; the one rule (PROJECT_RULE) is whoami's gloss and start-here's
  for (const n of ["ask", "wrap_up", "preview", "respond"]) ok(/\bproject:\{type:"string",description:PROJECT_ARG\}/.test(slice(n)), `B7e C2: ${n}'s project description is PROJECT_ARG`);
  ok(!/optional: which of your projects/.test(reg) && !/required only when you hold seats/.test(reg), "B7e C2: no older, different project wording is left in the registry");
  const wp = (sh.split("## Which project")[1] || "").split("\n## ")[0];
  ok(wp.split("\n").includes(PROJECT_RULE), "B7e C2: start-here's Which project section states PROJECT_RULE verbatim, on its own line");
  ok(projectGloss(null, ["alpha", "beta"]).includes(" " + PROJECT_RULE + " ") && !projectGloss(null, ["alpha", "beta"]).includes("add `project` to every write"), "B7e C2: whoami's multi-seat gloss states PROJECT_RULE verbatim");
  const person = { id: "p1", name: "Day One", role: "internal-eng" };
  const TOOLS = [{ name: "ask", owner: false, write: true }, { name: "wrap_up", owner: false, write: true }];
  const U = new URL("https://x/mcp");
  const e1 = fakeEnv({ seats: ["alpha", "beta"] });
  const a1 = await callTool("ask", { question: "q?" }, person, e1, U, TOOLS);
  ok(a1.error === "project_required" && JSON.stringify(a1.seats) === '["alpha","beta"]' && !e1._inserts.length, `B7e C2: ask, multi-seat, no project -> project_required, nothing recorded -> ${a1.error}`);
  const e2 = fakeEnv({ seats: ["alpha", "beta"] });
  const a2 = await callTool("ask", { question: "q?", project: "beta" }, person, e2, U, TOOLS);
  ok(a2.asked === true && e2._inserts[0] && e2._inserts[0].args[9] === "beta", `B7e C2: ask with a seated project files under it -> ${e2._inserts[0] && e2._inserts[0].args[9]}`);
  const e3 = fakeEnv({ seats: ["alpha", "beta"] });
  const a3 = await callTool("ask", { question: "q?", project: "gamma" }, person, e3, U, TOOLS);
  ok(a3.error === "project_forbidden" && !e3._inserts.length, "B7e C2: ask naming a project not yours is refused (never silently ignored)");
  const e4 = fakeEnv({ seats: ["alpha", "beta"] });
  const a4 = await callTool("ask", { question: "q?" }, { ...person, token_project: "alpha" }, e4, U, TOOLS);
  ok(a4.asked === true && e4._inserts[0].args[9] === "alpha", "B7e C2: ask with an ACTIVE project (the session stamp) fills it in, as the gloss promises");
  const dp = await doorProject({ ...person, token_project: "beta" }, {}, [{ key: "alpha" }, { key: "beta" }], fakeEnv());
  ok(dp.project === "beta" && !dp.error, "B7e C2: the filing door (doorProject) fills the active project too");
  const r2of5 = {};
  const e5 = fakeEnv({ r2: r2of5, seats: ["alpha", "beta"] });
  const h5 = mcpHandoffReply(await fileHandoffRecord(person, { summary: "a report", open: ["x"] }, e5, "mcp"), "a report");
  const r2of5b = {};
  await fileHandoffRecord(person, { summary: "a report", open: ["x"] }, fakeEnv({ r2: r2of5b, seats: ["alpha", "beta"] }), "rest");
  ok(Object.keys(r2of5b).some((k) => k.startsWith("o1/inbox/handoffs/")), "B7e C2: (the probe sees a put) the REST twin of that report IS stored");
  ok(h5.error === "project_required" && !Object.keys(r2of5).some((k) => /^(?:o\d+\/)?inbox\//.test(k)) && !e5._inserts.length && !("status" in h5), `B7e C2: MCP wrap_up, multi-seat, no project -> project_required BEFORE anything is stored -> ${h5.error}`);
  const e6 = fakeEnv({ seats: ["alpha", "beta"] });
  const h6 = await fileHandoffRecord(person, { summary: "a report", project: "alpha" }, e6, "mcp");
  ok(h6.filed === true, "B7e C2: MCP wrap_up with a seated project files");
  const e7 = fakeEnv({ seats: ["alpha", "beta"] });
  const h7 = await fileHandoffRecord({ ...person, token_project: "beta" }, { summary: "a report" }, e7, "mcp");
  const ev7 = e7._inserts.find((i) => /INSERT INTO events/.test(i.sql) && i.args[3] === "exit");
  ok(h7.filed === true && ev7 && JSON.parse(ev7.args[4]).project === "beta", "B7e C2: MCP wrap_up with an active project files under it");

  // C5 — the org-note sentence names the key AND the project's own name (from the projects table)
  ok(orgNoteDefault("siru-services", [], "Ryuklabs") === 'A note about the org rather than one project goes under "siru-services" (Ryuklabs — the org\'s own project).', `B7e C5: key + name -> ${orgNoteDefault("siru-services", [], "Ryuklabs")}`);
  ok(orgNoteDefault("beta", [], "beta") === orgNoteDefault("beta") && orgNoteDefault("beta", [], null) === 'A note about the org rather than one project goes under "beta".' && orgNoteDefault(null, ["a", "b"], "X") === orgNoteDefault(null, ["a", "b"]), "B7e C5: a name equal to the key, no name, or no home adds nothing");
  ok(seatName([{ key: "beta", name: "Beta Co" }], "beta") === "Beta Co" && seatName([{ key: "beta", name: "Beta Co" }], "gamma") === null && seatName([], null) === null, "B7e C5: seatName reads the seat's own name");
  const e8 = fakeEnv({ org: { name: "Testorg", home: "beta" }, seats: ["alpha", "beta"], names: { alpha: "Alpha", beta: "Beta Co" } });
  const w8 = await whoamiFor({ id: "p1", name: "D", role: "internal-eng", lane: "code" }, e8);
  const r8 = await doorProject({ id: "p1", role: "internal-eng" }, {}, [{ key: "alpha", name: "Alpha" }, { key: "beta", name: "Beta Co" }], e8);
  const want = 'A note about the org rather than one project goes under "beta" (Beta Co — the org\'s own project).';
  ok(w8.projectGloss.endsWith(" " + want) && r8.note.endsWith(" " + want), `B7e C5: whoami's gloss and project_required name the key and the name -> ${w8.projectGloss.slice(-90)}`);
  const doc8 = await callTool("read", { ref: `doc/${START_HERE_DOC}` }, { id: "p1", role: "internal-eng" }, e8, U, [{ name: "read", owner: false, project: true }]);
  const docText = doc8 && doc8.item ? doc8.item.body : JSON.stringify(doc8);
  ok(docText.includes(want), `B7e C5: start-here (built in) renders the SAME sentence, the name read from the projects table -> ${docText.includes(want)}`);
}

// ===================== U-MCP · the read scope (resolveProject, Q0D506BBC) =====================
{
  // generated keys: the rule is generic (a key literal in the helper could not pass); the org's order is the projects table's
  // (by key: the real seats and active-keys reads sort by key; this fake answers them in the order given)
  const g = () => "k" + Math.random().toString(36).slice(2, 8);
  const [K1, K2, K3, K4] = [g(), g(), g(), g()];
  const seatsOf = (...ks) => ks.map((k) => ({ key: k, name: k }));
  const envOf = (o = {}) => fakeEnv({ org: ORG, projects: [K1, K2, K4], ...o });
  const member = { id: "pm", role: "internal-eng", token_project: null }, owner = { id: "po", role: "owner", token_project: null };
  const e = envOf();
  const n1 = await resolveProject(member, K1.toUpperCase() + " ", seatsOf(K1, K2), e);
  ok(n1.project === K1 && n1.named === true && n1.env[PROJECT] === K1 && !n1.error, "a named seat (any case, trimmed) reads that project, the env scoped to it");
  const f1 = await resolveProject(member, K1, seatsOf(K2), e);
  ok(f1.error === "project_forbidden" && f1.project === K1 && JSON.stringify(f1.seats) === JSON.stringify([K2]) && f1.note.includes(K2) && f1.example && f1.example.project === K2 && !f1.env, "a named project the caller holds no seat on: project_forbidden with seats, note, example, and no env to read");
  const f0 = await resolveProject(member, K1, [], e);
  ok(f0.error === "project_forbidden" && JSON.stringify(f0.seats) === "[]" && !("example" in f0), "seated nowhere, naming a project: refused, no example to offer");
  ok((await resolveProject(owner, K4, [], e)).project === K4, "the owner may name any ACTIVE project (one it holds no seat on)");
  ok((await resolveProject(owner, K3, [], e)).error === "project_forbidden", "the owner naming an INACTIVE project is refused");
  const st = await resolveProject({ ...member, token_project: K1 }, null, seatsOf(K1, K2), e);
  ok(st.project === K1 && st.active === true && st.named === false && !st.note, "no project: the session stamp is the active project");
  const one = await resolveProject(member, "", seatsOf(K1), e);
  ok(one.project === K1 && one.active === true, "no project, one seat: that seat");
  const multi = await resolveProject(member, undefined, seatsOf(K1, K2), e);
  ok(multi.project === K1 && multi.active === false && multi.env[PROJECT] === K1 && multi.note.includes(K1) && multi.note.includes(K2), `no project, two seats, none active: the FIRST of the caller's seats in the org's order + a note naming both -> ${multi.project === K1}`);
  const second = await resolveProject(member, null, seatsOf(K2), envOf());
  ok(second.project === K2, "a caller seated on the org's SECOND project only reads it (never the first: the seat hole)");
  const offManifest = await resolveProject(member, null, seatsOf(K4), e);
  ok(offManifest.project === K4, "a caller seated only on the org's third project reads that seat");
  const none = await resolveProject(member, null, [], e);
  ok(none.project === null && none.env === e && !none.note, "seated nowhere (not the owner): project null, the org root");
  const od = await resolveProject(owner, null, [], envOf());
  ok(od.project === K1 && od.active === false, "the owner with no project: the first ACTIVE project (an inactive one, K3, is never read)");
  ok(/^one of your projects/.test(READ_PROJECT_RULE) && READ_PROJECT_RULE.includes("project_forbidden") && READ_PROJECT_RULE !== PROJECT_RULE && /project_required/.test(PROJECT_ARG), "READ_PROJECT_RULE is its own sentence (D5: short), beside PROJECT_RULE and PROJECT_ARG");
  // the scoped call: a read never writes; a defaulted scope never re-stamps a write
  const U = new URL("https://x/mcp");
  const TOOLS_U = [{ name: "missing", owner: false, project: true }, { name: "preview", owner: false, project: true, stores: true }];
  const ew = envOf({ seats: [K1, K2] });
  const h = await callTool("missing", {}, { ...member }, ew, U, TOOLS_U);
  ok(h.project === K1 && /Add `project`: one of \[/.test(h.projectNote || "") && ew._inserts.length === 0, `a defaulted read answers the first project with projectNote, and writes nothing (no stamp) -> ${h.project === K1}`);
  const hf = await callTool("missing", { project: K3 }, { ...member }, ew, U, TOOLS_U);
  ok(hf.error === "project_forbidden" && ew._inserts.length === 0, "a named read the caller may not make is refused before anything runs");
  const w0 = await callTool("preview", { items: [{ contribution: { lane: "leader", kind: "note", what: "a note", why: "why" } }] }, { ...member, name: "M" }, ew, U, TOOLS_U);
  ok(w0.error === "project_required" && ew._inserts.length === 0, `a multi-seat write with no project answers project_required — the read default is never its stamp -> ${w0.error}`);
}

// ===================== U-MCP-tail-b · the scope helper's input, the live stamp, one project per answer, the read project =====================
{
  const g = () => "k" + Math.random().toString(36).slice(2, 8);
  const [K1, K2, K3, K4] = [g(), g(), g(), g()];
  const seatsOf = (...ks) => ks.map((k) => ({ key: k, name: k }));
  const envOf = (o = {}) => fakeEnv({ org: ORG, projects: [K1, K2, K4], ...o });   // K3 is archived (not active)
  const member = { id: "pm", name: "M", role: "internal-eng", token_project: null }, owner = { id: "po", name: "O", role: "owner", token_project: null };
  // D3 · projectArg: every shape, never a throw
  const noString = { toString: 1 };
  const shapes = [[undefined, null], [null, null], ["", null], ["   ", null], [" " + K1.toUpperCase() + " ", K1]];
  for (const [v, want] of shapes) { const r = projectArg(v); ok(!r.error && r.project === want, `projectArg(${JSON.stringify(v)}) -> ${want} (none, or a trimmed lower-cased key)`); }
  const BAD = [noString, 7, 0, true, false, [K1], [], {}, Object.create(null), () => K1];
  for (const v of BAD) {
    let r = null, threw = false;
    try { r = projectArg(v, seatsOf(K1, K2)); } catch { threw = true; }
    ok(!threw && r && r.error === "project_forbidden" && !("project" in r) && JSON.stringify(r.seats) === JSON.stringify([K1, K2]) && r.note.startsWith(PROJECT_ARG_NOTE),
      `projectArg(${Array.isArray(v) ? "[" + v.length + "-element array]" : typeof v}) -> project_forbidden with the seats, never a throw, never a key`);
  }
  ok(projectArg(7).error === "project_forbidden" && !("seats" in projectArg(7)), "projectArg with no seats passed: the refusal carries none (the caller adds them)");
  const e = envOf();
  for (const v of [noString, 7, [K1], true]) {
    let r = null, threw = false;
    try { r = await resolveProject(member, v, seatsOf(K1, K2), e); } catch { threw = true; }
    ok(!threw && r.error === "project_forbidden" && !r.env && JSON.stringify(r.seats) === JSON.stringify([K1, K2]), `resolveProject(${Array.isArray(v) ? "[K1]" : typeof v}) -> project_forbidden, no env to read (a seated one-element array is not K1)`);
    const d = await doorProject(member, { project: v }, seatsOf(K1, K2), e);
    ok(d.error === "project_forbidden" && !d.project, `doorProject(${Array.isArray(v) ? "[K1]" : typeof v}) -> project_forbidden, nothing stamped`);
  }
  const U = new URL("https://x/mcp");
  const TOOLS = [{ name: "ask", owner: false, write: true }, { name: "home", owner: false, project: true }];
  const ea = envOf({ seats: [K1, K2] });
  const a1 = await callTool("ask", { question: "q?", project: noString }, member, ea, U, TOOLS);
  ok(a1.error === "project_forbidden" && ea._inserts.length === 0, `ask {project:{toString:1}} -> project_forbidden, nothing recorded -> ${a1.error}`);
  const h1 = await callTool("home", { project: [K1] }, member, ea, U, TOOLS);
  ok(h1.error === "project_forbidden" && ea._inserts.length === 0, "a scoped tool {project:[K1]} -> project_forbidden before the case runs");
  // D4 · a live stamp only
  ok(await liveStampOf({ ...owner, token_project: K4 }, [], e) === K4, "liveStampOf: the owner's stamp on an ACTIVE project (no seat) is live");
  ok(await liveStampOf({ ...owner, token_project: K3 }, [], e) === null, "liveStampOf: the owner's stamp on an ARCHIVED project is none");
  ok(await liveStampOf({ ...member, token_project: K4 }, seatsOf(K1), e) === null && await liveStampOf({ ...member, token_project: K1 }, seatsOf(K1), e) === K1, "liveStampOf: a member's stamp is live only on a seat");
  ok(await liveStampOf({ ...owner, token_project: "*" }, [], e) === null && await liveStampOf({ ...owner, token_project: noString }, [], e) === null, "liveStampOf: the org rollup '*' and a non-string are none");
  const oArch = { ...owner, token_project: K3 };
  const rs = await resolveProject(oArch, null, [], e);
  ok(rs.project === K1 && rs.active === false && rs.env[PROJECT] === K1, `D4: the owner stamped on an archived project reads the default (the first ACTIVE project), never the archive -> ${rs.project}`);
  const dw = await doorProject(oArch, {}, [], e);
  // D1b item 4: in an org of more than one project the seatless owner's unnamed write is refused project_required, naming
  // the ACTIVE projects only (never the archive)
  ok(dw.project !== K3 && (!dw.error || (dw.error === "project_required" && !(dw.projects || []).includes(K3))), `D4: an unnamed write by that owner is never stamped into the archived project -> ${dw.project || dw.error}`);
  const wArch = await whoamiFor(oArch, envOf());
  ok(wArch.activeProject === null, `D4: whoami's activeProject is null for an archived stamp -> ${wArch.activeProject}`);
  const oLive = { ...owner, token_project: K4 };
  const wLive = await whoamiFor(oLive, envOf());
  ok(wLive.activeProject === K4 && (await resolveProject(oLive, null, [], e)).project === K4 && (await doorProject(oLive, {}, [], e)).project === K4, "D4: a LIVE owner stamp answers as before on whoami, the read default and the write stamp (guardrail 4)");
  // D5 · one project per answer call
  const mixed = entriesFrom({ project: K2, answers: [{ qid: "Q1234567", option: 0, project: K1 }] });
  ok(answerProjectOf(mixed).error === "project_forbidden", "answerProjectOf: an entry naming K1 under a call naming K2 is refused");
  ok(answerProjectOf(entriesFrom({ project: K2, answers: [{ qid: "Q1234567", option: 0 }, { qid: "Q1234568", option: 1, project: K2.toUpperCase() }] })).project === K2, "answerProjectOf: one project named (any case) is that project");
  ok(answerProjectOf(entriesFrom({ qid: "Q1234567", option: 0, project: [K2] })).error === "project_forbidden" && answerProjectOf(entriesFrom({ answers: [{ qid: "Q1234567", option: 0, project: 7 }] })).error === "project_forbidden", "answerProjectOf: a non-string project (top-level or per entry) is refused");
  ok(answerProjectOf(entriesFrom({ qid: "Q1234567", option: 0 })).project === null, "answerProjectOf: nothing named is none (the door's own stamp rule)");
  ok(answerProjectOf([{ qid: "Q1234567", option: "0", project: K1 }, { qid: "Q1234568", option: "1", project: K2 }]).error === "project_forbidden", "answerProjectOf: the form face's entries (project only) are held to one project too");
  // the NAMED project's questions validate the qid: K2 holds QK2; the call's default (the org level of this multi-project
  // org) holds no question at all, and K1 holds another
  const QK2 = "Q" + Math.random().toString(16).slice(2, 9).toUpperCase().padEnd(7, "0");
  const row = (qid) => ({ qid, question: "a question?", status: "open", options: [{ what: "option A" }, { what: "option B" }], whoOwes: "owner" });
  const r2 = {};
  const questions = { [K1]: [row("Q0000001")], [K2]: [row(QK2)] };
  const er = fakeEnv({ org: ORG, r2, seats: [K1, K2], projects: [K1, K2, K4], questions });
  const mix = await respondOptions(member, entriesFrom({ project: K2, answers: [{ qid: QK2, option: 0, project: K1 }] }), er);
  ok(mix.error === "project_forbidden" && mix.status >= 400 && er._inserts.length === 0 && !Object.keys(r2).some((k) => /^(?:o\d+\/)?inbox\//.test(k)), `D5: respond {project:K2, answers:[{project:K1}]} -> project_forbidden, nothing filed or banked -> ${mix.error}`);
  const good = await respondOptions(member, entriesFrom({ qid: QK2, option: 1, project: K2 }), er);
  ok(!good.error && good.status === 200 && good.picked && good.picked[0] && good.picked[0].qid === QK2, `D5: respond {project:K2} on a K2-only question is validated against K2's questions, never the default's -> ${good.error || good.status}`);
  const def = await respondOptions(member, entriesFrom({ qid: QK2, option: 1 }), fakeEnv({ org: ORG, r2: { ...r2 }, seats: [K1, K2], projects: [K1, K2, K4], questions }));
  ok(def.error === "unknown_qid", `D5 (both ways): with no project named, the same qid is checked against the call's own scope (the org level, no question) and is unknown there -> ${def.error}`);
  const k1 = await respondOptions(member, entriesFrom({ qid: QK2, option: 1, project: K1 }), fakeEnv({ org: ORG, r2: { ...r2 }, seats: [K1, K2], projects: [K1, K2, K4], questions }));
  ok(k1.error === "unknown_qid", `D5: naming K1, K2's qid is unknown (a qid is one project's) -> ${k1.error}`);
  const outsider = await respondOptions(member, entriesFrom({ qid: QK2, option: 1, project: K4 }), er);
  ok(outsider.error === "project_forbidden" && outsider.status === 403, "D5: an answer naming a project the caller holds no seat on is refused before any question is read");
  const rnd = await fileRound(er, member, { qid: QK2, project: noString });
  ok(rnd.error === "project_forbidden" && rnd.status === 403, "D3: round {project:{toString:1}} -> project_forbidden");
  const rndOut = await fileRound(er, member, { qid: QK2, project: K4 });
  ok(rndOut.error === "project_forbidden", "D5: round naming a project the caller holds no seat on is refused");
  // D7 · the read project rule
  // the heal (the adversarial review's finding 1): "multi-project" is the D1 ACTIVE population (core.js orgProjectsOnce, the
  // seam's own rule) — so the multi-project world is two ACTIVE projects
  const multiRoot = fakeEnv({ org: ORG, projects: [K1, K2] });
  const oneActive = fakeEnv({ org: ORG, projects: [K1] });
  const noProject = fakeEnv({ org: ORG });
  const scoped = (await resolveProject(member, K2, seatsOf(K2), envOf())).env;
  ok(await projectOf(scoped) === K2 && JSON.stringify(projectClause(await projectScopeOf(scoped), "t.project")) === JSON.stringify({ sql: " AND t.project = ?", args: [K2] }), "D7: a scope reads = that project");
  ok(await projectOf(oneActive) === K1 && projectClause(await projectScopeOf(oneActive), "project").sql === " AND project = ?", "D7: a single-project org's unscoped read: the one active project (= ?)");
  // sprint 6 (6.2): the org-level rows are the READER'S org's (the layer writes {org} from the sign-in), never another org's
  ok(await projectOf(multiRoot) === null && projectClause(await projectScopeOf(multiRoot), "t.project").sql === " AND t.project IS NULL AND t.org = {org}", "D7: a multi-project org's null scope: project IS NULL in the reader's org, never org-wide");
  ok(await projectOf(noProject) === null && projectClause(await projectScopeOf(noProject), "project").sql === " AND org = {org}", "D7: an org with no active project: the reader's org's rows, no project filter");
  // D1's ACTIVE population decides, whatever else the org holds
  ok(JSON.stringify(await projectScopeOf(oneActive)) === JSON.stringify({ project: K1, filter: "eq" }) && !(await orgIsMultiProject(oneActive)), "heal: ONE active -> the one active project (= ?), never IS NULL, and the seam's rule agrees (not multi-project)");
  ok(JSON.stringify(await projectScopeOf(multiRoot)) === JSON.stringify({ project: null, filter: "null" }) && await orgIsMultiProject(multiRoot), "heal (mirror): TWO active -> a null scope reads IS NULL, and the seam scopes (multi-project)");
}

if (failed) { console.log(`day1-door selftest FAILED: ${failed}/${checks}`); process.exit(1); }
console.log(`day1-door selftest: ${checks}/${checks}`);
