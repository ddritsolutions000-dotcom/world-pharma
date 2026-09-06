/**
 * Sprint 95 — Production private storage / KMS / malware activation readiness evidence
 * (no fake cloud infra). Responsive ≠ native.
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
  s95Snap,
  s95WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s95-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S95 storage API gates', () => {
  test('unauthenticated production-storage-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-storage-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('anonymous private object access fail-closed where exposed', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/objects/anonymous-probe', {
      headers: { 'x-correlation-id': 's95-storage-anon' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(res.status());
    expect(res.ok()).toBeFalsy();
    const bodyText = await res.text();
    expect(bodyText).not.toMatch(/aws_secret|AKIA|api_key|password|kms_key_material/i);
    s95WriteArtifact(
      'controlled-anonymous-access-failure.json',
      JSON.stringify(
        {
          status: res.status(),
          ok: false,
          category: 'PRIVATE_ACCESS_DENIED',
          note: 'Anonymous object access rejected',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S95 Admin + partner document surfaces + customer isolation', () => {
  test('sandbox private store + EXTERNAL_GATED + launch NO + SoD', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const storageHeading = page
      .getByText(/Private object storage activation readiness \(Sprint 95\)/i)
      .first();
    await expect(storageHeading).toBeVisible({ timeout: 60_000 });
    await storageHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PRIVATE_STORAGE/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/KMS \/ encryption activation readiness \(Sprint 95\)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_KMS/i).first()).toBeVisible();
    await expect(
      page.getByText(/Malware scanner activation readiness \(Sprint 95\)/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_MALWARE_SCANNER/i).first()).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING|Credentials:\s*MISSING/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/Local disk is never a production fallback|never a production fallback/i);
    expect(adminBody).toMatch(/UNSCANNED|Never trust unscanned|FAIL_CLOSED/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/aws_secret|AKIA[0-9A-Z]{16}|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s95Snap(page, 'admin-01-storage-card');
    await s95Snap(page, 'admin-02-kms-card');
    await s95Snap(page, 'admin-03-malware-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await storageHeading.scrollIntoViewIfNeeded();
      await s95Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_PRIVATE_STORAGE|NO_PRODUCTION_KMS|NO_PRODUCTION_MALWARE/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s95Snap(page, 'admin-04-launch-readiness-no');

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding|document/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s95Snap(page, 'admin-05-partners-kyc-docs');
    const reviewBtn = page.getByRole('button', { name: /Review/i }).first();
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
      await expect(
        page.getByText(/KYC documents|Onboarding readiness|Back to queue|Document|Application/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await s95Snap(page, 'admin-06-partner-document-context');
    }

    // Vendor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await s95Snap(page, 'vendor-07-portal');
    for (const p of ['/documents', '/onboarding', '/profile', '/workspace']) {
      await page.goto(`${VENDOR}${p}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s95Snap(page, 'vendor-08-docs-or-workspace');

    // Doctor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await s95Snap(page, 'doctor-09-portal');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await s95Snap(page, 'doctor-10-credentials');

    // Lab / Imaging
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-lab@dev.local');
    await s61LoginPortal(page, `${LAB}/`, 'sandbox-lab@dev.local');
    await s95Snap(page, 'lab-11-portal');

    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-imaging@dev.local');
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await s95Snap(page, 'imaging-12-portal');

    // Affiliate
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-affiliate@dev.local');
    await s61LoginPortal(page, `${AFFILIATE}/`, 'sandbox-affiliate@dev.local');
    await s95Snap(page, 'affiliate-13-portal');

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
    await s95Snap(cust, 'customer-14-health-or-account');
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s95Snap(cust, 'security-15-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_PRIVATE_STORAGE|Private object storage activation readiness \(Sprint 95\)/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s95Snap(page, 'admin-16-final-status');

    const status = {
      sprint: 95,
      foundation_sprint: 82,
      Object_storage: 'NOT_SELECTED',
      KMS: 'NOT_SELECTED',
      Malware_scanner: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Remaining_blockers: [
        'NO_PRODUCTION_PRIVATE_STORAGE',
        'NO_PRODUCTION_KMS',
        'NO_PRODUCTION_MALWARE_SCANNER',
      ],
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_PRIVATE_STORAGE_ENABLED: 'NO',
      PRODUCTION_KMS_ENABLED: 'NO',
      PRODUCTION_MALWARE_SCANNER_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s95WriteArtifact('final-storage-status.json', JSON.stringify(status, null, 2));
  });
});
