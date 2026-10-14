// tools/fake-google.mjs — a FAKE Google for local tests only (sprint 21, 21.4c; src/google.js THE LOCAL IdP): a tiny node http server
// on a loopback port playing Google's three endpoints, so a local worker whose config names it (GOOGLE_LOCAL_IDP, written by
// tools/lib-r-local.sh) signs people in by "Google" without any request leaving this machine. It signs its id_tokens RS256 with a
// local RSA key made at start, and it checks what Google checks: the client and its secret, the redirect URI, the PKCE verifier
// against the challenge (S256), a code used once.
//   GET  /authorize   ?client_id &redirect_uri &response_type=code &scope (openid) &state &nonce &code_challenge &code_challenge_method=S256
//                     -> 302 to redirect_uri with ?code &state (the identity set by next(); deny: ?error=access_denied)
//   POST /token       grant_type=authorization_code, code, client_id, client_secret, redirect_uri, code_verifier -> { id_token, … }
//   GET  /jwks        the public key (Cache-Control: max-age=3600)
// startFakeGoogle({ port, clientId, clientSecret }) -> { origin, address (host:port, the config var's form), next(identity), mint(claims,
//   opts), authorized (the authorize requests seen), tokens (the token requests answered), close() }
//   identity: { sub, email, email_verified (default true), name, hd (a Workspace's hosted domain: none by default), deny, aud, iss, nonce, exp, alg ("none" | "HS256": a token
//   no verifier may take), badSig (a signature over other bytes), kid } — one per authorize request (the next one set stays)
// Used by tools/google-selftest.mjs, tools/smoke/s69-google.mjs and the slice's screenshots; never by the product.
import { createServer } from "node:http";
import { generateKeyPairSync, createHash, createHmac, randomBytes, sign } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const json = (res, status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); };

export async function startFakeGoogle({ port = 0, clientId, clientSecret } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "fake-" + randomBytes(4).toString("hex");
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
  const codes = new Map();
  const st = { origin: "", identity: { sub: "fake-sub-1", email: "person@fake.test", email_verified: true, name: "Fake Person" }, authorized: [], tokens: [] };
  // mint(claims, { alg, badSig, kid }) -> a compact JWT over the claims (RS256 by the fake's key unless told otherwise)
  const mint = (claims, o = {}) => {
    const alg = o.alg || "RS256";
    const head = b64url(JSON.stringify({ alg, kid: o.kid || kid, typ: "JWT" })), body = b64url(JSON.stringify(claims));
    const data = `${head}.${body}`;
    if (alg === "none") return `${data}.`;
    if (alg === "HS256") return `${data}.${b64url(createHmac("sha256", jwk.n).update(data).digest())}`;
    const sig = sign("RSA-SHA256", Buffer.from(o.badSig ? `${data}x` : data), privateKey);
    return `${data}.${b64url(sig)}`;
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, st.origin || "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/jwks") return json(res, 200, { keys: [jwk] }, { "cache-control": "public, max-age=3600" });
    if (req.method === "GET" && url.pathname === "/authorize") {
      const q = url.searchParams, who = { ...st.identity };
      st.authorized.push(Object.fromEntries(q));
      const ok = q.get("response_type") === "code" && q.get("client_id") === clientId && /\bopenid\b/.test(q.get("scope") || "") && q.get("state") && q.get("nonce")
        && q.get("code_challenge") && q.get("code_challenge_method") === "S256" && /^https?:\/\//.test(q.get("redirect_uri") || "");
      if (!ok) { res.writeHead(400, { "content-type": "text/plain" }); return res.end("bad authorization request"); }
      const back = new URL(q.get("redirect_uri"));
      if (who.deny) back.searchParams.set("error", "access_denied");
      else {
        const code = randomBytes(16).toString("hex");
        codes.set(code, { redirect: q.get("redirect_uri"), nonce: q.get("nonce"), challenge: q.get("code_challenge"), who });
        back.searchParams.set("code", code);
      }
      back.searchParams.set("state", q.get("state"));
      res.writeHead(302, { location: back.href });
      return res.end();
    }
    if (req.method === "POST" && url.pathname === "/token") {
      let raw = ""; for await (const c of req) raw += c;
      const f = new URLSearchParams(raw);
      const c = codes.get(f.get("code") || "");
      codes.delete(f.get("code") || "");
      const verifier = f.get("code_verifier") || "";
      const good = c && f.get("grant_type") === "authorization_code" && f.get("client_id") === clientId && f.get("client_secret") === clientSecret && f.get("redirect_uri") === c.redirect
        && b64url(createHash("sha256").update(verifier).digest()) === c.challenge;
      st.tokens.push({ ok: !!good });
      if (!good) return json(res, 400, { error: "invalid_grant" });
      const w = c.who, t = Math.floor(Date.now() / 1000);
      const claims = { iss: w.iss || st.origin, azp: clientId, aud: w.aud || clientId, sub: w.sub, email: w.email, name: w.name, nonce: w.nonce || c.nonce, iat: t, exp: w.exp || t + 3600,
        ...(w.hd ? { hd: w.hd } : {}), ...(w.email_verified === undefined ? { email_verified: true } : w.email_verified === null ? {} : { email_verified: w.email_verified }) };
      return json(res, 200, { access_token: randomBytes(16).toString("hex"), token_type: "Bearer", expires_in: 3599, scope: "openid email profile", id_token: mint(claims, w) });
    }
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  const p = server.address().port;
  st.origin = `http://127.0.0.1:${p}`;
  return { origin: st.origin, address: `127.0.0.1:${p}`, port: p, kid, mint, authorized: st.authorized, tokens: st.tokens,
    next: (identity) => { st.identity = { ...identity }; }, close: () => new Promise((ok) => { server.close(ok); server.closeAllConnections(); }) };
}
