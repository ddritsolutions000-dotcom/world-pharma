import { Injectable } from '@nestjs/common';
import type { Principal } from '../identity/current-principal';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { RbacService } from '../identity/rbac.service';
import { loadAccessScope, countryFilter } from '../identity/scope';
import { gatewayCodeFromRouting } from '../payment/gateway-code';

export type AdminEntitySearchHit = {
  entity_type: string;
  id: string;
  label: string;
  status: string | null;
  country_code: string | null;
  href: string;
  score: number;
  /** Safe operational metadata only — never clinical payload. */
  meta?: Record<string, string | null>;
};

@Injectable()
export class AdminEntitySearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async search(principal: Principal, query: string, countryCode?: string, limit = 20) {
    const q = query.trim();
    if (q.length < 2) {
      throw Errors.validation('Query must be at least 2 characters');
    }
    const scope = await loadAccessScope(this.prisma, principal);
    const rbac = await this.rbac.permissionsForPerson(principal.personId);
    const perms = new Set(rbac.permissions);
    const take = Math.min(Math.max(limit, 1), 30);
    const hits: AdminEntitySearchHit[] = [];
    const scopedCountryId = countryFilter(scope);

    let countryId: string | undefined = scopedCountryId;
    if (!countryId && countryCode?.trim()) {
      const country = await this.prisma.country.findUnique({
        where: { isoAlpha2: countryCode.trim().toUpperCase() },
      });
      countryId = country?.id;
    }

    if (perms.has('order:read')) {
      const orders = await this.prisma.order.findMany({
        where: {
          ...(countryId ? { countryId } : {}),
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { id: q.length >= 32 ? q : undefined },
          ].filter(Boolean) as Array<{ orderNumber?: { contains: string; mode: 'insensitive' }; id?: string }>,
        },
        take: 5,
        include: { country: { select: { isoAlpha2: true } } },
      });
      for (const row of orders) {
        hits.push({
          entity_type: 'order',
          id: row.id,
          label: row.orderNumber,
          status: row.status,
          country_code: row.country?.isoAlpha2 ?? null,
          href: `/orders?orderId=${row.id}`,
          score: 95,
          meta: { currency: row.currency },
        });
      }
    }

    if (perms.has('payment:read')) {
      const attempts = await this.prisma.paymentAttempt.findMany({
        where: {
          OR: [
            { providerRef: { contains: q, mode: 'insensitive' } },
            { intentId: q.length >= 32 ? q : undefined },
          ].filter(Boolean) as Array<{ providerRef?: { contains: string; mode: 'insensitive' }; intentId?: string }>,
        },
        take: 5,
        include: {
          intent: {
            include: { country: { select: { isoAlpha2: true } } },
          },
        },
      });
      for (const row of attempts) {
        if (countryId && row.intent.countryId !== countryId) {
          continue;
        }
        hits.push({
          entity_type: 'payment',
          id: row.intent.id,
          label: row.providerRef ?? row.intent.id.slice(0, 8),
          status: row.intent.status,
          country_code: row.intent.country?.isoAlpha2 ?? null,
          href: `/payments?id=${row.intent.id}`,
          score: 92,
          meta: {
            gateway: gatewayCodeFromRouting(row.routingJson),
            sandbox: row.intent.sandbox ? 'true' : 'false',
            currency: row.intent.currency,
          },
        });
      }
      if (q.length >= 32) {
        const intents = await this.prisma.paymentIntent.findMany({
          where: {
            ...(countryId ? { countryId } : {}),
            id: q,
          },
          take: 3,
          include: { country: { select: { isoAlpha2: true } } },
        });
        for (const row of intents) {
          if (hits.some((hit) => hit.id === row.id && hit.entity_type === 'payment')) {
            continue;
          }
          hits.push({
            entity_type: 'payment',
            id: row.id,
            label: `Payment ${row.id.slice(0, 8)}`,
            status: row.status,
            country_code: row.country?.isoAlpha2 ?? null,
            href: `/payments?id=${row.id}`,
            score: 88,
            meta: { sandbox: row.sandbox ? 'true' : 'false', currency: row.currency },
          });
        }
      }
    }

    if (perms.has('partner:manage')) {
      const partners = await this.prisma.partner.findMany({
        where: {
          ...(countryId ? { countryId } : {}),
          OR: [
            { organization: { is: { displayName: { contains: q, mode: 'insensitive' } } } },
            { organization: { is: { legalName: { contains: q, mode: 'insensitive' } } } },
            { id: q.length >= 32 ? q : undefined },
          ].filter(Boolean) as never[],
        },
        include: {
          organization: true,
          partnerType: true,
          country: { select: { isoAlpha2: true } },
        },
        take: 8,
      });
      for (const row of partners) {
        const type = row.partnerTypeCode.toLowerCase();
        const href =
          type === 'lab'
            ? `/labs?partnerId=${row.id}`
            : type === 'doctor' || type === 'clinic'
              ? `/doctors?partnerId=${row.id}`
              : type === 'imaging' || type === 'imaging_center' || type === 'radiology'
                ? `/imaging?partnerId=${row.id}`
                : type === 'affiliate'
                  ? `/affiliates?partnerId=${row.id}`
                  : `/partners?partnerId=${row.id}`;
        hits.push({
          entity_type:
            type === 'vendor' || type === 'pharmacy'
              ? 'vendor'
              : type === 'imaging_center' || type === 'radiology'
                ? 'imaging_center'
                : type,
          id: row.id,
          label: row.organization?.displayName ?? row.id.slice(0, 8),
          status: row.status,
          country_code: row.country?.isoAlpha2 ?? null,
          href,
          score: 80,
          meta: { partner_type: row.partnerTypeCode },
        });
      }

      const applications = await this.prisma.partnerApplication.findMany({
        where: {
          ...(countryId ? { countryId } : {}),
          OR: [
            { id: q.length >= 32 ? q : undefined },
            { partner: { organization: { is: { displayName: { contains: q, mode: 'insensitive' } } } } },
          ].filter(Boolean) as never[],
        },
        include: {
          partner: { include: { organization: true, country: { select: { isoAlpha2: true } } } },
        },
        take: 5,
      });
      for (const row of applications) {
        hits.push({
          entity_type: 'partner_application',
          id: row.id,
          label: `${row.partnerTypeCode} application · ${row.partner?.organization?.displayName ?? row.id.slice(0, 8)}`,
          status: row.status,
          country_code: row.partner?.country?.isoAlpha2 ?? null,
          href: `/partners?applicationId=${row.id}`,
          score: 78,
        });
      }
    }

    if (perms.has('affiliate:read')) {
      const affiliates = await this.prisma.partner.findMany({
        where: {
          partnerTypeCode: 'AFFILIATE',
          ...(countryId ? { countryId } : {}),
          organization: { is: { displayName: { contains: q, mode: 'insensitive' } } },
        },
        include: { organization: true, country: { select: { isoAlpha2: true } } },
        take: 5,
      });
      for (const row of affiliates) {
        if (hits.some((hit) => hit.id === row.id)) {
          continue;
        }
        hits.push({
          entity_type: 'affiliate',
          id: row.id,
          label: row.organization?.displayName ?? row.id.slice(0, 8),
          status: row.status,
          country_code: row.country?.isoAlpha2 ?? null,
          href: `/affiliates?partnerId=${row.id}`,
          score: 76,
        });
      }
    }

    if (perms.has('crm:read')) {
      const persons = await this.prisma.person.findMany({
        where: {
          identifiers: {
            some: {
              OR: [
                { type: 'EMAIL', valueNormalized: { contains: q.toLowerCase() } },
                { type: 'PHONE', valueNormalized: { contains: q.replace(/\D/g, '') || q } },
              ],
            },
          },
        },
        include: { identifiers: true },
        take: 5,
      });
      for (const row of persons) {
        const email = row.identifiers.find((id) => id.type === 'EMAIL')?.valueNormalized;
        hits.push({
          entity_type: 'customer',
          id: row.id,
          label: email ? `${email.slice(0, 3)}…@${email.split('@')[1] ?? 'masked'}` : row.id.slice(0, 8),
          status: row.status,
          country_code: null,
          href: `/crm/customers/${row.id}`,
          score: 70,
        });
      }
    }

    if (perms.has('logistics:read')) {
      const shipments = await this.prisma.shipment.findMany({
        where: {
          ...(countryId ? { order: { countryId } } : {}),
          OR: [
            { trackingNumber: { contains: q, mode: 'insensitive' } },
            { id: q.length >= 32 ? q : undefined },
            { order: { is: { orderNumber: { contains: q, mode: 'insensitive' } } } },
          ].filter(Boolean) as never[],
        },
        take: 5,
        include: { order: { include: { country: { select: { isoAlpha2: true } } } } },
      });
      for (const row of shipments) {
        hits.push({
          entity_type: 'shipment',
          id: row.id,
          label: row.trackingNumber ?? `Shipment ${row.id.slice(0, 8)}`,
          status: row.status,
          country_code: row.order?.country?.isoAlpha2 ?? null,
          href: `/logistics?shipmentId=${row.id}`,
          score: 74,
          meta: { order_number: row.order?.orderNumber ?? null },
        });
      }
    }

    if (perms.has('support:read')) {
      const tickets = await this.prisma.supportTicket.findMany({
        where: {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { id: q.length >= 32 ? q : undefined },
          ].filter(Boolean) as never[],
        },
        take: 5,
      });
      for (const row of tickets) {
        hits.push({
          entity_type: 'support_ticket',
          id: row.id,
          label: row.subject || row.id.slice(0, 8),
          status: row.status,
          country_code: null,
          href: `/support/${row.id}`,
          score: 68,
        });
      }
    }

    if (perms.has('policy:read')) {
      const countries = await this.prisma.country.findMany({
        where: {
          OR: [
            { isoAlpha2: { contains: q, mode: 'insensitive' } },
            { isoAlpha3: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      });
      for (const row of countries) {
        hits.push({
          entity_type: 'country',
          id: row.id,
          label: row.isoAlpha2,
          status: row.status,
          country_code: row.isoAlpha2,
          href: `/countries?country=${row.isoAlpha2}`,
          score: 60,
          meta: { currency: row.defaultCurrency },
        });
      }
    }

    if (perms.has('catalog:read') || perms.has('catalog:admin')) {
      const items = await this.prisma.catalogItem.findMany({
        where: {
          OR: [
            { slug: { contains: q, mode: 'insensitive' } },
            { translations: { some: { title: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        include: { translations: true },
        take: 5,
      });
      for (const row of items) {
        hits.push({
          entity_type: 'product',
          id: row.id,
          label: row.translations[0]?.title ?? row.slug,
          status: row.status,
          country_code: null,
          href: `/catalog?itemId=${row.id}`,
          score: 55,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return { data: hits.slice(0, take), query: q };
  }
}
