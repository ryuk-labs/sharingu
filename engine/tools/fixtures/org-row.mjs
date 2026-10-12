// tools/fixtures/org-row.mjs — the org's own row for a selftest's fixture (src/tenant.js reads it: ORG_SQL, configOf).
//   orgRow({ name, productTitle?, loginTitle?, home?, settings? }) -> the row ORG_SQL answers (brand and settings as JSON)
//   seedOrg(db, o)  -> writes that row into a node:sqlite database built from boot.sql (id 1, its primary key)
// A fixture with no org row reads the product's defaults (the brand "sharingu", no home, no settings).
export function orgRow(o = {}) {
  const brand = {};
  if (o.productTitle) brand.productTitle = o.productTitle;
  if (o.loginTitle) brand.loginTitle = o.loginTitle;
  return { id: 1, name: o.name || "sharingu", brand: Object.keys(brand).length ? JSON.stringify(brand) : null, home: o.home || null,
    settings: o.settings ? JSON.stringify(o.settings) : null };
}
export function seedOrg(db, o = {}) {
  const r = orgRow(o), at = "2026-01-01T00:00:00Z";
  // sprint 8 (8.2f, main's ruling): the harness's org rides the local-only plan where the database holds it (sqlite-worker.mjs
  // seeds tools/fixtures/local-plan.sql); a database without it keeps the column's default, free, as before
  db.prepare("INSERT OR REPLACE INTO org (id, name, brand, home, settings, created_at, updated_at, plan) VALUES (1, ?, ?, ?, ?, ?, ?, " +
    "COALESCE((SELECT plan FROM plan_limits WHERE plan = 'local'), 'free'))")
    .run(r.name, r.brand, r.home, r.settings, at, at);
  return r;
}
