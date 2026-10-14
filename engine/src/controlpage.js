// src/controlpage.js — Control, the screen: Members · Projects · Connect (sprint 2, "Control, simple": docs/plan/LOOK.md, the
// owner's MCQ of 2026-09-30 evening — user management simple like Devin or Claude Enterprise; Control shows how to connect).
// The read is src/controlread.js readControl; the doors are POST /control (src/admin.js). Owner rulings kept: QB963C7EE
// amended by F6 (a non-admin sees each admin control DISABLED with its reason, and the door refuses the same call
// independently) · QC5F82B90 (admin functions, not extra tabs: every seated reader opens Control) · Q8EFBCCF8 / QD46CF220 (one
// key per person, handed over by the admin, rotated by its holder) · Q76EFC99D (never zero admins) · Q93B3F368 (project).
//
// PURE: renderControl(read, { flash, brand, origin, engine }) draws exactly what readControl answered, inside the shell. It
// reads no D1 and types no person, project, org or worker: every name on glass is off the read (the MCP URL off the request's
// own origin). Regions, in order: nav (Members · Projects · Connect, the audit trail, the rulings in force) · people (ONE
// table: avatar, name, title, role, hats (the admin-set access hats solid, their own picks outlined: migrate-045), projects,
// last filed, a quiet "⋯" menu per row with the access hats; Invite with them) · workspaces (the projects:
// archive, activate, add) · connect (the org's MCP URL, then Claude: claude.ai and the Claude app (Add to Claude) and ChatGPT
// (Add to ChatGPT and its steps), both open, then the Claude Code plugin, Claude Code with a key and Codex, each with its copyable
// block; Versions and Grading on glass) · keys (your own key and devices) · this-org (the Admin
// disclosure: the org, its worker, its deploy, and the tools only an admin runs). Every admin control is a form on POST
// /control carrying data-door="POST /control" and data-action; it is enabled exactly when the read lets this reader act, and
// otherwise DISABLED (its own `disabled`) with aria-describedby naming a <p> that holds the reason (F6). The Invite and
// add-a-project inputs are the admin's declared exception (data-input-exception="admin"); the filter is a read
// (data-input-exception="search").

import { esc, unreachableState, callLine, dateOnly } from "./ui.js";
import { card, tile, tileRow, avatar, line, lines, lineDetail, group, empty, pageHead, cols, stack, sparkline, dayOf, bar, num } from "./parts.js";
import { CONTROL_REASON, CONTROL_VERB, READ_ONLY_REASON, EMPTY_ALONE, EMPTY_NOSEAT, EMPTY_NOPROJECT, NO_SEAT_ROW } from "./controlread.js";
// copy: off-screen (a title)
const ADMIN_HOLDS = "An admin holds every active project of the org; a seat names a project for a member or a partner.";
import { HATS, hatOf, ROLE_WORDS } from "./hats.js";
import { agoOf } from "./home.js";
import { orgPath } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { projectSlug } from "./project.js";   // sprint 12: a project reads as its name, else its slug, never the org-prefixed key
import { CLAUDE_ADD, CHATGPT_ADD, connectorName, clientMark, codexLine, CLIENT_MARK_CSS } from "./connectcards.js";   // sprint 21, 21.P E22: the two apps lead, beside their logos
import { LIMIT_ORDER, LIMIT_WORDS } from "./plans.js";   // sprint 8, 8.4: the plan and its usage (the read rides opts.plan)

export const CONTROL_REGIONS = ["nav", "people", "workspaces", "connect", "keys", "this-org"];
// sprint 8, 8.4: the plan's six limits on glass, in the order the plan shows them (src/plans.js LIMIT_ORDER); a limit's words ride
// its tile's title (src/plans.js LIMIT_WORDS: the refusal's own words)
// copy: label (each limit's tile)
export const PLAN_LABELS = { people: "People", projects: "Projects", items_month: "Items this month", calls_day: "Calls today", burst_minute: "Calls this minute", storage_bytes: "Stored" };
// sizeOf(bytes) -> "512 B", "1.6 MB", "1 GB" (binary units: 1 GB is 2^30 bytes, the plan's own convention, migrate-075)
export function sizeOf(bytes) {
  const v = Math.max(0, Number(bytes) || 0);
  if (v < 1024) return `${v} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = v / 1024, i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${Math.round(x * 10) / 10} ${units[i]}`;
}
// planCard(plan) -> the admin's Plan card (src/plans.js planShownOf's answer): a tile per limit, its usage of the limit with a bar;
// past 80% the tile and its bar wear the warning tone, at the limit the error tone (parts.js tile and bar, nothing new). No sentence
// on the card (the copy law: no explanation on a screen; sprint 8's review C4): how a limit is raised is said where a person meets
// it, in the refusal and the warning (src/plans.js RAISE). No plan read: no card (the page stands without it).
export function planCard(plan) {
  if (!plan) return "";
  const name = plan.plan ? plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1) : "";
  const chip = name ? `<span class="p-chip" data-plan="${esc(plan.plan)}" title="The plan whose limits apply to this org">${esc(name)}</span>` : "";
  if (!plan.limits) return card({ label: "Plan", region: "plan", id: "ct-plan", flush: true, action: chip, body: empty("Not read") });
  const st = plan.storage || {};
  const tiles = LIMIT_ORDER.filter((k) => plan.limits[k]).map((k) => {
    const l = plan.limits[k], bytes = k === "storage_bytes";
    const tone = l.state === "limit" ? "bad" : l.state === "warn" ? "warn" : "";
    const label = PLAN_LABELS[k] || k;
    return tile({ label, key: `plan-${k}`, value: bytes ? sizeOf(l.used) : num(l.used), unit: `of ${bytes ? sizeOf(l.allowed) : num(l.allowed)}`, tone,
      title: `${LIMIT_WORDS[k] || label}: ${l.state === "limit" ? "at the limit, a write that adds is refused" : l.state === "warn" ? "past 80% of the limit" : "within the limit"}`,
      sub: bytes ? `files ${sizeOf(st.files)} · pictures ${sizeOf(st.pictures)}` : "",
      chart: bar({ value: l.used, max: l.allowed, label, tone, width: 64 }), attrs: `data-state="${esc(l.state)}"` });
  });
  const rows = [tiles.slice(0, 3), tiles.slice(3)].filter((r) => r.length)
    .map((r) => `<div class="p-tiles-grid" style="--n:${r.length}"${r.length % 2 ? " data-odd" : ""}>${r.join("")}</div>`).join("");
  return card({ label: "Plan", region: "plan", id: "ct-plan", flush: true, action: chip, body: rows });
}

const DOOR = "POST /control";

const noDash = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ");
const txt = (s) => esc(noDash(s));
const known = (v) => v != null && Number.isFinite(Number(v));
const shown = (v) => (known(v) ? String(Number(v)) : "?");   // UNREACHABLE: never a guessed zero
const plural = (n, one, many) => `${shown(n)} ${Number(n) === 1 ? one : many}`;

// the page's own layout, on the semantic tokens only (the parts come from ui.js; shell.js styles them once)
const CT_CSS = `<style>
.ct{display:block;color:var(--text)}
.ct-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 20px;margin:0 0 16px}
.ct-tabs{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:9px;background:var(--well)}
.ct-tab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:7px;font:500 13px/1 var(--sans);color:var(--text-muted);text-decoration:none}
.ct-tab:hover{color:var(--text)}
.ct-tab[aria-current="true"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line-strong)}
.ct-nav-links{display:flex;gap:16px;align-items:center}
.ct .p-card{scroll-margin-top:16px}
.ct-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ct-tools form{margin:0}
.ct-find{height:28px;width:180px;padding:0 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);font:400 13px/1 var(--sans);color:var(--text)}
.ct-why{margin:0;padding:8px 16px;border-top:1px solid var(--line);font:400 12.5px/1.5 var(--sans);color:var(--text-muted)}
.ct-why-row{margin:8px 0 0;font:400 12px/1.45 var(--sans);color:var(--text-muted)}
.ct-meta{margin:0 0 8px;font:400 12.5px/1.5 var(--sans);color:var(--text-faint)}
.ct-you{font:500 11.5px/1 var(--sans);color:var(--text-faint)}
.ct-faint{color:var(--text-faint)}
.ct-muted{color:var(--text-muted)}
.ct .p-line-sub{display:flex;gap:10px;align-items:baseline}
.ct-role{font:500 12px/1 var(--sans);color:var(--text-muted)}
.ct-role[data-role="admin"]{font-weight:700;color:var(--text)}
.ct-role[data-role="partner"]{display:inline-flex;align-items:center;height:20px;padding:0 8px;border:1px solid var(--line-strong);border-radius:999px;color:var(--text)}
.ct-hats{display:inline-flex;flex-wrap:wrap;gap:4px}
.ct-hat{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;background:var(--well);color:var(--text-muted);font:500 11.5px/1 var(--sans)}
.ct-hat.own{background:transparent;box-shadow:inset 0 0 0 1px var(--line);color:var(--text-faint)}
.ct-access-hats{margin:0 0 8px}
.ct-proj{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-faint)}
.ct li[data-off] .p-line{opacity:.55}
.ct-key{font:400 11.5px/1 var(--mono);color:var(--text-faint)}
.ct-more{position:relative;display:inline-block}
.ct-more>summary{list-style:none;display:inline-grid;place-items:center;width:28px;height:26px;border-radius:7px;color:var(--text-faint);cursor:pointer;font:700 15px/1 var(--sans);letter-spacing:.06em}
.ct-more>summary::-webkit-details-marker{display:none}
.ct-more>summary:hover,.ct-more[open]>summary{background:var(--hover);color:var(--text)}
.ct-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:30;width:292px;padding:12px;background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;box-shadow:var(--shadow-pop);white-space:normal;text-align:left}
.u-motion .ct-more[open] .ct-menu,.u-motion .ct-pop[open]>.ct-pop-panel{animation:u-pop-in 140ms var(--ease) backwards}
.ct-menu-who{display:flex;flex-direction:column;gap:2px;margin:0 0 10px;padding:0 0 10px;border-bottom:1px solid var(--line);font:400 12px/1.4 var(--mono);color:var(--text-faint);overflow-wrap:anywhere}
.ct-menu-who b{font:600 13.5px/1.35 var(--sans);color:var(--text)}
.ct-menu-h{margin:10px 0 6px;font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-faint)}
.ct-menu form{margin:0}
.ct-seg{display:inline-flex;padding:2px;gap:2px;border:1px solid var(--line);border-radius:9px;background:var(--well)}
.ct-seg button,.ct-seg span{height:26px;padding:0 10px;border:0;border-radius:7px;background:transparent;font:600 12.5px/26px var(--sans);color:var(--text-muted);cursor:pointer}
.ct-seg button:hover:not(:disabled){background:var(--hover);color:var(--text)}
.ct-seg span[aria-current]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line-strong);cursor:default}
.ct-seg button:disabled{opacity:.45;cursor:not-allowed}
.ct-seg form{display:inline}
.ct-seats{list-style:none;margin:0;padding:0}
.ct-seats li{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;font-size:13px}
.ct-grant{display:flex;gap:6px;margin-top:6px}
.ct-grant select{flex:1;min-width:0;height:28px;border:1px solid var(--line-strong);border-radius:7px;background:var(--page);font:500 12.5px var(--sans);color:var(--text);padding:0 6px}
.ct-access{display:flex;flex-wrap:wrap;gap:6px}
.ct .u-btn.ct-danger{color:var(--err)}
.ct .u-btn.ct-danger:disabled{color:var(--text-muted)}
.ct-pop{position:relative}
.ct-pop>summary{list-style:none}
.ct-pop>summary::-webkit-details-marker{display:none}
.ct-pop-panel{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:min(380px,calc(100vw - 32px));padding:16px;background:var(--surface);border:1px solid var(--line-strong);border-radius:12px;box-shadow:var(--shadow-pop)}
.ct-pop-panel h3{margin:0 0 12px;font:700 14px/1.3 var(--sans)}
.ct-field{display:grid;gap:5px;margin:0 0 12px;font:500 12.5px/1.3 var(--sans);color:var(--text-muted)}
.ct-field input[type="text"],.ct-field input[type="email"]{height:34px;padding:0 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--page);font:400 14px/1 var(--sans);color:var(--text)}
.ct-choices{display:flex;flex-wrap:wrap;gap:6px}
.ct-choice{position:relative;display:inline-flex}
.ct-choice input{position:absolute;opacity:0;pointer-events:none}
.ct-choice span{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border:1px solid var(--line);border-radius:999px;font:500 12.5px/1 var(--sans);color:var(--text-muted);cursor:pointer}
.ct-choice input:checked+span{background:var(--well);border-color:var(--line-strong);color:var(--text)}
.ct-choice input[type="checkbox"]:checked+span::before{content:"";width:8px;height:4px;margin:-3px 1px 0 0;border-left:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(-45deg)}
.ct-choice input:focus-visible+span{outline:2px solid var(--focus);outline-offset:2px}
.ct-flash{display:grid;gap:8px;margin:0 0 16px;max-width:760px;padding:14px 16px;border:1px solid var(--line-strong);border-radius:12px;background:var(--surface)}
.ct-flash .flash-value{margin:0;font:500 13px/1.55 var(--mono);color:var(--text);overflow-wrap:anywhere}
.ct-flash b{display:block;font:700 14px/1.35 var(--sans)}
.ct-flash-plain{margin:0 0 16px}
.ct-flash-plain .flash-value{display:inline-block;margin:0;padding:8px 12px;border-radius:8px;background:var(--ok-tint);font:500 13px/1.5 var(--sans);color:var(--text)}
.ct-url .u-call{margin:0}
.ct-clients{border-top:1px solid var(--line)}
.ct-clients .p-ld-facts{grid-template-columns:minmax(0,1fr)}
.ct-clients .u-call{margin:4px 0 0}
${CLIENT_MARK_CSS}
.ct-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0}
.ct-mcp{white-space:normal;overflow-wrap:normal;word-break:normal}
.ct-url .u-call code{overflow-wrap:normal}
.ct-steps{margin:2px 0 0;padding:0 0 0 18px;font:500 13px/1.6 var(--sans);color:var(--text)}
.ct-steps li::marker{font:500 11.5px var(--mono);color:var(--text-faint)}
.ct .p-facts{border-radius:10px}
.ct [data-region="measures"] .p-tiles-grid+.p-tiles-grid,.ct [data-region="plan"] .p-tiles-grid+.p-tiles-grid{border-top:1px solid var(--line)}
@media (max-width:640px){.ct-find{width:100%}.ct-tools{width:100%}.ct-menu{right:0;left:auto;width:min(292px,calc(100vw - 32px))}
  .ct-pop-panel{position:fixed;left:16px;right:16px;top:auto;bottom:16px;width:auto;max-height:calc(100vh - 96px);overflow:auto;z-index:45}
  .ct .p-line-meta .ct-hats{display:none}.ct-proj{max-width:none}.ct-tabs{flex-wrap:wrap}
  .ct [data-region="plan"] .p-tile-chart{display:none}}
</style>`;

// the page's small script: the Members filter (a read of the rows on the page), and one open menu at a time
const CT_JS = `<script>(function(){var q=document.getElementById('ct-find');if(q){q.addEventListener('input',function(){var v=q.value.trim().toLowerCase();
document.querySelectorAll('.ct li[data-person]').forEach(function(r){r.hidden=!!v&&r.textContent.toLowerCase().indexOf(v)<0;});});}
document.addEventListener('toggle',function(e){var d=e.target;if(!d.open||!d.matches||!d.matches('.ct-more,.ct-pop'))return;document.querySelectorAll('.ct-more[open],.ct-pop[open]').forEach(function(o){if(o!==d)o.open=false;});},true);
document.addEventListener('click',function(e){if(e.target.closest('.ct-more,.ct-pop'))return;document.querySelectorAll('.ct-more[open],.ct-pop[open]').forEach(function(o){o.open=false;});});})();</script>`;

const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value ?? "")}">`;
// one admin control: a submit button on POST /control, enabled exactly when `on`, else disabled with its reason (F6)
function control(button, action, label, on, whyId, cls = "u-btn small", extra = "") {
  const off = on ? "" : ` disabled aria-describedby="${esc(whyId)}"`;
  return `<button type="submit" class="${cls}" data-button="${button}" data-door="${DOOR}" data-action="${action}"${extra}${off}>${label}</button>`;
}
const form = (action, fields, body, confirmText) =>
  `<form method="POST" action="${orgPath(`/control`)}"${confirmText ? ` onsubmit="return confirm('${esc(confirmText)}')"` : ""}>${hidden("action", action)}${fields}${body}</form>`;

// connectBlocks(origin, org) -> the per-client setup as lines, each opening to the VALUES a person copies (sprint 3, L3: the
// step sentences went to Docs; what is left is the command, the URL, the config). sprint 21, 21.P E22 (the owner's MCQ of
// 2026-10-14): the two apps lead, OPEN — Claude (claude.ai and the Claude app: a custom connector over OAuth, src/oauth.js, the
// org's own sign-in; Add to Claude, the install link prefilled) and ChatGPT (Add to ChatGPT, its plugins page, and its steps) —
// each beside its own logo (src/connectcards.js clientMark, the cards the done page and the first Home show); then the Claude
// Code plugin (sprint 9, 9.2: the plugin/ at the repo root, its install id plugin.json's name @ the repo's marketplace.json
// name: the two commands, a sign-in on connect, no key; it carries its own server, plugin/.mcp.json, so the row names no
// address, and it always reaches the HOSTED platform, which the row says, "Connects to"; the smoke, s6 C1, reads the install id
// from the repo's files and fails on drift), Claude Code with a key (any install: the one row with a key, src/docs.js
// connectSnippet's flags) and Codex (its one command, then its sign-in on sharingu's page: tools/client-drive/connect.sh runs
// both). sprint 10, 10.1: the engine's repo is private (the proprietary ruling, 2026-10-09), so the add line names the
// plugin's public distribution repo, ryuk-labs/sharingu-plugin (this tree's plugin/ mirrored there: make-plugin-skills.mjs --sync).
// FIRST_CALLS — the first-run guide's calls, in order (the initialize instructions' five steps: the fifth names the three write
// tools, each filing its own operation of a preview, sprint 19), each row's "Starts with"
export const FIRST_CALLS = ["whoami", "missing", "formats", "preview", "file_contribution", "save_knowledge", "remove_knowledge"];
const PLUGIN_MARKET = "ryuk-labs/sharingu-plugin", PLUGIN_ID = "sharingu@sharingu";
// copy: label (the ChatGPT row's steps, in the order its plugins page asks them)
const CHATGPT_STEPS = ["Add custom MCP server", "Paste the MCP URL"];
// addrHtml(url) -> the address escaped, breakable ONLY at its natural points (sprint 11's find: the Admin card broke it mid-word,
// "…:893 / 0/mcp"): after the scheme's "//", before each "." and ":" of the host and before each "/" of the path. A <wbr> adds
// no text, so a copy reads the address exactly.
export function addrHtml(url) {
  const u = String(url || ""), at = u.indexOf("//");
  const head = at >= 0 ? u.slice(0, at + 2) : "", rest = at >= 0 ? u.slice(at + 2) : u;
  return esc(head) + (head ? "<wbr>" : "") + rest.split(/(?=[.:/])/).map(esc).join("<wbr>");
}
// addrLine(url) -> callLine's copyable line for an address, its text breakable only at addrHtml's points
const addrLine = (url) => callLine(url).replace(/<code>[\s\S]*?<\/code>/, () => `<code>${addrHtml(url)}</code>`);
const away = (href, button, label, what) => `<a class="u-btn small" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-button="${button}" data-client="opens ${what}, in a new tab">${label}</a>`;
function connectBlocks(origin, org) {
  const mcp = `${origin}/mcp`;
  const name = connectorName(org);
  // D5: the first calls are the door's first-run guide (src/mcp.js instructionsFor), in its order
  const first = ["Starts with", FIRST_CALLS.map((t) => `<code>${t}</code>`).join(" · ")];
  const blocks = [
    { key: "claude-connector", mark: "claude", open: true, title: "Claude", sub: "claude.ai and the Claude app", facts: [["Add", away(CLAUDE_ADD(mcp, name), "add-to-claude", "Add to Claude", "Claude's Add custom connector dialog, prefilled")],
      ["Connector URL", callLine(mcp)], ["Sign in", `${txt(org)}: email and passphrase`], first] },
    { key: "chatgpt", mark: "chatgpt", open: true, title: "ChatGPT", sub: "The ChatGPT app", facts: [["Add", away(CHATGPT_ADD, "add-to-chatgpt", "Add to ChatGPT", "ChatGPT's plugins page")],
      ["Steps", `<ol class="ct-steps">${[...CHATGPT_STEPS, `Sign in to ${noDash(org)}`].map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`], ["MCP URL", callLine(mcp)], first] },
    { key: "claude-plugin", mark: "terminal", title: "Claude Code", sub: "The plugin", facts: [["Add", callLine(`claude plugin marketplace add ${PLUGIN_MARKET}`)], ["Install", callLine(`claude plugin install ${PLUGIN_ID}`)],
      ["From", "The plugin's public distribution repo"], ["Connects to", "The hosted platform only"], ["Sign in", "On connect, no key to paste"], first] },
    { key: "claude-code", mark: "terminal", title: "Claude Code", sub: "With a key · any install", facts: [["Command", callLine(`claude mcp add ${name} --transport http ${mcp} --header "Authorization: Bearer <your-key>"`)], first, ["Skills", callLine(`curl -fsSL ${origin}/install | sh`)]] },
    { key: "codex", mark: "terminal", title: "Codex", sub: "One command", facts: [["Command", callLine(codexLine(mcp, name))], ["Sign in", callLine(`codex mcp login ${name}`)], first] },
  ];
  return lines(blocks.map((b) => line({ attrs: `data-client-block="${b.key}"`, lead: clientMark(b.mark, 28), title: b.title, sub: esc(b.sub), open: !!b.open,
    rowAttrs: `data-button="connect-client" data-client="opens ${esc(b.title)}'s setup"`, detail: lineDetail({ facts: b.facts }) })));
}

// renderControl(read, { flash, brand, origin, engine }) -> the Control content (the route wraps it in shell()). Pure.
// sprint 3, L3 (the revision, docs/plan/LOOK.md): the head, the four sections as one segmented nav (Members · Projects ·
// Connect · Admin, in-page), the glance (people, admins, partners, projects), then a card per section. EVERY form, its fields,
// its door, its confirm and its enabled/disabled rule are the ones the page had (control(), form(), the menu, Invite, Add a
// project, clean-eval): only the frame around them changed (the u-table became lines; the explaining sentences went to titles
// or to Docs; the Versions and Grading explainers left Control for Docs). The flash keeps ct-flash / ct-flash-plain and
// flash-value (the suites read the one-time key and the answers off them).
// G2 item 9: the newest backup run (src/backup.js lastBackup), for the admin: its time and its result, the failure's reason on hover
function backupFact(b) {
  if (!b) return `<span class="ct-backup" data-backup="none">None recorded</span>`;
  if (b.unread) return `<span class="ct-backup" data-backup="unread">Not read</span>`;
  const at = esc(String(b.at || "").slice(0, 16).replace("T", " "));
  return b.ok ? `<span class="ct-backup" data-backup="ok">${at} · complete</span>`
    : `<span class="ct-backup" data-backup="failed" title="${esc(b.error || "incomplete")}">${at} · failed</span>`;
}
export function renderControl(r, opts = {}) {
  const read = r || {};
  const down = read.live === "unreachable";
  const reader = read.reader || {};
  const admin = !!reader.admin;
  const people = Array.isArray(read.people) ? read.people : [];
  const workspaces = Array.isArray(read.workspaces) ? read.workspaces : [];
  const archived = Array.isArray(read.archived) ? read.archived : [];
  const keys = Array.isArray(read.keys) ? read.keys : [];
  const org = read.org || {};
  const orgName = org.name || (opts.brand && opts.brand.org) || "this org";
  const adminName = (read.admin && read.admin.name) || null;
  // the page's own verdict on the org-level controls (Invite, add or archive a project, clean-eval): the admin on a full
  // credential acts; the admin on the read-only credential and every non-admin see them disabled with the read's own reason
  const writes = admin && !reader.readOnly && !down;
  const pageWhy = admin ? READ_ONLY_REASON : CONTROL_REASON(CONTROL_VERB, adminName);
  // the refusal every disabled control names (aria-describedby="ct-why"): a reason a person must read, one quiet line
  const whyPage = writes ? "" : `<p class="ct-why" id="ct-why">${txt(down ? "Control could not be read in full, so nothing can be changed until it answers." : pageWhy)}</p>`;
  // a row's own reason, when it is not the page's (the admin's own row: remove refused; an archived row), rides in its menu
  let rowWhyN = 0;
  const whyOf = (reason) => {
    if (!reason || (!writes && (down || reason === pageWhy))) return { id: "ct-why", p: "" };
    const id = `ct-why-${++rowWhyN}`;
    return { id, p: `<p class="ct-why-row" id="${id}">${txt(reason)}</p>` };
  };
  const mine = people.find((p) => p.you) || null;
  const NONE = { role: false, access: false, remove: false, seat: false, reissue: false, reason: null };
  const canOf = (p) => (down ? NONE : p.can || NONE);
  const activeCount = people.filter((p) => p.active !== false).length;

  // ---- nav: Members · Projects · Connect · Admin (in-page), the audit trail and the rulings in force ----
  const navItem = (href, label, n, cur) => `<a class="ct-tab" href="${href}"${cur ? ' aria-current="true"' : ""} data-button="nav-section" data-client="jumps to ${esc(label)} on this page">${esc(label)}${n == null ? "" : ` <span class="p-count">${esc(n)}</span>`}</a>`;
  const nav = `<nav class="ct-nav" data-region="nav" aria-label="Control"><div class="ct-tabs" role="group" aria-label="Sections">${navItem("#ct-members", "Members", shown(down ? null : activeCount), true)}${navItem("#ct-projects", "Projects", shown(down ? null : workspaces.length))}${navItem("#ct-connect", "Connect")}${navItem("#ct-admin", "Admin")}</div>
    <span class="ct-nav-links"><a class="u-link" href="${orgPath(`/audit`)}" data-button="open-audit" data-door="GET /audit">Audit trail</a><a class="u-link" href="${orgPath(`/decisions?status=in-force`)}" data-button="open-rulings" data-door="GET /decisions">Rulings in force</a></span></nav>`;

  // ---- flash: the one-time secret, prominent and copyable; any other answer, one quiet line ----
  // sprint 12, 12.3: an invite link (src/admin.js INVITE_LINK_WORDS: its path and token) is shown whole, on this request's origin
  const invitePath = opts && opts.flash ? (/\/signup\?via=invite#[0-9a-f]{48}\b/.exec(String(opts.flash)) || [])[0] : null;
  const inviteLink = invitePath ? `${(opts && opts.origin) || ""}${invitePath}` : null;
  const secret = opts && opts.flash && !invitePath ? (/\b[0-9a-f]{40}\b/.exec(String(opts.flash)) || [])[0] : null;
  const flash = !opts || !opts.flash ? ""
    : inviteLink ? `<div class="ct-flash" role="status" data-flash="invite-link" title="Copy this link now: it is shown once, here, and never again. It works once, for this person&#39;s email only. Send it to them yourself."><b>Invite link, shown once</b><p class="flash-value">${txt(String(opts.flash).replace(invitePath, inviteLink))}</p>${callLine(inviteLink)}</div>`
    : secret ? `<div class="ct-flash" role="status" title="Copy this key now: it is shown once, here, and never again. It is their passphrase on the web and their AI's bearer key at once. Hand it over yourself; they can rotate it on their profile."><b>New key, shown once</b><p class="flash-value">${txt(opts.flash)}</p>${callLine(secret)}</div>`
    : `<div class="ct-flash-plain" role="status"><p class="flash-value">${txt(opts.flash)}</p></div>`;

  // ---- the glance ----
  const roleOf = (p) => p.role || (p.admin ? "admin" : "member");
  const st = read.stamp || {};
  const glance = tileRow([
    tile({ label: "People", value: down ? null : st.people != null ? st.people : activeCount, key: "people" }),
    tile({ label: "Admins", value: down ? null : people.filter((p) => p.active !== false && roleOf(p) === "admin").length, key: "admins" }),
    tile({ label: "Partners", value: down ? null : people.filter((p) => p.active !== false && roleOf(p) === "partner").length, key: "partners" }),
    tile({ label: "Projects", value: down ? null : st.projects != null ? st.projects : workspaces.length, key: "projects" }),
  ], { region: "glance", label: "This org" });

  // ---- people: one line each, a quiet "⋯" menu per line ----
  const projOpts = workspaces;
  const personLine = (p) => {
    const can = canOf(p);
    const w = whyOf(can.reason);
    const why = (on) => (on ? "" : w.id);
    const seats = Array.isArray(p.seats) ? p.seats : [];
    const held = new Set(seats.map((s) => s.project));
    const off = p.active === false;
    const role = roleOf(p);
    // the menu: the person, their role (the other two as buttons), their seats, their key, remove
    const roleSeg = `<div class="ct-seg" role="group" aria-label="Role">${["admin", "member", "partner"].map((k) => k === role
      ? `<span aria-current="true">${ROLE_WORDS[k]}</span>`
      : form("set-role", hidden("personId", p.id) + hidden("role", k), control("role-picker", "set-role", ROLE_WORDS[k], !!can.role, why(!!can.role), "", ` aria-label="Make ${esc(p.name)} ${ROLE_WORDS[k].toLowerCase()}"`))).join("")}</div>`;
    const seatList = seats.length
      ? `<ul class="ct-seats">${seats.map((s) => `<li data-project="${esc(s.project)}"><span>${txt(s.name || projectSlug(s.project))}</span>${form("revoke-seat", hidden("personId", p.id) + hidden("projectKey", s.project),
          control("seat", "revoke-seat", "Remove", !!can.seat, why(!!can.seat), "u-btn small ghost", ` aria-label="Remove ${esc(p.name)}'s seat on ${esc(s.name || projectSlug(s.project))}"`))}</li>`).join("")}</ul>`
      : role === "admin" ? `<p class="ct-meta"><span class="p-chip" title="${esc(ADMIN_HOLDS)}">Every project</span></p>` : `<p class="ct-meta">${esc(NO_SEAT_ROW)}</p>`;
    const missing = projOpts.filter((x) => !held.has(x.key));
    const grantOn = !!can.seat && missing.length > 0;
    const grant = missing.length || !can.seat
      ? form("grant-seat", hidden("personId", p.id), `<div class="ct-grant">${missing.length ? `<select name="projectKey" aria-label="Project to seat ${esc(p.name)} on"${grantOn ? "" : " disabled"}>${missing.map((x) => `<option value="${esc(x.key)}">${txt(x.name || projectSlug(x.key))}</option>`).join("")}</select>` : ""}${control("seat", "grant-seat", "Seat", grantOn, why(grantOn), "u-btn small")}</div>`)
      : "";
    const reset = form("rotate-key", hidden("personId", p.id), control("reissue-key", "rotate-key", "Reset passphrase", !!can.reissue, why(!!can.reissue), "u-btn small"),
      can.reissue ? `Reset ${noDash(p.name)}'s passphrase? A new key is shown once, here, and their open sessions are signed out.` : "");   // copy: confirm
    // sprint 12, 12.3: a new one-time invite link for this seat (any older one ends); shown once in the flash
    const relink = form("invite-link", hidden("personId", p.id), control("invite-link", "invite-link", "New invite link", !!can.reissue, why(!!can.reissue), "u-btn small",
      ' title="A one-time link for their email: they choose their own passphrase and land here signed in. Any older link of theirs stops working."'));
    const remove = form("remove-person", hidden("personId", p.id), control("remove", "remove-person", "Remove from org", !!can.remove, why(!!can.remove), "u-btn small ghost ct-danger"),
      can.remove ? `Remove ${noDash(p.name)}? This archives them: their history stays, but they can no longer sign in.` : "");   // copy: confirm
    // migrate-045: the access hats (what they may read by), the admin's to set; the whole list is sent (no box ticked: none).
    // The read carries them on the admin's read and your own row only; anyone else sees the control disabled with its reason.
    const givenHats = Array.isArray(p.access) ? new Set(p.access) : null;
    const accessForm = form("set-access-hats", hidden("personId", p.id), (givenHats
      ? `<div class="ct-choices ct-access-hats" role="group" aria-label="Access hats for ${esc(p.name)}">${HATS.map((h) =>
          `<label class="ct-choice" title="${esc(h.line)}"><input type="checkbox" name="accessHat" value="${esc(h.key)}"${givenHats.has(h.key) ? " checked" : ""}${can.access ? "" : " disabled"}><span>${esc(h.label)}</span></label>`).join("")}</div>`
      : `<p class="ct-meta"><span class="p-chip" title="Only an admin sees and sets access hats">Admin only</span></p>`)
      + control("access-hats", "set-access-hats", "Save access", !!can.access, why(!!can.access), "u-btn small", ` aria-label="Save ${esc(p.name)}'s access hats"`));
    const whoLine = [p.email ? `<span>${esc(p.email)}</span>` : "", p.label ? `<span>was ${esc(p.label)}</span>` : "", p.consent && p.consent !== "off" ? `<span>consent ${esc(p.consent)}</span>` : ""].join("");
    const menu = `<details class="ct-more" data-button="row-menu" data-client="opens the actions for this person"><summary aria-label="Actions for ${esc(p.name)}" title="Actions">&#8943;</summary>
      <div class="ct-menu"><p class="ct-menu-who"><b>${txt(p.name)}</b>${whoLine}</p>
      <p class="ct-menu-h">Role</p>${roleSeg}
      <p class="ct-menu-h" title="A doc or card opened to a hat opens to the people given it here. Their own hats only shape their Home.">Access hats</p>${accessForm}
      <p class="ct-menu-h">Projects</p>${seatList}${grant}
      <p class="ct-menu-h">Access</p><div class="ct-access">${relink}${reset}${remove}</div>${w.p}</div></details>`;
    const av = p.avatar || { initials: "?", tone: "stone" };
    // the hats: the access hats solid (what they may read by), then the hats they picked for themselves quietly (their Home)
    const accessHats = (p.access || []).map((h) => hatOf(h)).filter(Boolean);
    const ownHats = (p.hats || []).filter((h) => !(p.access || []).includes(h)).map((h) => hatOf(h)).filter(Boolean);
    const hatChips = [...accessHats.map((h) => `<span class="ct-hat" data-hat="access" title="Access: ${esc(h.line)}">${esc(h.label)}</span>`),
      ...ownHats.map((h) => `<span class="ct-hat own" data-hat="own" title="Their own pick: it shapes their Home">${esc(h.label)}</span>`)];
    const seatNames = seats.map((s) => noDash(s.name || projectSlug(s.project)));
    // D2b: an admin holds every active project (the owner read "No project yet" with five)
    const projects = role === "admin" ? `<span class="ct-proj" data-holds="all" title="${esc(ADMIN_HOLDS)}">Every project</span>`
      : seatNames.length ? `<span class="ct-proj" title="${esc(seatNames.join(", "))}">${seats.map((s) => `<span data-project="${esc(s.project)}">${txt(s.name || projectSlug(s.project))}</span>`).join(", ")}</span>` : `<span class="ct-faint">${esc(NO_SEAT_ROW)}</span>`;
    const last = admin ? (p.lastFiled ? `<span title="${esc(dateOnly(p.lastFiled))}">${esc(agoOf(p.lastFiled, opts.nowMs) || dateOnly(p.lastFiled))}</span>` : `<span class="ct-faint" title="Never filed">–</span>`) : "";
    return line({ attrs: `data-person="${esc(p.id)}" data-role="${esc(role)}"${off ? ' data-off="1"' : ""}`, lead: avatar({ initials: av.initials, tone: av.tone, name: p.name, size: 24 }),
      titleHtml: `${txt(p.name)}${p.you ? ` <span class="ct-you">you</span>` : ""}${off ? ` <span class="p-chip">Removed</span>` : ""}`, title: noDash(p.name),
      sub: `${p.title ? `<span class="ct-muted">${txt(p.title)}</span>` : ""}${projects}`,
      meta: `<span class="ct-role" data-role="${esc(role)}">${esc(ROLE_WORDS[role] || role)}</span>${hatChips.length ? `<span class="ct-hats">${hatChips.join("")}</span>` : ""}${last}`, action: menu });
  };
  const alone = admin && !down && people.length > 0 && people.every((p) => p.you);
  const noSeat = !admin && !down && (!mine || !(mine.seats || []).length);
  const peopleBody = (people.length ? lines(people.map(personLine), { attrs: 'data-list="people"' }) : down ? empty("Not read") : "")
    + (alone ? empty(EMPTY_ALONE) : "") + (noSeat ? empty(EMPTY_NOSEAT) : "");
  // Invite: one button; its form is the admin's (name, email, role, seats), the same add-person underneath
  const invite = writes
    ? `<details class="ct-pop" data-button="invite" data-client="opens the Invite form"><summary class="u-btn primary small">Invite</summary><div class="ct-pop-panel">${form("add-person", "",
      `<h3>Invite a person</h3>
      <label class="ct-field">Name<input type="text" name="name" data-input-exception="admin" autocomplete="off" maxlength="80" required></label>
      <label class="ct-field">Email<input type="email" name="email" data-input-exception="admin" autocomplete="off" maxlength="120" required></label>
      <div class="ct-field">Role<div class="ct-choices" role="radiogroup" aria-label="Role">${[["member", "Member", "everything in their projects"], ["partner", "Partner", "only the projects they are seated on"]].map(([v, l, t], i) =>
        `<label class="ct-choice" title="${esc(t)}"><input type="radio" name="role" value="${v}"${i === 0 ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
      <div class="ct-field" title="What they may read: a doc or card opened to one of these hats">Access hats<div class="ct-choices" role="group" aria-label="Access hats">${HATS.map((h) =>
        `<label class="ct-choice" title="${esc(h.line)}"><input type="checkbox" name="accessHat" value="${esc(h.key)}"><span>${esc(h.label)}</span></label>`).join("")}</div></div>
      <div class="ct-field">Send them<div class="ct-choices" role="radiogroup" aria-label="Send them">${[["link", "An invite link", "One link for their email, shown once: they choose their own passphrase and land here signed in. Nobody else sees their secret."], ["key", "A key", "Their key, shown once here for you to hand over: their passphrase and their AI's key in one. For a script or an AI-only seat."]].map(([v, l, t], i) =>
        `<label class="ct-choice" title="${esc(t)}"><input type="radio" name="deliver" value="${v}"${i === 0 ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
      ${hidden("seatsChosen", "1")}${workspaces.length ? `<div class="ct-field">Projects<div class="ct-choices">${workspaces.map((x) => `<label class="ct-choice"><input type="checkbox" name="projectKey" value="${esc(x.key)}"${workspaces.length === 1 ? " checked" : ""}><span>${txt(x.name || projectSlug(x.key))}</span></label>`).join("")}</div></div>` : ""}
      ${control("provision-person-key", "add-person", "Invite", true, "ct-why", "u-btn primary", ' title="Their invite link (or their key) is shown once, here, for you to send them."')}`)}</div></details>`
    : form("add-person", "", control("provision-person-key", "add-person", "Invite", false, "ct-why", "u-btn primary small"));
  const showAll = admin ? `<a class="u-link" href="${read.all ? orgPath("/control") : orgPath("/control?all=1")}" data-button="show-all" data-door="GET /control">${read.all ? "Hide removed" : "Show all"}</a>` : "";
  const find = people.length > 8 ? `<input type="search" id="ct-find" class="ct-find" data-input-exception="search" placeholder="Filter people" aria-label="Filter people">` : "";
  const peopleSec = card({ label: "Members", count: shown(down ? null : activeCount), flush: true, region: "people", id: "ct-members", action: `<span class="ct-tools">${find}${showAll}${invite}</span>`,
    body: `${whyPage}${peopleBody}` });

  // ---- workspaces: the projects, archive and activate, add ----
  const projLine = (x, isArchived) => {
    const act = isArchived
      ? form("activate-project", hidden("projectKey", x.key), control("activate-project", "activate-project", "Activate", writes, "ct-why", "u-btn small"))
      : form("archive-project", hidden("projectKey", x.key), control("archive-project", "archive-project", "Archive", writes, "ct-why", "u-btn small ghost"),
        writes ? `Archive ${noDash(x.name || projectSlug(x.key))}? Its seats go dormant with it; activate it to bring them back.` : "");   // copy: confirm
    return line({ attrs: `data-project="${esc(x.key)}"${isArchived ? ' data-state="archived"' : ""}`, lead: avatar({ name: x.name || projectSlug(x.key), size: 24 }), title: noDash(x.name || projectSlug(x.key)), sub: `<code class="ct-key">${esc(projectSlug(x.key))}</code>`,
      // L4: who holds it: its seats AND the admins, who hold every project without a seat (never a bare "0 seats" beside them)
      meta: `${isArchived ? `<span class="p-chip">Archived</span>` : ""}<span data-seats="${esc(x.seats || 0)}" title="${esc(ADMIN_HOLDS)}">${esc(x.seats ? `${plural(x.seats, "seat", "seats")} · admin` : "Admin only")}</span>`, action: act });
  };
  const wsList = workspaces.length || archived.length
    ? lines([...workspaces.map((x) => projLine(x, false)), ...archived.map((x) => projLine(x, true))], { attrs: 'data-list="projects"' })
    : down ? empty("Not read") : empty(admin ? EMPTY_NOPROJECT : EMPTY_NOSEAT);
  const addProject = writes
    ? `<details class="ct-pop" data-button="add-project" data-client="opens the add-a-project form"><summary class="u-btn small">Add a project</summary><div class="ct-pop-panel">${form("add-project", "",
      `<h3>Add a project</h3>
      <label class="ct-field">Key<input type="text" name="key" data-input-exception="admin" pattern="[a-z0-9-]{2,40}" maxlength="40" placeholder="a-z, 0-9, dashes" required></label>
      <label class="ct-field">Name<input type="text" name="name" data-input-exception="admin" maxlength="80" required></label>
      ${control("add-workspace", "add-project", "Add the project", true, "ct-why", "u-btn primary", ' title="A project costs nothing to add. Seat people on it from their row."')}`)}</div></details>`
    : form("add-project", "", control("add-workspace", "add-project", "Add a project", false, "ct-why", "u-btn small"));
  const wsSec = card({ label: "Projects", count: shown(down ? null : workspaces.length), flush: true, region: "workspaces", id: "ct-projects", action: addProject, body: wsList });

  // ---- connect: the MCP URL and each client's setup (values only), then your key and your devices ----
  const origin = String((opts && opts.origin) || "").replace(/\/+$/, "") || "https://<your-org>";
  const connectSec = card({ label: "Connect", flush: true, region: "connect", id: "ct-connect", attrs: `title="Your AI connects to ${esc(noDash(orgName))} through one MCP address. It reads what you may read, and everything it files lands here, attributed to you and graded."`,
    body: `<div class="p-card-pad ct-url">${addrLine(`${origin}/mcp`)}</div><div class="ct-clients">${connectBlocks(origin, orgName)}</div>` });
  const devOf = new Map(keys.map((k) => [k.person, Array.isArray(k.devices) ? k.devices : []]));
  const myDevs = mine ? devOf.get(mine.id) || [] : [];
  // L4: the head names the key alone; the sessions it signed in are its rows (a "74" beside "Your key" read as 74 keys)
  const keysSec = card({ label: "Your key", flush: true, region: "keys",
    attrs: `title="One secret: your key is your passphrase on the web and your AI's bearer key at once. It is never stored readable, so the only time anyone sees it is the moment it is made. ${admin ? "Reset someone else's from the ⋯ on their row." : "Only an admin resets someone else's."}"`,
    action: `<a class="u-btn small" href="${orgPath(`/profile`)}" data-button="rotate-own" data-door="GET /profile">Rotate</a>`,
    body: myDevs.length ? (() => { const dev = (d) => line({ title: noDash(d.device || "A device"), meta: `<span title="signed in">${esc(dateOnly(d.since))}</span>${d.expires ? `<span title="until">${esc(dateOnly(d.expires))}</span>` : ""}` });
      return lines(myDevs.slice(0, 4).map(dev), { compact: true }) + (myDevs.length > 4 ? group({ title: "More", count: myDevs.length - 4, body: lines(myDevs.slice(4).map(dev), { compact: true }) }) : ""); })()
      : empty(down ? "Not read" : "No session open") });

  // ---- this-org: Admin (the org, its worker and deploy; the tools only an admin runs) ----
  const dep = org.deploy && org.deploy.id ? [org.deploy.id, org.deploy.date, org.deploy.tag].filter(Boolean).map(esc).join(" · ") : "Not stamped";
  const active = Array.isArray(org.projects) ? org.projects : [];
  const nameOf = new Map(workspaces.map((x) => [x.key, x.name || projectSlug(x.key)]));
  const chips = admin
    ? `<div class="ct-chips">${active.map((k) => `<span class="p-chip" data-project="${esc(k)}">${txt(nameOf.get(k) || projectSlug(k))}</span>`).join("")}</div>`
    : mine && mine.role === "partner" ? `<div class="ct-chips"><span class="p-chip">${esc(plural(down ? null : workspaces.length, "project", "projects"))} seated</span></div>`   // review fix 2b: a Partner is never told the org's count
    : `<div class="ct-chips"><span class="p-chip">${esc(plural(down ? null : active.length, "project", "projects"))} active</span><span class="p-chip">${esc(shown(down ? null : workspaces.length))} seated</span></div>`;
  // D6a: the suites' clean-up is a tool for the suites' own view (?eval=1): on the org's page there is nothing of theirs to act on
  const clean = !read.eval ? "" : form("clean-eval", "", control("clean-eval", "clean-eval", "Clean the suites' residue", writes, "ct-why", "u-btn small", ' title="The suites mark every row they file. This removes exactly those rows: nothing unmarked, and never a grade."'),
    writes ? "Remove every row the suites marked as theirs? Nothing unmarked is touched, and no grade is ever removed." : "");   // copy: confirm
  // L4: the org's name and its MCP address, and the deploy; the worker's name is not the reader's
  // business (never a card in a card: the facts sit in the card's own body)
  const orgSec = card({ label: "Admin", region: "this-org", id: "ct-admin", action: clean,
    body: `${lineDetail({ facts: [["Org", txt(org.name || "unnamed")], ["Deploy", `<span class="ct-deploy">${dep}</span>`], ["MCP address", `<code class="ct-mcp">${addrHtml(`${origin}/mcp`)}</code>`],
      ...(opts.backup !== undefined ? [["Backup", backupFact(opts.backup)]] : [])] })}${chips}` });

  // ---- measures: the beta measures, the admin's alone (sprint 3 S3b, src/measures.js; the read rides opts.measures, the
  // route reads it for the admin only), each definition in its tile's title, the numbers exported as JSON ----
  const measuresSec = admin && !down && opts.measures && Array.isArray(opts.measures.measures) ? (() => {
    const m = Object.fromEntries(opts.measures.measures.map((x) => [x.key, x]));
    const v = (k) => (m[k] && m[k].value) || {};
    const t = (k, o) => tile({ label: (m[k] && m[k].label) || k, title: (m[k] && m[k].definition) || "", key: k, ...o });
    const day = (iso) => (iso ? dayOf(iso, opts.nowMs || Date.now()) : "");   // "Today", "Mon 28 Sep": a measure's day, not an age
    // "n of m" only when there is an m (LOOK: no "0 of something" that says nothing): an empty population draws "–"
    const ofTile = (k, n, of) => t(k, of ? { value: n ?? 0, unit: `of ${of}`, count: true } : { value: "" });
    const perWeek = v("repeat_handoffs").perWeek || [];
    const fu = v("first_useful");
    const tiles = [
      t("activated", { value: v("activated").yes ? "Yes" : "No", tone: v("activated").yes ? "ok" : "", sub: v("activated").yes ? day(v("activated").at) : "" }),
      t("first_handoff", { value: v("first_handoff").at ? day(v("first_handoff").at) : "", sub: v("first_handoff").project || "" }),
      t("repeat_handoffs", { value: v("repeat_handoffs").count ?? 0, count: true, chart: perWeek.some((x) => x > 0) ? sparkline(perWeek, { label: "Pick-ups a week, the last 8" }) : "" }),
      ofTile("cross_role", v("cross_role").goals, v("cross_role").of),
      ofTile("week1_return", v("week1_return").returned, v("week1_return").of),
      ofTile("week4_return", v("week4_return").returned, v("week4_return").of),
      t("first_useful", fu.medianDays == null ? { value: "" } : { value: fu.medianDays, unit: "days", sub: `${fu.people} of ${fu.of}` }),
    ];
    const exp = `<a class="u-btn small" href="${orgPath(`/control/measures?download=1`)}" download data-button="export-measures" data-door="GET /control/measures" title="The numbers with their definitions, as JSON">Export</a>`;
    return card({ label: "Measures", region: "measures", id: "ct-measures", flush: true, action: exp,
      // D6a: seven tiles as a row of four and a row of three, each row full (never an empty cell beside the last)
      body: `<div class="p-tiles-grid" style="--n:4">${tiles.slice(0, 4).join("")}</div><div class="p-tiles-grid" style="--n:${tiles.length - 4}"${(tiles.length - 4) % 2 ? " data-odd" : ""}>${tiles.slice(4).join("")}</div>` });
  })() : "";

  // ---- plan: the plan and its usage, the admin's alone (sprint 8, 8.4: the route reads it for the admin only, src/plans.js
  // planShownOf, one statement; the read rides opts.plan) ----
  const planSec = admin && !down ? planCard(opts.plan) : "";

  const banner = down ? unreachableState({ what: "Control could not be read from the database, so nothing is listed and nothing can be changed until it answers." }) : "";
  return CT_CSS + `<section class="ct" data-screen="control">${banner}${pageHead({ title: "Control" })}${nav}${flash}${stack(glance, peopleSec, wsSec, cols(connectSec, keysSec), orgSec, planSec, measuresSec)}</section>` + CT_JS;
}
