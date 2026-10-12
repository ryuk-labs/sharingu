// src/secrets.js — self-service secrets on /profile (owner ruling 2026-09-08, "go build the self-service
// secrets block"). Until now only the owner could set a passphrase or rotate a key (Settings), and a person
// could never see their own key: every "I can't sign in" went through the owner. Two actions, both re-authenticated
// with the person's CURRENT secret and both cookie-CSRF-guarded at the gate (csrfRefused):
//   set-my-passphrase — current + new (min 4) → pass_hash/pass_salt replaced. The key is untouched.
//   rotate-my-key     — current → a fresh key (TOKEN_PREFIX + hex(20)), key_hash replaced, the value shown ONCE
//                       in the response and never stored; every issued token (sessions, CLI) is revoked. The passphrase
//                       is untouched (deliberate: a person keeps the words they know; Settings' rotate still sets both, S-019).
// "Current" is the passphrase when one exists, else the key itself (a person who was minted a key and never had
// a passphrase set can bootstrap with it). A wrong current is written to login_attempts like a failed sign-in, so
// the lockout (8 in 15 min, per account since sprint 7) bounds guessing; a locked person is refused before any check.
// SPRINT 8, 8.3a (the sprint-7 review's A3: the lockout's key, src/accounts.js THE LOCKOUT): the re-check's client is the
// credential the request rode in on (keepHash). An ACCOUNT session of this seat's account (made by the account's passphrase:
// reader.session_account) is the holder's own client by construction, judged by its OWN failures — a stranger's failed sign-ins
// on the email never lock the holder's /profile; every other credential (the seat's key, a SEAT session: what an org's admin
// minted or set) is judged by the account's failures from everywhere, as before.
// SPRINT 7 (7.1, src/accounts.js): "current" may also be the seat's ACCOUNT passphrase (one per email, the holder's). Which
// secret it proved decides what a new passphrase replaces: the account's passphrase (proven: the holder's own, every seat it
// opens follows; their seats' connected apps are disconnected) or this seat's own secret (only it proven: that seat alone —
// a seat's credential, which its org's admin minted, never sets the passphrase of the account, so an admin holding a
// member's key can never reach that person's seats in another org).
// WHAT ENDS (sprint 7's review, B1 + A2: the one revocation rule, src/accounts.js): proven by the ACCOUNT's passphrase — the
// holder's own act — a passphrase change ends every OTHER session of the account in every org (the one it was proven on stays)
// and a key rotation every one, this one included, with every connected app of every seat; proven only by this seat's own
// secret (or its key: what its org's admin minted or set), the act is this seat's alone — its SEAT sessions (a rotation) and its
// SEAT grants — never an account session or grant, and never anything of another org.
import { db } from "./data.js";
import { uid, now, sha256, pbkdf2, hex } from "./util.js";
import { seatWithAccount, seatLocked, countSeatAttempt, credentialClient, secretMatches, setAccountPassphrase, accountSeatIds, endAccountSessions } from "./accounts.js";
import { TOKEN_PREFIX } from "./tenant.js";
import { revokeOAuthGrants } from "./oauthgrants.js";

export const SECRET_ACTIONS = ["set-my-passphrase", "rotate-my-key"];
export const MIN_PASSPHRASE = 4;
// an ACCOUNT passphrase opens every seat of its holder, in every org (7.1): longer than a seat's own secret
export const ACCOUNT_MIN_PASSPHRASE = 12;

// verifyCurrentSecret(person, current) → true when `current` is the person's passphrase (pass_hash set) or,
// with no passphrase on file, their key. Pure: takes the row fields, never the DB.
export async function verifyCurrentSecret(person, current) {
  const c = String(current || "");
  if (!c || !person) return false;
  if (person.pass_hash && person.pass_salt) return (await pbkdf2(c, person.pass_salt)) === person.pass_hash;
  if (person.key_hash) return (await sha256(c)) === person.key_hash;
  return false;
}

export function passphraseProblem(p, { account = false } = {}) {
  const s = String(p || "");
  if (s.length < (account ? ACCOUNT_MIN_PASSPHRASE : MIN_PASSPHRASE)) return "short";
  return "";
}

// SEAT_SESSIONS_END_SQL: a seat's own SEAT sessions (minted by its secret: tokens.account_id NULL), never an account session
export const SEAT_SESSIONS_END_SQL = "UPDATE tokens SET revoked = 1 WHERE person_id = ? AND account_id IS NULL AND revoked = 0";
// runSecretAction({ env, reader, action, current, password, isEval, keepHash }) → { status, code, key? }
//   code: "passphrase" (this seat's own) | "account" (the account's passphrase) | "key" | "wrong" | "locked" | "short" | "bad_action"
//   keepHash: the hash of the credential this request rode in on (its session), kept by an account passphrase change
export async function runSecretAction({ env, reader, action, current, password, isEval, keepHash = null }) {
  if (!SECRET_ACTIONS.includes(action)) return { status: 422, code: "bad_action" };
  // the reader's seat (of the reader's org) with its account's passphrase (src/accounts.js seatWithAccount)
  const person = await seatWithAccount(env, reader.id);
  if (!person) return { status: 401, code: "wrong" };
  // the lockout is the SAME one /login counts: per account (sprint 7), else the seat's own bucket (its email, or its id when
  // it has none — review 2026-09-08: a NULL email matched nothing → no lockout). The attempt row is written before the
  // verdict and a failed write REFUSES (never fail-open: a guess that cannot be counted must not run).
  // 8.3a (A3): keyed by the account AND this request's credential; an ACCOUNT session of this very account is vouched for
  const client = credentialClient(keepHash);
  const vouched = !!(reader && reader.viaCookie && person.account_id && String(reader.session_account || "") === String(person.account_id));
  if (await seatLocked(env, person, { client, vouched })) return { status: 429, code: "locked" };
  const account = { pass_hash: person.account_hash, pass_salt: person.account_salt };
  const provedAccount = await secretMatches(current, account);
  const ok = provedAccount || await verifyCurrentSecret(person, current);
  try { await countSeatAttempt(env, person, ok, { client, vouches: !!provedAccount }); }
  catch { return { status: 503, code: "wrong" }; }
  if (!ok) return { status: 401, code: "wrong" };
  if (action === "set-my-passphrase") {
    const problem = passphraseProblem(password, { account: !!provedAccount });
    if (problem) return { status: 422, code: problem };
    const saltHex = hex(16); const ph = await pbkdf2(String(password), saltHex);
    if (provedAccount) {
      // the holder proved the account's passphrase: the account takes the new one (a seat's own secret is untouched), only
      // while it still holds the one proven
      if (!(await setAccountPassphrase(env, person, ph, saltHex))) return { status: 401, code: "wrong" };
      // A2 (sprint 7's review): whoever held the old passphrase may hold a session made with it — every other session of the
      // account ends, in every org (this one stays: its holder just proved the old passphrase); and G2 M1: every app connected
      // with it is disconnected, on every seat of the account (the holder's own)
      await endAccountSessions(env, person.account_id, keepHash);
      for (const id of await accountSeatIds(env, person.account_id)) await revokeOAuthGrants(env, id);
      await trail(env, person.id, "passphrase", isEval);
      return { status: 200, code: "account" };
    }
    // only this seat's own secret (or its key) was proven: this seat's secret alone changes — never the account's (an account
    // with no passphrase gains none this way: only 7.2's code sign-up or the operator gives it one); its seat grants end with it
    await db(env).prepare("UPDATE people SET pass_hash=?, pass_salt=? WHERE id=?").bind(ph, saltHex, person.id).run();
    await revokeOAuthGrants(env, person.id, { seatOnly: true });   // G2 M1: an app connected with the old passphrase is disconnected
    await trail(env, person.id, "passphrase", isEval);
    return { status: 200, code: "passphrase" };
  }
  const key = TOKEN_PREFIX + hex(20); const kh = await sha256(key);
  await db(env).prepare("UPDATE people SET key_hash=? WHERE id=?").bind(kh, person.id).run();
  // "my key leaked" means every standing credential of this person dies with it (review 2026-09-08): issued
  // tokens — sessions, CLI/device tokens — are revoked, the same statement remove-person uses; the response
  // page still renders the new key once, and the person signs in again with their unchanged passphrase. A sign-in still in
  // flight on the old key_hash mints nothing after the UPDATE above (src/admin.js LOGIN_SESSION_SQL conditions on key_hash
  // too, U-REISSUE), so this revoke is never outrun.
  // B1 (sprint 7's review): proven by the ACCOUNT's passphrase, the holder's "my key leaked" ends every session of the account
  // in every org (this one included) and every app connected on any of its seats; proven by this seat's own secret, its SEAT
  // sessions and seat grants only (an admin who holds a minted key never signs the person out of another org)
  if (provedAccount) {
    await endAccountSessions(env, person.account_id, null);
    for (const id of await accountSeatIds(env, person.account_id)) await revokeOAuthGrants(env, id);
  } else {
    await db(env).prepare(SEAT_SESSIONS_END_SQL).bind(person.id).run();
    // G2 M1: and every app connected with this seat's secret (OAuth grants, their access and refresh tokens); a grant bound to
    // the old key is refused at the door whatever the store still holds (src/oauthgrants.js credEpoch)
    await revokeOAuthGrants(env, person.id, { seatOnly: true });
  }
  await trail(env, person.id, "key", isEval);
  return { status: 200, code: "key", key };
}

// the events trail records THAT a secret changed (which kind), never a value — kind "secret" is server-side only
async function trail(env, personId, what, isEval) {
  await db(env).prepare("INSERT INTO events (id, session_id, person_id, kind, payload_json, created_at, org) VALUES (?,?,?,?,?,?,{org})")
    .bind(uid(), null, personId, "secret", JSON.stringify({ changed: what, surface: "/profile", ...(isEval ? { eval: true } : {}) }), now()).run().catch(() => {});
}
