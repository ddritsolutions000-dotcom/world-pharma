import { Injectable } from '@nestjs/common';

/**
 * R5-C pharmacy dispensing integration boundary.
 * Enqueues DispensingCase on ISSUE when pack enables dispense (OD-R5C-04).
 * Does not create Order, Payment, or Shipment.
 */
export type DispensingBoundaryResult = {
  accepted: boolean;
  reason: string;
  case_id?: string;
};

export abstract class DispensingBoundaryPort {
  abstract enqueueForVersion(prescriptionVersionId: string): Promise<DispensingBoundaryResult>;
}

export const DISPENSING_BOUNDARY = Symbol('DISPENSING_BOUNDARY');

/** Kept for tests that assert historical noop reason codes. */
@Injectable()
export class NoopDispensingBoundary extends DispensingBoundaryPort {
  async enqueueForVersion(_prescriptionVersionId: string): Promise<DispensingBoundaryResult> {
    return { accepted: false, reason: 'r5b_dispensing_not_implemented' };
  }
}
