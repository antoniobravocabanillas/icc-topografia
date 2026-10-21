CREATE TYPE icc."TerraqoWorkNeedLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE icc."TerraqoNeedRequirementPriority" AS ENUM ('REQUIRED', 'DESIRED');
CREATE TYPE icc."TerraqoEvaluationDossierLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE icc."TerraqoEvaluationSourceAccessKind" AS ENUM ('PUBLIC_CV', 'PUBLIC_SELECTION', 'PRIVATE_GRANT');
CREATE TYPE icc."TerraqoEvaluationClaimState" AS ENUM ('DOCUMENTED', 'DECLARED', 'ENDORSED', 'CONFIRMED', 'UNKNOWN');
CREATE TYPE icc."TerraqoEvaluationAnalysisStatus" AS ENUM ('NOT_REQUESTED', 'PROCESSING', 'READY', 'FAILED', 'INSUFFICIENT', 'SOURCE_REVOKED');
CREATE TYPE icc."TerraqoEvaluationQuestionLifecycle" AS ENUM ('DRAFT', 'USED', 'ARCHIVED');
CREATE TYPE icc."TerraqoConversationRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'BLOCKED');
CREATE TYPE icc."TerraqoConversationContextKind" AS ENUM ('NEED', 'EVALUATION', 'EVIDENCE', 'PROPOSAL', 'CLOSURE');
CREATE TYPE icc."TerraqoCollaborationStatus" AS ENUM ('PROPOSAL_PENDING', 'ACCEPTED', 'IN_PROGRESS', 'CLOSURE_PROPOSED', 'CHANGES_REQUESTED', 'CLOSED', 'CANCELLED');
CREATE TYPE icc."TerraqoCollaborationProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN', 'SUPERSEDED');
CREATE TYPE icc."TerraqoCollaborationAcceptanceParty" AS ENUM ('WORKSPACE', 'PROFESSIONAL');
CREATE TYPE icc."TerraqoClosureRevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED');

CREATE TABLE icc."TerraqoWorkNeed" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "lifecycle" icc."TerraqoWorkNeedLifecycle" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "currentRevisionId" TEXT,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "TerraqoWorkNeed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoWorkNeedRevision" (
  "id" TEXT NOT NULL,
  "needId" TEXT NOT NULL,
  "revisionNo" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "problem" TEXT NOT NULL,
  "activities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "context" TEXT,
  "locationLabel" TEXT,
  "availableFrom" TIMESTAMP(3),
  "availableUntil" TIMESTAMP(3),
  "requiredTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "endorsementNeeded" BOOLEAN NOT NULL DEFAULT false,
  "contentHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoWorkNeedRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoNeedRequirement" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "priority" icc."TerraqoNeedRequirementPriority" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoNeedRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEvaluationDossier" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "needRevisionId" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "lifecycle" icc."TerraqoEvaluationDossierLifecycle" NOT NULL DEFAULT 'DRAFT',
  "privateSummary" TEXT,
  "analysisStatus" icc."TerraqoEvaluationAnalysisStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "analysisFailureCode" TEXT,
  "analysisUpdatedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "TerraqoEvaluationDossier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEvaluationSource" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "worklogRevisionId" TEXT NOT NULL,
  "accessKind" icc."TerraqoEvaluationSourceAccessKind" NOT NULL,
  "accessReferenceId" TEXT,
  "accessSnapshot" JSONB NOT NULL,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoEvaluationSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEvaluationAssessment" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "requirementId" TEXT,
  "criterionKey" TEXT NOT NULL,
  "criterionLabel" TEXT NOT NULL,
  "claimState" icc."TerraqoEvaluationClaimState" NOT NULL,
  "rationale" TEXT,
  "revisionNo" INTEGER NOT NULL,
  "current" BOOLEAN NOT NULL DEFAULT true,
  "supersedesId" TEXT,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoEvaluationAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEvaluationAssessmentSource" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoEvaluationAssessmentSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEvaluationNote" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoEvaluationNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoEvaluationQuestion" (
  "id" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "lifecycle" icc."TerraqoEvaluationQuestionLifecycle" NOT NULL DEFAULT 'DRAFT',
  "revisionNo" INTEGER NOT NULL DEFAULT 1,
  "current" BOOLEAN NOT NULL DEFAULT true,
  "supersedesId" TEXT,
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoEvaluationQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoMessageOperation" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoMessageOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoConversationRequest" (
  "id" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dossierId" TEXT,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "note" TEXT,
  "status" icc."TerraqoConversationRequestStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "conversationId" TEXT,
  "respondedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "reportedAt" TIMESTAMP(3),
  "reportReason" TEXT,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoConversationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoConversationContext" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "kind" icc."TerraqoConversationContextKind" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "labelSnapshot" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoConversationContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoCollaboration" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "professionalUserId" TEXT NOT NULL,
  "status" icc."TerraqoCollaborationStatus" NOT NULL DEFAULT 'PROPOSAL_PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "acceptedRevisionNo" INTEGER,
  "acceptedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoCollaboration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoCollaborationProposal" (
  "id" TEXT NOT NULL,
  "collaborationId" TEXT NOT NULL,
  "revisionNo" INTEGER NOT NULL,
  "scope" TEXT NOT NULL,
  "roleTitle" TEXT NOT NULL,
  "deliverables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startsOn" TIMESTAMP(3),
  "endsOn" TIMESTAMP(3),
  "conditions" TEXT,
  "status" icc."TerraqoCollaborationProposalStatus" NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decisionComment" TEXT,
  "decisionOperationKey" TEXT,
  "decisionFingerprint" TEXT,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoCollaborationProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoCollaborationAcceptance" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "party" icc."TerraqoCollaborationAcceptanceParty" NOT NULL,
  "actorId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoCollaborationAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoCollaborationClosure" (
  "id" TEXT NOT NULL,
  "collaborationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "currentRevisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoCollaborationClosure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoClosureRevision" (
  "id" TEXT NOT NULL,
  "closureId" TEXT NOT NULL,
  "revisionNo" INTEGER NOT NULL,
  "contribution" TEXT NOT NULL,
  "deliverables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "result" TEXT NOT NULL,
  "authorizedExcerpt" TEXT,
  "status" icc."TerraqoClosureRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decisionComment" TEXT,
  "decisionOperationKey" TEXT,
  "decisionFingerprint" TEXT,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "submitOperationKey" TEXT,
  "submitFingerprint" TEXT,
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoClosureRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoClosureReference" (
  "id" TEXT NOT NULL,
  "closureRevisionId" TEXT NOT NULL,
  "worklogRevisionId" TEXT NOT NULL,
  "accessSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoClosureReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoCollaborationCertificate" (
  "id" TEXT NOT NULL,
  "closureId" TEXT NOT NULL,
  "closureRevisionId" TEXT NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "professionalName" TEXT NOT NULL,
  "roleTitle" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "proposalRevisionNo" INTEGER NOT NULL,
  "closureRevisionNo" INTEGER NOT NULL,
  "contribution" TEXT NOT NULL,
  "deliverables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "result" TEXT NOT NULL,
  "authorizedExcerpt" TEXT,
  "privateByDefault" BOOLEAN NOT NULL DEFAULT true,
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoCollaborationCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoWorkNeed_currentRevisionId_key" ON icc."TerraqoWorkNeed"("currentRevisionId");
CREATE UNIQUE INDEX "TerraqoWorkNeed_createdById_operationKey_key" ON icc."TerraqoWorkNeed"("createdById", "operationKey");
CREATE INDEX "TerraqoWorkNeed_workspaceId_lifecycle_updatedAt_idx" ON icc."TerraqoWorkNeed"("workspaceId", "lifecycle", "updatedAt");
CREATE UNIQUE INDEX "TerraqoWorkNeedRevision_needId_revisionNo_key" ON icc."TerraqoWorkNeedRevision"("needId", "revisionNo");
CREATE UNIQUE INDEX "TerraqoWorkNeedRevision_createdById_operationKey_key" ON icc."TerraqoWorkNeedRevision"("createdById", "operationKey");
CREATE INDEX "TerraqoWorkNeedRevision_needId_createdAt_idx" ON icc."TerraqoWorkNeedRevision"("needId", "createdAt");
CREATE INDEX "TerraqoNeedRequirement_revisionId_priority_sortOrder_idx" ON icc."TerraqoNeedRequirement"("revisionId", "priority", "sortOrder");
CREATE UNIQUE INDEX "TerraqoEvaluationDossier_workspaceId_needRevisionId_profess_key" ON icc."TerraqoEvaluationDossier"("workspaceId", "needRevisionId", "professionalProfileId");
CREATE UNIQUE INDEX "TerraqoEvaluationDossier_createdById_operationKey_key" ON icc."TerraqoEvaluationDossier"("createdById", "operationKey");
CREATE INDEX "TerraqoEvaluationDossier_workspaceId_lifecycle_updatedAt_idx" ON icc."TerraqoEvaluationDossier"("workspaceId", "lifecycle", "updatedAt");
CREATE UNIQUE INDEX "TerraqoEvaluationSource_dossierId_worklogRevisionId_key" ON icc."TerraqoEvaluationSource"("dossierId", "worklogRevisionId");
CREATE INDEX "TerraqoEvaluationSource_worklogRevisionId_accessKind_idx" ON icc."TerraqoEvaluationSource"("worklogRevisionId", "accessKind");
CREATE UNIQUE INDEX "TerraqoEvaluationAssessment_dossierId_criterionKey_revision_key" ON icc."TerraqoEvaluationAssessment"("dossierId", "criterionKey", "revisionNo");
CREATE UNIQUE INDEX "TerraqoEvaluationAssessment_createdById_operationKey_key" ON icc."TerraqoEvaluationAssessment"("createdById", "operationKey");
CREATE UNIQUE INDEX "TerraqoEvaluationAssessment_supersedesId_key" ON icc."TerraqoEvaluationAssessment"("supersedesId");
CREATE INDEX "TerraqoEvaluationAssessment_dossierId_current_createdAt_idx" ON icc."TerraqoEvaluationAssessment"("dossierId", "current", "createdAt");
CREATE INDEX "TerraqoEvaluationAssessment_requirementId_idx" ON icc."TerraqoEvaluationAssessment"("requirementId");
CREATE UNIQUE INDEX "TerraqoEvaluationAssessmentSource_assessmentId_sourceId_key" ON icc."TerraqoEvaluationAssessmentSource"("assessmentId", "sourceId");
CREATE INDEX "TerraqoEvaluationAssessmentSource_sourceId_idx" ON icc."TerraqoEvaluationAssessmentSource"("sourceId");
CREATE UNIQUE INDEX "TerraqoEvaluationNote_createdById_operationKey_key" ON icc."TerraqoEvaluationNote"("createdById", "operationKey");
CREATE INDEX "TerraqoEvaluationNote_dossierId_createdAt_idx" ON icc."TerraqoEvaluationNote"("dossierId", "createdAt");
CREATE UNIQUE INDEX "TerraqoEvaluationQuestion_createdById_operationKey_key" ON icc."TerraqoEvaluationQuestion"("createdById", "operationKey");
CREATE UNIQUE INDEX "TerraqoEvaluationQuestion_supersedesId_key" ON icc."TerraqoEvaluationQuestion"("supersedesId");
CREATE INDEX "TerraqoEvaluationQuestion_dossierId_current_createdAt_idx" ON icc."TerraqoEvaluationQuestion"("dossierId", "current", "createdAt");
CREATE UNIQUE INDEX "TerraqoMessageOperation_messageId_key" ON icc."TerraqoMessageOperation"("messageId");
CREATE UNIQUE INDEX "TerraqoMessageOperation_actorId_operationKey_key" ON icc."TerraqoMessageOperation"("actorId", "operationKey");
CREATE INDEX "TerraqoMessageOperation_actorId_createdAt_idx" ON icc."TerraqoMessageOperation"("actorId", "createdAt");
CREATE UNIQUE INDEX "TerraqoConversationRequest_requesterId_operationKey_key" ON icc."TerraqoConversationRequest"("requesterId", "operationKey");
CREATE INDEX "TerraqoConversationRequest_recipientId_status_createdAt_idx" ON icc."TerraqoConversationRequest"("recipientId", "status", "createdAt");
CREATE INDEX "TerraqoConversationRequest_workspaceId_status_createdAt_idx" ON icc."TerraqoConversationRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "TerraqoConversationRequest_requestKey_status_idx" ON icc."TerraqoConversationRequest"("requestKey", "status");
CREATE UNIQUE INDEX "TerraqoConversationContext_conversationId_kind_referenceId_key" ON icc."TerraqoConversationContext"("conversationId", "kind", "referenceId");
CREATE INDEX "TerraqoConversationContext_referenceId_kind_idx" ON icc."TerraqoConversationContext"("referenceId", "kind");
CREATE UNIQUE INDEX "TerraqoCollaboration_workspaceId_conversationId_professiona_key" ON icc."TerraqoCollaboration"("workspaceId", "conversationId", "professionalUserId");
CREATE INDEX "TerraqoCollaboration_professionalUserId_status_updatedAt_idx" ON icc."TerraqoCollaboration"("professionalUserId", "status", "updatedAt");
CREATE INDEX "TerraqoCollaboration_workspaceId_status_updatedAt_idx" ON icc."TerraqoCollaboration"("workspaceId", "status", "updatedAt");
CREATE UNIQUE INDEX "TerraqoCollaborationProposal_collaborationId_revisionNo_key" ON icc."TerraqoCollaborationProposal"("collaborationId", "revisionNo");
CREATE UNIQUE INDEX "TerraqoCollaborationProposal_createdById_operationKey_key" ON icc."TerraqoCollaborationProposal"("createdById", "operationKey");
CREATE INDEX "TerraqoCollaborationProposal_collaborationId_status_created_idx" ON icc."TerraqoCollaborationProposal"("collaborationId", "status", "createdAt");
CREATE UNIQUE INDEX "TerraqoCollaborationAcceptance_proposalId_party_key" ON icc."TerraqoCollaborationAcceptance"("proposalId", "party");
CREATE INDEX "TerraqoCollaborationAcceptance_actorId_acceptedAt_idx" ON icc."TerraqoCollaborationAcceptance"("actorId", "acceptedAt");
CREATE UNIQUE INDEX "TerraqoCollaborationClosure_collaborationId_key" ON icc."TerraqoCollaborationClosure"("collaborationId");
CREATE UNIQUE INDEX "TerraqoCollaborationClosure_currentRevisionId_key" ON icc."TerraqoCollaborationClosure"("currentRevisionId");
CREATE UNIQUE INDEX "TerraqoClosureRevision_closureId_revisionNo_key" ON icc."TerraqoClosureRevision"("closureId", "revisionNo");
CREATE UNIQUE INDEX "TerraqoClosureRevision_createdById_operationKey_key" ON icc."TerraqoClosureRevision"("createdById", "operationKey");
CREATE INDEX "TerraqoClosureRevision_closureId_status_createdAt_idx" ON icc."TerraqoClosureRevision"("closureId", "status", "createdAt");
CREATE UNIQUE INDEX "TerraqoClosureReference_closureRevisionId_worklogRevisionId_key" ON icc."TerraqoClosureReference"("closureRevisionId", "worklogRevisionId");
CREATE INDEX "TerraqoClosureReference_worklogRevisionId_idx" ON icc."TerraqoClosureReference"("worklogRevisionId");
CREATE UNIQUE INDEX "TerraqoCollaborationCertificate_closureId_key" ON icc."TerraqoCollaborationCertificate"("closureId");
CREATE UNIQUE INDEX "TerraqoCollaborationCertificate_closureRevisionId_key" ON icc."TerraqoCollaborationCertificate"("closureRevisionId");
CREATE INDEX "TerraqoCollaborationCertificate_issuedById_issuedAt_idx" ON icc."TerraqoCollaborationCertificate"("issuedById", "issuedAt");

ALTER TABLE icc."TerraqoWorkNeed" ADD CONSTRAINT "TerraqoWorkNeed_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES icc."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkNeed" ADD CONSTRAINT "TerraqoWorkNeed_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkNeedRevision" ADD CONSTRAINT "TerraqoWorkNeedRevision_needId_fkey" FOREIGN KEY ("needId") REFERENCES icc."TerraqoWorkNeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkNeedRevision" ADD CONSTRAINT "TerraqoWorkNeedRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoNeedRequirement" ADD CONSTRAINT "TerraqoNeedRequirement_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES icc."TerraqoWorkNeedRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationDossier" ADD CONSTRAINT "TerraqoEvaluationDossier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES icc."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationDossier" ADD CONSTRAINT "TerraqoEvaluationDossier_needRevisionId_fkey" FOREIGN KEY ("needRevisionId") REFERENCES icc."TerraqoWorkNeedRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationDossier" ADD CONSTRAINT "TerraqoEvaluationDossier_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES icc."TerraqoProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationDossier" ADD CONSTRAINT "TerraqoEvaluationDossier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationSource" ADD CONSTRAINT "TerraqoEvaluationSource_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES icc."TerraqoEvaluationDossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationSource" ADD CONSTRAINT "TerraqoEvaluationSource_worklogRevisionId_fkey" FOREIGN KEY ("worklogRevisionId") REFERENCES icc."TerraqoWorklogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationSource" ADD CONSTRAINT "TerraqoEvaluationSource_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationAssessment" ADD CONSTRAINT "TerraqoEvaluationAssessment_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES icc."TerraqoEvaluationDossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationAssessment" ADD CONSTRAINT "TerraqoEvaluationAssessment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES icc."TerraqoNeedRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationAssessment" ADD CONSTRAINT "TerraqoEvaluationAssessment_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES icc."TerraqoEvaluationAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationAssessment" ADD CONSTRAINT "TerraqoEvaluationAssessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationAssessmentSource" ADD CONSTRAINT "TerraqoEvaluationAssessmentSource_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES icc."TerraqoEvaluationAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationAssessmentSource" ADD CONSTRAINT "TerraqoEvaluationAssessmentSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES icc."TerraqoEvaluationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationNote" ADD CONSTRAINT "TerraqoEvaluationNote_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES icc."TerraqoEvaluationDossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationNote" ADD CONSTRAINT "TerraqoEvaluationNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationQuestion" ADD CONSTRAINT "TerraqoEvaluationQuestion_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES icc."TerraqoEvaluationDossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationQuestion" ADD CONSTRAINT "TerraqoEvaluationQuestion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES icc."TerraqoEvaluationQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoEvaluationQuestion" ADD CONSTRAINT "TerraqoEvaluationQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoMessageOperation" ADD CONSTRAINT "TerraqoMessageOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoMessageOperation" ADD CONSTRAINT "TerraqoMessageOperation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES icc."TerraqoDirectMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationRequest" ADD CONSTRAINT "TerraqoConversationRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES icc."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationRequest" ADD CONSTRAINT "TerraqoConversationRequest_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES icc."TerraqoEvaluationDossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationRequest" ADD CONSTRAINT "TerraqoConversationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationRequest" ADD CONSTRAINT "TerraqoConversationRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationRequest" ADD CONSTRAINT "TerraqoConversationRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES icc."TerraqoConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationContext" ADD CONSTRAINT "TerraqoConversationContext_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES icc."TerraqoConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoConversationContext" ADD CONSTRAINT "TerraqoConversationContext_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaboration" ADD CONSTRAINT "TerraqoCollaboration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES icc."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaboration" ADD CONSTRAINT "TerraqoCollaboration_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES icc."TerraqoConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaboration" ADD CONSTRAINT "TerraqoCollaboration_professionalUserId_fkey" FOREIGN KEY ("professionalUserId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationProposal" ADD CONSTRAINT "TerraqoCollaborationProposal_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES icc."TerraqoCollaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationProposal" ADD CONSTRAINT "TerraqoCollaborationProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationProposal" ADD CONSTRAINT "TerraqoCollaborationProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES icc."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationAcceptance" ADD CONSTRAINT "TerraqoCollaborationAcceptance_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES icc."TerraqoCollaborationProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationAcceptance" ADD CONSTRAINT "TerraqoCollaborationAcceptance_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationClosure" ADD CONSTRAINT "TerraqoCollaborationClosure_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES icc."TerraqoCollaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoClosureRevision" ADD CONSTRAINT "TerraqoClosureRevision_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES icc."TerraqoCollaborationClosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoClosureRevision" ADD CONSTRAINT "TerraqoClosureRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoClosureRevision" ADD CONSTRAINT "TerraqoClosureRevision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES icc."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoClosureReference" ADD CONSTRAINT "TerraqoClosureReference_closureRevisionId_fkey" FOREIGN KEY ("closureRevisionId") REFERENCES icc."TerraqoClosureRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoClosureReference" ADD CONSTRAINT "TerraqoClosureReference_worklogRevisionId_fkey" FOREIGN KEY ("worklogRevisionId") REFERENCES icc."TerraqoWorklogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationCertificate" ADD CONSTRAINT "TerraqoCollaborationCertificate_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES icc."TerraqoCollaborationClosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationCertificate" ADD CONSTRAINT "TerraqoCollaborationCertificate_closureRevisionId_fkey" FOREIGN KEY ("closureRevisionId") REFERENCES icc."TerraqoClosureRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationCertificate" ADD CONSTRAINT "TerraqoCollaborationCertificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoCollaborationClosure" ADD CONSTRAINT "TerraqoCollaborationClosure_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES icc."TerraqoClosureRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkNeed" ADD CONSTRAINT "TerraqoWorkNeed_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES icc."TerraqoWorkNeedRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
