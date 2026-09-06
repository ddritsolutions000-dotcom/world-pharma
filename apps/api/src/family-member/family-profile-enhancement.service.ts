import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { requireCountryCode } from '../catalog/catalog-country';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { HealthProfileService } from '../health/health-profile.service';
import { HealthSubjectService } from '../health/health-subject.service';
import { SubjectHealthRecordsService } from '../health/subject-health-records.service';

@Injectable()
export class FamilyProfileEnhancementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subjects: HealthSubjectService,
    private readonly records: SubjectHealthRecordsService,
    private readonly profiles: HealthProfileService,
  ) {}

  private async resolveCountry(code?: string) {
    const countryCode = requireCountryCode(code);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }
    return country;
  }

  async getFamilyHealthSummary(principal: Principal, countryCode?: string) {
    const country = await this.resolveCountry(countryCode);
    const members = await runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () =>
        this.prisma.customerFamilyMember.findMany({
          where: {
            customerPersonId: principal.personId,
            countryId: country.id,
            deletedAt: null,
            healthAccessEnabled: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
    );

    const memberSummaries = await Promise.all(
      members.map(async (member) => {
        const subject = await this.subjects.resolve(principal, country.isoAlpha2, member.id);
        const [prescriptions, labBookings, appointments, profile] = await Promise.all([
          this.records.listPrescriptions(subject, principal),
          this.records.listLabBookings(subject, principal),
          this.records.listAppointments(subject),
          this.profiles.getProfile(principal, country.isoAlpha2, member.id),
        ]);
        return {
          id: member.id,
          display_name: member.displayName,
          relationship_code: member.relationshipCode,
          age_years: member.ageYears,
          phone: member.phone,
          recent_prescriptions: prescriptions.prescriptions?.length ?? 0,
          recent_lab_tests: labBookings.data?.length ?? 0,
          recent_appointments: appointments.appointments?.length ?? 0,
          profile_allergies: profile.profile.allergies.length,
          profile_conditions: profile.profile.conditions.length,
        };
      }),
    );

    return {
      family_members: memberSummaries,
      total_members: members.length,
      country_code: country.isoAlpha2,
    };
  }

  async getFamilyMemberHealthRecords(
    principal: Principal,
    familyMemberId: string,
    countryCode?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    const subject = await this.subjects.resolve(principal, country.isoAlpha2, familyMemberId);
    await this.subjects.auditSubjectAccess(principal.personId, subject, 'family_records_read');
    const [prescriptions, labBookings, appointments, profile] = await Promise.all([
      this.records.listPrescriptions(subject, principal),
      this.records.listLabBookings(subject, principal),
      this.records.listAppointments(subject),
      this.profiles.getProfile(principal, country.isoAlpha2, familyMemberId),
    ]);
    return {
      family_member: {
        id: familyMemberId,
        display_name: subject.displayName,
        relationship_code: subject.relationshipCode,
      },
      health_profile: profile.profile,
      health_records: {
        prescriptions: prescriptions.prescriptions ?? [],
        lab_tests: labBookings.data ?? [],
        appointments: appointments.appointments ?? [],
      },
    };
  }

  async bookAppointmentForFamilyMember(
    principal: Principal,
    familyMemberId: string,
    bookingData: Record<string, unknown>,
    countryCode?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.subjects.resolve(principal, country.isoAlpha2, familyMemberId);
    return {
      message: 'Use the standard appointment booking flow with family member selection.',
      family_member_id: familyMemberId,
      booking_data: bookingData,
    };
  }

  async shareHealthRecords(
    principal: Principal,
    familyMemberId: string,
    recordTypes: string[],
    countryCode?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    const subject = await this.subjects.resolve(principal, country.isoAlpha2, familyMemberId);
    return {
      message: 'Family health records on this account are managed by the account owner.',
      family_member_id: familyMemberId,
      family_member_name: subject.displayName,
      shared_record_types: recordTypes,
    };
  }

  async getFamilyAnalytics(principal: Principal, countryCode?: string) {
    const summary = await this.getFamilyHealthSummary(principal, countryCode);
    return {
      family_overview: {
        total_members: summary.total_members,
        total_prescriptions: summary.family_members.reduce((n, m) => n + m.recent_prescriptions, 0),
        total_lab_tests: summary.family_members.reduce((n, m) => n + m.recent_lab_tests, 0),
        total_appointments: summary.family_members.reduce((n, m) => n + m.recent_appointments, 0),
      },
      health_insights: [],
    };
  }
}
