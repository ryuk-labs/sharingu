// src/mcp.js — the MCP door (ADR-044): initialize and its instructions, tools/list (each tool's title and annotations,
// derived from its registry row), tools/call (callTool: the owner and scope checks and the project scope, then runTool: one
// case per tool), and the brain:// resources. D3b: it speaks two revisions on one endpoint, the handshake one (2025-06-18,
// handleOne) and the stateless one (2026-07-28, handleModern); both reach the same answers through the same callTool. The
// registry itself (MCP_TOOLS) stays in src/index.js, beside the REST rows, so tools/make-door-contract.py and
// check-mcp-parity.py read both from one file. D5: one vocabulary, about 30 names
// (docs/plan/MCP.md §5; the old names in engine/tools/names.json).
import { db } from "./data.js";
import { checkPlan, countCall, withPlanWarning, resetPlanNote, setPlanReader } from "./plans.js";   // sprint 8, 8.2: the plan per write, the calls per tools/call
import { orgUrl, orgBase, setOrgBase } from "./orgpath.js";   // sprint 7, 7.4: every URL under the org of its address
import { store, storeOfRow, artifactKey } from "./storage.js";   // sprint 6, 6.4: every R2 key carries the org
import { readMapNode } from "./mapnode.js";
import { readMapPlane } from "./mapplanes.js";
import { resolveReader, decideTransmission, carriesTranscript, artifactScreens, stampProjectLoose, whoamiFor, whoamiOrgs, ORG_ARG_WORDS, effectiveConsent, CONSENT_RANK, artifactsListFor, mayReadArtifact, evalMarkRefused, countActiveProjects, seatsOnce, isPartnerReader } from "./core.js";
import { normOrgArg } from "./accounts.js";   // sprint 7, 7.5a: a call's org, spelled as an org's path name
import { grantKindOf, GRANT_KINDS, grantStampless, STAMPLESS_WORDS } from "./oauthgrants.js";   // sprint 7, 7.5a: the two grant kinds; 7.5b: a grant with no stamp
import { resolveProject, projectOf, projectSlug, projectWords } from "./project.js";
import { fileHandoffRecord, mcpHandoffReply } from "./handoff.js";
import { respondOptions } from "./qnaire.js";
import { readDecisions, decisionsJson, readQuestion, questionJson, entriesFrom } from "./decisions.js";
import { readHomeSummary } from "./home.js";
import { readBuild } from "./build.js";
import { readGoals, readGoalNode } from "./goalsread.js";
import { readGtmPipeline } from "./gtmread.js";
import { readBroadcast } from "./broadcastread.js";
import { publishAnswer, equipAnswer } from "./broadcast.js";   // sprint 3, D2: publish and equip through the door (MCP.md §5)
import { regradeAnswer } from "./regrade.js";   // sprint 4, R1: regrade from the pages
import { readVersionsView, versionsJson, readVersionHead } from "./versionsview.js";
import { publishVersion, restoreVersion } from "./knowledge/versions.js";
import { computeHoles } from "./holes.js";
import { addProject } from "./admin.js";
import { checklistFor, fillOf as fillOfItem, whatOf as whatOfItem, callText as checklistCall } from "./checklist.js";
import { gradeCheck } from "./knowledge/grades.js";
import { getTenantConfig, PRODUCT } from "./tenant.js";
import { json, uid, now, isEvalMark, evalView } from "./util.js";
import { forgetReqMemo } from "./reqmemo.js";
import { formatsAnswer } from "./formats.js";
import { previewItems, fileItems, readPreviewView, PREVIEW_ID_RE } from "./preview.js";
// sprint 3, D3: the confirm prompt (elicitation, src/confirm.js) and the card (MCP Apps, src/previewcard.js)
import { SESSION_HEADER, sessionFor, sessionOf, acceptsStream, isResponse, recordAnswer, confirmPlan, confirmStream, confirmState, newNonce, NOT_ASKED, ANSWER_NOTE, elicitsForm, rendersCard, mrtrState, inputRequiredOf, inputWord, recordInput,
  verbOf, verbArgs, verbDigest, verbConfirmPlan, verbAsk, verbBase, claimVerb, answerNote, notAskedNote } from "./confirm.js";   // 7.5b: publish and equip confirm too
import { CARD_URI, CARD_MIME, CARD_META_KEY, CARD_FRAGMENT_PREFIX, CARD_TOOLS, CARD_TOOL_META, CARD_RESOURCE_META, cardTemplate, cardFragment } from "./previewcard.js";
import { impactAnswer } from "./impact.js";
import { pickUp } from "./pickup.js";
import { searchAnswer, readAnswer, changesAnswer, briefAnswer } from "./extract.js";   // extract (sprint 3, B5)
import { ruleQuestion } from "./knowledge/decisions.js";
import { screensAnswer } from "./knowledge/screens.js";
import { updatesFor } from "./updates.js";
import { openItems } from "./openitems.js";
import { askOwner } from "./ask.js";
import { clientFamilyOf, familyOfName, setRequestClient } from "./client.js";   // sprint 13, 13.1: which AI filed it

const rpc = (id, result) => json({ jsonrpc:"2.0", id, result });
// ---- sprint 8, 8.2: THE DOOR'S CALLS (docs/plan/PLATFORM.md §4 sprint 8: "MCP and API calls a day", "the per-minute burst limit
// per org, so one busy org cannot starve a database that answers one query at a time"). Every tools/call, on either revision, is
// counted ONCE at its entry (src/plans.js countCall: one D1 batch), before anything it does; a confirm's own follow-up call inside
// it is the same call. A WRITE (the tool's registry row: write, or stores: preview keeps its plan) over the org's calls today or its
// burst this minute is refused plan_limit with HTTP 429 and Retry-After, nothing done; a READ is counted and always answers. Past
// 80% of either, or of any limit a write inside the call checks (src/plans.js PLAN_NOTE), the answer carries planWarning.
// tools/list, resources and the handshake are reads of the door, never counted.
// callGate(name, env, tools) -> the call's verdict (src/plans.js callVerdict)
async function callGate(name, env, tools) {
  resetPlanNote(env);   // one call's warning: a JSON-RPC batch's earlier call never lends its own to this one
  const spec = typeof name === "string" ? tools.find((x) => x.name === name) : null;
  return countCall(env, { write: !!(spec && (spec.write || spec.stores)) });
}
// withStatus(res, status, headers) -> the same answer under another HTTP status (a refused call's 429 and its Retry-After)
const withStatus = (res, status, extra = {}) => { const h = new Headers(res.headers); for (const [k, v] of Object.entries(extra)) h.set(k, v); return new Response(res.body, { status, headers: h }); };
const retryHeaders = (refusal) => (refusal && refusal.retryAfter != null ? { "retry-after": String(refusal.retryAfter) } : {});

// ---- W11 (B7a, Q60CCC574 — day-1 is ONE MCP URL): the first reply a client gets says what to do first. ----
// MCP_PROTOCOLS — the MCP revisions this door honours, newest first. negotiateProtocol echoes the client's
// requested revision when R speaks it, else answers the newest one (the spec's own rule: the client then decides
// whether it can continue). What each revision needs of R, and R does: 2024-11-05 (the original); 2025-03-26 (a
// notification is answered 202 with no body; a JSON-RPC batch array is answered as an array); 2025-06-18 (batches
// dropped again — still accepted here, harmlessly; the MCP-Protocol-Version header is tolerated, never required).
export const MCP_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export function negotiateProtocol(requested) {
  return MCP_PROTOCOLS.includes(requested) ? requested : MCP_PROTOCOLS[0];
}
// ---- D3b: the stateless revision (2026-07-28; engine/.runs/d3b/SPEC-NOTES.md) ----
// MODERN_PROTOCOLS — the revisions served per request, without a handshake. A request is MODERN when its params._meta carries
// a protocol version (isModern); everything else (initialize, a legacy request, a client's JSON-RPC response, a batch) is
// served as the handshake revisions always were. The two never mix: a modern request reads nothing a session id says.
export const MODERN_PROTOCOLS = ["2026-07-28"];
export const META_PROTOCOL = "io.modelcontextprotocol/protocolVersion";
export const META_CAPS = "io.modelcontextprotocol/clientCapabilities";
export const META_SERVER = "io.modelcontextprotocol/serverInfo";
// sprint 13, 13.1: the request's own clientInfo (optional in the revision): its name, read for the family word alone (src/client.js)
export const META_CLIENT = "io.modelcontextprotocol/clientInfo";
// the methods the modern door answers (ping and the handshake are not in the revision); any other is 404 + -32601
export const MODERN_METHODS = ["server/discover", "tools/list", "tools/call", "resources/list", "resources/templates/list", "resources/read"];
// the caching hint the revision requires on discover, the lists and resources/read: every answer reads D1 live, so none is
// fresh past the moment it is sent (ttlMs 0); only discover holds nothing of the caller's (public)
export const CACHE_PRIVATE = { ttlMs: 0, cacheScope: "private" };
export const CACHE_PUBLIC = { ttlMs: 0, cacheScope: "public" };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isModern = (rq) => isObj(rq) && rq.method !== "initialize" && isObj(rq.params) && isObj(rq.params._meta) && typeof rq.params._meta[META_PROTOCOL] === "string";
// the Streamable HTTP mirror headers: MCP-Protocol-Version (the _meta version), Mcp-Method (the method) and Mcp-Name (the
// params field NAMED_BY names). A header that is present must equal its body value (Mcp-Name after its =?base64?…?= form is
// decoded). MIRRORS_REQUIRED are the ones whose absence is refused too: the two Claude Code 2.1.235 was measured sending on
// every request; an absent Mcp-Name is tolerated (the revision requires it; no client was seen sending it on the wire:
// engine/.runs/d3b/SPEC-NOTES.md, a stated deviation).
export const MIRROR_HEADERS = { version: "MCP-Protocol-Version", method: "Mcp-Method", name: "Mcp-Name" };
export const MIRRORS_REQUIRED = ["version", "method"];
export const NAMED_BY = { "tools/call": "name", "resources/read": "uri", "prompts/get": "name" };
const B64_RE = /^=\?base64\?(.*)\?=$/;
// headerText(value) -> the header's text, its Base64 form decoded, or null when it is malformed (a character outside visible
// ASCII, space and tab; Base64 that is not, or not UTF-8)
export function headerText(v) {
  const s = String(v);
  const m = B64_RE.exec(s);
  if (!m) return /^[\x20-\x7e\t]*$/.test(s) ? s : null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(m[1]) || m[1].length % 4) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))); } catch { return null; }
}
const shown = (v) => JSON.stringify(String(v).slice(0, 80));
// mirrorMismatch(headers, rq) -> null, or the HeaderMismatch message: a mirror header that differs from the body, is
// malformed, or is required and absent
export function mirrorMismatch(headers, rq) {
  const field = NAMED_BY[rq.method];
  // a body name that is not a string compares as empty (never converted: a caller's object is not asked for its text)
  const body = { version: rq.params._meta[META_PROTOCOL], method: rq.method, ...(field ? { name: typeof rq.params[field] === "string" ? rq.params[field] : "" } : {}) };
  for (const k of Object.keys(body)) {
    const h = MIRROR_HEADERS[k], raw = headers.get(h);
    if (raw == null) { if (MIRRORS_REQUIRED.includes(k)) return `Header mismatch: the ${h} header is required`; continue; }
    const v = k === "name" ? headerText(raw) : raw;
    if (v == null) return `Header mismatch: the ${h} header is malformed`;
    if (v !== String(body[k] ?? "")) return `Header mismatch: ${h} header value ${shown(v)} does not match body value ${shown(body[k] ?? "")}`;
  }
  return null;
}
// START_HERE_DOC and the doc readers live in src/docread.js (D5); the selftests read the name here too
export { START_HERE_DOC, libraryDocs } from "./docread.js";
import { START_HERE_DOC, libraryFor, docFor, roleBriefFor } from "./docread.js";
// fileText(env, row) — the ONE R2 text read (a saved file's body, by its row: src/storage.js storeOfRow, the row's org — a file
// read by its exact id after mayReadArtifact admitted the reader)
const fileText = async (env, row) => { const o = await storeOfRow(env, row).get(row.r2_key); return o ? await o.text() : null; };
// instructionsFor({ org, startHere }) — pure: the `instructions` string initialize carries, the first-run guide. One line
// before five numbered steps (whoami → missing → formats → preview → file), one line after (each session: updates, the
// start-here guide, ask, wrap_up). Only the tool names of the registry (src/index.js MCP_TOOLS).
// sprint 3 S3b: the product is "sharingu" to every connecting client, whatever a served manifest names (PRODUCT, src/tenant.js)
// sprint 12, 12.2: one line after the five calls names a new team's four steps (the same on the site's docs page, docs/INSTALL.md
// and plugin/README.md) and the two fill skills — the plugin's, and the starter shelf's for any other client (src/starter.js:
// `equip` preset:<slug> copies one into the project as doc starter/<slug>.md)
export const FOUR_STEPS_LINE = "A new team's four steps: (1) join and connect, (2) your org, its project, its people (Control invites each person with a one-time link), (3) fill the product side and (4) fill the GTM side — the skills `fill-the-product-side` (the code, docs and tickets your AI reads -> goals, the Map, decisions, docs) and `fill-the-gtm-side` (the mail, chats, meetings and CRM your AI reads -> GTM cards and contributions: summaries and links only), every item previewed, then filed. The plugin carries them as skills; in any other client `broadcast` lists them on the starter shelf and `equip` {slug: \"preset:<slug>\", v: <its version on the shelf>} previews the copy and, again with confirm: true, puts it in the project as a doc to `read`. `weekly-review` reads the week.";
export function instructionsFor(o) {
  const org = (o && o.org) || "this org";
  const startHere = (o && o.startHere) || START_HERE_DOC;
  // sprint 7, 7.5a: an ACCOUNT grant may act in each org its account holds a seat in — one line says how (after the guide's five)
  const orgs = o && o.account ? [`This connection is your account's: it acts in ${org} unless a call names another of your orgs. \`whoami\` lists them (orgs); any call takes \`${ORG_ARG_WORDS}\` to act in that one, with your role there.`] : [];
  return [
    `You are connected to ${PRODUCT}, the shared brain of ${org}. The first time, in order:`,
    "1. Call `whoami`: who you are, your projects, and where your writes land.",
    "2. Call `missing` with `project`: what that project still needs, each item with the preview call that fills it. An org with no project yet starts with `create_project` {key, name} (the admin); `whoami` says which.",
    "3. Call `formats`: how each kind of item is shaped.",
    "4. Call `preview` with the items you extracted: it shows what will be filed, where it shows, how it is graded and what it reaches, and files nothing. Show the person its `text` as it is.",
    "5. Call `file` with the previewId and the same items.",
    FOUR_STEPS_LINE,
    `Every session: \`updates\` first (what changed for you and what waits on you). \`read\` {ref: "doc/${startHere}"} is the start-here guide; \`ask\` asks the owner; \`wrap_up\` hands over at the end.`,
    ...orgs,
  ].join("\n");
}
// serverNameOf(org) -> what an MCP client shows as the server: the product and the org (its row's name), in words
export const serverNameOf = (org) => { const o = String(org || "").trim(); return o && o.toLowerCase() !== PRODUCT ? `${PRODUCT} — ${o}` : PRODUCT; };
// respond and submit_grade file at once; each answer carries ONE line pointing at preview, which shows a filing first
export const PREVIEW_TIP = "Next time, preview {project, items} first: it shows what will be filed, where it shows, how it is graded and what it reaches, then file writes it.";
const withPreviewTip = (out) => (out && typeof out === "object" && !Array.isArray(out) && !out.error ? { ...out, tip: PREVIEW_TIP } : out);
const rpcErr = (id, code, message) => json({ jsonrpc:"2.0", id, error:{ code, message } });
// slimLists(answer) -> the answer with each list's cards cut to what a list row says (D2b item 10: gtm answered 28.6 KB
// on ryuklabs, most of it the lists' cards in full)
const slimLists = (o) => (o && o.lists && Array.isArray(o.lists.lists) ? { ...o, lists: { ...o.lists, lists: o.lists.lists.map((k) => ({ ...k, cards: (k.cards || []).slice(0, 8).map((c) => ({ ref: c.ref, name: c.name, ...(c.summary ? { summary: c.summary } : {}), ...(c.asOf ? { asOf: c.asOf } : {}), ...(c.status && c.status !== "approved" ? { status: c.status } : {}) })) })) } } : o);
const asText = (o) => ({ content:[{ type:"text", text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });

// OAuth scope enforcement (ADR-047 gap closed here): scopesSupported advertises
// mcp:read/mcp:write, but until now nothing checked which one a grant actually carried —
// every claude.ai connection got full write access regardless of consent. Only a caller
// that came in through the OAuth path (person.viaOAuth, set by resolveReader from
// props.scope — see oauth.js) is scope-limited at all; owner key / bearer person token
// callers are unaffected, exactly as before.
const WRITE_SCOPE = "mcp:write";
export function hasWriteScope(person) {
  if (!person.viaOAuth) return true;
  return Array.isArray(person.oauthScope) && person.oauthScope.includes(WRITE_SCOPE);
}
// annotationsOf(row) -> the tool's MCP annotations (the spec's ToolAnnotations), DERIVED from its registry row so the two
// cannot disagree (tools/annotations-selftest.mjs): readOnlyHint is "changes nothing" — no write flag and no `stores` (preview
// keeps its plan for an hour); destructiveHint, idempotentHint and openWorldHint are the row's own flags (a write that can
// replace, remove or overrule what is held is destructive; one whose repeat has no further effect is idempotent; wrap_up may
// open a GitHub issue, the one open-world call). A read is idempotent and never destructive. title is the row's title.
export function annotationsOf(t) {
  const readOnly = !t.write && !t.stores;
  return { title: t.title, readOnlyHint: readOnly, destructiveHint: readOnly ? false : !!t.destructive,
    idempotentHint: readOnly ? true : !!t.idempotent, openWorldHint: !!t.openWorld };
}
// toolEntry(row) -> the row as tools/list carries it: name, title, description, inputSchema, annotations
export const toolEntry = (x) => ({ name: x.name, title: x.title, description: x.desc, inputSchema: x.schema, annotations: annotationsOf(x) });
// toolCallable(tool, who): may THIS caller call the tool. The ONE filter: tools/list lists exactly these, and the MCP plane
// (src/mapplanes.js, GET /map/mcp) marks each MCP_TOOLS row callable by it (UI-B8a), so the two can never disagree.
export function toolCallable(tool, who) {
  return !!who && (!tool.owner || who.role === "owner") && (!tool.write || hasWriteScope(who));
}

// Execute one MCP tool. Deliberately reuses the same helpers as the REST door —
// carriesTranscript, verifyScreens, resolveReader — so a guarantee cannot hold on one path only.
// reg (optional) carries the other registry the door planes read: { CAPABILITIES } (the map tool).
// mapReg(capabilities, tools, env) -> the ONE registry set readMapPlane reads, the same GET /map/:plane passes (UI-B8b)
// D9 (U-MCP): the arch plane's seats are the request's one seats read (seatsOnce), never a second statement
export const mapReg = (capabilities, tools, env) => ({ capabilities, tools, seats: (r) => seatsOnce(env, r.id), activeCount: () => countActiveProjects(env) });
// ---- U-MCP-tail-c (N2, QE6B9CEBA): ONE call scope for a project-scoped tool AND its REST twin ----
// projectCallScope(person, want, env) — callTool's D4 block, extracted so POST /grade (src/index.js) scopes by its body
// `project` exactly as submit_grade scopes by its argument (tool == twin). It lives HERE, beside callTool, because the re-stamp
// is the MCP door's own (the one place a person is re-stamped for a call). The caller's seats are the request's one read
// (seatsOnce, D9); the scope is resolveProject's. -> the refusal { error:"project_forbidden", project, seats, note, example? }
// (nothing read, nothing filed), else { scope, env, person }: env is the re-scoped env (resolveProject's `at` spreads the env it
// was handed, so the seam's READ_SCOPE survives); person is re-stamped (token_project) ONLY when the project was named or is
// the caller's real active one, so a defaulted scope never files a write. It types no key and has no per-project branch.
export async function projectCallScope(person, want, env) {
  const seats = await seatsOnce(env, person.id);
  const scope = await resolveProject(person, want, seats, env);
  if (scope.error) return scope;
  return { scope, env: scope.env, person: scope.project && (scope.named || scope.active) ? { ...person, token_project: scope.project } : person };
}
// ---- THE ORG OF A CALL (sprint 7, 7.5a; PLATFORM §2 items 8 and 9: one /mcp; "whoami lists the orgs and a call switches
// between them"). STATELESS: nothing is stored on the grant. Every tool's schema carries the optional argument `orgSlug`
// (src/index.js ORG_ARG), and resources/read takes ?orgSlug= in its uri. The request signs in ONCE, before any call runs
// (src/index.js routeRequest, then callerOf, both reading the same orgWantedOf off the same body):
//   · an ACCOUNT grant (src/oauthgrants.js) as the account's own ACTIVE seat in the org the call names, with that seat's role —
//     else its default seat (the grant's current org, else the org-1 seat, else the oldest: src/accounts.js accountGrantSeat);
//   · a SEAT grant, a bearer key, a cookie or a read-only credential as its one seat, whatever the call names.
// Then orgArgRefused (callTool, the confirm's retry, resources/read) refuses any call whose org is not the org the request
// signed in to: a seat grant or a key naming another org, an account grant naming an org it holds no active seat in, and a
// call in a batch naming another org than the batch's first call — `org_unreachable`, before anything is read or written. The
// answer is the SAME whether the named org exists or not, and lists only the orgs this credential already reaches (whoamiOrgs).
// orgWantedOf(rq) -> the org the request acts in: the org its FIRST call names — the first tools/call's arguments.orgSlug, or
// the first resources/read's ?orgSlug= (normOrgArg's spelling) — or "" when that first call names none (the current org). In a
// batch the first call decides (sprint 7's review, C1): a later call naming another org is refused, never the reason an earlier
// call that named none acts there
export function orgWantedOf(rq) {
  for (const m of Array.isArray(rq) ? rq : [rq]) {
    if (!isObj(m) || !isObj(m.params)) continue;
    if (m.method === "tools/call") return isObj(m.params.arguments) && typeof m.params.arguments.orgSlug === "string" ? normOrgArg(m.params.arguments.orgSlug) : "";
    if (m.method === "resources/read") return typeof m.params.uri === "string" ? uriOrgOf(m.params.uri) : "";
  }
  return "";
}
// uriOrgOf(uri) -> a brain:// uri's ?orgSlug= ("" for none)
const uriOrgOf = (uri) => { const q = String(uri).indexOf("?"); if (q < 0) return ""; try { return normOrgArg(new URLSearchParams(String(uri).slice(q + 1)).get("orgSlug") || ""); } catch { return ""; } };
// orgArgRefused(asked, person, env) -> null (no org named, or the org this request acts in), else the refusal (nothing read or
// written). asked: the call's orgSlug as sent (a value that is not a non-empty string is refused unless absent or "")
// A call that names no org from an ACCOUNT grant whose own org no longer holds its seat (src/core.js resolveReader: grantOrgGone)
// is refused the same way: the grant never acts in another org by default (sprint 7's review, A1)
export async function orgArgRefused(asked, person, env) {
  if ((asked == null || asked === "") && !(person && person.grantOrgGone)) return null;
  const t = await getTenantConfig(env);
  const here = String(t.slug || "").toLowerCase();
  if (typeof asked === "string" && here && normOrgArg(asked) === here) return null;
  const name = (t.brand && t.brand.org) || t.slug;
  const { orgs } = await whoamiOrgs(person, env, { slug: t.slug, name });
  return { error: "org_unreachable", orgs: orgs.map((o) => ({ slug: o.slug, name: o.name, current: o.current })),
    note: (asked == null || asked === "") ? `This connection's own org no longer holds your seat, so a call that names no org acts nowhere: send one of the slugs listed as ${ORG_ARG_WORDS}. Nothing was read or changed.`
      : person.grantAccount
      ? `This connection acts only in the orgs listed (your account's seats). Send one of their slugs as ${ORG_ARG_WORDS}, or leave it out to act in ${name}; a JSON-RPC batch acts in one org, so send a call for another org on its own. Nothing was read or changed.`
      : `This connection is your seat in ${name}: it acts there only, so ${ORG_ARG_WORDS} may name only ${t.slug}. To act in another org you belong to, connect by signing in with your account's passphrase. Nothing was read or changed.` };
}
export async function callTool(name, a, person, env, url, tools, reg = {}) {
  const spec = tools.find((x) => x.name === name);
  // a name that is not a string (an object, a number) is named by its type: the text never calls toString on a caller's value
  if (!spec) return { error: `unknown tool: ${typeof name === "string" ? name.slice(0, 80) : typeof name}` };
  // sprint 7, 7.5a: the call's org (orgArgRefused, above) — checked FIRST, then the argument leaves: no tool reads it
  if ((isObj(a) && "orgSlug" in a) || person.grantOrgGone) {
    const refused = await orgArgRefused(isObj(a) ? a.orgSlug : undefined, person, env);
    if (refused) return refused;
    if (isObj(a)) { const { orgSlug, ...rest } = a; a = rest; }
  }
  if (spec.owner && person.role !== "owner") return { error: "owner_only" };
  if (spec.write && !hasWriteScope(person)) {
    return { error: "insufficient_scope",
             note: "This connection was granted read-only access (mcp:read). Reconnect with mcp:write to use this tool." };
  }
  // the privacy door, on this path too (ADR-016 d)
  if (carriesTranscript(a)) return { error: "transcript_rejected" };
  // U-MCP D4 (Q0D506BBC): a project-scoped tool (MCP_TOOLS project:true) reads the project the caller names, checked against
  // their seats, ONCE, here, after the owner/scope checks and before the case runs — through resolveProject (src/core.js), the
  // same helper the seam and resources/read call. A refusal is project_forbidden and nothing is read. The case runs on the
  // re-scoped env; the person is re-stamped (token_project) ONLY when the project was named or is their real active one, so a
  // defaulted scope never files a write (a multi-seat write with no project still answers project_required). The block is
  // projectCallScope (above) — the ONE helper POST /grade (submit_grade's REST twin) calls too (U-MCP-tail-c N2).
  let scope = null;
  if (spec.project) {
    const r = await projectCallScope(person, a && a.project, env);
    if (r.error) return r;
    ({ scope, env, person } = r);
  } else if (isPartnerReader(person)) {
    // review fix 1 (sprint 2): a Partner's tool that is not flagged project:true (whoami, the queue, the artifacts, the writes, …)
    // still reads on THEIR default scope (resolveProject: a seat, else no project, src/project.js NO_PROJECT), never the org's one active
    // project. Only the env changes: the person is not re-stamped, so a write's own project rule (doorProject) is untouched.
    const sc = await resolveProject(person, null, await seatsOnce(env, person.id), env);
    if (!sc.error) env = sc.env;
  }
  const out = await runTool(name, a, person, env, url, tools, reg, scope);
  // QE6B9CEBA: a write may file an answer or rule a question, so a later message in the same JSON-RPC batch re-reads the
  // Decisions overlay and the owner's blockers (src/reqmemo.js forgetReqMemo) rather than this request's earlier reading
  if (spec.write) { forgetReqMemo(env, "decisions-live:"); forgetReqMemo(env, "owner-owed:"); }
  // D6: a defaulted read names how to pick another project (projectNote, built by the helper, never typed per tool)
  // (an org-wide answer — changes {org: true}, its `org` the boolean true — reads no one project, so it never carries
  // the defaulted-project note; other answers carry `org` as the org's NAME and keep it)
  if (scope && scope.note && !spec.write && out && typeof out === "object" && !Array.isArray(out) && !out.error && out.org !== true && out.projectNote == null) return { ...out, projectNote: scope.note };
  return out;
}
async function runTool(name, a, person, env, url, tools, reg, scope) {
  // ONE tenant read per call, lazily
  let tenantMemo = null;
  const tenantOf = async () => (tenantMemo ||= await getTenantConfig(env));

  // QE6B9CEBA Fork 2 (1): home, build, goals, gtm and broadcast follow their GET twin — the suites' rows only when asked
  // (isEvalMark(a.eval)), for every seat (contracts/door.declared.json evalDefault.byTwin); updates and missing keep W12's
  // by-seat default (evalView), as their twins do (evalDefault.bySeat)
  switch (name) {
    case "whoami": return await whoamiFor(person, env); // one packet, both doors (M-ADR-008a T10)
    // D5: heartbeat, state and thread are ONE read (src/updates.js); GET /updates reaches this same case through callTool
    case "updates": return await updatesFor(person, env, { eval: a.eval, limit: a.limit });
    case "missing":
      // what the project still needs, each open piece with the exact call that fills it (src/holes.js computeHoles), the same
      // read GET /missing and brain://missing answer, on the project callTool scoped (project:true)
      return await computeHoles(env, person, await tenantOf(), { includeEval: evalView(a.eval, person.id) });
    // the standard (sprint 3, B1): the two registries, the same for every project; no seat and no project (src/formats.js)
    case "formats": return formatsAnswer({ kind: a.kind, shape: a.shape });
    // preview, then file (sprint 3, B2; src/preview.js): the project scope ran above (project:true) for preview; file scopes
    // the preview's own project itself (its author only), after spec.write refused a read-only grant.
    // sprint 3, D3: reg.previewOpts.confirm is the confirm's binding (src/confirm.js), stored in the preview's own row
    case "preview": return await previewItems(person, a, env, { via: "mcp", origin: url && url.origin, ...(reg && reg.previewOpts ? reg.previewOpts : {}) });
    case "file": return await fileItems(person, a, env, { via: "mcp", origin: url && url.origin });
    case "ask": {
      const { status, ...out } = await askOwner(person, env, a);
      return out;
    }
    case "respond": {
      // the option-only door (QBDD22130): the SAME respondOptions POST /respond runs
      const { status, ...out } = await respondOptions(person, entriesFrom(a), env, { via: "mcp" });
      return withPreviewTip(out);
    }
    case "rule_question":
      // the twin of POST /questions/:qid/rule: owner only (spec.owner above, and ruleQuestion checks again)
      return await ruleQuestion(person, env, { project: a.project, qid: a.qid, choice: a.choice, rationale: a.rationale, eval: a.eval, via: "mcp" });
    case "submit_grade": return withPreviewTip(await gradeCheck(person, env, a));
    // R1: regrade from the pages, the SAME function POST /regrade calls (src/regrade.js)
    case "regrade": { const { http, ...out } = await regradeAnswer(env, person, a, { via: "mcp" }); return out; }
    case "decide_contribution":
      // the same one seam as POST /contribution/:id/decide (ADR-063 seam rule); owner only, enforced ONCE above by spec.owner
      return await decideTransmission(person, String(a.id || "").replace(/[^A-Za-z0-9-]/g, ""), a, env, { via: "mcp" });
    // impact and carry-forward (sprint 3, B4): impact reads on the project scope callTool ran (project:true), or, for a
    // contribution, on the reader's scope of its own project (src/impact.js readImpactRow); pick_up is a write (spec.write)
    case "impact": return await impactAnswer(env, person, a, scope && scope.project ? scope.project : await projectOf(env));
    case "pick_up": return await pickUp(person, env, a);
    case "open_items": { const { status, ...out } = await openItems(person, env, a); return out; }
    case "wrap_up": {
      // the same seam as POST /wrap-up (src/handoff.js fileHandoffRecord); summary is required by both
      if (!a.summary) return { error: "summary_required", note: "Send `summary`: what this session did, in a sentence or two." };
      return mcpHandoffReply(await fileHandoffRecord(person, a, env, "mcp"), a.summary);
    }
    // extract (sprint 3, B5; src/extract.js): each reads the project callTool scoped above (project:true), every doc and card
    // through the one role rule; the REST twins and the pages answer from the same functions
    case "search": return await searchAnswer(env, person, { q: a.q, kinds: a.kinds, limit: a.limit, eval: a.eval });
    case "read": return await readAnswer(env, person, { ref: a.ref, kind: a.kind, limit: a.limit, after: a.after, cardKind: a.cardKind, q: a.q, screen: a.screen, status: a.status, eval: a.eval });
    case "changes": return await changesAnswer(env, person, { since: a.since, kinds: a.kinds, tab: a.tab, limit: a.limit, eval: a.eval, org: a.org, list: a.list, person: a.person, lane: a.lane, state: a.state, projects: a.projects, before: a.before });
    case "brief": {
      // D5: a role's brief (the doc capsules/<role>.md, src/docread.js roleBriefFor) when no `for` is sent
      const f = a.for != null && String(a.for).trim() ? a.for : null;
      if (f) return await briefAnswer(env, person, { for: f, eval: a.eval });
      const r = await roleBriefFor(env, person, a.role);
      return r.error ? r : { project: await projectOf(env), for: null, role: r.role, brief: { path: r.path, title: r.title, body: r.body } };
    }
    case "home":
      // Home (UI-B3) — the same ONE read GET /home/summary answers and GET /home renders (src/home.js readHomeSummary)
      return await readHomeSummary(env, person, { eval: isEvalMark(a.eval) ? "1" : "" });
    case "build":
      // Build (UI-B4b) — the same ONE read GET /build answers and renders (src/build.js readBuild)
      return await readBuild(env, person, { kind: a.kind, sort: a.sort, eval: isEvalMark(a.eval) ? "1" : "" });
    case "gtm":
      // GTM (UI-B10a): the same ONE read GET /gtm answers (src/gtmread.js readGtmPipeline); D2b item 10: the lists ride as the
      // page shows them, 8 cards a kind (`read` with a ref has the rest)
      return slimLists(await readGtmPipeline(env, person, { period: a.period, eval: isEvalMark(a.eval) ? "1" : "" }));
    case "goals": {
      // Goals (UI-B6a): the same ONE read GET /goals answers; with ref, one goal, as GET /goals/:ref (unknown_goal when the ref
      // is not in this project's tree)
      if (a.ref != null && String(a.ref).trim()) {
        const n = await readGoalNode(env, person, a.ref, { period: a.period, eval: isEvalMark(a.eval) ? "1" : "" });
        return n || { error: "unknown_goal", ref: String(a.ref ?? "").slice(0, 80) };
      }
      return await readGoals(env, person, { period: a.period, eval: isEvalMark(a.eval) ? "1" : "" });
    }
    case "decisions": {
      // the twin of GET /decisions, and with a qid of GET /question/:qid (src/decisions.js, one read each)
      const qid = a.qid != null ? String(a.qid).trim() : "";
      if (qid) return questionJson(await readQuestion(env, person, qid, a));
      return decisionsJson(await readDecisions(env, person, a));
    }
    case "map": {
      // the Map's reads, each the same function its GET twin calls: a node (GET /map/node, src/mapnode.js), the Screens view
      // (GET /map/screens, src/knowledge/screens.js) or a plane (GET /map/:plane, src/mapplanes.js); the JSON answer
      if ((a.ref != null && String(a.ref).trim()) || a.gap != null) return (await readMapNode(env, person, { ref: a.ref, gap: a.gap })).body;
      const plane = a.plane != null && String(a.plane).trim() ? String(a.plane).trim() : "arch";
      if (plane === "screens") return (await screensAnswer(env, a.surface != null ? String(a.surface) : null)).body;
      return (await readMapPlane(env, person, plane, mapReg(reg.CAPABILITIES || [], tools, env), { table: a.table })).body;
    }
    case "broadcast":
      // Broadcast (UI-B11a): the same ONE read GET /broadcast answers (src/broadcastread.js readBroadcast)
      return await readBroadcast(env, person, { eval: isEvalMark(a.eval) });
    case "versions": {
      // Versions — the same read GET /versions (and with v, GET /versions/:v) answers; head:true is the BEHIND poll
      if (a.head === true || a.head === "true" || a.head === 1) return await readVersionHead(env);
      return versionsJson(await readVersionsView(env, person, { v: a.v != null ? String(a.v) : null, cause: a.cause }));
    }
    case "save_file": {
      const body = String(a.content || "");
      if (!body) return { error: "content_required", note: "Send content: the document's text or its HTML, and a title." };
      const bytes = new TextEncoder().encode(body);
      if (bytes.byteLength > 5_000_000) return { error: "too_large", maxBytes: 5_000_000 };
      // sprint 8, 8.2: the org's plan's storage limit (src/plans.js checkPlan: ONE covering sum of the org's files, where sprint 6's
      // 8 GB guard read the same sum): past it the file is refused plan_limit, nothing stored; past 80% the answer says so (PLAN_NOTE)
      const quota = await checkPlan(env, "storage_bytes", { add: bytes.byteLength });
      if (quota.refusal) return quota.refusal;
      // QE2D90B38: a file names which system-part it belongs to; `public`/`eval` resolve to their own group
      const groupArg = String(a.group || "").trim();
      if (!a.public && !isEvalMark(a.eval) && (!groupArg || groupArg === "ungrouped")) {
        return { error: "group_required", note: "Every file needs a group: which part of the system it belongs to." };
      }
      // CONSENT (ADR-102): a `trace`-grouped file is session-trace DATA; consent is enforced at capture, BEFORE the R2 put
      if (String(a.group || "") === "trace" && !a.public) {
        const consent = await effectiveConsent(person, env);
        if (CONSENT_RANK[consent] < CONSENT_RANK.traces) {
          return { stored: false, dropped: "trace", consent, note: "Session-trace file NOT stored: your standing consent is below 'traces'. Set it on /profile to keep traces." };
        }
      }
      // G2: the eval mark only on an eval project or from a test seat — refused before the body is stored
      if (isEvalMark(a.eval) || groupArg === "eval") { const er = await evalMarkRefused(person, await stampProjectLoose(person, env), env); if (er) return er; }
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const key = artifactKey(now().slice(0, 7), person.id, hash, "html");   // the logical key; src/storage.js puts it under the writer's org
      await store(env).put(key, bytes, { httpMetadata: { contentType: "text/html" } });
      const states = String(a.states || "").split(",").map((s) => s.trim()).filter(Boolean);
      const id = uid();
      const artProject = await stampProjectLoose(person, env); // ADR-100: saving never blocks on the axis
      const scr = await artifactScreens(env, artProject, String(a.screens || "").split(","));
      await db(env).prepare(
        "INSERT INTO artifacts (id,person_id,kind,title,r2_key,sha256,bytes,group_tag,created_at,screens,states,project,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,{org})"
      ).bind(id, person.id, "html", String(a.title).slice(0,200), key, hash, bytes.byteLength,
             a.public ? "public" : (isEvalMark(a.eval) ? "eval" : groupArg), now(), scr.valid.join(",") || null, states.join(",") || null, artProject).run();
      await db(env).prepare(
        "INSERT INTO events (id,session_id,person_id,kind,payload_json,created_at,org) VALUES (?,?,?,?,?,?,{org})"
      ).bind(uid(), null, person.id, "fragment", JSON.stringify({ artifactId:id, title:a.title, hash, ...(isEvalMark(a.eval) || a.group === "eval" ? { eval: 1 } : {}) }), now()).run();
      const res = { id, hash, bytes: bytes.byteLength, screens: scr.valid, states,
                    binding: scr.ok, public: !!a.public, deeplink: orgUrl(url.origin, "/artifact/" + id) };
      // D1b item 6: a picture of a screen is a render
      if (scr.list.length && (scr.unknown.length || scr.reserved.length)) res.note = `Kept as text only: ${[...scr.unknown, ...scr.reserved].join(", ")} (a file names no screen; a screen's picture is a render: formats {kind: "render"}).`;
      return res;
    }
    case "read_file": {
      // no id: the files you may read, the same seam GET /artifacts answers (src/core.js artifactsListFor)
      if (a.id == null || !String(a.id).trim()) return await artifactsListFor(person, env, await seatsOnce(env, person.id), { q: a.q, group: a.group, limit: a.limit });
      const row = await db(env).prepare(
        "SELECT a.*, p.name AS by_name FROM artifacts a JOIN people p ON p.id=a.person_id WHERE a.id=?"
      ).bind(String(a.id).replace(/[^a-zA-Z0-9-]/g,"")).first();
      // ADR-055 parity with GET /artifact/:id: a public file serves to anyone; one the caller may not read is not_found
      if (!(await mayReadArtifact(person, row, env))) return { error: "not_found" };
      if (a.meta) return { id: row.id, title: row.title, by: row.by_name, at: row.created_at,
                           bytes: row.bytes, sha256: row.sha256, screens: row.screens, states: row.states };
      return (await fileText(env, row)) ?? { error: "blob_missing" };
    }
    // sprint 3, D2 (B7): the two Broadcast verbs, the SAME function their REST twins call (src/broadcast.js)
    // sprint 7, 7.5b: reg.previewOpts.confirm is the confirm's binding (src/confirm.js), written into the verb's confirm row
    case "publish": { const { http, ...out } = await publishAnswer(env, person, { id: a.id, confirm: a.confirm, eval: a.eval }, { via: "mcp", ...(reg && reg.previewOpts && reg.previewOpts.confirm ? { confirm: reg.previewOpts.confirm } : {}) }); return out; }
    case "equip": { const { http, ...out } = await equipAnswer(env, person, { slug: a.slug, v: a.v, project: a.project, confirm: a.confirm, eval: a.eval }, { via: "mcp", ...(reg && reg.previewOpts && reg.previewOpts.confirm ? { confirm: reg.previewOpts.confirm } : {}) }); return out; }
    case "create_project": {
      // sprint 3 (B3): ONE code path with POST /control add-project (src/admin.js addProject); the owner's read-only credential
      // is refused here, as POST /control refuses it. Not previewed: an admin act.
      if (person.readOnly) return { error: "read_only_credential", note: "A read-only credential cannot create a project. Use your full key. Nothing was created." };
      const r = await addProject(env, { key: a.key, name: a.name, eval: a.eval });
      if (r.error === "plan_limit") { const { flash, ...refusal } = r; return refusal; }   // sprint 8, 8.2: the plan's projects
      if (r.error) return { error: "bad_project", note: `${r.flash} Nothing was created.` };
      const c = await checklistFor(env, person, { project: r.key });
      const next = c.items.filter((it) => it.state === "partial" || it.state === "empty").slice(0, 3).map((it) => {
        const f = fillOfItem(it, r.key);
        return { id: it.id, piece: it.piece, what: whatOfItem(it, { owner: true }), fill: f.fillPath ? checklistCall(f.fillPath) : `Equip on Broadcast: ${f.href}`, fillPath: f.fillPath };
      });
      // sprint 13 (13.2): the note and tip name the project by its name and slug (the door reads the slug inside the org); project.key
      // stays the key (data)
      const pw = projectWords(r.name, r.key);
      return { project: { key: r.key, name: r.name }, created: !r.existed, reactivated: r.reactivated, ...(r.eval ? { eval: true } : {}),
        note: r.reactivated ? `Project ${pw} was archived and is active again.` : r.existed ? `Project ${pw} already exists and is active: nothing new was created.` : `Project ${pw} is created and active. You read it as the admin; seat people on it from Control.`,
        next, tip: `Fill it: send each call through preview, then file. \`missing\` with project "${projectSlug(r.key)}" lists every item.` };
    }
    // the twins of POST /versions/publish and POST /versions/restore: owner only (spec.owner above, and the seam checks again)
    case "publish_version": return await publishVersion(person, { project: a.project, title: a.title, eval: a.eval }, env, { via: "mcp" });
    case "restore_version": return await restoreVersion(person, { project: a.project, v: a.v, eval: a.eval }, env, { via: "mcp" });
  }
  return { error: "unimplemented", name };
}

// the resource templates (Mission D; UI-B6a/B7b/B8a) — resources/templates/list answers these, each description followed by
// RES_PROJECT_HINT (U-MCP D5, additive)
const RES_TEMPLATES = [
  { uriTemplate: "brain://brief/{ref}", name: "Brief for a ref",
    description: "The work packet for one ref (a node id, goal/<id>, q/<qid>, check/<id>, T-YYYYMMDD-NNN): the item, what it depends on and what depends on it, its checks and questions. The same read `brief` {for: <ref>} answers.",
    mimeType: "application/json" },
  { uriTemplate: "brain://map/node/{ref}", name: "One node of the map",
    description: "One node of the project's model (screen:<id>, door:<method>:<path>, table:<name>, goal/<id> …): its light, its checks, its edges and the card to open. The same read `map` {ref} and GET /map/node answer.",
    mimeType: "application/json" },
  { uriTemplate: "brain://map/{plane}", name: "One plane of the map",
    description: "arch, data, api, mcp, flows or deps: the same read `map` {plane} and GET /map/:plane answer.",
    mimeType: "application/json" },
  { uriTemplate: "brain://goal/{ref}", name: "One goal",
    description: "One goal of the project's tree (all time): its %, cells, the filings that name it and its child goals. The same read `goals` {ref} and GET /goals/:ref answer.",
    mimeType: "application/json" },
];
// RES_PROJECT_HINT — U-MCP D5 (Q0D506BBC): every brain:// resource reads one project, and takes ?project=<key> to pick it
const RES_PROJECT_HINT = "Add ?project=<key> to read one of your projects (the owner: any active project); left out, your active project, else the first you may read.";

// ---- MCP endpoint (ADR-044). Bearer auth through the SAME resolver as everything else. ----
// deps carries the three symbols that stay in index.js: MCP_TOOLS (the tool registry —
// check-mcp-parity.py regexes `{ name:"..." }` out of index.js) and VERSION. The serverInfo name is the org's, from its own row
// (serverFacts: the caller's org, signed in at the seam, src/data.js), never the worker's name (sprint 6, 6.3).
export async function handleMcp(request, env, ctx, url, deps) {
  const rq = await request.json().catch(() => null);
  if (!rq) return rpcErr(null, -32700, "parse error");
  // sprint 7, 7.5a: the org the request names (orgWantedOf: the same the router read before its sign-in), for callerOf
  deps = { ...deps, wantOrg: orgWantedOf(rq) };
  // D3b: a request carrying the stateless revision's _meta is served by that revision, whatever else the request says
  if (isModern(rq)) return await handleModern(rq, request, env, ctx, url, deps);
  // a JSON-RPC batch (2025-03-26): each message answered in turn, the replies as one array; notifications
  // carry no reply; a batch of notifications only is 202 with no body, like a single one.
  if (Array.isArray(rq)) {
    // D3b: the stateless revision takes ONE message a POST, so a batch holding a modern request is refused whole
    if (rq.some(isModern)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request: a request carrying _meta protocolVersion is sent alone, never in a batch" } }, 400);
    if (!rq.length) return rpcErr(null, -32600, "invalid request: empty batch");
    const out = [];
    for (const one of rq) {
      const r = await handleOne(one, request, env, ctx, url, deps, { inBatch: true });
      if (r.status !== 202) out.push(await r.json());
    }
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  return await handleOne(rq, request, env, ctx, url, deps);
}

async function handleOne(rq, request, env, ctx, url, deps, o = {}) {
  const { MCP_TOOLS, CAPABILITIES } = deps;
  if (!rq || typeof rq !== "object") return rpcErr(null, -32600, "invalid request");
  const id = rq.id ?? null;
  if (rq.method === "initialize") {
    const f = await serverFacts(env, deps, ctx);
    // sprint 3, D3: a session id ONLY for a client that declared form elicitation or the MCP Apps extension (src/confirm.js
    // sessionFor); every other client's initialize answer is what it was. The id carries the two flags and nothing else — and
    // (sprint 13, 13.1) the family word of a client whose clientInfo names a known one (src/client.js), which also earns an id
    const sid = sessionFor(rq.params && rq.params.capabilities, familyOfName(isObj(rq.params) && isObj(rq.params.clientInfo) ? rq.params.clientInfo.name : null));
    const init = json({ jsonrpc: "2.0", id, result: { protocolVersion: negotiateProtocol(rq.params && rq.params.protocolVersion),
      serverInfo: f.serverInfo, capabilities: f.capabilities, instructions: f.instructions } },
      200, sid ? { [SESSION_HEADER]: sid, "access-control-expose-headers": SESSION_HEADER } : {});
    return init;
  }
  // a notification (no id) is accepted with 202 and no body — the Streamable HTTP rule (2025-03-26 onward);
  // an older client reads any 2xx as accepted.
  if (typeof rq.method === "string" && rq.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (rq.method === "ping") return rpc(id, {});

  const caller = await callerOf(request, env, ctx, url, id, deps.wantOrg);
  if (caller.refused) return caller.refused;
  const who = caller.who;

  const session = sessionOf(request);
  // sprint 7's review (C4): an ACCOUNT grant acting in another org than its own on this revision is never asked a confirm — the
  // person's answer comes back as a JSON-RPC response naming no org, which signs in the grant's own seat and could never land on
  // the row (src/confirm.js recordAnswer binds it to its author): the two calls instead, said plainly
  const offOrg = !!(who && who.grantAccount && ctx && isObj(ctx.props) && Number(who.org) !== Number(ctx.props.org));
  // sprint 3, D3: a JSON-RPC RESPONSE from the client is its answer to a confirm this door asked (elicitation/create on a
  // preview's stream). It is recorded on the preview's row by ONE conditional UPDATE bound to the answering person, their
  // write right, the session and the nonce (src/confirm.js recordAnswer): 202 when recorded, else 400 and nothing changes.
  if (isResponse(rq)) {
    const r = await recordAnswer(env, who, session, rq, { canWrite: !who.readOnly && hasWriteScope(who) });
    if (r.recorded) return new Response(null, { status: 202 });
    return json({ jsonrpc: "2.0", error: { code: -32602, message: `${r.error}: ${r.note}` } }, 400);
  }
  if (rq.method === "tools/list") return rpc(id, toolsListOf(MCP_TOOLS, await listerOf(who, env)));
  if (rq.method === "tools/call") {
    const nm = rq.params?.name, args = rq.params?.arguments ?? {};
    // sprint 8, 8.2: the call counted at the door (callGate, above); a refused write answers 429 alone (in a batch, its item)
    const gate = await callGate(nm, env, MCP_TOOLS);
    if (gate.refusal) return withStatus(rpc(id, toolResult(gate.refusal, true, { card: false, tool: nm, origin: url.origin })), 429, retryHeaders(gate.refusal));
    const resultOf = (out, failed) => toolResult(withPlanWarning(out, env), failed, { card: !!(session && session.ui), tool: nm, origin: url.origin });
    if (nm === "preview" && args && typeof args === "object" && args.fileOnConfirm === true) {
      // the confirm (src/confirm.js): asked only of a client that declared elicitation, on a stream, outside a batch, in the
      // connection's own org (C4)
      const why = o.inBatch ? "batch" : !(session && session.elicit) ? "capability" : !acceptsStream(request) ? "stream" : offOrg ? "org" : null;
      if (!why) {
        const nonce = newNonce();
        const out = await callTool(nm, args, who, env, url, MCP_TOOLS, { CAPABILITIES, previewOpts: { confirm: await confirmState(nonce, session) } });
        const reason = confirmPlan(out);
        if (!reason) {
          return confirmStream({ preview: out, args, env, ctx, session, rpcId: id, nonce,
            fileCall: (items, previewId) => callTool("file", { previewId, items }, who, env, url, MCP_TOOLS, { CAPABILITIES }),
            toResult: resultOf });
        }
        const { confirmUntil, ...plain } = out && typeof out === "object" ? out : { answer: out };
        const failed = !!(out && out.error);
        return rpc(id, resultOf(failed ? out : { ...plain, confirm: { asked: false, note: reason } }, failed));
      }
      const out = await callTool(nm, args, who, env, url, MCP_TOOLS, { CAPABILITIES });
      const failed = !!(out && out.error);
      return rpc(id, resultOf(failed ? out : { ...out, confirm: { asked: false, note: NOT_ASKED[why] } }, failed));
    }
    // sprint 7, 7.5b: publish {publishOnConfirm: true} / equip {equipOnConfirm: true} — the same confirm, on the call's own stream
    const verb = verbOf(nm);
    if (verb && isObj(args) && args[verb.flag] === true) {
      const why = o.inBatch ? "batch" : !(session && session.elicit) ? "capability" : !acceptsStream(request) ? "stream" : offOrg ? "org" : null;
      const plainArgs = verbArgs(verb, args);
      if (!why) {
        const nonce = newNonce();
        const out = await callTool(nm, plainArgs, who, env, url, MCP_TOOLS, { CAPABILITIES, previewOpts: { confirm: { ...(await confirmState(nonce, session)), digest: await verbDigest(verb, args) } } });
        const reason = verbConfirmPlan(out, verb);
        if (!reason) {
          return confirmStream({ preview: out, args: {}, env, ctx, session, rpcId: id, nonce, verb, ask: verbAsk(out, verb), base: verbBase(out),
            fileCall: async (_items, rowId) => verbOnYes(verb, rowId, who, env, url, deps), toResult: resultOf });
        }
        const failed = !!(out && out.error);
        return rpc(id, resultOf(failed ? out : { ...verbBase(out), confirm: { asked: false, note: reason } }, failed));
      }
      const out = await callTool(nm, plainArgs, who, env, url, MCP_TOOLS, { CAPABILITIES });
      const failed = !!(out && out.error);
      return rpc(id, resultOf(failed ? out : { ...out, confirm: { asked: false, note: notAskedNote(why, verb) } }, failed));
    }
    const out = await callTool(nm, args, who, env, url, MCP_TOOLS, { CAPABILITIES });
    const failed = !!(out && out.error);
    return rpc(id, resultOf(out, failed));
  }
  if (RESOURCE_METHODS.includes(rq.method)) {
    const r = await resourceAnswer(rq, who, env, url, deps);
    return r.error ? rpcErr(id, r.error.code, r.error.message) : rpc(id, r.result);
  }
  return rpcErr(id, -32601, `method not found: ${typeof rq.method === "string" ? rq.method.slice(0, 80) : typeof rq.method}`);
}

// resourceAnswer(rq, who, env, url, deps) -> { result } | { error: { code, message } }: ONE answer for both revisions, each door
// wraps it in its own envelope
const RESOURCE_METHODS = ["resources/list", "resources/templates/list", "resources/read"];
const resOk = (result) => ({ result });
const resErr = (code, message) => ({ error: { code, message } });
async function resourceAnswer(rq, who, env, url, deps) {
  const { MCP_TOOLS, CAPABILITIES } = deps;
  // MCP resources (M-ADR-008a T15, Mission D): the read-only surface as addressable resources a client can browse, not only
  // tool calls. The same reads, the same role rule (a doc's roleVisibility) as the tools.
  if (rq.method === "resources/list") {
    // the docs listed are the caller's default project's (a doc read names ?project= to read another's)
    const sc = await resolveProject(who, null, await seatsOnce(env, who.id), env);
    const lib = await libraryFor(sc.error ? env : sc.env, who);
    const resources = [{ uri: "brain://updates", name: "What changed for you and what waits on you", mimeType: "application/json" },
      { uri: "brain://missing", name: "What is missing: the checklist and the call that fills each item", mimeType: "application/json" },
      { uri: "brain://goals", name: "Goals: the project's goal tree (all time)", mimeType: "application/json" },
      { uri: "brain://gtm", name: "GTM: the project's go-to-market contributions and its gtm goals' numbers (all time)", mimeType: "application/json" },
      { uri: "brain://broadcast", name: "Broadcast: the org's shelf and what this project has equipped", mimeType: "application/json" },
      { uri: "brain://versions", name: "Versions: why each version of the project's knowledge exists, and what changed", mimeType: "application/json" }];
    for (const p of lib.docs) resources.push({ uri: "brain://doc/" + p, name: lib.titles[p] || p, mimeType: "text/markdown" });
    // U-MCP D5: additive — each entry says how to read one of your projects (the entries themselves are unchanged)
    for (const r of resources) r.description = RES_PROJECT_HINT;
    return resOk({ resources });
  }
  if (rq.method === "resources/templates/list") {
    // A brief is per-ref (unbounded), so it rides a resource TEMPLATE, not the flat list.
    return resOk({ resourceTemplates: RES_TEMPLATES.map((t) => ({ ...t, description: t.description + " " + RES_PROJECT_HINT })) });
  }
  if (rq.method === "resources/read") {
    // U-MCP D5 (Q0D506BBC): every brain:// resource is project-scoped and takes ?project=<key> — the same resolveProject the
    // tools and the seam call: a seat (the owner: any active project), refused -32003 project_forbidden (nothing is read);
    // absent -> the caller's active project, else the first they may read. The reply's uri is the one asked.
    const asked = String(rq.params?.uri || "");
    // sprint 3, D3: the card's template (MCP Apps: one static document, the same for every caller, holding nothing of theirs)
    if (asked === CARD_URI) return resOk({ contents: [{ uri: CARD_URI, mimeType: CARD_MIME, text: cardTemplate(), _meta: CARD_RESOURCE_META }] });
    // the card's fragment for one preview: the SAME read as the page GET /preview/:id (readPreviewView: its author, or a
    // reader of its project; a role-limited item hidden from anyone but the author), drawn by the card's renderer
    if (asked.startsWith(CARD_FRAGMENT_PREFIX)) {
      const pid = asked.slice(CARD_FRAGMENT_PREFIX.length);
      const view = PREVIEW_ID_RE.test(pid) ? await readPreviewView(env, who, pid) : null;
      if (!view) return resErr(-32002, "not_found");
      const { scopedEnv, ...v } = view;
      return resOk({ contents: [{ uri: asked, mimeType: "text/html", text: cardFragment(v, { origin: url.origin, tool: "preview" }) }] });
    }
    const qAt = asked.indexOf("?");
    const uri = qAt >= 0 ? asked.slice(0, qAt) : asked;
    let wantP = null, wantOrg = null;
    if (qAt >= 0) { try { const qs = new URLSearchParams(asked.slice(qAt + 1)); wantP = qs.get("project"); wantOrg = qs.get("orgSlug"); } catch { wantP = null; wantOrg = null; } }
    // sprint 7, 7.5a: ?orgSlug= names the org, as a tool's orgSlug does (orgArgRefused: another org than the request's is refused)
    const orgRefused = await orgArgRefused(wantOrg, who, env);
    if (orgRefused) return resErr(-32003, `org_unreachable: ${orgRefused.note}`);
    const sc = await resolveProject(who, wantP, await seatsOnce(env, who.id), env);
    if (sc.error) return resErr(-32003, `project_forbidden: ${sc.note}`);
    env = sc.env;
    if (sc.project && (sc.named || sc.active)) who = { ...who, token_project: sc.project };
    if (uri === "brain://updates") {
      // the same read the `updates` tool and GET /updates answer (src/updates.js updatesFor)
      const u = await updatesFor(who, env, {});
      return resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(u) }] });
    }
    if (uri === "brain://missing") {
      // what the project still needs, each open piece with the call that fills it: the same computeHoles the `missing` tool
      // and GET /missing read, in the scoped env
      const m = await computeHoles(env, who, await getTenantConfig(env), {});
      return resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(m) }] });
    }
    if (uri === "brain://goals") {
      // Goals (UI-B6a): the same read GET /goals and the `goals` tool answer (src/goalsread.js readGoals), all time
      const goals = await readGoals(env, who, {});
      return resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(goals) }] });
    }
    if (uri === "brain://gtm") {
      // GTM (UI-B10a): the same read GET /gtm and the `gtm` tool answer (src/gtmread.js), all time
      const gtm = await readGtmPipeline(env, who, {});
      return resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(gtm) }] });
    }
    if (uri === "brain://broadcast") {
      // Broadcast (UI-B11a): the same read GET /broadcast and the `broadcast` tool answer (src/broadcastread.js)
      const b = await readBroadcast(env, who, {});
      return resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(b) }] });
    }
    if (uri.startsWith("brain://map/node/")) {
      // one node of the map (UI-B7b): the same read GET /map/node and `map` {ref} answer
      let ref = ""; try { ref = decodeURIComponent(uri.slice("brain://map/node/".length)); } catch { ref = ""; }
      const r = await readMapNode(env, who, { ref });
      return r.status === 200 ? resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(r.body) }] }) : resErr(-32002, r.body.error || "unknown_node");
    }
    if (uri.startsWith("brain://map/")) {
      // one plane (UI-B8a door planes, UI-B8b model planes, UI-B9 flows and deps): the same read GET /map/:plane and `map` {plane} answer
      // (brain://map/node/ is above)
      let plane = ""; try { plane = decodeURIComponent(uri.slice("brain://map/".length)); } catch { plane = ""; }
      const r = await readMapPlane(env, who, plane, mapReg(CAPABILITIES || [], MCP_TOOLS, env));
      return r.status === 200 ? resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(r.body) }] }) : resErr(-32002, r.body.error || "unknown_plane");
    }
    if (uri.startsWith("brain://goal/")) {
      // one goal (UI-B6a): the same read GET /goals/:ref and `goals` {ref} answer
      let ref = ""; try { ref = decodeURIComponent(uri.slice("brain://goal/".length)); } catch { ref = ""; }
      const n = await readGoalNode(env, who, ref, {});
      return n ? resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(n) }] }) : resErr(-32002, "unknown_goal");
    }
    if (uri === "brain://versions") {
      // Versions (UI-B5b): the same read GET /versions and the `versions` tool answer (src/versionsview.js)
      const v = versionsJson(await readVersionsView(env, who, {}));
      return resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(v) }] });
    }
    if (uri.startsWith("brain://doc/")) {
      // the same read `read` {ref: "doc/<path>"} answers (src/docread.js docFor): the project's doc, the role rule, start-here's
      // built-in fallback
      let rel = ""; try { rel = decodeURIComponent(uri.slice("brain://doc/".length)); } catch { rel = ""; }
      const t = await docFor(env, who, rel);
      if (typeof t === "string") return resOk({ contents: [{ uri: asked, mimeType: "text/markdown", text: t }] });
      return resErr(-32002, t.error || "not_found");
    }
    if (uri.startsWith("brain://brief/")) {
      // the work packet from D1: the same read `brief` {for: <ref>} answers (src/extract.js briefAnswer)
      let ref = ""; try { ref = decodeURIComponent(uri.slice("brain://brief/".length)); } catch { ref = ""; }
      const out = await briefAnswer(env, who, { for: ref });
      return out && !out.error ? resOk({ contents: [{ uri: asked, mimeType: "application/json", text: JSON.stringify(out) }] }) : resErr(-32002, (out && out.error) || "not_found");
    }
    return resErr(-32602, `unknown resource uri: ${uri}`);
  }
}

// serverFacts(env, deps) -> what initialize and server/discover say of the server: its name for a person ("sharingu — <org>", the
// org's name from its own row: the caller's org when the seam signed them in, else the org the address serves; no org name:
// "sharingu"), its capabilities, the first-run instructions
// sprint 7, 7.5a: the org is the one the request signed in to (for an ACCOUNT grant, its current org), and an account grant's
// instructions add the line that says whoami lists its other orgs and a call names one (instructionsFor's account)
async function serverFacts(env, { VERSION }, ctx) {
  const tenant = await getTenantConfig(env);
  const org = tenant.brand && tenant.brand.org;
  const account = !!(ctx && grantKindOf(ctx.props) === GRANT_KINDS.account);
  return { serverInfo: { name: serverNameOf(org), version: VERSION }, capabilities: { tools: {}, resources: {} },
    instructions: instructionsFor({ org, startHere: START_HERE_DOC, account }) };
}
// callerOf(request, env, ctx, url, id, wantOrg, declared?) -> { who } | { refused: Response }: the caller, for both revisions
// (declared: the stateless revision's _meta clientInfo name; left out, the handshake revision's session id says it)
async function callerOf(request, env, ctx, url, id, wantOrg = "", declared = undefined) {
  // bearer (Claude Code / Desktop) OR OAuth props (claude.ai) — same resolver either way.
  // OAuth puts the verified identity on ctx.props; a plain bearer resolves the usual way.
  // sprint 7's review (C5): the one /mcp is the platform's and takes no cookie — a bearer or an OAuth grant, nothing else (a dead
  // bearer is a 401, never the seat of a cookie riding beside it)
  // sprint 7, 7.5a: wantOrg (orgWantedOf) picks an ACCOUNT grant's seat; every other credential ignores it
  const who = await resolveReader(request, env, url, { props: ctx && ctx.props, wantOrg });
  // sprint 8's review (A1): the seat this call acts as marks the plan slot (src/plans.js setPlanReader): a Partner's warnings and
  // refusals carry no count of the org's
  if (who) setPlanReader(env, isPartnerReader(who));
  // sprint 13, 13.1: which AI files through this call (src/client.js clientFamilyOf): the OAuth grant's family word (its client's
  // registered name, kept on the grant's props when it was made: src/oauth.js), else the client's own clientInfo name (the
  // stateless revision's _meta, `declared`; the handshake revision's session id), else other. Self-declared: a label, not proof.
  if (who) {
    const props = ctx && isObj(ctx.props) ? ctx.props : null;
    const session = declared === undefined ? sessionOf(request) : null;
    setRequestClient(clientFamilyOf({ oauth: props && typeof props.client === "string" ? props.client : null,
      mcp: declared === undefined ? (session && session.client) : declared, door: "mcp" }));
  }
  // every link the answer carries is under the caller's org (src/orgpath.js; the router sets it for a bearer it signed in)
  if (who && !orgBase()) setOrgBase((await getTenantConfig(env)).slug);
  // G2 M1: an OAuth token the provider still holds whose person the door refuses (their key or passphrase changed since the
  // grant, or they were removed) is an invalid token: 401 with the OAuth challenge, so the client connects again
  // sprint 7, 7.5b: a grant minted before the stamp existed (grantStampless) is told so: it never stood on a credential to change
  if (!who && ctx && ctx.props && typeof ctx.props === "object" && Object.keys(ctx.props).length) {   // the provider's props: an OAuth token
    const words = grantStampless(ctx.props) ? STAMPLESS_WORDS : "This connection no longer stands: the person's key or passphrase changed, or they were removed. Connect again.";
    return { refused: new Response(JSON.stringify({ error: "invalid_token", error_description: words }),
      { status: 401, headers: { "content-type": "application/json", "www-authenticate": 'Bearer error="invalid_token"' } }) };
  }
  if (!who) return { refused: rpcErr(id, -32001, "unauthorized: send Authorization: Bearer <token>") };
  return { who };
}
// listerOf(who, env) -> who tools/list lists for (sprint 7, 7.5a): an ACCOUNT grant lists every tool ANY of its account's active seats
// may call (an admin of one of its orgs sees the admin tools), since a call may name that org; each call is still checked as the
// seat it signs in as (callTool: owner_only for a member's seat). Any other caller: itself. One read (orgsOfAccount), account
// grants only.
async function listerOf(who, env) {
  if (!who || !who.grantAccount || who.role === "owner") return who;
  const orgs = await whoamiOrgs(who, env, {});
  return orgs.orgs.some((o) => o.role === "owner") ? { ...who, role: "owner" } : who;
}
// toolsListOf(tools, who) -> the tools/list result: the tools THIS caller may call; the card's tools carry _meta.ui.resourceUri
// (sprint 3, D3: MCP Apps; a host without the extension ignores _meta)
const toolsListOf = (tools, who) => ({ tools: tools.filter((x) => toolCallable(x, who)).map((x) => ({ ...toolEntry(x), ...(CARD_TOOLS.includes(x.name) ? { _meta: CARD_TOOL_META } : {}) })) });
// toolResult(out, failed, { card, tool, origin }) -> a tools/call result: the answer as text (every client), and for a client
// that declared the Apps extension the card's fragment in _meta (not model context), drawn by the same renderer as the app's
// preview page
function toolResult(out, failed, { card, tool, origin }) {
  const html = card && CARD_TOOLS.includes(tool) && !failed ? cardFragment(out, { origin, tool }) : "";
  return { ...asText(out), isError: failed, ...(html ? { _meta: { [CARD_META_KEY]: { html } } } : {}) };
}

// verbOnYes(verb, rowId, who, env, url, deps) -> the verb's own answer, run once on the person's yes (7.5b): the confirm row is
// claimed (src/confirm.js claimVerb: the author's, of this verb, answered accept, once) and the verb runs with confirm: true on
// the args its preview showed, through the same callTool as the two calls (the write scope, the Partner and seat rules, the
// read-only refusal), as the person; a row that cannot be claimed runs nothing
async function verbOnYes(verb, rowId, who, env, url, { MCP_TOOLS, CAPABILITIES }) {
  const stored = await claimVerb(env, rowId, who, verb);
  if (!stored) return { ...NOT_YOURS_TO_CLAIM, note: `${NOT_YOURS_TO_CLAIM.note} Nothing was ${verb.done}. ${verb.retry}` };
  return await callTool(verb.name, { ...stored, confirm: true }, who, env, url, MCP_TOOLS, { CAPABILITIES });
}
const NOT_YOURS_TO_CLAIM = { error: "confirm_not_open", note: "No open confirm of yours has this id." };

// ---- D3b: the stateless revision (2026-07-28) ----
// handleModern: ONE request (or notification) a POST, no session. In order: a notification is accepted (202); the request's
// version (-32022), its declared capabilities (-32602) and the mirror headers (-32020) are checked, each a 400; a method the
// revision does not define is 404 + -32601; server/discover answers before auth, as initialize does; every other method
// authenticates exactly as the handshake revision does (callerOf) and answers the same body, with resultType and the
// server's name in _meta. Capabilities are the request's own (_meta clientCapabilities): elicitation decides the confirm,
// the Apps extension the card. An Mcp-Session-Id header is ignored and none is ever sent.
async function handleModern(rq, request, env, ctx, url, deps) {
  const { MCP_TOOLS } = deps;
  if (typeof rq.method === "string" && rq.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  const id = rq.id ?? null;
  const fail = (code, message, status = 400, data) => json({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } }, status);
  if (id === null || !(typeof id === "string" || typeof id === "number")) return fail(-32600, "invalid request: a request carries an id (a string or a number)");
  if (typeof rq.method !== "string") return fail(-32600, "invalid request: method is a string");
  const meta = rq.params._meta;
  const version = meta[META_PROTOCOL];
  if (!MODERN_PROTOCOLS.includes(version)) return fail(-32022, "Unsupported protocol version", 400, { supported: MODERN_PROTOCOLS, requested: version.slice(0, 80) });
  const caps = meta[META_CAPS];
  if (!isObj(caps)) return fail(-32602, `Invalid params: _meta["${META_CAPS}"] is required`);
  const mismatch = mirrorMismatch(request.headers, rq);
  if (mismatch) return fail(-32020, mismatch);
  if (!MODERN_METHODS.includes(rq.method)) return fail(-32601, `Method not found: ${String(rq.method).slice(0, 80)}`, 404);

  const facts = await serverFacts(env, deps, ctx);
  // ok(result, cache) -> a modern result: resultType "complete" unless the result names its own, the server's name in _meta
  const ok = (result, cache) => json({ jsonrpc: "2.0", id, result: { resultType: "complete", ...result, ...(cache || {}), _meta: { ...(result._meta || {}), [META_SERVER]: facts.serverInfo } } });
  if (rq.method === "server/discover") return ok({ supportedVersions: MODERN_PROTOCOLS, capabilities: facts.capabilities, instructions: facts.instructions }, CACHE_PUBLIC);

  const ci = meta[META_CLIENT];
  const caller = await callerOf(request, env, ctx, url, id, deps.wantOrg, isObj(ci) && typeof ci.name === "string" ? ci.name : null);
  if (caller.refused) return caller.refused;
  const who = caller.who;
  if (rq.method === "tools/list") return ok(toolsListOf(MCP_TOOLS, await listerOf(who, env)), CACHE_PRIVATE);
  if (rq.method === "tools/call") return await modernToolCall(rq, caps, who, env, url, deps, { ok, fail });
  const r = await resourceAnswer(rq, who, env, url, deps);
  // the revision retired the legacy sub-range: a resource not found (-32002) and a project refused (-32003) are -32602
  return r.error ? fail(r.error.code === -32002 || r.error.code === -32003 ? -32602 : r.error.code, r.error.message, 200) : ok(r.result, CACHE_PRIVATE);
}

// modernToolCall: tools/call on the stateless revision. The same callTool as the handshake revision; the confirm (preview
// {fileOnConfirm: true}) is an "input required" answer and its retry (src/confirm.js, MRTR) instead of a stream.
async function modernToolCall(rq, caps, who, env, url, deps, { ok, fail }) {
  const { MCP_TOOLS, CAPABILITIES } = deps;
  const p = rq.params, nm = p.name, args = p.arguments ?? {};
  if (typeof nm !== "string") return fail(-32602, "Invalid params: name is a string");
  // sprint 8, 8.2: the call counted at the door (callGate); a refused write answers 429 with Retry-After
  const gate = await callGate(nm, env, MCP_TOOLS);
  if (gate.refusal) return withStatus(ok(toolResult(gate.refusal, true, { card: false, tool: nm, origin: url.origin })), 429, retryHeaders(gate.refusal));
  const resultOf = (out, failed) => toolResult(withPlanWarning(out, env), failed, { card: rendersCard(caps), tool: nm, origin: url.origin });
  const plainOf = (out, note) => {
    const { confirmUntil, ...plain } = isObj(out) ? out : { answer: out };
    const failed = !!(out && out.error);
    return ok(resultOf(failed ? out : { ...plain, confirm: { asked: false, note } }, failed));
  };
  // sprint 7, 7.5b: publish and equip ask the same confirm — its retry (the person's answer), then the first call
  const verb = verbOf(nm);
  if (verb && p.requestState !== undefined) {
    const orgRefused = await orgArgRefused(isObj(args) ? args.orgSlug : undefined, who, env);
    if (orgRefused) return ok(resultOf(orgRefused, true));
    if (!elicitsForm(caps)) return fail(-32021, "Missing required client capability: elicitation (form) answers a confirm", 400, { requiredCapabilities: { elicitation: { form: {} } } });
    const word = inputWord(p.inputResponses);
    if (!word) return fail(-32602, `bad_answer: send inputResponses.file, the person's answer (accept, decline or cancel). Nothing was recorded or ${verb.done}.`);
    // bound to this verb's row and to the call as sent (its digest): a state never crosses tools, a changed call records nothing
    const r = await recordInput(env, who, p.requestState, word, { canWrite: !who.readOnly && hasWriteScope(who), verb: verb.name, digest: await verbDigest(verb, args) });
    if (!r.recorded) return fail(-32602, `${r.error}: ${r.note} Call ${verb.name} again with ${verb.flag}: true for a new confirm, or with confirm: true once the person said yes.`);
    if (word !== "accept") {
      // the preview again (a read: nothing written), so the card and the two calls stand beside the answer
      const pv = await callTool(nm, verbArgs(verb, args), who, env, url, MCP_TOOLS, { CAPABILITIES });
      return ok(resultOf({ ...(isObj(pv) && !pv.error ? pv : {}), confirm: { asked: true, answer: word, filed: false, note: answerNote(word, verb) } }, false));
    }
    const out = await verbOnYes(verb, r.previewId, who, env, url, deps);
    const failed = !!(out && out.error);
    return ok(resultOf({ ...(isObj(out) ? out : { answer: out }), confirm: { asked: true, answer: "accept", filed: !failed } }, failed));
  }
  if (verb && isObj(args) && args[verb.flag] === true) {
    const plainArgs = verbArgs(verb, args);
    if (!elicitsForm(caps)) {
      const out = await callTool(nm, plainArgs, who, env, url, MCP_TOOLS, { CAPABILITIES });
      const failed = !!(out && out.error);
      return ok(resultOf(failed ? out : { ...out, confirm: { asked: false, note: notAskedNote("capability", verb) } }, failed));
    }
    const nonce = newNonce();
    const out = await callTool(nm, plainArgs, who, env, url, MCP_TOOLS, { CAPABILITIES, previewOpts: { confirm: { ...(await mrtrState(nonce, who.id)), digest: await verbDigest(verb, args) } } });
    const reason = verbConfirmPlan(out, verb);
    if (reason) { const failed = !!(out && out.error); return ok(resultOf(failed ? out : { ...verbBase(out), confirm: { asked: false, note: reason } }, failed)); }
    return ok(inputRequiredOf(out, nonce, verbAsk(out, verb)));
  }
  if (nm === "preview" && p.requestState !== undefined) {
    // sprint 7, 7.5a: the retry files without callTool's own check, so the call's org is checked here first (orgArgRefused)
    const orgRefused = await orgArgRefused(isObj(args) ? args.orgSlug : undefined, who, env);
    if (orgRefused) return ok(resultOf(orgRefused, true));
    // the retry: the person's answer to the confirm this door asked. Nothing is recorded unless the request declares form
    // elicitation (it answers one), carries an answer, and its state names an open confirm of this caller's (recordInput).
    if (!elicitsForm(caps)) return fail(-32021, "Missing required client capability: elicitation (form) answers a confirm", 400, { requiredCapabilities: { elicitation: { form: {} } } });
    const word = inputWord(p.inputResponses);
    if (!word) return fail(-32602, "bad_answer: send inputResponses.file, the person's answer (accept, decline or cancel). Nothing was recorded or filed.");
    // 7.5b: bound to a preview of items (verb null): a verb's confirm row is never answered by a preview's retry
    const r = await recordInput(env, who, p.requestState, word, { canWrite: !who.readOnly && hasWriteScope(who), verb: null });
    if (!r.recorded) return fail(-32602, `${r.error}: ${r.note} Preview again, then call file with the previewId it answers and the same items.`);
    if (word !== "accept") return ok({ ...asText({ previewId: r.previewId, url: orgUrl(url.origin, `/preview/${r.previewId}`), confirm: { asked: true, answer: word, filed: false, note: ANSWER_NOTE[word] } }), isError: false });
    // accept: the SAME file path as the two calls (the write scope, the author's project scope, the digest: items that differ
    // from the preview's are refused there)
    const out = await callTool("file", { previewId: r.previewId, items: args.items }, who, env, url, MCP_TOOLS, { CAPABILITIES });
    const failed = !!(out && out.error);
    return ok(resultOf({ ...(isObj(out) ? out : { answer: out }), confirm: { asked: true, answer: "accept", filed: !failed } }, failed));
  }
  if (nm === "preview" && isObj(args) && args.fileOnConfirm === true) {
    // asked only of a request that declared form elicitation (never an input request it did not declare)
    if (!elicitsForm(caps)) return plainOf(await callTool(nm, args, who, env, url, MCP_TOOLS, { CAPABILITIES }), NOT_ASKED.capability);
    const nonce = newNonce();
    const out = await callTool(nm, args, who, env, url, MCP_TOOLS, { CAPABILITIES, previewOpts: { confirm: await mrtrState(nonce, who.id) } });
    const reason = confirmPlan(out);
    if (reason) return plainOf(out, reason);
    return ok(inputRequiredOf(out, nonce));
  }
  const out = await callTool(nm, args, who, env, url, MCP_TOOLS, { CAPABILITIES });
  const failed = !!(out && out.error);
  return ok(resultOf(out, failed));
}
