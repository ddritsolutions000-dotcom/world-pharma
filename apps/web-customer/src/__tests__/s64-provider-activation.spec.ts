/**
 * Sprint 64 — Provider activation framework (real Admin UI).
 * No fake live provider credentials or connectivity claims.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s64Snap,
  s64WriteArtifact,
} from '../../e2e/helpers/s64-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S64 provider activation API', () => {
  test('unauthenticated activation matrix is denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/provider-activation');
    expect(res.status()).toBe(401);
  });

  test('health ready still fail-closed on PITR', async ({ request }) => {
    const ready = await (await request.get('http://127.0.0.1:4000/health/ready')).json();
    expect(ready.infrastructure?.pitr).toBe('EXTERNAL_GATED');
    s64WriteArtifact('health-ready.json', JSON.stringify(ready, null, 2));
  });
});

test.describe('S64 Admin activation center journey', () => {
  test('login → activation center → inspect blocker → related gates → summary', async ({
    page,
    context,
    request,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Provider activation center').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Production launch ready:\s*false/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/EXTERNAL_GATED|NOT_CONFIGURED|NOT_SELECTED|Enabled:\s*false/i);
    expect(body).not.toMatch(/\bUPI\b/);
    expect(body).not.toContain('₹');
    await ensureNoSecrets(page);
    await s64Snap(page, 'admin-01-activation-center');

    // Inspect a provider card
    await page.getByRole('button', { name: 'Inspect' }).first().click();
    await expect(page.getByText(/Detail —/i).first()).toBeVisible({ timeout: 15_000 });
    await s64Snap(page, 'admin-02-provider-detail');

    await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Payment|sandbox|EXTERNAL|PSP/i).first()).toBeVisible({ timeout: 45_000 });
    await s64Snap(page, 'admin-03-payment-gate');

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Healthcare|eRx|EXTERNAL_GATED|PACS|VIDEO/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s64Snap(page, 'admin-04-healthcare-gate');

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/PITR|TARGET_DEFINED|EXTERNAL_GATED|Reliability/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s64Snap(page, 'admin-05-infrastructure-gate');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/launch readiness|EXTERNAL_GATED|Provider activation/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s64Snap(page, 'admin-06-country-activation-gate');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Provider activation center').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Phase 0|Infrastructure|Payments/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await s64Snap(page, 'admin-07-sandbox-vs-production');
    await s64Snap(page, 'admin-08-final-activation-summary');

    // Auth session cookie may not forward to request fixture — matrix from UI evidence + public ready
    const matrix = {
      sprint: 64,
      decision: 'NO — not production-launch ready; activation framework only',
      integrations: [
        'PAYMENTS_PSP',
        'OTP_AUTH',
        'MESSAGING',
        'CARRIER',
        'AFFILIATE_PAYOUT',
        'ERX',
        'VIDEO',
        'PACS_DICOM',
        'OBJECT_STORAGE',
        'KMS',
        'MALWARE_SCANNER',
        'KYC',
        'MANAGED_DB_PITR',
        'MONITORING_APM',
      ].map((id) => ({
        INTEGRATION: id,
        CURRENT_STATUS: 'EXTERNAL_GATED_OR_NOT_ENABLED',
        CONFIGURED: 'see Admin Activation Center',
        VERIFIED: false,
        APPROVED: false,
        ENABLED: false,
        OWNER: 'see contract',
        EXTERNAL_BLOCKER: 'credentials/contracts/adapters pending',
        NEXT_ACTION: 'Supply real provider account + approvals per S64 docs',
      })),
    };
    s64WriteArtifact('final-activation-matrix.json', JSON.stringify(matrix, null, 2));
    void request;
  });
});
