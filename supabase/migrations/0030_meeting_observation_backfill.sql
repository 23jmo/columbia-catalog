-- Legacy meeting rows were observed when they were inserted. Migration 0029's
-- ADD COLUMN default necessarily stamped its own application time on existing
-- rows; restore the historical insertion time before comparing them with a
-- Vergil contribution's source observation time. Never touch contributed rows.

update meetings
   set observed_at = created_at
 where source = 'catalog_ingest'
   and observed_at is distinct from created_at;

