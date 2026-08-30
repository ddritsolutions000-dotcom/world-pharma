import { Errors } from '../common/problem';

/**
 * Reusable dual-control (maker/checker) guard for company-controlled operations.
 * Does not invent statutory rules — callers decide when policy requires dual control.
 * Partners never satisfy company dual-control via this helper alone.
 */
export function assertMakerChecker(input: {
  dualControlRequired: boolean;
  createdByPersonId: string | null | undefined;
  actorPersonId: string;
  actionLabel?: string;
}): void {
  if (!input.dualControlRequired) {
    return;
  }
  if (!input.createdByPersonId) {
    return;
  }
  if (input.createdByPersonId === input.actorPersonId) {
    throw Errors.problem(
      409,
      'DUAL_CONTROL_REQUIRED',
      'Dual control required',
      input.actionLabel
        ? `A different authorized reviewer must approve ${input.actionLabel}.`
        : 'A different authorized reviewer must approve this action.',
    );
  }
}
