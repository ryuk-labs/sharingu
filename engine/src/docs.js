// docs.js — the PUBLIC adoption guide (Mission C, next-arc-plan). Served at /docs, no auth,
// brand-seamed (brand + domain ride the tenant seam, ADR-092 §4). NO tenant truth — this is the
// org-agnostic "how to use R" surface a stranger org reads before it has a seat: the base link
// (one secret · five calls), the envelope, and connect-your-Claude. Any org that runs this code
// gets its own /docs with its own name + domain, zero edits.
import { DEFAULT_BRAND } from "./tenant.js";
import { esc, pageHeader } from "./ui.js";

// connectSnippet({ org, mcpUrl, engine }) — the "connect your Claude" block, pulled out of
// renderDocs so src/home.js's first-five-minutes panel (M-ADR-026) can embed the same
// instructions without a second hand-typed copy. org/mcpUrl are taken as already-escaped
// strings (same contract renderDocs used inline before this split — the caller escapes,
// this just assembles). engine is optional: renderDocs passes it to keep its own trailing
// "ask <engine> anything" sentence inside the same paragraph (byte-identical /docs output);
// a caller that only wants the bare instructions (home.js) omits it and gets none of that
// sentence.
export function connectSnippet(opts) {
  const o = opts || {};
  const org = o.org || "";
  const mcpUrl = o.mcpUrl || "";
  const tail = o.engine
    ? ` Then ask ${o.engine} anything about ${org}: it answers in your role, from ${org}'s ruled truth.`
    : "";
  return `<p>Claude Code (terminal):</p>
  <pre>claude mcp add ${String(org).toLowerCase()}-r --transport http ${mcpUrl} \\
  --header "Authorization: Bearer &lt;your-key&gt;"</pre>
  <p>Claude Desktop or claude.ai: add a custom connector pointing at <code>${mcpUrl}</code> with the same bearer header.${tail}</p>`;
}

export function renderDocs(opts) {
  const brand = (opts && opts.brand) || DEFAULT_BRAND;
  const domain = (opts && opts.domain) || "";
  const org = esc(brand.org);
  const engine = esc(brand.engine);
  const host = esc(String(domain || "").replace(/^https?:\/\//, "") || "your-org-domain");
  const mcpUrl = esc((domain || "https://your-org-domain") + "/mcp");
  const call = (n, title, body) =>
    `<div class="d-call"><div class="d-n">${n}</div><div><div class="d-ct">${title}</div><div class="d-cb">${body}</div></div></div>`;
  return `<style>
  .docs-page{max-width:76ch}
  .docs-page .d-lede{font-size:15px;color:var(--bv-dark-text-2);margin:0 0 1.8rem;line-height:1.6}
  .docs-page h2{font:700 17px/1.3 var(--sans);letter-spacing:-.01em;color:var(--bv-dark-text);margin:2.2rem 0 .9rem;padding-bottom:.55rem;border-bottom:1px solid var(--bv-dark-3)}
  .docs-page p{font-size:14px;color:var(--bv-dark-text-2);line-height:1.6}
  .docs-page b{color:var(--bv-dark-text)}
  .docs-page a{color:var(--bv-orange)}
  .docs-page code{font-family:var(--mono);font-size:12px;color:var(--bv-dark-text);background:var(--bv-dark-3);border:1px solid var(--bv-dark-line-2);border-radius:6px;padding:1px 5px}
  .docs-page pre{font-family:var(--mono);font-size:12px;background:var(--bv-dark-2);border:1px solid var(--bv-dark-3);border-radius:10px;padding:12px 14px;overflow-x:auto;line-height:1.5;color:var(--bv-dark-text)}
  .docs-page .d-call{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--bv-dark-3)}
  .docs-page .d-n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--bv-orange-well);color:var(--bv-orange);font:600 15px/1 var(--display);display:flex;align-items:center;justify-content:center}
  .docs-page .d-ct{font:700 15px var(--sans);color:var(--bv-dark-text)}
  .docs-page .d-cb{font-size:13.5px;color:var(--bv-dark-text-2);margin-top:4px;line-height:1.55}
  .docs-page .d-key{background:var(--bv-dark-2);border:1px solid var(--bv-dark-3);border-radius:12px;padding:14px 16px;font-size:13.5px;color:var(--bv-dark-text-2);margin:0 0 .5rem;box-shadow:var(--bv-shadow-lift)}
  .docs-page .ref{color:var(--bv-dark-text-2);font-family:var(--mono);font-size:10.5px;margin-left:4px;white-space:nowrap}
  .docs-page .d-table{width:100%;border-collapse:collapse;font-size:13px;margin:.5rem 0 1rem;color:var(--bv-dark-text-2)}
  .docs-page .d-table th{text-align:left;font-weight:500;color:var(--bv-dark-text);padding:7px 8px;border-bottom:1px solid var(--bv-dark-line-2)}
  .docs-page .d-table td{padding:7px 8px;border-bottom:1px solid var(--bv-dark-3);vertical-align:top}
  .docs-page .d-table tr:last-child td{border-bottom:none}
  .docs-page .d-small{font-size:12.5px;color:var(--bv-dark-text-2)}
  .docs-page .d-foot{margin-top:2.2rem}
</style>
<div class="docs-page" data-screen="docs" data-region="connect">
  ${pageHeader({ brand, title: `Using ${brand.engine}` })}
  <p class="d-lede">${engine} is ${org}'s own engine, not a general assistant pointed at ${org}: it holds ${org}'s ruled truth, and it grades every contribution against the standards ${org} has already set. You talk to it in <em>your</em> role: your brief is its hat. One secret, five calls, no local tooling required.</p>

  <h2>One secret</h2>
  <div class="d-key">Your <b>key</b> is both your web password and your API/MCP bearer token. Everything below authenticates with it, as a header <code>Authorization: Bearer &lt;key&gt;</code>. A key never goes in an address. Keep it private; it carries your role.</div>

  <h2>Five calls</h2>
  ${call(1, "Connect", `Add <code>POST ${mcpUrl}</code> with your bearer key to Claude Code / Desktop / claude.ai and ${engine} becomes your assistant in your role. Or use plain HTTP with the bearer header. <code>GET /whoami</code> tells you who you are, your workspaces, and your consent standing.`)}
  ${call(2, "Get knowledge", `<code>updates</code> (what changed for you and what waits on you) &middot; <code>read</code> (one item by its ref, or a page of a kind: the aim, goals, questions, checks, cards, the map, docs) &middot; <code>search</code> &middot; <code>brief</code> (the work packet for a hat or a ref). Over HTTP the same reads are <code>GET /updates</code>, <code>GET /read</code>, <code>GET /search</code> and <code>GET /brief</code>. All of it is read live from ${org}'s own database.`)}
  ${call(3, "Contribute", `Knowledge (the aim, goals, questions and their options, checks, cards, the map, docs) goes in through <code>preview</code> then <code>file</code> (items <code>{kind, op, data}</code>) and shows at once. Work goes in the same way, an item <code>{contribution: {lane, what, why, touches, proof}}</code>. <b>Proof is what you observed</b>: a result with its number, a command with what it printed, a link, or a named file with what it shows. A narration ("done, works fine") routes as <em>needs one more thing</em> (<code>incomplete</code>), recorded honestly, never blocked. A preview takes up to 200 items; <code>clientRef</code> makes a retry file nothing twice.`)}
  ${call(4, "Ask &amp; answer", `<code>/decisions</code> on the console lists the open decisions; an answer is one of the question's options, attributed and filed against the question it answers. Over MCP, call <code>missing</code> first (or read the <code>brain://missing</code> resource): what the project still needs, each piece with the exact call that fills it.`)}
  ${call(5, "Leave a trail", `<code>wrap_up</code> (or <code>POST /wrap-up</code>) at session end. Traces are opt-in and consent-gated: you set yours on <code>/profile</code> (off &middot; traces &middot; traces + prompts).`)}

  <h2>Resources, not only tools</h2>
  <p>The same knowledge is browsable as MCP <b>resources</b>: <code>brain://updates</code> &middot; <code>brain://missing</code> (the intake entry point: what the project still needs, each piece with the call that fills it) &middot; <code>brain://goals</code> &middot; <code>brain://doc/&lt;path&gt;</code> &middot; the template <code>brain://brief/{ref}</code>. Every read tool has a resource twin; every write goes through the door.</p>

  <h2>The three lines: what, why, what it touches</h2>
  <p>Every contribution measures against one line and two links: <b>what</b> you did, <b>why</b>, and what it <b>touches</b> (screens or components that resolve to canon). The gate grades it in four steps: binding (the three lines present), join key (touches resolve), proof (the code lane carries artifact-grade proof), route (filed, with the owner, or needs one more thing). Nothing is blocked. Everything is recorded and graded, and a check graded with proof lights the map node it names.</p>

  <h2>Goals: declare a tree, map your work to it</h2>
  <p>${engine} generalizes from a fixed build-tracker into an org-goal engine<span class="ref">M-ADR-020</span>: a <b>goal tree</b> (global goal &rarr; segments &rarr; optional individual goals) rolled up from <b>dimensions</b>. A contribution's lane doubles as the axis it's measured on. Any org, any goal shape.</p>
  <p><b>Goal-setting SOP.</b> File your tree through <code>preview</code> then <code>file</code>, items of kind <code>goal</code>: one item per goal, <code>{ id, title, parent, dimensions:[...] }</code>. <code>parent:null</code> marks the root, everything else points at its parent's <code>id</code>. Each node names, in <code>dimensions</code>, which lane(s) its own measurement pulls from; an internal node with children is left to roll up from them instead of measuring directly. Optional <code>weight</code> (how a parent averages its children, default 1) and <code>target</code> (graded contributions to fully move one cell, default 1).</p>
  <p><b>Contribution-to-goal SOP.</b> Every contribution (an item <code>{contribution: {…}}</code> through <code>preview</code> then <code>file</code>) may carry a <code>goalRef</code>: the id of the node it moves. An unknown ref still files (sharingu never blocks) with a loud note so you can fix it; an absent ref simply records as unaligned. See <code>GET /goals</code> or <code>brain://goals</code> for the current tree and its live needles.</p>
  <p><b>Per-dimension submit &amp; report.</b> The gate grades every lane to the SAME three lines (what/why/touches) plus a lane-appropriate proof:</p>
  <table class="d-table">
    <thead><tr><th>lane / dimension</th><th>submit kinds</th><th>proof</th></tr></thead>
    <tbody>
      <tr><td><code>ba</code> (scope)</td><td>doc &middot; requirement</td><td>a citation</td></tr>
      <tr><td><code>code</code> (dev)</td><td>pr &middot; fix</td><td>command + observed result (exit code / pass count)</td></tr>
      <tr><td><code>design</code></td><td>screen &middot; asset</td><td>a banked export + refs</td></tr>
      <tr><td><code>vendor</code> (ai)</td><td>spec &middot; profile</td><td>a citation</td></tr>
      <tr><td><code>gtm</code></td><td>social &middot; outreach &middot; update &middot; content &middot; campaign</td><td>the shipped link/artifact, plus a declared <code>expected</code> outcome (an <code>actual</code> follows later: reach, replies and so on, free text, never graded)</td></tr>
    </tbody>
  </table>
  <p class="d-small">sharingu records and expects the outcome of every dimension; it never performs the work<span class="ref">constitution R2</span>. Narration ("posted it, went well") is not proof and routes as needs one more thing (<code>incomplete</code>), same as every other lane.</p>

  <h2>Connect your Claude</h2>
  ${connectSnippet({ org, mcpUrl, engine })}

  <p class="d-small d-foot">This page is served by the engine itself and carries no org truth: every name and address on it rides the tenant seam, so any org running ${engine} gets its own guide here.</p>
</div>`;
}
