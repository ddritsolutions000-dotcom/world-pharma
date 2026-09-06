import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  ImagingBookingStatus,
  ImagingReportVersionStatus,
  LabBookingStatus,
  LabReportVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { AppointmentService } from '../clinical/appointment.service';
import { PrescriptionService } from '../clinical/prescription.service';
import { ImagingBookingService } from '../radiology/imaging-booking.service';
import { LabBookingService } from '../lab/lab-booking.service';
import type { Principal } from '../identity/current-principal';
import { OrderService } from '../orders/order.service';
import { PolicyResolver } from '../policy/resolver';
import { CarePlanService } from '../care-plan/care-plan.service';
import { MedicationReminderService } from '../medication-reminder/medication-reminder.service';
import { HealthInsightsService } from './health-insights.service';
import { HealthTimelineService } from './health-timeline.service';
import type { HealthSubject } from './health-subject.service';
import { SubjectHealthRecordsService } from './subject-health-records.service';

@Injectable()
export class HealthDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly appointments: AppointmentService,
    private readonly prescriptions: PrescriptionService,
    private readonly orders: OrderService,
    private readonly labBookings: LabBookingService,
    private readonly imagingBookings: ImagingBookingService,
    private readonly timeline: HealthTimelineService,
    private readonly carePlans: CarePlanService,
    private readonly medicationReminders: MedicationReminderService,
    private readonly insights: HealthInsightsService,
    private readonly subjectRecords: SubjectHealthRecordsService,
  ) {}

  async build(
    principal: Principal,
    countryId: string,
    countryCode: string,
    subject?: HealthSubject,
  ) {
    const now = new Date();
    const resolved = await this.policy.resolvePublished(countryCode);
    const timelineEnabled = this.policy.isHealthTimelineEnabled(resolved?.document ?? null);
    const activeSubject =
      subject ??
      ({
        kind: 'self',
        ownerPersonId: principal.personId,
        countryId,
        countryCode,
        familyMemberId: null,
        displayName: 'Me',
        relationshipCode: null,
      } as HealthSubject);

    const appointmentList = await this.subjectRecords.listAppointments(activeSubject);
    const prescriptionList = await this.subjectRecords.listPrescriptions(activeSubject, principal);
    const orderList =
      activeSubject.kind === 'family_member'
        ? { data: [] as Array<Record<string, unknown>> }
        : await this.orders.listMine(principal);
    const labList = await this.subjectRecords.listLabBookings(activeSubject, principal);
    const imagingList = await this.subjectRecords.listImagingBookings(activeSubject, principal);
    const pendingActions = await this.subjectRecords.loadPendingActions(activeSubject, now);

    const carePlanView =
      activeSubject.kind === 'family_member'
        ? { membership: null, plan: null, sandbox: true, country_code: countryCode, catalog: [] }
        : await this.carePlans.getMine(principal, countryCode).catch(() => ({
            membership: null,
            plan: null,
            sandbox: true,
            country_code: countryCode,
            catalog: [],
          }));
    const reminderList = await this.subjectRecords
      .listReminders(activeSubject, principal, countryCode)
      .catch(() => ({
        reminders: [],
      }));

    const appointments = appointmentList.appointments ?? [];
    const terminal = new Set<AppointmentStatus>([
      AppointmentStatus.CANCELLED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.FAILED,
    ]);

    const upcomingAppointments = appointments
      .filter((row) => {
        const starts = new Date(String(row.starts_at));
        return starts >= now && !terminal.has(row.status as AppointmentStatus);
      })
      .slice(0, 5);

    const recentConsultations = appointments
      .filter((row) => {
        const starts = new Date(String(row.starts_at));
        return (
          starts < now &&
          (row.status === AppointmentStatus.COMPLETED ||
            row.encounter?.status === 'COMPLETED')
        );
      })
      .slice(-5)
      .reverse();

    const recentPrescriptions = (prescriptionList.prescriptions ?? []).slice(0, 5);
    const recentOrders = (orderList.data ?? []).slice(0, 5);
    const recentLabBookings = (labList.data ?? [])
      .filter((row) => row.country_code === countryCode)
      .slice(0, 5);
    const recentImagingBookings = (imagingList.data ?? [])
      .filter((row) => row.country_code === countryCode)
      .slice(0, 5);

    const recentActivity = timelineEnabled
      ? await this.timeline.listForPatient({
          personId: principal.personId,
          countryId,
          limit: 10,
          subjectFamilyMemberId: activeSubject.familyMemberId,
        })
      : { items: [], next_cursor: null };

    const enabledReminders = (reminderList.reminders ?? []).filter(
      (row: { enabled?: boolean }) => row.enabled !== false,
    );
    const activeCarePlan =
      carePlanView.membership?.active && carePlanView.plan
        ? { plan_code: carePlanView.plan.id, name: carePlanView.plan.name }
        : null;

    const healthInsights = this.insights.build({
      pendingActions,
      upcomingAppointments: upcomingAppointments.map((row) => ({
        id: String(row.id),
        starts_at: typeof row.starts_at === 'string' ? row.starts_at : String(row.starts_at ?? ''),
        doctor_display_name:
          typeof row.doctor_display_name === 'string' ? row.doctor_display_name : undefined,
      })),
      enabledReminders: enabledReminders.map((row: { id: string; medicine_label: string; schedule_times: string[] }) => ({
        id: row.id,
        medicine_label: row.medicine_label,
        schedule_times: row.schedule_times,
      })),
      activeCarePlan,
      recentPrescriptions: recentPrescriptions.map((row) => ({
        id: String(row.id),
        status: typeof row.status === 'string' ? row.status : undefined,
      })),
    });

    return {
      country_code: countryCode,
      timeline_enabled: timelineEnabled,
      viewing_subject: {
        kind: activeSubject.kind,
        family_member_id: activeSubject.familyMemberId,
        display_name: activeSubject.displayName,
        relationship_code: activeSubject.relationshipCode,
      },
      overview: {
        upcoming_appointments: upcomingAppointments,
        recent_consultations: recentConsultations,
        recent_prescriptions: recentPrescriptions,
        recent_orders: recentOrders,
        recent_lab_bookings: recentLabBookings,
        recent_imaging_bookings: recentImagingBookings,
        pending_actions: pendingActions,
        active_care_plan: activeCarePlan,
        medication_reminders: enabledReminders.slice(0, 5),
        health_insights: healthInsights,
      },
      recent_activity: recentActivity,
    };
  }

  private async loadPendingActions(personId: string, countryId: string, now: Date) {
    const [upcomingAppointments, pendingLab, pendingImaging] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          customerPersonId: personId,
          countryId,
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
          customerPersonId: personId,
          countryId,
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
          customerPersonId: personId,
          countryId,
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
