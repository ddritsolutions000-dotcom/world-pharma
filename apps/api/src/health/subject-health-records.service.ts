import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  ImagingBookingStatus,
  ImagingReportVersionStatus,
  LabBookingStatus,
  LabReportVersionStatus,
  PrescriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { AppointmentService } from '../clinical/appointment.service';
import { PrescriptionService } from '../clinical/prescription.service';
import { ImagingBookingService } from '../radiology/imaging-booking.service';
import { LabBookingService } from '../lab/lab-booking.service';
import { MedicationReminderService } from '../medication-reminder/medication-reminder.service';
import type { Principal } from '../identity/current-principal';
import type { HealthSubject } from './health-subject.service';
import { subjectScopeWhere } from './health-subject-filter';

@Injectable()
export class SubjectHealthRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentService,
    private readonly prescriptions: PrescriptionService,
    private readonly labBookings: LabBookingService,
    private readonly imagingBookings: ImagingBookingService,
    private readonly medicationReminders: MedicationReminderService,
  ) {}

  async listAppointments(subject: HealthSubject) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        customerPersonId: subject.ownerPersonId,
        countryId: subject.countryId,
        ...subjectScopeWhere(subject),
      },
      orderBy: { startsAt: 'asc' },
      include: { encounter: true, doctorProfile: true },
    });
    return {
      appointments: rows.map((row) => ({
        id: row.id,
        starts_at: row.startsAt.toISOString(),
        ends_at: row.endsAt.toISOString(),
        status: row.status,
        type: row.type,
        doctor_display_name: row.doctorProfile?.displayName ?? null,
        encounter: row.encounter ? { id: row.encounter.id, status: row.encounter.status } : null,
      })),
    };
  }

  async listPrescriptions(subject: HealthSubject, principal: Principal) {
    const rows = await this.prisma.prescription.findMany({
      where: {
        patientPersonId: subject.ownerPersonId,
        countryId: subject.countryId,
        status: { not: PrescriptionStatus.DRAFT },
        ...subjectScopeWhere(subject),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (subject.kind === 'self') {
      const detailed = await this.prescriptions.listForCustomer(principal);
      const allowed = new Set(rows.map((row) => row.id));
      return {
        prescriptions: (detailed.prescriptions ?? []).filter((row) => allowed.has(String(row.id))),
      };
    }
    return {
      prescriptions: rows.map((row) => ({
        id: row.id,
        status: row.status,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async listLabBookings(subject: HealthSubject, principal: Principal) {
    const rows = await this.prisma.labBooking.findMany({
      where: {
        customerPersonId: subject.ownerPersonId,
        countryId: subject.countryId,
        ...subjectScopeWhere(subject),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (subject.kind === 'self') {
      const all = await this.labBookings.listCustomerBookings(principal);
      const allowed = new Set(rows.map((row) => row.id));
      return {
        data: (all.data ?? []).filter(
          (row) => row.country_code === subject.countryCode && allowed.has(String(row.id)),
        ),
      };
    }
    return {
      data: rows.map((row) => ({
        id: row.id,
        country_code: subject.countryCode,
        status: row.status,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async listImagingBookings(subject: HealthSubject, principal: Principal) {
    const rows = await this.prisma.imagingBooking.findMany({
      where: {
        customerPersonId: subject.ownerPersonId,
        countryId: subject.countryId,
        ...subjectScopeWhere(subject),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (subject.kind === 'self') {
      const all = await this.imagingBookings.listCustomerBookings(principal);
      const allowed = new Set(rows.map((row) => row.id));
      return {
        data: (all.data ?? []).filter(
          (row) => row.country_code === subject.countryCode && allowed.has(String(row.id)),
        ),
      };
    }
    return {
      data: rows.map((row) => ({
        id: row.id,
        country_code: subject.countryCode,
        status: row.status,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async listReminders(subject: HealthSubject, principal: Principal, countryCode: string) {
    if (subject.kind === 'self') {
      return this.medicationReminders.list(principal, countryCode);
    }
    const rows = await this.prisma.medicationReminder.findMany({
      where: {
        personId: subject.ownerPersonId,
        countryId: subject.countryId,
        deletedAt: null,
        ...subjectScopeWhere(subject),
      },
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });
    return {
      reminders: rows.map((row) => ({
        id: row.id,
        medicine_label: row.medicineLabel,
        schedule_times: row.scheduleTimes,
        enabled: row.enabled,
      })),
    };
  }

  async loadPendingActions(subject: HealthSubject, now: Date) {
    const scope = subjectScopeWhere(subject);
    const [upcomingAppointments, pendingLab, pendingImaging] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          customerPersonId: subject.ownerPersonId,
          countryId: subject.countryId,
          ...scope,
          startsAt: { gte: now },
          status: {
            in: [
              AppointmentStatus.REQUESTED,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.RESCHEDULED,
              AppointmentStatus.CHECKED_IN,
            ],
          },
        },
        orderBy: { startsAt: 'asc' },
        take: 5,
        include: { doctorProfile: true },
      }),
      this.prisma.labBooking.findMany({
        where: {
          customerPersonId: subject.ownerPersonId,
          countryId: subject.countryId,
          ...scope,
          status: LabBookingStatus.CONFIRMED,
          OR: [
            { labReport: null },
            {
              labReport: {
                OR: [
                  { currentVersionId: null },
                  { currentVersion: { status: { not: LabReportVersionStatus.PUBLISHED } } },
                ],
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.imagingBooking.findMany({
        where: {
          customerPersonId: subject.ownerPersonId,
          countryId: subject.countryId,
          ...scope,
          status: ImagingBookingStatus.CONFIRMED,
          OR: [
            { report: null },
            {
              report: {
                OR: [
                  { currentVersionId: null },
                  { currentVersion: { status: { not: ImagingReportVersionStatus.PUBLISHED } } },
                ],
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

    const actions: Array<{
      kind: string;
      id: string;
      title: string;
      status: string;
      occurred_at: string;
    }> = [];

    for (const row of upcomingAppointments) {
      actions.push({
        kind: 'appointment_upcoming',
        id: row.id,
        title: `Upcoming consultation${row.doctorProfile?.displayName ? ` with ${row.doctorProfile.displayName}` : ''}`,
        status: row.status,
        occurred_at: row.startsAt.toISOString(),
      });
    }
    for (const row of pendingLab) {
      actions.push({
        kind: 'lab_report_pending',
        id: row.id,
        title: 'Lab report pending publication',
        status: row.status,
        occurred_at: row.updatedAt.toISOString(),
      });
    }
    for (const row of pendingImaging) {
      actions.push({
        kind: 'imaging_report_pending',
        id: row.id,
        title: 'Imaging report pending publication',
        status: row.status,
        occurred_at: row.updatedAt.toISOString(),
      });
    }

    return actions
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
      .slice(0, 8);
  }
}
