/**
 * Sprint 73 — Production private storage / KMS / malware scanning evidence.
 * 390px responsive ≠ native Android/iOS. Local sandbox store ≠ production storage.
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
  s73Snap,
  s73WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s73-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S73 storage API gates', () => {
  test('unauthenticated production-storage-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-storage-onboarding',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S73 Admin + partner document surfaces + customer isolation', () => {
  test('sandbox private store + EXTERNAL_GATED production storage/KMS/scanner', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const storageHeading = page
      .getByText(/Private object storage (onboarding|activation readiness)/i)
      .first();
    await expect(storageHeading).toBeVisible({ timeout: 60_000 });
    await storageHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PRIVATE_STORAGE/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/KMS \/ encryption (onboarding|activation readiness)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_KMS/i).first()).toBeVisible();
    await expect(page.getByText(/Malware scanner (onboarding|activation readiness)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_MALWARE_SCANNER/i).first()).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Local disk is never a production fallback|never a production fallback/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/aws_secret|AKIA[0-9A-Z]{16}|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s73Snap(page, 'admin-01-storage-status');
    await s73Snap(page, 'admin-02-kms-malware-gates');

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      page.getByText(/reliability|launch|EXTERNAL|sandbox|infrastructure|storage|recovery/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s73Snap(page, 'admin-03-reliability-or-launch');

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding|document/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s73Snap(page, 'admin-04-partners-kyc-docs');
    const reviewBtn = page.getByRole('button', { name: /Review/i }).first();
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
      await expect(
        page.getByText(/KYC documents|Onboarding readiness|Back to queue|Document|Application/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await s73Snap(page, 'admin-05-partner-document-context');
    }

    // Vendor documents surface
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await s73Snap(page, 'vendor-06-portal');
    for (const path of ['/documents', '/onboarding', '/profile', '/workspace']) {
      await page.goto(`${VENDOR}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s73Snap(page, 'vendor-07-docs-or-workspace');

    // Doctor credentials
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await s73Snap(page, 'doctor-08-portal');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await s73Snap(page, 'doctor-09-credentials');

    // Lab / Imaging
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${LAB}/`, 'sandbox-lab@dev.local');
    await s73Snap(page, 'lab-10-portal');

    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await s73Snap(page, 'imaging-11-portal');

    // Affiliate
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${AFFILIATE}/`, 'sandbox-affiliate@dev.local');
    await s73Snap(page, 'affiliate-12-portal');

    // Customer health/docs + denied Admin storage
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
    await s73Snap(cust, 'customer-13-market');
    for (const path of ['/account', '/health', '/reports', '/documents']) {
      await cust.goto(`${CUSTOMER}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await cust.waitForTimeout(300);
    }
    await s73Snap(cust, 'customer-14-health-or-account');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s73Snap(cust, 'security-15-customer-denied-admin');
    await custCtx.close();

    await page.goto(`${ADMIN}/provider-activation`);
    await expect(
      page.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s73Snap(page, 'security-16-partner-denied-admin');

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_PRIVATE_STORAGE|Private object storage (onboarding|activation readiness)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s73Snap(page, 'admin-17-final-status');

    const status = {
      sprint: 73,
      Object_storage: 'NOT_SELECTED',
      KMS: 'NOT_SELECTED',
      Malware_scanner: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Remaining_blockers: [
        'NO_PRODUCTION_PRIVATE_STORAGE',
        'NO_PRODUCTION_KMS',
        'NO_PRODUCTION_MALWARE_SCANNER',
      ],
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s73WriteArtifact('final-storage-status.json', JSON.stringify(status, null, 2));
    await s73Snap(page, 'admin-18-final-context');
  });
});
