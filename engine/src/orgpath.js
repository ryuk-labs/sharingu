// src/orgpath.js — THE one helper every URL the worker builds goes through (sprint 7, slice 7.4; docs/plan/PLATFORM.md §2 item 9:
// each org at agent.ryuklabs.io/<org> for every page; the AI at the one /mcp; the platform's own doors at the root).
//
//   orgPath(path)          an APP path (a page, a REST twin, a form's action, a render, a file) with the request's org base in
//                          front: "/home" -> "/ryuklabs/home". A PLATFORM path (PLATFORM_PATHS: the sign-in, the sign-up, creating
//                          an org, the MCP door, OAuth, the static files) is answered as it is: it lives at the root. A path that
//                          already carries the base, an absolute URL and anything not opening with "/" are answered unchanged.
//   orgUrl(origin, path)   the same, absolute: origin + orgPath(path) (a link an MCP or REST answer carries)
//   orgBase()              the base itself: "/<slug>", or "" (no org: an anonymous page at the root, the cron, a unit test)
//
// WHERE THE BASE COMES FROM: the request's async context (AsyncLocalStorage, the `nodejs_als` compatibility flag), opened once per
// request by the worker's entry (src/index.js workerHandler.fetch: inRequest) and set once by the router (setOrgBase): the
// ADDRESS's slug under an org's address (/<slug>/…), or, for a bearer at the root (an MCP client, a script), the signed-in org's
// slug (its org row: src/tenant.js). It is never a parameter and never module-global state: two requests an isolate interleaves
// each read their own. Code that runs outside a request (the cron, a selftest rendering a page) reads "" and builds root paths.
//
// THE CLIENT TWIN (ORG_PATH_CLIENT): a page's own scripts call `orgPath(p)` too; the shell writes the base on <html
// data-org-base> from orgBase() (src/shell.js), and the twin reads it there.
// tools/check-org-paths.mjs (a gate step) fails any app path written as a literal outside orgPath's argument.
import { AsyncLocalStorage } from "node:async_hooks";

// PLATFORM_PATHS — the first segments that live at the ROOT only, never under an org's address (and never prefixed): the
// platform's front door (sign-in, sign-out, sign-up, request access, creating an org, the installer), the AI's one address (/mcp), the OAuth
// provider and its discovery documents, the health check and the static files. Under an org's address each answers 404
// (src/index.js routeRequest), the same for every org.
export const PLATFORM_PATHS = new Set(["login", "logout", "signup", "request-access", "orgs", "install", "mcp", "oauth", ".well-known", "health", "fonts", "assets", "favicon.svg"]);
// PLATFORM_ROOT — the platform's own front page (sprint 21, 21.3: the showcase, src/showcase.js), never an org's home: the front
// door's pages (src/login.js frontTop, the walkthrough's section, src/walkthrough.js) link it as it is, because they belong to
// no org; an org's own pages reach their org's root through orgPath("/").
export const PLATFORM_ROOT = "/";

const ALS = new AsyncLocalStorage();
// inRequest(fn) -> fn's answer, run inside a fresh request context (its base "" until setOrgBase)
export const inRequest = (fn) => ALS.run({ base: "" }, fn);
// setOrgBase(slug) — the router's one write: the request's org base, "/<slug>" ("" for none). Outside a request: nothing.
export function setOrgBase(slug) {
  const st = ALS.getStore();
  if (st) st.base = slug ? "/" + String(slug) : "";
}
// orgBase() -> "/<slug>" or ""
export const orgBase = () => { const st = ALS.getStore(); return (st && st.base) || ""; };
// requestStore() -> the request's own context object (null outside a request): src/client.js keeps the request's client word on it
export const requestStore = () => ALS.getStore() || null;

// firstSeg(path) -> the path's first segment, lower-cased ("/goals/x?y" -> "goals")
const firstSeg = (p) => (String(p).split(/[?#]/)[0].split("/").filter(Boolean)[0] || "").toLowerCase();
// isPlatformPath(path) -> true when the path lives at the root only
export const isPlatformPath = (p) => PLATFORM_PATHS.has(firstSeg(p));

// orgPath(path) -> the path under the request's org (see above)
export function orgPath(path) {
  const p = String(path == null ? "" : path);
  const base = orgBase();
  if (!base || !p.startsWith("/") || p.startsWith("//") || isPlatformPath(p)) return p;
  if (p === base || p.startsWith(base + "/") || p.startsWith(base + "?") || p.startsWith(base + "#")) return p;
  if (p === "/") return base;
  if (p.startsWith("/?") || p.startsWith("/#")) return base + p.slice(1);
  return base + p;
}
// orgUrl(origin, path) -> the absolute URL of orgPath(path) on origin
export const orgUrl = (origin, path) => String(origin || "") + orgPath(path);

// ---- ANOTHER org's address (sprint 7, 7.4b: the org picker at the root, the rail's org switcher) ----
// ORG_LANDING — the page a person lands on in an org they pick: its Home
export const ORG_LANDING = "/home";
// inOrgPath(p) -> p when it is a page path an org's address can carry ("/map?layer=screens"): opening with one "/", not a platform
// door, not another address; else "" (the caller's default). A same-origin path only: no scheme, no "//", no backslash.
export function inOrgPath(p) {
  const s = String(p == null ? "" : p);
  if (!s.startsWith("/") || s.startsWith("//") || /[\\\s]/.test(s) || isPlatformPath(s)) return "";
  return s;
}
// orgAt(slug, path) -> the path `path` (an in-org page, default ORG_LANDING) under the org whose path name is `slug`:
// "/<slug>/home". The slug is an org row's own (the reader's account's seats: src/accounts.js orgsOfAccount), never typed
export function orgAt(slug, path) {
  const rest = inOrgPath(path) || ORG_LANDING;
  return "/" + String(slug || "") + (rest === "/" ? "" : rest);
}

// the client twin (a page's own scripts): the same rule over <html data-org-base>, written by the shell from orgBase(). The shell
// carries it in its head, and each page client that builds a URL (the Map's, the Screens view's, the Arch view's, Broadcast's
// live picture) carries it too, so a client is whole on its own (the selftests run one alone)
export const ORG_PATH_CLIENT = "var orgPath=function(p){p=String(p==null?'':p);var e=typeof document!=='undefined'&&document.documentElement,b=(e&&e.getAttribute&&e.getAttribute('data-org-base'))||'';" +
  "if(!b||p.charAt(0)!=='/'||p.charAt(1)==='/')return p;var s=(p.split(/[?#]/)[0].split('/').filter(Boolean)[0]||'').toLowerCase();" +
  `if(${JSON.stringify([...PLATFORM_PATHS])}.indexOf(s)>=0)return p;if(p===b||p.indexOf(b+'/')===0||p.indexOf(b+'?')===0)return p;` +
  "if(p==='/')return b;if(p.charAt(1)==='?'||p.charAt(1)==='#')return b+p.slice(1);return b+p;};";
