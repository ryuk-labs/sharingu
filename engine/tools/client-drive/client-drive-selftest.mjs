#!/usr/bin/env node
// client-drive-selftest.mjs — client-drive's offline proof: no screen, no client, no network, nothing outside a temp dir.
// The case parser per role, the dry-run plan (and that it writes nothing), the Codex config toggle on a temp copy, the
// generated Terminal scripts' quoting (bash -n, and a round trip of awkward words), claude-code's argv. Exit 0: all green.
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { scriptOf, terminalScript, codexWithRole, switchCodex, STATE, SCREEN_VERBS } from "./client-drive.mjs";
import { casesFor, stepsOf, planOf, planText, claudeArgs, askText, CASES_MD } from "./walk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), "client-drive-selftest-"));
const md = readFileSync(CASES_MD, "utf8");
let n = 0, failed = 0;
const t = (name, fn) => { n++; try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); } };

t("cases per role: admin P1,P4,N1 · member P2,P3,N3 · partner P5,N2", () => {
  assert.deepEqual(casesFor(md, "admin"), ["P1", "P4", "N1"]);
  assert.deepEqual(casesFor(md, "member"), ["P2", "P3", "N3"]);
  assert.deepEqual(casesFor(md, "partner"), ["P5", "N2"]);
  assert.deepEqual(casesFor(md, "member", ["P3"]), ["P3"]);
  assert.throws(() => casesFor(md, "member", ["P1"]), /not a case of the member account/);
});

t("steps: their kinds and asks (P4's decline and accept by hand; P5's whoami rewritten)", () => {
  assert.deepEqual(stepsOf(md, "P4").map((s) => s.kind), ["ask", "hand", "ask", "hand"]);
  assert.deepEqual(stepsOf(md, "P2").map((s) => s.kind), ["connect", "ask", "ask", "browser"]);
  assert.deepEqual(stepsOf(md, "P1").map((s) => s.kind), ["connect", "ask"]);
  assert.deepEqual(stepsOf(md, "P5")[1].asks, ["Call sharingu's whoami."]);
  assert.equal(askText("Call whoami."), "Call sharingu's whoami.");
  assert.equal(askText("Call sharingu's whoami."), "Call sharingu's whoami.");
  assert.match(stepsOf(md, "P3")[0].asks[0], /^In the Sample project, file a note in the leader lane: .*Preview it first\.$/);
});

t("the dry-run plan: chatgpt as member says each ask, snaps each answer, writes nothing", () => {
  const p = planOf({ client: "chatgpt", role: "member", md, take: "selftest-plan" }), text = planText(p);
  for (const a of ["Show me the goals of the sharingu project", "Search the sharingu project for preview", "File it.", "Read that contribution.", "Create a project called Mine"])
    assert.ok(text.includes(`say ${JSON.stringify(a)}`), a);
  assert.equal((text.match(/-> snap /g) || []).length, 6);
  assert.ok(text.includes("use chatgpt member") && text.includes("app shot"));
  assert.ok(!/"Call whoami\."/.test(planText(planOf({ client: "chatgpt", role: "partner", md, take: "selftest-plan" }))));
  const out = execFileSync(process.execPath, [join(HERE, "walk.mjs"), "--client", "chatgpt", "--as", "member", "--dry-run", "--take", "selftest-dry"]).toString();
  assert.ok(out.startsWith("walk chatgpt as member · cases P2, P3, N3"));
  assert.ok(!existsSync(join(STATE, "takes", "selftest-dry")), "a dry run made its take");
  assert.equal(spawnSync(process.execPath, [join(HERE, "walk.mjs"), "--client", "chatgpt", "--as", "nobody", "--dry-run"]).status, 2);
});

t("the Codex config toggle, on a temp copy: one role on, the others off, the rest untouched, a backup first", () => {
  const before = ['model = "x"', "", "[mcp_servers.sharingu-admin]", 'url = "https://agent.sharingu.xyz/mcp"', "enabled = true", "",
    "[mcp_servers.sharingu-admin.env]", 'enabled = "an env value, kept"', "", '[mcp_servers."sharingu-member"]', 'url = "https://agent.sharingu.xyz/mcp"', "",
    "[mcp_servers.sharingu-partner]", 'url = "https://agent.sharingu.xyz/mcp"', "enabled = true", "", "[mcp_servers.node_repl]", "enabled = true", ""].join("\n");
  const cfg = join(tmp, "config.toml"), backups = join(tmp, "backups"); writeFileSync(cfg, before);
  const b = switchCodex("member", { config: cfg, backups });
  assert.equal(readFileSync(b, "utf8"), before);
  const after = readFileSync(cfg, "utf8"), tableOf = (h) => after.split(h)[1].split(/\n\[/)[0];
  assert.match(tableOf("[mcp_servers.sharingu-admin]\n"), /^enabled = false$/m);
  assert.match(tableOf('[mcp_servers."sharingu-member"]\n'), /^enabled = true$/m);
  assert.match(tableOf("[mcp_servers.sharingu-partner]\n"), /^enabled = false$/m);
  assert.ok(after.includes('enabled = "an env value, kept"') && /\[mcp_servers\.node_repl\]\nenabled = true/.test(after));
  assert.equal((after.match(/^enabled = (true|false)$/gm) || []).length, 4);
  assert.equal(codexWithRole(codexWithRole(after, "admin"), "member"), after, "a switch back is the same file");
  assert.throws(() => codexWithRole('[mcp_servers.sharingu-admin]\nurl = "u"\n', "partner"), /connect\.sh chatgpt partner/);
});

t("the Terminal scripts: every screen verb's bash parses with awkward words; the re-run keeps each word whole", () => {
  const odd = join(tmp, "a b", "it's $HOME `x`.png"), file = join(tmp, "say it's.txt");
  const calls = { place: ["chatgpt", "left"], "new-chat": ["claude"], say: ["chatgpt", file], sidebar: ["chatgpt"], menus: ["claude", "File"],
    "set-model": ["chatgpt"], snap: [odd, "window", "claude"], "rec-start": ["take-1", "window", "chatgpt"], restart: ["claude", "full"] };
  for (const v of SCREEN_VERBS) {
    if (v === "wait") continue;
    const f = join(tmp, `${v}.sh`); writeFileSync(f, scriptOf(v, calls[v]));
    assert.equal(spawnSync("bash", ["-n", f]).status, 0, `${v}: bash -n`);
  }
  assert.ok(scriptOf("snap", [odd, "full"]).includes(`'${odd.replace(/'/g, `'\\''`)}'`));
  assert.throws(() => scriptOf("rec-start", ["../escape", "full"]), /a take is/);
  const echo = join(tmp, "argv.mjs"); writeFileSync(echo, "console.log(JSON.stringify([process.env.CLIENT_DRIVE_INSIDE, ...process.argv.slice(2)]));");
  const words = ["say", "chatgpt", odd, "a \"quoted\" word", "$? and $(date)", "it's"], sh = join(tmp, "rerun.sh");
  writeFileSync(sh, terminalScript(words, { file: echo }));
  assert.equal(spawnSync("bash", ["-n", sh]).status, 0);
  assert.deepEqual(JSON.parse(execFileSync("bash", [sh]).toString()), ["1", ...words]);
  const rit = readFileSync(join(HERE, "run-in-terminal.sh"), "utf8");
  assert.equal(spawnSync("bash", ["-n", join(HERE, "run-in-terminal.sh")]).status, 0);
  assert.ok(rit.includes('echo \\$? > $(q "$rc.tmp")'), "the exit code is the inner shell's $?");
});

t("claude-code's argv: only sharingu-<role> may run, one session per case", () => {
  assert.deepEqual(claudeArgs("Hi.", "member", "u-1", true), ["-p", "Hi.", "--output-format", "json", "--allowedTools", "mcp__sharingu-member",
    "--disallowedTools", "mcp__sharingu-admin", "mcp__sharingu-partner", "--session-id", "u-1"]);
  assert.deepEqual(claudeArgs("File it.", "partner", "u-1", false).slice(-2), ["--resume", "u-1"]);
});

rmSync(tmp, { recursive: true, force: true });
console.log(`client-drive selftest: ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
