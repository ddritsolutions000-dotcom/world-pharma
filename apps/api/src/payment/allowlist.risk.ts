import { Injectable } from '@nestjs/common';
import { isLivePaymentEnabled, readPaymentEnvironment } from './payment.config';
import { RiskDecision, RiskPort, RiskSignals } from './risk.port';

/** Sandbox stub: always allow. Production live mode fail-closes without an approved risk adapter. */
@Injectable()
export class AllowlistRiskAdapter extends RiskPort {
  async assess(_signals: RiskSignals): Promise<RiskDecision> {
    if (readPaymentEnvironment() === 'production' && isLivePaymentEnabled()) {
      return { allow: false, requireSca: false, reason: 'Production risk adapter not configured' };
    }
    return { allow: true, requireSca: false };
  }
}
