import { Injectable } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import {
  CarrierBookRequest,
  CarrierBookResponse,
  CarrierInvoiceLine,
  CarrierPort,
  CarrierQuoteRequest,
  CarrierQuoteResponse,
  CarrierTrackResult,
} from './carrier.port';
import { verifyCarrierSignature } from './hmac';

/** SANDBOX mock. Zero network. Never DHL/FedEx/UPS. */
@Injectable()
export class MockCarrierAdapter extends CarrierPort {
  readonly code = 'MOCK';
  private readonly ledger = new Map<string, ShipmentStatus>();

  async quote(input: CarrierQuoteRequest): Promise<CarrierQuoteResponse> {
    if (input.serviceLevel === 'QUOTE_FAILURE') {
      return { carrierCode: this.code, quotedCostMinor: null, currency: input.currency, serviceLevel: input.serviceLevel, sandbox: true };
    }
    return {
      carrierCode: this.code,
      quotedCostMinor: 750n,
      currency: input.currency,
      serviceLevel: input.serviceLevel,
      sandbox: true,
    };
  }

  async createShipment(input: CarrierBookRequest): Promise<CarrierBookResponse> {
    const carrierTag = (input.carrierCode ?? this.code).toLowerCase();
    const providerRef = `${carrierTag}_${input.shipmentId}`;
    const trackingPrefix = (input.carrierCode ?? 'MOCK').replace(/_/g, '').slice(0, 6).toUpperCase();
    switch (input.scenario) {
      case 'QUOTE_FAILURE':
      case 'BOOK_FAILURE':
        return { submitted: false, accepted: false, errorCode: 'MOCK_REJECTED' };
      case 'BOOK_TIMEOUT':
      case 'BOOK_UNKNOWN':
        this.ledger.set(providerRef, ShipmentStatus.BOOKING_UNKNOWN);
        return { submitted: true, unknown: true, providerRef, errorCode: 'MOCK_TIMEOUT' };
      default:
        this.ledger.set(providerRef, ShipmentStatus.BOOKED);
        return {
          submitted: true,
          accepted: true,
          providerRef,
          trackingNumber: `${trackingPrefix}${input.shipmentId.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
        };
    }
  }

  async cancelShipment(providerRef: string): Promise<{ cancelled: boolean }> {
    this.ledger.set(providerRef, ShipmentStatus.CANCELLED);
    return { cancelled: true };
  }

  async createLabel(providerRef: string) {
    return { trackingNumber: providerRef.replace('mock_', 'TRK'), labelRef: `mock-label:${providerRef}`, format: 'MOCK' };
  }

  async schedulePickup(_providerRef: string) {
    return { scheduled: true };
  }

  async track(providerRef: string): Promise<CarrierTrackResult> {
    return {
      status: this.ledger.get(providerRef) ?? ShipmentStatus.BOOKING_UNKNOWN,
      providerRef,
    };
  }

  resolve(providerRef: string, status: ShipmentStatus): void {
    this.ledger.set(providerRef, status);
  }

  verifyWebhook(raw: string, signature: string | undefined): boolean {
    return verifyCarrierSignature(raw, signature);
  }

  parseWebhook(raw: string) {
    const body = JSON.parse(raw) as {
      event_id?: string;
      code?: string;
      shipment_ref?: string;
      sequence?: number;
    };
    return {
      providerEventId: body.event_id ?? 'evt',
      providerCode: body.code ?? 'unknown',
      shipmentRef: body.shipment_ref ?? '',
      normalized: normalize(body.code),
      sequence: body.sequence ?? 0,
    };
  }

  async fetchInvoice(providerRef: string): Promise<CarrierInvoiceLine[]> {
    const status = this.ledger.get(providerRef);
    if (status === ShipmentStatus.BOOKING_UNKNOWN) {
      return [{ kind: 'actual', amountMinor: null, currency: 'XXX' }];
    }
    return [
      { kind: 'quoted', amountMinor: 750n, currency: 'XXX' },
      { kind: 'actual', amountMinor: 800n, currency: 'XXX' },
      { kind: 'fuel_surcharge', amountMinor: 40n, currency: 'XXX' },
    ];
  }

  async createReturn(providerRef: string) {
    return { returnRef: `rto_${providerRef}` };
  }
}

function normalize(code: string | undefined): ShipmentStatus {
  switch (code) {
    case 'booked':
      return ShipmentStatus.BOOKED;
    case 'label':
      return ShipmentStatus.LABEL_CREATED;
    case 'pickup':
      return ShipmentStatus.PICKUP_SCHEDULED;
    case 'picked_up':
      return ShipmentStatus.PICKED_UP;
    case 'in_transit':
      return ShipmentStatus.IN_TRANSIT;
    case 'ofd':
      return ShipmentStatus.OUT_FOR_DELIVERY;
    case 'delivered':
      return ShipmentStatus.DELIVERED;
    case 'failed':
      return ShipmentStatus.DELIVERY_FAILED;
    case 'rto':
      return ShipmentStatus.RETURN_TO_ORIGIN;
    case 'lost':
      return ShipmentStatus.LOST;
    case 'damaged':
      return ShipmentStatus.DAMAGED;
    case 'unknown':
      return ShipmentStatus.BOOKING_UNKNOWN;
    default:
      return ShipmentStatus.IN_TRANSIT;
  }
}
