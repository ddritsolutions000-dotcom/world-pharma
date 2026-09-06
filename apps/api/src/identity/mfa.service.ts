import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAudience } from '@prisma/client';
import { AppEnv } from '@world-pharma/config';
import { hmacSha256Hex, randomToken, sha256Hex, uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { authTenantContext } from '../tenancy/build-tenant-context';
import { COMPANY_ROLE_CODES, isCompanyRole } from './authority';
import { RateLimitService } from './rate-limit.service';
import { decryptSecret, encryptSecret } from './secret-cipher';
import { SecurityEventsService } from './security-events.service';
import { buildOtpAuthUri, currentTotpCode, generateTotpSecret, verifyTotpCode } from './totp';
import { TokenService, type MfaPendingClaims } from './token.service';

const MFA_REQUIRED_ROLES = new Set(['super_admin', 'global_admin', 'company_security']);

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly events: SecurityEventsService,
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private withAuthTenant<T>(personId: string, fn: () => Promise<T>): Promise<T> {
    return this.prisma.runWithTenant(authTenantContext(personId), fn);
  }

  async hasActiveTotp(accountId: string, personId?: string): Promise<boolean> {
    const query = async () => {
      const row = await this.prisma.totpSecret.findFirst({
        where: { accountId, confirmedAt: { not: null }, revokedAt: null },
      });
      return Boolean(row);
    };
    if (personId) {
      return this.withAuthTenant(personId, query);
    }
    return query();
  }

  isPolicyRequired(input: {
    mfaRequired: boolean;
    roles: string[];
    audience: JwtAudience;
  }): boolean {
    if (input.mfaRequired) {
      return true;
    }
    if (input.audience !== 'admin') {
      return false;
    }
    return input.roles.some((role) => MFA_REQUIRED_ROLES.has(role));
  }

  /** True when development/test login MFA is turned off via AUTH_MFA_ENABLED (default false). Never true in staging/production. */
  isLoginMfaDisabledByEnvironment(): boolean {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    if (nodeEnv === 'production' || nodeEnv === 'staging') {
      return false;
    }
    return !this.config.get('AUTH_MFA_ENABLED', { infer: true });
  }

  isEffectivePolicyRequired(input: {
    mfaRequired: boolean;
    roles: string[];
    audience: JwtAudience;
  }): boolean {
    if (this.isLoginMfaDisabledByEnvironment()) {
      return false;
    }
    return this.isPolicyRequired(input);
  }

  resolveLoginMfaGate(input: {
    mfaRequired: boolean;
    roles: string[];
    audience: JwtAudience;
    mfaEnrolled: boolean;
  }): 'none' | 'enroll' | 'verify' {
    if (this.isLoginMfaDisabledByEnvironment()) {
      return 'none';
    }
    const policyRequired = this.isPolicyRequired({
      mfaRequired: input.mfaRequired,
      roles: input.roles,
      audience: input.audience,
    });
    if (policyRequired && !input.mfaEnrolled) {
      return 'enroll';
    }
    if (policyRequired || input.mfaEnrolled) {
      return 'verify';
    }
    return 'none';
  }

  async statusForPerson(personId: string) {
    return this.withAuthTenant(personId, async () => {
      const person = await this.prisma.person.findUnique({
        where: { id: personId },
        include: { account: true },
      });
      if (!person?.account) {
        throw Errors.unauthorized();
      }
      const enrolled = await this.hasActiveTotp(person.account.id, personId);
      const recoveryRemaining = await this.prisma.recoveryCode.count({
        where: { personId, usedAt: null },
      });
      return {
        enrolled,
        required: person.account.mfaRequired,
        recovery_codes_remaining: recoveryRemaining,
      };
    });
  }

  parseMfaToken(token: string): MfaPendingClaims {
    try {
      return this.tokens.verifyMfaPending(token);
    } catch {
      throw Errors.mfaInvalid();
    }
  }

  async startEnrollment(mfaToken: string, requestId?: string) {
    const claims = this.parseMfaToken(mfaToken);
    return this.withAuthTenant(claims.sub, async () => {
      const person = await this.prisma.person.findUnique({
        where: { id: claims.sub },
        include: { account: true, identifiers: true },
      });
      if (!person?.account) {
        throw Errors.unauthorized();
      }
      const email = person.identifiers.find((row) => row.type === 'EMAIL')?.valueNormalized ?? person.id;
      const secret = generateTotpSecret();
      const pepper = this.config.get('OTP_PEPPER', { infer: true });
      await this.prisma.totpSecret.updateMany({
        where: { accountId: person.account.id, revokedAt: null, confirmedAt: null },
        data: { revokedAt: new Date() },
      });
      const row = await this.prisma.totpSecret.create({
        data: {
          id: uuidv7(),
          personId: person.id,
          accountId: person.account.id,
          secretCipher: encryptSecret(secret, pepper),
        },
      });
      const issuer = 'World Pharma';
      await this.events.emit({
        type: 'MFA_ENABLED',
        outcome: 'success',
        personId: person.id,
        requestId,
        metadata: { stage: 'enrollment_started', totp_id: row.id },
      });
      const revealDev =
        this.config.get('AUTH_DEV_REVEAL_OTP', { infer: true }) &&
        this.config.get('NODE_ENV', { infer: true }) === 'development';
      return {
        enrollment_id: row.id,
        otpauth_uri: buildOtpAuthUri({ secret, issuer, account: email }),
        digits: 6,
        period_seconds: 30,
        ...(revealDev ? { dev_totp_code: currentTotpCode(secret) } : {}),
      };
    });
  }

  async confirmEnrollment(mfaToken: string, code: string, requestId?: string) {
    const claims = this.parseMfaToken(mfaToken);
    return this.withAuthTenant(claims.sub, async () => {
      const pepper = this.config.get('OTP_PEPPER', { infer: true });
      const pending = await this.prisma.totpSecret.findFirst({
        where: { personId: claims.sub, confirmedAt: null, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!pending) {
        throw Errors.mfaInvalid();
      }
      const secret = decryptSecret(pending.secretCipher, pepper);
      if (!verifyTotpCode(secret, code)) {
        await this.events.emit({
          type: 'MFA_FAILED',
          outcome: 'failure',
          personId: claims.sub,
          requestId,
        });
        throw Errors.mfaInvalid();
      }
      const now = new Date();
      await this.prisma.totpSecret.update({
        where: { id: pending.id },
        data: { enrolledAt: now, confirmedAt: now },
      });
      const recovery = await this.issueRecoveryCodes(claims.sub);
      await this.events.emit({
        type: 'MFA_ENABLED',
        outcome: 'success',
        personId: claims.sub,
        requestId,
        metadata: { stage: 'enrollment_confirmed', totp_id: pending.id },
      });
      return { enrolled: true, recovery_codes: recovery };
    });
  }

  async verifyLogin(input: {
    mfaToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }) {
    const claims = this.parseMfaToken(input.mfaToken);
    const limit = process.env['NODE_ENV'] === 'test' ? 1000 : 10;
    const hit = await this.rateLimit.hit(`mfa:verify:${claims.sub}`, limit, 900);
    if (!hit.allowed) {
      await this.events.emit({ type: 'MFA_FAILED', outcome: 'failure', personId: claims.sub, requestId: input.requestId });
      throw Errors.mfaLocked();
    }
    return this.withAuthTenant(claims.sub, async () => {
      const person = await this.prisma.person.findUnique({
        where: { id: claims.sub },
        include: { account: true },
      });
      if (!person?.account) {
        throw Errors.unauthorized();
      }
      const pepper = this.config.get('OTP_PEPPER', { infer: true });
      const active = await this.prisma.totpSecret.findFirst({
        where: { accountId: person.account.id, confirmedAt: { not: null }, revokedAt: null },
        orderBy: { confirmedAt: 'desc' },
      });
      let verified = false;
      if (active) {
        const secret = decryptSecret(active.secretCipher, pepper);
        verified = verifyTotpCode(secret, input.code);
      }
      if (!verified) {
        verified = await this.consumeRecoveryCode(claims.sub, input.code);
      }
      if (!verified) {
        await this.events.emit({
          type: 'MFA_FAILED',
          outcome: 'failure',
          personId: claims.sub,
          requestId: input.requestId,
        });
        throw Errors.mfaInvalid();
      }
      await this.events.emit({
        type: 'MFA_VERIFIED',
        outcome: 'success',
        personId: claims.sub,
        requestId: input.requestId,
      });
      return {
        personId: claims.sub,
        audience: claims.aud,
        membershipId: claims.membership_id,
        roles: claims.roles ?? [],
        countryId: claims.country_id,
        organizationId: claims.organization_id,
        regionId: claims.region_id,
        legalEntityId: claims.legal_entity_id,
        accountId: person.account.id,
        ip: input.ip,
        userAgent: input.userAgent,
      };
    });
  }

  async regenerateRecoveryCodes(personId: string, actorId: string, requestId?: string) {
    return this.withAuthTenant(personId, async () => {
      if (personId !== actorId) {
        const rbac = await this.prisma.membership.findFirst({
          where: { personId: actorId, status: 'ACTIVE', role: { code: { in: [...COMPANY_ROLE_CODES] } } },
          include: { role: true },
        });
        if (!rbac || !['super_admin', 'global_admin', 'company_security'].includes(rbac.role.code)) {
          throw Errors.forbidden('Recovery codes can only be regenerated by the account owner or security ops');
        }
      }
      const enrolled = await this.prisma.totpSecret.findFirst({
        where: { personId, confirmedAt: { not: null }, revokedAt: null },
      });
      if (!enrolled) {
        throw Errors.validation('MFA is not enrolled for this account');
      }
      const codes = await this.issueRecoveryCodes(personId);
      await this.events.emit({
        type: 'MFA_ENABLED',
        outcome: 'success',
        personId: actorId,
        requestId,
        metadata: { stage: 'recovery_regenerated', target_person_id: personId },
      });
      return { recovery_codes: codes };
    });
  }

  private async issueRecoveryCodes(personId: string): Promise<string[]> {
    await this.prisma.recoveryCode.deleteMany({ where: { personId, usedAt: null } });
    const codes: string[] = [];
    const rows: { id: string; personId: string; codeHash: string }[] = [];
    for (let i = 0; i < 10; i += 1) {
      const raw = randomToken(5).slice(0, 10).toUpperCase();
      codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
      rows.push({ id: uuidv7(), personId, codeHash: sha256Hex(raw.replace(/-/g, '')) });
    }
    await this.prisma.recoveryCode.createMany({ data: rows });
    return codes;
  }

  private async consumeRecoveryCode(personId: string, code: string): Promise<boolean> {
    const normalized = code.replace(/\s|-/g, '').toUpperCase();
    if (normalized.length < 8) {
      return false;
    }
    const hash = sha256Hex(normalized);
    const row = await this.prisma.recoveryCode.findFirst({
      where: { personId, codeHash: hash, usedAt: null },
    });
    if (!row) {
      return false;
    }
    await this.prisma.recoveryCode.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return true;
  }

  assertCompanyRoleMfa(roles: string[]): boolean {
    return roles.some((role) => isCompanyRole(role) && MFA_REQUIRED_ROLES.has(role));
  }

  async devTotpCodeForPerson(personId: string): Promise<string | undefined> {
    const revealDev =
      this.config.get('AUTH_DEV_REVEAL_OTP', { infer: true }) &&
      this.config.get('NODE_ENV', { infer: true }) === 'development';
    if (!revealDev) {
      return undefined;
    }
    return this.withAuthTenant(personId, async () => {
      const pepper = this.config.get('OTP_PEPPER', { infer: true });
      const active = await this.prisma.totpSecret.findFirst({
        where: { personId, confirmedAt: { not: null }, revokedAt: null },
        orderBy: { confirmedAt: 'desc' },
      });
      if (!active) {
        return undefined;
      }
      return currentTotpCode(decryptSecret(active.secretCipher, pepper));
    });
  }
}
