// tools/plugin-sync-selftest.mjs — the dist repo's sync (sprint 10, 10.2): tools/make-plugin-skills.mjs --sync / --sync-check
// mirror this tree's plugin into a local clone of DIST_REPO (ryukdev/sharingu-plugin). Temp dirs only; a fake clone is
// `git init` + an origin remote (no network, no commit). "Nothing written" is the clone's whole tree, .git included, hashed
// before and after.
//   Y1 · a sync into an empty clone adds plugin/, the marketplace file and LICENSE, byte for byte; --sync-check then 0; a
//        second sync is "in sync" and writes nothing; a .DS_Store is no one's (never copied, never a stray)
//   Y2 · a stray under the clone's plugin/ (a file, a whole old skill folder) is named by --sync-check (1) and removed by --sync
//   Y3 · a changed file (in plugin/, the marketplace file, LICENSE) is named by --sync-check (1) and restored by --sync; a file
//        where this tree has a folder is replaced
//   Y4 · the clone's README.md and .git are never touched, across every sync
//   Y5 · refused, exit 2, nothing written: another origin, no origin, not a git clone, a folder inside the clone, and (--sync
//        only) a plugin that fails --check
//   Y6 · --sync-check writes nothing, even when it differs
//   Y7 · the command line on this tree's real plugin: --sync then --sync-check 0, a change makes --sync-check exit 1 naming the
//        file, another origin exits 2, no clone named exits 2
//   Y8 · a symlink in the clone's own paths (a folder under plugin/, LICENSE, plugin/ itself, .claude-plugin/, a skill's file) is
//        refused by both modes, exit 2, and what it points at outside the clone is untouched (the sprint-10 review, M1)
//   Y9 · the origin's host is github.com: https (a user part allowed), ssh://git@github.com/ and git@github.com: are accepted;
//        a look-alike host (gitlab.com, ssh://x@evil.example:22/, git@evil:, github.com.evil.com, plain http) is refused
// node tools/plugin-sync-selftest.mjs [<the generator's path>] — exit 1 on any failure.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOL = resolve(process.argv[2] || join(ENGINE, "tools", "make-plugin-skills.mjs"));
const T = await import(pathToFileURL(TOOL).href);

let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const tmp = mkdtempSync(join(tmpdir(), "plugin-sync-selftest-"));
const DIST_URL = `https://github.com/${T.DIST_REPO}.git`;

// every file under dir (.git and .DS_Store included) -> sha256, sorted: the whole tree's state
function snapshot(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(`${relative(dir, f)} ${createHash("sha256").update(readFileSync(f)).digest("hex")}`); } };
  walk(dir);
  return out.join("\n");
}
const put = (f, text) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return null; } };
const gitIn = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { stdio: ["ignore", "pipe", "pipe"] });
// clone(name, origin) -> a fake clone: git init, an origin remote (none when origin is null), the dist repo's own README.md
function clone(name, origin = DIST_URL) {
  const d = join(tmp, name);
  mkdirSync(d, { recursive: true });
  gitIn(d, "init", "-q");
  if (origin) gitIn(d, "remote", "add", "origin", origin);
  put(join(d, "README.md"), "# the dist repo's own README\n");
  return d;
}

// a fake source tree: plugin/ (a manifest, a README, two skills, a .DS_Store), the marketplace file, LICENSE
const SRC = join(tmp, "src");
const src = { pluginDir: join(SRC, "plugin"), marketplace: join(SRC, ".claude-plugin", "marketplace.json"), license: join(SRC, "LICENSE") };
put(join(src.pluginDir, ".claude-plugin", "plugin.json"), '{ "name": "sharingu", "version": "9.9.9" }\n');
put(join(src.pluginDir, "README.md"), "# plugin readme\n");
put(join(src.pluginDir, "skills", "alpha", "SKILL.md"), "alpha\n");
put(join(src.pluginDir, "skills", "beta", "SKILL.md"), "beta\n");
put(join(src.pluginDir, ".DS_Store"), "finder\n");
put(src.marketplace, '{ "name": "sharingu", "plugins": [{ "name": "sharingu", "source": "./plugin" }] }\n');
put(src.license, "All rights reserved.\n");
const WANT = ["plugin/.claude-plugin/plugin.json", "plugin/README.md", "plugin/skills/alpha/SKILL.md", "plugin/skills/beta/SKILL.md", ".claude-plugin/marketplace.json", "LICENSE"];
const GREEN = () => ({ ok: true, drift: [] });
const sync = (dir, o = {}) => T.runSync(dir, { write: true, check: GREEN, ...src, ...o });
const syncCheck = (dir) => T.runSync(dir, { write: false, ...src });
const said = (r) => r.lines.join(" | ");
const mirrored = (dir) => WANT.every((p) => read(join(dir, p)) === read(join(SRC, p)));

console.log("Y1 · a sync into an empty clone");
const A = clone("a");
const readmeA = read(join(A, "README.md")), gitA = snapshot(join(A, ".git"));
let r = sync(A);
ok(r.code === 0 && WANT.every((p) => r.lines.some((l) => l.includes(`added    ${p}`))) && mirrored(A), `--sync adds the six files byte for byte (${said(r)})`);
ok(read(join(A, "plugin", ".DS_Store")) === null, "a source .DS_Store is never copied");
r = syncCheck(A);
ok(r.code === 0 && /in sync/.test(said(r)), `--sync-check 0 after it (${said(r)})`);
let before = snapshot(A);
r = sync(A);
ok(r.code === 0 && /in sync/.test(said(r)) && snapshot(A) === before, `a second --sync is "in sync" and writes nothing (${said(r)})`);
put(join(A, "plugin", "skills", ".DS_Store"), "finder\n");
r = syncCheck(A);
ok(r.code === 0, `a .DS_Store in the clone's plugin/ is no stray (${said(r)})`);

console.log("Y2 · a stray under the clone's plugin/ is removed");
put(join(A, "plugin", "stray.txt"), "stray\n");
put(join(A, "plugin", "skills", "old-skill", "SKILL.md"), "old\n");
put(join(A, "plugin", "skills", "old-skill", ".DS_Store"), "finder\n");
put(join(A, "NOTES.md"), "the clone's own file, outside plugin/\n");
r = syncCheck(A);
ok(r.code === 1 && /removed  plugin\/stray\.txt/.test(said(r)) && /removed  plugin\/skills\/old-skill\/SKILL\.md/.test(said(r)) && !/NOTES/.test(said(r)),
  `--sync-check 1 names both strays, never a file outside plugin/ (${said(r)})`);
r = sync(A);
let gone = true; try { statSync(join(A, "plugin", "skills", "old-skill")); gone = false; } catch {}
ok(r.code === 0 && read(join(A, "plugin", "stray.txt")) === null && gone && read(join(A, "NOTES.md")) !== null && syncCheck(A).code === 0,
  `--sync removes the stray file and the old skill's folder, keeps NOTES.md, then in sync (${said(r)})`);

console.log("Y3 · a changed file is restored");
put(join(A, "plugin", "README.md"), "# hand-edited in the clone\n");
put(join(A, ".claude-plugin", "marketplace.json"), '{ "name": "other" }\n');
put(join(A, "LICENSE"), "MIT\n");
r = syncCheck(A);
ok(r.code === 1 && ["plugin/README.md", ".claude-plugin/marketplace.json", "LICENSE"].every((p) => said(r).includes(`changed  ${p}`)), `--sync-check 1 names the three (${said(r)})`);
r = sync(A);
ok(r.code === 0 && mirrored(A) && syncCheck(A).code === 0, `--sync restores them (${said(r)})`);
rmSync(join(A, "plugin", "skills", "beta"), { recursive: true });
put(join(A, "plugin", "skills", "beta"), "a file where the tree has a folder\n");
r = sync(A);
ok(r.code === 0 && mirrored(A) && syncCheck(A).code === 0, `a file standing where the tree has a folder is replaced (${said(r)})`);

console.log("Y4 · README.md and .git untouched");
ok(read(join(A, "README.md")) === readmeA, "the clone's README.md is its own, unchanged");
ok(snapshot(join(A, ".git")) === gitA, "the clone's .git is byte for byte as it was");

console.log("Y5 · refused, exit 2, nothing written");
const refused = (label, dir, o = {}) => {
  const b = snapshot(dir); const x = sync(dir, o);
  ok(x.code === 2 && /refused, nothing written/.test(said(x)) && snapshot(dir) === b, `${label} (${said(x)})`);
};
refused("another origin (the engine's private repo)", clone("other", "https://github.com/ryukdev/sharingu.git"));
refused("a look-alike origin", clone("lookalike", "https://github.com/ryukdev/sharingu-plugin-old.git"));
refused("no origin remote", clone("noorigin", null));
const plain = join(tmp, "plain"); put(join(plain, "README.md"), "not a clone\n");
refused("not a git clone", plain);
const inner = join(A, "plugin"); refused("a folder inside the clone", inner);
const B = clone("b");
refused("a plugin that fails --check (--sync never mirrors a drifted plugin)", B, { check: () => ({ ok: false, drift: ["skills/x/SKILL.md: differs from its preset"] }) });
r = T.runSync("", { write: true, check: GREEN, ...src });
ok(r.code === 2 && /no clone named/.test(said(r)), `no clone named (${said(r)})`);

console.log("Y6 · --sync-check writes nothing");
before = snapshot(B);
r = syncCheck(B);
ok(r.code === 1 && WANT.every((p) => said(r).includes(`added    ${p}`)) && snapshot(B) === before, `an empty clone: 1, each file named, nothing written (${said(r)})`);
put(join(B, "plugin", "stray.txt"), "x\n"); before = snapshot(B);
r = syncCheck(B);
ok(r.code === 1 && snapshot(B) === before && read(join(B, "plugin", "stray.txt")) === "x\n", `a stray: 1, still there (${said(r)})`);

console.log("Y7 · the command line, on this tree's real plugin");
const cli = (...args) => { const x = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" }); return { code: x.status, out: `${x.stdout}${x.stderr}`.trim() }; };
const C = clone("c");
let c = cli("--sync", C);
ok(c.code === 0 && /added    plugin\/\.claude-plugin\/plugin\.json/.test(c.out) && read(join(C, "LICENSE")) === read(T.LICENSE)
  && read(join(C, ".claude-plugin", "marketplace.json")) === read(T.MARKETPLACE) && read(join(C, "plugin", "README.md")) === read(join(T.PLUGIN_DIR, "README.md")),
  `--sync ${c.code}: ${c.out.split("\n").slice(-1)[0]}`);
c = cli("--sync-check", C);
ok(c.code === 0 && /in sync/.test(c.out), `--sync-check ${c.code}: ${c.out}`);
put(join(C, "plugin", "skills", "fill-a-project", "SKILL.md"), "hand-edited\n");
c = cli("--sync-check", C);
ok(c.code === 1 && /changed  plugin\/skills\/fill-a-project\/SKILL\.md/.test(c.out), `a change: --sync-check ${c.code}: ${c.out.split("\n")[0]}`);
c = cli("--sync", clone("cli-other", "git@github.com:ryukdev/sharingu.git"));
ok(c.code === 2 && /refused/.test(c.out), `another origin: --sync ${c.code}: ${c.out}`);
c = cli("--sync");
ok(c.code === 2 && /no clone named/.test(c.out), `no clone named: --sync ${c.code}: ${c.out}`);

console.log("Y8 · a symlink in the clone is refused, the outside untouched");
// linked(name, rel, target) -> a clone whose <rel> is a symlink to <target> (a path under tmp/<name>-outside, made with a file)
function linked(name, rel, target, { dir = false } = {}) {
  const d = clone(name), out = join(tmp, `${name}-outside`);
  put(join(out, "keep.txt"), "outside the clone\n");
  if (dir) mkdirSync(join(out, "tree", "skills"), { recursive: true });
  mkdirSync(dirname(join(d, rel)), { recursive: true });
  symlinkSync(join(out, target), join(d, rel));
  return { d, out };
}
const linkRefused = (label, { d, out }) => {
  const bo = snapshot(out), bc = snapshot(d);
  const x = sync(d), y = syncCheck(d);
  ok(x.code === 2 && y.code === 2 && /refused, nothing written: .*symlink/.test(said(x)) && /symlink/.test(said(y))
    && snapshot(out) === bo && snapshot(d) === bc && read(join(out, "keep.txt")) === "outside the clone\n",
    `${label}: --sync ${x.code}, --sync-check ${y.code}, the outside and the clone untouched (${said(x)})`);
};
linkRefused("a folder under plugin/ linked outside (plugin/skills/old -> outside)", linked("ln-dir", join("plugin", "skills", "old"), "."));
linkRefused("LICENSE linked outside (LICENSE -> outside/keep.txt)", linked("ln-license", "LICENSE", "keep.txt"));
linkRefused("plugin/ itself linked outside", linked("ln-plugin", "plugin", "tree", { dir: true }));
linkRefused(".claude-plugin/ linked outside", linked("ln-market", ".claude-plugin", "tree", { dir: true }));
linkRefused("a skill's own file linked outside", linked("ln-file", join("plugin", "skills", "alpha", "SKILL.md"), "keep.txt"));
const cl = linked("ln-cli", "LICENSE", "keep.txt");
c = cli("--sync", cl.d);
ok(c.code === 2 && /symlink/.test(c.out) && read(join(cl.out, "keep.txt")) === "outside the clone\n", `the command line: --sync ${c.code}: ${c.out}`);

console.log("Y9 · the origin's host is github.com");
for (const u of [`https://github.com/${T.DIST_REPO}.git`, `https://github.com/${T.DIST_REPO}`, `https://github.com/${T.DIST_REPO}/`,
  `https://x-access-token@github.com/${T.DIST_REPO}.git`, `ssh://git@github.com/${T.DIST_REPO}.git`, `git@github.com:${T.DIST_REPO}.git`, `git@github.com:${T.DIST_REPO}`])
  ok(T.originNamesDist(u), `accepted: ${u}`);
for (const u of [`https://gitlab.com/${T.DIST_REPO}`, `ssh://x@evil.example:22/${T.DIST_REPO}.git`, `git@evil:${T.DIST_REPO}`,
  `https://github.com.evil.com/${T.DIST_REPO}.git`, `http://github.com/${T.DIST_REPO}.git`, `ssh://git@github.com:22/${T.DIST_REPO}.git`, `git@github.com:${T.DIST_REPO}-old.git`])
  ok(!T.originNamesDist(u), `refused: ${u}`);
refused("a clone whose origin is a look-alike host (gitlab.com)", clone("gitlab", `https://gitlab.com/${T.DIST_REPO}.git`));
refused("a clone whose origin is a look-alike host (git@evil:)", clone("evil", `git@evil:${T.DIST_REPO}.git`));

rmSync(tmp, { recursive: true, force: true });
console.log(`plugin sync selftest: ${checks - failed}/${checks} green`);
process.exit(failed ? 1 : 0);
