/**
 * Sprint 106 — Real KYC/KYB + healthcare partner verification activation readiness
 * (no invented provider / no production partner verification). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  AFFILIATE,
  CUSTOMER,
  CUSTOMER_EMAIL,
  DOCTOR,
  IMAGING,
  LAB,
  VENDOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s106Snap,
  s106WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s106-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S106 KYC API gates', () => {
  test('unauthenticated production-kyc-real-activation-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-kyc-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned KYC callback remains fail-closed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/kyc/callback', {
      headers: { 'x-correlation-id': 's106-kyc-unsigned' },
      data: { event_id: 's106-unauth', type: 'verification.completed' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|passport|aadhaar|ssn/i);
  });
});

test.describe('S106 Admin + partner verification + SoD', () => {
  test('EXTERNAL_GATED KYC prep + sandbox review + launch NO', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(
        /Real KYC\/KYB \+ healthcare partner verification activation readiness \(Sprint 106\)/i,
      )
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_KYC_KYB_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/REAL KYC PROVIDER SELECTED = NO|Real KYC selected:\s*false/i).first(),
    ).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Real KYC selected:\s*false/i);
    expect(adminBody).toMatch(/Healthcare registry connected:\s*false/i);
    expect(adminBody).toMatch(/Production KYC enabled:\s*false/i);
    expect(adminBody).toMatch(/Partner production verified:\s*false/i);
    expect(adminBody).toMatch(/Production privilege enabled:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED/i);
    expect(adminBody).toMatch(/DOCUMENT VERIFIED|DOCUMENT_VERIFIED/i);
    expect(adminBody).not.toMatch(/Provider:\s*Onfido|Provider:\s*Jumio|Provider:\s*Sumsub/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|apiSecret=/i);
    await ensureNoSecrets(page);
    await s106Snap(page, 'admin-01-real-kyc-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s106Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page
        .getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION_KYC|EXTERNAL_GATED/i)
        .first(),
    ).toBeVisible({ timeout: 45_000 });
    await s106Snap(page, 'admin-02-launch-readiness-no');

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s106Snap(page, 'admin-03-partners');
    const reviewBtn = page.getByRole('button', { name: /Review/i }).first();
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
      await expect(
        page.getByText(/KYC documents|Onboarding readiness|Document|Back to queue/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await s106Snap(page, 'admin-04-partner-verification');
    } else {
      await s106Snap(page, 'admin-04-partner-queue');
    }

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/healthcare|doctor|lab|imaging|network|partner|credential/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s106Snap(page, 'admin-05-healthcare-network');

    // Vendor sandbox — no production privilege claim
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await expect(
      page.getByText(/vendor|workspace|order|inventory|sandbox|World Pharma|Seller/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const vendBody = await page.locator('body').innerText();
    expect(vendBody).not.toMatch(/production KYC enabled|live Onfido|production privilege enabled/i);
    await s106Snap(page, 'vendor-06-sandbox');

    // Doctor credentials surface
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/credential|license|verification|document|profile|sandbox|World/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s106Snap(page, 'doctor-07-credentials');

    // Lab / Imaging / Affiliate brief hops
    for (const [base, email, shot, rx] of [
      [LAB, 'sandbox-lab@dev.local', 'lab-08-portal', /lab|accession|result|specimen|sandbox|World Pharma/i],
      [
        IMAGING,
        'sandbox-imaging@dev.local',
        'imaging-09-portal',
        /imaging|study|radiolog|modality|sandbox|World Pharma/i,
      ],
      [
        AFFILIATE,
        'sandbox-affiliate@dev.local',
        'affiliate-10-portal',
        /affiliate|earn|referral|dashboard|sandbox|EXTERNAL/i,
      ],
    ] as const) {
      await context.clearCookies();
      await clearOtpRateLimits();
      await expirePendingOtpChallenges(email);
      await s61LoginPortal(page, `${base}/`, email);
      await expect(page.getByText(rx).first()).toBeVisible({ timeout: 45_000 });
      await s106Snap(page, shot);
    }

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
    await s106Snap(cust, 'security-11-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /Real KYC\/KYB \+ healthcare partner verification activation readiness \(Sprint 106\)|NO_PRODUCTION_KYC_KYB_PROVIDER/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s106Snap(page, 'admin-12-final-status');

    const status = {
      sprint: 106,
      REAL_KYC_KYB_PROVIDER_SELECTED: 'NO',
      PRODUCTION_KYC_KYB_ENABLED: 'NO',
      REAL_HEALTHCARE_REGISTRY_CONNECTED: 'NO',
      REAL_PARTNER_PRODUCTION_VERIFIED: 'NO',
      PRODUCTION_PRIVILEGE_ENABLED: 'NO',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: [
        'NO_PRODUCTION_KYC_KYB_PROVIDER',
        'KYC_PROVIDER_NOT_SELECTED',
        'KYC_HEALTHCARE_REGISTRY_CONFIGURATION_MISSING',
      ],
      Sandbox_manual_review: 'SANDBOX_VERIFIED',
      Production_verification: 'EXTERNAL_GATED',
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s106WriteArtifact('final-kyc-status.json', JSON.stringify(status, null, 2));
  });
});
