/**
 * E-Rx adapter port (book 111 §3; R5-F wiring).
 * Null adapter is default — always fail closed until pack + runtime provider align.
 */
export type ERxSubmitResult =
  | { status: 'unsupported'; reason: string }
  | { status: 'submitted'; providerRef: string };

export type ERxStatusResult =
  | { status: 'unsupported'; reason: string }
  | { status: 'unknown'; providerRef: string; opaque: string };

export type ERxCancelResult =
  | { status: 'unsupported'; reason: string }
  | { status: 'cancelled'; providerRef: string };

export abstract class ERxPort {
  abstract submit(prescriptionVersionId: string): Promise<ERxSubmitResult>;
  abstract fetchStatus(providerRef: string): Promise<ERxStatusResult>;
  abstract cancel(providerRef: string): Promise<ERxCancelResult>;
}

export const ERX_PORT = Symbol('ERX_PORT');
