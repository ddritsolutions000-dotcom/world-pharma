import { Injectable, Logger } from '@nestjs/common';
import { Errors } from '../common/problem';
import {
  VideoParticipantToken,
  VideoProviderPort,
  VideoRoomHandle,
  type VideoParticipantRoleName,
} from './video-provider.port';
import { livekitConfig, signLivekitParticipantToken, verifyLivekitWebhook } from './livekit-token';

@Injectable()
export class LiveKitVideoProvider extends VideoProviderPort {
  readonly name = 'livekit';
  private readonly logger = new Logger(LiveKitVideoProvider.name);

  isConfigured(): boolean {
    return livekitConfig() !== null;
  }

  connectionUrl(): string {
    return livekitConfig()?.url ?? '';
  }

  async createSession(input: { roomId: string }): Promise<VideoRoomHandle> {
    const cfg = this.requireConfig();
    try {
      const serverToken = signLivekitParticipantToken({
        apiKey: cfg.apiKey,
        apiSecret: cfg.apiSecret,
        roomName: input.roomId,
        identity: 'server',
        role: 'doctor',
        ttlSeconds: 60,
      }).token;
      const res = await fetch(`${cfg.url.replace(/\/$/, '')}/twirp/livekit.RoomService/CreateRoom`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${serverToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: input.roomId,
          empty_timeout: 300,
          departure_timeout: 20,
          metadata: '',
        }),
      });
      if (!res.ok && res.status !== 409) {
        this.logger.warn(JSON.stringify({ event: 'livekit_create_room_failed', status: res.status }));
        throw Errors.problem(503, 'VIDEO_PROVIDER_UNAVAILABLE', 'Video provider unavailable', 'Video room could not be created.');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw Errors.problem(503, 'VIDEO_PROVIDER_UNAVAILABLE', 'Video provider unavailable', 'Video room could not be created.');
    }
    return {
      provider: this.name,
      roomId: input.roomId,
      wsUrl: cfg.url,
      recordingEnabled: false,
    };
  }

  async generateParticipantToken(input: {
    roomId: string;
    identity: string;
    role: VideoParticipantRoleName;
    ttlSeconds: number;
  }): Promise<VideoParticipantToken> {
    const cfg = this.requireConfig();
    const signed = signLivekitParticipantToken({
      apiKey: cfg.apiKey,
      apiSecret: cfg.apiSecret,
      roomName: input.roomId,
      identity: input.identity,
      role: input.role,
      ttlSeconds: input.ttlSeconds,
    });
    return { token: signed.token, expiresAt: signed.expiresAt, identity: input.identity, role: input.role };
  }

  async endSession(roomId: string): Promise<void> {
    const cfg = this.requireConfig();
    try {
      const serverToken = signLivekitParticipantToken({
        apiKey: cfg.apiKey,
        apiSecret: cfg.apiSecret,
        roomName: roomId,
        identity: 'server',
        role: 'doctor',
        ttlSeconds: 60,
      }).token;
      await fetch(`${cfg.url.replace(/\/$/, '')}/twirp/livekit.RoomService/DeleteRoom`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serverToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ room: roomId }),
      });
    } catch {
      this.logger.warn(JSON.stringify({ event: 'livekit_delete_room_failed' }));
    }
  }

  async getSessionStatus(): Promise<'active' | 'ended' | 'unknown'> {
    return 'unknown';
  }

  async removeParticipant(): Promise<void> {
    return;
  }

  verifyWebhook(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): { eventId: string; eventType: string; roomId?: string; occurredAt?: Date } | null {
    const cfg = livekitConfig();
    if (!cfg) {
      return null;
    }
    const verified = verifyLivekitWebhook(cfg.apiKey, cfg.apiSecret, headers['authorization']);
    if (!verified.ok) {
      return null;
    }
    const body = JSON.parse(rawBody) as {
      id?: string;
      event?: string;
      eventId?: string;
      createdAt?: string | number;
      room?: { name?: string };
    };
    let bodyStamp: Date | undefined;
    if (typeof body.createdAt === 'number') {
      bodyStamp = new Date(body.createdAt * (body.createdAt < 1e12 ? 1000 : 1));
    } else if (typeof body.createdAt === 'string') {
      const parsed = Date.parse(body.createdAt);
      if (Number.isFinite(parsed)) {
        bodyStamp = new Date(parsed);
      }
    }
    return {
      eventId: String(body.id ?? body.eventId ?? ''),
      eventType: String(body.event ?? ''),
      roomId: body.room?.name,
      occurredAt: bodyStamp ?? verified.issuedAt,
    };
  }

  private requireConfig() {
    const cfg = livekitConfig();
    if (!cfg) {
      throw Errors.problem(503, 'VIDEO_PROVIDER_UNAVAILABLE', 'Video provider unavailable', 'LiveKit credentials are not configured.');
    }
    return cfg;
  }
}
