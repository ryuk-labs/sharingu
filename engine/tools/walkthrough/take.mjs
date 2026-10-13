#!/usr/bin/env node
// tools/walkthrough/take.mjs — THE ONE COMMAND for a take of the second walkthrough video (G3): the sharingu project end to
// end, on a LOCAL org's real data, in Paper, at 1920x1080 and 60 fps (tools/walkthrough/scenes.mjs is the script,
// tools/walkthrough/record.mjs the recorder).
//
//   node tools/walkthrough/take.mjs <org url> --creds <the org's credentials.env> --expect <commit> [--rehearsal]
//        [--out <file.mp4>] [--work <dir>] [--member-name <name>] [--change <commit>] [--only <beat,beat>]
//
//   --change <commit>: the real commit beat 7 files as the change (default scenes.mjs CHANGE, 7fafeb61b). It must not be in
//   the project's history yet and must change the goal page's renderer (a file holding data-screen="goal-node"); its
//   contribution is built from the commit itself: its subject, its first paragraph, the sentences of its message that
//   state a number as the proof, the screens whose renderers it changed and its files, its time.
//
//   The final take:  node tools/walkthrough/take.mjs http://127.0.0.1:8840 --creds .runs/ship-candidate/state/ryuklabs/credentials.env --expect <sha>
//                    writes ~/Desktop/sharingu-walkthrough-v2.mp4, its report engine/.runs/walkthrough2/final.json
//   A rehearsal:     ... --rehearsal   writes engine/.runs/walkthrough2/rehearsal.mp4 and rehearsal.json
//
// It REFUSES (exit 3, nothing recorded, nothing filed) when:
//   · the url is not a local org (a take never touches Cloudflare);
//   · the Mini's 1-minute load is over 4 (a recording at load stutters);
//   · the worker on that port does not run the code of --expect: the engine its config runs (<creds dir>/wrangler.local.jsonc
//     "main") must hold engine/src exactly as that commit has it (every file's git blob hash), and its process must be up;
//   · the org's sharingu project is not real: fewer than 50 contributions on Build, or fewer than 150 checks graded;
//   · the org already holds a take (the take's question, its member, or a filing the take would make is already there:
//     rebuild the org from empty first), or the change it files (scenes.mjs CHANGE) is already in the project's history.
// Then it seats the take's member on Control (their key stays in this process), writes the items it files under the work
// folder, records the ten beats, and encodes. The keys are never printed, never in a frame, never in an address.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync, readdirSync, statSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { openRecorder, CHROME } from "./record.mjs";
import { call, isLocal } from "./mcp-call.mjs";
import { writeToolsOf } from "../import/door.mjs";
import { PROJECT, GOAL, QID, CHANGE, SCRIPT, BEATS, memberItems } from "./scenes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, "../..");
const REPO = resolve(ENGINE, "..");
const RUNS = join(ENGINE, ".runs/walkthrough2");
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const URL0 = String(argv[0] && !argv[0].startsWith("--") ? argv[0] : "").replace(/\/+$/, "");
const CREDS = flag("--creds"), EXPECT = flag("--expect"), REHEARSAL = argv.includes("--rehearsal");
const ONLY = flag("--only") ? flag("--only").split(",") : null;
const OUT = resolve(flag("--out", REHEARSAL ? join(RUNS, "rehearsal.mp4") : join(homedir(), "Desktop/sharingu-walkthrough-v2.mp4")));
const WORK = resolve(flag("--work", join(RUNS, REHEARSAL ? "take-rehearsal" : "take-final")));
const MEMBER = flag("--member-name", process.env.VIDEO_MEMBER_NAME || (REHEARSAL ? "Rehearsal member" : "Video member"));
const CHANGE_SHA = flag("--change");
const usage = () => { console.error("usage: node tools/walkthrough/take.mjs <org url> --creds <credentials.env> --expect <commit> [--rehearsal] [--out <mp4>] [--work <dir>] [--member-name <name>] [--change <commit>] [--only <beats>]"); process.exit(2); };
if (!URL0 || !CREDS || !EXPECT) usage();
const refuse = (why) => { console.error(`✗ refused: ${why}`); process.exit(3); };

// ---- the refusals ----
if (!isLocal(URL0)) refuse(`${URL0} is not a local org (http://127.0.0.1:<port>): a take never touches Cloudflare`);
const load1 = Number((/load averages?: *([\d.]+)/.exec(execFileSync("uptime").toString()) || [])[1]);
if (!(load1 <= 4)) refuse(`the 1-minute load is ${load1} (over 4): a recording at load stutters; wait and run again`);
if (!existsSync(CREDS)) refuse(`no credentials file at ${CREDS}`);
const ownerKey = ((/^[A-Z0-9_]*_AGENT_R_OWNER_KEY=(\S+)$/m.exec(readFileSync(CREDS, "utf8")) || [])[1] || "").replace(/^['"]|['"]$/g, "");
if (!ownerKey) refuse(`no owner key in ${CREDS}`);
if (!existsSync(CHROME)) refuse(`no pinned Chrome for Testing at ${CHROME}`);
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { refuse("no ffmpeg on the PATH"); }
// the code the worker runs
const stateDir = dirname(resolve(CREDS));
const cfg = join(stateDir, "wrangler.local.jsonc");
if (!existsSync(cfg)) refuse(`no worker config beside the credentials (${cfg}): cannot tell what code the worker runs`);
const main = (/"main":\s*"([^"]+)"/.exec(readFileSync(cfg, "utf8")) || [])[1];
if (!main || !existsSync(main)) refuse(`the worker config names no engine (${main})`);
const engineDir = resolve(dirname(main), "..");
const port = existsSync(join(stateDir, "port")) ? readFileSync(join(stateDir, "port"), "utf8").trim() : "";
if (port && !URL0.endsWith(":" + port)) refuse(`the credentials are for the org on port ${port}, not ${URL0}`);
const pidf = join(stateDir, "wrangler.pid");
const pid = existsSync(pidf) ? readFileSync(pidf, "utf8").trim() : "";
try { if (!pid) throw 0; process.kill(Number(pid), 0); } catch { refuse(`the org's worker is not running (no live process in ${pidf})`); }
let sha;
try { sha = execFileSync("git", ["-C", REPO, "rev-parse", "--verify", EXPECT + "^{commit}"]).toString().trim(); } catch { refuse(`--expect ${EXPECT} is not a commit of this repo`); }
{
  const want = new Map(execFileSync("git", ["-C", REPO, "ls-tree", "-r", sha, "engine/src"]).toString().trim().split("\n")
    .map((l) => { const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(l); return m ? [m[2].replace(/^engine\//, ""), m[1]] : null; }).filter(Boolean));
  const have = [];
  const walk = (d) => { for (const f of readdirSync(join(engineDir, d))) { const p = join(d, f); if (statSync(join(engineDir, p)).isDirectory()) walk(p); else have.push(p); } };
  walk("src");
  const hashes = new Map(have.length ? execFileSync("git", ["hash-object", ...have.map((p) => join(engineDir, p))]).toString().trim().split("\n").map((h, i) => [have[i], h]) : []);
  const diff = [...want].filter(([p, h]) => hashes.get(p) !== h).map(([p]) => p).concat(have.filter((p) => !want.has(p)));
  if (diff.length) refuse(`the worker runs ${engineDir}, whose engine/src differs from ${sha.slice(0, 9)} in ${diff.length} file(s): ${diff.slice(0, 5).join(", ")}`);
  console.log(`✓ the worker runs ${engineDir}: engine/src is exactly ${sha.slice(0, 9)}'s (${want.size} files)`);
}
const health = await fetch(URL0 + "/health").then((r) => r.json()).catch(() => null);
if (!health || !health.ok) refuse(`${URL0}/health does not answer ok`);
// the project is real
const getJ = (p, key = ownerKey) => fetch(URL0 + p + (p.includes("?") ? "&" : "?") + "project=" + PROJECT, { headers: { authorization: "Bearer " + key, accept: "application/json" } }).then((r) => r.json()).catch(() => ({}));
const build = await getJ("/build");
const contributions = Number(build.counts && build.counts.contributions) || 0;
const miss = (await call(URL0, ownerKey, "missing", { project: PROJECT })).out || {};
const gradesItem = [...(miss.items || []), ...(miss.filled || [])].find((x) => x && x.id === "grades") || {};
const graded = Number(gradesItem.have) || 0;
if (contributions < 50 || graded < 150) refuse(`sharingu is not real on this org: ${contributions} contributions, ${graded} checks graded (a take needs at least 50 and 150: the after-import fill and a grading run)`);
console.log(`✓ sharingu is real: ${contributions} contributions, ${graded} of ${gradesItem.want ?? "?"} checks graded`);
// no take yet
const who = await getJ("/whoami");
const ownerEmail = who.email;
if (!ownerEmail) refuse("/whoami named no owner");
const q = await call(URL0, ownerKey, "decisions", { project: PROJECT, qid: QID });
if (q.out && q.out.decision) refuse(`the org already holds a take (question ${QID} is there): rebuild it from empty first`);
const memberEmail = "video-member@sharingu.local";
const people = await fetch(URL0 + "/control/people", { headers: { authorization: "Bearer " + ownerKey, accept: "application/json" } }).then((r) => r.json()).catch(() => ({}));
if ((people.people || []).some((p) => p.email === memberEmail)) refuse(`the org already holds a take (its member ${memberEmail} is seated): rebuild it from empty first`);
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const last = existsSync(join(RUNS, "rehearsal.json")) ? JSON.parse(readFileSync(join(RUNS, "rehearsal.json"), "utf8")) : null;
const proof = last && last.summary && !last.failed ? `node tools/walkthrough/take.mjs --rehearsal -> exit 0, ${last.summary}`
  : "The recorder's capture test on the rehearsal org: 1920x1080 at 60 fps (the median while the page moved), 238 frames in 6.4 s.";
// next.who names the owner by their id (an email would show as typed on the contribution's page: reported as a product fault)
const takeItems = memberItems({ proof, owner: who.id || ownerEmail, by: tomorrow });
// the change beat 7 files: scenes.mjs CHANGE, or a commit named by --change, built from the commit
async function changeFromGit(ref) {
  let sha2; try { sha2 = execFileSync("git", ["-C", REPO, "rev-parse", "--verify", ref + "^{commit}"]).toString().trim(); } catch { refuse(`--change ${ref} is not a commit of this repo`); }
  const [at, subject, ...body] = execFileSync("git", ["-C", REPO, "show", "-s", "--format=%cI%n%s%n%b", sha2]).toString().split("\n");
  const paras = body.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p && !/^Co-Authored-By/i.test(p));
  const files = execFileSync("git", ["-C", REPO, "show", "--name-only", "--format=", sha2]).toString().trim().split("\n").filter(Boolean);
  const nodes = []; for (let after = null, k = 0; k < 20; k++) { const r2 = await call(URL0, ownerKey, "read", { project: PROJECT, kind: "node", limit: 200, ...(after ? { after } : {}) }); nodes.push(...((r2.out && r2.out.items) || [])); after = r2.out && r2.out.next; if (!after) break; }
  const ids = new Set(nodes.map((n) => n.id));
  const screens = new Set();
  for (const f of files.filter((x) => /^engine\/src\/.+\.js$/.test(x))) {
    let src = ""; try { src = execFileSync("git", ["-C", REPO, "show", `${sha2}:${f}`], { maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { continue; }   // a file the commit deleted
    for (const m of src.matchAll(/data-screen="([a-z][a-z/-]*)"/g)) if (ids.has(`screen:${m[1]}`)) screens.add(`screen:${m[1]}`);
  }
  if (!screens.has("screen:goal-node")) refuse(`--change ${sha2.slice(0, 9)} does not change the goal page's renderer (no data-screen="goal-node" in the files it changes): beat 7 needs that screen's light to go stale`);
  const sentences = paras.join(" ").split(/(?<=[.;])\s+/).filter((s) => /\d/.test(s) && /(smoke|gate|walk|selftest|suite|exit|\d+\s*\/\s*\d+|stored == built|rows)/i.test(s));
  if (!sentences.length) refuse(`--change ${sha2.slice(0, 9)} states no result with a number in its message: the door would read its proof as narration`);
  const what = subject.replace(/^sprint \d+:\s*/i, "").replace(/^\w/, (c) => c.toUpperCase()).slice(0, 200);
  return { contribution: { lane: "code", kind: "pr", happenedAt: new Date(at).toISOString().replace(/\.\d{3}Z$/, "Z"), clientRef: `sharingu-history-${sha2.slice(0, 9)}`,
    source: [{ kind: "commit", ref: sha2, label: "ryukdev/sharingu (branch sprint-3)" }], what, why: (paras[0] || what).slice(0, 1200),
    // the screens as touches only, no `screens` field beside them: with both, a long list previews "files at once" and then
    // does not file (the door's fault, reported); the files after the screens, at most 8
    touches: [...screens, ...files.slice(0, 8)], components: ["service:cloudflare-workers", "service:cloudflare-d1"],
    proof: `The commit states: ${sentences.join(" ").slice(0, 600)}` } };
}
const changeItem = CHANGE_SHA ? await changeFromGit(CHANGE_SHA) : CHANGE.item;
for (const [what, items] of [["the take's filing", takeItems], ["the change", [changeItem]]]) {
  const pv = await call(URL0, ownerKey, "preview", { project: PROJECT, items });
  const odd = ((pv.out && pv.out.items) || []).filter((x) => x.verdict !== "files");
  if (pv.error || pv.isError || odd.length) refuse(`${what} would not file at once on this org (${odd.map((x) => `${x.kindWord || x.kind}: ${x.verdict} — ${(x.reasons || [])[0] || ""}`).join(" | ") || JSON.stringify(pv.out || pv.error).slice(0, 200)}): it is already there, or the org is not the one the take was written for${what === "the change" ? " (a change already in the history: pass --change <a commit that is not>)" : ""}`);
}
console.log("✓ no take on this org yet: the take's filing and the change both preview as new");

// ---- the setup (off camera): the member's seat, the files the terminal names ----
const ctl = await fetch(URL0 + "/control", { method: "POST", headers: { authorization: "Bearer " + ownerKey, "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
  body: new URLSearchParams({ action: "add-person", name: MEMBER, email: memberEmail, role: "member", projectKey: PROJECT }) }).then((r) => r.text());
const memberKey = (/API key\): ([0-9a-f]{40})/.exec(ctl) || [])[1];
if (!memberKey) refuse("Control did not seat the take's member (no one-time key in its answer)");
console.log(`✓ ${MEMBER} seated on ${PROJECT} as a member (their key stays in this process)`);
rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, "take.json"), JSON.stringify({ project: PROJECT, clientRef: "walkthrough-v2-take", note: "The second video's take: the recorder, the goal it moves, its check and the owner's question.", items: takeItems }, null, 1));
writeFileSync(join(WORK, "change.json"), JSON.stringify({ project: PROJECT, clientRef: `walkthrough-v2-${changeItem.contribution.clientRef}`, items: [changeItem] }, null, 1));
for (const f of ["mcp-call.mjs", "grade.mjs"]) symlinkSync(join(HERE, f), join(WORK, f));
const keys = { owner: ownerKey, member: memberKey };
const secrets = [ownerKey, memberKey];
const scrub = (s) => secrets.reduce((a, k) => a.split(k).join("<key>"), String(s));
// exec(who, args): a command the terminal shows, run for real in the work folder with that seat's key in its env
const exec = (who, args) => new Promise((res) => {
  const p = spawn(process.execPath, args, { cwd: WORK, env: { ...process.env, SHARINGU_URL: URL0, SHARINGU_KEY: keys[who] } });
  let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
  p.on("exit", (c) => { const t = scrub(out); console.log(`    $ ${args.join(" ")} -> exit ${c}`); res(t); });
});

// ---- the take ----
// the write tools each filing's parts take (sprint 19: the terminal files each part with its own tool, in the preview's order)
const t = { ownerEmail, ownerKey, memberName: MEMBER, exec, lights: {}, tools: { take: writeToolsOf(takeItems), change: writeToolsOf([changeItem]) } };
const r = await openRecorder({ base: URL0, out: join(WORK, "frames"), log: (s) => console.log(s) });
await r.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: URL0 }, null).catch(() => {});
const beatTimes = [];
let failed = null;
for (const b of SCRIPT) {
  if (ONLY && !ONLY.includes(b.id) && !ONLY.includes(String(b.n))) continue;
  r.setBeat(b.n); const t0 = Date.now(); console.log(`beat ${b.n} · ${b.id}`);
  // a beat that opens with a cut or a terminal starts its own shot; one that goes on from the page on screen (What is
  // missing from Home's tile) goes on in the same shot: no cut inside a story a person would follow with their eyes
  try { await BEATS[b.id](r, t); } catch (e) { failed = `beat ${b.n} (${b.id}): ${scrub(e.message)}`; console.log(`  ✗ ${failed}`); break; }
  beatTimes.push({ n: b.n, id: b.id, seconds: +((Date.now() - t0) / 1000).toFixed(1), target: b.seconds });
}
const res = await r.finish({ mp4: OUT });
const moving = res.shots.filter((s) => s.movingFps).map((s) => s.movingFps).sort((a, b) => a - b);
const med = moving.length ? moving[Math.floor(moving.length / 2)] : null;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const report = { at: new Date().toISOString(), url: URL0, expect: sha, rehearsal: REHEARSAL, out: OUT, failed, seconds: res.seconds, size: res.size, fps: 60,
  captureFpsMedian: med, shots: res.shots, beats: beatTimes, ids: { preview: t.previewId, contribution: t.contribution, change: t.change }, lights: t.lights,
  summary: `${mmss(res.seconds)} at 60 fps, ${res.shots.length} shots; the capture held ${med} fps while the page moved` };
writeFileSync(join(RUNS, REHEARSAL ? "rehearsal.json" : "final.json"), JSON.stringify(report, null, 1));
console.log(`${failed ? "✗" : "✓"} ${OUT}: ${report.summary}${failed ? ` — STOPPED at ${failed}` : ""}`);
process.exit(failed ? 1 : 0);
