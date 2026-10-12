// tools/smoke/s50-plugin.mjs — sprint 9, 9.1 (docs/plan/MARKETPLACE.md M1): the Claude Code plugin at the repo root.
//   · plugin/skills/ is exactly what engine/src/presets/ make (tools/make-plugin-skills.mjs --check, the gate's own step)
//   · the version is the generator's (the sprint-9 review, B1: an install updates only when it moves): plugin.json's equals
//     tools/plugin-version.json's, whose digest is the plugin's content now; a content change with no version change is red
//   · plugin/.claude-plugin/plugin.json names the ruled slug `sharingu` (never changeable once published) and its license,
//     Proprietary (the owner's ruling, 2026-10-09);
//     plugin/.mcp.json holds ONE server on the platform's one address, http, no headers (the connector's sign-in does the rest)
//   · .claude-plugin/marketplace.json at the repo root lists that one plugin at ./plugin
//   · every generated skill's front matter is its preset's (name = slug, description = purpose) and its body the preset's
//   · the Codex manifest (sprint 11, 11.4: plugin/.codex-plugin/plugin.json, generated with the skills and inside --check) carries
//     the Claude manifest's name and version and points at the same .mcp.json; the plugin's only binaries are the generator's
//     PNGs (plugin/assets/, each under the Claude directory's 256 KiB)
//   · nothing in the plugin's text carries a secret: no header, no bearer, no key-shaped string
//   · the fill skill's calls are tools this worker's door serves (tools/list on the smoke's own owner key)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { smoke, expect, brief, toolsList, ownerKey } from "./lib.mjs";
import { checkSkills, expectedSkills, pluginDigest, manifestVersion, pngSize, REPO, PLUGIN_DIR, SKILLS_DIR, VERSION_LOCK, GENERATED_MARK, CODEX_ASSETS, MAX_ASSET_BYTES } from "../make-plugin-skills.mjs";
import { readPresets } from "../make-presets.mjs";

const SLUG = "sharingu", ADDRESS = "https://agent.sharingu.xyz/mcp", LICENSE_NAME = "Proprietary";
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
const filesUnder = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? filesUnder(join(d, n)) : [join(d, n)]);

smoke("plugin · the skills are what the presets make; the manifest names the ruled slug and its license; ONE MCP server on the one address with no header; the repo's marketplace lists it; every skill's front matter is its preset's; no secret in the plugin; the fill skill's calls are served", async () => {
  const chk = checkSkills();
  expect(chk.ok && chk.count === readPresets().length, () => `make-plugin-skills --check: ${brief(chk)}`);
  const lock = json(VERSION_LOCK);
  expect(manifestVersion() === lock.version && lock.digest === pluginDigest(), () => `the version: plugin.json ${manifestVersion()}, the lock ${brief(lock)}, the content's digest ${pluginDigest()}`);
  const moved = Object.fromEntries(Object.entries(expectedSkills()).map(([p, t], i) => [p, i ? t : `${t}\n- one more line`]));
  const red = checkSkills({ skills: moved });
  expect(!red.ok && red.drift.some((d) => /content moved .* and its version did not/.test(d)) && pluginDigest({ skills: moved }) !== lock.digest,
    () => `a changed skill with the version unmoved: ${brief(red.drift)}`);

  const pj = json(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"));
  expect(pj.name === SLUG && pj.license === LICENSE_NAME && /^\d+\.\d+\.\d+$/.test(pj.version || "") && pj.description && pj.author && pj.author.name,
    () => `plugin.json: ${brief(pj)}`);

  const cx = json(join(PLUGIN_DIR, ".codex-plugin", "plugin.json"));
  expect(cx.name === pj.name && cx.version === pj.version && cx.mcpServers === "./.mcp.json" && cx.interface && cx.interface.logo === "./assets/logo.png",
    () => `.codex-plugin/plugin.json: ${brief({ name: cx.name, version: cx.version, mcpServers: cx.mcpServers })} (the Claude manifest's ${pj.name} ${pj.version})`);

  const mj = json(join(PLUGIN_DIR, ".mcp.json")), servers = Object.entries(mj.mcpServers || {});
  expect(Object.keys(mj).join() === "mcpServers" && servers.length === 1, () => `.mcp.json: one server wanted, ${brief(mj)}`);
  const [name, srv] = servers[0];
  expect(name === SLUG && srv.type === "http" && srv.url === ADDRESS && Object.keys(srv).sort().join() === "type,url",
    () => `.mcp.json's server: ${name} ${brief(srv)} (want ${SLUG}: {type: http, url: ${ADDRESS}}, nothing else)`);

  const mk = json(join(REPO, ".claude-plugin", "marketplace.json"));
  expect(mk.name && mk.owner && Array.isArray(mk.plugins) && mk.plugins.length === 1 && mk.plugins[0].name === SLUG && mk.plugins[0].source === "./plugin",
    () => `marketplace.json: ${brief(mk)}`);

  const presets = readPresets(), dirs = readdirSync(SKILLS_DIR).sort();
  expect(dirs.join() === presets.map((p) => p.slug).sort().join(), () => `skill folders ${dirs.join()} ≠ presets`);
  for (const p of presets) {
    const t = readFileSync(join(SKILLS_DIR, p.slug, "SKILL.md"), "utf8");
    const m = /^---\nname: (.*)\ndescription: (.*)\n---\n\n<!-- (.*?) -->\n\n([\s\S]*)$/.exec(t);
    let desc = null; try { desc = m && JSON.parse(m[2]); } catch { desc = null; }
    expect(m && m[1] === p.slug && desc === p.purpose && m[3].startsWith(GENERATED_MARK) && m[4] === p.body,
      () => `${p.slug}/SKILL.md: its front matter or body is not its preset's (${brief(m && [m[1], m[2]])})`);
  }

  const leaks = [], images = Object.keys(CODEX_ASSETS).map((p) => join(PLUGIN_DIR, p));
  for (const f of images) {
    const b = readFileSync(f);
    expect(pngSize(b) && b.length < MAX_ASSET_BYTES, () => `${f.slice(REPO.length + 1)}: not a PNG under ${MAX_ASSET_BYTES} bytes (${b.length})`);
  }
  for (const f of [...filesUnder(PLUGIN_DIR), join(REPO, ".claude-plugin", "marketplace.json")]) {
    if (images.includes(f)) continue;
    const t = readFileSync(f, "utf8");
    if (/authorization|bearer|"headers"|_KEY=|\b[0-9a-f]{32,}\b|\b[A-Za-z0-9_-]{40,}\b/i.test(t)) leaks.push(f.slice(REPO.length + 1));
  }
  expect(leaks.length === 0, () => `a secret-shaped string in ${leaks.join(", ")}`);

  const served = new Set(await toolsList(ownerKey));
  const fill = presets.find((p) => p.slug === "fill-a-project");
  expect(fill && fill.calls.length && fill.calls.every((c) => served.has(c)), () => `fill-a-project calls ${fill && fill.calls.join()}; the door serves ${[...served].length} tools`);
});
