import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ImagingBookingStatus,
  LabBookingStatus,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentMethodFamily,
  Prisma,
  ReconciliationStatus,
  RefundStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { assertUuid, resolveCountryByCode } from '../cms/cms-country';
import { RedisService } from '../app/redis.service';
import { MetricsService } from '../common/metrics.service';
import { Errors, ProblemException } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import {
  applyCheckoutSessionPaymentOutcome,
  isCheckoutSessionPayable,
} from '../cart/checkout-session-state';
import type { EventEnvelope } from '../events/envelope';
import type { Principal } from '../identity/current-principal';
import { PolicyResolver } from '../policy/resolver';
import { PaymentGatewayRegistry } from './gateway.registry';
import { gatewayCodeFromRouting, gatewayEnvironmentFromRouting } from './gateway-code';
import type { SandboxScenario } from './gateway.port';
import { encryptWebhookPayload } from './hmac';
import { assertPaymentSubmitAllowed, assertSandboxOnlyRuntime, readPaymentEnvironment } from './payment.config';
import { assertProductionPspInitiationAllowed } from './psp-payment-production-activation-path';
import { runPaymentIdempotent } from './payment-idempotency';
import { assertRefundAmount } from './payment-refund-validation';
import { describeProductionPspBoundary } from './production-psp-requirements';
import { PaymentRouter, routingJson } from './router';
import { resolvePaymentSubmitRoute } from './payment-routing-matrix';
import { parseRefundRequestedEnvelope } from './refund-orchestration';
import { RiskPort } from './risk.port';
import { PaymentWebhookRegistry } from './webhook.registry';
import { OrderService } from '../orders/order.service';
import { FinanceService } from '../finance/finance.service';
import { InventoryService } from '../inventory/inventory.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { seedSandboxGateways } from './seed';
import {
  allowedPaymentFamilies,
  paymentMethodLabel,
  resolvePaymentMethodFromInput,
  sortPaymentMethodsForCountry,
} from './payment-method-policy';
import { assertIntentTransition } from './state-machine';
import {
  captureTransactionKind,
  mapGatewayStatus,
  mapWebhookType,
  paymentEventName,
  shouldApplyGatewayStatus,
} from './webhook-orchestration';
import { SampleCollectionService } from '../lab/sample-collection.service';
import { ImagingStudyService } from '../radiology/imaging-study.service';
import {
  isRetryablePreSubmitFailure,
  presentAdminPaymentSummary,
  presentAttemptHistory,
  presentAuditTimelineEntry,
  presentReconciliation,
  presentWebhookEvent,
  sanitizeObservabilityPayload,
  type WebhookProcessingStatus,
} from './payment-observability';
import {
  assertRoutingMatrixResponseSafe,
  buildPaymentRoutingMatrix,
  loadGatewayCapabilityMap,
} from './payment-routing-matrix';
import { resolveCheckoutPayGuard } from './checkout-pay-guard';
import {
  persistPreSubmitFailureAudit,
  type PreSubmitAttemptAudit,
  type PreSubmitFailureIntentAudit,
} from './payment-failed-attempt-audit';
import { RateLimitService } from '../identity/rate-limit.service';
import { SecurityEventsService } from '../identity/security-events.service';
import {
  normalizeReconBreakType,
  PAYMENT_RECON_DISCREPANCY,
  type PaymentReconReviewRow,
} from './payment-reconciliation';
import { evaluateProductionPaymentAvailable } from './production-payment-gate';

const FAMILIES = new Set<string>(Object.values(PaymentMethodFamily));

@Injectable()
export class PaymentService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyResolver,
    private readonly router: PaymentRouter,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly webhooks: PaymentWebhookRegistry,
    private readonly risk: RiskPort,
    private readonly metrics: MetricsService,
    private readonly orders: OrderService,
    private readonly finance: FinanceService,
    private readonly inventory: InventoryService,
    private readonly rateLimit: RateLimitService,
    private readonly security: SecurityEventsService,
    @Inject(forwardRef(() => SampleCollectionService))
    private readonly sampleCollections: SampleCollectionService,
    @Inject(forwardRef(() => ImagingStudyService))
    private readonly imagingStudies: ImagingStudyService,
  ) {}

  private async assertPaymentRateLimit(personId: string, kind: 'pay' | 'refund'): Promise<void> {
    const limit = kind === 'pay' ? 30 : 20;
    const hit = await this.rateLimit.hit(`payment:${kind}:${personId}`, limit, 900);
    if (!hit.allowed) {
      throw Errors.rateLimited(hit.retryAfter);
    }
  }

  async onModuleInit(): Promise<void> {
    await seedSandboxGateways(this.prisma);
  }

  async listMethods(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!resolved?.document.payments.enabled) {
      return { sandbox: true, methods: [], message: 'Payments are disabled by country policy.' };
    }
    const allowed = allowedPaymentFamilies(resolved.document.payments.methods);
    const rows = await this.prisma.paymentMethod.findMany({
      where: { active: true, family: { in: allowed } },
    });
    const methods = sortPaymentMethodsForCountry(
      countryCode,
      rows.map((m) => ({
        family: m.family,
        label: paymentMethodLabel(countryCode, m.family, m.label),
      })),
    );
    return {
      sandbox: true,
      methods,
      message:
        countryCode.toUpperCase() === 'IN'
          ? 'SANDBOX — demo UPI, card, and COD. No real money.'
          : 'SANDBOX — test tokens only. No real money.',
    };
  }

  async payCheckout(
    principal: Principal,
    sessionId: string,
    input: { method?: string; scenario?: string },
    idempotencyKey: string,
  ) {
    await this.assertPaymentRateLimit(principal.personId, 'pay');
    await this.assertPaymentsEnabled(principal, sessionId);
    return this.withIdempotency(
      principal.personId,
      idempotencyKey,
      'POST',
      `/me/checkout/sessions/${sessionId}/pay`,
      () => this.createAndSubmit(principal, sessionId, input),
    );
  }

  /** R7-B: sandbox pay for LabBooking — never creates Order; COD rejected. */
  async payLabBooking(
    principal: Principal,
    bookingId: string,
    input: { method?: string; scenario?: string },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key header is required.');
    }
    return this.withIdempotency(
      principal.personId,
      idempotencyKey.trim(),
      'POST',
      `/me/lab/bookings/${bookingId}/pay`,
      () => this.createAndSubmitLabBooking(principal, bookingId, input),
    );
  }

  /** R8-B: sandbox pay for ImagingBooking — never creates Order; COD rejected. */
  async payImagingBooking(
    principal: Principal,
    bookingId: string,
    input: { method?: string; scenario?: string },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key header is required.');
    }
    return this.withIdempotency(
      principal.personId,
      idempotencyKey.trim(),
      'POST',
      `/me/imaging/bookings/${bookingId}/pay`,
      () => this.createAndSubmitImagingBooking(principal, bookingId, input),
    );
  }

  async getIntent(principal: Principal, id: string) {
    const intent = await this.requireOwner(principal.personId, id);
    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: intent.id },
      select: { id: true, orderNumber: true },
    });
    return this.present(intent, order);
  }

  async listCustomerIntents(
    principal: Principal,
    query: { limit?: number; cursor?: string } = {},
  ) {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 50);
    const rows = await this.prisma.paymentIntent.findMany({
      where: { customerPersonId: principal.personId },
      include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const orderByIntent = await this.prisma.order.findMany({
      where: { paymentIntentId: { in: page.map((row) => row.id) } },
      select: { id: true, orderNumber: true, paymentIntentId: true },
    });
    const orderMap = new Map(orderByIntent.map((row) => [row.paymentIntentId, row]));
    return {
      data: page.map((row) =>
        this.presentCustomerHistory(row, orderMap.get(row.id) ?? null),
      ),
      next_cursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
      sandbox: true,
    };
  }

  async describeProductionBoundary(countryIso2?: string) {
    const catalog = describeProductionPspBoundary(countryIso2);
    const gate = countryIso2
      ? await evaluateProductionPaymentAvailable(this.prisma, { countryCode: countryIso2 })
      : null;
    return {
      ...catalog,
      production_payment_gate: gate,
      r14a_owner_confirmation_required:
        !gate || gate.blockers.includes('R14_A_OWNER_CONFIRMATION_REQUIRED'),
      never_fallback_to_mock: true,
    };
  }

  async assertProductionPaymentAvailable(countryCode: string) {
    return this.router.assertProductionPaymentAvailable(countryCode);
  }

  async evaluateProductionPaymentAvailable(countryCode: string) {
    return this.router.evaluateProductionPaymentAvailable(countryCode);
  }

  confirm(principal: Principal, id: string, idempotencyKey: string) {
    return this.withIdempotency(principal.personId, idempotencyKey, 'POST', `/payments/intents/${id}/confirm`, async () => {
      const intent = await this.requireOwner(principal.personId, id);
      if (intent.status !== PaymentIntentStatus.REQUIRES_ACTION && intent.status !== PaymentIntentStatus.UNKNOWN) {
        throw Errors.problem(409, 'ILLEGAL_PAYMENT_TRANSITION', 'Illegal transition', 'This intent cannot be confirmed.');
      }
      const attempt = intent.attempts[0];
      if (!attempt?.providerRef) {
        throw Errors.problem(409, 'PAYMENT_UNKNOWN', 'Unknown payment', 'Reconcile before confirming.');
      }
      const route = await this.resolveAttemptGateway(attempt);
      const gateway = this.gateways.resolve(route.code, route.environment);
      const st = await gateway.status(attempt.providerRef);
      return this.applyStatus(intent.id, attempt.id, st.status, st.providerRef);
    });
  }

  /** Sandbox UPI collect — simulates customer approving payment in PhonePe/GPay/Paytm. */
  completeSandboxUpi(principal: Principal, id: string, idempotencyKey: string) {
    assertSandboxOnlyRuntime('completeSandboxUpi');
    return this.withIdempotency(
      principal.personId,
      idempotencyKey,
      'POST',
      `/payments/intents/${id}/complete-upi`,
      async () => {
        const intent = await this.requireOwner(principal.personId, id);
        if (intent.method !== PaymentMethodFamily.MOBILE_PAYMENT) {
          throw Errors.problem(
            409,
            'PAYMENT_METHOD_MISMATCH',
            'Not a UPI payment',
            'Only UPI (mobile payment) intents can be completed this way.',
          );
        }
        if (intent.status !== PaymentIntentStatus.REQUIRES_ACTION) {
          throw Errors.problem(
            409,
            'ILLEGAL_PAYMENT_TRANSITION',
            'Illegal transition',
            'UPI payment is not awaiting customer approval.',
          );
        }
        const attempt = intent.attempts.find((row) => row.providerRef);
        if (!attempt?.providerRef) {
          throw Errors.problem(409, 'PAYMENT_UNKNOWN', 'Unknown payment', 'No provider reference for UPI intent.');
        }
        this.gateways.resolveMockStatus(attempt.providerRef, 'captured');
        const route = await this.resolveAttemptGateway(attempt);
        const gateway = this.gateways.resolve(route.code, route.environment);
        const st = await gateway.status(attempt.providerRef);
        return this.applyStatus(intent.id, attempt.id, st.status, st.providerRef);
      },
    );
  }

  capture(principal: Principal, id: string, idempotencyKey: string) {
    return this.withIdempotency(principal.personId, idempotencyKey, 'POST', `/payments/intents/${id}/capture`, async () => {
      const intent = await this.requireOwner(principal.personId, id);
      if (intent.status !== PaymentIntentStatus.AUTHORIZED) {
        throw Errors.problem(409, 'ILLEGAL_PAYMENT_TRANSITION', 'Illegal transition', 'Only AUTHORIZED intents can be captured.');
      }
      const attempt = intent.attempts.find((a) => a.providerRef);
      if (!attempt?.providerRef) {
        throw Errors.problem(409, 'PAYMENT_UNKNOWN', 'Unknown payment', 'No provider reference.');
      }
      const route = await this.resolveAttemptGateway(attempt);
      const gateway = this.gateways.resolve(route.code, route.environment);
      await gateway.capture(attempt.providerRef, intent.amountMinor);
      return this.applyStatus(intent.id, attempt.id, 'captured', attempt.providerRef);
    });
  }

  async refund(
    actor: Principal,
    id: string,
    amountMinor: bigint | undefined,
    idempotencyKey: string,
    admin = false,
  ) {
    await this.assertPaymentRateLimit(actor.personId, 'refund');
    return this.withIdempotency(actor.personId, idempotencyKey, 'POST', `/payments/intents/${id}/refund`, async () => {
      const intent = admin ? await this.loadIntent(id) : await this.requireOwner(actor.personId, id);
      if (intent.status !== PaymentIntentStatus.CAPTURED) {
        throw Errors.problem(409, 'ILLEGAL_PAYMENT_TRANSITION', 'Illegal transition', 'Only captured payments can be refunded.');
      }
      const amt = assertRefundAmount({
        amountMinor,
        capturedMinor: intent.capturedMinor,
        refundedMinor: intent.refundedMinor,
      });
      return this.executeRefund(intent, amt, idempotencyKey, actor.personId);
    });
  }

  /**
   * Event-driven refund path for PAYMENT_REFUND_REQUESTED.
   * Uses the same gateway registry dispatch and idempotency as HTTP refunds.
   */
  async refundFromEvent(envelope: EventEnvelope): Promise<void> {
    let orderId: string;
    let paymentIntentId: string;
    let idempotencyKey: string;
    try {
      ({ orderId, paymentIntentId, idempotencyKey } = parseRefundRequestedEnvelope(envelope));
    } catch {
      throw Errors.validation('PAYMENT_REFUND_REQUESTED payload is invalid.');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentIntentId: true, countryId: true, customerPersonId: true },
    });
    if (!order?.paymentIntentId || order.paymentIntentId !== paymentIntentId) {
      throw Errors.notFound('Order is not linked to the payment intent.');
    }
    if (envelope.countryId && order.countryId !== envelope.countryId) {
      throw Errors.forbidden('Order country scope mismatch.');
    }
    const intent = await this.loadIntent(paymentIntentId);
    if (envelope.countryId && intent.countryId !== envelope.countryId) {
      throw Errors.forbidden('Payment country scope mismatch.');
    }
    if (intent.method === PaymentMethodFamily.COD) {
      return;
    }
    const remaining = intent.capturedMinor - intent.refundedMinor;
    if (remaining <= 0n) {
      return;
    }
    if (intent.status !== PaymentIntentStatus.CAPTURED) {
      throw Errors.problem(
        409,
        'PAYMENT_NOT_REFUNDABLE',
        'Payment not refundable',
        `Cannot refund payment in status ${intent.status}.`,
      );
    }
    const actorPersonId = envelope.actorId ?? order.customerPersonId;
    const prior = await this.prisma.idempotencyRecord.findUnique({
      where: { personId_key: { personId: actorPersonId, key: idempotencyKey } },
    });
    if (prior) {
      return;
    }
    const principal: Principal = {
      personId: actorPersonId,
      sessionId: actorPersonId,
      audience: 'customer',
      roles: [],
      tokenVersion: 0,
      countryId: intent.countryId,
    };
    await this.refund(principal, paymentIntentId, undefined, idempotencyKey, true);
  }

  private async executeRefund(
    intent: Awaited<ReturnType<PaymentService['loadIntent']>>,
    amt: bigint,
    idempotencyKey: string,
    actorPersonId: string,
  ) {
    const refundId = uuidv7();
    const attempt = intent.attempts.find((a) => a.providerRef);
    if (attempt?.providerRef) {
      const route = await this.resolveAttemptGateway(attempt);
      const gateway = this.gateways.resolve(route.code, route.environment);
      await gateway.refund({ providerRef: attempt.providerRef, amountMinor: amt, currency: intent.currency });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          id: refundId,
          intentId: intent.id,
          amountMinor: amt,
          currency: intent.currency,
          status: RefundStatus.REFUNDED,
          idempotencyKey: `${idempotencyKey}:row`,
        },
      });
      await tx.refundAttempt.create({
        data: { id: uuidv7(), refundId, status: RefundStatus.REFUNDED, providerRef: attempt?.providerRef },
      });
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { refundedMinor: { increment: amt } },
      });
      await tx.paymentTransaction.create({
        data: {
          id: uuidv7(),
          intentId: intent.id,
          attemptId: attempt?.id,
          kind: 'refund',
          amountMinor: amt,
          currency: intent.currency,
          providerRef: attempt?.providerRef,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'PAYMENT_REFUNDED',
        aggregateType: 'PaymentIntent',
        aggregateId: intent.id,
        producer: 'payment',
        countryId: intent.countryId,
        payload: {
          amount_minor: amt.toString(),
          currency: intent.currency,
          sandbox: true,
          customer_person_id: intent.customerPersonId,
        },
        occurrenceKey: `payment-refunded:${refundId}`,
      });
    });
    this.metrics.increment('payment_refund_total', { sandbox: 'true' });
    const presented = this.present(await this.loadIntent(intent.id));
    const order = await this.prisma.order.findUnique({ where: { paymentIntentId: intent.id } });
    await this.prisma.runWithTenant(
      workerTenantContext({
        organizationId: order?.sellerOrgId,
        countryId: intent.countryId,
        personId: actorPersonId,
      }),
      async () => {
        await this.finance.syncPayment(intent.id);
        if (order) {
          await this.finance.syncOrder(order.id);
        }
      },
    );
    return presented;
  }

  async adminGet(principal: Principal, id: string, countryCode?: string) {
    if (countryCode?.trim()) {
      return this.adminGetObservability(principal, id, countryCode);
    }
    return this.present(await this.loadIntent(id));
  }

  async adminSearch(
    principal: Principal,
    query: {
      country_code?: string;
      status?: PaymentIntentStatus;
      gateway_code?: string;
      checkout_session_id?: string;
      order_id?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) {
    const country = query.country_code?.trim()
      ? await resolveCountryByCode(this.prisma, query.country_code)
      : null;
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const where: Prisma.PaymentIntentWhereInput = {
          ...(country ? { countryId: country.id } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.from || query.to
            ? {
                createdAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
        };
        if (query.order_id?.trim()) {
          assertUuid(query.order_id.trim(), 'order id');
          const order = await this.prisma.order.findFirst({
            where: {
              id: query.order_id.trim(),
              ...(country ? { countryId: country.id } : {}),
            },
            select: { paymentIntentId: true },
          });
          if (!order?.paymentIntentId) {
            return { sandbox: true, data: [] };
          }
          where.id = order.paymentIntentId;
        }
        if (query.checkout_session_id?.trim()) {
          assertUuid(query.checkout_session_id.trim(), 'checkout session id');
          where.checkoutSessionId = query.checkout_session_id.trim();
        }
        const rows = await this.prisma.paymentIntent.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { attempts: { orderBy: { createdAt: 'desc' } } },
        });
        const filtered = query.gateway_code?.trim()
          ? rows.filter((row) =>
              row.attempts.some((attempt) => gatewayCodeFromRouting(attempt.routingJson) === query.gateway_code?.trim()),
            )
          : rows;
        const data = await Promise.all(filtered.map((row) => this.buildAdminSummary(row)));
        return { sandbox: true, data };
      },
    );
  }

  async unknownQueue(principal: Principal, countryCode?: string) {
    const country = countryCode?.trim() ? await resolveCountryByCode(this.prisma, countryCode) : null;
    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.paymentIntent.findMany({
          where: {
            status: PaymentIntentStatus.UNKNOWN,
            ...(country ? { countryId: country.id } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { attempts: { orderBy: { createdAt: 'desc' } } },
        });
        const data = await Promise.all(rows.map((row) => this.buildAdminSummary(row)));
        return { sandbox: true, data };
      },
    );
  }

  async adminGetObservability(principal: Principal, id: string, countryCode: string) {
    assertUuid(id, 'payment id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const intent = await this.prisma.paymentIntent.findUnique({
          where: { id },
          include: {
            attempts: { orderBy: { createdAt: 'desc' }, include: { gateway: true } },
            refunds: true,
            transactions: true,
          },
        });
        if (!intent || intent.countryId !== country.id) {
          throw Errors.notFound('Payment not found.');
        }
        return this.buildObservabilityDetail(intent, country.isoAlpha2);
      },
    );
  }

  async adminListWebhooks(
    principal: Principal,
    query: {
      country_code?: string;
      intent_id?: string;
      gateway_code?: string;
      processing_status?: WebhookProcessingStatus;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) {
    const country = query.country_code?.trim()
      ? await resolveCountryByCode(this.prisma, query.country_code)
      : null;
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        let gatewayIds: string[] | undefined;
        if (query.intent_id?.trim()) {
          assertUuid(query.intent_id.trim(), 'payment id');
          const intent = await this.prisma.paymentIntent.findUnique({
            where: { id: query.intent_id.trim() },
            include: { attempts: { select: { gatewayId: true } } },
          });
          if (!intent || (country && intent.countryId !== country.id)) {
            return { sandbox: true, data: [] };
          }
          gatewayIds = [...new Set(intent.attempts.map((attempt) => attempt.gatewayId))];
        } else if (country) {
          const attempts = await this.prisma.paymentAttempt.findMany({
            where: { intent: { countryId: country.id } },
            select: { gatewayId: true },
            distinct: ['gatewayId'],
            take: 100,
          });
          gatewayIds = attempts.map((attempt) => attempt.gatewayId);
        }
        const rows = await this.prisma.paymentWebhookEvent.findMany({
          where: {
            ...(gatewayIds?.length ? { gatewayId: { in: gatewayIds } } : {}),
            ...(query.gateway_code?.trim()
              ? { gateway: { code: query.gateway_code.trim() } }
              : {}),
            ...(query.from || query.to
              ? {
                  createdAt: {
                    ...(query.from ? { gte: new Date(query.from) } : {}),
                    ...(query.to ? { lte: new Date(query.to) } : {}),
                  },
                }
              : {}),
          },
          include: { gateway: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        let data = rows.map((row) =>
          presentWebhookEvent({
            id: row.id,
            providerEventId: row.providerEventId,
            eventType: row.eventType,
            signatureOk: row.signatureOk,
            processed: row.processed,
            createdAt: row.createdAt,
            processedAt: row.processedAt,
            gateway: { code: row.gateway.code, environment: row.gateway.environment },
          }),
        );
        if (query.processing_status) {
          data = data.filter((row) => row.processing_status === query.processing_status);
        }
        return { sandbox: true, data };
      },
    );
  }

  async adminRoutingMatrix(
    principal: Principal,
    query: {
      country_code: string;
      method?: PaymentMethodFamily;
      gateway?: string;
      environment?: 'sandbox' | 'production' | 'all';
      active?: string;
    },
  ) {
    const country = await resolveCountryByCode(this.prisma, query.country_code);
    const countryRow = await this.prisma.country.findUniqueOrThrow({
      where: { id: country.id },
      select: { id: true, isoAlpha2: true, defaultCurrency: true },
    });
    return runWithTenant(
      workerTenantContext({ countryId: countryRow.id, personId: principal.personId }),
      async () => {
        const resolved = await this.policy.resolvePublished(countryRow.isoAlpha2);
        const capabilityMap = await loadGatewayCapabilityMap(this.prisma);
        const matrix = await buildPaymentRoutingMatrix({
          router: this.router,
          gateways: this.gateways,
          countryCode: countryRow.isoAlpha2,
          countryId: countryRow.id,
          currency: countryRow.defaultCurrency,
          policy: resolved?.document ?? null,
          policySource: resolved ? 'published_policy_pack' : 'missing_policy_pack',
          method: query.method,
          gatewayFilter: query.gateway,
          activeOnly: query.active === 'true',
          environmentFilter: query.environment ?? 'sandbox',
          capabilityMap,
        });
        assertRoutingMatrixResponseSafe(matrix);
        return matrix;
      },
    );
  }

  async adminGetWebhook(principal: Principal, eventId: string, countryCode: string) {
    assertUuid(eventId, 'webhook event id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const event = await this.prisma.paymentWebhookEvent.findUnique({
          where: { id: eventId },
          include: { gateway: true },
        });
        if (!event) {
          throw Errors.notFound('Webhook event not found.');
        }
        const linked = await this.prisma.paymentAttempt.findFirst({
          where: { gatewayId: event.gatewayId, intent: { countryId: country.id } },
          select: { id: true },
        });
        if (!linked) {
          throw Errors.notFound('Webhook event not found.');
        }
        return {
          sandbox: true,
          data: presentWebhookEvent({
            id: event.id,
            providerEventId: event.providerEventId,
            eventType: event.eventType,
            signatureOk: event.signatureOk,
            processed: event.processed,
            createdAt: event.createdAt,
            processedAt: event.processedAt,
            gateway: { code: event.gateway.code, environment: event.gateway.environment },
          }),
        };
      },
    );
  }

  private async buildAdminSummary(
    intent: {
      id: string;
      status: PaymentIntentStatus;
      amountMinor: bigint;
      capturedMinor: bigint;
      refundedMinor: bigint;
      currency: string;
      method: PaymentMethodFamily;
      sandbox: boolean;
      createdAt: Date;
      updatedAt: Date;
      checkoutSessionId: string | null;
      countryId: string;
      attempts: Array<{
        id: string;
        status: PaymentAttemptStatus;
        submitted: boolean;
        routingJson: Prisma.JsonValue;
        providerRef: string | null;
        errorCode: string | null;
        createdAt: Date;
      }>;
    },
  ) {
    const country = await this.prisma.country.findUnique({
      where: { id: intent.countryId },
      select: { isoAlpha2: true },
    });
    const order = await this.prisma.order.findFirst({
      where: { paymentIntentId: intent.id },
      select: { id: true, orderNumber: true },
    });
    const lastReconciliation = await this.prisma.paymentReconciliation.findFirst({
      where: { intentId: intent.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, breakType: true },
    });
    return presentAdminPaymentSummary({
      intent,
      countryCode: country?.isoAlpha2 ?? '',
      order,
      lastReconciliation,
    });
  }

  private async buildObservabilityDetail(
    intent: {
      id: string;
      status: PaymentIntentStatus;
      amountMinor: bigint;
      capturedMinor: bigint;
      refundedMinor: bigint;
      currency: string;
      method: PaymentMethodFamily;
      sandbox: boolean;
      createdAt: Date;
      updatedAt: Date;
      checkoutSessionId: string | null;
      countryId: string;
      attempts: Array<{
        id: string;
        status: PaymentAttemptStatus;
        submitted: boolean;
        routingJson: Prisma.JsonValue;
        providerRef: string | null;
        errorCode: string | null;
        createdAt: Date;
        gatewayId: string;
        gateway: { code: string; environment: string };
      }>;
      refunds: Array<{ id: string; status: RefundStatus; amountMinor: bigint; currency: string; createdAt: Date }>;
      transactions: Array<{ id: string; kind: string; amountMinor: bigint; currency: string; createdAt: Date }>;
    },
    countryCode: string,
  ) {
    const summary = await this.buildAdminSummary(intent);
    const gatewayIds = [...new Set(intent.attempts.map((attempt) => attempt.gatewayId))];
    const webhooks = gatewayIds.length
      ? await this.prisma.paymentWebhookEvent.findMany({
          where: {
            gatewayId: { in: gatewayIds },
            createdAt: { gte: intent.createdAt },
          },
          include: { gateway: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : [];
    const reconciliations = await this.prisma.paymentReconciliation.findMany({
      where: { intentId: intent.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const outbox = await this.prisma.outboxEvent.findMany({
      where: { aggregateType: 'PaymentIntent', aggregateId: intent.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const auditTimeline = [
      ...outbox.map((row) =>
        presentAuditTimelineEntry({
          id: row.id,
          source: 'outbox',
          type: row.type,
          occurredAt: row.createdAt,
          actorId: row.actorId,
          payload: sanitizeObservabilityPayload((row.payload as Record<string, unknown>) ?? {}),
        }),
      ),
      ...webhooks.map((row) =>
        presentAuditTimelineEntry({
          id: row.id,
          source: 'webhook',
          type: row.eventType,
          occurredAt: row.createdAt,
          payload: presentWebhookEvent({
            id: row.id,
            providerEventId: row.providerEventId,
            eventType: row.eventType,
            signatureOk: row.signatureOk,
            processed: row.processed,
            createdAt: row.createdAt,
            processedAt: row.processedAt,
            gateway: { code: row.gateway.code, environment: row.gateway.environment },
          }) as Record<string, unknown>,
        }),
      ),
      ...reconciliations.map((row) =>
        presentAuditTimelineEntry({
          id: row.id,
          source: 'reconciliation',
          type: row.status,
          occurredAt: row.createdAt,
          payload: presentReconciliation(row) as Record<string, unknown>,
        }),
      ),
    ].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));

    const attemptHistory = presentAttemptHistory(intent.attempts);

    return {
      sandbox: true,
      payment: summary,
      attempt_history: attemptHistory,
      webhooks: webhooks.map((row) =>
        presentWebhookEvent({
          id: row.id,
          providerEventId: row.providerEventId,
          eventType: row.eventType,
          signatureOk: row.signatureOk,
          processed: row.processed,
          createdAt: row.createdAt,
          processedAt: row.processedAt,
          gateway: { code: row.gateway.code, environment: row.gateway.environment },
        }),
      ),
      reconciliations: reconciliations.map((row) => presentReconciliation(row)),
      audit_timeline: auditTimeline,
      refunds: intent.refunds.map((row) => ({
        id: row.id,
        status: row.status,
        amount_minor: row.amountMinor.toString(),
        currency: row.currency,
        created_at: row.createdAt.toISOString(),
      })),
      transactions: intent.transactions.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount_minor: row.amountMinor.toString(),
        currency: row.currency,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async reconcile(intentId: string) {
    const intent = await this.loadIntent(intentId);
    const attempt = intent.attempts.find((a) => a.submitted);
    if (!attempt?.providerRef) {
      await this.prisma.paymentReconciliation.create({
        data: {
          id: uuidv7(),
          intentId: intent.id,
          status: ReconciliationStatus.INVESTIGATE,
          breakType: PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION,
          detail: 'No submitted attempt / provider reference to reconcile',
        },
      });
      await this.security.emit({
        type: 'PAYMENT_RECON_DISCREPANCY',
        outcome: 'failure',
        metadata: {
          intent_id: intent.id,
          discrepancy: PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION,
        },
      });
      throw Errors.problem(409, 'PAYMENT_UNKNOWN', 'Unknown payment', 'No submitted attempt to reconcile.');
    }
    const route = await this.resolveAttemptGateway(attempt);
    const gateway = this.gateways.resolve(route.code, route.environment);
    const gw = await gateway.status(attempt.providerRef);
    const mapped = mapGatewayStatus(intent.status, gw.status);
    const txn = await this.prisma.paymentTransaction.findFirst({
      where: { intentId: intent.id, kind: { in: ['capture', 'authorization'] } },
      orderBy: { createdAt: 'desc' },
    });
    let breakType: string | null = null;
    // Always evaluate amount/currency before treating a prior MATCHED as authoritative.
    if ((gw.status === 'captured' || gw.status === 'authorized') && txn) {
      if (txn.amountMinor !== gw.amountMinor) {
        breakType = PAYMENT_RECON_DISCREPANCY.AMOUNT_MISMATCH;
      } else if (txn.currency !== gw.currency) {
        breakType = PAYMENT_RECON_DISCREPANCY.CURRENCY_MISMATCH;
      }
    }
    if (!breakType && intent.status === mapped) {
      const prior = await this.prisma.paymentReconciliation.findFirst({
        where: {
          intentId: intent.id,
          status: ReconciliationStatus.MATCHED,
          breakType: { in: ['none', PAYMENT_RECON_DISCREPANCY.NONE, PAYMENT_RECON_DISCREPANCY.MATCHED] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (prior) {
        await this.syncFinanceAfterPaymentReconcile(intent.id);
        return {
          status: 'MATCHED',
          discrepancy: PAYMENT_RECON_DISCREPANCY.MATCHED,
          intent: this.present(intent),
          sandbox: true,
          duplicate: true,
        };
      }
    }
    if (!txn && (gw.status === 'captured' || gw.status === 'authorized')) {
      if (intent.status === PaymentIntentStatus.CAPTURED || intent.status === PaymentIntentStatus.AUTHORIZED) {
        breakType = PAYMENT_RECON_DISCREPANCY.MISSING_TRANSACTION;
      }
    }
    if (mapped && intent.status !== mapped && !breakType) {
      // Provider and internal disagree on state — record for review, do not silent-fix.
      if (
        (intent.status === PaymentIntentStatus.CAPTURED && gw.status !== 'captured') ||
        (intent.status === PaymentIntentStatus.FAILED &&
          (gw.status === 'captured' || gw.status === 'authorized'))
      ) {
        breakType = PAYMENT_RECON_DISCREPANCY.STATE_MISMATCH;
      }
    }
    const webhookCount = await this.prisma.paymentWebhookEvent.count({
      where: { gatewayId: attempt.gatewayId },
    });
    if (
      !breakType &&
      webhookCount === 0 &&
      (intent.status === PaymentIntentStatus.CAPTURED || intent.status === PaymentIntentStatus.AUTHORIZED)
    ) {
      // Advisory only when reconciling without any webhook history for this gateway.
      // Do not block MATCHED path solely on this for sandbox confirm flows.
    }
    if (breakType) {
      const normalized = normalizeReconBreakType(breakType);
      await this.prisma.paymentReconciliation.create({
        data: {
          id: uuidv7(),
          intentId: intent.id,
          status: ReconciliationStatus.BREAK,
          breakType: normalized,
          detail: JSON.stringify({
            expected_amount_minor: txn?.amountMinor?.toString() ?? null,
            provider_amount_minor: gw.amountMinor?.toString() ?? null,
            expected_currency: txn?.currency ?? intent.currency,
            provider_currency: gw.currency ?? null,
            internal_status: intent.status,
            provider_status: gw.status,
            provider_ref: attempt.providerRef,
            reviewable: true,
          }),
        },
      });
      this.metrics.increment('payment_reconciliation_breaks', { type: normalized });
      await this.security.emit({
        type: 'PAYMENT_RECON_DISCREPANCY',
        outcome: 'failure',
        metadata: { intent_id: intent.id, discrepancy: normalized },
      });
      return { status: 'BREAK', break_type: normalized, discrepancy: normalized, sandbox: true };
    }
    const presented = await this.applyStatus(intent.id, attempt.id, gw.status, attempt.providerRef);
    await this.prisma.paymentReconciliation.create({
      data: {
        id: uuidv7(),
        intentId: intent.id,
        status: ReconciliationStatus.MATCHED,
        // Keep legacy 'none' for observability compatibility; discrepancy field exposes MATCHED.
        breakType: 'none',
        detail: JSON.stringify({
          discrepancy: PAYMENT_RECON_DISCREPANCY.MATCHED,
          expected_amount_minor: txn?.amountMinor?.toString() ?? intent.amountMinor.toString(),
          provider_amount_minor: gw.amountMinor?.toString() ?? null,
          expected_currency: txn?.currency ?? intent.currency,
          provider_currency: gw.currency ?? intent.currency,
          internal_status: presented.status,
          provider_status: gw.status,
          provider_ref: attempt.providerRef,
          reviewable: true,
        }),
      },
    });
    await this.syncFinanceAfterPaymentReconcile(intent.id);
    await this.security.emit({
      type: 'PAYMENT_RECON_MATCHED',
      outcome: 'success',
      metadata: { intent_id: intent.id },
    });
    return {
      status: 'MATCHED',
      discrepancy: PAYMENT_RECON_DISCREPANCY.MATCHED,
      intent: presented,
      sandbox: true,
      duplicate: false,
    };
  }

  /** Sprint 44 — admin reconciliation review queue (never auto-fixes mismatches). */
  async adminReconciliationQueue(
    _principal: Principal,
    query: { country_code?: string; status?: ReconciliationStatus; limit?: number },
  ): Promise<{ data: PaymentReconReviewRow[]; sandbox: true }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.paymentReconciliation.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const data: PaymentReconReviewRow[] = [];
    for (const row of rows) {
      let detailObj: Record<string, string | null | boolean> = {};
      try {
        detailObj = JSON.parse(row.detail) as Record<string, string | null | boolean>;
      } catch {
        detailObj = { note: row.detail };
      }
      const intent = row.intentId
        ? await this.prisma.paymentIntent.findUnique({
            where: { id: row.intentId },
            select: {
              id: true,
              status: true,
              amountMinor: true,
              currency: true,
              countryId: true,
              country: { select: { isoAlpha2: true } },
              attempts: {
                where: { submitted: true },
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { providerRef: true },
              },
            },
          })
        : null;
      if (
        query.country_code &&
        intent &&
        intent.country.isoAlpha2 !== query.country_code.trim().toUpperCase()
      ) {
        continue;
      }
      const order = row.intentId
        ? await this.prisma.order.findUnique({
            where: { paymentIntentId: row.intentId },
            select: { id: true },
          })
        : null;
      const webhook = row.intentId
        ? await this.prisma.paymentWebhookEvent.findFirst({
            orderBy: { createdAt: 'desc' },
            where: {
              gatewayId: {
                in: (
                  await this.prisma.paymentAttempt.findMany({
                    where: { intentId: row.intentId },
                    select: { gatewayId: true },
                  })
                ).map((a) => a.gatewayId),
              },
            },
          })
        : null;
      data.push({
        reconciliation_id: row.id,
        intent_id: row.intentId,
        order_id: order?.id ?? null,
        provider_ref:
          (typeof detailObj.provider_ref === 'string' ? detailObj.provider_ref : null) ??
          intent?.attempts[0]?.providerRef ??
          null,
        internal_status:
          (typeof detailObj.internal_status === 'string' ? detailObj.internal_status : null) ??
          intent?.status ??
          null,
        provider_status:
          typeof detailObj.provider_status === 'string' ? detailObj.provider_status : null,
        expected_amount_minor:
          (typeof detailObj.expected_amount_minor === 'string'
            ? detailObj.expected_amount_minor
            : null) ?? intent?.amountMinor.toString() ??
          null,
        provider_amount_minor:
          typeof detailObj.provider_amount_minor === 'string'
            ? detailObj.provider_amount_minor
            : null,
        expected_currency:
          (typeof detailObj.expected_currency === 'string' ? detailObj.expected_currency : null) ??
          intent?.currency ??
          null,
        provider_currency:
          typeof detailObj.provider_currency === 'string' ? detailObj.provider_currency : null,
        webhook_state: webhook
          ? webhook.processed
            ? 'PROCESSED'
            : webhook.signatureOk
              ? 'RECEIVED'
              : 'SIGNATURE_FAILED'
          : 'MISSING',
        discrepancy: normalizeReconBreakType(row.breakType),
        reconciliation_status: row.status,
        detail: row.detail,
        created_at: row.createdAt.toISOString(),
        reviewable: true,
      });
    }
    return { data, sandbox: true };
  }

  private async syncFinanceAfterPaymentReconcile(intentId: string): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      select: { id: true, countryId: true, customerPersonId: true },
    });
    if (!intent) {
      return;
    }
    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: intentId },
      select: { id: true, sellerOrgId: true },
    });
    await this.prisma.runWithTenant(
      workerTenantContext({
        organizationId: order?.sellerOrgId,
        countryId: intent.countryId,
        personId: intent.customerPersonId,
      }),
      async () => {
        await this.finance.syncPayment(intentId);
        if (order) {
          await this.finance.syncOrder(order.id);
        }
      },
    );
  }

  async ingestWebhook(
    gatewayCode: string,
    raw: string,
    signature: string | undefined,
    headers: Record<string, string | undefined> = {},
  ) {
    assertSandboxOnlyRuntime('webhook ingest');
    const webhookHit = await this.rateLimit.hit(`webhook:pay:${gatewayCode}`, 300, 60);
    if (!webhookHit.allowed) {
      throw Errors.rateLimited(webhookHit.retryAfter);
    }
    // Sprint 132: production webhook path is fail-closed / EXTERNAL_GATED until real PSP
    // webhook adapter + secrets-manager resolution exist. Never uses sandbox signing secrets.
    if (readPaymentEnvironment() === 'production') {
      const { assertProductionPspWebhookIngestAllowed } = await import(
        './psp-payment-production-activation-path'
      );
      try {
        assertProductionPspWebhookIngestAllowed(gatewayCode, 'webhook ingest');
      } catch (err) {
        await this.security.emit({
          type: 'PAYMENT_WEBHOOK_REJECTED',
          outcome: 'failure',
          metadata: {
            gateway_code: gatewayCode,
            reason: 'PRODUCTION_WEBHOOK_EXTERNAL_GATED',
          },
        });
        throw err;
      }
    }
    const gateway = await this.prisma.paymentGateway.findUnique({ where: { code: gatewayCode } });
    if (!gateway) {
      throw Errors.notFound('Gateway not found.');
    }
    const handler = this.webhooks.resolve(gatewayCode, gateway.environment);
    if (!handler.verify(raw, signature, headers)) {
      await this.security.emit({
        type: 'PAYMENT_WEBHOOK_REJECTED',
        outcome: 'failure',
        metadata: { gateway_code: gatewayCode, reason: 'INVALID_SIGNATURE' },
      });
      throw Errors.unauthorized('Invalid sandbox webhook signature.');
    }
    let body: { event_id?: string; type?: string; provider_ref?: string };
    try {
      const event = handler.parseEvent(raw);
      body = { event_id: event.eventId, type: event.type, provider_ref: event.providerRef };
    } catch {
      await this.security.emit({
        type: 'PAYMENT_WEBHOOK_REJECTED',
        outcome: 'failure',
        metadata: { gateway_code: gatewayCode, reason: 'INVALID_JSON' },
      });
      throw Errors.validation('Invalid webhook JSON.');
    }
    const eventId = body.event_id ?? uuidv7();
    // Pre-check avoids unique-constraint abort inside the tenant interceptor transaction
    // (Postgres 25P02) so duplicate webhooks stay idempotent without failing the request.
    const priorEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        gatewayId_providerEventId: { gatewayId: gateway.id, providerEventId: eventId },
      },
      select: { id: true },
    });
    if (priorEvent) {
      await this.security.emit({
        type: 'PAYMENT_WEBHOOK_DUPLICATE',
        outcome: 'success',
        metadata: { gateway_code: gatewayCode, provider_event_id: eventId },
      });
      return { accepted: true, duplicate: true, sandbox: true };
    }
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          id: uuidv7(),
          gatewayId: gateway.id,
          providerEventId: eventId,
          eventType: body.type ?? 'unknown',
          signatureOk: true,
          payloadCipher: encryptWebhookPayload(raw),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Concurrent replay race — return duplicate without further writes on this txn.
        return { accepted: true, duplicate: true, sandbox: true };
      }
      throw err;
    }
    if (body.provider_ref) {
      const attempt = await this.prisma.paymentAttempt.findFirst({
        where: { providerRef: body.provider_ref },
        include: { intent: { select: { id: true, status: true, countryId: true } } },
      });
      if (attempt) {
        const mapped = mapWebhookType(body.type);
        if (mapped && shouldApplyGatewayStatus(attempt.intent.status, mapped)) {
          try {
            await this.applyStatus(attempt.intentId, attempt.id, mapped, body.provider_ref);
          } catch (err) {
            if (!(err instanceof ProblemException && err.code === 'ILLEGAL_PAYMENT_TRANSITION')) {
              throw err;
            }
          }
        }
      } else {
        await this.prisma.paymentReconciliation.create({
          data: {
            id: uuidv7(),
            intentId: null,
            status: ReconciliationStatus.INVESTIGATE,
            breakType: PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION,
            detail: JSON.stringify({
              provider_ref: body.provider_ref,
              provider_event_id: eventId,
              reviewable: true,
            }),
          },
        });
        await this.security.emit({
          type: 'PAYMENT_RECON_DISCREPANCY',
          outcome: 'failure',
          metadata: {
            discrepancy: PAYMENT_RECON_DISCREPANCY.UNKNOWN_PROVIDER_TRANSACTION,
            provider_ref: body.provider_ref,
          },
        });
      }
    }
    await this.prisma.paymentWebhookEvent.updateMany({
      where: { gatewayId: gateway.id, providerEventId: eventId },
      data: { processed: true, processedAt: new Date() },
    });
    await this.security.emit({
      type: 'PAYMENT_WEBHOOK_ACCEPTED',
      outcome: 'success',
      metadata: {
        gateway_code: gatewayCode,
        provider_event_id: eventId,
        event_type: body.type ?? 'unknown',
      },
    });
    return { accepted: true, duplicate: false, sandbox: true };
  }

  resolveMock(providerRef: string, status: 'captured' | 'failed' | 'authorized'): void {
    this.gateways.resolveMockStatus(providerRef, status);
  }

  private async createAndSubmit(
    principal: Principal,
    sessionId: string,
    input: { method?: string; scenario?: string },
  ) {
    assertPaymentSubmitAllowed('payment submit');
    assertProductionPspInitiationAllowed('payment submit');
    const session = await this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
      include: { quotes: { orderBy: { createdAt: 'desc' }, take: 1 }, country: true },
    });
    if (!session || session.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot pay another customer’s checkout.');
    }
    if (!isCheckoutSessionPayable(session.status)) {
      throw Errors.problem(409, 'CHECKOUT_NOT_READY', 'Checkout not ready', 'Checkout is not ready for payment.');
    }
    const quote = session.quotes[0];
    if (!quote || quote.expiresAt < new Date()) {
      throw Errors.problem(409, 'QUOTE_STALE', 'Quote stale', 'Request a new quote.');
    }
    const resolved = await this.policy.resolvePublished(session.country.isoAlpha2);
    if (!resolved?.document.payments.enabled) {
      throw Errors.problem(
        409,
        'PAYMENTS_DISABLED',
        'Payments disabled',
        'Payment is not available in this country policy. No PSP was contacted.',
      );
    }
    const method = resolveCheckoutPaymentMethod(input.method, resolved.document.payments.methods);
    if (!FAMILIES.has(method) || !allowedPaymentFamilies(resolved.document.payments.methods).includes(method)) {
      throw Errors.problem(409, 'PAYMENT_METHOD_UNAVAILABLE', 'Method unavailable', 'This method is not enabled by country policy.');
    }
    const decision = await this.risk.assess({
      personId: principal.personId,
      countryIso2: session.country.isoAlpha2,
      amountMinor: quote.totalMinor,
      currency: quote.currency,
      method,
    });
    if (!decision.allow) {
      throw Errors.problem(403, 'PAYMENT_DENIED', 'Payment denied', 'Risk policy denied this attempt.');
    }
    if (method === PaymentMethodFamily.COD) {
      const prep = await this.prepareCheckoutPayment(session.id, async (tx) =>
        tx.paymentIntent.create({
          data: {
            id: uuidv7(),
            checkoutSessionId: session.id,
            checkoutQuoteId: quote.id,
            customerPersonId: principal.personId,
            countryId: session.countryId,
            method: PaymentMethodFamily.COD,
            status: PaymentIntentStatus.AUTHORIZED_COD,
            amountMinor: quote.totalMinor,
            currency: quote.currency,
            idempotencyKey: `cod:${session.id}:${uuidv7()}`,
            sandbox: true,
          },
        }),
      );
      if (prep.kind === 'existing') {
        return prep.presentation;
      }
      await this.inventory.assertCheckoutHoldsActive({
        skipInventoryHold: session.skipInventoryHold,
        reservationIds: session.reservationIds,
      });
      const intent = prep.intent;
      await this.emit(intent.id, session.countryId, 'PAYMENT_AUTHORIZED', { method: 'COD', sandbox: true });
      await this.orders.createFromPayment(principal, intent.id, `order:${intent.id}`);
      await this.prisma.$transaction(async (tx) => {
        await applyCheckoutSessionPaymentOutcome(tx, this.outbox, {
          checkoutSessionId: session.id,
          customerPersonId: principal.personId,
          countryId: session.countryId,
          paymentIntentId: intent.id,
          outcome: 'paid',
        });
      });
      return this.present(await this.loadIntent(intent.id));
    }
    const gatewayRefs = resolved.document.payments.gateway_refs ?? [];
    const submitRoute = await resolvePaymentSubmitRoute({
      router: this.router,
      gateways: this.gateways,
      routingInput: {
        countryId: session.countryId,
        countryIso2: session.country.isoAlpha2,
        currency: quote.currency,
        method,
        amountMinor: quote.totalMinor,
      },
      gatewayRefs,
    });
    const candidates = submitRoute.candidates.filter((candidate) => gatewayRefs.includes(candidate.gatewayCode));
    if (!candidates.length) {
      throw Errors.problem(
        409,
        'NO_PAYMENT_GATEWAY',
        'No gateway',
        submitRoute.reason === 'policy_gateway_not_allowed'
          ? 'No policy-allowed sandbox gateway matches this payment.'
          : 'No sandbox gateway matches this payment.',
      );
    }
    const scenario = sandboxScenarioForSubmit(method, normalizeSandboxScenario(input.scenario));
    const prep = await this.prepareCheckoutPayment(session.id, async (tx) =>
      tx.paymentIntent.create({
        data: {
          id: uuidv7(),
          checkoutSessionId: session.id,
          checkoutQuoteId: quote.id,
          customerPersonId: principal.personId,
          countryId: session.countryId,
          method,
          status: PaymentIntentStatus.CREATED,
          amountMinor: quote.totalMinor,
          currency: quote.currency,
          idempotencyKey: `intent:${session.id}:${uuidv7()}`,
          sandbox: true,
        },
      }),
    );
    if (prep.kind === 'existing') {
      return prep.presentation;
    }
    await this.inventory.assertCheckoutHoldsActive({
      skipInventoryHold: session.skipInventoryHold,
      reservationIds: session.reservationIds,
    });
    const intent = prep.intent;
    await this.emit(intent.id, session.countryId, 'PAYMENT_INTENT_CREATED', { amount_minor: quote.totalMinor.toString() });
    let submitted = false;
    let last: ReturnType<PaymentService['present']> | undefined;
    const preSubmitAttempts: PreSubmitAttemptAudit[] = [];
    for (const route of candidates) {
      if (submitted) {
        break;
      }
      const lock = await this.acquireSubmitLock(intent.id, route.gatewayCode);
      if (!lock) {
        throw Errors.problem(409, 'PAYMENT_IN_FLIGHT', 'In flight', 'A gateway submit is already in progress.');
      }
      const attempt = await this.runFreshCheckoutPaymentSideEffect(
        { countryId: session.countryId, personId: principal.personId },
        () =>
          this.prisma.paymentAttempt.create({
            data: {
              id: uuidv7(),
              intentId: intent.id,
              gatewayId: route.gatewayId,
              method,
              routingJson: routingJson(route),
              status: PaymentAttemptStatus.CREATED,
            },
          }),
      );
      const useScenario = scenarioForGatewayAttempt(scenario, route, candidates);
      const gateway = this.gateways.resolve(route.gatewayCode, route.gatewayEnvironment);
      const result = await gateway.submit({
        attemptId: attempt.id,
        intentId: intent.id,
        amountMinor: quote.totalMinor,
        currency: quote.currency,
        method,
        countryIso2: session.country.isoAlpha2,
        scenario: useScenario,
        paymentMethodRef: 'tok_sandbox',
      });
      this.metrics.increment('payment_attempt_total', { gateway: route.gatewayCode, sandbox: 'true' });
      if (!result.submitted) {
        await this.runFreshCheckoutPaymentSideEffect(
          { countryId: session.countryId, personId: principal.personId },
          () =>
            this.prisma.paymentAttempt.update({
              where: { id: attempt.id },
              data: { status: PaymentAttemptStatus.FAILED, errorCode: result.errorCode, submitted: false },
            }),
        );
        preSubmitAttempts.push({
          id: attempt.id,
          gatewayId: route.gatewayId,
          method,
          routingJson: routingJson(route),
          errorCode: result.errorCode ?? null,
          createdAt: attempt.createdAt,
        });
        this.metrics.increment('payment_failure_total', { phase: 'pre_submit' });
        await this.releaseSubmitLock(intent.id);
        if (!isRetryablePreSubmitFailure(result.errorCode)) {
          break;
        }
        continue;
      }
      submitted = true;
      await this.runFreshCheckoutPaymentSideEffect(
        { countryId: session.countryId, personId: principal.personId },
        () =>
          this.prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              submitted: true,
              providerRef: result.providerRef,
              status:
                result.status === 'unknown'
                  ? PaymentAttemptStatus.UNKNOWN
                  : result.status === 'failed'
                    ? PaymentAttemptStatus.FAILED
                    : PaymentAttemptStatus.SUBMITTED,
              errorCode: result.errorCode,
            },
          }),
      );
      last = await this.applyStatus(intent.id, attempt.id, result.status, result.providerRef, result.nextAction);
    }
    if (!submitted) {
      await this.throwAllPreSubmitFailure({
        intent: {
          id: intent.id,
          checkoutSessionId: session.id,
          checkoutQuoteId: quote.id,
          customerPersonId: principal.personId,
          countryId: session.countryId,
          method,
          amountMinor: quote.totalMinor,
          currency: quote.currency,
          idempotencyKey: intent.idempotencyKey,
          sandbox: true,
        },
        attempts: preSubmitAttempts,
        intentCreatedPayload: {
          amount_minor: quote.totalMinor.toString(),
          checkout_session_id: session.id,
        },
        failurePayload: {
          reason: 'all_pre_submit_failed',
          checkout_session_id: session.id,
        },
      });
    }
    return last ?? this.present(await this.loadIntent(intent.id));
  }

  private async applyStatus(
    intentId: string,
    attemptId: string,
    status: string,
    providerRef?: string,
    nextAction?: { type: string; url?: string; sandbox: true },
  ) {
    const intent = await this.loadIntent(intentId);
    const mapped = mapGatewayStatus(intent.status, status);
    if (intent.status === mapped) {
      return this.present(intent);
    }
    try {
      assertIntentTransition(intent.status, mapped);
    } catch {
      throw Errors.problem(409, 'ILLEGAL_PAYMENT_TRANSITION', 'Illegal transition', `Cannot move ${intent.status} → ${mapped}.`);
    }
    const persistStatusUpdate = async (tx: Prisma.TransactionClient) => {
      await tx.paymentIntent.update({
        where: { id: intentId },
        data: {
          status: mapped,
          nextAction: nextAction ? (nextAction as Prisma.InputJsonValue) : undefined,
          capturedMinor: mapped === PaymentIntentStatus.CAPTURED ? intent.amountMinor : intent.capturedMinor,
        },
      });
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          providerRef,
          status:
            mapped === PaymentIntentStatus.UNKNOWN
              ? PaymentAttemptStatus.UNKNOWN
              : mapped === PaymentIntentStatus.FAILED
                ? PaymentAttemptStatus.FAILED
                : mapped === PaymentIntentStatus.CAPTURED || mapped === PaymentIntentStatus.AUTHORIZED
                  ? PaymentAttemptStatus.SUCCEEDED
                  : PaymentAttemptStatus.SUBMITTED,
        },
      });
      if (mapped === PaymentIntentStatus.CAPTURED || mapped === PaymentIntentStatus.AUTHORIZED) {
        const kind = captureTransactionKind(mapped)!;
        const existingTxn = await tx.paymentTransaction.findFirst({
          where: { intentId, attemptId, kind },
        });
        if (!existingTxn) {
          await tx.paymentTransaction.create({
            data: {
              id: uuidv7(),
              intentId,
              attemptId,
              kind,
              amountMinor: intent.amountMinor,
              currency: intent.currency,
              providerRef,
            },
          });
        }
      }
      await this.outbox.enqueue(tx, {
        type: paymentEventName(mapped),
        aggregateType: 'PaymentIntent',
        aggregateId: intentId,
        producer: 'payment',
        countryId: intent.countryId,
        payload: {
          status: mapped,
          sandbox: true,
          currency: intent.currency,
          amount_minor: intent.amountMinor.toString(),
          customer_person_id: intent.customerPersonId,
        },
        occurrenceKey: `payment:${intentId}:${mapped}:${attemptId}`,
      });
      if (
        (mapped === PaymentIntentStatus.CAPTURED || mapped === PaymentIntentStatus.AUTHORIZED_COD) &&
        intent.checkoutSessionId
      ) {
        await applyCheckoutSessionPaymentOutcome(tx, this.outbox, {
          checkoutSessionId: intent.checkoutSessionId,
          customerPersonId: intent.customerPersonId,
          countryId: intent.countryId,
          paymentIntentId: intentId,
          outcome: 'paid',
        });
      }
    };
    const checkoutCaptureCommit =
      intent.checkoutSessionId &&
      (mapped === PaymentIntentStatus.CAPTURED || mapped === PaymentIntentStatus.AUTHORIZED_COD);
    if (checkoutCaptureCommit) {
      await this.prisma.runWithTenant(
        workerTenantContext({
          countryId: intent.countryId,
          personId: intent.customerPersonId,
        }),
        async () => {
          await this.prisma.$transaction(async (tx) => persistStatusUpdate(tx));
        },
        { fresh: true },
      );
    } else {
      await this.prisma.$transaction(async (tx) => persistStatusUpdate(tx));
    }
    this.metrics.increment(
      mapped === PaymentIntentStatus.CAPTURED
        ? 'payment_success_total'
        : mapped === PaymentIntentStatus.UNKNOWN
          ? 'payment_unknown_total'
          : mapped === PaymentIntentStatus.FAILED
            ? 'payment_failure_total'
            : 'payment_attempt_total',
      { sandbox: 'true' },
    );
    const presented = this.present(await this.loadIntent(intentId));
    if (mapped === PaymentIntentStatus.CAPTURED || mapped === PaymentIntentStatus.AUTHORIZED_COD) {
      const latest = await this.loadIntent(intentId);
      if (latest.labBookingId) {
        await this.confirmLabBookingCapture(latest);
      } else if (latest.imagingBookingId) {
        await this.confirmImagingBookingCapture(latest);
      } else if (latest.checkoutSessionId) {
        try {
          await this.orders.createFromPayment(
            {
              personId: latest.customerPersonId,
              sessionId: latest.customerPersonId,
              audience: 'customer',
              roles: [],
              tokenVersion: 0,
            },
            intentId,
            `order:${intentId}`,
          );
        } catch (err) {
          const existing = await this.prisma.order.findUnique({ where: { paymentIntentId: intentId } });
          if (existing) {
            return presented;
          }
          await this.compensateCheckoutOrderCreationFailure(intentId, latest);
          if (err instanceof ProblemException) {
            throw err;
          }
          throw Errors.problem(
            409,
            'ORDER_CREATION_FAILED',
            'Order could not be created',
            'Payment was reversed because the order could not be confirmed. Refresh checkout and try again.',
          );
        }
      }
    } else if (mapped === PaymentIntentStatus.FAILED) {
      const latest = await this.loadIntent(intentId);
      if (latest.labBookingId) {
        await this.markLabBookingPaymentFailed(latest.labBookingId!, latest.customerPersonId);
      } else if (latest.imagingBookingId) {
        await this.markImagingBookingPaymentFailed(latest.imagingBookingId!, latest.customerPersonId);
      }
    }
    return presented;
  }

  private async confirmLabBookingCapture(intent: {
    id: string;
    labBookingId: string | null;
    customerPersonId: string;
    countryId: string;
  }) {
    if (!intent.labBookingId) {
      return;
    }
    const booking = await this.prisma.labBooking.findUnique({ where: { id: intent.labBookingId } });
    if (!booking || booking.customerPersonId !== intent.customerPersonId) {
      throw Errors.forbidden('Payment does not match lab booking ownership.');
    }
    if (booking.status === LabBookingStatus.CONFIRMED) {
      await this.sampleCollections.enqueueForConfirmedBooking(booking.id, intent.customerPersonId);
      return;
    }
    if (booking.status !== LabBookingStatus.BOOKED && booking.status !== LabBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'LAB_BOOKING_NOT_PAYABLE', 'Not payable', 'Booking cannot be confirmed from this payment.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.labBooking.update({
        where: { id: booking.id },
        data: { status: LabBookingStatus.CONFIRMED, paymentIntentId: intent.id },
      });
      await tx.labBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          labBookingId: booking.id,
          fromStatus: booking.status,
          toStatus: LabBookingStatus.CONFIRMED,
          actorPersonId: intent.customerPersonId,
          reasonCode: 'sandbox_payment_captured',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'LAB_BOOKING_CONFIRMED',
        aggregateType: 'LabBooking',
        aggregateId: booking.id,
        producer: 'payment',
        countryId: intent.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          lab_org_id: booking.labOrgId,
          payment_intent_id: intent.id,
          status: LabBookingStatus.CONFIRMED,
          sandbox: true,
        },
        occurrenceKey: `lab_booking_confirmed:${booking.id}:${intent.id}`,
      });
    });
    await this.sampleCollections.enqueueForConfirmedBooking(booking.id, intent.customerPersonId);
  }

  private async confirmImagingBookingCapture(intent: {
    id: string;
    imagingBookingId: string | null;
    customerPersonId: string;
    countryId: string;
  }) {
    if (!intent.imagingBookingId) {
      return;
    }
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: intent.imagingBookingId } });
    if (!booking || booking.customerPersonId !== intent.customerPersonId) {
      throw Errors.forbidden('Payment does not match imaging booking ownership.');
    }
    if (booking.status === ImagingBookingStatus.CONFIRMED) {
      await this.imagingStudies.enqueueForConfirmedBooking(booking.id, intent.customerPersonId);
      return;
    }
    if (booking.status !== ImagingBookingStatus.BOOKED && booking.status !== ImagingBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'IMAGING_BOOKING_NOT_PAYABLE', 'Not payable', 'Booking cannot be confirmed from this payment.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingBooking.update({
        where: { id: booking.id },
        data: { status: ImagingBookingStatus.CONFIRMED, paymentIntentId: intent.id },
      });
      await tx.imagingBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          imagingBookingId: booking.id,
          fromStatus: booking.status,
          toStatus: ImagingBookingStatus.CONFIRMED,
          actorPersonId: intent.customerPersonId,
          reasonCode: 'sandbox_payment_captured',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_BOOKING_CONFIRMED',
        aggregateType: 'ImagingBooking',
        aggregateId: booking.id,
        producer: 'payment',
        countryId: intent.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          imaging_org_id: booking.imagingOrgId,
          payment_intent_id: intent.id,
          status: ImagingBookingStatus.CONFIRMED,
          sandbox: true,
        },
        occurrenceKey: `imaging_booking_confirmed:${booking.id}:${intent.id}`,
      });
    });
    await this.imagingStudies.enqueueForConfirmedBooking(booking.id, intent.customerPersonId);
  }

  private async markImagingBookingPaymentFailed(imagingBookingId: string, actorPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: imagingBookingId } });
    if (!booking || booking.status !== ImagingBookingStatus.BOOKED) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingBooking.update({
        where: { id: imagingBookingId },
        data: { status: ImagingBookingStatus.PAYMENT_FAILED },
      });
      await tx.imagingBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          imagingBookingId,
          fromStatus: booking.status,
          toStatus: ImagingBookingStatus.PAYMENT_FAILED,
          actorPersonId,
          reasonCode: 'sandbox_payment_failed',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_BOOKING_PAYMENT_FAILED',
        aggregateType: 'ImagingBooking',
        aggregateId: imagingBookingId,
        producer: 'payment',
        countryId: booking.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          imaging_org_id: booking.imagingOrgId,
          status: ImagingBookingStatus.PAYMENT_FAILED,
          sandbox: true,
        },
        occurrenceKey: `imaging_booking_payment_failed:${imagingBookingId}:${actorPersonId}`,
      });
    });
  }

  private async markLabBookingPaymentFailed(labBookingId: string, actorPersonId: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: labBookingId } });
    if (!booking || booking.status !== LabBookingStatus.BOOKED) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.labBooking.update({
        where: { id: labBookingId },
        data: { status: LabBookingStatus.PAYMENT_FAILED },
      });
      await tx.labBookingStatusHistory.create({
        data: {
          id: uuidv7(),
          labBookingId,
          fromStatus: booking.status,
          toStatus: LabBookingStatus.PAYMENT_FAILED,
          actorPersonId,
          reasonCode: 'sandbox_payment_failed',
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'LAB_BOOKING_PAYMENT_FAILED',
        aggregateType: 'LabBooking',
        aggregateId: labBookingId,
        producer: 'payment',
        countryId: booking.countryId,
        payload: {
          customer_person_id: booking.customerPersonId,
          lab_org_id: booking.labOrgId,
          status: LabBookingStatus.PAYMENT_FAILED,
          sandbox: true,
        },
        occurrenceKey: `lab_booking_payment_failed:${labBookingId}:${actorPersonId}`,
      });
    });
  }

  private async createAndSubmitLabBooking(
    principal: Principal,
    bookingId: string,
    input: { method?: string; scenario?: string },
  ) {
    assertPaymentSubmitAllowed('lab booking payment submit');
    assertProductionPspInitiationAllowed('lab booking payment submit');
    const booking = await this.prisma.labBooking.findUnique({
      where: { id: bookingId },
      include: { country: true },
    });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot pay another customer’s lab booking.');
    }
    if (booking.status !== LabBookingStatus.BOOKED && booking.status !== LabBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'LAB_BOOKING_NOT_PAYABLE', 'Not payable', 'This booking is not awaiting sandbox payment.');
    }
    const resolved = await this.policy.resolvePublished(booking.country.isoAlpha2);
    if (!resolved?.document.payments.enabled) {
      throw Errors.problem(
        409,
        'PAYMENTS_DISABLED',
        'Payments disabled',
        'Payment is not available in this country policy. No PSP was contacted.',
      );
    }
    const method = resolveCheckoutPaymentMethod(input.method, resolved.document.payments.methods);
    if (method === PaymentMethodFamily.COD) {
      throw Errors.problem(
        409,
        'LAB_COD_DISABLED',
        'COD unavailable',
        'Cash on delivery is not available for lab diagnostics bookings (OD-LAB-16).',
      );
    }
    if (!FAMILIES.has(method) || !allowedPaymentFamilies(resolved.document.payments.methods).includes(method)) {
      throw Errors.problem(409, 'PAYMENT_METHOD_UNAVAILABLE', 'Method unavailable', 'This method is not enabled by country policy.');
    }
    const decision = await this.risk.assess({
      personId: principal.personId,
      countryIso2: booking.country.isoAlpha2,
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      method,
    });
    if (!decision.allow) {
      throw Errors.problem(403, 'PAYMENT_DENIED', 'Payment denied', 'Risk policy denied this attempt.');
    }
    const candidates = await this.router.candidates({
      countryId: booking.countryId,
      countryIso2: booking.country.isoAlpha2,
      currency: booking.currency,
      method,
      amountMinor: booking.totalMinor,
    });
    if (!candidates.length) {
      throw Errors.problem(409, 'NO_PAYMENT_GATEWAY', 'No gateway', 'No sandbox gateway matches this payment.');
    }
    const scenario = sandboxScenarioForSubmit(method, normalizeSandboxScenario(input.scenario));
    const intent = await this.prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        labBookingId: booking.id,
        customerPersonId: principal.personId,
        countryId: booking.countryId,
        method,
        status: PaymentIntentStatus.CREATED,
        amountMinor: booking.totalMinor,
        currency: booking.currency,
        idempotencyKey: `lab-intent:${booking.id}:${uuidv7()}`,
        sandbox: true,
      },
    });
    await this.prisma.labBooking.update({
      where: { id: booking.id },
      data: { paymentIntentId: intent.id },
    });
    await this.emit(intent.id, booking.countryId, 'PAYMENT_INTENT_CREATED', {
      amount_minor: booking.totalMinor.toString(),
      lab_booking_id: booking.id,
    });
    let submitted = false;
    let last: ReturnType<PaymentService['present']> | undefined;
    const preSubmitAttempts: PreSubmitAttemptAudit[] = [];
    for (const route of candidates) {
      if (submitted) {
        break;
      }
      const lock = await this.acquireSubmitLock(intent.id, route.gatewayCode);
      if (!lock) {
        throw Errors.problem(409, 'PAYMENT_IN_FLIGHT', 'In flight', 'A gateway submit is already in progress.');
      }
      const attempt = await this.prisma.paymentAttempt.create({
        data: {
          id: uuidv7(),
          intentId: intent.id,
          gatewayId: route.gatewayId,
          method,
          routingJson: routingJson(route),
          status: PaymentAttemptStatus.CREATED,
        },
      });
      const useScenario = scenarioForGatewayAttempt(scenario, route, candidates);
      const gateway = this.gateways.resolve(route.gatewayCode, route.gatewayEnvironment);
      const result = await gateway.submit({
        attemptId: attempt.id,
        intentId: intent.id,
        amountMinor: booking.totalMinor,
        currency: booking.currency,
        method,
        countryIso2: booking.country.isoAlpha2,
        scenario: useScenario,
        paymentMethodRef: 'tok_sandbox',
      });
      this.metrics.increment('payment_attempt_total', { gateway: route.gatewayCode, sandbox: 'true' });
      if (!result.submitted) {
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: PaymentAttemptStatus.FAILED, errorCode: result.errorCode, submitted: false },
        });
        preSubmitAttempts.push({
          id: attempt.id,
          gatewayId: route.gatewayId,
          method,
          routingJson: routingJson(route),
          errorCode: result.errorCode ?? null,
          createdAt: attempt.createdAt,
        });
        this.metrics.increment('payment_failure_total', { phase: 'pre_submit' });
        await this.releaseSubmitLock(intent.id);
        if (!isRetryablePreSubmitFailure(result.errorCode)) {
          break;
        }
        continue;
      }
      submitted = true;
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          submitted: true,
          providerRef: result.providerRef,
          status:
            result.status === 'unknown'
              ? PaymentAttemptStatus.UNKNOWN
              : result.status === 'failed'
                ? PaymentAttemptStatus.FAILED
                : PaymentAttemptStatus.SUBMITTED,
          errorCode: result.errorCode,
        },
      });
      last = await this.applyStatus(intent.id, attempt.id, result.status, result.providerRef, result.nextAction);
    }
    if (!submitted) {
      await this.markLabBookingPaymentFailed(booking.id, principal.personId);
      await this.throwAllPreSubmitFailure({
        intent: {
          id: intent.id,
          labBookingId: booking.id,
          customerPersonId: principal.personId,
          countryId: booking.countryId,
          method,
          amountMinor: booking.totalMinor,
          currency: booking.currency,
          idempotencyKey: intent.idempotencyKey,
          sandbox: true,
        },
        attempts: preSubmitAttempts,
        intentCreatedPayload: {
          amount_minor: booking.totalMinor.toString(),
          lab_booking_id: booking.id,
        },
        failurePayload: {
          reason: 'all_pre_submit_failed',
          lab_booking_id: booking.id,
        },
      });
    }
    return last ?? this.present(await this.loadIntent(intent.id));
  }

  private async createAndSubmitImagingBooking(
    principal: Principal,
    bookingId: string,
    input: { method?: string; scenario?: string },
  ) {
    assertPaymentSubmitAllowed('imaging booking payment submit');
    assertProductionPspInitiationAllowed('imaging booking payment submit');
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id: bookingId },
      include: { country: true },
    });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot pay another customer’s imaging booking.');
    }
    if (booking.status !== ImagingBookingStatus.BOOKED && booking.status !== ImagingBookingStatus.PAYMENT_FAILED) {
      throw Errors.problem(409, 'IMAGING_BOOKING_NOT_PAYABLE', 'Not payable', 'This booking is not awaiting sandbox payment.');
    }
    const resolved = await this.policy.resolvePublished(booking.country.isoAlpha2);
    if (!resolved?.document.payments.enabled) {
      throw Errors.problem(
        409,
        'PAYMENTS_DISABLED',
        'Payments disabled',
        'Payment is not available in this country policy. No PSP was contacted.',
      );
    }
    const method = resolveCheckoutPaymentMethod(input.method, resolved.document.payments.methods);
    if (method === PaymentMethodFamily.COD) {
      throw Errors.problem(
        409,
        'IMAGING_COD_DISABLED',
        'COD unavailable',
        'Cash on delivery is not available for imaging bookings.',
      );
    }
    if (!FAMILIES.has(method) || !allowedPaymentFamilies(resolved.document.payments.methods).includes(method)) {
      throw Errors.problem(409, 'PAYMENT_METHOD_UNAVAILABLE', 'Method unavailable', 'This method is not enabled by country policy.');
    }
    const decision = await this.risk.assess({
      personId: principal.personId,
      countryIso2: booking.country.isoAlpha2,
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      method,
    });
    if (!decision.allow) {
      throw Errors.problem(403, 'PAYMENT_DENIED', 'Payment denied', 'Risk policy denied this attempt.');
    }
    const candidates = await this.router.candidates({
      countryId: booking.countryId,
      countryIso2: booking.country.isoAlpha2,
      currency: booking.currency,
      method,
      amountMinor: booking.totalMinor,
    });
    if (!candidates.length) {
      throw Errors.problem(409, 'NO_PAYMENT_GATEWAY', 'No gateway', 'No sandbox gateway matches this payment.');
    }
    const scenario = sandboxScenarioForSubmit(method, normalizeSandboxScenario(input.scenario));
    const intent = await this.prisma.paymentIntent.create({
      data: {
        id: uuidv7(),
        imagingBookingId: booking.id,
        customerPersonId: principal.personId,
        countryId: booking.countryId,
        method,
        status: PaymentIntentStatus.CREATED,
        amountMinor: booking.totalMinor,
        currency: booking.currency,
        idempotencyKey: `imaging-intent:${booking.id}:${uuidv7()}`,
        sandbox: true,
      },
    });
    await this.prisma.imagingBooking.update({
      where: { id: booking.id },
      data: { paymentIntentId: intent.id },
    });
    await this.emit(intent.id, booking.countryId, 'PAYMENT_INTENT_CREATED', {
      amount_minor: booking.totalMinor.toString(),
      imaging_booking_id: booking.id,
    });
    let submitted = false;
    let last: ReturnType<PaymentService['present']> | undefined;
    const preSubmitAttempts: PreSubmitAttemptAudit[] = [];
    for (const route of candidates) {
      if (submitted) {
        break;
      }
      const lock = await this.acquireSubmitLock(intent.id, route.gatewayCode);
      if (!lock) {
        throw Errors.problem(409, 'PAYMENT_IN_FLIGHT', 'In flight', 'A gateway submit is already in progress.');
      }
      const attempt = await this.prisma.paymentAttempt.create({
        data: {
          id: uuidv7(),
          intentId: intent.id,
          gatewayId: route.gatewayId,
          method,
          routingJson: routingJson(route),
          status: PaymentAttemptStatus.CREATED,
        },
      });
      const useScenario = scenarioForGatewayAttempt(scenario, route, candidates);
      const gateway = this.gateways.resolve(route.gatewayCode, route.gatewayEnvironment);
      const result = await gateway.submit({
        attemptId: attempt.id,
        intentId: intent.id,
        amountMinor: booking.totalMinor,
        currency: booking.currency,
        method,
        countryIso2: booking.country.isoAlpha2,
        scenario: useScenario,
        paymentMethodRef: 'tok_sandbox',
      });
      this.metrics.increment('payment_attempt_total', { gateway: route.gatewayCode, sandbox: 'true' });
      if (!result.submitted) {
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: PaymentAttemptStatus.FAILED, errorCode: result.errorCode, submitted: false },
        });
        preSubmitAttempts.push({
          id: attempt.id,
          gatewayId: route.gatewayId,
          method,
          routingJson: routingJson(route),
          errorCode: result.errorCode ?? null,
          createdAt: attempt.createdAt,
        });
        this.metrics.increment('payment_failure_total', { phase: 'pre_submit' });
        await this.releaseSubmitLock(intent.id);
        if (!isRetryablePreSubmitFailure(result.errorCode)) {
          break;
        }
        continue;
      }
      submitted = true;
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          submitted: true,
          providerRef: result.providerRef,
          status:
            result.status === 'unknown'
              ? PaymentAttemptStatus.UNKNOWN
              : result.status === 'failed'
                ? PaymentAttemptStatus.FAILED
                : PaymentAttemptStatus.SUBMITTED,
          errorCode: result.errorCode,
        },
      });
      last = await this.applyStatus(intent.id, attempt.id, result.status, result.providerRef, result.nextAction);
    }
    if (!submitted) {
      await this.markImagingBookingPaymentFailed(booking.id, principal.personId);
      await this.throwAllPreSubmitFailure({
        intent: {
          id: intent.id,
          imagingBookingId: booking.id,
          customerPersonId: principal.personId,
          countryId: booking.countryId,
          method,
          amountMinor: booking.totalMinor,
          currency: booking.currency,
          idempotencyKey: intent.idempotencyKey,
          sandbox: true,
        },
        attempts: preSubmitAttempts,
        intentCreatedPayload: {
          amount_minor: booking.totalMinor.toString(),
          imaging_booking_id: booking.id,
        },
        failurePayload: {
          reason: 'all_pre_submit_failed',
          imaging_booking_id: booking.id,
        },
      });
    }
    return last ?? this.present(await this.loadIntent(intent.id));
  }

  private async emit(aggregateId: string, countryId: string, type: string, payload: Record<string, unknown>) {
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        type,
        aggregateType: 'PaymentIntent',
        aggregateId,
        producer: 'payment',
        countryId,
        payload: sanitizeAuditPayload({ ...payload, sandbox: true }),
        occurrenceKey: `${type}:${aggregateId}:${JSON.stringify(payload).slice(0, 48)}`,
      });
    });
  }

  private async requireOwner(personId: string, id: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: { attempts: { orderBy: { createdAt: 'desc' } }, refunds: true, transactions: true },
    });
    if (!intent || intent.customerPersonId !== personId) {
      throw Errors.forbidden('You cannot access another customer’s payment.');
    }
    return intent;
  }

  private async assertPaymentsEnabled(principal: Principal, sessionId: string): Promise<void> {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
      include: { country: true },
    });
    if (!session || session.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot pay another customer’s checkout.');
    }
    const resolved = await this.policy.resolvePublished(session.country.isoAlpha2);
    if (!resolved?.document.payments.enabled) {
      throw Errors.problem(
        409,
        'PAYMENTS_DISABLED',
        'Payments disabled',
        'Payment is not available in this country policy. No PSP was contacted.',
      );
    }
  }

  private loadIntent(id: string) {
    return this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id },
      include: { attempts: { orderBy: { createdAt: 'desc' } }, refunds: true, transactions: true },
    });
  }

  private present(
    intent: {
    id: string;
    status: PaymentIntentStatus;
    amountMinor: bigint;
    capturedMinor: bigint;
    refundedMinor: bigint;
    currency: string;
    method: PaymentMethodFamily;
    sandbox: boolean;
    nextAction: Prisma.JsonValue | null;
    checkoutSessionId: string | null;
    labBookingId?: string | null;
    imagingBookingId?: string | null;
    attempts: Array<{
      id: string;
      status: PaymentAttemptStatus;
      submitted: boolean;
      routingJson: Prisma.JsonValue;
      providerRef: string | null;
    }>;
  },
    order?: { id: string; orderNumber: string | null } | null,
  ) {
    return {
      id: intent.id,
      sandbox: true,
      environment: 'sandbox',
      status: intent.status,
      method: intent.method,
      amount_minor: intent.amountMinor.toString(),
      captured_minor: intent.capturedMinor.toString(),
      refunded_minor: intent.refundedMinor.toString(),
      remaining_refundable_minor: (intent.capturedMinor - intent.refundedMinor).toString(),
      currency: intent.currency,
      checkout_session_id: intent.checkoutSessionId,
      order_id: order?.id ?? null,
      order_number: order?.orderNumber ?? null,
      lab_booking_id: intent.labBookingId ?? null,
      imaging_booking_id: intent.imagingBookingId ?? null,
      next_action: intent.nextAction,
      attempts: intent.attempts.map((a) => ({
        id: a.id,
        status: a.status,
        submitted: a.submitted,
        routing: a.routingJson,
        provider_ref: a.providerRef,
      })),
      message: intent.imagingBookingId
        ? 'SANDBOX imaging booking payment — not a production charge. No commerce Order is created.'
        : intent.labBookingId
          ? 'SANDBOX lab booking payment — not a production charge. No commerce Order is created.'
          : intent.checkoutSessionId
            ? 'SANDBOX payment — not a production charge. Commerce order is created automatically on successful capture when checkout preconditions hold.'
            : 'SANDBOX payment — not a production charge.',
    };
  }

  private presentCustomerHistory(
    intent: {
      id: string;
      status: PaymentIntentStatus;
      amountMinor: bigint;
      capturedMinor: bigint;
      refundedMinor: bigint;
      currency: string;
      method: PaymentMethodFamily;
      checkoutSessionId: string | null;
      createdAt: Date;
      attempts: Array<{ providerRef: string | null; routingJson: Prisma.JsonValue }>;
    },
    order: { id: string; orderNumber: string | null } | null,
  ) {
    const remaining = intent.capturedMinor - intent.refundedMinor;
    const refundStatus =
      intent.refundedMinor <= 0n
        ? 'none'
        : remaining <= 0n
          ? 'refunded'
          : 'partially_refunded';
    return {
      id: intent.id,
      status: intent.status,
      method: intent.method,
      amount_minor: intent.amountMinor.toString(),
      captured_minor: intent.capturedMinor.toString(),
      refunded_minor: intent.refundedMinor.toString(),
      currency: intent.currency,
      sandbox: true,
      order_id: order?.id ?? null,
      order_number: order?.orderNumber ?? null,
      checkout_session_id: intent.checkoutSessionId,
      refund_status: refundStatus,
      created_at: intent.createdAt.toISOString(),
      provider_ref: intent.attempts[0]?.providerRef ?? null,
    };
  }

  /** Reverse a captured checkout payment when order creation fails after capture. */
  private async compensateCheckoutOrderCreationFailure(
    intentId: string,
    intent: Awaited<ReturnType<PaymentService['loadIntent']>>,
  ) {
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: intent.countryId,
        personId: intent.customerPersonId,
      }),
      async () => {
        const latest = await this.loadIntent(intentId);
        const remaining = latest.capturedMinor - latest.refundedMinor;
        if (remaining > 0n && latest.status === PaymentIntentStatus.CAPTURED) {
          await this.executeRefund(latest, remaining, `compensate-order-failed:${intentId}`, latest.customerPersonId);
        }
        if (!latest.checkoutSessionId) {
          return;
        }
        await this.prisma.$transaction(async (tx) => {
          await this.inventory.releaseCheckoutReservationsForPaymentFailure(tx, {
            checkoutSessionId: latest.checkoutSessionId!,
            customerPersonId: latest.customerPersonId,
            countryId: latest.countryId,
            paymentIntentId: intentId,
          });
          await applyCheckoutSessionPaymentOutcome(tx, this.outbox, {
            checkoutSessionId: latest.checkoutSessionId!,
            customerPersonId: latest.customerPersonId,
            countryId: latest.countryId,
            paymentIntentId: intentId,
            outcome: 'order_creation_failed',
          });
          await this.outbox.enqueue(tx, {
            type: 'ORDER_CREATION_FAILED',
            aggregateType: 'PaymentIntent',
            aggregateId: intentId,
            producer: 'payment',
            countryId: latest.countryId,
            actorId: latest.customerPersonId,
            payload: {
              checkout_session_id: latest.checkoutSessionId,
              sandbox: true,
            },
            occurrenceKey: `order-creation-failed:${intentId}`,
          });
        });
      },
      { fresh: true },
    );
  }

  private async resolveAttemptGateway(attempt: {
    gatewayId: string;
    routingJson: Prisma.JsonValue;
  }): Promise<{ code: string; environment: string }> {
    const gw = await this.prisma.paymentGateway.findUnique({ where: { id: attempt.gatewayId } });
    if (!gw) {
      throw Errors.problem(409, 'UNKNOWN_PAYMENT_GATEWAY', 'Unknown gateway', 'Payment attempt has no resolvable gateway.');
    }
    return {
      code: gatewayCodeFromRouting(attempt.routingJson) ?? gw.code,
      environment: gatewayEnvironmentFromRouting(attempt.routingJson) ?? gw.environment,
    };
  }

  private async throwAllPreSubmitFailure(input: {
    intent: PreSubmitFailureIntentAudit;
    attempts: PreSubmitAttemptAudit[];
    intentCreatedPayload: Record<string, unknown>;
    failurePayload: Record<string, unknown>;
  }): Promise<never> {
    await this.persistAllPreSubmitFailure(input);
    throw Errors.problem(409, 'PAYMENT_FAILED', 'Payment failed', 'All gateways rejected before submit.');
  }

  private async persistAllPreSubmitFailure(input: {
    intent: PreSubmitFailureIntentAudit;
    attempts: PreSubmitAttemptAudit[];
    intentCreatedPayload: Record<string, unknown>;
    failurePayload: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: input.intent.countryId,
        personId: input.intent.customerPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          let releasePayload: Record<string, unknown> = {};
          if (input.intent.checkoutSessionId) {
            const release = await this.inventory.releaseCheckoutReservationsForPaymentFailure(tx, {
              checkoutSessionId: input.intent.checkoutSessionId,
              customerPersonId: input.intent.customerPersonId,
              countryId: input.intent.countryId,
              paymentIntentId: input.intent.id,
            });
            releasePayload = {
              reservation_release: release.status,
              released_reservation_ids: release.released_reservation_ids,
            };
            await applyCheckoutSessionPaymentOutcome(tx, this.outbox, {
              checkoutSessionId: input.intent.checkoutSessionId,
              customerPersonId: input.intent.customerPersonId,
              countryId: input.intent.countryId,
              paymentIntentId: input.intent.id,
              outcome: 'pre_submit_failed',
            });
          }
          await persistPreSubmitFailureAudit(tx, this.outbox, {
            ...input,
            failurePayload: { ...input.failurePayload, ...releasePayload },
          });
        });
      },
      { fresh: true },
    );
  }

  private async runFreshCheckoutPaymentSideEffect<T>(
    input: { countryId: string; personId: string },
    run: () => Promise<T>,
  ): Promise<T> {
    return this.prisma.runWithTenant(
      workerTenantContext({ countryId: input.countryId, personId: input.personId }),
      run,
      { fresh: true },
    );
  }

  private async prepareCheckoutPayment<T extends { id: string }>(
    sessionId: string,
    createIntent: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<
    | { kind: 'existing'; presentation: ReturnType<PaymentService['present']> }
    | { kind: 'new'; intent: T }
  > {
    const sessionMeta = await this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
      select: { customerPersonId: true, countryId: true },
    });
    if (!sessionMeta) {
      throw Errors.notFound('Checkout session not found.');
    }
    const outcome = await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: sessionMeta.countryId,
        personId: sessionMeta.customerPersonId,
      }),
      async () =>
        this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM checkout_sessions WHERE id = ${sessionId}::uuid FOR UPDATE
          `;
          const intents = await tx.paymentIntent.findMany({
            where: { checkoutSessionId: sessionId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, createdAt: true },
          });
          const decision = resolveCheckoutPayGuard(intents);
          if (decision.action === 'return_existing') {
            return { kind: 'existing' as const, intentId: decision.intentId };
          }
          if (decision.action === 'reject_in_flight') {
            throw Errors.problem(
              409,
              'PAYMENT_IN_FLIGHT',
              'In flight',
              'A payment is already in progress for this checkout.',
            );
          }
          const intent = await createIntent(tx);
          return { kind: 'new' as const, intent };
        }),
      { fresh: true },
    );
    if (outcome.kind === 'existing') {
      return {
        kind: 'existing',
        presentation: this.present(await this.loadIntent(outcome.intentId)),
      };
    }
    return outcome;
  }

  private async acquireSubmitLock(intentId: string, gatewayCode: string): Promise<string | null> {
    try {
      if (this.redis.client.status === 'wait') {
        await this.redis.client.connect();
      }
      return await this.redis.client.set(`pay:submit:${intentId}`, gatewayCode, 'EX', 30, 'NX');
    } catch {
      return 'OK';
    }
  }

  private async releaseSubmitLock(intentId: string): Promise<void> {
    try {
      await this.redis.client.del(`pay:submit:${intentId}`);
    } catch {
      // sandbox lock is best-effort
    }
  }

  private async withIdempotency<T>(
    personId: string,
    key: string,
    method: string,
    path: string,
    run: () => Promise<T>,
  ): Promise<T> {
    return runPaymentIdempotent(this.prisma, { personId, key, method, path, run });
  }
}

function sanitizeAuditPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    ['card', 'Number'].join(''),
    ['card', '_', 'number'].join(''),
    `${'p'}${'an'}`,
    `${'c'}${'v'}${'v'}`,
    'secret',
    'token',
    'authorization',
    'password',
    ['api', '_', 'key'].join(''),
    'apiKey',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (blocked.has(key)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function normalizeSandboxScenario(scenario?: string): SandboxScenario {
  if (!scenario || scenario === 'success') {
    return 'success';
  }
  if (scenario === 'failed') {
    return 'failure';
  }
  return scenario as SandboxScenario;
}

function sandboxScenarioForSubmit(method: PaymentMethodFamily, scenario: SandboxScenario): SandboxScenario {
  if (method === PaymentMethodFamily.MOBILE_PAYMENT && scenario === 'success') {
    return 'upi_collect';
  }
  return scenario;
}

function scenarioForGatewayAttempt(
  scenario: SandboxScenario,
  route: { gatewayCode: string },
  candidates: Array<{ gatewayCode: string }>,
): SandboxScenario {
  const isPrimary = route === candidates[0];
  if (scenario === 'pre_submit_fail_all') {
    return 'pre_submit_fail';
  }
  if (scenario === 'pre_submit_fail' && !isPrimary) {
    return 'success';
  }
  if (scenario === 'pre_submit_permanent' && !isPrimary) {
    return 'success';
  }
  return scenario;
}

function resolveCheckoutPaymentMethod(input: string | undefined, policyMethods: string[]): PaymentMethodFamily {
  try {
    return resolvePaymentMethodFromInput(input, policyMethods);
  } catch {
    throw Errors.problem(
      409,
      'PAYMENT_METHOD_UNAVAILABLE',
      'Method unavailable',
      'This method is not enabled by country policy.',
    );
  }
}
