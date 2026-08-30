-- R10-F (step 1): enum values for consult-note health projection.

ALTER TYPE "HealthArtifactType" ADD VALUE IF NOT EXISTS 'CONSULT_NOTE';
ALTER TYPE "HealthTimelineEventType" ADD VALUE IF NOT EXISTS 'CONSULT_COMPLETED';
