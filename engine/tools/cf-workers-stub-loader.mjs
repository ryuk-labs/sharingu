// cf-workers-stub-loader.mjs — a Node ESM loader hook that stubs the `cloudflare:*` module scheme
// (this batch, 2026-09-23). src/index.js's own module graph (src/index.js -> src/oauth.js ->
// @cloudflare/workers-oauth-provider) imports `cloudflare:workers` at the top level — a binding
// only the real Workers runtime (workerd) provides. Plain Node has no loader for that scheme at
// all, so importing src/index.js directly (the ONLY way to drive its default export — the exact
// artifact `sh tools/ship.sh` deploys — through a real Request/Response, rather than hand-mirroring
// route logic) throws ERR_UNSUPPORTED_ESM_URL_SCHEME before a single line of route code runs.
//
// This hook resolves every `cloudflare:*` bare specifier to an inert stub exporting the handful of
// symbols the dependency graph destructures (WorkerEntrypoint · DurableObject · RpcTarget · exports ·
// WorkflowEntrypoint · EmailMessage) — enough for the module graph to LOAD. Nothing a route-level
// selftest exercises ever touches OAuthProvider's own machinery (that's only reached by the
// /oauth/* paths), so the stub is never actually called into, only present so `import` succeeds.
//
// Register with `node:module`'s `register()` BEFORE dynamically importing the real target — a
// static top-level `import` in the entry file itself resolves before any of the entry file's own
// code (including a call to `register()`) can run, so callers must `await import(...)` the target
// after registering, not `import` it statically. See tools/login-csrf-route-selftest.mjs.
const STUB_SOURCE = [
  "export class WorkerEntrypoint {}",
  "export class DurableObject {}",
  "export class RpcTarget {}",
  "export const exports = {};",
  "export class WorkflowEntrypoint {}",
  "export class EmailMessage {}",
].join("\n");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("cloudflare:")) {
    return { url: "cf-workers-stub:" + specifier, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("cf-workers-stub:")) {
    return { format: "module", source: STUB_SOURCE, shortCircuit: true };
  }
  return nextLoad(url, context);
}
