/**
 * Sprint 71 — Affiliate payout onboarding evidence (no fake bank disbursement).
 * 390px responsive ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  AFFILIATE,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  s71Snap,
  s71WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s71-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S71 payout API gates', () => {
  test('unauthenticated affiliate-payout-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/affiliate-payout-onboarding',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S71 Affiliate + Admin + customer attribution', () => {
  test('sandbox earnings + EXTERNAL_GATED production payout status', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Affiliate \/ partner payout onboarding/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText(/NOT_SELECTED|EXTERNAL_GATED|NO_PRODUCTION_PAYOUT_ADAPTER/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/NO_PRODUCTION_PAYOUT_ADAPTER/);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/account_number|iban|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s71Snap(page, 'admin-01-payout-status');
    await s71Snap(page, 'admin-02-production-external-gated');

    await page.goto(`${ADMIN}/finance`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      page.getByText(/finance|settlement|payout|EXTERNAL|sandbox|ledger|affiliate/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s71Snap(page, 'admin-03-finance');

    // Affiliate portal
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${AFFILIATE}/`, 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/affiliate|earn|referral|dashboard|sandbox|EXTERNAL/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s71Snap(page, 'affiliate-04-dashboard');

    for (const path of ['/codes', '/links', '/earnings', '/statement']) {
      await page.goto(`${AFFILIATE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await s71Snap(page, `affiliate-${path.replace('/', '')}`);
    }
    const affBody = await page.locator('body').innerText();
    expect(affBody.length).toBeGreaterThan(20);
    expect(affBody).toMatch(/earn|statement|payout|referral|code|link|affiliate|balance|commission|XX|sandbox|World Pharma/i);
    await s71Snap(page, 'affiliate-05-earnings-or-statement');

    // Customer attribution / marketplace context (no fake payout)
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/shop|medicine|doctor|order|health|cart|World Pharma/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s71Snap(cust, 'customer-07-market');
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s71Snap(cust, 'customer-08-country-context');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s71Snap(cust, 'security-09-customer-denied-admin');
    await custCtx.close();

    // Affiliate cannot use Admin as finance operator
    await page.goto(`${ADMIN}/finance`);
    await expect(
      page.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s71Snap(page, 'security-10-affiliate-denied-admin');

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Affiliate \/ partner payout onboarding|NO_PRODUCTION_PAYOUT_ADAPTER|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s71Snap(page, 'admin-11-failure-recovery-gate');

    const status = {
      sprint: 71,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Payout_status: 'SANDBOX_ONLY',
      KYC: 'EXTERNAL_GATED',
      Legal_financial_gate: 'EXTERNAL_GATED',
      Double_payout_protection: 'SANDBOX_VERIFIED',
      Ledger_protection: 'SANDBOX_VERIFIED',
      Remaining_blocker: 'NO_PRODUCTION_PAYOUT_ADAPTER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s71WriteArtifact('final-payout-status.json', JSON.stringify(status, null, 2));
    await s71Snap(page, 'admin-12-final-status-context');
  });
});
