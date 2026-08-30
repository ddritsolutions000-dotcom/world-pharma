import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../common/metrics.service';
import { redactText } from '../common/redact';
import { SecurityEventsService } from '../identity/security-events.service';

export type AbuseSignal =
  | 'otp_spam'
  | 'brute_force'
  | 'credential_stuffing'
  | 'account_enumeration'
  | 'promo_abuse'
  | 'affiliate_abuse'
  | 'review_abuse'
  | 'fake_partner_application'
  | 'scraping'
  | 'suspicious_api';

@Injectable()
export class AbuseService {
  private readonly logger = new Logger(AbuseService.name);

  constructor(
    private readonly events: SecurityEventsService,
    private readonly metrics: MetricsService,
  ) {}

  async record(signal: AbuseSignal, requestId?: string, personId?: string): Promise<void> {
    this.metrics.increment('abuse_signals_total', { signal });
    this.logger.warn(redactText(JSON.stringify({ event: 'suspicious_request', signal, request_id: requestId })));
    await this.events.emit({
      type: 'SUSPICIOUS_REQUEST',
      outcome: 'failure',
      requestId,
      personId,
      metadata: { signal },
    });
  }
}
