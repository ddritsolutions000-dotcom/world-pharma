-- R8-E (step 1): enum value must commit before use in constraints (PostgreSQL 55P04).
ALTER TYPE "HealthArtifactType" ADD VALUE IF NOT EXISTS 'IMAGING_REPORT';
