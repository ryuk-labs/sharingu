-- migrate-016 (owner S-040 finding): people.title — the human role as the UNDERSTANDING
-- knows it (users.md), close-mapped; `role` stays the capsule/gate scope, untouched.
ALTER TABLE people ADD COLUMN title TEXT;
