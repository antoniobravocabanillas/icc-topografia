-- Durable anti-duplicate key is separate from the exact replay payload fingerprint.
ALTER TABLE icc."TerraqoNativeWorklogDecision" ADD COLUMN "contentKey" TEXT NOT NULL;
ALTER TABLE icc."TerraqoNativeWorklogDecision" ADD CONSTRAINT "NativeWorklogDecision_content_key_check" CHECK ("contentKey" ~ '^[a-f0-9]{64}$');
CREATE INDEX "NativeWorklogDecision_content_created_idx" ON icc."TerraqoNativeWorklogDecision"("contentKey","createdAt");
