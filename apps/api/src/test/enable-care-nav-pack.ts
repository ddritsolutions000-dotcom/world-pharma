import { PolicyPackStatus } from '@prisma/client';
import type { PrismaService } from '../app/prisma.service';
import type { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument, type PolicyDocument } from '../policy/empty-pack';

export async function enableCareNavigationPack(
  prisma: PrismaService,
  policyCache: PolicyCache,
  enabled: boolean,
  isoAlpha2 = 'XX',
) {
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2 } });
  let pack = country.publishedPolicyPackId
    ? await prisma.policyPack.findFirst({
        where: { id: country.publishedPolicyPackId, status: PolicyPackStatus.PUBLISHED },
      })
    : null;
  if (!pack) {
    pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { version: 'desc' },
    });
  }
  if (!pack) {
    throw new Error(`No published policy pack for ${isoAlpha2}`);
  }
  const doc = structuredClone(pack.document) as unknown as PolicyDocument;
  if (!doc.healthcare) {
    doc.healthcare = emptyPolicyDocument().healthcare;
  }
  doc.healthcare.care_navigation_enabled = enabled;
  await prisma.policyPack.update({
    where: { id: pack.id },
    data: { document: doc as object },
  });
  await policyCache.invalidate(isoAlpha2);
}

export async function enableR10CHandoffPack(
  prisma: PrismaService,
  policyCache: PolicyCache,
  isoAlpha2 = 'XX',
) {
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2 } });
  let pack = country.publishedPolicyPackId
    ? await prisma.policyPack.findFirst({
        where: { id: country.publishedPolicyPackId, status: PolicyPackStatus.PUBLISHED },
      })
    : null;
  if (!pack) {
    pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { version: 'desc' },
    });
  }
  if (!pack) {
    throw new Error(`No published policy pack for ${isoAlpha2}`);
  }
  const doc = structuredClone(pack.document) as unknown as PolicyDocument;
  if (!doc.healthcare) {
    doc.healthcare = emptyPolicyDocument().healthcare;
  }
  if (!doc.partner_types?.DOCTOR) {
    doc.partner_types = emptyPolicyDocument().partner_types;
  }
  doc.partner_types.DOCTOR.enabled = true;
  doc.healthcare.care_navigation_enabled = true;
  doc.healthcare.doctor_onboarding_enabled = true;
  doc.healthcare.doctor_public_visibility = true;
  doc.healthcare.consultation_capability = true;
  doc.healthcare.appointments_enabled = true;
  doc.healthcare.telemedicine_eligibility = true;
  doc.healthcare.booking_requires_consent = false;
  await prisma.policyPack.update({
    where: { id: pack.id },
    data: { document: doc as object },
  });
  await policyCache.invalidate(isoAlpha2);
}
