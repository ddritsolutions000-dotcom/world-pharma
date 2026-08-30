import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';

const MAX_PATIENT_SUMMARY_LENGTH = 8000;

@Injectable()
export class EncounterConsultNoteService {
  constructor(private readonly prisma: PrismaService) {}

  normalizePatientSummary(raw: string | undefined | null): string | null {
    const trimmed = raw?.trim() ?? '';
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > MAX_PATIENT_SUMMARY_LENGTH) {
      throw Errors.validation(`patient_summary must be at most ${MAX_PATIENT_SUMMARY_LENGTH} characters.`);
    }
    return trimmed;
  }

  async recordOnComplete(
    tx: Prisma.TransactionClient,
    input: {
      encounterId: string;
      countryId: string;
      patientPersonId: string;
      doctorProfileId: string;
      patientSummary: string;
      completedAt: Date;
    },
  ) {
    const existing = await tx.encounterConsultNote.findUnique({
      where: { encounterId: input.encounterId },
    });
    if (existing) {
      return existing;
    }
    return tx.encounterConsultNote.create({
      data: {
        id: uuidv7(),
        encounterId: input.encounterId,
        countryId: input.countryId,
        patientPersonId: input.patientPersonId,
        doctorProfileId: input.doctorProfileId,
        patientSummary: input.patientSummary,
        completedAt: input.completedAt,
        sandbox: true,
      },
    });
  }

  async getHealthPayload(encounterId: string, patientPersonId: string) {
    const note = await this.prisma.encounterConsultNote.findUnique({
      where: { encounterId },
    });
    if (!note || note.patientPersonId !== patientPersonId) {
      throw Errors.notFound('Consult note not found');
    }
    return {
      encounter_id: note.encounterId,
      patient_summary: note.patientSummary,
      completed_at: note.completedAt.toISOString(),
      sandbox: note.sandbox,
      note: 'Patient-visible consult summary only. Clinician-only notes remain in the encounter module.',
    };
  }
}
