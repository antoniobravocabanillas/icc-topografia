ALTER TABLE icc."TerraqoShareCollectionItem"
ADD COLUMN "mediaIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing selections are frozen to the normalized image set visible when this
-- migration is applied. Later uploads never expand an already granted scope.
UPDATE icc."TerraqoShareCollectionItem" AS item
SET "mediaIds" = COALESCE((
  SELECT ARRAY_AGG(media.id ORDER BY media."sortOrder", media.id)
  FROM icc."TerraqoWorklogRevision" AS revision
  JOIN icc."TerraqoWorklogMedia" AS media
    ON media."worklogId" = revision."worklogId"
  WHERE revision.id = item."revisionId"
    AND media."contentType" = 'image/webp'
), ARRAY[]::TEXT[])
WHERE item."includeMedia" = true;
