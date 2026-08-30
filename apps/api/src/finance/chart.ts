import type { LedgerAccountType } from '@prisma/client';

export const CHART: Array<{ code: string; name: string; type: LedgerAccountType }> = [
  { code: 'AST_GATEWAY_CLEARING', name: 'Gateway clearing', type: 'ASSET' },
  { code: 'AST_INVENTORY', name: 'Inventory', type: 'ASSET' },
  { code: 'LIAB_UNEARNED', name: 'Unearned customer receipts', type: 'LIABILITY' },
  { code: 'AP_VENDOR', name: 'Vendor payable', type: 'LIABILITY' },
  { code: 'AP_AFFILIATE', name: 'Affiliate payable', type: 'LIABILITY' },
  { code: 'AP_CARRIER', name: 'Carrier payable', type: 'LIABILITY' },
  { code: 'TAX_PAYABLE', name: 'Tax payable (snapshot only)', type: 'LIABILITY' },
  { code: 'REV_OWNED', name: 'Owned goods revenue', type: 'REVENUE' },
  { code: 'REV_COMMISSION', name: 'Marketplace commission', type: 'REVENUE' },
  { code: 'REV_SHIPPING', name: 'Shipping charged', type: 'REVENUE' },
  { code: 'EXP_GATEWAY_FEE', name: 'Gateway fee', type: 'EXPENSE' },
  { code: 'EXP_FREIGHT', name: 'Freight actual', type: 'EXPENSE' },
  { code: 'EXP_PROMO_PLATFORM', name: 'Platform-funded promo', type: 'EXPENSE' },
  { code: 'EXP_AFFILIATE', name: 'Affiliate commission', type: 'EXPENSE' },
  { code: 'COGS_OWNED', name: 'Owned COGS', type: 'COGS' },
];
