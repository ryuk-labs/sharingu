-- 006 · lanes: what a person's heartbeat should surface, and what they are the source of.
-- Rein tracks design/UI-UX, Thiyagu tracks code — their deltas differ even though both are internal-eng.
ALTER TABLE people ADD COLUMN lane TEXT;
UPDATE people SET lane='all'                    WHERE id='p-ryuk';
UPDATE people SET lane='design,architecture'    WHERE id='p-rein';
UPDATE people SET lane='code,as-built'          WHERE id='p-thiyag';
UPDATE people SET lane='decisions,economics'    WHERE id='p-vasu';
UPDATE people SET lane='decisions,economics'    WHERE id='p-test';
