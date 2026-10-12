// mandate-selftest.mjs — the ratchet for the M-ADR-019 mandated internal-staff trace tier.
// mandateFloorFor(role, tenant) is the pure core of effective-consent: it decides the FLOOR a
// manifest traceMandate imposes on a role. The security-critical branches (external roles are
// NEVER mandated; a role not listed gets no floor; no mandate = off) can't be safely probed on a
// live tenant, so they're pinned here. Run in the gate; exit non-zero on any miss.
import { mandateFloorFor } from "../src/core.js";

let fail = 0;
const eq = (got, want, label) => { if (got !== want) { console.log(`  ✗ ${label}: got ${got}, want ${want}`); fail = 1; } };

const M = { traceMandate: { floor: "traces", roles: ["owner", "internal-eng"] } };
const MP = { traceMandate: { floor: "traces+prompts", roles: ["internal-eng"] } };
const NONE = {};

// a mandated internal role gets the floor
eq(mandateFloorFor("internal-eng", M), "traces", "internal-eng mandated → traces");
eq(mandateFloorFor("owner", M), "traces", "owner mandated → traces");
eq(mandateFloorFor("internal-eng", MP), "traces+prompts", "internal-eng → full floor");
// a role NOT in the list gets no floor
eq(mandateFloorFor("leader", M), "off", "unlisted role → off");
eq(mandateFloorFor("design", M), "off", "unlisted design → off");
// external roles are NEVER mandated — even if a manifest mistakenly lists them
eq(mandateFloorFor("external-ai", { traceMandate: { floor: "traces", roles: ["external-ai"] } }), "off", "external-ai never mandated");
eq(mandateFloorFor("external-logistics", { traceMandate: { floor: "traces", roles: ["external-logistics"] } }), "off", "external-logistics never mandated");
eq(mandateFloorFor("vendor", { traceMandate: { floor: "traces", roles: ["vendor"] } }), "off", "vendor never mandated");
// no mandate, or malformed, → off (byte-identical to consent-only)
eq(mandateFloorFor("internal-eng", NONE), "off", "no mandate → off");
eq(mandateFloorFor("internal-eng", { traceMandate: null }), "off", "null mandate → off");
eq(mandateFloorFor("internal-eng", { traceMandate: { floor: "bogus", roles: ["internal-eng"] } }), "off", "bad floor → off");
eq(mandateFloorFor("internal-eng", { traceMandate: { floor: "traces" } }), "off", "no roles list → off");

if (fail) { console.log("mandate selftest FAILED"); process.exit(1); }
console.log("mandate selftest: 12/12");
