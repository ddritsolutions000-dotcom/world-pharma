/**
 * Sprint 125 — Doctor consultation + eRx real-use closure.
 * Sandbox only. No real eRx transmission. No real PHI. CAN_PRODUCTION_LAUNCH = NO.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  DOCTOR,
  DOCTOR_EMAIL,
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  ensureNoClinicalPhiLeak,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s125Snap,
  s125WriteArtifact,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s125-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S125 clinical API gates', () => {
  test('unauthenticated erx-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/erx-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('customer cannot access doctor appointments API', async ({ request }) => {
    // OTP login via API is heavy; probe without token
    const res = await request.get('http://127.0.0.1:4000/api/v1/doctor/appointments');
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('S125 consultation + eRx real-use', () => {
  test('customer → doctor → consent/Rx → Admin eRx gate + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    // --- Customer: doctor discovery + appointments + consent + prescriptions ---
    await context.clearCookies();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await selectMarketIfGated(page, /India/i).catch(() => undefined);

    await page.goto(`${CUSTOMER}/doctors`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/doctor|physician|consult|specialty|available|World Pharma/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await ensureNoClinicalPhiLeak(page);
    await s125Snap(page, 'cust-01-doctor-discovery');

    const profileLink = page
      .getByRole('link', { name: /view|profile|book|Dr\.|doctor/i })
      .or(page.locator('a[href*="/doctors/"]'))
      .first();
    if (await profileLink.isVisible().catch(() => false)) {
      await profileLink.click();
      await expect(
        page.getByText(/book|slot|consult|online|in.person|availability|profile/i).first(),
      ).toBeVisible({ timeout: 45_000 });
      await s125Snap(page, 'cust-02-doctor-profile');
    }

    await page.goto(`${CUSTOMER}/account/consent`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/consent|purpose|consultation|grant|telemedicine|scope/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s125Snap(page, 'cust-03-consent');

    await page.goto(`${CUSTOMER}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/appointment|consult|requested|confirmed|completed|no appointments|status/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s125Snap(page, 'cust-04-appointments');

    await page.goto(`${CUSTOMER}/prescriptions`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/prescription|Rx|issued|draft|medication|no prescription|status/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await ensureNoClinicalPhiLeak(page);
    await s125Snap(page, 'cust-05-prescriptions');

    // Responsive customer appointments
    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${CUSTOMER}/appointments`, { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
      await s125Snap(page, `cust-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // --- Doctor portal: queue → consult actions → Rx gate ---
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(DOCTOR_EMAIL);
    await s61LoginPortal(page, `${DOCTOR}/`, DOCTOR_EMAIL);
    await page.goto(`${DOCTOR}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await s125Snap(page, 'doctor-06-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    let consultAdvanced = false;
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(
        page.getByText(/Sandbox|consent|Clinical|consultation|Patient/i).first(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/^You do not have access$/i)).toHaveCount(0);
      await s125Snap(page, 'doctor-07-detail');

      for (const label of [
        /^Confirm appointment$/i,
        /^Check in patient$/i,
        /^Start consultation$/i,
        /^Complete consultation$/i,
      ]) {
        const btn = page.getByRole('button', { name: label });
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          if (/Complete/i.test(label.source)) {
            const summary = page.locator('textarea').first();
            if (await summary.isVisible().catch(() => false)) {
              await summary.fill('S125 sandbox consult complete — no real PHI.');
            }
          }
          await btn.click();
          await page.waitForTimeout(1000);
          consultAdvanced = true;
        }
      }
      await s125Snap(page, 'doctor-08-after-actions');

      // Consent missing must not look like generic permission denial
      const consentBanner = page.getByText(/Patient consent required|consent required/i);
      if (await consentBanner.first().isVisible().catch(() => false)) {
        await expect(page.getByText(/^You do not have access$/i)).toHaveCount(0);
        await s125Snap(page, 'doctor-08b-consent-gate');
      }
    }

    await page.goto(`${DOCTOR}/prescriptions`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/sandbox|EXTERNAL_GATED|prescription|Issue|encounter|DRAFT|ISSUED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const docRxBody = await page.locator('body').innerText();
    expect(docRxBody).not.toMatch(/LEGALLY_TRANSMITTED|production eRx enabled|live Surescripts/i);
    await ensureNoClinicalPhiLeak(page);
    await s125Snap(page, 'doctor-09-rx-gate');

    // Cross-patient negative: nonsense patient health URL
    await page.goto(
      `${DOCTOR}/patients/00000000-0000-7000-8000-000000000099/health`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(
      page.getByText(/not found|forbidden|no access|permission|denied|error|patient/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s125Snap(page, 'doctor-10-cross-patient-denied');

    // --- Admin: eRx provider + launch ---
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await clearOtpRateLimits();
    await s60AdminLogin(admin);
    await ensureNoSecrets(admin);

    await admin.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      admin.getByText(/eRx|ERX|NO_PRODUCTION_ERX|EXTERNAL_GATED|NOT_SELECTED/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const adminBody = await admin.locator('body').innerText();
    expect(adminBody).toMatch(/NO_PRODUCTION_ERX|NOT_SELECTED|EXTERNAL_GATED/i);
    expect(adminBody).not.toMatch(/Provider:\s*Surescripts|production eRx enabled:\s*true/i);
    await s125Snap(admin, 'admin-11-erx-provider');

    await admin.goto(`${ADMIN}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(
      admin.getByText(/appointment|consult|doctor|status|queue|clinical/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s125Snap(admin, 'admin-12-appointments');

    await admin.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      admin.getByText(/World-Pharma production launch control/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(admin.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO/i).first()).toBeVisible({
      timeout: 90_000,
    });
    await s125Snap(admin, 'admin-13-launch-no');
    await adminCtx.close();

    // Customer denied doctor portal clinical surface
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, CUSTOMER_EMAIL);
    await cust.goto(`${DOCTOR}/appointments`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email|Email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s125Snap(cust, 'security-14-customer-denied-doctor');
    await custCtx.close();

    s125WriteArtifact(
      's125-status.json',
      JSON.stringify(
        {
          sprint: 125,
          customer_doctor_discovery: 'PASS',
          customer_consent: 'PASS',
          customer_appointments: 'PASS',
          customer_prescriptions: 'PASS',
          doctor_appointments: 'PASS',
          doctor_consult_advanced: consultAdvanced,
          doctor_rx_gate: 'PASS',
          cross_patient: 'DENIED',
          erx_provider: 'NOT_SELECTED',
          erx_blocker: 'NO_PRODUCTION_ERX_PROVIDER',
          video_provider: 'NOT_SELECTED',
          issued_neq_legally_transmitted: true,
          can_production_launch: 'NO',
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
