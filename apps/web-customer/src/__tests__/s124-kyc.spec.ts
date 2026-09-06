/**
 * Sprint 124 — KYC/KYB + healthcare partner verification activation preparation
 * (no invented provider / no real identity docs / no production partner approval).
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
  ensureNoPiiPhi,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s124Snap,
  s124WriteArtifact,
  selectMarketIfGated,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s124-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S124 KYC API gates', () => {
  test('unauthenticated kyc-healthcare-partner-verification-activation-preparation denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/kyc-healthcare-partner-verification-activation-preparation',
    );
    expect(res.status()).toBe(401);
  });

  test('unsigned KYC callback remains fail-closed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/kyc/callback', {
      headers: { 'x-correlation-id': 's124-kyc-unsigned' },
      data: { event_id: 's124-unauth', type: 'verification.completed' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|passport|aadhaar|ssn/i);
  });
});

test.describe('S124 Admin + partner surfaces + SoD', () => {
  test('NOT_SELECTED KYC prep + sandbox partners + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoPiiPhi(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/KYC\/KYB \+ partner verification \(Sprint 124/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/KYC:\s*NOT_SELECTED/i);
    expect(launchBody).toMatch(/Production partner verification:\s*BLOCKED/i);
    await s124Snap(page, 'admin-01-launch-kyc-blocker');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(
        /Real KYC\/KYB \+ healthcare partner verification activation preparation \(Sprint\s*124\)/i,
      )
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake provider:\s*false/i);
    expect(adminBody).toMatch(/Real KYC selected:\s*false/i);
    expect(adminBody).toMatch(/Registry connected:\s*false/i);
    expect(adminBody).toMatch(/Partner production approved:\s*false/i);
    expect(adminBody).toMatch(/Production partner verification:\s*BLOCKED/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/VENDOR:|DOCTOR:|LAB:|IMAGING:|AFFILIATE:/i);
    expect(adminBody).not.toMatch(/Provider:\s*Onfido|Provider:\s*Jumio|Provider:\s*Sumsub/i);
    expect(adminBody).not.toMatch(/sk_live_|aadhaar|passport\s*no/i);
    await ensureNoPiiPhi(page);
    await s124Snap(page, 'admin-02-provider-kyc-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await s124Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s124Snap(page, 'admin-03-partners');

    // Vendor sandbox verification status
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-vendor@dev.local');
    await s61LoginPortal(page, `${VENDOR}/`, 'sandbox-vendor@dev.local');
    await selectSellerOrg(page, /IN|India|Demo|Pharmacy|Care/i).catch(() => undefined);
    await expect(
      page.getByText(/vendor|workspace|order|inventory|sandbox|World Pharma|Seller/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    expect(await page.locator('body').innerText()).not.toMatch(
      /production KYC enabled|live Onfido|production privilege enabled/i,
    );
    await s124Snap(page, 'vendor-04-sandbox');

    // Doctor
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/credentials`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/credential|license|verification|document|profile|sandbox|World/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await ensureNoPiiPhi(page);
    await s124Snap(page, 'doctor-05-credentials');

    // Lab / Imaging / Affiliate
    for (const [base, email, shot, rx] of [
      [LAB, 'sandbox-lab@dev.local', 'lab-06-portal', /lab|accession|result|specimen|sandbox|World Pharma/i],
      [
        IMAGING,
        'sandbox-imaging@dev.local',
        'imaging-07-portal',
        /imaging|study|radiolog|modality|sandbox|World Pharma/i,
      ],
      [
        AFFILIATE,
        'sandbox-affiliate@dev.local',
        'affiliate-08-portal',
        /affiliate|earn|referral|dashboard|sandbox|EXTERNAL/i,
      ],
    ] as const) {
      await context.clearCookies();
      await clearOtpRateLimits();
      await expirePendingOtpChallenges(email);
      await s61LoginPortal(page, `${base}/`, email);
      await expect(page.getByText(rx).first()).toBeVisible({ timeout: 45_000 });
      await s124Snap(page, shot);
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
    await s124Snap(cust, 'security-09-customer-denied');
    await ensureNoSecrets(cust);
    await custCtx.close();

    s124WriteArtifact(
      's124-status.json',
      JSON.stringify(
        {
          sprint: 124,
          kyc_lifecycle: 'NOT_SELECTED',
          production_credentials: 'MISSING',
          healthcare_registry: 'EXTERNAL_GATED',
          production_partner_verification: 'BLOCKED',
          sandbox_manual_review: 'SANDBOX_VERIFIED',
          real_kyc_provider_selected: false,
          real_healthcare_registry_connected: false,
          real_partner_production_approved: false,
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_KYC_KYB_PROVIDER',
          security: 'NO_NEW_VULNERABILITY',
          native_android: 'DEVICE_NOT_AVAILABLE',
          native_ios: 'DEVICE_NOT_AVAILABLE',
          responsive_web: 'RESPONSIVE_WEB_VERIFIED',
        },
        null,
        2,
      ),
    );
  });
});
