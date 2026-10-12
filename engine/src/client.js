// src/client.js — which AI filed it (sprint 13, slice 13.1; the owner's MCQ of 2026-10-11; migrate-080's transmission.client).
// Every contribution records ONE normalised family word for the tool that filed it, stamped at the door when the row is written
// (src/core.js fileTransmission and fileTransmissionsBatch read requestClient()), never the raw string a client sends:
//   claude       claude.ai, Claude Desktop          claude-code  Claude Code
//   chatgpt      ChatGPT (OpenAI's connectors)      codex        Codex
//   web          the app's own forms (a signed-in browser)
//   api          a key on the REST API (no client signal)
//   other        any other MCP client, or one that names itself in no way we know
// NULL (no word) is unknown: every row filed before migrate-080, and a filing outside a request (the cron).
//
// WHERE THE WORD COMES FROM, in order (clientFamilyOf): the OAuth client's registered client_name, read once when the grant is
// made (src/oauth.js, which already looks the client up for its consent) and kept on the grant's props as its family word
// (props.client), so a call reads no grant store for it; then the MCP initialize's clientInfo.name, kept for the session as its
// family word alone inside the session id (src/confirm.js sessionFor; on the stateless revision, the request's own _meta
// clientInfo); then the door: a signed-in browser's form is `web`, a bearer on REST `api`, the MCP `other`.
// EVERYTHING HERE IS SELF-DECLARED: a client says what it is and nothing checks it — the word is a label, never proof of which
// tool filed a row, and nothing may decide a right or a grade on it (the privacy page and the Activity page say so).
import { requestStore } from "./orgpath.js";

export const CLIENT_FAMILIES = ["claude", "claude-code", "chatgpt", "codex", "web", "api", "other"];
// the families a client's own name can say (the rest are the door's)
export const NAMED_FAMILIES = ["claude", "claude-code", "chatgpt", "codex"];
// KNOWN_CLIENTS — the table of names a client is known to give (the OAuth client_name it registers, the clientInfo.name it sends
// at initialize), each pattern over the name lower-cased with every run of anything not a letter or a digit read as one space.
// FIRST match wins, so the narrower family comes before the wider: Claude Code ("Claude Code (sharingu)", "claude-code") before
// Claude ("Claude", "claude-ai", "claude.ai", "Claude Desktop"); Codex ("Codex", "codex-mcp-client", "OpenAI Codex") before
// ChatGPT ("ChatGPT", "openai-mcp", "OpenAI").
export const KNOWN_CLIENTS = [
  [/claude ?code/, "claude-code"],
  [/codex/, "codex"],
  [/chat ?gpt|openai/, "chatgpt"],
  [/claude|anthropic/, "claude"],
];
// familyOfName(name) -> one of NAMED_FAMILIES, "other" for a name we do not know, null for no name at all (pure)
export function familyOfName(name) {
  if (typeof name !== "string") return null;
  const n = name.slice(0, 200).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!n) return null;
  for (const [re, fam] of KNOWN_CLIENTS) if (re.test(n)) return fam;
  return "other";
}
// clientFamilyOf({ oauth, mcp, door }) -> one of CLIENT_FAMILIES (pure). oauth: the OAuth client's registered name (or the family
// word a grant already carries); mcp: the MCP clientInfo.name (or the session's family word); door: "mcp" | "web" | "api" | null.
// The first source that names a known family wins; else the door's own word (the MCP: other); no door and no name: null.
export function clientFamilyOf({ oauth = null, mcp = null, door = null } = {}) {
  for (const src of [oauth, mcp]) { const f = familyOfName(src); if (f && f !== "other") return f; }
  if (door === "web" || door === "api") return door;
  if (door === "mcp") return "other";
  return familyOfName(oauth) || familyOfName(mcp);
}
// grantClientOf(clientName) -> { client } for an OAuth grant's props when the client's registered name says a known family, else
// {} (src/oauth.js grantPropsOf: a grant keeps the word, never the name; a name we do not know keeps nothing)
export function grantClientOf(clientName) { const f = familyOfName(clientName); return NAMED_FAMILIES.includes(f) ? { client: f } : {}; }
// clientWordOf(family) -> the word a page shows ("Claude", "the web app"), "" for none (unknown shows nothing)
export const CLIENT_WORD = { claude: "Claude", "claude-code": "Claude Code", chatgpt: "ChatGPT", codex: "Codex", web: "the web app", api: "the API", other: "another client" };
export const clientWordOf = (family) => CLIENT_WORD[String(family || "")] || "";
// clientOfRow(v) -> a stored word read back: one of CLIENT_FAMILIES, or null (NULL, or anything the door never writes)
export const clientOfRow = (v) => (CLIENT_FAMILIES.includes(String(v || "")) ? String(v) : null);

// THE REQUEST'S WORD: set once by the door that signed the request in (src/index.js routeRequest: web or api; src/mcp.js
// callerOf: the MCP's), read by the ledger's two writes. It lives on the request's own async context (src/orgpath.js), never a
// parameter and never module state; outside a request (the cron, a selftest) it is null and the row records unknown.
export function setRequestClient(family) { const st = requestStore(); if (st) st.client = CLIENT_FAMILIES.includes(family) ? family : null; }
export const requestClient = () => { const st = requestStore(); return (st && st.client) || null; };   // only setRequestClient writes it
