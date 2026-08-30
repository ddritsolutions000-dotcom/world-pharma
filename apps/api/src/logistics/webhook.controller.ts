import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LogisticsService } from './logistics.service';

@Controller('webhooks/carriers')
export class CarrierWebhookController {
  constructor(private readonly logistics: LogisticsService) {}

  @Post(':carrierId')
  ingest(
    @Param('carrierId') carrierId: string,
    @Headers('x-sandbox-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    return this.logistics.ingestWebhook(carrierId, raw, signature);
  }
}
