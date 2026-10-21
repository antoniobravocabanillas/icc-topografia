CREATE TYPE icc."TerraqoShareCollectionLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE icc."TerraqoAccessGrantLifecycle" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE icc."TerraqoEndorsementStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_REVIEW', 'PARTIAL', 'CHANGES_REQUESTED', 'DECLINED', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'REVOKED');

CREATE TABLE icc."TerraqoShareCollection" (
  "id" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "lifecycle" icc."TerraqoShareCollectionLifecycle" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "TerraqoShareCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoShareCollectionItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "allowedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "includeMedia" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoShareCollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoAccessGrant" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "subjectUserId" TEXT,
  "inviteEmail" TEXT,
  "tokenHash" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lifecycle" icc."TerraqoAccessGrantLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "issuedById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoPublicProjection" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoPublicProjection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEndorsementRequest" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewerUserId" TEXT,
  "reviewerEmail" TEXT,
  "organizationId" TEXT,
  "relationshipLabel" TEXT NOT NULL,
  "requestedScope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "revisionHash" TEXT NOT NULL,
  "status" icc."TerraqoEndorsementStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoEndorsementRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEndorsementDecision" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "responses" JSONB NOT NULL,
  "summaryComment" TEXT,
  "revisionHash" TEXT NOT NULL,
  "authoritySnapshot" JSONB,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoEndorsementDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TerraqoShareCollection_professionalProfileId_lifecycle_upda_idx" ON icc."TerraqoShareCollection"("professionalProfileId", "lifecycle", "updatedAt");
CREATE UNIQUE INDEX "TerraqoShareCollection_createdById_operationKey_key" ON icc."TerraqoShareCollection"("createdById", "operationKey");
CREATE UNIQUE INDEX "TerraqoShareCollectionItem_collectionId_revisionId_key" ON icc."TerraqoShareCollectionItem"("collectionId", "revisionId");
CREATE INDEX "TerraqoShareCollectionItem_revisionId_idx" ON icc."TerraqoShareCollectionItem"("revisionId");
CREATE UNIQUE INDEX "TerraqoAccessGrant_tokenHash_key" ON icc."TerraqoAccessGrant"("tokenHash");
CREATE INDEX "TerraqoAccessGrant_collectionId_lifecycle_expiresAt_idx" ON icc."TerraqoAccessGrant"("collectionId", "lifecycle", "expiresAt");
CREATE INDEX "TerraqoAccessGrant_subjectUserId_lifecycle_expiresAt_idx" ON icc."TerraqoAccessGrant"("subjectUserId", "lifecycle", "expiresAt");
CREATE INDEX "TerraqoAccessGrant_inviteEmail_lifecycle_expiresAt_idx" ON icc."TerraqoAccessGrant"("inviteEmail", "lifecycle", "expiresAt");
CREATE UNIQUE INDEX "TerraqoAccessGrant_issuedById_operationKey_key" ON icc."TerraqoAccessGrant"("issuedById", "operationKey");
CREATE UNIQUE INDEX "TerraqoPublicProjection_collectionId_key" ON icc."TerraqoPublicProjection"("collectionId");
CREATE UNIQUE INDEX "TerraqoPublicProjection_slug_key" ON icc."TerraqoPublicProjection"("slug");
CREATE INDEX "TerraqoPublicProjection_revokedAt_publishedAt_idx" ON icc."TerraqoPublicProjection"("revokedAt", "publishedAt");
CREATE UNIQUE INDEX "TerraqoEndorsementRequest_requesterId_operationKey_key" ON icc."TerraqoEndorsementRequest"("requesterId", "operationKey");
CREATE INDEX "TerraqoEndorsementRequest_reviewerUserId_status_createdAt_idx" ON icc."TerraqoEndorsementRequest"("reviewerUserId", "status", "createdAt");
CREATE INDEX "TerraqoEndorsementRequest_reviewerEmail_status_createdAt_idx" ON icc."TerraqoEndorsementRequest"("reviewerEmail", "status", "createdAt");
CREATE INDEX "TerraqoEndorsementRequest_revisionId_status_idx" ON icc."TerraqoEndorsementRequest"("revisionId", "status");
CREATE INDEX "TerraqoEndorsementRequest_organizationId_status_createdAt_idx" ON icc."TerraqoEndorsementRequest"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "TerraqoEndorsementDecision_requestId_operationKey_key" ON icc."TerraqoEndorsementDecision"("requestId", "operationKey");
CREATE INDEX "TerraqoEndorsementDecision_requestId_decidedAt_idx" ON icc."TerraqoEndorsementDecision"("requestId", "decidedAt");
CREATE INDEX "TerraqoEndorsementDecision_reviewerId_decidedAt_idx" ON icc."TerraqoEndorsementDecision"("reviewerId", "decidedAt");

ALTER TABLE icc."TerraqoShareCollection" ADD CONSTRAINT "TerraqoShareCollection_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES icc."TerraqoProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoShareCollection" ADD CONSTRAINT "TerraqoShareCollection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoShareCollectionItem" ADD CONSTRAINT "TerraqoShareCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES icc."TerraqoShareCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoShareCollectionItem" ADD CONSTRAINT "TerraqoShareCollectionItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES icc."TerraqoWorklogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoAccessGrant" ADD CONSTRAINT "TerraqoAccessGrant_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES icc."TerraqoShareCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoAccessGrant" ADD CONSTRAINT "TerraqoAccessGrant_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES icc."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoAccessGrant" ADD CONSTRAINT "TerraqoAccessGrant_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoPublicProjection" ADD CONSTRAINT "TerraqoPublicProjection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES icc."TerraqoShareCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementRequest" ADD CONSTRAINT "TerraqoEndorsementRequest_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES icc."TerraqoWorklogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementRequest" ADD CONSTRAINT "TerraqoEndorsementRequest_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES icc."TerraqoProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementRequest" ADD CONSTRAINT "TerraqoEndorsementRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementRequest" ADD CONSTRAINT "TerraqoEndorsementRequest_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES icc."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementRequest" ADD CONSTRAINT "TerraqoEndorsementRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES icc."TerraqoWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementDecision" ADD CONSTRAINT "TerraqoEndorsementDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES icc."TerraqoEndorsementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEndorsementDecision" ADD CONSTRAINT "TerraqoEndorsementDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
