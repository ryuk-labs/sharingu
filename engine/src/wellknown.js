// src/wellknown.js — the platform's answer to OpenAI's domain verification (sprint 11, 11.3; docs/plan/MARKETPLACE.md M4).
// OpenAI's app submission shows a token and fetches GET /.well-known/openai-apps-challenge on the MCP host, expecting the token
// as plain text and nothing else. The token is the DEPLOYMENT's, one per platform, never an org's: the operator writes it with the
// deployment's credentials (tools/operator.mjs set-openai-challenge / clear-openai-challenge) under ONE key of the grant store's
// KV namespace (OAUTH_KV; the OAuth provider keys its own records grant:, token:, client:, so this key is no grant's). Never a
// value typed into the code, never env. src/index.js routeRequest answers the route before the address, any sign-in or any D1
// read: one KV read.

// the one key the token lies under
export const OPENAI_CHALLENGE_KEY = "platform:openai-apps-challenge";
// a token: one line of URL-safe characters (RFC 3986's unreserved: A-Z a-z 0-9 - . _ ~), 1 to CHALLENGE_TOKEN_MAX of them
export const CHALLENGE_TOKEN_MAX = 512;
const TOKEN_RE = /^[A-Za-z0-9._~-]+$/;

// challengeTokenProblem(t) -> "" (a token this door may answer) or why not
export function challengeTokenProblem(t) {
  if (typeof t !== "string" || t === "") return "empty (the portal's token, as it shows it)";
  if (t.length > CHALLENGE_TOKEN_MAX) return `longer than ${CHALLENGE_TOKEN_MAX} characters`;
  if (!TOKEN_RE.test(t)) return "not one line of URL-safe characters (A-Z a-z 0-9 - . _ ~)";
  return "";
}

// challengeAnswer(env, method) -> the 200 text/plain answer carrying exactly the stored token, or null when none is stored (or
// what is stored is no token: the caller answers its ordinary not-found)
export async function challengeAnswer(env, method) {
  const t = env && env.OAUTH_KV ? await env.OAUTH_KV.get(OPENAI_CHALLENGE_KEY) : null;
  if (t == null || challengeTokenProblem(t)) return null;
  return new Response(method === "HEAD" ? null : t, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
