import { Injectable } from '@nestjs/common';
import { CarrierPort, CarrierQuoteInput, CarrierQuoteResult } from './carrier.port';

/** TEST/SANDBOX stub. Makes zero network calls. */
@Injectable()
export class NoopCarrierAdapter extends CarrierPort {
  async quote(input: CarrierQuoteInput): Promise<CarrierQuoteResult> {
    return { provider: 'none', amountMinor: null, currency: input.currency, sandbox: true };
  }

  async createShipment(_shipmentId: string): Promise<{ accepted: false; reason: string }> {
    return { accepted: false, reason: 'Carrier dispatch is Phase 1F. No DHL/FedEx/UPS call was made.' };
  }
}
