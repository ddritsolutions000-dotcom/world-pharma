import { sign, verify } from 'jsonwebtoken';
import { Errors } from '../common/problem';

export function livekitConfig(): { url: string; apiKey: string; apiSecret: string } | null {
  const url = process.env['LIVEKIT_URL']?.trim();
  const apiKey = process.env['LIVEKIT_API_KEY']?.trim();
  const apiSecret = process.env['LIVEKIT_API_SECRET']?.trim();
  if (!url || !apiKey || !apiSecret) {
    return null;
  }
  return { url, apiKey, apiSecret };
}

export function signLivekitParticipantToken(input: {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  role: 'doctor' | 'customer';
  ttlSeconds: number;
}): { token: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + input.ttlSeconds;
  const token = sign(
    {
      iss: input.apiKey,
      sub: input.identity,
      name: input.role,
      nbf: now - 5,
      video: {
        room: input.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomRecord: false,
        roomAdmin: input.role === 'doctor',
      },
    },
    input.apiSecret,
    { algorithm: 'HS256', keyid: input.apiKey, expiresIn: input.ttlSeconds },
  );
  return { token, expiresAt: new Date(exp * 1000) };
}

export function verifyLivekitWebhook(
  apiKey: string,
  apiSecret: string,
  authorization: string | undefined,
  maxAgeSeconds = 300,
): { ok: true; issuedAt: Date } | { ok: false } {
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false };
  }
  try {
    const decoded = verify(authorization.slice('Bearer '.length), apiSecret, { algorithms: ['HS256'] }) as {
      iss?: string;
      iat?: number;
      nbf?: number;
    };
    if (decoded.iss !== apiKey) {
      return { ok: false };
    }
    const issuedSec = typeof decoded.iat === 'number' ? decoded.iat : typeof decoded.nbf === 'number' ? decoded.nbf : null;
    if (issuedSec == null) {
      return { ok: false };
    }
    const issuedAt = new Date(issuedSec * 1000);
    if (Math.abs(Date.now() - issuedAt.getTime()) > maxAgeSeconds * 1000) {
      throw Errors.problem(409, 'WEBHOOK_REPLAY', 'Stale webhook', 'Timestamp is outside the replay window.');
    }
    return { ok: true, issuedAt };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    throw Errors.unauthorized('Invalid video webhook signature');
  }
}
