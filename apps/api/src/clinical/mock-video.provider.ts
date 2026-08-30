import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  VideoParticipantToken,
  VideoProviderPort,
  VideoRoomHandle,
  type VideoParticipantRoleName,
} from './video-provider.port';

@Injectable()
export class MockVideoProvider extends VideoProviderPort {
  readonly name = 'mock';
  private readonly rooms = new Set<string>();

  isConfigured(): boolean {
    return true;
  }

  connectionUrl(): string {
    return 'wss://mock.video.local';
  }

  async createSession(input: { roomId: string }): Promise<VideoRoomHandle> {
    this.rooms.add(input.roomId);
    return {
      provider: this.name,
      roomId: input.roomId,
      wsUrl: 'wss://mock.video.local',
      recordingEnabled: false,
    };
  }

  async generateParticipantToken(input: {
    roomId: string;
    identity: string;
    role: VideoParticipantRoleName;
    ttlSeconds: number;
  }): Promise<VideoParticipantToken> {
    const token = `mock.${input.role}.${randomBytes(12).toString('hex')}`;
    return {
      token,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
      identity: input.identity,
      role: input.role,
    };
  }

  async endSession(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async getSessionStatus(roomId: string): Promise<'active' | 'ended' | 'unknown'> {
    return this.rooms.has(roomId) ? 'active' : 'ended';
  }

  async removeParticipant(): Promise<void> {
    return;
  }

  verifyWebhook(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): { eventId: string; eventType: string; roomId?: string; occurredAt?: Date } | null {
    if (headers['x-mock-video-webhook'] !== 'test') {
      return null;
    }
    const body = JSON.parse(rawBody) as {
      event_id?: string;
      event_type?: string;
      room_id?: string;
      ts?: string;
      occurred_at?: string;
    };
    if (!body.event_id || !body.event_type) {
      return null;
    }
    const stamp = body.ts ?? body.occurred_at;
    let occurredAt: Date | undefined;
    if (stamp) {
      const at = Date.parse(stamp);
      if (Number.isFinite(at)) {
        occurredAt = new Date(at);
      }
    }
    return {
      eventId: body.event_id,
      eventType: body.event_type,
      roomId: body.room_id,
      occurredAt,
    };
  }
}
