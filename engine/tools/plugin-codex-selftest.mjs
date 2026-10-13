// tools/plugin-codex-selftest.mjs — the Codex manifest and the OpenAI submission ZIP (sprint 11, 11.4):
// tools/make-plugin-skills.mjs generates plugin/.codex-plugin/plugin.json and plugin/assets/ with the skills, and --openai-zip
// packs what OpenAI's plugin submission takes. Temp dirs only for every write; the real tree is only read.
//   X1 · listing/test-cases.md parses to 5 positive and 3 negative cases; every tools_triggered name is a tool of
//        contracts/door.json's inventory, each positive case names at least one; a backticked word that is no tool is left out;
//        every numbered step kept in order (P1, P3 and P4 pinned whole); the negatives are asks of the AI, each with its Why
//        and the refusal or fallback to expect
//   X2 · the real manifest: no problem; each limit with its count; the four URLs https; the identity is the Claude manifest's;
//        the long description and the URLs are SUBMISSION.md's; no forbidden key; no demo URL until the owner adds one
//   X3 · every limit the guide sets is red one past it (a mutated copy of the real manifest per limit)
//   X4 · --check's drift on a temp copy of the plugin: green as made; a hand-edited manifest, a missing logo, a stray in assets/,
//        a moved source (the listing) are each red, the moved source also as "content moved … version did not"
//   X5 · writePlugin on a temp copy: a moved source raises the version and writes the manifest at it; a source past a limit
//        throws and writes nothing
//   X6 · the ZIP: its file list exactly (the Codex manifest, .mcp.json, LICENSE, README.md, the two PNGs, the skills; never
//        .claude-plugin/ or .DS_Store); refused, nothing written: a red --check, a .git, an env file, a forbidden key, a
//        secret-shaped string, a non-text non-PNG file, no .zip name
//   X7 · the command line: --check 0 on this tree; --openai-zip into a temp dir 0 with 25 files (six plus the 19 skills)
//   X8 · the annotations' reasons (16.2): SUBMISSION.md's row and block are what contracts/door.json makes, one reason per hint
//        per tool by rule (the two graders destructive); a hand edit, a moved hint or a lost marker is red; writePlugin rewrites
//        them; the release notes are SUBMISSION.md's and reach publication.release_notes; the ZIP's .mcp.json alone declares
//        OAuth with dynamic client registration (plugin/.mcp.json as it was), and a bad auth declaration is red
// node tools/plugin-codex-selftest.mjs [<the generator's path>] — exit 1 on any failure (the path: a mutant's, for the red run).
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOL = resolve(process.argv[2] || join(ENGINE, "tools", "make-plugin-skills.mjs"));
const T = await import(pathToFileURL(TOOL).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const tmp = mkdtempSync(join(tmpdir(), "plugin-codex-selftest-"));
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const snapshot = (dir) => {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(`${relative(dir, f)} ${createHash("sha256").update(readFileSync(f)).digest("hex")}`); } };
  walk(dir); return out.join("\n");
};

const tools = T.doorTools();
const real = T.codexOf();
const m = real.manifest, i = m.interface, review = m.extensions["com.openai"].review;
const assets = new Map([...real.files].filter(([p]) => p.startsWith("assets/")));
const mcp = json(T.CODEX_SOURCES.mcp);
const problemsOf = (mut) => T.codexProblems(mut, { tools, assets, mcp });

console.log("X1 · the test cases parse");
const pos = review.test_cases.positive, neg = review.test_cases.negative;
ok(pos.length === 5 && neg.length === 3, `5 positive, 3 negative (${pos.length}, ${neg.length})`);
const named = pos.map((c) => c.tools_triggered.split(", "));
ok(named.every((n) => n.length && n.every((t) => tools.has(t))), `every tools_triggered a door tool: ${named.map((n) => n.join("+")).join(" · ")}`);
ok(named[2].join() === "preview,file_contribution,read" && named[3].join() === "preview,save_knowledge,read" && named[0].join() === "whoami",
  `P1 whoami, P3 preview+file_contribution+read, P4 preview+save_knowledge+read (sprint 19: the confirm rides the write tool), in the order named`);
ok(pos.every((c) => c.description && c.prompt && c.expected_behavior) && neg.every((c) => c.description && c.prompt && c.expected_behavior && Object.keys(c).sort().join() === "description,expected_behavior,prompt"),
  "each positive case carries its four fields, each negative its three (the guide's two and the refusal to expect) and no more");
ok(pos.every((c) => !/`|\*\*/.test(JSON.stringify(c))) && neg.every((c) => !/`|\*\*/.test(JSON.stringify(c))), "no markdown backtick or bold leaks into a case");
// the sprint-11 review: every numbered step kept, in order — P4's "Decline." and "Ask again and accept." had vanished, so its
// expectation read "declined … nothing filed … the goal is filed" with no turn between. P1, P3 and P4 pinned whole.
const PIN = {
  P1: { description: "Connect and sign in (as the admin account)", prompt: "1) Add the MCP address to your client and sign in as the admin. 2) Call sharingu's whoami.",
    tools_triggered: "whoami", expected_behavior: "2) Your name (Reviewer Admin), the role owner, the org \"sharingu review\", and the two projects your writes can land in, sharingu and the Sample project." },
  P3: { description: "File a contribution through preview, then file_contribution (as the member account)",
    prompt: "1) In the Sample project, file a note in the leader lane: what 'A reviewer's first note', why 'the store's test case'. Preview it first. 2) File it. 3) Read that contribution. 4) In the browser, open Build.",
    tools_triggered: "preview, file_contribution, read",
    expected_behavior: "1) The preview (the preview tool) shows the one item, \"files at once\", names the tool that files it, and says nothing is filed yet. 2) The receipt (the file_contribution tool) with the contribution's id, T- and the date and a number, and its link. 3) What you filed, by Reviewer Member, in the Sample project. 4) The note is in the list." },
  // P4 holds in a client with a confirm prompt (Claude) and in one without (16.2: OpenAI's docs do not say ChatGPT asks); sprint 19:
  // the preview files nothing, the confirm rides save_knowledge
  P4: { description: "The confirm: nothing is filed until you say yes (as the admin account)",
    prompt: "1) In the Sample project, add a goal 'A reviewer goal' under the goal 'Every contribution closes the loop', and file it only after I confirm. 2) Decline (or, where you were not asked, do not file). 3) Read the goal 'A reviewer goal'. 4) Ask again and accept (or, where you were not asked, say \"File it.\": save_knowledge again, without the confirm).",
    tools_triggered: "preview, save_knowledge, read",
    expected_behavior: "1) The preview shows the goal and files nothing; then either your client asks you to confirm, showing what would be filed, or (a client that shows no confirm prompt) sharingu answers that you were not asked and files nothing. 2) \"The person declined: nothing was filed.\" where you were asked; nothing filed either way. 3) There is no such goal (not_found). 4) The goal is filed; it reads back under its parent, and the Goals tab shows it." },
};
for (const [id, want] of Object.entries(PIN)) { const got = pos[Number(id[1]) - 1]; ok(JSON.stringify(got) === JSON.stringify(want), `${id} generated exactly: ${JSON.stringify(got)}`); }
// OpenAI's negatives are prompts to the AI where the plugin should not act (not a sign-in); each says why, then the refusal or fallback
ok(neg[0].prompt === "Delete the Sample project and everything in it." && /no sharingu tool deletes a project/.test(neg[0].expected_behavior)
  && /remove_knowledge removes a project's knowledge items .*never the project itself/.test(neg[0].description) && /unknown_kind/.test(neg[0].expected_behavior)
  && neg[1].prompt === "Show the sharingu project's goals." && /project_forbidden/.test(neg[1].expected_behavior)
  && neg[2].prompt === "Create a project called Mine." && /owner_only/.test(neg[2].expected_behavior), `N1–N3 are asks of the AI with their refusal or fallback: ${neg.map((c) => c.prompt).join(" · ")}`);
ok(neg.every((c) => / Why: \S/.test(c.description)) && !neg.some((c) => /sign in|bearer|code/i.test(c.prompt)), "each negative's description says why; no negative is a sign-in");
const fx = T.parseTestCases([
  "## Positive cases", "", "### P1 · A fixture — account: admin", "", "1. Ask: \"Call `whoami` as the `owner`\" (the `whoami` tool, then `not_a_tool`)",
  "2. Expect: the role `owner`.", "3. Decline. Expect: nothing", "   filed", "4. Sign in and ask: \"Show the goals.\"", "", "Also: `goals` is named only here.", "",
  "## Negative cases", "", "### N1 · No ask — account: none", "", "Why: it is not", "the AI's.", "", "1. Send a bad token", "   on two lines. Expect: refused.", "",
].join("\n"), tools);
const fxWant = { positive: [{ description: "A fixture (as the admin account)", prompt: "1) Call whoami as the owner. 3) Decline. 4) Sign in and ask: \"Show the goals.\"", tools_triggered: "whoami",
  expected_behavior: "1) The role owner. 3) Nothing filed." }], negative: [{ description: "No ask (no account signed in). Why: It is not the AI's.", prompt: "Send a bad token on two lines.", expected_behavior: "Refused." }] };
ok(JSON.stringify(fx) === JSON.stringify(fxWant),
  `a fixture: every step kept in order (a bare "Decline." and an instruction around an ask whole), an Expect-only step on the turn before, a backticked word that is no tool left out, a note's tool not counted, a negative's Why (${JSON.stringify(fx)})`);

console.log("X2 · the real manifest");
ok(real.problems.length === 0, `no problem (${real.problems.join("; ") || "none"})`);
const claude = json(T.MANIFEST);
ok(m.homepage === "https://www.sharingu.xyz" && m.homepage === i.websiteURL, `the homepage is the website's one address (${m.homepage})`);
ok(["name", "version", "description", "author", "homepage", "license", "keywords"].every((k) => JSON.stringify(m[k]) === JSON.stringify(claude[k])),
  `the identity is the Claude manifest's (${m.name} ${m.version}, ${m.license})`);
const sub = T.parseSubmission(readFileSync(T.CODEX_SOURCES.submission, "utf8"));
ok(i.longDescription === sub.longDescription && sub.longDescription.startsWith("sharingu is one company brain") && i.developerName === "Ryuk Labs",
  "the long description and the developer are SUBMISSION.md's");
const urls = ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"];
ok(urls.every((u) => /^https:\/\/www\.sharingu\.xyz(\/[a-z]+\.html)?$/.test(i[u])), `the four URLs, https: ${urls.map((u) => i[u]).join(" · ")}`);
const limits = [["name", m.name.length, 64], ["description", m.description.length, 4000], ["author.name", m.author.name.length, 120],
  ["displayName", i.displayName.length, 30], ["shortDescription", i.shortDescription.length, 30], ["longDescription", i.longDescription.length, 4000],
  ["developerName", i.developerName.length, 80], ["capabilities", i.capabilities.length, 20], ["the longest capability", Math.max(...i.capabilities.map((c) => c.length)), 120],
  ["defaultPrompt", i.defaultPrompt.length, 3], ["the longest defaultPrompt", Math.max(...i.defaultPrompt.map((c) => c.length)), 128]];
for (const [f, n, max] of limits) ok(n > 0 && n <= max, `${f}: ${n} ≤ ${max}`);
ok(T.contrast(i.brandColor, "#FFFFFF") >= 2 && T.contrast(i.brandColorDark, "#212121") >= 2,
  `brandColor ${i.brandColor} ${T.contrast(i.brandColor, "#FFFFFF").toFixed(2)}:1 on white, brandColorDark ${i.brandColorDark} ${T.contrast(i.brandColorDark, "#212121").toFixed(2)}:1 on #212121`);
const sizes = [...assets].map(([p, b]) => `${p} ${T.pngSize(b).w}x${T.pngSize(b).h} ${b.length} B`);
ok([...assets.values()].every((b) => T.pngSize(b) && T.pngSize(b).w === T.pngSize(b).h && b.length < T.MAX_ASSET_BYTES), `the images square PNGs under 256 KiB: ${sizes.join(" · ")}`);
const text = real.text;
ok(!/test_credentials|reviewer_instructions|clientSecret|"headers"|"hooks"|"apps"/.test(text), "no forbidden key in the manifest");
// the walkthrough is the docs page's own section (the owner's ruling, 2026-10-13): one fixed URL, its videos added there
const demoWant = JSON.parse(readFileSync(T.CODEX_SOURCES.listing, "utf8")).demoRecordingURL;
ok(review.demo_recording_url === demoWant && /^https:\/\/www\.sharingu\.xyz\/docs\.html#walkthrough$/.test(review.demo_recording_url || ""),
  `demo_recording_url ${review.demo_recording_url}: codex-listing.json's demoRecordingURL, the docs page's #walkthrough`);
ok(m.skills === "./skills/" && m.mcpServers === "./.mcp.json" && i.logo === "./assets/logo.png" && i.composerIcon === "./assets/composer-icon.png", "the paths start ./ and name files the plugin holds");

console.log("X3 · each limit, one past it, is red");
const mutants = [
  ["name with a capital", (x) => { x.name = "Sharingu"; }, /^name:/],
  ["name with a double hyphen", (x) => { x.name = "share--ingu"; }, /^name:/],
  ["version not semver", (x) => { x.version = "0.1"; }, /^version:/],
  ["description 4001", (x) => { x.description = "d".repeat(4001); }, /^description: 4001/],
  ["author.name 121", (x) => { x.author.name = "a".repeat(121); }, /^author\.name: 121/],
  ["homepage http", (x) => { x.homepage = "http://sharingu.xyz"; }, /^homepage: not an https/],
  ["displayName 31", (x) => { x.interface.displayName = "s".repeat(31); }, /displayName: 31/],
  ["shortDescription 31", (x) => { x.interface.shortDescription = "s".repeat(31); }, /shortDescription: 31/],
  ["longDescription 4001", (x) => { x.interface.longDescription = "l".repeat(4001); }, /longDescription: 4001/],
  ["developerName 81", (x) => { x.interface.developerName = "r".repeat(81); }, /developerName: 81/],
  ["no category", (x) => { delete x.interface.category; }, /category: missing/],
  ["21 capabilities", (x) => { x.interface.capabilities = Array.from({ length: 21 }, (_, n) => `c${n}`); }, /capabilities: not a list/],
  ["a capability 121", (x) => { x.interface.capabilities[0] = "c".repeat(121); }, /capabilities\[0\]: 121/],
  ["4 default prompts", (x) => { x.interface.defaultPrompt = ["a", "b", "c", "d"]; }, /defaultPrompt: not at most 3/],
  ["a default prompt 129", (x) => { x.interface.defaultPrompt[0] = "p".repeat(129); }, /defaultPrompt\[0\]: 129/],
  ["a default prompt twice", (x) => { x.interface.defaultPrompt[1] = x.interface.defaultPrompt[0]; }, /defaultPrompt: not at most 3 unique/],
  ["an @mention", (x) => { x.interface.defaultPrompt[0] = "Ask @sharingu for my goals"; }, /an @mention/],
  ...urls.map((u) => [`${u} http`, (x) => { x.interface[u] = x.interface[u].replace("https:", "http:"); }, new RegExp(`${u}: not an https`)]),
  ["a URL with credentials", (x) => { x.interface.supportURL = "https://user:pw@www.sharingu.xyz/support.html"; }, /supportURL: not an https URL without credentials/],
  ["no privacy URL", (x) => { delete x.interface.privacyPolicyURL; }, /privacyPolicyURL: missing/],
  ["brandColor low on white", (x) => { x.interface.brandColor = "#FFD27F"; }, /brandColor: contrast/],
  ["brandColorDark low on #212121", (x) => { x.interface.brandColorDark = "#3A3A3A"; }, /brandColorDark: contrast/],
  ["brandColor not #RRGGBB", (x) => { x.interface.brandColor = "orange"; }, /brandColor: not #RRGGBB/],
  ["logo not ./", (x) => { x.interface.logo = "assets/logo.png"; }, /logo: not a \.\/ path/],
  ["logo not in the plugin", (x) => { x.interface.logo = "./assets/nope.png"; }, /logo: \.\/assets\/nope\.png is not in the plugin/],
  ["no composerIcon", (x) => { delete x.interface.composerIcon; }, /composerIcon: not a \.\/ path/],
  ["4 positive cases", (x) => { x.extensions["com.openai"].review.test_cases.positive.pop(); }, /positive: 4 cases, not 5/],
  ["2 negative cases", (x) => { x.extensions["com.openai"].review.test_cases.negative.pop(); }, /negative: 2 cases, not 3/],
  ["a tool the door lacks", (x) => { x.extensions["com.openai"].review.test_cases.positive[0].tools_triggered = "whoami, not_a_tool"; }, /not_a_tool is no tool of the door/],
  ["no expected_behavior", (x) => { delete x.extensions["com.openai"].review.test_cases.positive[1].expected_behavior; }, /positive\[1\]\.expected_behavior: missing/],
  ["a negative with no prompt", (x) => { x.extensions["com.openai"].review.test_cases.negative[0].prompt = " "; }, /negative\[0\]\.prompt: missing/],
  ["a negative with no refusal to expect", (x) => { delete x.extensions["com.openai"].review.test_cases.negative[1].expected_behavior; }, /negative\[1\]\.expected_behavior: missing/],
  ["a negative with no Why", (x) => { x.extensions["com.openai"].review.test_cases.negative[2].description = "A member cannot call an owner's tool"; }, /negative\[2\]\.description: no Why/],
  ["test_credentials", (x) => { x.extensions["com.openai"].review.test_credentials = { email: "a@b.c" }; }, /test_credentials: a key the submission rejects/],
  ["reviewer_instructions", (x) => { x.extensions["com.openai"].review.reviewer_instructions = "sign in"; }, /reviewer_instructions: a key the submission rejects/],
  ["hooks", (x) => { x.hooks = {}; }, /hooks: a key the submission rejects/],
  ["a demo URL over http", (x) => { x.extensions["com.openai"].review.demo_recording_url = "http://example.invalid/demo"; }, /demo_recording_url: not an https/],
  ["mcpServers elsewhere", (x) => { x.mcpServers = "./other.json"; }, /mcpServers: not \.\/\.mcp\.json/],
];
for (const [label, mutate, want] of mutants) { const x = clone(m); mutate(x); const p = problemsOf(x); ok(p.some((s) => want.test(s)), `${label}: ${p.join("; ") || "NO PROBLEM"}`); }
const mcpRed = [
  ["two MCP servers", { mcpServers: { a: { type: "http", url: "https://a.invalid/mcp" }, b: { type: "http", url: "https://b.invalid/mcp" } } }, /2 servers, not exactly one/],
  ["nonempty headers", { mcpServers: { s: { type: "http", url: "https://a.invalid/mcp", headers: { Authorization: "x" } } } }, /nonempty server headers/],
  ["a clientSecret", { mcpServers: { s: { type: "http", url: "https://a.invalid/mcp", oauth: { clientSecret: "x" } } } }, /clientSecret: a key the submission rejects/],
  ["an http server", { mcpServers: { s: { type: "http", url: "http://a.invalid/mcp" } } }, /url is not https/],
  ["type none", { mcpServers: { s: { type: "none", url: "https://a.invalid/mcp" } } }, /is type none/],
];
const authed = (auth) => ({ mcpServers: { s: { type: "http", url: "https://a.invalid/mcp", extensions: { "com.openai": { auth } } } } });
mcpRed.push(["a dcr client with a clientId", authed({ type: "oauth", client: { mode: "dcr", clientId: "x" } }), /dcr client holds clientId/],
  ["auth type none", authed({ type: "none" }), /auth is type none/], ["an unknown client mode", authed({ type: "oauth", client: { mode: "magic" } }), /client\.mode is not/],
  ["an unknown auth type", authed({ type: "cookie" }), /auth\.type is not/]);
ok(T.codexProblems(m, { tools, assets, mcp: T.zipMcpOf(mcp) }).length === 0, "the ZIP's own auth declaration is no problem");
for (const [label, mj, want] of mcpRed) { const p = T.codexProblems(m, { tools, assets, mcp: mj }); ok(p.some((s) => want.test(s)), `.mcp.json ${label}: ${p.join("; ")}`); }
ok(T.codexProblems(m, { tools, assets, mcp: { mcpServers: { s: { type: "http", url: "https://a.invalid/mcp", headers: {} } } } }).length === 0, "an EMPTY headers object is no problem (the guide rejects only a nonempty one)");
const tiny = Buffer.from(assets.get("assets/logo.png")); tiny.writeUInt32BE(40, 16); tiny.writeUInt32BE(40, 20);
const wide = Buffer.from(assets.get("assets/logo.png")); wide.writeUInt32BE(600, 16);
for (const [label, b, want] of [["a 40 px logo", tiny, /40x40, not square/], ["a non-square logo", wide, /600x512, not square/], ["a logo that is no PNG", Buffer.from("GIF89a........................"), /is not a PNG/],
  ["a logo over 256 KiB", Buffer.concat([assets.get("assets/logo.png"), Buffer.alloc(T.MAX_ASSET_BYTES)]), /bytes, over the Claude directory's/]]) {
  const p = T.codexProblems(m, { tools, assets: new Map([...assets, ["assets/logo.png", b]]), mcp });
  ok(p.some((s) => want.test(s)), `${label}: ${p.join("; ")}`);
}

// a temp copy of the plugin, its lock and its sources (the seams: checkSkills' and writePlugin's paths)
function world(name) {
  const d = join(tmp, name), pluginDir = join(d, "plugin");
  cpSync(T.PLUGIN_DIR, pluginDir, { recursive: true });
  const lock = join(d, "plugin-version.json"); cpSync(T.VERSION_LOCK, lock);
  const listing = join(d, "codex-listing.json"); cpSync(T.CODEX_SOURCES.listing, listing);
  const submission = join(d, "SUBMISSION.md"); cpSync(T.CODEX_SOURCES.submission, submission);
  const door = join(d, "door.json"); cpSync(T.CODEX_SOURCES.door, door);
  const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
  const sources = { listing, submission, door, mcp: join(pluginDir, ".mcp.json") };
  const check = () => T.checkSkills({ dir: join(pluginDir, "skills"), pluginDir, manifest, lock, submission, door, codex: T.codexOf({ ...sources, manifest, version: T.manifestVersion(manifest) }) });
  return { d, pluginDir, lock, listing, submission, door, manifest, sources, check };
}
const said = (r) => r.drift.join(" | ");

console.log("X4 · --check's drift");
let w = world("drift");
let r = w.check();
ok(r.ok, `a copy as made: green (${said(r) || "no drift"})`);
const cxPath = join(w.pluginDir, ".codex-plugin", "plugin.json"), cxText = readFileSync(cxPath, "utf8");
writeFileSync(cxPath, cxText.replace('"displayName": "sharingu"', '"displayName": "Sharingu by hand"'));
r = w.check(); ok(!r.ok && /\.codex-plugin\/plugin\.json: differs from what its sources make/.test(said(r)), `a hand-edited manifest: red (${said(r)})`);
writeFileSync(cxPath, cxText);
rmSync(join(w.pluginDir, "assets", "logo.png"));
r = w.check(); ok(!r.ok && /assets\/logo\.png: missing/.test(said(r)), `a missing logo: red (${said(r)})`);
cpSync(join(T.PLUGIN_DIR, "assets", "logo.png"), join(w.pluginDir, "assets", "logo.png"));
writeFileSync(join(w.pluginDir, "assets", "old.png"), assets.get("assets/logo.png"));
r = w.check(); ok(!r.ok && /assets\/old\.png: no source makes it/.test(said(r)), `a stray in assets/: red (${said(r)})`);
rmSync(join(w.pluginDir, "assets", "old.png"));
ok(w.check().ok, "restored: green again");
const L = json(w.listing); L.shortDescription = "Your team's one company brain"; writeFileSync(w.listing, JSON.stringify(L, null, 2) + "\n");
r = w.check();
ok(!r.ok && /\.codex-plugin\/plugin\.json: differs/.test(said(r)) && /content moved .* and its version did not/.test(said(r)), `a moved listing source: the manifest differs AND the version must move (${said(r)})`);

console.log("X5 · writePlugin");
const wr = T.writePlugin({ skillsDir: join(w.pluginDir, "skills"), pluginDir: w.pluginDir, manifest: w.manifest, lock: w.lock, sources: w.sources });
const was = json(T.VERSION_LOCK).version;
ok(wr.moved && wr.version === T.nextVersion(was) && json(cxPath).version === wr.version && json(w.manifest).version === wr.version && json(w.lock).version === wr.version
  && json(cxPath).interface.shortDescription === "Your team's one company brain", `the moved source raised ${was} → ${wr.version}; both manifests and the lock at it, the new text written`);
r = w.check(); ok(r.ok, `then --check green (${said(r) || "no drift"})`);
const again = T.writePlugin({ skillsDir: join(w.pluginDir, "skills"), pluginDir: w.pluginDir, manifest: w.manifest, lock: w.lock, sources: w.sources });
ok(!again.moved && again.version === wr.version, `a second write keeps ${again.version}`);
L.shortDescription = "s".repeat(31); writeFileSync(w.listing, JSON.stringify(L, null, 2) + "\n");
const before = snapshot(w.d);
let threw = null; try { T.writePlugin({ skillsDir: join(w.pluginDir, "skills"), pluginDir: w.pluginDir, manifest: w.manifest, lock: w.lock, sources: w.sources }); } catch (e) { threw = e.message; }
ok(threw && /shortDescription: 31 characters, over 30/.test(threw) && snapshot(w.d) === before, `a source past a limit throws, nothing written (${(threw || "no throw").split("\n").join(" ")})`);

console.log("X6 · the ZIP");
const GREEN = () => ({ ok: true, drift: [], version: "9.9.9" });
const unzipList = (f) => execFileSync("unzip", ["-Z1", f], { encoding: "utf8" }).split("\n").filter(Boolean).sort();
const out = join(tmp, "z", "sharingu-openai.zip");
w = world("zip");
writeFileSync(join(w.pluginDir, ".DS_Store"), "finder\n");
let z = T.openaiZip(out, { check: GREEN, pluginDir: w.pluginDir });
const want = [".codex-plugin/plugin.json", ".mcp.json", "LICENSE", "README.md", "assets/composer-icon.png", "assets/logo.png",
  ...readdirSync(join(T.PLUGIN_DIR, "skills")).map((s) => `skills/${s}/SKILL.md`)].sort();
ok(z.code === 0 && unzipList(out).join() === want.join(), `the ZIP holds exactly ${want.length} files (${z.lines.slice(-1)[0]})`);
ok(!unzipList(out).some((p) => p.startsWith(".claude-plugin/") || /\.DS_Store/.test(p)), "never Claude's .claude-plugin/ nor a .DS_Store");
ok(Buffer.compare(execFileSync("unzip", ["-p", out, "assets/logo.png"]), assets.get("assets/logo.png")) === 0
  && execFileSync("unzip", ["-p", out, ".codex-plugin/plugin.json"], { encoding: "utf8" }) === readFileSync(join(w.pluginDir, ".codex-plugin", "plugin.json"), "utf8"), "the logo and the manifest byte for byte");
const zipMcp = JSON.parse(execFileSync("unzip", ["-p", out, ".mcp.json"], { encoding: "utf8" })), plainMcp = json(join(w.pluginDir, ".mcp.json"));
const zs = Object.values(zipMcp.mcpServers);
ok(zs.length === 1 && JSON.stringify(zs[0].extensions["com.openai"].auth) === JSON.stringify({ type: "oauth", client: { mode: "dcr" } }) && zs[0].url === Object.values(plainMcp.mcpServers)[0].url,
  `the ZIP's .mcp.json declares OAuth with dynamic client registration on the one server (${JSON.stringify(zs[0].extensions)})`);
ok(!JSON.stringify(plainMcp).includes("com.openai") && readFileSync(join(w.pluginDir, ".mcp.json"), "utf8") === readFileSync(T.CODEX_SOURCES.mcp, "utf8"), "plugin/.mcp.json (Claude's) carries no OpenAI auth and is unchanged by the ZIP");
const refusedZip = (label, setup, o = {}, re = /refused, nothing written/) => {
  const wz = world(`zip-${label.replace(/\W+/g, "-")}`); const undo = setup(wz.pluginDir) || (() => {});
  const f = join(tmp, `out-${label.replace(/\W+/g, "-")}.zip`);
  const x = T.openaiZip(f, { check: GREEN, pluginDir: wz.pluginDir, ...o });
  ok(x.code === 2 && re.test(x.lines.join(" ")) && !existsSync(f), `${label}: refused, nothing written (${x.lines.slice(-1)[0]})`);
  undo();
};
refusedZip("a red --check", () => {}, { check: () => ({ ok: false, drift: [".codex-plugin/plugin.json: missing"] }) }, /plugin\/ is stale/);
refusedZip("a .git folder", (d) => { mkdirSync(join(d, ".git")); writeFileSync(join(d, ".git", "HEAD"), "ref: x\n"); }, {}, /\.git\/HEAD is a file the ZIP never carries/);
refusedZip("an env file", (d) => writeFileSync(join(d, "reviewer.env"), "A=b\n"), {}, /reviewer\.env is a file the ZIP never carries/);
refusedZip("a credentials file", (d) => writeFileSync(join(d, "credentials.txt"), "x\n"), {}, /credentials\.txt is a file the ZIP never carries/);
refusedZip("a test_credentials key", (d) => writeFileSync(join(d, "README.md"), '{ "test_credentials": {} }\n'), {}, /forbidden key or a secret-shaped string/);
refusedZip("a reviewer_instructions key", (d) => writeFileSync(join(d, ".mcp.json"), '{ "reviewer_instructions": "x" }\n'), {}, /forbidden key/);
refusedZip("a key-shaped string", (d) => writeFileSync(join(d, "skills", "frontend", "SKILL.md"), `token ${"a1B2".repeat(12)}\n`), {}, /secret-shaped string/);
refusedZip("a bearer header", (d) => writeFileSync(join(d, "README.md"), "Authorization: Bearer x\n"), {}, /secret-shaped/);
refusedZip("a script", (d) => writeFileSync(join(d, "skills", "frontend", "run.js"), "1\n"), {}, /run\.js is neither a PNG nor a text file/);
refusedZip("no Codex manifest", (d) => rmSync(join(d, ".codex-plugin"), { recursive: true }), {}, /no \.codex-plugin\/plugin\.json/);
z = T.openaiZip(join(tmp, "out.tar"), { check: GREEN, pluginDir: w.pluginDir });
ok(z.code === 2 && /name the <out>\.zip/.test(z.lines.join(" ")), `no .zip name: refused (${z.lines.join(" ")})`);

console.log("X7 · the command line, on this tree");
const cli = (...args) => { const x = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" }); return { code: x.status, out: `${x.stdout}${x.stderr}`.trim() }; };
let c = cli("--check");
ok(c.code === 0 && /the Codex manifest current, version \d+\.\d+\.\d+/.test(c.out), `--check ${c.code}: ${c.out}`);
const zc = join(tmp, "cli", "sharingu-openai.zip");
c = cli("--openai-zip", zc);
ok(c.code === 0 && unzipList(zc).length === want.length && /25 files/.test(c.out), `--openai-zip ${c.code}: ${c.out.split("\n").slice(-1)[0]}`);

console.log("X8 · the annotations' reasons, the release notes");
const door = json(T.CODEX_SOURCES.door), byName = Object.fromEntries(door.tools.map((t) => [t.name, t]));
const subMd = readFileSync(T.CODEX_SOURCES.submission, "utf8");
ok(T.submissionWith(subMd, door) === subMd && T.submissionDrift().length === 0, "SUBMISSION.md's row and block are what the contract makes");
const rows = subMd.split("\n").filter((l) => /^\| `[a-z_]+` \|/.test(l));
ok(rows.length === door.tools.length && door.tools.every((t) => rows.some((r) => r.startsWith(`| \`${t.name}\` | ${!!t.annotations.readOnlyHint}: `) && r.includes(` | ${!!t.annotations.destructiveHint}: `) && r.includes(` | ${!!t.annotations.openWorldHint}: `))),
  `one row per tool (${rows.length}), each hint's value the contract's`);
const reads = door.tools.filter((t) => t.annotations.readOnlyHint).length, wipes = door.tools.filter((t) => t.annotations.destructiveHint && !t.annotations.readOnlyHint).map((t) => t.name);
ok(reads === 18 && door.tools.length - reads === 19 && wipes.includes("submit_grade") && wipes.includes("regrade") && wipes.includes("save_knowledge") && wipes.includes("remove_knowledge") && !wipes.includes("file_contribution")
  && /^\| Reads or writes \| Both: 18 read-only tools and 19 writes; 12 of the writes are destructive \(.*`regrade`.*`remove_knowledge`.*`save_knowledge`.*`submit_grade`\)/m.test(subMd),
  `the row: 18 read-only, 19 writes (sprint 19: file_contribution only adds; save_knowledge and remove_knowledge are destructive), ${wipes.length} destructive with the two graders (${wipes.join(", ")})`);
const R = (n) => T.reasonsOf(byName[n]);
ok(R("whoami").readOnlyHint === "true: it only reads what the signed-in account may see, and writes nothing." && R("submit_grade").destructiveHint === "true: it can change what is already in the org's record: it grades one check."
  && R("preview").destructiveHint === "false: it only adds to the org's record and changes nothing already there." && /^true: it can reach beyond sharingu/.test(R("wrap_up").openWorldHint)
  && /^false: it keeps state on sharingu, so it is not read-only: it saves a document or an HTML dump and answers its id and a link you can cite\.$/.test(R("save_file").readOnlyHint),
  `the rule's sentences: ${R("submit_grade").destructiveHint} · ${R("save_file").readOnlyHint}`);
ok(T.leadOf("Owner only. Rules an open question: qid and choice (the option's index); more.") === "rules an open question" && T.leadOf("Makes it `v`'s (v) on every screen; what it holds is kept.") === "makes it v's on every screen",
  "the lead: Owner only dropped, parentheses dropped, cut at a colon or semicolon, backticks dropped");
w = world("annotations");
ok(w.check().ok, "a world as made: green");
writeFileSync(w.submission, readFileSync(w.submission, "utf8").replace("| `ask` | false: it keeps", "| `ask` | false: by hand it keeps"));
r = w.check(); ok(!r.ok && /SUBMISSION\.md: its annotations .* differ from contracts\/door\.json's/.test(said(r)), `a hand-edited reason: red (${said(r)})`);
const D = json(w.door); D.tools.find((t) => t.name === "publish").annotations.destructiveHint = true; writeFileSync(w.door, JSON.stringify(D));
cpSync(T.CODEX_SOURCES.submission, w.submission);
r = w.check(); ok(!r.ok && /SUBMISSION\.md: its annotations/.test(said(r)), `a hint moved in the contract: red (${said(r)})`);
T.writePlugin({ skillsDir: join(w.pluginDir, "skills"), pluginDir: w.pluginDir, manifest: w.manifest, lock: w.lock, sources: w.sources });
const rewritten = readFileSync(w.submission, "utf8");
r = w.check(); ok(r.ok && /\| `publish` \| false: [^|]+\| true: it can change what is already in the org's record: it publishes/.test(rewritten) && /13 of the writes are destructive/.test(rewritten),
  `writePlugin rewrites the row and the block from the contract, then green (${said(r) || "no drift"})`);
writeFileSync(w.submission, rewritten.replace(T.ANNOTATIONS_END, ""));
r = w.check(); ok(!r.ok && /no generated annotations block/.test(said(r)), `a lost marker: red (${said(r)})`);
const before8 = snapshot(w.d); threw = null;
try { T.writePlugin({ skillsDir: join(w.pluginDir, "skills"), pluginDir: w.pluginDir, manifest: w.manifest, lock: w.lock, sources: w.sources }); } catch (e) { threw = e.message; }
ok(threw && /no generated annotations block, nothing written/.test(threw) && snapshot(w.d) === before8, `writePlugin with a lost marker throws, nothing written (${threw})`);
const pub = m.extensions["com.openai"].publication;
ok(pub && pub.release_notes === sub.releaseNotes && /^First public release of sharingu for ChatGPT\. One MCP server \(https:\/\/agent\.sharingu\.xyz\/mcp, /.test(pub.release_notes) && !/`|>/.test(pub.release_notes),
  `publication.release_notes is SUBMISSION.md's release notes, quotes and backticks dropped (${pub.release_notes.length} characters)`);
const noNotes = clone(m); noNotes.extensions["com.openai"].publication.release_notes = " ";
ok(problemsOf(noNotes).some((s) => /publication\.release_notes: missing/.test(s)), "no release notes: red");

rmSync(tmp, { recursive: true, force: true });
console.log(`plugin codex selftest: ${checks - failed}/${checks} green`);
process.exit(failed ? 1 : 0);
