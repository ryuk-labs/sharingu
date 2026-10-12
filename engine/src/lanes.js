// src/lanes.js — the lane vocabulary: the lanes the door accepts (TX_LANES reads LANES), their labels, the fields each
// lane's contribution foregrounds and the area each lane counts toward. The chip colours live in src/shell.js's tokens.

// fields — which envelope fields that lane's card foregrounds beyond the fields every
// card carries regardless of lane (what/why/gapRefs/routed-because). Descriptive metadata
// for callers (queue.js's laneFields already implements the actual per-lane HTML — the
// artifact-link/money-flag logic is page-specific enough it stays there, not duplicated
// here); this list is the single place that says WHICH fields a lane cares about.
// "gtm" added by M-ADR-020 (the Goals Engine, owner /mcq 2026-09-03): the first
// non-build dimension — social/outreach/update/content/campaign kinds, proof is
// the shipped link/artifact + a declared `expected` outcome (never graded, R
// records + expects, never performs — M-ADR-007a). Colors live in shell.js
// (--lane-gtm-bg/-fg) beside the other four, same convention as the rest of LANES.
export const LANES = [
  { key: "code", label: "Code", fields: ["components", "proof", "screens"] },
  { key: "design", label: "Design", fields: ["screens", "artifact"] },
  { key: "leader", label: "Leader", fields: [] },
  { key: "vendor", label: "Vendor", fields: ["touches"] },
  { key: "ba", label: "BA", fields: ["touches", "moneyflag"] },
  { key: "gtm", label: "GTM", fields: ["expected", "actual", "proof"] },
];

export const LANE_KEYS = LANES.map((l) => l.key);

// AREA_OF_LANE (UI-B3, QF4CC7033: the leaderboard ranks goal movement PER AREA) — the ONE fold of a lane into the
// area Home's "Who moved the goals" counts it under: the build lanes (code, design, vendor, ba) are build, gtm is gtm,
// the leader lane (plans, notes, answers, rulings) is plans — named for what it holds (the one-pass fix 4c: it was called
// "goals", so a goal's line read "fed by 11 · goals 11"). An unknown lane counts toward no area.
export const AREA_OF_LANE = { code: "build", design: "build", vendor: "build", ba: "build", gtm: "gtm", leader: "plans" };

