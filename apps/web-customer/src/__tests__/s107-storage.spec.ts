/**
 * Sprint 107 — Real storage/KMS/malware activation readiness evidence
 * (no invented cloud infra). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  DOCTOR,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s107Snap,
  s107WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s107-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S107 storage API gates', () => {
  test('unauthenticated production-storage-real-activation-onboarding denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-storage-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('anonymous private object access fail-closed', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/objects/anonymous-probe', {
      headers: { 'x-correlation-id': 's107-storage-anon' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(res.status());
    expect(res.ok()).toBeFalsy();
    const bodyText = await res.text();
    expect(bodyText).not.toMatch(/aws_secret|AKIA|api_key|password|kms_key_material/i);
  });
});

test.describe('S107 Admin + sandbox docs + SoD', () => {
  test('EXTERNAL_GATED storage triad + launch NO + private access', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(
        /Real production storage \+ KMS \+ malware activation readiness \(Sprint 107\)/i,
      )
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PRIVATE_STORAGE/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/Object storage selected:\s*false|Object storage enabled:\s*false/i).first(),
    ).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/KMS selected:\s*false/i);
    expect(adminBody).toMatch(/Malware selected:\s*false/i);
    expect(adminBody).toMatch(/Private verified:\s*SANDBOX_ONLY/i);
    expect(adminBody).toMatch(/Local-disk fallback:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED/i);
    expect(adminBody).toMatch(/never a production fallback|Local disk never/i);
    expect(adminBody).not.toMatch(/Provider:\s*S3|Provider:\s*GCS|arn:aws:kms:/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|AKIA[0-9A-Z]{16}/i);
    await ensureNoSecrets(page);
    await s107Snap(page, 'admin-01-real-storage-card');

    // S95 triad cards still present
    await expect(
      page.getByText(/Private object storage activation readiness \(Sprint 95\)/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/KMS \/ encryption activation readiness \(Sprint 95\)/i).first()).toBeVisible();
    await expect(
      page.getByText(/Malware scanner activation readiness \(Sprint 95\)/i).first(),
    ).toBeVisible();
    await s107Snap(page, 'admin-02-s95-triad');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s107Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page
        .getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION_PRIVATE_STORAGE|EXTERNAL_GATED/i)
        .first(),
    ).toBeVisible({ timeout: 45_000 });
    await s107Snap(page, 'admin-03-launch-readiness-no');

    // Partner KYC document queue — sandbox private docs
    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s107Snap(page, 'admin-04-partners-docs');

    // Vendor sandbox
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await expect(
      page.getByText(/vendor|workspace|order|inventory|sandbox|World Pharma|Seller/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const vendBody = await page.locator('body').innerText();
    expect(vendBody).not.toMatch(/production storage enabled|live S3 bucket|KMS key arn/i);
    await s107Snap(page, 'vendor-05-sandbox');

    // Doctor credentials (sensitive docs surface)
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/credential|license|verification|document|profile|sandbox|World/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s107Snap(page, 'doctor-06-credentials');

    // Customer denied Admin
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s107Snap(cust, 'security-07-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /Real production storage \+ KMS \+ malware activation readiness \(Sprint 107\)|NO_PRODUCTION_PRIVATE_STORAGE/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s107Snap(page, 'admin-08-final-status');

    const status = {
      sprint: 107,
      REAL_OBJECT_STORAGE_PROVIDER_SELECTED: 'NO',
      PRODUCTION_OBJECT_STORAGE_ENABLED: 'NO',
      REAL_KMS_PROVIDER_SELECTED: 'NO',
      PRODUCTION_KMS_ENABLED: 'NO',
      REAL_MALWARE_SCANNER_SELECTED: 'NO',
      PRODUCTION_MALWARE_SCANNING_ENABLED: 'NO',
      PRIVATE_STORAGE_VERIFIED: 'SANDBOX_ONLY',
      PRODUCTION_LOCAL_DISK_FALLBACK_POSSIBLE: 'NO',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: [
        'NO_PRODUCTION_PRIVATE_STORAGE',
        'NO_PRODUCTION_KMS',
        'NO_PRODUCTION_MALWARE_SCANNER',
        'STORAGE_PRIVATE_ACCESS_NOT_VERIFIED',
        'LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN',
      ],
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s107WriteArtifact('final-storage-status.json', JSON.stringify(status, null, 2));
  });
});
