import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';

export type SubstituteEdgeView = {
  id: string;
  country_code: string;
  from_item_id: string;
  to_item_id: string;
  from_item_name?: string;
  to_item_name?: string;
  relationship_type: string;
  strength: number;
  active: boolean;
  reason: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class MedicineSubstituteEdgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  async list(countryCode: string, fromItemId?: string) {
    const country = await this.requireCountry(countryCode);
    const rows = await this.prisma.medicineSubstituteEdge.findMany({
      where: {
        countryId: country.id,
        ...(fromItemId ? { fromItemId } : {}),
      },
      include: {
        fromItem: { include: { translations: true } },
        toItem: { include: { translations: true } },
        country: true,
      },
      orderBy: [{ active: 'desc' }, { strength: 'desc' }],
      take: 200,
    });
    return {
      data: rows.map((row) => this.present(row)),
    };
  }

  async create(actorId: string, countryCode: string, input: Record<string, unknown>) {
    const country = await this.requireCountry(countryCode);
    const fromItemId = String(input.from_item_id ?? '');
    const toItemId = String(input.to_item_id ?? '');
    if (!fromItemId || !toItemId) {
      throw Errors.validation('from_item_id and to_item_id are required');
    }
    if (fromItemId === toItemId) {
      throw Errors.validation('Cannot link an item to itself');
    }
    const relationshipType = String(input.relationship_type ?? 'GENERIC');
    const row = await this.prisma.medicineSubstituteEdge.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        fromItemId,
        toItemId,
        relationshipType,
        strength: Number(input.strength ?? 100),
        active: input.active !== false,
        reason: input.reason ? String(input.reason) : null,
        effectiveFrom: input.effective_from ? new Date(String(input.effective_from)) : null,
        effectiveTo: input.effective_to ? new Date(String(input.effective_to)) : null,
        createdById: actorId,
      },
      include: {
        fromItem: { include: { translations: true } },
        toItem: { include: { translations: true } },
        country: true,
      },
    });
    await this.events.emit({
      type: 'SUBSTITUTE_EDGE_MUTATED',
      outcome: 'success',
      personId: actorId,
      metadata: { edge_id: row.id, action: 'CREATE', country_code: country.isoAlpha2 },
    });
    return this.present(row);
  }

  async update(actorId: string, edgeId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.medicineSubstituteEdge.findUnique({ where: { id: edgeId } });
    if (!existing) {
      throw Errors.notFound('Substitute relationship not found');
    }
    const row = await this.prisma.medicineSubstituteEdge.update({
      where: { id: edgeId },
      data: {
        ...(input.relationship_type !== undefined ? { relationshipType: String(input.relationship_type) } : {}),
        ...(input.strength !== undefined ? { strength: Number(input.strength) } : {}),
        ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
        ...(input.reason !== undefined ? { reason: input.reason ? String(input.reason) : null } : {}),
        ...(input.effective_from !== undefined
          ? { effectiveFrom: input.effective_from ? new Date(String(input.effective_from)) : null }
          : {}),
        ...(input.effective_to !== undefined
          ? { effectiveTo: input.effective_to ? new Date(String(input.effective_to)) : null }
          : {}),
      },
      include: {
        fromItem: { include: { translations: true } },
        toItem: { include: { translations: true } },
        country: true,
      },
    });
    await this.events.emit({
      type: 'SUBSTITUTE_EDGE_MUTATED',
      outcome: 'success',
      personId: actorId,
      metadata: { edge_id: row.id, action: 'UPDATE' },
    });
    return this.present(row);
  }

  async remove(actorId: string, edgeId: string) {
    const existing = await this.prisma.medicineSubstituteEdge.findUnique({ where: { id: edgeId } });
    if (!existing) {
      throw Errors.notFound('Substitute relationship not found');
    }
    await this.prisma.medicineSubstituteEdge.delete({ where: { id: edgeId } });
    await this.events.emit({
      type: 'SUBSTITUTE_EDGE_MUTATED',
      outcome: 'success',
      personId: actorId,
      metadata: { edge_id: edgeId, action: 'DELETE' },
    });
    return { ok: true };
  }

  async configuredSubstituteItemIds(countryId: string, fromItemId: string): Promise<string[]> {
    const now = new Date();
    const rows = await this.prisma.medicineSubstituteEdge.findMany({
      where: {
        countryId,
        fromItemId,
        active: true,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }],
      },
      orderBy: { strength: 'desc' },
    });
    return rows.map((row) => row.toItemId);
  }

  private present(row: {
    id: string;
    fromItemId: string;
    toItemId: string;
    relationshipType: string;
    strength: number;
    active: boolean;
    reason: string | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    createdAt: Date;
    updatedAt: Date;
    country: { isoAlpha2: string };
    fromItem?: { translations: Array<{ title: string }> };
    toItem?: { translations: Array<{ title: string }> };
  }): SubstituteEdgeView {
    return {
      id: row.id,
      country_code: row.country.isoAlpha2,
      from_item_id: row.fromItemId,
      to_item_id: row.toItemId,
      from_item_name: row.fromItem?.translations[0]?.title,
      to_item_name: row.toItem?.translations[0]?.title,
      relationship_type: row.relationshipType,
      strength: row.strength,
      active: row.active,
      reason: row.reason,
      effective_from: row.effectiveFrom?.toISOString() ?? null,
      effective_to: row.effectiveTo?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private async requireCountry(countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not found');
    }
    return country;
  }
}
