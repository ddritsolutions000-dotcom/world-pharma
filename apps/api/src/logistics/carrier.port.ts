import { ShipmentStatus } from '@prisma/client';

export type MockBookingScenario =
  | 'QUOTE_SUCCESS'
  | 'QUOTE_FAILURE'
  | 'BOOK_SUCCESS'
  | 'BOOK_FAILURE'
  | 'BOOK_TIMEOUT'
  | 'BOOK_UNKNOWN';

export type CarrierQuoteRequest = {
  originIso2: string;
  destIso2: string;
  currency: string;
  serviceLevel: string;
  weightGrams: number;
  international: boolean;
};

export type CarrierQuoteResponse = {
  carrierCode: string;
  quotedCostMinor: bigint | null;
  currency: string;
  serviceLevel: string;
  sandbox: true;
};

export type CarrierBookRequest = {
  shipmentId: string;
  idempotencyKey: string;
  scenario: MockBookingScenario;
};

export type CarrierBookResponse = {
  submitted: boolean;
  accepted?: boolean;
  unknown?: boolean;
  providerRef?: string;
  trackingNumber?: string;
  errorCode?: string;
};

export type CarrierTrackResult = {
  status: ShipmentStatus;
  providerRef: string;
};

export type CarrierInvoiceLine = {
  kind: string;
  amountMinor: bigint | null;
  currency: string;
};

export abstract class CarrierPort {
  abstract readonly code: string;
  abstract quote(input: CarrierQuoteRequest): Promise<CarrierQuoteResponse>;
  abstract createShipment(input: CarrierBookRequest): Promise<CarrierBookResponse>;
  abstract cancelShipment(providerRef: string): Promise<{ cancelled: boolean }>;
  abstract createLabel(providerRef: string): Promise<{ trackingNumber: string; labelRef: string; format: string }>;
  abstract schedulePickup(providerRef: string): Promise<{ scheduled: boolean }>;
  abstract track(providerRef: string): Promise<CarrierTrackResult>;
  abstract verifyWebhook(raw: string, signature: string | undefined): boolean;
  abstract parseWebhook(raw: string): {
    providerEventId: string;
    providerCode: string;
    shipmentRef: string;
    normalized: ShipmentStatus;
    sequence: number;
  };
  abstract fetchInvoice(providerRef: string): Promise<CarrierInvoiceLine[]>;
  abstract createReturn(providerRef: string): Promise<{ returnRef: string }>;
}
