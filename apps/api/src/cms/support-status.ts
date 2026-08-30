import { SupportTicketStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  [SupportTicketStatus.OPEN]: [SupportTicketStatus.ASSIGNED, SupportTicketStatus.CLOSED],
  [SupportTicketStatus.ASSIGNED]: [SupportTicketStatus.IN_PROGRESS, SupportTicketStatus.OPEN],
  [SupportTicketStatus.IN_PROGRESS]: [
    SupportTicketStatus.WAITING_CUSTOMER,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.WAITING_CUSTOMER]: [
    SupportTicketStatus.IN_PROGRESS,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.RESOLVED]: [SupportTicketStatus.CLOSED, SupportTicketStatus.IN_PROGRESS],
  [SupportTicketStatus.CLOSED]: [],
};

export function assertSupportTransition(from: SupportTicketStatus, to: SupportTicketStatus) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid support ticket transition: ${from} -> ${to}`);
  }
}

export function isTerminalSupportStatus(status: SupportTicketStatus): boolean {
  return status === SupportTicketStatus.CLOSED;
}

export function customerMayClose(status: SupportTicketStatus): boolean {
  return status === SupportTicketStatus.OPEN || status === SupportTicketStatus.WAITING_CUSTOMER;
}
