// secrets-selftest.mjs — the ratchet for src/secrets.js's pure halves (the self-service secrets, 2026-09-08).
import { verifyCurrentSecret, passphraseProblem, SECRET_ACTIONS } from "../src/secrets.js";
import { sha256, pbkdf2 } from "../src/util.js";
let checks = 0, failed = 0;
const ok = (c, l) => { checks++; if (!c) { failed++; console.log(`  ✗ ${l}`); } else console.log(`  ✓ ${l}`); };
const salt = "0123456789abcdef0123456789abcdef";
const withPass = { pass_hash: await pbkdf2("chosen-airward-singles", salt), pass_salt: salt, key_hash: await sha256("k".repeat(40)) };
const keyOnly = { key_hash: await sha256("k".repeat(40)) };
ok(await verifyCurrentSecret(withPass, "chosen-airward-singles"), "the passphrase verifies when one is set");
ok(!(await verifyCurrentSecret(withPass, "k".repeat(40))), "the key does NOT stand in for a passphrase once one exists");
ok(!(await verifyCurrentSecret(withPass, "wrong")), "a wrong passphrase fails");
ok(await verifyCurrentSecret(keyOnly, "k".repeat(40)), "with no passphrase on file the key is the current secret");
ok(!(await verifyCurrentSecret(keyOnly, "")), "an empty current fails");
ok(!(await verifyCurrentSecret(null, "x")), "no person fails");
ok(passphraseProblem("abc") === "short" && passphraseProblem("abcd") === "", "the minimum length holds at 4");
ok(SECRET_ACTIONS.length === 2, "exactly two self-service actions");
console.log(`secrets-selftest: ${checks - failed} pass · ${failed} fail`); process.exit(failed ? 1 : 0);
