// first5-selftest.mjs — the ratchet for THE FIRST FIVE MINUTES (M-ADR-026). deriveFirstFive is
// a pure derivation from counts the route already has (tokens/events/transmissions) plus the
// org's served onboarding doctrine; this locks its branches — connect/call/contribute readiness,
// the onboarding-doctrine override, and garbage-input safety — so route/onboarding drift shows
// up here first. Modeled on tools/goal-derive-selftest.mjs's idiom. Run in the gate.
import { deriveFirstFive, FIRST5_KEYS } from "../src/first5.js";

let fail = 0;
const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail = 1; } };
const keys = (r) => r.steps.map((s) => s.key);
const done = (r) => r.steps.map((s) => s.done);
const labels = (r) => r.steps.map((s) => s.label);

eq(FIRST5_KEYS, ["connect", "call", "contribute"], "FIRST5_KEYS is connect/call/contribute in order");

// all-zero: a fresh contributor with nothing yet -> panel shows, 0/3 done.
const z = deriveFirstFive({ tokens: 0, events: 0, transmissions: 0 });
eq([z.show, z.done, z.total], [true, 0, 3], "all-zero -> show:true, 0/3 done");

// tokens only: a live non-web credential implies connected; call/contribute still pending.
const t = deriveFirstFive({ tokens: 3, events: 0, transmissions: 0 });
eq(done(t), [true, false, false], "tokens only -> connect done, call/contribute pending");

// events only, no token: a call implies a connection -> connect AND call both done.
const e = deriveFirstFive({ tokens: 0, events: 4, transmissions: 0 });
eq(done(e), [true, true, false], "events only (no token) -> connect and call done, contribute pending");

// a contribution -> all three done, the panel steps itself off.
const c = deriveFirstFive({ tokens: 0, events: 0, transmissions: 1 });
eq([done(c), c.show], [[true, true, true], false], "transmissions>0 -> all three done, show:false");

// served onboarding overrides label+detail in order; a step it doesn't cover falls back per-field.
const ob = deriveFirstFive({ tokens: 0, events: 0, transmissions: 0, onboarding: { steps: [{ step: "A", detail: "a" }, { step: "B" }, { step: "C" }] } });
eq(labels(ob), ["A", "B", "C"], "served onboarding overrides all 3 labels in order");
eq(ob.steps[1].detail, "What changed in your lane", "an overridden label with no detail falls back to the built-in detail");

// a shorter onboarding list overrides only what it has; the rest falls back to the built-in frame.
const obShort = deriveFirstFive({ tokens: 0, events: 0, transmissions: 0, onboarding: { steps: [{ step: "Only one" }] } });
eq(labels(obShort), ["Only one", "Make a first call", "File a first contribution"], "short onboarding overrides step 0 only, rest falls back");

// absent onboarding -> the built-in frame entirely (reusing the all-zero case above).
eq(labels(z), ["Connect an assistant", "Make a first call", "File a first contribution"], "absent onboarding -> built-in labels");

// garbage input (undefined/negative/strings/non-object onboarding) never throws and reads as zero.
let threw = false, g;
try { g = deriveFirstFive({ tokens: undefined, events: -5, transmissions: "nope", onboarding: "garbage" }); }
catch { threw = true; }
eq(threw, false, "garbage input does not throw");
eq(g && [g.show, g.done], [true, 0], "garbage input reads as zero -> show:true, 0 done");

threw = false;
try { deriveFirstFive(undefined); } catch { threw = true; }
eq(threw, false, "deriveFirstFive(undefined) does not throw");

// exactly 3 steps, in FIRST5_KEYS order, on every shape exercised above.
const allSame = [z, t, e, c, ob, obShort, g].every((r) => r.steps.length === 3 && JSON.stringify(keys(r)) === JSON.stringify(FIRST5_KEYS));
eq(allSame, true, "every case above -> exactly 3 steps, in FIRST5_KEYS order");

if (fail) { console.log("first5 selftest FAILED"); process.exit(1); }
console.log("first5 selftest: 13/13");
