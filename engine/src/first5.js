// first5.js — THE FIRST FIVE MINUTES (M-ADR-026): a new contributor's Home opens as an onboarding,
// not an empty dashboard. PURE derivation: the three steps and whether each is met, from counts the
// route already has — never a hand-typed "welcome" state, never a client-side guess.
//
//   connect     — the person holds a NON-web credential in use (a token whose device is not the
//                 web/SSO/launcher session) OR has already done anything at all (an event or a
//                 contribution implies a connected client).
//   first call  — any event by the person (ask · wrap_up · a saved file) or a contribution.
//   contribute  — a contribution (transmission, eval=0) by the person.
//
// Shown while the last step is NOT met; steps itself off as each is met. The step TEXT is a caller's
// `onboarding` when it passes one, else the built-in frame; the three signals above are the engine's,
// so the texts and the ticks never disagree about count: exactly three steps, in this order.
export const FIRST5_KEYS = ["connect", "call", "contribute"];

// deriveFirstFive({ tokens, events, transmissions, onboarding }) → { show, steps:[{key,label,detail,done}], done, total }
//   tokens        — count of the person's live tokens with device NOT IN ('web','sso','frame')
//   events        — count of events by the person
//   transmissions — count of eval=0 transmissions submitted by the person
//   onboarding    — onboardingFrom(rules): { steps:[{step, detail}] } (any length; the first three are used)
export function deriveFirstFive(input) {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const tokens = n(input && input.tokens), events = n(input && input.events), tx = n(input && input.transmissions);
  const contributed = tx > 0;
  const called = contributed || events > 0;
  const connected = called || tokens > 0;
  const ob = (input && input.onboarding && Array.isArray(input.onboarding.steps)) ? input.onboarding.steps : [];
  const labels = [
    { key: "connect", label: "Connect an assistant", detail: "Your key at this org's MCP door" },
    { key: "call", label: "Make a first call", detail: "What changed in your lane" },
    { key: "contribute", label: "File a first contribution", detail: "What, why, what it touches" },
  ];
  const steps = labels.map((l, i) => ({
    key: l.key,
    label: (ob[i] && ob[i].step) || l.label,
    detail: (ob[i] && ob[i].detail) || l.detail,
    done: l.key === "connect" ? connected : l.key === "call" ? called : contributed,
  }));
  const done = steps.filter((s) => s.done).length;
  return { show: !contributed, steps, done, total: steps.length };
}
