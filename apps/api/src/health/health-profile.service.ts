import { Injectable } from '@nestjs/common';
import {
  HealthAllergySeverity,
  HealthConditionStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import type { HealthSubject } from './health-subject.service';
import { HealthSubjectService } from './health-subject.service';

const ALLERGY_SEVERITIES = new Set(Object.values(HealthAllergySeverity));
const CONDITION_STATUSES = new Set(Object.values(HealthConditionStatus));

@Injectable()
export class HealthProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subjects: HealthSubjectService,
    private readonly events: SecurityEventsService,
  ) {}

  async getProfile(principal: Principal, countryCode: string, familyMemberId?: string | null) {
    const subject = await this.subjects.resolve(principal, countryCode, familyMemberId);
    const profile = await this.ensureProfile(subject);
    await this.subjects.auditSubjectAccess(principal.personId, subject, 'profile_read');
    return this.presentProfile(profile, subject);
  }

  async updateProfile(
    principal: Principal,
    countryCode: string,
    body: { blood_type?: string | null; notes?: string | null; family_member_id?: string | null },
  ) {
    const subject = await this.subjects.resolve(principal, countryCode, body.family_member_id);
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const existing = await this.ensureProfile(subject);
        const row = await this.prisma.customerHealthProfile.update({
          where: { id: existing.id },
          data: {
            ...(body.blood_type !== undefined
              ? { bloodType: body.blood_type?.trim() ? body.blood_type.trim().slice(0, 8) : null }
              : {}),
            ...(body.notes !== undefined
              ? { notes: body.notes?.trim() ? body.notes.trim().slice(0, 1000) : null }
              : {}),
          },
          include: this.includeAll(),
        });
        await this.events.emit({
          type: 'HEALTH_PROFILE_MUTATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { action: 'UPDATE', profile_id: row.id, subject_kind: subject.kind },
        });
        return this.presentProfile(row, subject);
      },
    );
  }

  async addAllergy(
    principal: Principal,
    countryCode: string,
    body: {
      family_member_id?: string | null;
      allergen?: string;
      reaction?: string | null;
      severity?: string;
      active?: boolean;
      notes?: string | null;
    },
  ) {
    const subject = await this.subjects.resolve(principal, countryCode, body.family_member_id);
    const allergen = body.allergen?.trim();
    if (!allergen) {
      throw Errors.validation('allergen is required');
    }
    const severity = (body.severity?.trim().toUpperCase() ?? 'UNKNOWN') as HealthAllergySeverity;
    if (!ALLERGY_SEVERITIES.has(severity)) {
      throw Errors.validation('severity is invalid');
    }
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const profile = await this.ensureProfile(subject);
        await this.prisma.customerHealthAllergy.create({
          data: {
            id: uuidv7(),
            profileId: profile.id,
            allergen: allergen.slice(0, 200),
            reaction: body.reaction?.trim()?.slice(0, 200) ?? null,
            severity,
            active: body.active !== false,
            notes: body.notes?.trim()?.slice(0, 500) ?? null,
          },
        });
        await this.emitMutation(principal.personId, 'ALLERGY_CREATE', profile.id);
        const updated = await this.loadProfile(profile.id);
        return this.presentProfile(updated!, subject);
      },
    );
  }

  async updateAllergy(
    principal: Principal,
    allergyId: string,
    body: {
      country_code?: string;
      family_member_id?: string | null;
      allergen?: string;
      reaction?: string | null;
      severity?: string;
      active?: boolean;
      notes?: string | null;
    },
  ) {
    const subject = await this.subjects.resolve(principal, body.country_code ?? '', body.family_member_id);
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const profile = await this.ensureProfile(subject);
        const existing = await this.prisma.customerHealthAllergy.findFirst({
          where: { id: allergyId, profileId: profile.id },
        });
        if (!existing) {
          throw Errors.notFound('Allergy not found');
        }
        const severity = body.severity?.trim().toUpperCase();
        if (severity && !ALLERGY_SEVERITIES.has(severity as HealthAllergySeverity)) {
          throw Errors.validation('severity is invalid');
        }
        await this.prisma.customerHealthAllergy.update({
          where: { id: existing.id },
          data: {
            ...(body.allergen !== undefined
              ? { allergen: body.allergen.trim().slice(0, 200) }
              : {}),
            ...(body.reaction !== undefined
              ? { reaction: body.reaction?.trim()?.slice(0, 200) ?? null }
              : {}),
            ...(severity ? { severity: severity as HealthAllergySeverity } : {}),
            ...(body.active !== undefined ? { active: body.active } : {}),
            ...(body.notes !== undefined ? { notes: body.notes?.trim()?.slice(0, 500) ?? null } : {}),
          },
        });
        await this.emitMutation(principal.personId, 'ALLERGY_UPDATE', profile.id);
        const updated = await this.loadProfile(profile.id);
        return this.presentProfile(updated!, subject);
      },
    );
  }

  async removeAllergy(
    principal: Principal,
    allergyId: string,
    countryCode: string,
    familyMemberId?: string | null,
  ) {
    const subject = await this.subjects.resolve(principal, countryCode, familyMemberId);
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const profile = await this.ensureProfile(subject);
        const existing = await this.prisma.customerHealthAllergy.findFirst({
          where: { id: allergyId, profileId: profile.id },
        });
        if (!existing) {
          throw Errors.notFound('Allergy not found');
        }
        await this.prisma.customerHealthAllergy.delete({ where: { id: existing.id } });
        await this.emitMutation(principal.personId, 'ALLERGY_DELETE', profile.id);
        const updated = await this.loadProfile(profile.id);
        return this.presentProfile(updated!, subject);
      },
    );
  }

  async addCondition(
    principal: Principal,
    countryCode: string,
    body: {
      family_member_id?: string | null;
      condition?: string;
      status?: string;
      diagnosed_at?: string | null;
      notes?: string | null;
    },
  ) {
    const subject = await this.subjects.resolve(principal, countryCode, body.family_member_id);
    const condition = body.condition?.trim();
    if (!condition) {
      throw Errors.validation('condition is required');
    }
    const status = (body.status?.trim().toUpperCase() ?? 'ACTIVE') as HealthConditionStatus;
    if (!CONDITION_STATUSES.has(status)) {
      throw Errors.validation('status is invalid');
    }
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const profile = await this.ensureProfile(subject);
        await this.prisma.customerHealthCondition.create({
          data: {
            id: uuidv7(),
            profileId: profile.id,
            condition: condition.slice(0, 200),
            status,
            diagnosedAt: body.diagnosed_at ? new Date(body.diagnosed_at) : null,
            notes: body.notes?.trim()?.slice(0, 500) ?? null,
          },
        });
        await this.emitMutation(principal.personId, 'CONDITION_CREATE', profile.id);
        const updated = await this.loadProfile(profile.id);
        return this.presentProfile(updated!, subject);
      },
    );
  }

  async addVital(
    principal: Principal,
    countryCode: string,
    body: {
      family_member_id?: string | null;
      height_cm?: number | null;
      weight_kg?: number | null;
      blood_pressure_systolic?: number | null;
      blood_pressure_diastolic?: number | null;
      pulse_bpm?: number | null;
      temperature_celsius?: number | null;
      recorded_at?: string;
      notes?: string | null;
    },
  ) {
    const subject = await this.subjects.resolve(principal, countryCode, body.family_member_id);
    const recordedAt = body.recorded_at ? new Date(body.recorded_at) : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      throw Errors.validation('recorded_at is invalid');
    }
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const profile = await this.ensureProfile(subject);
        await this.prisma.customerHealthVital.create({
          data: {
            id: uuidv7(),
            profileId: profile.id,
            heightCm: body.height_cm ?? null,
            weightKg: body.weight_kg ?? null,
            bloodPressureSystolic: body.blood_pressure_systolic ?? null,
            bloodPressureDiastolic: body.blood_pressure_diastolic ?? null,
            pulseBpm: body.pulse_bpm ?? null,
            temperatureCelsius: body.temperature_celsius ?? null,
            recordedAt,
            notes: body.notes?.trim()?.slice(0, 500) ?? null,
          },
        });
        await this.emitMutation(principal.personId, 'VITAL_CREATE', profile.id);
        const updated = await this.loadProfile(profile.id);
        return this.presentProfile(updated!, subject);
      },
    );
  }

  async upsertEmergencyContact(
    principal: Principal,
    countryCode: string,
    body: {
      family_member_id?: string | null;
      name?: string;
      relationship?: string;
      phone?: string;
      notes?: string | null;
    },
  ) {
    const subject = await this.subjects.resolve(principal, countryCode, body.family_member_id);
    const name = body.name?.trim();
    const relationship = body.relationship?.trim();
    const phone = body.phone?.trim();
    if (!name || !relationship || !phone) {
      throw Errors.validation('name, relationship, and phone are required');
    }
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: principal.personId }),
      async () => {
        const profile = await this.ensureProfile(subject);
        await this.prisma.customerHealthEmergencyContact.upsert({
          where: { profileId: profile.id },
          create: {
            id: uuidv7(),
            profileId: profile.id,
            name: name.slice(0, 120),
            relationship: relationship.slice(0, 80),
            phone: phone.slice(0, 32),
            notes: body.notes?.trim()?.slice(0, 500) ?? null,
          },
          update: {
            name: name.slice(0, 120),
            relationship: relationship.slice(0, 80),
            phone: phone.slice(0, 32),
            notes: body.notes?.trim()?.slice(0, 500) ?? null,
          },
        });
        await this.emitMutation(principal.personId, 'EMERGENCY_CONTACT_UPSERT', profile.id);
        const updated = await this.loadProfile(profile.id);
        return this.presentProfile(updated!, subject);
      },
    );
  }

  private async ensureProfile(subject: HealthSubject) {
    return runWithTenant(
      workerTenantContext({ countryId: subject.countryId, personId: subject.ownerPersonId }),
      async () => {
        if (subject.kind === 'self') {
          const existing = await this.prisma.customerHealthProfile.findFirst({
            where: {
              ownerPersonId: subject.ownerPersonId,
              countryId: subject.countryId,
              familyMemberId: null,
            },
            include: this.includeAll(),
          });
          if (existing) {
            return existing;
          }
          return this.prisma.customerHealthProfile.create({
            data: {
              id: uuidv7(),
              ownerPersonId: subject.ownerPersonId,
              countryId: subject.countryId,
            },
            include: this.includeAll(),
          });
        }
        const existing = await this.prisma.customerHealthProfile.findFirst({
          where: { familyMemberId: subject.familyMemberId! },
          include: this.includeAll(),
        });
        if (existing) {
          return existing;
        }
        return this.prisma.customerHealthProfile.create({
          data: {
            id: uuidv7(),
            ownerPersonId: subject.ownerPersonId,
            countryId: subject.countryId,
            familyMemberId: subject.familyMemberId!,
          },
          include: this.includeAll(),
        });
      },
    );
  }

  private loadProfile(profileId: string) {
    return this.prisma.customerHealthProfile.findUnique({
      where: { id: profileId },
      include: this.includeAll(),
    });
  }

  private includeAll() {
    return {
      allergies: { orderBy: { createdAt: 'desc' as const } },
      conditions: { orderBy: { createdAt: 'desc' as const } },
      vitals: { orderBy: { recordedAt: 'desc' as const }, take: 20 },
      emergencyContact: true,
    };
  }

  private presentProfile(
    row: {
      id: string;
      bloodType: string | null;
      notes: string | null;
      updatedAt: Date;
      allergies: Array<{
        id: string;
        allergen: string;
        reaction: string | null;
        severity: HealthAllergySeverity;
        active: boolean;
        notes: string | null;
        updatedAt: Date;
      }>;
      conditions: Array<{
        id: string;
        condition: string;
        status: HealthConditionStatus;
        diagnosedAt: Date | null;
        notes: string | null;
        updatedAt: Date;
      }>;
      vitals: Array<{
        id: string;
        heightCm: number | null;
        weightKg: number | null;
        bloodPressureSystolic: number | null;
        bloodPressureDiastolic: number | null;
        pulseBpm: number | null;
        temperatureCelsius: number | null;
        recordedAt: Date;
        notes: string | null;
      }>;
      emergencyContact: {
        id: string;
        name: string;
        relationship: string;
        phone: string;
        notes: string | null;
        updatedAt: Date;
      } | null;
    },
    subject: HealthSubject,
  ) {
    return {
      country_code: subject.countryCode,
      subject: {
        kind: subject.kind,
        family_member_id: subject.familyMemberId,
        display_name: subject.displayName,
        relationship_code: subject.relationshipCode,
      },
      profile: {
        id: row.id,
        blood_type: row.bloodType,
        notes: row.notes,
        updated_at: row.updatedAt.toISOString(),
        allergies: row.allergies.map((a) => ({
          id: a.id,
          allergen: a.allergen,
          reaction: a.reaction,
          severity: a.severity,
          active: a.active,
          notes: a.notes,
          updated_at: a.updatedAt.toISOString(),
        })),
        conditions: row.conditions.map((c) => ({
          id: c.id,
          condition: c.condition,
          status: c.status,
          diagnosed_at: c.diagnosedAt?.toISOString().slice(0, 10) ?? null,
          notes: c.notes,
          updated_at: c.updatedAt.toISOString(),
        })),
        vitals: row.vitals.map((v) => ({
          id: v.id,
          height_cm: v.heightCm,
          weight_kg: v.weightKg,
          blood_pressure_systolic: v.bloodPressureSystolic,
          blood_pressure_diastolic: v.bloodPressureDiastolic,
          pulse_bpm: v.pulseBpm,
          temperature_celsius: v.temperatureCelsius,
          recorded_at: v.recordedAt.toISOString(),
          notes: v.notes,
        })),
        emergency_contact: row.emergencyContact
          ? {
              id: row.emergencyContact.id,
              name: row.emergencyContact.name,
              relationship: row.emergencyContact.relationship,
              phone: row.emergencyContact.phone,
              notes: row.emergencyContact.notes,
              updated_at: row.emergencyContact.updatedAt.toISOString(),
            }
          : null,
      },
    };
  }

  private async emitMutation(personId: string, action: string, profileId: string) {
    await this.events.emit({
      type: 'HEALTH_PROFILE_MUTATED',
      outcome: 'success',
      personId,
      metadata: { action, profile_id: profileId },
    });
  }
}
