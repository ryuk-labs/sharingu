-- 004: capture policy — the ledger records YIELD, not WORK.
-- builders (Ryuk, Rein, Thiyagu) build in git; their session mechanics are noise.
-- Dr Vasu's sessions ARE the input, so a compressed session record is allowed.
ALTER TABLE people ADD COLUMN capture_mode TEXT NOT NULL DEFAULT 'yield';
UPDATE people SET capture_mode='yield' WHERE id IN ('p-ryuk','p-rein','p-thiyag');
