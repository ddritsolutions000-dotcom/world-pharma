import { Injectable } from '@nestjs/common';

export type HealthInsight = {
  code: string;
  title: string;
  detail: string;
  priority: number;
  href: string | null;
};

type InsightInput = {
  pendingActions: Array<{ kind: string; title: string; occurred_at: string }>;
  upcomingAppointments: Array<{ id: string; starts_at?: string; doctor_display_name?: string }>;
  enabledReminders: Array<{ id: string; medicine_label: string; schedule_times: string[] }>;
  activeCarePlan: { plan_code: string; name: string } | null;
  recentPrescriptions: Array<{ id: string; status?: string }>;
};

/** Deterministic, informational insights — not clinical decision support. */
@Injectable()
export class HealthInsightsService {
  build(input: InsightInput): HealthInsight[] {
    const insights: HealthInsight[] = [];

    if (input.pendingActions.length > 0) {
      insights.push({
        code: 'pending_actions',
        title: 'Pending health actions',
        detail: `${input.pendingActions.length} item(s) need your attention (appointments, reports, or follow-ups).`,
        priority: 1,
        href: '/health',
      });
    }

    const nextAppt = input.upcomingAppointments[0];
    if (nextAppt?.starts_at) {
      insights.push({
        code: 'next_appointment',
        title: 'Upcoming consultation',
        detail: nextAppt.doctor_display_name
          ? `Next visit with ${nextAppt.doctor_display_name} on ${nextAppt.starts_at}.`
          : `Next consultation scheduled for ${nextAppt.starts_at}.`,
        priority: 2,
        href: nextAppt.id ? `/appointments/${nextAppt.id}` : '/appointments',
      });
    }

    if (input.enabledReminders.length > 0) {
      const labels = input.enabledReminders.slice(0, 3).map((r) => r.medicine_label);
      insights.push({
        code: 'medication_reminders',
        title: 'Medication reminders active',
        detail:
          input.enabledReminders.length === 1
            ? `Reminder set for ${labels[0]}.`
            : `${input.enabledReminders.length} reminders active (${labels.join(', ')}${input.enabledReminders.length > 3 ? ', …' : ''}).`,
        priority: 3,
        href: '/reminders',
      });
    }

    if (input.activeCarePlan) {
      insights.push({
        code: 'care_plan_active',
        title: 'Care plan enrolled',
        detail: `Your ${input.activeCarePlan.name} plan is active. Review benefits and included services.`,
        priority: 4,
        href: '/care-plan',
      });
    }

    const pendingLab = input.pendingActions.filter((row) => row.kind === 'lab_report_pending').length;
    if (pendingLab > 0) {
      insights.push({
        code: 'lab_reports_pending',
        title: 'Lab reports in progress',
        detail: `${pendingLab} lab booking(s) awaiting report publication.`,
        priority: 5,
        href: '/lab/bookings',
      });
    }

    const pendingImaging = input.pendingActions.filter((row) => row.kind === 'imaging_report_pending').length;
    if (pendingImaging > 0) {
      insights.push({
        code: 'imaging_reports_pending',
        title: 'Imaging reports in progress',
        detail: `${pendingImaging} imaging booking(s) awaiting report publication (text report; no PACS viewer).`,
        priority: 6,
        href: '/radiology/bookings',
      });
    }

    const activeRx = input.recentPrescriptions.filter(
      (row) => row.status && !['CANCELLED', 'EXPIRED', 'VOID'].includes(String(row.status)),
    ).length;
    if (activeRx > 0) {
      insights.push({
        code: 'prescriptions_on_file',
        title: 'Prescriptions on file',
        detail: `${activeRx} prescription record(s) available. Order eligible medicines from the pharmacy.`,
        priority: 7,
        href: '/prescriptions',
      });
    }

    return insights.sort((a, b) => a.priority - b.priority).slice(0, 8);
  }
}
