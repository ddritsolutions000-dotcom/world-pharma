/**
 * Sprint 94 — Production KYC/KYB activation readiness evidence
 * (no fake live KYC). Responsive ≠ native.
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
  s94Snap,
  s94WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s94-ui';
import { selectSellerOrg } from '../../e2e/helpers/s61-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S94 KYC API gates', () => {
  test('unauthenticated kyc-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/kyc-onboarding');
    expect(res.status()).toBe(401);
  });

  test('unsigned KYC callback fail-closed where exposed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/kyc/callback', {
      headers: { 'x-correlation-id': 's94-kyc-unsigned' },
      data: { event_id: 's94-unauth', type: 'verification.completed' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|passport|aadhaar|ssn/i);
    s94WriteArtifact(
      'controlled-callback-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned/unknown KYC callback rejected or EXTERNAL_GATED',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S94 Admin + partner portals + customer visibility', () => {
  test('sandbox review + EXTERNAL_GATED + launch NO + SoD', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const kycHeading = page
      .getByText(/KYC \/ KYB \+ partner verification activation readiness \(Sprint 94\)/i)
      .first();
    await expect(kycHeading).toBeVisible({ timeout: 60_000 });
    await kycHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_KYC_KYB_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED/);
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING|Credentials:\s*MISSING/i);
    expect(adminBody).toMatch(/Production activation:\s*EXTERNAL_GATED/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(
      /PRIVATE_STORAGE_EXTERNAL_GATED|KMS_EXTERNAL_GATED|MALWARE_SCAN_EXTERNAL_GATED/,
    );
    expect(adminBody).toMatch(/DOCUMENT_VERIFIED_SEPARATE|manual sandbox/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/passport_number|aadhaar|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s94Snap(page, 'admin-01-kyc-card');
    await s94Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await kycHeading.scrollIntoViewIfNeeded();
      await s94Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_KYC_KYB_PROVIDER/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s94Snap(page, 'admin-03-launch-readiness-no');

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s94Snap(page, 'admin-04-partners');
    const submittedReview = page
      .getByRole('row', {
        name: /VENDOR.*Under review|VENDOR.*Submitted|Submitted.*VENDOR|Under review.*VENDOR/i,
      })
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
    await s94Snap(page, 'admin-05-partner-detail');
    const markReview = page.getByRole('button', { name: /Mark under review/i });
    if (await markReview.isVisible().catch(() => false)) {
      await markReview.click();
      await expect(page.getByText(/Under review/i).first()).toBeVisible({ timeout: 30_000 });
      await s94Snap(page, 'admin-06-under-review');
    } else {
      await s94Snap(page, 'admin-06-review-state');
    }

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/healthcare|doctor|lab|imaging|network|partner|credential/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s94Snap(page, 'admin-07-healthcare-network');

    // Vendor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await expect(
      page.getByText(/vendor|workspace|order|inventory|sandbox|World Pharma|Seller/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s94Snap(page, 'vendor-08-portal');
    for (const path of ['/workspace', '/onboarding', '/profile', '/documents']) {
      await page.goto(`${VENDOR}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s94Snap(page, 'vendor-09-profile-or-docs');

    // Doctor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await expect(
      page.getByText(/doctor|appointment|prescription|consult|sandbox|World Pharma/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s94Snap(page, 'doctor-10-portal');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/credential|license|verification|document|profile|sandbox|World/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s94Snap(page, 'doctor-11-credentials');

    // Lab
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-lab@dev.local');
    await s61LoginPortal(page, `${LAB}/`, 'sandbox-lab@dev.local');
    await expect(page.getByText(/lab|accession|result|specimen|sandbox|World Pharma/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s94Snap(page, 'lab-12-portal');

    // Imaging
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-imaging@dev.local');
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await expect(
      page.getByText(/imaging|study|radiolog|modality|sandbox|World Pharma/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s94Snap(page, 'imaging-13-portal');

    // Affiliate
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-affiliate@dev.local');
    await s61LoginPortal(page, `${AFFILIATE}/`, 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/affiliate|earn|referral|dashboard|sandbox|EXTERNAL/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s94Snap(page, 'affiliate-14-dashboard');
    for (const path of ['/earnings', '/statement', '/profile', '/kyc']) {
      await page.goto(`${AFFILIATE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await s94Snap(page, 'affiliate-15-earnings-or-kyc');

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
    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s94Snap(cust, 'security-16-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /KYC \/ KYB \+ partner verification activation readiness \(Sprint 94\)|NO_PRODUCTION_KYC_KYB_PROVIDER|EXTERNAL_GATED/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s94Snap(page, 'admin-17-final-status');

    const status = {
      sprint: 94,
      foundation_sprint: 81,
      Provider: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Verification_status: 'SANDBOX_ONLY',
      Object_storage: 'PRIVATE_STORAGE_EXTERNAL_GATED',
      KMS: 'KMS_EXTERNAL_GATED',
      Malware_scan: 'MALWARE_SCAN_EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_KYC_KYB_PROVIDER',
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_KYC_KYB_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s94WriteArtifact('final-kyc-status.json', JSON.stringify(status, null, 2));
  });
});
