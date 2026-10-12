// tools/copy-check-selftest.mjs — the copy check's own proof: fixtures of good and bad renderers, each judged by
// tools/copy-check.mjs scanSource, both ways (a bad line is found with its rule; a good line is never found).
//   node tools/copy-check-selftest.mjs   -> exit 0 when every case holds
import { scanSource, literals } from "./copy-check.mjs";

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${what}`); } };
const rulesOf = (src) => scanSource(src, "fixture.js").map((f) => f.rule);

// ---- the scanner: literals, holes, comments and regexes ----
const lit = literals('const a = "x y"; // "not me"\n/* `nor me` */ const r = /"[a-z]"/g; const t = `<p>${a} and ${`inner text`}</p>`;');
ok(lit.some((l) => l.text === "x y"), "a string literal is read");
ok(!lit.some((l) => l.text === "not me" || l.text === "nor me"), "comments are skipped");
ok(!lit.some((l) => l.text === "[a-z]"), "a regex literal is not read as a string");
ok(lit.some((l) => l.kind === "tpl" && l.text === "<p>\u0001 and \u0001</p>"), "a template keeps its holes");
ok(lit.some((l) => l.text === "inner text" && l.nested), "a template inside a hole is read too");
ok(literals("const a = 1;\nconst b = `x\ny`;\nconst c = 'z';").find((l) => l.text === "z").line === 4, "line numbers count the newlines inside a template");

// ---- BAD renderers: each is found, with its rule ----
const bad = [
  ["call", 'return `<div class="state">${callLine(`preview {items: [{contribution: {lane, kind: "counter"}}]}, then file`)}</div>`;'],
  ["call", 'const EMPTY = "No aim yet. Your Claude files one through the MCP: preview then file, an item of kind \\"aim\\".";'],
  ["call", 'return `<p>The owner makes v1 with publish_version.</p>`;'],
  ["call", 'return `<code>publish_version</code>`;'],
  ["chatty", 'return `<p class="lede">To counter it, your own Claude files this.</p>`;'],
  ["chatty", 'return `<p>Work shows here once it is filed.</p>`;'],
  ["chatty", 'return `<h2>How it works</h2><p>Copy the call below.</p>`;'],
  ["sentence", 'return `<p class="lede">Everything this project knows that you may read: its docs and cards by kind, and one search.</p>`;'],
  ["sentence", 'return `<p>Picking it up takes the next action, never the work.</p>`;'],
  ["sentence", 'const NOTE = "Built into sharingu: the same shelf for every org, versioned with the engine.";'],
  ["dot", 'return `<p class="state-quiet">No goal moved this month.</p>`;'],
  ["zero", 'return `<span>${n} counter${n === 1 ? "" : "s"}</span>`;'],
  ["zero", 'return `<small>${a} decide · ${b} approve · ${c} grant</small>`;'],
  ["sentence", 'return `<input placeholder="Search goals, questions, checks, cards, docs, the Map and contributions">`;'],
];
for (const [rule, src] of bad) ok(rulesOf(src).includes(rule), `bad (${rule}) is found: ${src.slice(0, 70)}`);

// ---- GOOD renderers: nothing is found ----
const good = [
  'return `<h1>Goals</h1><span class="p-label">Needs you</span>`;',                          // titles and labels
  'return `<p class="p-empty">No goals yet</p>`;',                                              // a short phrase, no full stop
  'return `<button title="Copy the exact call your Claude files to fill it">Copy</button>`;',  // a title may explain
  'return `<a aria-label="Rotate your key: every tool holding the old key stops working now">Rotate</a>`;',
  'return `<span title="${esc(`How filled the checklist is, not progress: ${d} of ${t} items complete.`)}">${d}/${t}</span>`;',
  'return `<p>${esc(row.why)}</p>`;',                                                           // a person's own words come from data
  'const q = "SELECT name, title FROM people WHERE role = \'owner\' AND active = 1 ORDER BY created_at LIMIT 1";', // SQL
  'const css = `.p-card{min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:12px}`;', // CSS
  'return `<style>.x{color:red;margin:0}</style><svg><text>a label inside a drawing that is long and full of words</text></svg>`;',
  'const STATE = { error: "This did not load because the ledger could not be read, so try again in a moment." };', // an error says what failed
  'throw new Error("the project is required and this sentence is long enough to be a sentence");',
  'console.log("copy-check: every one of these words is a log line and never a screen");',
  'return `<div class="u-row" data-region="needs-you" data-button="rule">${title}</div>`;',     // hooks
  'const cls = "u-btn small ghost";',                                                            // a class list
  'return `<a href="/build?kind=pr&amp;sort=newest">pr</a>`;',
  'const re = /it reads as a sentence: but it is a regex, never a screen. Really./;',
  'return `<form method="POST" onsubmit="return confirm(\'Remove Nia? This archives them: their history stays, but they can no longer sign in.\')">`;',
  // sprint 3 L2: a refusal's own note (with `error:` on its line or the line above) and a string marked off-screen
  'if (bad) return { status: 422, error: "option_required", note: "Send qid and option (the option index in the question) and nothing else at all." };',
  'if (n > 1) return { error: "project_forbidden",\n    note: `One answer call answers in ONE project: this one names two of them, send one call per project.` };',
  '// copy: off-screen (the tools\' JSON note)\nexport const NOTE = "No check names this goal yet: file one through preview then file, an item of kind check.";',
];
for (const src of good) { const r = rulesOf(src); ok(!r.length, `good is clean: ${src.slice(0, 70)}${r.length ? ` (found ${r.join(",")})` : ""}`); }

// both ways: the marker covers its own line and the next one only, and a note with no refusal beside it is still judged
ok(rulesOf('// copy: off-screen\nconst A = "x";\nconst B = "Nothing is filed here yet, so the list shows here once a contribution lands.";').length === 1, "the off-screen marker does not reach two lines down");
ok(rulesOf('const r = { status: 200,\n  note: "Nothing is in your round yet: add a question to the round, or answer one." };').length === 1, "a note with no error beside it is still judged");

// ---- sprint 3 L3: where a string is emitted decides (both ways) ----
const L3good = [
  // a marked block: the whole object, to its close
  '// copy: off-screen (each line rides a chip\'s title)\nexport const WHY = {\n  a: ["A", "it disputes the contribution named as its parent, and stands until the owner rules it."],\n  b: ["B", "a critique is ruling territory the moment it is filed, so the owner rules it."],\n};',
  // a refusal marked as one, and a confirm dialog's words passed to a form helper
  '// copy: error (a disabled control\'s reason)\nexport const REASON = "A read-only credential reads Control and changes nothing. Sign in with your full key.";',
  'const f = form("remove", fields, body, can ? `Remove ${n}? This archives them: their history stays, but they can no longer sign in.` : "");   // copy: confirm',
  // a state helper's own body, and an argument of one
  'export function behindState(o) {\n  const why = "Acting still works: what you do here is recorded against the current version. Reload to read it.";\n  return `<div>${why}</div>`;\n}',
  'const b = unreachableState({ what: "Control could not be read from the database, so nothing is listed until it answers." });',
  // a literal nested in a title that is open on its line
  'return `<section title="One secret: your key is your passphrase. ${admin ? "Reset someone else\'s from the menu on their row." : "Only an admin resets it."}">`;',
  // a guarded count, and a three-word label
  'const sub = [wait ? `${wait} waiting` : "", aw ? `${aw} awaiting` : ""].join(" · ");',
  'return card({ label: "Connect your AI" });',
];
for (const src of L3good) { const r = rulesOf(src); ok(!r.length, `L3 good is clean: ${src.slice(0, 70).replace(/\n/g, " ")}${r.length ? ` (found ${r.join(",")})` : ""}`); }
const L3bad = [
  // the block ends at its close: a sentence after it is judged again
  ["chatty", '// copy: off-screen\nexport const WHY = {\n  a: "it disputes the contribution named as its parent, and stands until ruled.",\n};\nconst NEXT = "Nothing is filed here yet, so the list shows here once a contribution lands on it.";'],
  // a title that CLOSED before the hole explains nothing: the nested literal is on the screen
  ["sentence", 'return `<span title="x">${admin ? "Reset someone else\'s passphrase from the menu on their own row in Members." : ""}</span>`;'],
  // an unguarded count is still a zero, and a chatty sentence is still chatty
  ["zero", 'return `<small>${n} waiting · ${m} awaiting</small>`;'],
  ["chatty", 'return `<p>Connect your AI and it files here.</p>`;'],
];
for (const [rule, src] of L3bad) ok(rulesOf(src).includes(rule), `L3 bad (${rule}) is still found: ${src.slice(0, 70).replace(/\n/g, " ")}`);

// ---- a finding carries its place: file, line, region ----
const f = scanSource('const x = 1;\nfunction r() {\n  return `<section data-region="follow-ups">\n    <p>Nothing is due, so the follow-ups list shows here once one is filed.</p>\n  </section>`;\n}', "home.js");
ok(f.length === 1 && f[0].line === 4 && f[0].region === "follow-ups" && f[0].file === "home.js", `a finding names file, line and region (${JSON.stringify(f[0] || {})})`);
ok(f[0] && f[0].fix && f[0].fix.length > 4, "a finding carries its replacement");

console.log(`copy-check selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
