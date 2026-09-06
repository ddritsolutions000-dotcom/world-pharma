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
  normalizeEmail,
  normalizeIdentifier,
  randomOtpDigits,
  redactIdentifier,
  safeEqualHex,
  sha256Hex,
  uuidv7,
  verifyPassword,
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
import { MfaService } from './mfa.service';
import { TokenService } from './token.service';
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
    private readonly mfa: MfaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Partner login step 1: User ID (email) + password → OTP to registered mobile.
   * Session is issued only after existing `verifyOtp` (and MFA when gated).
   */
  async beginPasswordLogin(input: {
    identifier: string;
    password: string;
    countryCode?: string;
    ip?: string;
    requestId?: string;
  }): Promise<{
    challengeId: string;
    expiresAt: string;
    resendAvailableAt: string;
    maskedPhone: string;
    channel: 'SMS';
    next: 'otp';
    devCode?: string;
  }> {
    const email = normalizeEmail(input.identifier);
    if (!email.includes('@')) {
      throw Errors.validation('Use your registered email / User ID.');
    }

    const pepper = this.config.get('OTP_PEPPER', { infer: true });
    const loginIpLimit =
      process.env['NODE_ENV'] === 'test' || process.env['AUTH_DEV_REVEAL_OTP'] === 'true' ? 1000 : 20;
    const ipHit = await this.rateLimit.hit(`password:ip:${input.ip ?? 'unknown'}`, loginIpLimit, 900);
    if (!ipHit.allowed) {
      throw Errors.rateLimited(ipHit.retryAfter);
    }

    const emailId = await this.prisma.accountIdentifier.findUnique({
      where: {
        type_valueNormalized: { type: IdentifierType.EMAIL, valueNormalized: email },
      },
      include: {
        person: {
          include: {
            account: true,
            identifiers: { where: { type: IdentifierType.PHONE } },
          },
        },
      },
    });

    const account = emailId?.person.account ?? null;
    const genericFail = () =>
      Errors.unauthorized('Invalid User ID or password.');

    if (!emailId || !account) {
      await this.events.emit({
        type: 'LOGIN_FAILED',
        outcome: 'failure',
        requestId: input.requestId,
        metadata: { reason: 'unknown_identifier', stage: 'password' },
      });
      throw genericFail();
    }

    try {
      this.assertCanSignIn(emailId.person.status, account.status, account.lockedUntil);
    } catch {
      throw Errors.accountDenied();
    }

    const passwordOk = await verifyPassword(input.password, account.passwordHash);
    if (!passwordOk) {
      const failures = account.failedLoginCount + 1;
      const lockAfter = 5;
      const lockedUntil =
        failures >= lockAfter ? new Date(Date.now() + 15 * 60 * 1000) : account.lockedUntil;
      await this.prisma.account.update({
        where: { id: account.id },
        data: { failedLoginCount: failures, lockedUntil },
      });
      await this.events.emit({
        type: 'LOGIN_FAILED',
        outcome: 'failure',
        personId: emailId.personId,
        requestId: input.requestId,
        ipHash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
        metadata: { reason: 'bad_password', stage: 'password', failures },
      });
      throw genericFail();
    }

    const phoneRow = emailId.person.identifiers[0];
    if (!phoneRow?.valueNormalized) {
      await this.events.emit({
        type: 'LOGIN_FAILED',
        outcome: 'failure',
        personId: emailId.personId,
        requestId: input.requestId,
        metadata: { reason: 'no_registered_mobile', stage: 'password' },
      });
      throw Errors.validation(
        'Registered mobile is required for login. Add a verified phone on your partner profile or contact support.',
      );
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { failedLoginCount: 0 },
    });

    const otp = await this.requestOtp({
      identifier: phoneRow.valueNormalized,
      purpose: 'STEP_UP',
      channel: 'SMS',
      countryCode: input.countryCode,
      ip: input.ip,
      requestId: input.requestId,
    });

    // Bind challenge to the person who passed password (phone may already set personId).
    await this.prisma.otpChallenge.update({
      where: { id: otp.challengeId },
      data: { personId: emailId.personId },
    });

    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: emailId.personId,
      requestId: input.requestId,
      metadata: {
        stage: 'password_ok_otp_sent',
        phone: redactIdentifier(phoneRow.valueNormalized, 'PHONE'),
      },
    });

    return {
      challengeId: otp.challengeId,
      expiresAt: otp.expiresAt,
      resendAvailableAt: otp.resendAvailableAt,
      maskedPhone: redactIdentifier(phoneRow.valueNormalized, 'PHONE'),
      channel: 'SMS',
      next: 'otp',
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    };
  }

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

    // Production OTP is fail-closed: never silently fall back to mock/console.
    const { readCommunicationEnvironment } = await import('./communication.config');
    if (readCommunicationEnvironment() === 'production') {
      const { assertProductionOtpMessagingInitiationAllowed } = await import(
        './otp-messaging-production-activation-path'
      );
      assertProductionOtpMessagingInitiationAllowed('auth.requestOtp');
      const { assertProductionOtpAvailable } = await import('./production-otp-gate');
      await assertProductionOtpAvailable(this.prisma, {
        countryCode: input.countryCode,
      });
    }

    const ipLimit =
      process.env['NODE_ENV'] === 'test' || process.env['AUTH_DEV_REVEAL_OTP'] === 'true' ? 1000 : 10;
    const ipHit = await this.rateLimit.hit(`otp:ip:${input.ip ?? 'unknown'}`, ipLimit, 900);
    const idHit = await this.rateLimit.hit(
      `otp:id:${parsed.value}`,
      process.env['AUTH_DEV_REVEAL_OTP'] === 'true' ? 1000 : 5,
      900,
    );
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

    // Invalidate prior pending challenges for same recipient+purpose (replay protection).
    await this.prisma.otpChallenge.updateMany({
      where: {
        identifierNormalized: parsed.value,
        purpose,
        status: 'PENDING',
      },
      data: { status: 'EXPIRED' },
    });

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
        countryCode: input.countryCode,
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
  }): Promise<
    | {
        kind: 'session';
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        tokenType: 'Bearer';
        personId: string;
        sessionId: string;
      }
    | {
        kind: 'mfa';
        mfaRequired: true;
        mfaEnrollmentRequired: boolean;
        mfaToken: string;
        personId: string;
        devTotpCode?: string;
      }
  > {
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
    if (challenge.status === 'CONSUMED') {
      await this.events.emit({
        type: 'OTP_FAILED',
        outcome: 'failure',
        personId: challenge.personId ?? undefined,
        requestId: input.requestId,
        metadata: { reason: 'replay_consumed' },
      });
      throw Errors.otpInvalid();
    }
    if (challenge.status !== 'PENDING' || challenge.expiresAt <= new Date()) {
      if (challenge.status === 'PENDING') {
        await this.prisma.runWithTenant(
          authTenantContext(),
          async () => {
            await this.prisma.otpChallenge.update({
              where: { id: challenge.id },
              data: { status: 'EXPIRED' },
            });
          },
          { fresh: true },
        );
      }
      throw Errors.otpExpired();
    }

    // Purpose binding: challenge purpose is fixed at issue time; verify cannot change it.
    const expected = hmacSha256Hex(pepper, `${challenge.id}:${input.code.trim()}`);
    // Recipient binding: HMAC includes challengeId which is bound to identifierNormalized.
    if (!safeEqualHex(challenge.codeHmac, expected)) {
      const attempts = challenge.attemptCount + 1;
      const locked = attempts >= challenge.maxAttempts;
      await this.prisma.runWithTenant(
        authTenantContext(),
        async () => {
          await this.prisma.otpChallenge.update({
            where: { id: challenge.id },
            data: { attemptCount: attempts, status: locked ? 'LOCKED' : 'PENDING' },
          });
        },
        { fresh: true },
      );
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
    } else if (input.audience === 'admin') {
      await this.events.emit({
        type: 'LOGIN_FAILED',
        outcome: 'failure',
        personId: person.id,
        requestId: input.requestId,
        metadata: { reason: 'not_company_admin' },
      });
      throw Errors.forbidden('This account is not authorized for Main Admin.');
    } else if (input.audience === 'partner_applicant') {
      audience = 'partner_applicant';
    } else if (input.audience === 'doctor') {
      const doctorPartner = await this.prisma.partner.findFirst({
        where: { personId: person.id, partnerTypeCode: 'DOCTOR' },
        select: { id: true },
      });
      if (!doctorPartner) {
        await this.events.emit({
          type: 'LOGIN_FAILED',
          outcome: 'failure',
          personId: person.id,
          requestId: input.requestId,
          metadata: { reason: 'not_doctor_partner' },
        });
        throw Errors.forbidden(
          'This account is not authorized for the Doctor portal. Use a verified doctor partner email (sandbox: sandbox-doctor@dev.local).',
        );
      }
      audience = 'doctor';
    }

    const membership = rbac.membershipId
      ? await this.prisma.membership.findUnique({ where: { id: rbac.membershipId } })
      : null;

    await this.prisma.accountIdentifier.updateMany({
      where: {
        personId: person.id,
        type: challenge.identifierType,
        valueNormalized: challenge.identifierNormalized,
      },
      data: { verifiedAt: new Date() },
    });
    await this.events.emit({
      type: 'OTP_VERIFIED',
      outcome: 'success',
      personId: person.id,
      requestId: input.requestId,
    });

    const mfaEnrolled = await this.mfa.hasActiveTotp(account.id, person.id);
    const mfaGate = this.mfa.resolveLoginMfaGate({
      mfaRequired: account.mfaRequired,
      roles: rbac.roles,
      audience,
      mfaEnrolled,
    });
    if (mfaGate === 'enroll') {
      const mfaToken = this.tokens.signMfaPending({
        sub: person.id,
        aud: audience,
        enrollment: true,
        membership_id: rbac.membershipId,
        roles: rbac.roles,
        country_id: membership?.countryId ?? person.primaryCountryId ?? undefined,
        organization_id: membership?.organizationId ?? undefined,
        region_id: membership?.regionId ?? undefined,
        legal_entity_id: membership?.legalEntityId ?? undefined,
        ip_hash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
        user_agent_hash: input.userAgent ? sha256Hex(input.userAgent) : undefined,
      });
      await this.events.emit({
        type: 'LOGIN_SUCCESS',
        outcome: 'success',
        personId: person.id,
        requestId: input.requestId,
        metadata: { stage: 'mfa_enrollment_required' },
      });
      return {
        kind: 'mfa',
        mfaRequired: true,
        mfaEnrollmentRequired: true,
        mfaToken,
        personId: person.id,
      };
    }
    if (mfaGate === 'verify') {
      const mfaToken = this.tokens.signMfaPending({
        sub: person.id,
        aud: audience,
        enrollment: false,
        membership_id: rbac.membershipId,
        roles: rbac.roles,
        country_id: membership?.countryId ?? person.primaryCountryId ?? undefined,
        organization_id: membership?.organizationId ?? undefined,
        region_id: membership?.regionId ?? undefined,
        legal_entity_id: membership?.legalEntityId ?? undefined,
        ip_hash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
        user_agent_hash: input.userAgent ? sha256Hex(input.userAgent) : undefined,
      });
      await this.events.emit({
        type: 'LOGIN_SUCCESS',
        outcome: 'success',
        personId: person.id,
        requestId: input.requestId,
        metadata: { stage: 'mfa_required' },
      });
      return {
        kind: 'mfa',
        mfaRequired: true,
        mfaEnrollmentRequired: false,
        mfaToken,
        personId: person.id,
        devTotpCode: await this.mfa.devTotpCodeForPerson(person.id),
      };
    }

    const tokens = await this.completeLogin({
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
      created,
    });

    return {
      kind: 'session',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      personId: person.id,
      sessionId: tokens.sessionId,
    };
  }

  async completeLoginAfterMfa(input: {
    mfaToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }) {
    const verified = await this.mfa.verifyLogin({
      mfaToken: input.mfaToken,
      code: input.code,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });
    const tokens = await this.completeLogin({
      personId: verified.personId,
      accountId: verified.accountId,
      audience: verified.audience,
      membershipId: verified.membershipId,
      roles: verified.roles,
      countryId: verified.countryId,
      organizationId: verified.organizationId,
      regionId: verified.regionId,
      legalEntityId: verified.legalEntityId,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      created: false,
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer' as const,
      personId: verified.personId,
      sessionId: tokens.sessionId,
    };
  }

  private async completeLogin(input: {
    personId: string;
    accountId: string;
    audience: JwtAudience;
    membershipId?: string;
    roles: string[];
    countryId?: string;
    organizationId?: string;
    regionId?: string;
    legalEntityId?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    created: boolean;
  }) {
    const tokens = await this.sessions.issue({
      personId: input.personId,
      accountId: input.accountId,
      audience: input.audience,
      membershipId: input.membershipId,
      roles: input.roles,
      countryId: input.countryId,
      organizationId: input.organizationId,
      regionId: input.regionId,
      legalEntityId: input.legalEntityId,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    });

    await this.prisma.account.update({
      where: { id: input.accountId },
      data: { lastLoginAt: new Date(), failedLoginCount: 0 },
    });
    await this.events.emit({
      type: input.created ? 'USER_REGISTERED' : 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: input.personId,
      sessionId: tokens.sessionId,
      requestId: input.requestId,
    });
    return tokens;
  }

  async bootstrap(personId: string, sessionId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        identifiers: true,
        account: true,
      },
    });
    if (!person?.account) {
      throw Errors.unauthorized();
    }
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.personId !== personId) {
      throw Errors.unauthorized();
    }
    const rbac = await this.rbac.permissionsForPerson(personId);
    const mfa = await this.mfa.statusForPerson(personId);
    const policyRequiresMfa = this.mfa.isEffectivePolicyRequired({
      mfaRequired: person.account.mfaRequired,
      roles: rbac.roles,
      audience: session.audience,
    });
    return {
      authenticated: true,
      person_id: person.id,
      status: person.status,
      account_status: person.account.status,
      preferred_locale: person.preferredLocale,
      primary_country_id: person.primaryCountryId,
      identifiers: person.identifiers.map((row) => ({
        type: row.type,
        value: redactIdentifier(row.valueNormalized, row.type),
        verified: Boolean(row.verifiedAt),
      })),
      roles: rbac.roles,
      permissions: rbac.permissions,
      audience: session.audience,
      session: {
        id: session.id,
        status: session.status,
        audience: session.audience,
        created_at: session.createdAt.toISOString(),
        last_seen_at: session.lastSeenAt.toISOString(),
        expires_at: session.expiresAt.toISOString(),
      },
      mfa: {
        ...mfa,
        policy_required: policyRequiresMfa,
      },
      last_login_at: person.account.lastLoginAt?.toISOString() ?? null,
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

  /** Sprint 45 — production OTP availability (fail-closed evaluation). */
  async evaluateProductionOtpAvailable(countryCode: string) {
    const { evaluateProductionOtpAvailable } = await import('./production-otp-gate');
    return evaluateProductionOtpAvailable(this.prisma, { countryCode });
  }

  async assertProductionOtpAvailable(countryCode: string) {
    const { assertProductionOtpAvailable } = await import('./production-otp-gate');
    return assertProductionOtpAvailable(this.prisma, { countryCode });
  }

  /**
   * Admin OTP challenge inspection — never returns plaintext OTP or codeHmac.
   */
  async listOtpChallengesForAdmin(input: {
    countryCode?: string;
    limit?: number;
  }): Promise<{
    data: Array<{
      id: string;
      purpose: string;
      channel: string;
      status: string;
      masked_recipient: string;
      attempt_count: number;
      max_attempts: number;
      expires_at: string;
      consumed_at: string | null;
      created_at: string;
      provider_status: 'SANDBOX' | 'EXTERNAL_GATED';
    }>;
    sandbox: true;
  }> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const rows = await this.prisma.otpChallenge.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        purpose: row.purpose,
        channel: row.channel,
        status: row.status,
        masked_recipient: redactIdentifier(row.identifierNormalized, row.identifierType),
        attempt_count: row.attemptCount,
        max_attempts: row.maxAttempts,
        expires_at: row.expiresAt.toISOString(),
        consumed_at: row.consumedAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        provider_status: 'SANDBOX' as const,
      })),
      sandbox: true,
    };
  }
}
