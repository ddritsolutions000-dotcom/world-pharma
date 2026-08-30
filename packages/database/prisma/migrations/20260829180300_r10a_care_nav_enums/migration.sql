-- R10-A: care navigation enums

CREATE TYPE "CareNavSessionStatus" AS ENUM ('DRAFT', 'INTAKE', 'TRIAGED', 'COMPLETED', 'TERMINATED');
CREATE TYPE "CareUrgencyLevel" AS ENUM ('ROUTINE', 'SOON', 'URGENT', 'EMERGENT');
