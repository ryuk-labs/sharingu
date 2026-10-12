-- migrate-025.sql — the D1 read budget (M-ADR-032, scar 2026-09-05: the free tier's daily row-read limit
-- was exhausted and both workers 500'd). Two hot paths on Home scanned `transmission` whole because no
-- index led with the column they filter/order on:
--   recent activity  — WHERE eval=0 [AND project=?] ORDER BY created_at DESC LIMIT 8
--   open decisions   — WHERE kind='answer' AND eval=0
-- Additive; safe to re-run.
CREATE INDEX IF NOT EXISTS idx_transmission_eval_created ON transmission(eval, created_at);
CREATE INDEX IF NOT EXISTS idx_transmission_kind_eval    ON transmission(kind, eval);
