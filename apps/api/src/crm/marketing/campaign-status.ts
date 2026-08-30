import { CrmCampaignStatus } from '@prisma/client';
import { Errors } from '../../common/problem';

const TRANSITIONS: Record<CrmCampaignStatus, CrmCampaignStatus[]> = {
  [CrmCampaignStatus.DRAFT]: [CrmCampaignStatus.SCHEDULED, CrmCampaignStatus.CANCELLED],
  [CrmCampaignStatus.SCHEDULED]: [CrmCampaignStatus.SENDING, CrmCampaignStatus.CANCELLED],
  [CrmCampaignStatus.SENDING]: [CrmCampaignStatus.COMPLETED],
  [CrmCampaignStatus.COMPLETED]: [],
  [CrmCampaignStatus.CANCELLED]: [],
};

export function assertCampaignTransition(from: CrmCampaignStatus, to: CrmCampaignStatus) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid campaign transition: ${from} -> ${to}`);
  }
}

export function isTerminalCampaignStatus(status: CrmCampaignStatus): boolean {
  return status === CrmCampaignStatus.COMPLETED || status === CrmCampaignStatus.CANCELLED;
}

export function isEditableCampaignStatus(status: CrmCampaignStatus): boolean {
  return status === CrmCampaignStatus.DRAFT || status === CrmCampaignStatus.SCHEDULED;
}
