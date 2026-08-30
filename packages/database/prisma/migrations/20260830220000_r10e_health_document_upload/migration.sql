-- R10-E (step 1): extend health enums for patient uploads.

ALTER TYPE "HealthArtifactType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "HealthArtifactType" ADD VALUE IF NOT EXISTS 'PRESCRIPTION_UPLOAD';

ALTER TYPE "HealthTimelineEventType" ADD VALUE IF NOT EXISTS 'ARTIFACT_UPLOADED';
