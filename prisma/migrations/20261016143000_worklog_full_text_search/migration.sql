-- Expand-only migration. Apply and measure this index before enabling
-- TERRAQO_WORKLOG_FTS_V1 in any production environment.
ALTER TABLE icc."TerraqoWorklogEntry"
ADD COLUMN IF NOT EXISTS "searchVector" tsvector
GENERATED ALWAYS AS (
  to_tsvector(
    'spanish'::regconfig,
    coalesce("title", '') || ' ' ||
    coalesce("summary", '') || ' ' ||
    coalesce("outcome", '')
  )
) STORED;

-- Prisma migrate deploy executes this migration transactionally. PostgreSQL
-- rejects CONCURRENTLY inside that transaction, so the rollout must reserve a
-- maintenance window and create the index normally.
CREATE INDEX IF NOT EXISTS "Worklog_search_vector_gin_idx"
ON icc."TerraqoWorklogEntry"
USING GIN ("searchVector");
