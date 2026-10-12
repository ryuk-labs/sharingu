-- 007 · screens: the join key from a submission to the 01-399 register (ADR-041).
-- Verified against canon at submission, not merely present.
ALTER TABLE artifacts ADD COLUMN screens TEXT;
ALTER TABLE artifacts ADD COLUMN states TEXT;
