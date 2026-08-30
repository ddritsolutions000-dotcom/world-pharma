/** Carrier adapter boundary. 1E ships a no-op stub. DHL/FedEx/UPS belong to 1F. */

export type CarrierQuoteInput = {
  countryIso2: string;
  currency: string;
  packages: number;
};

export type CarrierQuoteResult = {
  provider: 'none';
  amountMinor: null;
  currency: string;
  sandbox: true;
};

export abstract class CarrierPort {
  abstract quote(input: CarrierQuoteInput): Promise<CarrierQuoteResult>;
  abstract createShipment(shipmentId: string): Promise<{ accepted: false; reason: string }>;
}
