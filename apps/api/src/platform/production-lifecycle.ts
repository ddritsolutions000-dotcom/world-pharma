/**
 * Sprint 42 — server-enforced country production lifecycle transitions.
 * Independent of sandbox CountryStatus ACTIVE/INACTIVE.
 */

export type ProductionLifecycleState =
  | 'CONFIGURED'
  | 'UNDER_REVIEW'
  | 'READY_FOR_ACTIVATION'
  | 'ACTIVE'
  | 'SUSPENDED';

const ALLOWED: Record<ProductionLifecycleState, readonly ProductionLifecycleState[]> = {
  CONFIGURED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['READY_FOR_ACTIVATION'],
  READY_FOR_ACTIVATION: ['ACTIVE'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['UNDER_REVIEW'],
};

export function canTransitionProductionLifecycle(
  from: ProductionLifecycleState,
  to: ProductionLifecycleState,
): boolean {
  if (from === to) return true; // idempotent no-op
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertProductionLifecycleTransition(
  from: ProductionLifecycleState,
  to: ProductionLifecycleState,
): void {
  if (from === to) return;
  if (!canTransitionProductionLifecycle(from, to)) {
    throw new Error(`Invalid production lifecycle transition: ${from} → ${to}`);
  }
}

/** Derive lifecycle from readiness when advancing toward READY_FOR_ACTIVATION. */
export function suggestLifecycleFromReadiness(input: {
  current: ProductionLifecycleState;
  productionReady: boolean;
}): ProductionLifecycleState {
  if (input.current === 'ACTIVE' || input.current === 'SUSPENDED') {
    return input.current;
  }
  if (input.productionReady) {
    return 'READY_FOR_ACTIVATION';
  }
  if (input.current === 'CONFIGURED') {
    return 'CONFIGURED';
  }
  return input.current;
}
