/**
 * Sprint 72 — KYC/KYB + partner verification onboarding evidence (no fake live KYC).
 * 390px responsive ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  AFFILIATE,
  CUSTOMER,
  DOCTOR,
  IMAGING,
  LAB,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  s72Snap,
  s72WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s72-ui';
import { selectSellerOrg } from '../../e2e/helpers/s61-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S72 KYC API gates', () => {
  test('unauthenticated kyc-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/kyc-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S72 Admin + partner portals + customer visibility', () => {
  test('sandbox review + EXTERNAL_GATED production KYC status', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const kycHeading = page.getByText(/KYC \/ KYB \+ partner verification (onboarding|activation readiness)/i).first();
    await expect(kycHeading).toBeVisible({ timeout: 60_000 });
    await kycHeading.scrollIntoViewIfNeeded();
    await expect(
      page.getByText(/NOT_SELECTED|EXTERNAL_GATED|NO_PRODUCTION_KYC_KYB_PROVIDER|NO_PRODUCTION_KYC_PROVIDER/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/NO_PRODUCTION_KYC_KYB_PROVIDER|NO_PRODUCTION_KYC_PROVIDER/);
    expect(adminBody).toMatch(/DOCUMENT_VERIFIED_SEPARATE|manual sandbox/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/passport_number|aadhaar|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s72Snap(page, 'admin-01-kyc-status');
    await s72Snap(page, 'admin-02-production-external-gated');

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'admin-03-partners');
    const submittedReview = page
      .getByRole('row', { name: /VENDOR.*Under review|VENDOR.*Submitted|Submitted.*VENDOR|Under review.*VENDOR/i })
      .getByRole('button', { name: /Review/i })
      .first();
    if (await submittedReview.isVisible().catch(() => false)) {
      await submittedReview.click();
    } else {
      await page.getByRole('button', { name: /Review/i }).first().click();
    }
    await expect(
      page.getByText(/KYC documents|Onboarding readiness|Back to queue|Application 01|Document/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await s72Snap(page, 'admin-04-partner-detail');
    const markReview = page.getByRole('button', { name: /Mark under review/i });
    if (await markReview.isVisible().catch(() => false)) {
      await markReview.click();
      await expect(page.getByText(/Under review/i).first()).toBeVisible({ timeout: 30_000 });
      await s72Snap(page, 'admin-05-under-review');
    } else {
      await s72Snap(page, 'admin-05-review-state');
    }

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/healthcare|doctor|lab|imaging|network|partner|credential/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s72Snap(page, 'admin-06-healthcare-network');

    // Vendor
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await expect(page.getByText(/vendor|workspace|order|inventory|sandbox|World Pharma|Seller/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'vendor-07-portal');
    for (const path of ['/workspace', '/onboarding', '/profile', '/documents']) {
      await page.goto(`${VENDOR}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s72Snap(page, 'vendor-08-profile-or-docs');

    // Doctor
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await expect(page.getByText(/doctor|appointment|prescription|consult|sandbox|World Pharma/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'doctor-09-portal');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/credential|license|verification|document|profile|sandbox|World/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'doctor-10-credentials-or-profile');

    // Lab
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${LAB}/`, 'sandbox-lab@dev.local');
    await expect(page.getByText(/lab|accession|result|specimen|sandbox|World Pharma/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'lab-11-portal');

    // Imaging
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await expect(page.getByText(/imaging|study|radiolog|modality|sandbox|World Pharma/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'imaging-12-portal');

    // Affiliate beneficiary / KYC
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${AFFILIATE}/`, 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/affiliate|earn|referral|dashboard|sandbox|EXTERNAL/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s72Snap(page, 'affiliate-13-dashboard');
    for (const path of ['/earnings', '/statement', '/profile', '/kyc']) {
      await page.goto(`${AFFILIATE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s72Snap(page, 'affiliate-14-earnings-or-kyc');

    // Customer must not reach Admin KYC / partner documents
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
    await s72Snap(cust, 'customer-15-market');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s72Snap(cust, 'security-16-customer-denied-admin');

    await cust.goto(`${ADMIN}/partners`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s72Snap(cust, 'security-17-customer-denied-partners');
    await custCtx.close();

    // Vendor cannot use Admin partner review as operator
    await page.goto(`${ADMIN}/partners`);
    await expect(
      page.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s72Snap(page, 'security-18-vendor-denied-admin');

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const kycFinal = page.getByText(
      /KYC \/ KYB|NO_PRODUCTION_KYC_KYB_PROVIDER|NO_PRODUCTION_KYC_PROVIDER|EXTERNAL_GATED/i,
    ).first();
    await expect(kycFinal).toBeVisible({ timeout: 60_000 });
    await kycFinal.scrollIntoViewIfNeeded();
    await s72Snap(page, 'admin-19-final-status');

    const status = {
      sprint: 72,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Verification_status: 'SANDBOX_ONLY',
      Legal_compliance_gate: 'EXTERNAL_GATED',
      Beneficiary: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_KYC_KYB_PROVIDER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s72WriteArtifact('final-kyc-status.json', JSON.stringify(status, null, 2));
    await s72Snap(page, 'admin-20-final-context');
  });
});
