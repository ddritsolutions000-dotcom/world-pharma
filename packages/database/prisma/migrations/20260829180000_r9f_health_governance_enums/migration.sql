-- R9-F: break-glass health governance enums (separate txn for safety)

CREATE TYPE "BreakGlassGrantKind" AS ENUM ('PLATFORM', 'HEALTH_CLINICAL');
CREATE TYPE "BreakGlassReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'CLOSED');
