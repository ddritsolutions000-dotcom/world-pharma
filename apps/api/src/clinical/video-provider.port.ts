export type VideoParticipantRoleName = 'doctor' | 'customer';

export interface VideoRoomHandle {
  provider: string;
  roomId: string;
  wsUrl: string;
  recordingEnabled: false;
}

export interface VideoParticipantToken {
  token: string;
  expiresAt: Date;
  identity: string;
  role: VideoParticipantRoleName;
}

export abstract class VideoProviderPort {
  abstract readonly name: string;
  abstract isConfigured(): boolean;
  abstract connectionUrl(): string;
  abstract createSession(input: { roomId: string }): Promise<VideoRoomHandle>;
  abstract generateParticipantToken(input: {
    roomId: string;
    identity: string;
    role: VideoParticipantRoleName;
    ttlSeconds: number;
  }): Promise<VideoParticipantToken>;
  abstract endSession(roomId: string): Promise<void>;
  abstract getSessionStatus(roomId: string): Promise<'active' | 'ended' | 'unknown'>;
  abstract removeParticipant?(roomId: string, identity: string): Promise<void>;
  abstract verifyWebhook?(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): { eventId: string; eventType: string; roomId?: string; occurredAt?: Date } | null;
}
