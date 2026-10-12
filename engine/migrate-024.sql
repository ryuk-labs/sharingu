-- migrate-024 — the cross-org launcher's single-use SSO nonce (M-ADR-023). A redeemed handoff's
-- nonce is recorded here; src/index.js's /sso/enter INSERTs it ATOMICALLY (PRIMARY KEY/UNIQUE), so a
-- replay — INCLUDING a concurrent double-spend — throws and is refused. This replaces the earlier
-- KV get→check→put, which is eventually-consistent and raced (the security review's CRITICAL finding:
-- one handoff → unlimited concurrent sessions). Rows are short-lived (pruned past the ~5-min token
-- window on each redemption). Additive, one table.
CREATE TABLE IF NOT EXISTS sso_nonce (
  n          TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
