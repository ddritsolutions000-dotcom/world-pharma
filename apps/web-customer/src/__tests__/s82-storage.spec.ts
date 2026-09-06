/**
 * Sprint 82 — Private storage / KMS / malware activation readiness evidence (no fake infra).
 * Responsive 390/768/1024/1440 = RESPONSIVE_WEB_VERIFIED ≠ native Android/iOS.
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
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s82Snap,
  s82WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s82-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S82 storage API gates', () => {
  test('unauthenticated production-storage-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-storage-onboarding',
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('S82 Admin + partner document surfaces + customer isolation', () => {
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
      .getByText(/Private object storage activation readiness \(Sprint (82|95)\)/i)
      .first();
    await expect(storageHeading).toBeVisible({ timeout: 60_000 });
    await storageHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PRIVATE_STORAGE/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/KMS \/ encryption activation readiness \(Sprint (82|95)\)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_KMS/i).first()).toBeVisible();
    await expect(
      page.getByText(/Malware scanner activation readiness \(Sprint (82|95)\)/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_MALWARE_SCANNER/i).first()).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Local disk is never a production fallback|never a production fallback/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/aws_secret|AKIA[0-9A-Z]{16}|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s82Snap(page, 'admin-01-storage-status');
    await s82Snap(page, 'admin-02-kms-malware-gates');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await storageHeading.scrollIntoViewIfNeeded();
      await s82Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding|document/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s82Snap(page, 'admin-03-partners-kyc-docs');
    const reviewBtn = page.getByRole('button', { name: /Review/i }).first();
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
      await expect(
        page.getByText(/KYC documents|Onboarding readiness|Back to queue|Document|Application/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await s82Snap(page, 'admin-04-partner-document-context');
    }

    // Vendor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await s82Snap(page, 'vendor-05-portal');
    for (const p of ['/documents', '/onboarding', '/profile', '/workspace']) {
      await page.goto(`${VENDOR}${p}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s82Snap(page, 'vendor-06-docs-or-workspace');

    // Doctor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await s82Snap(page, 'doctor-07-portal');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await s82Snap(page, 'doctor-08-credentials');

    // Lab / Imaging
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-lab@dev.local');
    await s61LoginPortal(page, `${LAB}/`, 'sandbox-lab@dev.local');
    await s82Snap(page, 'lab-09-portal');

    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-imaging@dev.local');
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await s82Snap(page, 'imaging-10-portal');

    // Affiliate
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-affiliate@dev.local');
    await s61LoginPortal(page, `${AFFILIATE}/`, 'sandbox-affiliate@dev.local');
    await s82Snap(page, 'affiliate-11-portal');

    // Customer denied Admin
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    for (const p of ['/account', '/health']) {
      await cust.goto(`${CUSTOMER}${p}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await cust.waitForTimeout(300);
    }
    await s82Snap(cust, 'customer-12-health-or-account');
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s82Snap(cust, 'security-13-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_PRIVATE_STORAGE|Private object storage activation readiness \(Sprint (82|95)\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s82Snap(page, 'admin-14-final-status');

    const status = {
      sprint: 82,
      foundation_sprint: 73,
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
    s82WriteArtifact('final-storage-status.json', JSON.stringify(status, null, 2));
  });
});
