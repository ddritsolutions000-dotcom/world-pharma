import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountStatus,
  IdentifierType,
  JwtAudience,
  OtpChannel,
  OtpPurpose,
  PersonStatus,
} from '@prisma/client';
import { AppEnv } from '@world-pharma/config';
import {
  hmacSha256Hex,
  normalizeIdentifier,
  randomOtpDigits,
  redactIdentifier,
  safeEqualHex,
  uuidv7,
} from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OtpAdapter } from './otp.adapter';
import { RateLimitService } from './rate-limit.service';
import { RbacService } from './rbac.service';
import { OutboxService } from '../events/outbox.service';
import { SecurityEventsService } from './security-events.service';
import { isCompanyRole } from './authority';
import { SessionService } from './session.service';
import { applyTenantGucs } from '../tenancy/apply-tenant-gucs';
import { authTenantContext } from '../tenancy/build-tenant-context';
import { tenantAls } from '../tenancy/tenant-als';

const PURPOSES: Record<string, OtpPurpose> = {
  REGISTER: 'REGISTER',
  LOGIN: 'LOGIN',
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  VERIFY_PHONE: 'VERIFY_PHONE',
  ACCOUNT_RECOVERY: 'ACCOUNT_RECOVERY',
  STEP_UP: 'STEP_UP',
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly rbac: RbacService,
    private readonly events: SecurityEventsService,
    private readonly outbox: OutboxService,
    private readonly rateLimit: RateLimitService,
    private readonly otp: OtpAdapter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async requestOtp(input: {
    identifier: string;
    purpose?: string;
    channel?: string;
    countryCode?: string;
    ip?: string;
    requestId?: string;
  }): Promise<{
    challengeId: string;
    expiresAt: string;
    resendAvailableAt: string;
    devCode?: string;
  }> {
    const parsed = normalizeIdentifier(input.identifier, undefined, input.countryCode);
    if (!parsed) {
      throw Errors.validation('Provide a valid email or E.164 phone number.');
    }
    const purpose = PURPOSES[input.purpose ?? 'LOGIN'] ?? 'LOGIN';
    const pepper = this.config.get('OTP_PEPPER', { infer: true });
    const ipLimit = process.env['NODE_ENV'] === 'test' ? 1000 : 10;
    const ipHit = await this.rateLimit.hit(`otp:ip:${input.ip ?? 'unknown'}`, ipLimit, 900);
    const idHit = await this.rateLimit.hit(`otp:id:${parsed.value}`, 5, 900);
    if (!ipHit.allowed || !idHit.allowed) {
      await this.events.emit({
        type: 'RATE_LIMITED',
        outcome: 'failure',
        requestId: input.requestId,
        ipHash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
      });
      throw Errors.rateLimited(Math.max(ipHit.retryAfter, idHit.retryAfter));
    }

    const existing = await this.prisma.accountIdentifier.findUnique({
      where: {
        type_valueNormalized: { type: parsed.type, valueNormalized: parsed.value },
      },
    });
    const latest = await this.prisma.otpChallenge.findFirst({
      where: { identifierNormalized: parsed.value, purpose, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    if (latest && latest.resendAvailableAt > now) {
      throw Errors.rateLimited(
        Math.ceil((latest.resendAvailableAt.getTime() - now.getTime()) / 1000),
      );
    }

    const ttl = this.config.get('AUTH_OTP_TTL_SECONDS', { infer: true });
    const resend = this.config.get('AUTH_OTP_RESEND_SECONDS', { infer: true });
    const length = this.config.get('AUTH_OTP_LENGTH', { infer: true });
    const challengeId = uuidv7();
    const code = randomOtpDigits(length);
    const channel: OtpChannel =
      input.channel === 'EMAIL' || parsed.type === 'EMAIL' ? 'EMAIL' : 'SMS';

    await this.prisma.otpChallenge.create({
      data: {
        id: challengeId,
        personId: existing?.personId,
        identifierType: parsed.type,
        identifierNormalized: parsed.value,
        channel,
        purpose,
        codeHmac: hmacSha256Hex(pepper, `${challengeId}:${code}`),
        expiresAt: new Date(now.getTime() + ttl * 1000),
        resendAvailableAt: new Date(now.getTime() + resend * 1000),
        ipHash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
        maxAttempts: this.config.get('AUTH_OTP_MAX_ATTEMPTS', { infer: true }),
      },
    });

    await this.otp.send(
      {
        channel: channel === 'EMAIL' ? 'EMAIL' : 'SMS',
        destination: parsed.value,
        purpose,
        challengeId,
      },
      code,
    );
    await this.events.emit({
      type: 'OTP_REQUESTED',
      outcome: 'success',
      personId: existing?.personId,
      requestId: input.requestId,
      metadata: { purpose, identifier: redactIdentifier(parsed.value, parsed.type) },
    });

    const reveal = this.config.get('AUTH_DEV_REVEAL_OTP', { infer: true });
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    return {
      challengeId,
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + resend * 1000).toISOString(),
      devCode: reveal && nodeEnv !== 'production' ? code : undefined,
    };
  }

  async verifyOtp(input: {
    challengeId: string;
    code: string;
    audience?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
    personId: string;
    sessionId: string;
  }> {
    const pepper = this.config.get('OTP_PEPPER', { infer: true });
    const verifyIpLimit = process.env['NODE_ENV'] === 'test' ? 1000 : 20;
    const ipHit = await this.rateLimit.hit(`otp:verify:ip:${input.ip ?? 'unknown'}`, verifyIpLimit, 900);
    if (!ipHit.allowed) {
      await this.events.emit({
        type: 'RATE_LIMITED',
        outcome: 'failure',
        requestId: input.requestId,
      });
      throw Errors.rateLimited(ipHit.retryAfter);
    }
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: input.challengeId },
    });
    if (!challenge) {
      throw Errors.otpInvalid();
    }
    if (challenge.status === 'LOCKED') {
      throw Errors.otpLocked();
    }
    if (challenge.status !== 'PENDING' || challenge.expiresAt <= new Date()) {
      if (challenge.status === 'PENDING') {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { status: 'EXPIRED' },
        });
      }
      throw Errors.otpExpired();
    }

    const expected = hmacSha256Hex(pepper, `${challenge.id}:${input.code.trim()}`);
    if (!safeEqualHex(challenge.codeHmac, expected)) {
      const attempts = challenge.attemptCount + 1;
      const locked = attempts >= challenge.maxAttempts;
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: attempts, status: locked ? 'LOCKED' : 'PENDING' },
      });
      await this.events.emit({
        type: 'OTP_FAILED',
        outcome: 'failure',
        personId: challenge.personId ?? undefined,
        requestId: input.requestId,
      });
      throw locked ? Errors.otpLocked() : Errors.otpInvalid();
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    });

    const { person, account, created } = await this.ensurePerson(challenge);
    this.assertCanSignIn(person.status, account.status, account.lockedUntil);

    const tenantTx = tenantAls.getStore()?.tx;
    if (tenantTx) {
      await applyTenantGucs(tenantTx, authTenantContext(person.id));
    }

    const rbac = await this.rbac.permissionsForPerson(person.id);
    let audience: JwtAudience = 'customer';
    if (input.audience === 'admin' && rbac.roles.some((role) => isCompanyRole(role))) {
      audience = 'admin';
    } else if (input.audience === 'partner_applicant') {
      audience = 'partner_applicant';
    } else if (input.audience === 'doctor') {
      audience = 'doctor';
    }

    const membership = rbac.membershipId
      ? await this.prisma.membership.findUnique({ where: { id: rbac.membershipId } })
      : null;
    const tokens = await this.sessions.issue({
      personId: person.id,
      accountId: account.id,
      audience,
      membershipId: rbac.membershipId,
      roles: rbac.roles,
      countryId: membership?.countryId ?? person.primaryCountryId ?? undefined,
      organizationId: membership?.organizationId ?? undefined,
      regionId: membership?.regionId ?? undefined,
      legalEntityId: membership?.legalEntityId ?? undefined,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    await this.prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0 },
    });
    await this.prisma.accountIdentifier.updateMany({
      where: {
        personId: person.id,
        type: challenge.identifierType,
        valueNormalized: challenge.identifierNormalized,
      },
      data: { verifiedAt: new Date() },
    });
    await this.events.emit({
      type: created ? 'USER_REGISTERED' : 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: person.id,
      sessionId: tokens.sessionId,
      requestId: input.requestId,
    });
    await this.events.emit({
      type: 'OTP_VERIFIED',
      outcome: 'success',
      personId: person.id,
      requestId: input.requestId,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      personId: person.id,
      sessionId: tokens.sessionId,
    };
  }

  async me(personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        identifiers: true,
        account: true,
        addresses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!person?.account) {
      throw Errors.unauthorized();
    }
    const rbac = await this.rbac.permissionsForPerson(personId);
    return {
      person_id: person.id,
      status: person.status,
      preferred_locale: person.preferredLocale,
      primary_country_id: person.primaryCountryId,
      identifiers: person.identifiers.map((row) => ({
        type: row.type,
        value: redactIdentifier(row.valueNormalized, row.type),
        verified: Boolean(row.verifiedAt),
      })),
      roles: rbac.roles,
      permissions: rbac.permissions,
      mfa_required: person.account.mfaRequired,
      last_login_at: person.account.lastLoginAt?.toISOString() ?? null,
    };
  }

  async updateProfile(
    personId: string,
    input: { preferred_locale?: string; primary_country_id?: string | null },
  ) {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw Errors.unauthorized();
    }
    if (input.primary_country_id) {
      const country = await this.prisma.country.findUnique({ where: { id: input.primary_country_id } });
      if (!country) {
        throw Errors.validation('primary_country_id is invalid.');
      }
    }
    await this.prisma.person.update({
      where: { id: personId },
      data: {
        preferredLocale: input.preferred_locale ?? undefined,
        primaryCountryId: input.primary_country_id === undefined ? undefined : input.primary_country_id,
      },
    });
    return this.me(personId);
  }

  async refresh(refreshToken: string, ip?: string, requestId?: string) {
    const ipHit = await this.rateLimit.hit(`refresh:ip:${ip ?? 'unknown'}`, 30, 900);
    if (!ipHit.allowed) {
      await this.events.emit({ type: 'RATE_LIMITED', outcome: 'failure', requestId });
      throw Errors.rateLimited(ipHit.retryAfter);
    }
    return this.sessions.rotate(refreshToken, { ip, requestId });
  }

  async logout(sessionId: string, personId: string, requestId?: string): Promise<void> {
    await this.sessions.revokeSession(sessionId, personId, requestId);
  }

  async logoutAll(personId: string, requestId?: string): Promise<void> {
    await this.sessions.revokeAll(personId, requestId);
  }

  private async ensurePerson(challenge: {
    personId: string | null;
    identifierType: IdentifierType;
    identifierNormalized: string;
  }) {
    if (challenge.personId) {
      const person = await this.prisma.person.findUniqueOrThrow({
        where: { id: challenge.personId },
        include: { account: true },
      });
      if (!person.account) {
        throw Errors.accountDenied();
      }
      if (person.status === 'PENDING') {
        const updated = await this.prisma.person.update({
          where: { id: person.id },
          data: { status: 'ACTIVE' },
        });
        return { person: updated, account: person.account, created: false };
      }
      return { person, account: person.account, created: false };
    }

    const personId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.person.create({
        data: {
          id: personId,
          status: 'ACTIVE',
          account: { create: { id: uuidv7(), status: 'ACTIVE' } },
          identifiers: {
            create: {
              id: uuidv7(),
              type: challenge.identifierType,
              valueNormalized: challenge.identifierNormalized,
              verifiedAt: new Date(),
            },
          },
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'USER_REGISTERED',
        aggregateType: 'Person',
        aggregateId: personId,
        producer: 'identity',
        payload: { person_id: personId },
        actorId: personId,
        occurrenceKey: `registered`,
      });
    });
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      include: { account: true },
    });
    if (!person.account) {
      throw Errors.accountDenied();
    }
    return { person, account: person.account, created: true };
  }

  private assertCanSignIn(
    personStatus: PersonStatus,
    accountStatus: AccountStatus,
    lockedUntil: Date | null,
  ): void {
    if (personStatus === 'DISABLED' || personStatus === 'PENDING_DELETION') {
      throw Errors.accountDenied();
    }
    if (accountStatus !== 'ACTIVE') {
      throw Errors.accountDenied();
    }
    if (lockedUntil && lockedUntil > new Date()) {
      throw Errors.accountDenied();
    }
  }
}
