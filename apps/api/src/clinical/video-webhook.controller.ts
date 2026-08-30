import { Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { VideoService } from './video.service';

@Controller('webhooks/video')
export class VideoWebhookController {
  constructor(private readonly video: VideoService) {}

  @Post('livekit')
  ingest(
    @Headers() headers: Record<string, string | undefined>,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    return this.video.handleWebhook(headers, raw);
  }
}
