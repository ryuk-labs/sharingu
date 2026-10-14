// tools/smoke/s65-front-doors.mjs — sprint 21, slice 21.P (the journey polish: src/login.js frontTop, frontFoot, authPage; src/showcase.js;
// src/walkthrough.js; src/frontassets.js; src/accountpage.js; src/oauth.js connectHead), on the real local worker, signed out, at the
// platform's root. Self-contained: it registers its own OAuth clients (as s43 and s64 do).
//   · the doors: every front page's top bar carries the website and Sign in (none on its own page; 21.4a: ONE door, no Check my
//     request), and the quiet foot; the wordmark goes home to `/`
//   · the sign-in's two other ways (21.4a): Forgot your passphrase? and Didn't get the email? Resend, each its own page
//   · the walkthrough in place: five facades on the website's order, each our own poster served by the worker (image/jpeg, a year
//     immutable), a plain youtu.be link before the script, the player's script building the youtube-nocookie embed; no iframe
//   · one accent: each front page holds exactly ONE orange primary
//   · the connect page: a client named Claude whose code goes back to claude.ai shows Claude's logo (served by the worker) beside
//     U-chan and "Connect Claude to sharingu"; a client CALLING itself Claude with any other redirect a plain tile, the name in
//     quotes as its own claim (a name is anyone's to claim); an unknown name a plain tile
import { randomBytes, createHash } from "node:crypto";
import { smoke, expect, http as http0, BASE } from "./lib.mjs";
import { WALKTHROUGH } from "../../src/walkthrough.js";

// a request refused by the address's flood filter (LOGIN_LIMIT: shared with /login and /signup) is sent again ONCE after its
// window: that refusal proves nothing about the door behind it
const http = async (method, path, o) => {
  let r = await http0(method, path, o);
  if (r.status === 429 && /too_many_attempts_ip|Too many attempts/.test(r.text)) { await new Promise((ok) => setTimeout(ok, 61000)); r = await http0(method, path, o); }
  return r;
};
const NAV = { accept: "text/html", nav: true, root: true };
const PRIMARY = /class="primary"|class="access"|<button type="submit"|class="done-action"/g;
const PAGES = ["/", "/login", "/signup", "/signup?via=invite", "/request-access", "/account/sent", "/account/resend", "/account/forgot"];
const S = {};
// connect(name) -> the OAuth connect page a client of that name opens (its own registration, a PKCE request)
async function connect(name, redirect = "http://127.0.0.1:9/cb") {
  const reg = await (await fetch(BASE + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: "none" }) })).json();
  const verifier = randomBytes(32).toString("base64url");
  const qs = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, scope: "mcp:read", state: "s", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const r = await fetch(`${BASE}/oauth/authorize?${qs}`, { headers: { accept: "text/html" } });
  return { status: r.status, raw: await r.text() };
}

smoke("front doors · every front page's top bar: the website and Sign in (none on its own page), no Check my request, the wordmark home, the quiet foot", async () => {
  S.pages = Object.fromEntries(await Promise.all(PAGES.map(async (p) => [p, await http("GET", p, NAV)])));
  const off = Object.entries(S.pages).filter(([p, r]) => {
    const bar = (/<header class="front-top">[\s\S]*?<\/header>/.exec(r.raw) || [""])[0];
    return !(r.status === 200 && /<a class="front-brand" href="\/">/.test(bar) && /<a class="front-site" href="https:\/\/www\.sharingu\.xyz\/"/.test(bar)
      && !/Check my request|request-access\/check/.test(r.raw) && /href="\/login"[^>]*>Sign in</.test(bar) === (p !== "/login")
      && /<footer class="front-foot">/.test(r.raw));
  }).map(([p, r]) => `${p} ${r.status}`);
  expect(!off.length, () => `off the doors: ${off.join(", ")}`);
  return `${PAGES.length} pages: the website and Sign in (left out on its own page), no Check my request, the foot`;
});

smoke("front doors · the sign-in's two other ways: Forgot your passphrase? and Didn't get the email? Resend, each its own form page", async () => {
  expect(S.pages, "the doors case did not run");
  const l = S.pages["/login"].raw, f = S.pages["/account/forgot"], r = S.pages["/account/resend"];
  expect(/<a href="\/account\/forgot"[^>]*>Forgot your passphrase\?</.test(l) && /<a href="\/account\/resend"[^>]*>Didn(?:&#39;|')t get the email\? Resend</.test(l)
    && f.status === 200 && /data-screen="account-forgot"/.test(f.raw) && /action="\/account\/forgot"/.test(f.raw) && r.status === 200 && /data-screen="account-resend"/.test(r.raw) && /action="\/account\/resend"/.test(r.raw),
    () => `the sign-in's ways: forgot ${f.status}, resend ${r.status}`);
  return "the sign-in links both; each a form page posting to its own door";
});

smoke("front doors · the walkthrough plays in place: five facades in the website's order, our own posters served by the worker, youtu.be links before the script, the youtube-nocookie player on a press; no iframe", async () => {
  expect(S.pages, "the doors case did not run");
  const h = S.pages["/"].raw;
  const facades = [...h.matchAll(/<a class="walk-play" href="(https:\/\/youtu\.be\/[\w-]{11})"[^>]*data-youtube="([\w-]{11})"[^>]*>[\s\S]*?<img src="(\/assets\/[^"]+)"/g)];
  expect(facades.length === 5 && facades.every((m, i) => m[2] === WALKTHROUGH[i].id && m[1] === `https://youtu.be/${WALKTHROUGH[i].id}` && m[3].startsWith(`/assets/${WALKTHROUGH[i].poster}?v=`)),
    () => `the facades: ${facades.map((m) => m[2]).join(", ") || "none"}`);
  const posters = await Promise.all(facades.map(async (m) => { const r = await fetch(BASE + m[3]); return { status: r.status, type: r.headers.get("content-type"), cache: r.headers.get("cache-control"), n: (await r.arrayBuffer()).byteLength }; }));
  expect(posters.every((p) => p.status === 200 && p.type === "image/jpeg" && /max-age=31536000, immutable/.test(p.cache) && p.n > 10000), () => `the posters: ${JSON.stringify(posters)}`);
  expect(!/<iframe\b/.test(h) && h.includes("'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0'") && !/>youtu\.be</.test(h), "the player's script, no iframe before a press, no youtu.be printed");
  return `5 facades (${WALKTHROUGH.map((v) => v.title).join(" · ")}), ${posters.length} posters 200 image/jpeg immutable; the youtube-nocookie player on a press`;
});

smoke("front doors · one accent: each front page holds exactly ONE orange primary", async () => {
  expect(S.pages, "the doors case did not run");
  const c = await connect("smoke-front-accent");
  const counts = [...Object.entries(S.pages), ["the connect page", c]].map(([p, r]) => [p, (r.raw.match(PRIMARY) || []).length]);
  expect(c.status === 200 && counts.every(([, n]) => n === 1), () => `primaries: ${counts.map(([p, n]) => `${p} ${n}`).join(", ")}`);
  return counts.map(([p, n]) => `${p} ${n}`).join(", ");
});

smoke("front doors · the connect page: Claude's own logo only when the code goes back to claude.ai; a client calling itself Claude elsewhere a plain tile and its claim in quotes; an unknown name a plain tile", async () => {
  const claude = await connect("Claude", "https://claude.ai/api/mcp/auth_callback"), fake = await connect("Claude"), other = await connect("smoke-front-client");
  const logo = (/data-client-logo="(clients\/claude\.png)"><img src="([^"]+)"/.exec(claude.raw) || []);
  const img = logo[2] ? await fetch(BASE + logo[2]) : { status: 0, headers: new Headers() };
  expect(claude.status === 200 && logo[1] && img.status === 200 && img.headers.get("content-type") === "image/png" && /<h1 class="lede">Connect Claude to sharingu<\/h1>/.test(claude.raw)
    && !/asks to connect as you/.test(claude.raw), () => `Claude's page: ${claude.status}, logo ${logo[1] || "none"} ${img.status}`);
  expect(fake.status === 200 && !/data-client-logo/.test(fake.raw) && /class="pair-tile pair-plain"/.test(fake.raw) && /Connect “Claude” to sharingu/.test(fake.raw)
    && fake.raw.includes("The app calls itself “Claude”: that name is its own claim."), () => `the self-named Claude's page: ${fake.status}`);
  expect(other.status === 200 && /class="pair-tile pair-plain"/.test(other.raw) && !/data-client-logo/.test(other.raw) && /Connect “smoke-front-client” to sharingu/.test(other.raw),
    () => `the unknown client's page: ${other.status}`);
  return `Claude at claude.ai: its logo (${img.status} image/png); a self-named Claude elsewhere and an unknown name: plain tiles, the claim in quotes`;
});
