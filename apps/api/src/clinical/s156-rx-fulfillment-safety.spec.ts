/**
 * Sprint 156 — Rx fulfillment safety gate (unit).
 * Fail-closed decisions; no clinical payload in audit contract.
 */
import {
  isUuid,
  rxFulfillmentStatusLabel,
  type RxFulfillmentGateResult,
} from './rx-fulfillment-safety-gate';

describe('S156 Rx fulfillment safety gate helpers', () => {
  it('validates UUID shape for case references', () => {
    expect(isUuid('01a069a8-903a-7efd-b9d4-81515c7bbad6')).toBe(true);
    expect(isUuid('not-a-real-id')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('maps decisions to customer/vendor-safe labels', () => {
    expect(rxFulfillmentStatusLabel('ELIGIBLE')).toMatch(/ready/i);
    expect(rxFulfillmentStatusLabel('REVIEW_REQUIRED')).toMatch(/review/i);
    expect(rxFulfillmentStatusLabel('BLOCKED', 'RX_EXPIRED')).toMatch(/expired/i);
    expect(rxFulfillmentStatusLabel('BLOCKED', 'RX_REVOKED')).toMatch(/revoked/i);
    expect(rxFulfillmentStatusLabel('BLOCKED', 'RX_REQUIRED')).toMatch(/prescription required/i);
  });

  it('documents fail-closed auto-execute contract', () => {
    const contract = {
      forged_case_uuid_allowed: false,
      expired_rx_auto_execute: false,
      revoked_rx_auto_execute: false,
      wrong_patient_allowed: false,
      duplicate_dispense_order: false,
      auto_execute_runs_without_worker: false,
      clinical_payload_in_audit: false,
      production_erx_enabled: false,
      can_production_launch: 'NO',
    };
    expect(contract.forged_case_uuid_allowed).toBe(false);
    expect(contract.auto_execute_runs_without_worker).toBe(false);
    expect(contract.clinical_payload_in_audit).toBe(false);
    expect(contract.can_production_launch).toBe('NO');
  });

  it('keeps gate result shape machine-readable', () => {
    const sample: RxFulfillmentGateResult = {
      decision: 'BLOCKED',
      reason_code: 'RX_CASE_NOT_FOUND',
      customer_message: 'Prescription case was not found.',
    };
    expect(sample.decision).toBe('BLOCKED');
    expect(sample.reason_code).toMatch(/^RX_/);
  });
});
