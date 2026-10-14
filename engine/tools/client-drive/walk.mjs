#!/usr/bin/env node
// walk.mjs — listing/test-cases.md's cases for ONE account, walked in a real AI client on the Mini, as a reviewer would:
//   node walk.mjs --client chatgpt|claude-app|claude-code --as admin|member|partner [--cases P1,P3] [--record] [--frame full|left] [--dry-run]
// The cases are those whose heading names that account (tools/listing-walk.mjs casesOf, the same headings it walks). Per case:
// a new chat; per step: an "Ask:" step is said, waited on (until the window has stopped changing for 3 s, at most 90 s),
// snapped and marked; a browser step is a shot of the app half (client-drive.mjs app-start) when it is up; a sign-in step is
// the connection `client-drive.mjs use <client> <role>` switched on before the walk; any other step (P4's decline) is the
// owner's, by hand: the walk waits for <take>/go. claude-code runs headless (`claude -p`, one session per case), each answer
// into <take>/<case>.md. --dry-run prints the plan and touches nothing. Snaps, marks, the recording and transcripts land in
// engine/.runs/client-drive/takes/<take>/. Exit 0: walked; 1: a step failed; 2: usage.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, appendFileSync, mkdtempSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ENGINE, REPO, STATE, ROLES, inside, inTerminal, clientOf, run as drive, waitStill, windowShot, mark, recStop, app } from "./client-drive.mjs";

const { casesOf } = await import(pathToFileURL(join(ENGINE, "tools", "listing-walk.mjs")).href);
export const CASES_MD = join(REPO, "listing", "test-cases.md");
export const CLIENTS = ["chatgpt", "claude-app", "claude-code"];

// askText(s) -> what is typed. THE one rewrite: a bare "Call whoami." made ChatGPT run the SHELL's whoami (2026-10-13), so
// it is always asked as sharingu's.
export const askText = (s) => String(s).replace(/^Call whoami\.?$/, "Call sharingu's whoami.");

// stepsOf(md, id) -> [{ n, text, asks, kind }]: the numbered steps of one case. Neither listing-walk's casesOf (the headings)
// nor make-plugin-skills' parseTestCases (each case's turns joined into one prompt) keeps a step's own asks, so this reads them:
// kind "ask" (its quoted Ask: lines), "connect" (a sign-in: the connection), "browser" (the org in a browser), "hand" (else).
export function stepsOf(md, id) {
  const part = String(md).split(/^### /m).find((p) => p.startsWith(`${id} · `));
  if (!part) throw new Error(`no case ${id} in test-cases.md`);
  const steps = [];
  for (const l of part.split(/^## /m)[0].split("\n").slice(1)) {
    const s = /^(\d+)\.\s+(.*)$/.exec(l);
    if (s) steps.push({ n: Number(s[1]), text: s[2] }); else if (steps.length && /^\s{2,}\S/.test(l)) steps[steps.length - 1].text += " " + l.trim();
  }
  return steps.map((s) => {
    const instr = s.text.split(/\bExpect: /)[0];
    const asks = [...instr.matchAll(/\bask(?: your AI)?: "([^"]+)"/gi)].map((m) => askText(m[1]));
    const kind = asks.length ? "ask" : /^(Add the MCP address|Sign in as)/.test(instr) ? "connect" : /\bbrowser\b/.test(instr) ? "browser" : "hand";
    return { n: s.n, text: s.text.replace(/\s+/g, " ").trim(), asks, kind };
  });
}

// casesFor(md, role, only) -> the case ids whose heading names that account (only: a subset, each of them that account's)
export function casesFor(md, role, only = null) {
  const mine = casesOf(md).filter((c) => c.who === role).map((c) => c.id);
  if (!only) return mine;
  const bad = only.filter((id) => !mine.includes(id));
  if (bad.length) throw Object.assign(new Error(`${bad.join(", ")}: not a case of the ${role} account (${mine.join(", ")})`), { usage: true });
  return only;
}

// claudeArgs(prompt, role, session, first) -> `claude -p` argv: only sharingu-<role> may run; the other roles' tools are hidden
export const claudeArgs = (prompt, role, session, first) => ["-p", prompt, "--output-format", "json",
  "--allowedTools", `mcp__sharingu-${role}`, "--disallowedTools", ...ROLES.filter((r) => r !== role).map((r) => `mcp__sharingu-${r}`),
  first ? "--session-id" : "--resume", session];

// planOf(opts) -> [{ case, title, steps: [{ n, kind, text, asks, snap, prompt files }] }] and the take: what a walk does, in order
export function planOf({ client, role, cases = null, record = false, frame = "full", md = readFileSync(CASES_MD, "utf8"), take }) {
  if (!CLIENTS.includes(client)) throw Object.assign(new Error(`--client ${CLIENTS.join("|")}`), { usage: true });
  if (!ROLES.includes(role)) throw Object.assign(new Error(`--as ${ROLES.join("|")}`), { usage: true });
  const titles = Object.fromEntries(casesOf(md).map((c) => [c.id, c.title]));
  const d = new Date(), two = (n) => String(n).padStart(2, "0");              // the Mini's local time
  take = take || `${client}-${role}-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  const dir = join(STATE, "takes", take);
  return { client, role, record: record && client !== "claude-code", frame, take, dir,
    cases: casesFor(md, role, cases).map((id) => ({ id, title: titles[id], steps: stepsOf(md, id).map((s) => ({ ...s,
      files: s.asks.map((_, i) => join(dir, `${id}-${s.n}${s.asks.length > 1 ? String.fromCharCode(97 + i) : ""}`)) })) })) };
}

export function planText(p) {
  const out = [`walk ${p.client} as ${p.role} · cases ${p.cases.map((c) => c.id).join(", ")} · take ${p.take}`,
    `  into ${p.dir}`];
  const gui = p.client !== "claude-code";
  if (gui) out.push(`  before: client-drive.mjs use ${p.client} ${p.role} (the sharingu-${p.role} connection on)`,
    `  place ${p.client} ${p.frame}${p.record ? ` · rec-start ${p.take} ${p.frame === "full" ? "window" : "full"}` : ""}`);
  for (const c of p.cases) {
    out.push(`${c.id} · ${c.title}`, gui ? `  new-chat${p.client === "chatgpt" && p.frame === "full" ? " · set-model" : ""}${p.record ? ` · mark ${c.id}` : ""}` : `  claude -p, one session for the case`);
    for (const s of c.steps) {
      if (s.kind === "ask") s.asks.forEach((a, i) => out.push(gui
        ? `  ${s.n}. say ${JSON.stringify(a)} -> wait (still 3 s, max 90 s) -> snap ${s.files[i]}.png${p.record ? ` -> mark ${c.id}.${s.n}` : ""}`
        : `  ${s.n}. claude ${JSON.stringify(a)} -> ${join(p.dir, `${c.id}.md`)}`));
      else if (s.kind === "connect") out.push(`  ${s.n}. the connection (sharingu-${p.role}): ${s.text.split(/\bExpect: /)[0].trim()}`);
      else if (s.kind === "browser") out.push(`  ${s.n}. app shot ${join(p.dir, `${c.id}-${s.n}-app.png`)} if the app half is up: ${s.text.split(/\bExpect: /)[0].trim()}`);
      else out.push(`  ${s.n}. BY HAND (${gui ? `then touch ${join(p.dir, "go")}` : "skipped headless"}): ${s.text.split(/\bExpect: /)[0].trim()}`);
    }
  }
  if (p.record) out.push(`  after: rec-stop ${p.take}`);
  return out.join("\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (code, what) => { if (code !== 0) throw new Error(`${what} failed (exit ${code})`); };

async function walkGui(p) {
  const log = (l) => { console.log(l); appendFileSync(join(p.dir, "walk.log"), l + "\n"); };
  const c = clientOf(p.client);
  ok(await drive(["place", p.client, p.frame]), "place");
  if (p.record) ok(await drive(["rec-start", p.take, p.frame === "full" ? "window" : "full", p.client]), "rec-start");
  try {
    for (const k of p.cases) {
      ok(await drive(["new-chat", p.client]), "new-chat");
      if (p.client === "chatgpt" && p.frame === "full") ok(await drive(["set-model", p.client]), "set-model");   // New Chat resets it
      if (p.record) log(mark(p.take, k.id));
      for (const s of k.steps) {
        if (s.kind === "ask") for (const [i, a] of s.asks.entries()) {
          writeFileSync(s.files[i] + ".txt", a);
          const baseline = windowShot(c.app, c.quietBottom);
          ok(await drive(["say", p.client, s.files[i] + ".txt"]), "say");
          const w = await waitStill(p.client, { baseline });
          ok(await drive(["snap", s.files[i] + ".png", "window", p.client]), "snap");
          log(`${k.id}.${s.n} ${w.ok ? `answered in ${w.secs}s` : "STILL MOVING after 90s"}: ${a}`);
          if (p.record) log(mark(p.take, `${k.id}.${s.n}`));
        }
        else if (s.kind === "browser") {
          const png = join(p.dir, `${k.id}-${s.n}-app.png`);
          try { log(`${k.id}.${s.n} ${await app("shot", png)}`); } catch (e) { log(`${k.id}.${s.n} no app shot (${e.message})`); }
        }
        else if (s.kind === "hand") {
          const go = join(p.dir, "go"); log(`${k.id}.${s.n} BY HAND, then touch ${go}: ${s.text}`);
          for (let t = 0; !existsSync(go); t++) { if (t > 1800) throw new Error(`${k.id}.${s.n}: nobody touched ${go} in 15 minutes`); await sleep(500); }
          rmSync(go); if (p.record) log(mark(p.take, `${k.id}.${s.n} by hand`));
        }
      }
    }
  } finally { if (p.record) log(await recStop(p.take)); }
}

function walkHeadless(p) {
  const cwd = mkdtempSync(join(tmpdir(), "client-drive-"));                 // no project's CLAUDE.md in the walk's way
  for (const k of p.cases) {
    const session = randomUUID(), t = join(p.dir, `${k.id}.md`); let first = true;
    writeFileSync(t, `# ${k.id} · ${k.title} — claude-code as ${p.role} (session ${session})\n`);
    for (const s of k.steps) {
      if (s.kind !== "ask") { appendFileSync(t, `\n## ${k.id}.${s.n} — not walked headless (${s.kind})\n\n${s.text}\n`); continue; }
      for (const a of s.asks) {
        let answer;
        try { answer = JSON.parse(execFileSync("claude", claudeArgs(a, p.role, session, first), { cwd, timeout: 300_000, maxBuffer: 1 << 26 }).toString()).result; }
        catch (e) { answer = `FAILED: ${String(e.message).split("\n")[0]}`; }
        first = false;
        appendFileSync(t, `\n## ${k.id}.${s.n}\n\n> ${a}\n\n${answer}\n`);
        console.log(`${k.id}.${s.n} ${String(answer).slice(0, 100).replace(/\n/g, " ")}`);
      }
    }
  }
  rmSync(cwd, { recursive: true, force: true });
}

export function argsOf(argv) {
  const o = { dryRun: false, record: false, frame: "full" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === "--client") o.client = v(); else if (a === "--as") o.role = v(); else if (a === "--cases") o.cases = v().split(",").map((s) => s.trim());
    else if (a === "--record") o.record = true; else if (a === "--dry-run") o.dryRun = true; else if (a === "--frame") o.frame = v();
    else if (a === "--take") o.take = v();
    else throw Object.assign(new Error(`unknown ${a}`), { usage: true });
  }
  if (!["full", "left"].includes(o.frame)) throw Object.assign(new Error("--frame full|left"), { usage: true });
  return o;
}

async function main(argv) {
  const o = argsOf(argv), p = planOf(o);
  if (o.dryRun) { console.log(planText(p)); return 0; }
  if (p.client !== "claude-code" && !inside()) {                             // the whole walk runs inside Terminal, one hop
    const steps = p.cases.reduce((n, c) => n + c.steps.length, 0);
    return inTerminal([...argv, "--take", p.take], 300 + steps * 150, { file: fileURLToPath(import.meta.url) });
  }
  mkdirSync(p.dir, { recursive: true, mode: 0o700 });
  console.log(planText(p));
  if (p.client === "claude-code") walkHeadless(p); else await walkGui(p);
  console.log(`walked: ${p.dir}`);
  return 0;
}

const runDirectly = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || ""); } catch { return false; } };
if (runDirectly()) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(e.usage ? 2 : 1); });
