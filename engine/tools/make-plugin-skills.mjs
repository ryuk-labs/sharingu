// tools/make-plugin-skills.mjs — writes the Claude Code plugin's skills (plugin/skills/<slug>/SKILL.md at the repo root) from
// engine/src/presets/*.md, the starter pack built into the product (sprint 9, 9.1; docs/plan/MARKETPLACE.md M1). One skill
// per preset: its front matter `name` is the preset's slug and its `description` the preset's purpose, then a line naming
// this generator, then the preset's body as it is. The skills say only what the presets say.
// THE VERSION (the sprint-9 review, B1): an installed plugin updates only when plugin.json's `version` string changes, so the
// generator owns it. tools/plugin-version.json holds the version and the digest of everything an install receives (every file
// under plugin/, the skills as the presets make them, plugin.json with its version blanked; a .DS_Store is no one's); when that
// digest moves, the generator raises the version's last number and writes both.
//
//   node tools/make-plugin-skills.mjs          # regenerate plugin/skills/ (a folder or a file no preset makes is removed) and
//                                              #   move the version when the plugin's content moved
//   node tools/make-plugin-skills.mjs --check  # exit 1 when plugin/skills/ is not exactly what the presets make, or the
//                                              #   plugin's content moved and its version did not (the gate)
//   node tools/make-plugin-skills.mjs --sync <clone>        # mirror the plugin into a local clone of its public distribution
//                                              #   repo (DIST_REPO): plugin/ exactly (a file no longer here is removed), the
//                                              #   repo-root .claude-plugin/marketplace.json and LICENSE; prints each file added,
//                                              #   changed or removed, or "in sync". Never touches the clone's .git or README.md
//   node tools/make-plugin-skills.mjs --sync-check <clone>  # the same comparison, nothing written: exit 1 naming each difference
//   node tools/make-plugin-skills.mjs --openai-zip <out.zip> # the ZIP OpenAI's plugin submission takes (below); refused when
//                                              #   --check fails
//
// THE CODEX MANIFEST (sprint 11, 11.4; OpenAI's plugin submission guide, read 2026-10-10): plugin/.codex-plugin/plugin.json is
// GENERATED with the skills, from ONE source each: the identity is the Claude manifest's (name, version, description, author,
// homepage, license, keywords); the `interface` listing is listing/codex-listing.json's facts plus what listing/SUBMISSION.md
// already says (the long description, the website, support, privacy and terms URLs, the developer); the review block
// (extensions.com.openai.review) is PARSED from listing/test-cases.md (5 positive, 3 negative; tools_triggered the door's tools
// each case names in backticks); publication.release_notes is SUBMISSION.md's quoted release notes (16.2). Its images are copied
// from listing/icon/ (plugin/assets/). The guide's limits are checked
// (codexProblems): a manifest over one is never written and --check is red. The digest covers the manifest and the images as
// the generator makes them, so a change in any of those sources moves the version. demo_recording_url is the owner's: it is
// emitted only once codex-listing.json holds demoRecordingURL.
// --openai-zip: the plugin folder less Claude's own .claude-plugin/ (the Codex manifest, .mcp.json, the skills, the images,
// LICENSE, README.md), with the system zip; its .mcp.json alone adds OpenAI's OAuth declaration (OPENAI_AUTH, below); refused
// (exit 2, nothing written) when --check fails or a file holds a forbidden key (test_credentials, reviewer_instructions,
// clientSecret, a nonempty headers) or a secret-shaped string.
// THE ANNOTATIONS' REASONS (16.2): the generator also writes listing/SUBMISSION.md's "Reads or writes" row and its generated
// block (each tool's three hints, one reason each) from contracts/door.json; --check is red when they drift (annotationsOf).
//
// THE DIST REPO (sprint 10, 10.2): the engine's repo is private (the proprietary ruling, 2026-10-09); the plugin installs from
// DIST_REPO, which holds only the files above and its own README.md. Both sync modes refuse (exit 2, nothing written) a <clone>
// that is not the top of a git clone whose origin is DIST_REPO on github.com, or whose plugin/, .claude-plugin/ or LICENSE holds a
// symlink or a path outside the clone; --sync also refuses when --check fails (never a drifted plugin). No network: the owner
// pulls the clone before and pushes it after, by hand (the ship plan prints that step).
//
// The presets are read by tools/make-presets.mjs readPresets (the one parser). Output is deterministic: the same presets
// and the same plugin files make the same bytes and the same version.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, statSync, lstatSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readPresets } from "./make-presets.mjs";

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO = dirname(ENGINE);
export const PLUGIN_DIR = join(REPO, "plugin");
export const SKILLS_DIR = join(PLUGIN_DIR, "skills");
export const MANIFEST = join(PLUGIN_DIR, ".claude-plugin", "plugin.json");
export const VERSION_LOCK = join(ENGINE, "tools", "plugin-version.json");
export const GENERATED_MARK = "GENERATED by engine/tools/make-plugin-skills.mjs";
// the plugin's public distribution repo (what Control · Connect's add line names) and the repo-root files it carries beside plugin/
export const DIST_REPO = "ryuk-labs/sharingu-plugin";
export const MARKETPLACE = join(REPO, ".claude-plugin", "marketplace.json");
export const LICENSE = join(REPO, "LICENSE");
// a file no one makes and no install needs (Finder's): never content, never drift
const IGNORED = new Set([".DS_Store"]);

// skillOf(preset) -> the text of plugin/skills/<slug>/SKILL.md (the description JSON-quoted: a YAML double-quoted scalar)
export function skillOf(p) {
  return `---
name: ${p.slug}
description: ${JSON.stringify(p.purpose)}
---

<!-- ${GENERATED_MARK} from engine/src/presets/${p.file} (version ${p.version}). Do not edit by hand: change the preset, then run node tools/make-plugin-skills.mjs from engine/. -->

${p.body}`;
}

// expectedSkills(items) -> { "<slug>/SKILL.md": text } for every preset, in shelf order
export function expectedSkills(items = readPresets()) {
  const out = {};
  for (const p of items) out[`${p.slug}/SKILL.md`] = skillOf(p);
  return out;
}

// filesUnder(dir) -> every file's path relative to dir, sorted ([] when dir is missing)
function filesUnder(dir) {
  const out = [];
  const walk = (d) => {
    let names = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names.sort()) {
      if (IGNORED.has(n)) continue;
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f); else out.push(relative(dir, f));
    }
  };
  walk(dir);
  return out;
}

// the manifest's version field, blanked (the digest never covers the version it decides)
const VERSION_RE = /("version"\s*:\s*")([^"]*)(")/;
const unversioned = (text) => text.replace(VERSION_RE, "$1$3");
// pluginDigest({ skills, pluginDir, generated }) -> 16 hex: every file an install receives, in path order (path, NUL, bytes, NUL):
// the skills as the presets make them, the Codex manifest and its images as their sources make them (generated: path -> text or
// bytes), every other file under plugin/ as it stands, both manifests with their version blanked
const VERSIONED = new Set([".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]);
export function pluginDigest({ skills = expectedSkills(), pluginDir = PLUGIN_DIR, generated = codexOf().files } = {}) {
  const files = new Map(Object.entries(skills).map(([p, t]) => [`skills/${p}`, t]));
  for (const [p, b] of generated) files.set(p, b);
  for (const p of filesUnder(pluginDir)) if (!p.startsWith("skills/") && !generated.has(p)) files.set(p, readFileSync(join(pluginDir, p)));
  const h = createHash("sha256");
  for (const p of [...files.keys()].sort()) {
    const b = files.get(p);
    h.update(`${p}\0`); h.update(VERSIONED.has(p) ? unversioned(String(b)) : b); h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
export const manifestVersion = (manifest = MANIFEST) => { try { return (VERSION_RE.exec(readFileSync(manifest, "utf8")) || [])[2] || null; } catch { return null; } };
// nextVersion("0.1.4") -> "0.1.5": the release's last number raised
export const nextVersion = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || "")); return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : "0.1.0"; };

// ---- the Codex manifest (11.4) ----
export const LISTING_DIR = join(REPO, "listing");
export const CODEX_MANIFEST = join(PLUGIN_DIR, ".codex-plugin", "plugin.json");
export const CODEX_SOURCES = Object.freeze({
  manifest: MANIFEST,                                    // the Claude manifest: the identity
  listing: join(LISTING_DIR, "codex-listing.json"),      // the listing's own facts
  submission: join(LISTING_DIR, "SUBMISSION.md"),        // the long description, the URLs, the developer
  testCases: join(LISTING_DIR, "test-cases.md"),         // the review block
  door: join(REPO, "contracts", "door.json"),            // the door's tools (a tools_triggered name must be one)
  mcp: join(PLUGIN_DIR, ".mcp.json"),                    // the one MCP server
  icons: join(LISTING_DIR, "icon"),
});
// the plugin's images: the plugin path -> the listing's icon it is copied from (the logo, the composer's small icon)
export const CODEX_ASSETS = Object.freeze({ "assets/logo.png": "sharingu-512.png", "assets/composer-icon.png": "sharingu-128.png" });
// keys the submission ZIP rejects (the guide: reviewer access goes in the dashboard; no client secret; no hooks, no app refs)
export const FORBIDDEN_KEYS = Object.freeze(["test_credentials", "reviewer_instructions", "clientSecret", "client_secret", "hooks", "apps"]);
// the Claude plugin directory's own rule for a binary in the plugin folder
export const MAX_ASSET_BYTES = 256 * 1024;

const flat = (s) => String(s).replace(/\s+/g, " ").trim();
const plain = (s) => flat(s).replace(/`/g, "").replace(/\*\*/g, "");
// sentence(s) -> s with its first letter raised (never the brand's: sharingu is lower case) and a full stop when it ends in none
const sentence = (s) => { const x = plain(s); return x && `${/^sharingu/.test(x) ? x[0] : x[0].toUpperCase()}${x.slice(1)}${/[.?!]["')]?$/.test(x) ? "" : "."}`; };
export const doorTools = (door = CODEX_SOURCES.door) => new Set(((JSON.parse(readFileSync(door, "utf8")).inventory || {}).tools || []).map((t) => t.name));

// parseTestCases(md, tools) -> { positive: [{description, prompt, tools_triggered, expected_behavior}], negative: [{description,
// prompt, expected_behavior}] }: each `### P1 · <title> — account: <who>` section's numbered steps, EVERY one kept, in order (the
// sprint-11 review: P4's "Decline." had vanished). A step is what you ask or do, then its "Expect:" text (an "Expect:"-only step
// belongs to the step before it). Its turn in the prompt: its quoted asks ('Ask: "…"') when the step holds nothing else but notes
// in parentheses, else its whole instruction; its expectation the "Expect:" text. A case of more than one step numbers both by
// its steps ("1) … 2) …"), so each expectation names the turn it follows. A negative's description carries its "Why:" paragraph
// (OpenAI's guide asks for why the plugin should not act; its schema has no field of its own for it). Other paragraphs (an
// "Also:" note) are the reviewer's, not the manifest's. tools_triggered: the door's tools the steps name in backticks, in order,
// once each.
export function parseTestCases(md, tools) {
  const out = { positive: [], negative: [] };
  for (const part of String(md).split(/^### /m).slice(1)) {
    const lines = part.split("\n"), m = /^([PN])\d · (.+) — account: (.+)$/.exec(lines[0]);
    if (!m) continue;
    const body = lines.slice(1).join("\n").split(/^## /m)[0];
    const steps = []; let why = "";
    for (const para of body.split(/\n\s*\n/)) {
      if (/^Why: /.test(para.trim())) { why = sentence(para.trim().slice(5)); continue; }
      if (!/^\d+\.\s/.test(para.trim())) continue;
      for (const l of para.trim().split("\n")) {
        const s = /^(\d+)\.\s+(.*)$/.exec(l);
        if (s) steps.push({ n: s[1], text: s[2] }); else if (steps.length) steps[steps.length - 1].text += " " + l.trim();
      }
    }
    const turns = [], expects = [];
    for (const { n, text } of steps) {
      const at = text.search(/\bExpect: /), instr = flat(at < 0 ? text : text.slice(0, at)), exp = at < 0 ? "" : flat(text.slice(at + 8));
      if (instr) {
        const asks = [...instr.matchAll(/\bask(?: your AI)?: "([^"]+)"/gi)];
        const rest = asks.reduce((r, a) => r.replace(a[0], ""), instr).replace(/\([^)]*\)/g, "");
        turns.push({ n, text: asks.length && !/[A-Za-z]/.test(rest) ? asks.map((a) => sentence(a[1])).join(" ") : sentence(instr) });
      }
      if (exp) expects.push({ n: instr || !turns.length ? n : turns[turns.length - 1].n, text: sentence(exp) });
    }
    const join = (xs) => xs.map((x) => (steps.length > 1 ? `${x.n}) ${x.text}` : x.text)).join(" ");
    const who = m[3] === "none" ? "no account signed in" : `as the ${m[3]} account`;
    if (m[1] === "N") { out.negative.push({ description: `${plain(m[2])} (${who}).${why ? ` Why: ${why}` : ""}`, prompt: join(turns), expected_behavior: join(expects) }); continue; }
    const named = [...new Set(steps.flatMap((s) => [...s.text.matchAll(/`([a-z_]+)`/g)].map((x) => x[1])).filter((n) => tools.has(n)))];
    out.positive.push({ description: `${plain(m[2])} (${who})`, prompt: join(turns), tools_triggered: named.join(", "), expected_behavior: join(expects) });
  }
  return out;
}

// parseSubmission(md) -> what listing/SUBMISSION.md's "facts every form shares" say: the long description (its Description
// block, backticks dropped), the website, support, privacy and terms URLs (the first https URL of each table row), the developer;
// and the ChatGPT section's release notes (the quoted block under its "Release notes" item, backticks dropped)
export function parseSubmission(md) {
  const row = (label) => { const r = new RegExp(`^\\| ${label} \\| (.+?) \\|$`, "m").exec(md); return r ? r[1] : ""; };
  const url = (label) => (/https:\/\/[^\s·|]+/.exec(row(label)) || [""])[0];
  const d = /^\*\*Description \(≤ [\d,]+\):\*\*\n\n([\s\S]*?)\n\n\*\*Use cases:\*\*/m.exec(md);
  const notes = /^\d+\. \*\*Release notes\*\*[\s\S]*?\n\n((?:[ \t]*>.*(?:\n|$))+)/m.exec(md);
  return {
    releaseNotes: notes ? plain(notes[1].split("\n").map((l) => l.replace(/^\s*> ?/, "")).join(" ")) : "",
    longDescription: d ? d[1].split(/\n\s*\n/).map(plain).join("\n\n") : "",
    developerName: flat(row("Company").split("·")[0]),
    websiteURL: url("Website"), supportURL: url("Support"), privacyPolicyURL: url("Privacy policy"), termsOfServiceURL: url("Terms of service"),
  };
}

// ---- the annotations' reasons (16.2): OpenAI's final submission asks "a justification for each value on every MCP tool"
// (developers.openai.com/plugins/deploy/submission-errors, 2026-10-12). No field of the ZIP carries one: the portal reads the
// tools and their hints from its scan of the live server, so the reasons are pasted there. They are GENERATED into
// listing/SUBMISSION.md (between ANNOTATIONS_BEGIN and ANNOTATIONS_END, and its "Reads or writes" row) from contracts/door.json
// at generation time, one sentence per hint per tool by the rule below, never typed per tool; --check is red when they drift.
export const ANNOTATIONS_BEGIN = `<!-- BEGIN ${GENERATED_MARK} from contracts/door.json: each tool's three hints and their reasons. Do not edit by hand. -->`;
export const ANNOTATIONS_END = "<!-- END the generated annotations -->";
// leadOf(description) -> what the tool does, from its description: the first sentence (a leading "Admin only." / "Owner only."
// dropped), its parentheses dropped, cut at its first colon or semicolon, its first letter lowered
export const leadOf = (d) => {
  const x = plain(d).replace(/^(Admin|Owner) only\.\s*/, "").split(/\.(?:\s|$)/)[0].replace(/\s*\([^)]*\)/g, "").split(/[:;]/)[0].trim();
  return x && x[0].toLowerCase() + x.slice(1);
};
// reasonsOf(tool) -> { readOnlyHint, destructiveHint, openWorldHint }: each hint's value and its one sentence, by rule
export function reasonsOf(t) {
  const a = t.annotations || {}, lead = leadOf(t.description || "");
  return {
    readOnlyHint: `${!!a.readOnlyHint}: ${a.readOnlyHint ? "it only reads what the signed-in account may see, and writes nothing." : `it keeps state on sharingu, so it is not read-only: it ${lead}.`}`,
    destructiveHint: `${!!a.destructiveHint}: ${a.destructiveHint ? `it can change what is already in the org's record: it ${lead}.`
      : a.readOnlyHint ? "it only reads, so it removes or overwrites nothing." : "it only adds to the org's record and changes nothing already there."}`,
    openWorldHint: `${!!a.openWorldHint}: ${a.openWorldHint ? "it can reach beyond sharingu: what it hands over may also go to a service the org has linked."
      : "it reaches only the signed-in account's own orgs on sharingu, a bounded private workspace."}`,
  };
}
// annotationsOf(door) -> { row, block }: the "Reads or writes" row's value and the generated block, from the contract's tools
export function annotationsOf(door = JSON.parse(readFileSync(CODEX_SOURCES.door, "utf8"))) {
  const tools = [...(door.tools || [])].sort((x, y) => (x.name < y.name ? -1 : 1));
  const names = (f) => tools.filter(f).map((t) => `\`${t.name}\``);
  const reads = names((t) => t.annotations.readOnlyHint), writes = names((t) => !t.annotations.readOnlyHint);
  const wipes = names((t) => !t.annotations.readOnlyHint && t.annotations.destructiveHint), open = names((t) => t.annotations.openWorldHint);
  const row = `Both: ${reads.length} read-only tools and ${writes.length} writes; ${wipes.length} of the writes are destructive (${wipes.join(", ")}), the other ${writes.length - wipes.length} only add; each tool has a title and its three hints (their reasons: the ChatGPT section)`;
  const lines = [ANNOTATIONS_BEGIN, "",
    `${tools.length} tools: ${reads.length} read-only, ${writes.length} writes (${wipes.length} destructive, ${writes.length - wipes.length} that only add), ${open.length} open-world (${open.join(", ") || "none"}).`, "",
    "| Tool | readOnlyHint | destructiveHint | openWorldHint |", "|---|---|---|---|",
    ...tools.map((t) => { const r = reasonsOf(t); return `| \`${t.name}\` | ${r.readOnlyHint} | ${r.destructiveHint} | ${r.openWorldHint} |`; }),
    "", ANNOTATIONS_END];
  return { row, block: lines.join("\n") };
}
// submissionWith(md, door) -> listing/SUBMISSION.md with its "Reads or writes" row and its generated block as the contract makes
// them (null when the file holds no such row or no block markers: nothing to place them in)
export function submissionWith(md, door) {
  const { row, block } = annotationsOf(door);
  const rowRe = /^\| Reads or writes \| .+ \|$/m, at = md.indexOf(ANNOTATIONS_BEGIN), end = md.indexOf(ANNOTATIONS_END);
  if (!rowRe.test(md) || at < 0 || end < at) return null;
  return (md.slice(0, at) + block + md.slice(end + ANNOTATIONS_END.length)).replace(rowRe, `| Reads or writes | ${row} |`);
}
// submissionDrift(path, door) -> [] or ["../listing/SUBMISSION.md: <why>"] (the path relative to plugin/, as every drift line is)
export function submissionDrift(path = CODEX_SOURCES.submission, door = CODEX_SOURCES.door) {
  const md = readFileSync(path, "utf8"), want = submissionWith(md, JSON.parse(readFileSync(door, "utf8"))), at = relative(PLUGIN_DIR, path);
  if (want === null) return [`${at}: no "Reads or writes" row or no generated annotations block to keep`];
  return want === md ? [] : [`${at}: its annotations (the "Reads or writes" row, the generated block) differ from contracts/door.json's`];
}

// codexManifest({ claude, listing, submission, cases }) -> the manifest object, in the guide's order
export function codexManifest({ claude, listing, submission, cases }) {
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  const review = { test_cases: cases };
  if (listing.demoRecordingURL) review.demo_recording_url = listing.demoRecordingURL;
  return {
    ...pick(claude, ["name", "version", "description", "author", "homepage", "license", "keywords"]),
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: listing.displayName, shortDescription: listing.shortDescription, longDescription: submission.longDescription,
      developerName: submission.developerName, category: listing.category, capabilities: listing.capabilities,
      websiteURL: submission.websiteURL, supportURL: submission.supportURL, privacyPolicyURL: submission.privacyPolicyURL,
      termsOfServiceURL: submission.termsOfServiceURL, defaultPrompt: listing.defaultPrompt,
      brandColor: listing.brandColor, brandColorDark: listing.brandColorDark,
      composerIcon: "./assets/composer-icon.png", logo: "./assets/logo.png",
    },
    extensions: { "com.openai": { review, publication: { release_notes: submission.releaseNotes } } },
  };
}

// contrast("#RRGGBB", "#RRGGBB") -> the WCAG contrast ratio
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// pngSize(bytes) -> { w, h } from a PNG's IHDR, or null when the bytes are not a PNG
export const pngSize = (b) => (b && b.length > 24 && b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null);

// codexProblems(m, { tools, assets, mcp }) -> ["<field>: <why>"]: the guide's limits (2026-10-10), the review block's 5 + 3, the
// images, the one MCP server, no forbidden key anywhere
export function codexProblems(m, { tools = new Set(), assets = new Map(), mcp = {} } = {}) {
  const p = [], i = m.interface || {}, review = ((m.extensions || {})["com.openai"] || {}).review || {};
  const len = (f, v, max, req = true) => { if (typeof v !== "string" || (req && !v.length)) p.push(`${f}: missing`); else if (v.length > max) p.push(`${f}: ${v.length} characters, over ${max}`); };
  const https = (f, v, max = 1024) => { len(f, v, max); if (typeof v === "string" && !/^https:\/\/[^/@\s]+(\/\S*)?$/.test(v)) p.push(`${f}: not an https URL without credentials (${v})`); };
  len("name", m.name, 64); if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.name || "")) p.push(`name: not lowercase letters, numbers and single hyphens`);
  if (!/^\d+\.\d+\.\d+$/.test(m.version || "")) p.push(`version: not an explicit semver (${m.version})`);
  len("description", m.description, 4000);
  len("author.name", (m.author || {}).name, 120); len("author.email", (m.author || {}).email, 320, false);
  if ((m.author || {}).url !== undefined) https("author.url", m.author.url, 2048);
  if (m.homepage !== undefined) https("homepage", m.homepage, 2048);
  if (m.mcpServers !== "./.mcp.json") p.push(`mcpServers: not ./.mcp.json`);
  len("interface.displayName", i.displayName, 30); len("interface.shortDescription", i.shortDescription, 30);
  len("interface.longDescription", i.longDescription, 4000); len("interface.developerName", i.developerName, 80);
  len("interface.category", i.category, 80);
  if (!Array.isArray(i.capabilities) || i.capabilities.length > 20) p.push(`interface.capabilities: not a list of at most 20`);
  else i.capabilities.forEach((c, n) => len(`interface.capabilities[${n}]`, c, 120));
  for (const f of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) https(`interface.${f}`, i[f]);
  const dp = i.defaultPrompt === undefined ? [] : i.defaultPrompt;
  if (!Array.isArray(dp) || dp.length > 3 || new Set(dp).size !== dp.length) p.push(`interface.defaultPrompt: not at most 3 unique prompts`);
  else dp.forEach((d, n) => { len(`interface.defaultPrompt[${n}]`, d, 128); if (/@\w/.test(d)) p.push(`interface.defaultPrompt[${n}]: an @mention`); });
  for (const [f, against] of [["brandColor", "#FFFFFF"], ["brandColorDark", "#212121"]]) {
    if (i[f] === undefined) continue;
    if (!/^#[0-9A-Fa-f]{6}$/.test(i[f])) p.push(`interface.${f}: not #RRGGBB`);
    else if (contrast(i[f], against) < 2) p.push(`interface.${f}: contrast ${contrast(i[f], against).toFixed(2)} against ${against}, under 2:1`);
  }
  for (const f of ["composerIcon", "logo"]) {
    const v = i[f];
    if (typeof v !== "string" || !v.startsWith("./")) { p.push(`interface.${f}: not a ./ path`); continue; }
    const b = assets.get(v.slice(2)), s = pngSize(b);
    if (!b) p.push(`interface.${f}: ${v} is not in the plugin`);
    else if (!s) p.push(`interface.${f}: ${v} is not a PNG`);
    else if (s.w !== s.h || s.w < 48 || s.w > 4096) p.push(`interface.${f}: ${s.w}x${s.h}, not square from 48 to 4096 px`);
    else if (b.length > MAX_ASSET_BYTES) p.push(`interface.${f}: ${b.length} bytes, over the Claude directory's ${MAX_ASSET_BYTES}`);
  }
  const tc = review.test_cases || {}, pos = tc.positive || [], neg = tc.negative || [];
  if (pos.length !== 5) p.push(`review.test_cases.positive: ${pos.length} cases, not 5`);
  if (neg.length !== 3) p.push(`review.test_cases.negative: ${neg.length} cases, not 3`);
  pos.forEach((c, n) => {
    for (const f of ["description", "prompt", "tools_triggered", "expected_behavior"]) if (typeof c[f] !== "string" || !c[f].trim()) p.push(`review.test_cases.positive[${n}].${f}: missing`);
    for (const t of String(c.tools_triggered || "").split(",").map((x) => x.trim()).filter(Boolean)) if (!tools.has(t)) p.push(`review.test_cases.positive[${n}].tools_triggered: ${t} is no tool of the door`);
  });
  // a negative: the guide's two fields, and ours (its guide asks why the plugin should not act and the refusal or fallback to expect)
  neg.forEach((c, n) => {
    for (const f of ["description", "prompt", "expected_behavior"]) if (typeof c[f] !== "string" || !c[f].trim()) p.push(`review.test_cases.negative[${n}].${f}: missing`);
    if (typeof c.description === "string" && !/ Why: \S/.test(c.description)) p.push(`review.test_cases.negative[${n}].description: no Why`);
  });
  if (review.demo_recording_url !== undefined) https("review.demo_recording_url", review.demo_recording_url, 2048);
  const pub = ((m.extensions || {})["com.openai"] || {}).publication || {};
  if (typeof pub.release_notes !== "string" || !pub.release_notes.trim()) p.push("publication.release_notes: missing (the final submission requires release notes)");
  const servers = Object.entries((mcp || {}).mcpServers || {});
  if (servers.length !== 1) p.push(`.mcp.json: ${servers.length} servers, not exactly one`);
  for (const [n, s] of servers) {
    if (!/^https:\/\//.test(s.url || "")) p.push(`.mcp.json: ${n}'s url is not https`);
    if (s.type === "none") p.push(`.mcp.json: ${n} is type none`);
    const auth = ((s.extensions || {})["com.openai"] || {}).auth;
    if (auth === undefined) continue;
    if (!["none", "oauth", "mixed", "api_key"].includes(auth.type)) p.push(`.mcp.json: ${n}'s auth.type is not none, oauth, mixed or api_key`);
    if (auth.type === "none") p.push(`.mcp.json: ${n}'s auth is type none (the guide: never for a protected server)`);
    const c = auth.client;
    if (c !== undefined && !["provided", "dcr", "cimd"].includes((c || {}).mode)) p.push(`.mcp.json: ${n}'s auth.client.mode is not provided, dcr or cimd`);
    if (c && c.mode !== "provided" && Object.keys(c).some((k) => k !== "mode")) p.push(`.mcp.json: ${n}'s ${c.mode} client holds ${Object.keys(c).filter((k) => k !== "mode").join(", ")} (the guide: no clientId or credentials)`);
  }
  const walk = (o, at) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (FORBIDDEN_KEYS.includes(k)) p.push(`${at}${k}: a key the submission rejects`);
      if (k === "headers" && v && Object.keys(v).length) p.push(`${at}${k}: nonempty server headers`);
      walk(v, `${at}${k}.`);
    }
  };
  walk(m, ""); walk(mcp, ".mcp.json:");
  return p;
}

// codexOf({ version, ...CODEX_SOURCES }) -> { manifest, text, files: Map(plugin path -> text or bytes), problems }: what the
// sources make now (the version: the Claude manifest's unless named)
export function codexOf({ version, ...over } = {}) {
  const src = { ...CODEX_SOURCES, ...over };
  const claude = JSON.parse(readFileSync(src.manifest, "utf8"));
  if (version !== undefined) claude.version = version;
  const { _doc, ...listing } = JSON.parse(readFileSync(src.listing, "utf8"));
  const tools = doorTools(src.door), mcp = JSON.parse(readFileSync(src.mcp, "utf8"));
  const manifest = codexManifest({ claude, listing, submission: parseSubmission(readFileSync(src.submission, "utf8")), cases: parseTestCases(readFileSync(src.testCases, "utf8"), tools) });
  const assets = new Map(Object.entries(CODEX_ASSETS).map(([p, f]) => [p, readFileSync(join(src.icons, f))]));
  const text = JSON.stringify(manifest, null, 2) + "\n";
  return { manifest, text, files: new Map([[".codex-plugin/plugin.json", text], ...assets]), problems: codexProblems(manifest, { tools, assets, mcp: zipMcpOf(mcp) }) };
}
// the folders only the generator writes (a file there it does not make is drift)
const GENERATED_DIRS = [".codex-plugin", "assets"];

// checkSkills({ dir, skills, pluginDir, manifest, lock, codex, submission, door }) -> { ok, count, version, drift: ["<path>: <why>"] } —
// plugin/skills/ against what the presets make now, the Codex manifest and its images against their sources (and the guide's
// limits), SUBMISSION.md's annotations against the contract, and the version against the plugin's content (the inputs are the
// selftests' seams)
export function checkSkills({ dir = SKILLS_DIR, skills = expectedSkills(), pluginDir = PLUGIN_DIR, manifest = MANIFEST, lock = VERSION_LOCK,
  codex = codexOf({ manifest, version: manifestVersion(manifest) ?? undefined }), submission = CODEX_SOURCES.submission, door = CODEX_SOURCES.door } = {}) {
  const want = skills, drift = [...submissionDrift(submission, door)];
  for (const why of codex.problems) drift.push(`.codex-plugin/plugin.json: ${why}`);
  for (const [path, b] of codex.files) {
    let cur = null; try { cur = readFileSync(join(pluginDir, path)); } catch {}
    if (cur === null) drift.push(`${path}: missing`);
    else if (!cur.equals(Buffer.from(b))) drift.push(`${path}: differs from what its sources make`);
  }
  for (const d of GENERATED_DIRS) for (const f of filesUnder(join(pluginDir, d))) if (!codex.files.has(`${d}/${f}`)) drift.push(`${d}/${f}: no source makes it`);
  const have = filesUnder(dir);
  for (const [path, text] of Object.entries(want)) {
    let cur = null; try { cur = readFileSync(join(dir, path), "utf8"); } catch {}
    if (cur === null) drift.push(`skills/${path}: missing`);
    else if (cur !== text) drift.push(`skills/${path}: differs from its preset`);
  }
  for (const path of have) if (!(path in want)) drift.push(`skills/${path}: no preset makes it`);
  const l = readJson(lock), version = manifestVersion(manifest), digest = pluginDigest({ skills: want, pluginDir, generated: codex.files });
  if (!l || !l.version || !l.digest) drift.push(`${relative(REPO, lock)}: missing or unreadable`);
  else {
    if (l.digest !== digest) drift.push(`the plugin's content moved (digest ${digest}, ${l.version} was ${l.digest}) and its version did not`);
    if (version !== l.version) drift.push(`.claude-plugin/plugin.json: version ${version} is not the generator's ${l.version}`);
  }
  return { ok: drift.length === 0, count: Object.keys(want).length, version, drift };
}

// writePlugin({ skillsDir, pluginDir, manifest, lock, sources }) -> { slugs, version, moved }: SUBMISSION.md's annotations as the
// contract makes them, the skills written (a folder or a file no preset makes removed: B5), the version moved when the content
// did, then the Codex manifest (at that version) and its images (a file in their folders no source makes removed). Throws,
// writing nothing, when the Codex manifest breaks a limit or SUBMISSION.md has no place for its annotations
export function writePlugin({ skills = expectedSkills(), skillsDir = SKILLS_DIR, pluginDir = PLUGIN_DIR, manifest = MANIFEST, lock = VERSION_LOCK, sources = {} } = {}) {
  const draft = codexOf({ ...sources, manifest }), submission = sources.submission || CODEX_SOURCES.submission;
  if (draft.problems.length) throw new Error(`the Codex manifest breaks the guide, nothing written:\n  ${draft.problems.join("\n  ")}`);
  const subMd = readFileSync(submission, "utf8"), subWant = submissionWith(subMd, JSON.parse(readFileSync(sources.door || CODEX_SOURCES.door, "utf8")));
  if (subWant === null) throw new Error(`${relative(REPO, submission)} holds no "Reads or writes" row or no generated annotations block, nothing written`);
  if (subWant !== subMd) writeFileSync(submission, subWant);
  const slugs = new Set(Object.keys(skills).map((p) => p.split("/")[0]));
  let names = []; try { names = readdirSync(skillsDir); } catch {}
  for (const n of names) if (!slugs.has(n)) rmSync(join(skillsDir, n), { recursive: true, force: true });
  for (const p of filesUnder(skillsDir)) if (!(p in skills)) rmSync(join(skillsDir, p), { force: true });
  for (const [path, text] of Object.entries(skills)) {
    mkdirSync(dirname(join(skillsDir, path)), { recursive: true });
    writeFileSync(join(skillsDir, path), text);
  }
  const l = readJson(lock), digest = pluginDigest({ skills, pluginDir, generated: draft.files }), had = manifestVersion(manifest);
  const version = !l || !l.version ? had || "0.1.0" : l.digest === digest ? l.version : nextVersion(l.version);
  const moved = !!l && l.version !== version;
  if (!l || l.digest !== digest || l.version !== version) writeFileSync(lock, JSON.stringify({ version, digest }, null, 1) + "\n");
  if (had !== version) writeFileSync(manifest, readFileSync(manifest, "utf8").replace(VERSION_RE, `$1${version}$3`));
  const codex = codexOf({ ...sources, manifest, version });
  for (const d of GENERATED_DIRS) for (const f of filesUnder(join(pluginDir, d))) if (!codex.files.has(`${d}/${f}`)) rmSync(join(pluginDir, d, f), { force: true });
  for (const [path, b] of codex.files) { mkdirSync(dirname(join(pluginDir, path)), { recursive: true }); writeFileSync(join(pluginDir, path), b); }
  return { slugs: [...slugs], version, moved, from: l && l.version };
}

// ---- the dist repo's sync (10.2) ----
const real = (f) => { try { return realpathSync(f); } catch { return f; } };
// git(dir, args) -> its trimmed stdout, or null on any failure (local only; the caller's GIT_DIR / GIT_WORK_TREE never steer it)
function git(dir, args) {
  const env = { ...process.env }; delete env.GIT_DIR; delete env.GIT_WORK_TREE;
  try { return execFileSync("git", ["-C", dir, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}
// originNamesDist(url) -> true when a remote URL is DIST_REPO on github.com, in one of GitHub's own forms: https://github.com/
// (a user part allowed), ssh://git@github.com/ or git@github.com: (.git and a trailing slash optional). Any other host is refused,
// however its path reads (the sprint-10 review, M1: gitlab.com, ssh://x@evil.example:22/…, git@evil:… had passed)
const DIST_ORIGIN = new RegExp(`^(?:https://(?:[^/@\\s]+@)?github\\.com/|ssh://git@github\\.com/|git@github\\.com:)${DIST_REPO.replace("/", "\\/")}(?:\\.git)?/?$`, "i");
export const originNamesDist = (url) => DIST_ORIGIN.test(String(url || "").trim());
// distRefusal(dir) -> null when dir is the top of a git clone whose origin names DIST_REPO, else why not
export function distRefusal(dir) {
  if (!dir) return "no clone named";
  let isDir = false; try { isDir = statSync(dir).isDirectory(); } catch {}
  if (!isDir) return `${dir} is not a directory`;
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  if (!top || real(top) !== real(dir)) return `${dir} is not the top of a git clone`;
  const origin = git(dir, ["remote", "get-url", "origin"]);
  if (!origin) return `${dir} has no origin remote`;
  if (!originNamesDist(origin)) return `${dir}'s origin is ${origin}, not ${DIST_REPO}`;
  return null;
}
// THE CLONE'S OWN PATHS (the sprint-10 review, M1): every path the sync reads, writes or removes in the clone — plugin/ and all
// under it, .claude-plugin/ and all under it, LICENSE — must be a real file or folder lying inside the clone. A symlink anywhere
// there (plugin/old -> ../outside, LICENSE -> ../outside/x) would carry a removal or a write OUTSIDE the clone, so it is refused
// before anything is read or written, as is any path whose realpath leaves the clone's realpath, or that is neither a file nor a
// folder (a fifo would hang the read). The walk never follows a link (lstat).
export const CLONE_TOPS = ["plugin", ".claude-plugin", "LICENSE"];
// cloneLinkRefusal(dir) -> null when every clone path the sync touches is a plain file or folder inside dir, else why not
export function cloneLinkRefusal(dir) {
  const root = real(dir), inside = (f) => { const r = real(f); return r === root || r.startsWith(root + sep); };
  const visit = (rel) => {
    const f = join(dir, rel);
    let st; try { st = lstatSync(f); } catch { return null; } // absent: the sync makes it (its parents checked on the way down)
    if (st.isSymbolicLink()) return `${rel} in the clone is a symlink (the sync never follows one out of the clone)`;
    if (!inside(f)) return `${rel} in the clone lies outside it (${real(f)})`;
    if (st.isDirectory()) {
      let names; try { names = readdirSync(f); } catch { return `${rel} in the clone cannot be read`; }
      for (const n of names.sort()) { const why = visit(join(rel, n)); if (why) return why; }
      return null;
    }
    return st.isFile() ? null : `${rel} in the clone is neither a file nor a folder`;
  };
  for (const t of CLONE_TOPS) { const why = visit(t); if (why) return why; }
  return null;
}
// distFiles({ pluginDir, marketplace, license }) -> Map(path in the clone -> bytes): what the dist repo must hold from here
export function distFiles({ pluginDir = PLUGIN_DIR, marketplace = MARKETPLACE, license = LICENSE } = {}) {
  const out = new Map();
  for (const p of filesUnder(pluginDir)) out.set(`plugin/${p}`, readFileSync(join(pluginDir, p)));
  out.set(".claude-plugin/marketplace.json", readFileSync(marketplace));
  out.set("LICENSE", readFileSync(license));
  return out;
}
// distDiff(dir, want) -> { added, changed, removed } (sorted paths): the clone against want; a stray is any file under the clone's
// plugin/ that want does not hold (nothing outside plugin/ is ever a stray: .git, README.md and the rest are the clone's own)
export function distDiff(dir, want = distFiles()) {
  const added = [], changed = [];
  for (const [p, bytes] of want) {
    let cur = null; try { cur = readFileSync(join(dir, p)); } catch {}
    if (cur === null) added.push(p); else if (!cur.equals(bytes)) changed.push(p);
  }
  const removed = filesUnder(join(dir, "plugin")).map((p) => `plugin/${p}`).filter((p) => !want.has(p));
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}
// pruneEmpty(dir) -> removes every folder under dir left holding nothing but ignored files (bottom-up; dir itself kept)
function pruneEmpty(dir) {
  let names = []; try { names = readdirSync(dir); } catch { return; }
  for (const n of names) { const f = join(dir, n); if (!IGNORED.has(n) && statSync(f).isDirectory()) pruneEmpty(f); }
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory() && readdirSync(f).every((x) => IGNORED.has(x))) rmSync(f, { recursive: true, force: true });
  }
}
// runSync(dir, { write, check, ...distFiles' paths }) -> { code, lines }: --sync (write) or --sync-check (no write). 2 = refused,
// nothing written; 1 = --sync-check found a difference; 0 = in sync (or synced). The selftest's seam: check and the source paths
export function runSync(dir, { write = false, check = () => checkSkills(), ...src } = {}) {
  const mode = write ? "--sync" : "--sync-check";
  const why = distRefusal(dir);
  if (why) return { code: 2, lines: [`${mode} refused, nothing written: ${why} (want a local clone of ${DIST_REPO})`] };
  const link = cloneLinkRefusal(dir);
  if (link) return { code: 2, lines: [`${mode} refused, nothing written: ${link}`] };
  if (write) {
    const c = check();
    if (!c.ok) return { code: 2, lines: [...c.drift.map((d) => `  plugin/${d}`), `${mode} refused, nothing written: plugin/ is stale (run node tools/make-plugin-skills.mjs first)`] };
  }
  const want = distFiles(src), d = distDiff(dir, want);
  const lines = [...d.added.map((p) => `  added    ${p}`), ...d.changed.map((p) => `  changed  ${p}`), ...d.removed.map((p) => `  removed  ${p}`)];
  if (!lines.length) return { code: 0, lines: [`${dir}: in sync with this tree's plugin (${want.size} files)`] };
  if (!write) return { code: 1, lines: [...lines, `${dir} differs from this tree's plugin: run node tools/make-plugin-skills.mjs --sync ${dir}`] };
  for (const p of d.removed) rmSync(join(dir, p), { force: true });
  pruneEmpty(join(dir, "plugin"));
  for (const p of [...d.added, ...d.changed]) {
    const f = join(dir, p);
    try { if (statSync(f).isDirectory()) rmSync(f, { recursive: true, force: true }); } catch {}
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, want.get(p));
  }
  return { code: 0, lines: [...lines, `${dir}: synced (${lines.length} file${lines.length === 1 ? "" : "s"}); push it by hand`] };
}

// ---- the OpenAI submission ZIP (11.4) ----
// a file name the ZIP never carries (a VCS folder, Finder's, an env file, a hook or an app reference the guide rejects)
const ZIP_REFUSED_NAME = /(^|\/)(\.git(\/|$)|\.DS_Store$|\.env(\.|$)|[^/]*\.env$|credentials|hooks(\.json)?$|\.app\.json$)/i;
// a secret-shaped string or a key the submission rejects, in a text file (s50's leak pattern, plus the guide's own keys)
const ZIP_REFUSED_TEXT = /authorization|bearer|"headers"\s*:\s*\{\s*"|_KEY=|\b[0-9a-f]{32,}\b|\b[A-Za-z0-9_-]{40,}\b|"(test_credentials|reviewer_instructions|clientSecret|client_secret)"/i;
// zipFiles(pluginDir) -> the plugin paths the ZIP holds: every file under plugin/ less Claude's own .claude-plugin/
export const zipFiles = (pluginDir = PLUGIN_DIR) => filesUnder(pluginDir).filter((p) => !p.startsWith(".claude-plugin/"));
// zipRefusal(pluginDir, files) -> null, or why these files may not leave in a submission ZIP
export function zipRefusal(pluginDir, files) {
  if (!files.includes(".codex-plugin/plugin.json")) return "no .codex-plugin/plugin.json";
  for (const p of files) {
    if (ZIP_REFUSED_NAME.test(p)) return `${p} is a file the ZIP never carries`;
    const b = readFileSync(join(pluginDir, p));
    if (pngSize(b)) { if (b.length > MAX_ASSET_BYTES) return `${p}: ${b.length} bytes, over ${MAX_ASSET_BYTES}`; continue; }
    if (!/\.(md|json|txt)$/.test(p) && p !== "LICENSE") return `${p} is neither a PNG nor a text file`;
    const hit = ZIP_REFUSED_TEXT.exec(b.toString("utf8"));
    if (hit) return `${p} holds a forbidden key or a secret-shaped string (${hit[0].slice(0, 12)}…)`;
  }
  return null;
}
// THE ZIP'S .mcp.json (16.2; developers.openai.com/plugins/build/plugins, "Configure MCP authentication", 2026-10-12): "Declare
// authentication under each server's extensions["com.openai"].auth object in mcp.json"; for Dynamic Client Registration the
// auth object is { type: "oauth", client: { mode: "dcr" } }, registrationUrl omitted when discovery supplies it (ours does:
// /.well-known/oauth-authorization-server names /oauth/register). Only the ZIP's copy carries it: plugin/.mcp.json is Claude's,
// read by `claude plugin validate --strict`, and stays as it is.
export const OPENAI_AUTH = Object.freeze({ type: "oauth", client: Object.freeze({ mode: "dcr" }) });
// zipMcpOf(mcp) -> the ZIP's .mcp.json object: each server with extensions["com.openai"].auth set to OPENAI_AUTH
export function zipMcpOf(mcp) {
  const out = JSON.parse(JSON.stringify(mcp || {}));
  for (const s of Object.values(out.mcpServers || {})) {
    s.extensions = { ...(s.extensions || {}), "com.openai": { ...((s.extensions || {})["com.openai"] || {}), auth: JSON.parse(JSON.stringify(OPENAI_AUTH)) } };
  }
  return out;
}
// openaiZip(out, { check, pluginDir }) -> { code, lines, files }: 2 = refused, nothing written; 0 = the ZIP written and its list
// read back equal to what was meant (the system zip and unzip; -X no extra attributes, -D no folder entries). The files are
// staged in a temp folder first (the ZIP's .mcp.json is zipMcpOf's), and the staged copy is refused by the same rules.
export function openaiZip(out, { check = () => checkSkills(), pluginDir = PLUGIN_DIR } = {}) {
  if (!out || !/\.zip$/.test(out)) return { code: 2, lines: ["--openai-zip refused, nothing written: name the <out>.zip"] };
  const c = check();
  if (!c.ok) return { code: 2, lines: [...c.drift.map((d) => `  plugin/${d}`), "--openai-zip refused, nothing written: plugin/ is stale (run node tools/make-plugin-skills.mjs first)"] };
  const files = zipFiles(pluginDir), why = zipRefusal(pluginDir, files);
  if (why) return { code: 2, lines: [`--openai-zip refused, nothing written: ${why}`] };
  const stage = mkdtempSync(join(tmpdir(), "sharingu-openai-zip-"));
  try {
    for (const p of files) {
      mkdirSync(dirname(join(stage, p)), { recursive: true });
      writeFileSync(join(stage, p), p === ".mcp.json" ? JSON.stringify(zipMcpOf(JSON.parse(readFileSync(join(pluginDir, p), "utf8"))), null, 2) + "\n" : readFileSync(join(pluginDir, p)));
    }
    const staged = zipRefusal(stage, files);
    if (staged) return { code: 2, lines: [`--openai-zip refused, nothing written: the ZIP's copy: ${staged}`] };
    const at = resolve(out);
    mkdirSync(dirname(at), { recursive: true });
    rmSync(at, { force: true });
    execFileSync("zip", ["-X", "-D", "-q", at, ...files], { cwd: stage, stdio: ["ignore", "pipe", "pipe"] });
    const listed = execFileSync("unzip", ["-Z1", at], { encoding: "utf8" }).split("\n").filter(Boolean).sort();
    if (listed.join("\n") !== [...files].sort().join("\n")) { rmSync(at, { force: true }); return { code: 2, lines: [`--openai-zip: the ZIP's list is not the plugin's (${listed.length} of ${files.length}); removed`] }; }
    return { code: 0, files: listed, lines: [...listed.map((p) => `  ${p}`), `${out}: ${listed.length} files, ${statSync(at).size} bytes (version ${c.version}; its .mcp.json declares OAuth with dynamic client registration)`] };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

// run directly? (REAL paths compared: engine/CLAUDE.md's scar)
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) {
  const at = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1] || ""; };
  const syncDir = at("--sync"), syncCheckDir = at("--sync-check"), zipOut = at("--openai-zip");
  if (zipOut !== undefined) {
    const r = openaiZip(zipOut);
    for (const l of r.lines) (r.code ? console.error : console.log)(l);
    process.exit(r.code);
  } else if (syncDir !== undefined || syncCheckDir !== undefined) {
    const r = runSync(syncDir ?? syncCheckDir, { write: syncDir !== undefined });
    for (const l of r.lines) (r.code ? console.error : console.log)(l);
    process.exit(r.code);
  } else if (process.argv.includes("--check")) {
    const r = checkSkills();
    if (!r.ok) {
      for (const d of r.drift) console.error(`  plugin/${d}`);
      console.error("plugin/ is stale: run node tools/make-plugin-skills.mjs");
      process.exit(1);
    }
    console.log(`plugin/skills/ current (${r.count} skills from engine/src/presets/), the Codex manifest current, version ${r.version} for this content`);
  } else {
    let w;
    try { w = writePlugin(); } catch (e) { console.error(e.message); process.exit(1); }
    console.log(`wrote plugin/skills/: ${w.slugs.join(", ")} (${w.slugs.length} skills), plugin/.codex-plugin/plugin.json and plugin/assets/; version ${w.version}${w.moved ? ` (moved from ${w.from}: the plugin's content changed)` : " (the content as it was)"}`);
  }
}
