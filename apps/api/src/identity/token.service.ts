import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAudience } from '@prisma/client';
import { AppEnv } from '@world-pharma/config';
import { sign, verify } from 'jsonwebtoken';

export interface AccessClaims {
  sub: string;
  sid: string;
  aud: JwtAudience;
  iss: string;
  membership_id?: string;
  roles: string[];
  country_id?: string;
  organization_id?: string;
  region_id?: string;
  legal_entity_id?: string;
  ver: number;
}

export interface MfaPendingClaims {
  sub: string;
  aud: JwtAudience;
  iss: string;
  purpose: 'mfa_pending';
  enrollment: boolean;
  membership_id?: string;
  roles: string[];
  country_id?: string;
  organization_id?: string;
  region_id?: string;
  legal_entity_id?: string;
  ip_hash?: string;
  user_agent_hash?: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  signAccess(claims: Omit<AccessClaims, 'iss'>): string {
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const iss = this.config.get('JWT_ISSUER', { infer: true });
    const ttl = this.config.get('AUTH_ACCESS_TTL_SECONDS', { infer: true });
    return sign(
      { ...claims },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: ttl,
        issuer: iss,
      },
    );
  }

  verifyAccess(token: string): AccessClaims {
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const iss = this.config.get('JWT_ISSUER', { infer: true });
    const decoded = verify(token, secret, {
      algorithms: ['HS256'],
      issuer: iss,
    });
    if (typeof decoded === 'string') {
      throw new Error('invalid_token');
    }
    return decoded as AccessClaims;
  }

  signMfaPending(claims: Omit<MfaPendingClaims, 'iss' | 'purpose'> & { enrollment?: boolean }): string {
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const iss = this.config.get('JWT_ISSUER', { infer: true });
    return sign(
      {
        ...claims,
        purpose: 'mfa_pending',
        enrollment: claims.enrollment === true,
        roles: claims.roles ?? [],
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: 300,
        issuer: iss,
      },
    );
  }

  verifyMfaPending(token: string): MfaPendingClaims {
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    const iss = this.config.get('JWT_ISSUER', { infer: true });
    const decoded = verify(token, secret, {
      algorithms: ['HS256'],
      issuer: iss,
      maxAge: 300,
    });
    if (typeof decoded === 'string' || (decoded as MfaPendingClaims).purpose !== 'mfa_pending') {
      throw new Error('invalid_mfa_token');
    }
    return decoded as MfaPendingClaims;
  }
}
