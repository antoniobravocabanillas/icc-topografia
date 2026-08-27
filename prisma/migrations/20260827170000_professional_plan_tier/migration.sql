ALTER TABLE "icc"."TerraqoProfessionalProfile"
ADD COLUMN IF NOT EXISTS "planTier" "icc"."TerraqoPlanTier" NOT NULL DEFAULT 'FREE';
