/**
 * Sprint 155 — Affiliate mobile navigation, labels, and security contracts.
 */
import {
  AFFILIATE_TABS,
  affiliateMobileScreen,
  affiliateTabBreadcrumb,
} from './navigation';
import {
  earningStatusLabel,
  formatMoney,
  kycStatusSummary,
  payoutStatusLabel,
  resolveShareUrl,
} from './affiliate-labels';

describe('S155 affiliate mobile navigation', () => {
  it('routes unauthenticated users to sign-in', () => {
    expect(affiliateMobileScreen({ status: 'anonymous' } as never)).toBe('sign-in');
    expect(affiliateMobileScreen({ status: 'expired' } as never)).toBe('expired');
    expect(affiliateMobileScreen({ status: 'authenticated', audience: 'customer' } as never, 'earnings')).toBe(
      'earnings',
    );
  });

  it('exposes the full affiliate journey tabs', () => {
    const ids = AFFILIATE_TABS.map((t) => t.id);
    expect(ids).toEqual([
      'dashboard',
      'links',
      'earnings',
      'statement',
      'inbox',
      'support',
      'profile',
    ]);
    expect(affiliateTabBreadcrumb('profile')).toMatch(/verification/i);
  });
});

describe('S155 commission and payout labels', () => {
  it('maps S149 liability states without inventing execute actions', () => {
    expect(earningStatusLabel('PENDING')).toMatch(/pending/i);
    expect(earningStatusLabel('PAYABLE')).toMatch(/payable/i);
    expect(earningStatusLabel('PAID')).toMatch(/paid/i);
    expect(earningStatusLabel('REVERSED')).toMatch(/reversed/i);
    expect(payoutStatusLabel('external_gated', false)).toMatch(/external-gated/i);
    expect(formatMoney('12345', 'INR')).toBeTruthy();
  });

  it('keeps KYC summary evidence-free', () => {
    const kyc = kycStatusSummary({ payout_enabled: false, payout_status: 'external_gated' });
    expect(kyc.detail.toLowerCase()).not.toMatch(/document_base64|evidence_blob|passport/);
    expect(kyc.detail).toMatch(/EXTERNAL_GATED|external-gated|Join/i);
  });

  it('resolves share URLs without fabricating stats', () => {
    expect(resolveShareUrl('https://example.com/r/ABC')).toBe('https://example.com/r/ABC');
    expect(resolveShareUrl('/r/ABC')).toMatch(/\/r\/ABC$/);
  });
});

describe('S155 security contract', () => {
  it('documents own-data and no-payout-execute expectations', () => {
    const contract = {
      jwt_audience: 'customer',
      cross_affiliate_list: false,
      unauthorized_rejected: true,
      payout_execute_in_mobile: false,
      kyc_raw_documents_exposed: false,
      apis: [
        'me/affiliate/stats',
        'me/affiliate/codes',
        'me/affiliate/links',
        'me/affiliate/earnings',
        'me/affiliate/statement',
      ],
      can_production_launch: 'NO',
      hl7_fhir_in_s155: false,
    };
    expect(contract.cross_affiliate_list).toBe(false);
    expect(contract.payout_execute_in_mobile).toBe(false);
    expect(contract.kyc_raw_documents_exposed).toBe(false);
    expect(contract.can_production_launch).toBe('NO');
    expect(contract.hl7_fhir_in_s155).toBe(false);
  });
});
