// src/orgnames.js — an org's PATH NAME (sprint 7, slice 7.3; docs/plan/PLATFORM.md §2 item 9: each org at
// agent.ryuklabs.io/<org>, "org names never take a name the platform uses (login, mcp, docs, every route of the door)").
// Pure: no statement, no binding. migrate-072's org.slug holds the name; its CHECK is the SQL twin of orgSlugProblem's form.
//
// THE RESERVED NAMES ARE DERIVED, never kept by hand: reservedNames(capabilities) is the first path segment of every route
// the door's own registry declares (src/index.js CAPABILITIES, the same rows GET /capabilities and the contract answer), plus
// the platform's fixed words (PLATFORM_WORDS: the doors that live outside the registry — the OAuth provider's paths, the
// well-known documents, the static files — and the words a platform keeps for itself). src/index.js builds the set once from
// CAPABILITIES, so a route added to the registry is reserved the moment it exists. tools/check-org-names.mjs (a gate step)
// proves the other half: every first segment ANY route answers (each route table's test, the OAuth provider's paths) is in
// the set, so a route outside the registry cannot be shadowed by an org that took its name first; and its --slugs mode fails
// loudly when an org already holds a name a route wants (the ship's preflight).
// A slug derived by migrate-072's trigger for an operator's org is `<name>-<id>`: no reserved name ends in a dash and digits
// (the check asserts it), so a derived slug is never a route's.

// the platform's fixed words: the doors outside the registry and the names a platform keeps (each lower-case)
export const PLATFORM_WORDS = [
  // the doors outside CAPABILITIES (src/oauth.js: the OAuth provider and its discovery documents; src/index.js: the static files)
  "oauth", ".well-known", "favicon.svg", "fonts", "render",
  // the front door's pages and the AI's one address (PLATFORM §2 item 9)
  "login", "logout", "signup", "signin", "signout", "mcp", "docs", "install", "health",
  // the words a platform keeps for what it may answer at its own top level
  "api", "admin", "app", "assets", "static", "public", "www", "help", "about", "privacy", "terms", "legal", "security",
  "status", "support", "settings", "account", "accounts", "org", "orgs", "new", "dashboard", "billing", "pricing", "blog",
  "auth", "register", "token", "authorize", "callback", "robots.txt", "sitemap.xml", "operator", "platform", "sharingu",
];
// ORG_SLUG_MIN · ORG_SLUG_MAX: an org's path name, 2 to 40 characters (migrate-072's CHECK)
export const ORG_SLUG_MIN = 2;
export const ORG_SLUG_MAX = 40;
// a-z, 0-9 and single dashes, never opening or closing on a dash
const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/;

// firstSegment(path) -> the first segment of a route's path, lower-cased ("/goals/:ref" -> "goals"; "/" -> "")
export function firstSegment(path) {
  const p = String(path == null ? "" : path).split(/[?#]/)[0];
  return (p.split("/").filter(Boolean)[0] || "").toLowerCase();
}
// reservedNames(capabilities) -> Set: every route's first segment the registry declares, and the platform's fixed words
export function reservedNames(capabilities) {
  const out = new Set(PLATFORM_WORDS);
  for (const c of Array.isArray(capabilities) ? capabilities : []) {
    const s = firstSegment(c && c.p);
    if (s && !s.startsWith(":")) out.add(s);
  }
  return out;
}
// normSlug(s) -> the slug as the door reads it (lower-cased, trimmed)
export const normSlug = (s) => String(s == null ? "" : s).toLowerCase().trim();
// orgSlugProblem(slug, reserved) -> "" (a fine path name) · "slug" (not the form: a-z, 0-9, single dashes, 2 to 40, no dash at
// either end) · "reserved" (a name the platform uses). Nothing is read: whether an org holds it is the creation's own question.
export function orgSlugProblem(slug, reserved) {
  const s = String(slug == null ? "" : slug);
  if (s.length < ORG_SLUG_MIN || s.length > ORG_SLUG_MAX || !SLUG_RE.test(s)) return "slug";
  if (reserved && reserved.has(s)) return "reserved";
  return "";
}
