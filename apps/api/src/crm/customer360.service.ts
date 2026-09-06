import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { RateLimitService } from '../identity/rate-limit.service';
import { PolicyResolver } from '../policy/resolver';
import { resolveCountryByCode, assertUuid, isUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { maskIdentifier } from './crm-mask';
import { MarketingPreferenceService } from './marketing-preference.service';

@Injectable()
export class Customer360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly marketingPrefs: MarketingPreferenceService,
    private readonly policies: PolicyResolver,
    private readonly rateLimit: RateLimitService,
  ) {}

  async searchCustomers(principal: Principal, query: { country_code: string; q?: string; limit?: number }) {
    this.assertAdmin(principal);
    await this.assertCrmEnabled(query.country_code);
    const country = await resolveCountryByCode(this.prisma, query.country_code);
    const q = query.q?.trim() ?? '';
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 50);

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        let personIds: string[] | undefined;
        if (q) {
          if (isUuid(q)) {
            personIds = [q];
          } else if (q.includes('@')) {
            const ids = await this.prisma.accountIdentifier.findMany({
              where: { type: 'EMAIL', valueNormalized: q.toLowerCase() },
              select: { personId: true },
              take: limit,
            });
            personIds = ids.map((row) => row.personId);
          } else {
            const order = await this.prisma.order.findFirst({
              where: { orderNumber: q, countryId: country.id },
              select: { customerPersonId: true },
            });
            if (order) {
              personIds = [order.customerPersonId];
            }
          }
          if (personIds && personIds.length === 0) {
            return { data: [] };
          }
        }

        const orders = await this.prisma.order.findMany({
          where: {
            countryId: country.id,
            ...(personIds ? { customerPersonId: { in: personIds } } : {}),
          },
          select: { customerPersonId: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { customerPersonId: 'asc' }],
          take: personIds ? limit : limit * 3,
        });
        const uniquePersonIds = [...new Set(orders.map((o) => o.customerPersonId))].slice(0, limit);
        if (uniquePersonIds.length === 0 && personIds?.length) {
          uniquePersonIds.push(...personIds.slice(0, limit));
        }
        const profiles = await Promise.all(
          uniquePersonIds.map((personId) => this.buildProfileSummary(personId, country.id, country.isoAlpha2)),
        );
        return { data: profiles.filter(Boolean) };
      },
    );
  }

  async getCustomer360(principal: Principal, personId: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(personId, 'person id');
    await this.assertCrmEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const hasCountryActivity = await this.prisma.order.findFirst({
          where: { customerPersonId: personId, countryId: country.id },
          select: { id: true },
        });
        const hasTicket = await this.prisma.supportTicket.findFirst({
          where: { personId, countryId: country.id },
          select: { id: true },
        });
        const hasAppointment = await this.prisma.appointment.findFirst({
          where: { customerPersonId: personId, countryId: country.id },
          select: { id: true },
        });
        if (!hasCountryActivity && !hasTicket && !hasAppointment) {
          const person = await this.prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
          if (!person) {
            throw Errors.notFound('Customer not found');
          }
          throw Errors.notFound('Customer not found');
        }

        await this.securityEvents.emit({
          type: 'CRM_CUSTOMER_VIEW',
          outcome: 'success',
          personId: principal.personId,
          metadata: { subject_person_id: personId, country_id: country.id },
        });

        const [
          profile,
          orders,
          appointments,
          labBookings,
          imagingBookings,
          tickets,
          marketing,
          refills,
          subscriptions,
          loyalty,
          reviews,
        ] =
          await Promise.all([
            this.buildProfileSummary(personId, country.id, country.isoAlpha2),
            this.listOrders(personId, country.id),
            this.listAppointments(personId, country.id),
            this.listLabBookings(personId, country.id),
            this.listImagingBookings(personId, country.id),
            this.listTickets(personId, country.id),
            this.marketingPrefs.getForPerson(personId, country.isoAlpha2),
            this.listRefillMetadata(personId, country.id),
            this.listSubscriptionMetadata(personId, country.id),
            this.listLoyalty(personId, country.id),
            this.listReviews(personId, country.id),
          ]);

        return {
          person_id: personId,
          country_code: country.isoAlpha2,
          profile,
          orders,
          appointments,
          lab_bookings: labBookings,
          imaging_bookings: imagingBookings,
          support_tickets: tickets,
          marketing_preferences: marketing,
          refill_requests: refills,
          rx_subscriptions: subscriptions,
          loyalty: loyalty,
          product_reviews: reviews,
        };
      },
    );
  }

  async listCustomerOrders(principal: Principal, personId: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(personId, 'person id');
    await this.assertCrmEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => ({ data: await this.listOrders(personId, country.id) }),
    );
  }

  async listCustomerTickets(principal: Principal, personId: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(personId, 'person id');
    await this.assertCrmEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => ({ data: await this.listTickets(personId, country.id) }),
    );
  }

  async revealIdentifiers(
    principal: Principal,
    personId: string,
    body: { country_code: string; reason: string },
  ) {
    this.assertAdmin(principal);
    const hit = await this.rateLimit.hit(`admin:pii-reveal:${principal.personId}`, 10, 900);
    if (!hit.allowed) {
      throw Errors.rateLimited(hit.retryAfter);
    }
    assertUuid(personId, 'person id');
    const reason = body.reason?.trim();
    if (!reason || reason.length < 8) {
      throw Errors.validation('A reason of at least 8 characters is required to reveal PII');
    }
    await this.assertCrmEnabled(body.country_code);
    const country = await resolveCountryByCode(this.prisma, body.country_code);

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const person = await this.prisma.person.findUnique({
          where: { id: personId },
          select: {
            id: true,
            identifiers: { select: { type: true, valueNormalized: true, verifiedAt: true } },
          },
        });
        if (!person) {
          throw Errors.notFound('Customer not found');
        }

        await this.securityEvents.emit({
          type: 'CRM_PII_REVEAL',
          outcome: 'success',
          personId: principal.personId,
          metadata: {
            subject_person_id: personId,
            country_id: country.id,
            reason,
          },
        });

        return {
          person_id: person.id,
          country_code: country.isoAlpha2,
          identifiers: person.identifiers.map((row) => ({
            type: row.type,
            value: row.valueNormalized,
            verified: row.verifiedAt != null,
          })),
          revealed_at: new Date().toISOString(),
        };
      },
    );
  }

  private async buildProfileSummary(personId: string, countryId: string, countryCode: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        status: true,
        preferredLocale: true,
        primaryCountryId: true,
        account: { select: { status: true } },
        identifiers: { select: { type: true, valueNormalized: true, verifiedAt: true } },
      },
    });
    if (!person) {
      return null;
    }
    return {
      person_id: person.id,
      status: person.status,
      account_status: person.account?.status ?? null,
      preferred_locale: person.preferredLocale,
      primary_country_id: person.primaryCountryId,
      country_code: countryCode,
      identifiers: person.identifiers.map((row) => ({
        type: row.type,
        masked_value: maskIdentifier(row.type, row.valueNormalized),
        verified: row.verifiedAt != null,
      })),
    };
  }

  private async listOrders(personId: string, countryId: string) {
    const rows = await this.prisma.order.findMany({
      where: { customerPersonId: personId, countryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currency: true,
        totalMinor: true,
        createdAt: true,
        prescriptionId: true,
        items: {
          select: {
            id: true,
            title: true,
            qty: true,
            lineMinor: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      order_number: row.orderNumber,
      status: row.status,
      currency: row.currency,
      total_minor: row.totalMinor.toString(),
      created_at: row.createdAt.toISOString(),
      has_prescription_link: row.prescriptionId != null,
      items: row.items.map((item) => ({
        id: item.id,
        title: item.title,
        qty: item.qty,
        line_minor: item.lineMinor.toString(),
      })),
    }));
  }

  private async listAppointments(personId: string, countryId: string) {
    const rows = await this.prisma.appointment.findMany({
      where: { customerPersonId: personId, countryId },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        status: true,
        type: true,
        startsAt: true,
        endsAt: true,
        doctorProfile: { select: { specialties: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      type: row.type,
      starts_at: row.startsAt.toISOString(),
      ends_at: row.endsAt.toISOString(),
      specialties: row.doctorProfile.specialties,
    }));
  }

  private async listLabBookings(personId: string, countryId: string) {
    const rows = await this.prisma.labBooking.findMany({
      where: { customerPersonId: personId, countryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        status: true,
        collectionMode: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        labReport: { select: { currentVersion: { select: { status: true, publishedAt: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      collection_mode: row.collectionMode,
      total_minor: row.totalMinor.toString(),
      currency: row.currency,
      created_at: row.createdAt.toISOString(),
      report_released: row.labReport?.currentVersion?.status === 'PUBLISHED',
    }));
  }

  private async listImagingBookings(personId: string, countryId: string) {
    const rows = await this.prisma.imagingBooking.findMany({
      where: { customerPersonId: personId, countryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        status: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        report: { select: { currentVersion: { select: { status: true, publishedAt: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      total_minor: row.totalMinor.toString(),
      currency: row.currency,
      created_at: row.createdAt.toISOString(),
      report_released: row.report?.currentVersion?.status === 'PUBLISHED',
    }));
  }

  private async listTickets(personId: string, countryId: string) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { personId, countryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        status: true,
        subject: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
        queue: { select: { code: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      subject: row.subject,
      reference_type: row.referenceType,
      reference_id: row.referenceId,
      queue_code: row.queue.code,
      created_at: row.createdAt.toISOString(),
    }));
  }

  private async listRefillMetadata(personId: string, countryId: string) {
    const rows = await this.prisma.refillRequest.findMany({
      where: { customerPersonId: personId, countryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 10,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    }));
  }

  private async listSubscriptionMetadata(personId: string, countryId: string) {
    const rows = await this.prisma.rxSubscription.findMany({
      where: { customerPersonId: personId, countryId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 10,
      select: {
        id: true,
        status: true,
        autoExecuteEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      auto_execute_enabled: row.autoExecuteEnabled,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    }));
  }

  private async listLoyalty(personId: string, countryId: string) {
    const accounts = await this.prisma.loyaltyAccount.findMany({
      where: { personId, countryId },
      take: 10,
      include: {
        program: { select: { code: true, name: true, status: true } },
      },
    });
    const sums =
      accounts.length === 0
        ? []
        : await this.prisma.loyaltyLedgerEntry.groupBy({
            by: ['accountId'],
            where: { accountId: { in: accounts.map((row) => row.id) } },
            _sum: { pointsDelta: true },
          });
    const byAccount = new Map(sums.map((row) => [row.accountId, row._sum.pointsDelta ?? 0]));
    return accounts.map((account) => ({
      program_code: account.program.code,
      program_name: account.program.name,
      program_status: account.program.status,
      points_balance: byAccount.get(account.id) ?? 0,
    }));
  }

  private async listReviews(personId: string, countryId: string) {
    const rows = await this.prisma.productReview.findMany({
      where: { authorPersonId: personId, countryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        rating: true,
        status: true,
        createdAt: true,
        catalogItem: { select: { slug: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      status: row.status,
      catalog_slug: row.catalogItem.slug,
      created_at: row.createdAt.toISOString(),
    }));
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience required');
    }
  }

  private async assertCrmEnabled(countryCode: string) {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.crm?.enabled) {
      throw Errors.forbidden('CRM is not enabled for this country');
    }
  }
}
