-- Stable keyset pagination for the authorized worklog archive.
-- Kept alongside the legacy two-column index until production EXPLAIN data
-- confirms that removing the old index is safe.
CREATE INDEX "Worklog_profile_occurred_id_desc_idx"
ON icc."TerraqoWorklogEntry" (
  "professionalProfileId",
  "occurredAt" DESC,
  "id" DESC
);
