// src/connectcards.js — CONNECT YOUR AI as cards (sprint 21, 21.P D18 and E21, the owner's MCQs of 2026-10-14): the page after
// creating an org (src/orgpage.js renderOrgMade, the front frame) and the first Home of an org with nothing filed yet (src/home.js)
// show the SAME three ways in, in the website's look: the org's one MCP address with Copy, then Claude (claude.ai and the Claude
// app: Claude's own logo, Add to Claude), ChatGPT (its logo, Add to ChatGPT) and Claude Code and Codex (their one command each).
// Each signs in on sharingu's own page (src/oauth.js), so no key is pasted anywhere here; the key-based rows stay on Control ·
// Connect (src/controlpage.js), which leads with the same two apps. Pure: the address is the request's own origin, the connector's
// name sharingu (CONNECTOR_NAME). The logos are the worker's own files (src/frontassets.js), never hotlinked.
//
// connectCards(origin) -> the markup · CONNECT_CARDS_CSS its rules (the shell's tokens: both frames carry them) ·
// CLIENT_MARK_CSS the mark's alone · COPY_JS the copy for a page without the shell's script (the front frame; inside the shell, src/shell.js copies any [data-copy]
// beside a <code>) · clientMark(kind, size) the client's mark (a logo tile, or the command line's) · CLAUDE_ADD, CHATGPT_ADD the
// two stores' own pages (each ONE constant to swap when its listing is published).
import { esc } from "./ui.js";
import { frontAssetHref } from "./frontassets.js";

// the connector's name: sharingu for every org (the owner's MCQ 2026-10-15: one /mcp serves every org a person holds a seat in,
// each call naming its org, so one connection is the product's own name, the directory listing's)
export const CONNECTOR_NAME = "sharingu";
// sprint 12, 12.1 (the buttons): Claude's documented install link for a custom connector, which prefills its "Add custom connector"
// dialog with this connector's name and URL (the person confirms there); ChatGPT has no documented deep link, so its plugins page.
// copy: off-screen (an href)
export const CLAUDE_ADD = (mcp, name) => `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(name)}&connectorUrl=${encodeURIComponent(mcp)}`;
export const CHATGPT_ADD = "https://chatgpt.com/plugins";
// the commands of the command-line clients that sign in on sharingu's page (tools/client-drive/connect.sh runs the same two)
export const claudeCodeLine = (mcp, name) => `claude mcp add --transport http ${name} ${mcp}`;
export const codexLine = (mcp, name) => `codex mcp add ${name} --url ${mcp}`;

// the two app logos the connect page shows too (src/oauth.js): chatgpt.png fills its tile, claude.png sits in it at its own size
const LOGOS = { claude: "clients/claude.png", chatgpt: "clients/chatgpt.png" };
// clientMark(kind, size) -> the client's tile: its logo, or the command line's prompt for the terminal clients
export function clientMark(kind, size = 40) {
  const logo = LOGOS[kind];
  const inner = logo ? `<img src="${frontAssetHref(logo)}" width="${Math.round(size * 0.6)}" height="${Math.round(size * 0.6)}" alt=""${kind === "chatgpt" ? " data-fill" : ""}>`
    : `<span class="cc-prompt">&gt;_</span>`;
  return `<span class="cc-mark" data-mark="${esc(kind)}" style="--cc-mark:${Number(size)}px" aria-hidden="true">${inner}</span>`;
}
// copyLine(text, what) -> one copyable mono line: the shell's script (and COPY_JS on a front page) copies the <code> beside the button
export const copyLine = (text, what) => `<div class="cc-line"><code>${esc(text)}</code><button type="button" class="cc-copy" data-copy data-button="copy" data-client="copies ${esc(what)}" title="Copy">Copy</button></div>`;
// copy: label (the two halves of each card's foot: where the sign-in happens, and what it spares)
const SIGN_IN = "Sign in on sharingu's page";
const NO_KEY = "No key to paste";
const TICK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const how = `<p class="cc-how"><span>${SIGN_IN}</span><span class="cc-nokey">${TICK}${NO_KEY}</span></p>`;
const away = (href, button, label, what) => `<a class="cc-add" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-button="${button}" data-client="opens ${esc(what)}, in a new tab">${label}</a>`;

export function connectCards(origin) {
  const mcp = `${String(origin || "").replace(/\/+$/, "")}/mcp`;
  const name = CONNECTOR_NAME;
  const client = (kind, title, sub, action, extra = "") => `<li class="cc-client" data-connect-client="${kind}">
      <div class="cc-head">${clientMark(kind)}<div class="cc-name"><b>${esc(title)}</b><span>${esc(sub)}</span></div>${action}</div>${extra}${how}
    </li>`;
  return `<div class="cc" data-region="connect-ai">
    <div class="cc-addr"><span class="cc-k">MCP address</span>${copyLine(mcp, "the MCP address")}</div>
    <ul class="cc-clients">
      ${client("claude", "Claude", "claude.ai and the Claude app", away(CLAUDE_ADD(mcp, name), "add-to-claude", "Add to Claude", "Claude's Add custom connector dialog, prefilled"))}
      ${client("chatgpt", "ChatGPT", "The ChatGPT app", away(CHATGPT_ADD, "add-to-chatgpt", "Add to ChatGPT", "ChatGPT's plugins page"))}
      ${client("terminal", "Claude Code and Codex", "One command each", "", `<div class="cc-cmds" data-commands>${copyLine(claudeCodeLine(mcp, name), "Claude Code's command")}${copyLine(codexLine(mcp, name), "Codex's command")}</div>`)}
    </ul>
  </div>`;
}

// a client's mark (Control · Connect's rows wear it too): a hairline tile, the logo filling it or sitting in it, the prompt on a well
export const CLIENT_MARK_CSS = `
  .cc-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--cc-mark);height:var(--cc-mark);border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
  .cc-mark img[data-fill]{width:100%;height:100%;object-fit:cover}
  .cc-mark[data-mark="terminal"]{background:var(--well)}
  .cc-prompt{font:700 13px/1 var(--mono);color:var(--text)}
`;
// the cards' rules, on the shell's tokens (Paper and Ink): a hairline list of clients, each its mark, its name and the store's
// button (ink: the view's one orange is the page's own primary), the mono lines with Copy, and the quiet foot
export const CONNECT_CARDS_CSS = CLIENT_MARK_CSS + `
  .cc{display:flex;flex-direction:column;gap:16px}
  .cc-addr{display:flex;flex-direction:column;gap:6px}
  .cc-k{font:500 11px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
  .cc-line{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 6px 6px 12px;background:var(--well);border:1px solid var(--line);border-radius:6px}
  .cc-line code{flex:1;min-width:0;font:500 12.5px/1.5 var(--mono);color:var(--text);overflow-wrap:break-word;word-break:normal;hyphens:none}
  .cc-copy{flex:none;height:28px;padding:0 10px;font:600 12px/1 var(--sans);color:var(--text);background:var(--surface);border:1px solid var(--line-strong);border-radius:6px;
    cursor:pointer;transition:background-color var(--dur-fast) var(--ease)}
  .cc-copy:hover{background:var(--hover)}
  .cc-copy[data-copied]{color:var(--ok)}
  .cc-copy:focus-visible,.cc-add:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .cc-clients{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
  .cc-client{display:flex;flex-direction:column;gap:10px;padding:14px 16px}
  .cc-client+.cc-client{border-top:1px solid var(--line)}
  .cc-head{display:flex;align-items:center;gap:12px;min-width:0}
  .cc-name{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .cc-name b{font:700 14.5px/1.3 var(--sans);color:var(--text)}
  .cc-name span{font:400 12.5px/1.35 var(--sans);color:var(--text-muted)}
  .cc-add{flex:none;display:inline-flex;align-items:center;height:34px;padding:0 12px;font:600 13px/1 var(--sans);color:var(--text);background:transparent;
    border:1px solid var(--line-strong);border-radius:10px;text-decoration:none;white-space:nowrap;transition:background-color var(--dur-fast) var(--ease)}
  .cc-add:hover{background:var(--hover)}
  .cc-cmds{display:flex;flex-direction:column;gap:6px}
  .cc-how{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:0;font:400 12.5px/1.4 var(--sans);color:var(--text-muted)}
  .cc-nokey{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--ok)}
  @media (max-width:480px){.cc-client{padding:12px}.cc-head{flex-wrap:wrap}.cc-name{flex-basis:calc(100% - 52px)}.cc-add{margin-left:52px}
    .cc-cmds .cc-line{flex-wrap:wrap;padding:8px 8px 8px 12px}.cc-cmds .cc-line code{flex-basis:100%;font-size:12px}.cc-cmds .cc-copy{margin-left:auto}}
`;
// a front page's copy (the shell's own script does it inside the app): the <code> beside the button, "Copied" for two seconds
export const COPY_JS = `<script>(function(){if(!navigator.clipboard)return;document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-copy]'):null;if(!b)return;` +
  `var c=b.parentNode&&b.parentNode.querySelector('code');if(!c)return;navigator.clipboard.writeText(c.textContent).then(function(){b.setAttribute('data-copied','');b.textContent='Copied';` +
  `clearTimeout(b._t);b._t=setTimeout(function(){b.removeAttribute('data-copied');b.textContent='Copy';},2000);},function(){});});})();</script>`;
