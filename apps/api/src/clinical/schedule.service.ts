import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { DoctorService } from './doctor.service';
import { OCCUPYING_STATUSES } from './appointment-status';
import { addMinutes, eachYmd, weekdayInZone, zonedLocalToUtc } from './timezone';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DoctorService))
    private readonly doctors: DoctorService,
  ) {}

  async replaceWindows(
    personId: string,
    input: {
      timezone: string;
      windows: Array<{
        weekday: number;
        start_local: string;
        end_local: string;
        slot_minutes?: number;
        buffer_minutes?: number;
      }>;
    },
  ) {
    const partner = await this.doctors.requireDoctorPartner(personId);
    const profile = await this.prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    if (!input.timezone) {
      throw Errors.validation('timezone is required');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorAvailabilityWindow.deleteMany({ where: { doctorProfileId: profile.id } });
      for (const window of input.windows ?? []) {
        if (window.weekday < 0 || window.weekday > 6) {
          throw Errors.validation('weekday must be 0-6');
        }
        await tx.doctorAvailabilityWindow.create({
          data: {
            id: uuidv7(),
            doctorProfileId: profile.id,
            countryId: profile.countryId,
            timezone: input.timezone,
            weekday: window.weekday,
            startLocal: window.start_local,
            endLocal: window.end_local,
            slotMinutes: window.slot_minutes ?? 30,
            bufferMinutes: window.buffer_minutes ?? 0,
          },
        });
      }
      await tx.doctorProfile.update({
        where: { id: profile.id },
        data: { timezone: input.timezone },
      });
    });
    return this.list(personId);
  }

  async addException(
    personId: string,
    input: { starts_at: string; ends_at: string; reason_code?: string },
  ) {
    const partner = await this.doctors.requireDoctorPartner(personId);
    const profile = await this.prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    const startsAt = new Date(input.starts_at);
    const endsAt = new Date(input.ends_at);
    if (!(startsAt < endsAt)) {
      throw Errors.validation('Exception end must be after start');
    }
    const row = await this.prisma.doctorAvailabilityException.create({
      data: {
        id: uuidv7(),
        doctorProfileId: profile.id,
        countryId: profile.countryId,
        startsAt,
        endsAt,
        reasonCode: input.reason_code,
      },
    });
    return { id: row.id, starts_at: row.startsAt, ends_at: row.endsAt };
  }

  async list(personId: string) {
    const partner = await this.doctors.requireDoctorPartner(personId);
    const profile = await this.prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    const windows = await this.prisma.doctorAvailabilityWindow.findMany({
      where: { doctorProfileId: profile.id, isActive: true },
      orderBy: [{ weekday: 'asc' }, { startLocal: 'asc' }],
    });
    const exceptions = await this.prisma.doctorAvailabilityException.findMany({
      where: { doctorProfileId: profile.id },
      orderBy: { startsAt: 'asc' },
    });
    return {
      timezone: profile.timezone,
      windows: windows.map((row) => ({
        id: row.id,
        weekday: row.weekday,
        start_local: row.startLocal,
        end_local: row.endLocal,
        slot_minutes: row.slotMinutes,
        buffer_minutes: row.bufferMinutes,
      })),
      exceptions: exceptions.map((row) => ({
        id: row.id,
        starts_at: row.startsAt,
        ends_at: row.endsAt,
        reason_code: row.reasonCode,
      })),
    };
  }

  /** Summary for GET /doctor/me/availability — derived from canonical window state. */
  async summary(personId: string) {
    const schedule = await this.list(personId);
    return {
      configured: schedule.windows.length > 0,
      timezone: schedule.timezone,
      window_count: schedule.windows.length,
      exception_count: schedule.exceptions.length,
    };
  }

  async slotsForProfile(profileId: string, from: Date, to: Date, excludeAppointmentId?: string) {
    const windows = await this.prisma.doctorAvailabilityWindow.findMany({
      where: { doctorProfileId: profileId, isActive: true },
    });
    const exceptions = await this.prisma.doctorAvailabilityException.findMany({
      where: { doctorProfileId: profileId },
    });
    const busy = await this.prisma.appointment.findMany({
      where: {
        doctorProfileId: profileId,
        status: { in: OCCUPYING_STATUSES },
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
    });
    const slots: Array<{ starts_at: string; ends_at: string; timezone: string }> = [];
    for (const window of windows) {
      for (const ymd of eachYmd(from, to, window.timezone)) {
        const sample = zonedLocalToUtc(ymd, '12:00', window.timezone);
        if (weekdayInZone(sample, window.timezone) !== window.weekday) {
          continue;
        }
        let cursor = zonedLocalToUtc(ymd, window.startLocal, window.timezone);
        const windowEnd = zonedLocalToUtc(ymd, window.endLocal, window.timezone);
        while (addMinutes(cursor, window.slotMinutes).getTime() <= windowEnd.getTime()) {
          const slotEnd = addMinutes(cursor, window.slotMinutes);
          const bufferedEnd = addMinutes(slotEnd, window.bufferMinutes);
          const insideRange = cursor >= from && cursor < to;
          const blocked = exceptions.some((ex) => cursor < ex.endsAt && bufferedEnd > ex.startsAt);
          const conflict = busy.some((row) => cursor < row.endsAt && bufferedEnd > row.startsAt);
          if (insideRange && !blocked && !conflict) {
            slots.push({
              starts_at: cursor.toISOString(),
              ends_at: slotEnd.toISOString(),
              timezone: window.timezone,
            });
          }
          cursor = addMinutes(cursor, window.slotMinutes + window.bufferMinutes);
        }
      }
    }
    return slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
}
