import { Injectable } from '@nestjs/common';
import { CatalogLifecycle, OfferOwnership, OfferStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { MarketplaceEligibilityService } from '../catalog/marketplace-eligibility.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { InventoryService } from '../inventory/inventory.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_REMINDERS = 50;

export type MedicationReminderInput = {
  country_code: string;
  medicine_label: string;
  prescription_id?: string | null;
  schedule_times: string[];
  days_of_week?: number[];
  enabled?: boolean;
  notes?: string | null;
};

@Injectable()
export class MedicationReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly inventory: InventoryService,
    private readonly marketplace: MarketplaceEligibilityService,
  ) {}

  async list(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.medicationReminder.findMany({
          where: {
            personId: principal.personId,
            countryId: country.id,
            deletedAt: null,
          },
          orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
        });
        return {
          reminders: rows.map((row) => this.present(row, country.isoAlpha2)),
        };
      },
    );
  }

  async create(principal: Principal, input: MedicationReminderInput) {
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const payload = await this.validateInput(principal, country.id, input);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const count = await this.prisma.medicationReminder.count({
          where: { personId: principal.personId, countryId: country.id, deletedAt: null },
        });
        if (count >= MAX_REMINDERS) {
          throw Errors.problem(
            409,
            'MEDICATION_REMINDER_LIMIT',
            'Reminder limit reached',
            `You may store up to ${MAX_REMINDERS} active medication reminders.`,
          );
        }
        const row = await this.prisma.medicationReminder.create({
          data: {
            id: uuidv7(),
            personId: principal.personId,
            countryId: country.id,
            ...payload,
          },
        });
        await this.outbox.enqueue(this.prisma, {
          type: 'MEDICATION_REMINDER_CREATED',
          aggregateType: 'MedicationReminder',
          aggregateId: row.id,
          producer: 'medication_reminder',
          countryId: country.id,
          actorId: principal.personId,
          payload: {
            person_id: principal.personId,
            medicine_label: row.medicineLabel,
            schedule_times: row.scheduleTimes,
            sandbox: true,
          },
          occurrenceKey: `MEDICATION_REMINDER_CREATED:${row.id}`,
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async update(principal: Principal, id: string, input: Partial<MedicationReminderInput>) {
    assertUuid(id, 'id');
    const existing = await this.prisma.medicationReminder.findFirst({
      where: { id, personId: principal.personId, deletedAt: null },
    });
    if (!existing) {
      throw Errors.notFound('Medication reminder not found');
    }
    const country = await resolveCountryByCode(
      this.prisma,
      input.country_code ?? (await this.countryCode(existing.countryId)),
    );
    const payload = await this.validateInput(
      principal,
      country.id,
      {
        country_code: country.isoAlpha2,
        medicine_label: input.medicine_label ?? existing.medicineLabel,
        prescription_id:
          input.prescription_id !== undefined ? input.prescription_id : existing.prescriptionId,
        schedule_times: input.schedule_times ?? existing.scheduleTimes,
        days_of_week: input.days_of_week ?? existing.daysOfWeek,
        enabled: input.enabled ?? existing.enabled,
        notes: input.notes !== undefined ? input.notes : existing.notes,
      },
      { partial: true },
    );
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.medicationReminder.update({
          where: { id: existing.id },
          data: payload,
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async buyAgain(principal: Principal, id: string, countryCode: string) {
    assertUuid(id, 'id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const reminder = await this.prisma.medicationReminder.findFirst({
      where: { id, personId: principal.personId, countryId: country.id, deletedAt: null },
    });
    if (!reminder) {
      throw Errors.notFound('Medication reminder not found');
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => this.resolveBuyAgain(principal, reminder, country.id, country.isoAlpha2),
    );
  }

  async remove(principal: Principal, id: string) {
    assertUuid(id, 'id');
    const existing = await this.prisma.medicationReminder.findFirst({
      where: { id, personId: principal.personId, deletedAt: null },
    });
    if (!existing) {
      throw Errors.notFound('Medication reminder not found');
    }
    return runWithTenant(
      workerTenantContext({ countryId: existing.countryId, personId: principal.personId }),
      async () => {
        await this.prisma.medicationReminder.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), enabled: false },
        });
        return { removed: true, id: existing.id };
      },
    );
  }

  private async countryCode(countryId: string) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    return country.isoAlpha2;
  }

  private async validateInput(
    principal: Principal,
    countryId: string,
    input: MedicationReminderInput,
    opts: { partial?: boolean } = {},
  ) {
    const label = input.medicine_label?.trim();
    if (!label || label.length > 200) {
      throw Errors.validation('medicine_label is required (max 200 characters).');
    }
    const times = this.normalizeTimes(input.schedule_times);
    if (!times.length) {
      throw Errors.validation('At least one schedule time is required (HH:mm, 24-hour).');
    }
    const days = this.normalizeDays(input.days_of_week ?? []);
    if (input.prescription_id) {
      assertUuid(input.prescription_id, 'prescription_id');
      const rx = await this.prisma.prescription.findFirst({
        where: {
          id: input.prescription_id,
          patientPersonId: principal.personId,
          countryId,
        },
      });
      if (!rx) {
        throw Errors.notFound('Prescription not found for reminder link.');
      }
    }
    if (opts.partial) {
      return {
        medicineLabel: label,
        prescriptionId: input.prescription_id ?? null,
        scheduleTimes: times,
        daysOfWeek: days,
        enabled: input.enabled ?? true,
        notes: input.notes?.trim() ? input.notes.trim().slice(0, 500) : null,
      };
    }
    return {
      medicineLabel: label,
      prescriptionId: input.prescription_id ?? null,
      scheduleTimes: times,
      daysOfWeek: days,
      enabled: input.enabled ?? true,
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 500) : null,
    };
  }

  private normalizeTimes(times: string[]) {
    if (!Array.isArray(times) || times.length === 0 || times.length > 6) {
      throw Errors.validation('schedule_times must contain 1–6 entries.');
    }
    const normalized = [...new Set(times.map((t) => t.trim()))];
    for (const time of normalized) {
      if (!TIME_RE.test(time)) {
        throw Errors.validation(`Invalid schedule time: ${time}`);
      }
    }
    return normalized.sort();
  }

  private normalizeDays(days: number[]) {
    if (!Array.isArray(days)) {
      throw Errors.validation('days_of_week must be an array.');
    }
    if (days.length === 0) {
      return [];
    }
    const normalized = [...new Set(days)];
    for (const day of normalized) {
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw Errors.validation('days_of_week entries must be integers 0 (Sun) through 6 (Sat).');
      }
    }
    return normalized.sort((a, b) => a - b);
  }

  private async resolveBuyAgain(
    principal: Principal,
    reminder: {
      id: string;
      medicineLabel: string;
      prescriptionId: string | null;
      scheduleTimes: string[];
    },
    countryId: string,
    countryIso2: string,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerPersonId: principal.personId,
        countryId,
        status: 'DELIVERED',
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        items: true,
      },
    });

    const labelNeedle = reminder.medicineLabel.trim().toLowerCase();
    let matched: { offerId: string; variantId: string; title: string; qty: number; rxRequired: boolean; orderId: string } | null =
      null;

    for (const order of orders) {
      if (reminder.prescriptionId && order.prescriptionId === reminder.prescriptionId) {
        const item = order.items[0];
        if (item) {
          matched = {
            offerId: item.offerId,
            variantId: item.variantId,
            title: item.title,
            qty: item.qty,
            rxRequired: item.rxRequired,
            orderId: order.id,
          };
          break;
        }
      }
      for (const item of order.items) {
        if (item.title.toLowerCase().includes(labelNeedle) || labelNeedle.includes(item.title.toLowerCase())) {
          matched = {
            offerId: item.offerId,
            variantId: item.variantId,
            title: item.title,
            qty: item.qty,
            rxRequired: item.rxRequired,
            orderId: order.id,
          };
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      return {
        reminder_id: reminder.id,
        medicine_label: reminder.medicineLabel,
        schedule_times: reminder.scheduleTimes,
        eligible: false,
        reason_code: 'NO_PRIOR_PURCHASE',
        reason: 'No delivered order found for this medicine.',
      };
    }

    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: matched.offerId },
      include: { variant: { include: { item: { include: { countries: true } } } } },
    });
    if (!offer || offer.countryId !== countryId || offer.status !== OfferStatus.PUBLISHED) {
      return {
        reminder_id: reminder.id,
        medicine_label: reminder.medicineLabel,
        schedule_times: reminder.scheduleTimes,
        eligible: false,
        offer_id: matched.offerId,
        last_order_id: matched.orderId,
        reason_code: 'OFFER_UNAVAILABLE',
        reason: 'Previous product offer is no longer published.',
      };
    }
    if (offer.variant.item.status !== CatalogLifecycle.PUBLISHED) {
      return {
        reminder_id: reminder.id,
        medicine_label: reminder.medicineLabel,
        schedule_times: reminder.scheduleTimes,
        eligible: false,
        offer_id: matched.offerId,
        last_order_id: matched.orderId,
        reason_code: 'PRODUCT_UNAVAILABLE',
        reason: 'Product is no longer available.',
      };
    }
    if (
      offer.ownership === OfferOwnership.VENDOR_OWNED ||
      offer.ownership === OfferOwnership.MARKETPLACE
    ) {
      const purchasable = await this.marketplace.isCustomerPurchasableSeller(offer.sellerOrgId);
      if (!purchasable) {
        return {
          reminder_id: reminder.id,
          medicine_label: reminder.medicineLabel,
          schedule_times: reminder.scheduleTimes,
          eligible: false,
          offer_id: matched.offerId,
          last_order_id: matched.orderId,
          reason_code: 'SELLER_UNAVAILABLE',
          reason: 'Seller is not eligible for marketplace orders.',
        };
      }
    }
    const available = await this.inventory.availableUnits(offer.variantId, offer.sellerOrgId, countryId);
    if (available < matched.qty) {
      return {
        reminder_id: reminder.id,
        medicine_label: reminder.medicineLabel,
        schedule_times: reminder.scheduleTimes,
        eligible: false,
        offer_id: matched.offerId,
        last_order_id: matched.orderId,
        qty: matched.qty,
        reason_code: 'OUT_OF_STOCK',
        reason: available <= 0 ? 'Out of stock.' : `Only ${available} unit(s) available.`,
      };
    }

    const slugRow = await this.prisma.catalogVariant.findUnique({
      where: { id: matched.variantId },
      include: { item: { select: { slug: true } } },
    });

    return {
      reminder_id: reminder.id,
      medicine_label: reminder.medicineLabel,
      schedule_times: reminder.scheduleTimes,
      eligible: true,
      offer_id: matched.offerId,
      product_slug: slugRow?.item.slug ?? null,
      last_order_id: matched.orderId,
      qty: matched.qty,
      rx_required: matched.rxRequired,
      title: matched.title,
      country_code: countryIso2,
    };
  }

  private present(
    row: {
      id: string;
      medicineLabel: string;
      prescriptionId: string | null;
      scheduleTimes: string[];
      daysOfWeek: number[];
      enabled: boolean;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      country_code: countryCode,
      medicine_label: row.medicineLabel,
      prescription_id: row.prescriptionId,
      schedule_times: row.scheduleTimes,
      days_of_week: row.daysOfWeek,
      enabled: row.enabled,
      notes: row.notes,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
