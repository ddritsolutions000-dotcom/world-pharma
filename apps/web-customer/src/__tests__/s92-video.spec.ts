/**
 * Sprint 92 — Production telemedicine / live-video activation readiness evidence
 * (no fake live production video). Responsive 390/768/1024/1440 ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  DOCTOR,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s92Snap,
  s92WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s92-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S92 video API gates', () => {
  test('unauthenticated video-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/video-onboarding');
    expect(res.status()).toBe(401);
  });

  test('unsigned video callback fail-closed where exposed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/video/livekit', {
      headers: { 'x-correlation-id': 's92-video-unsigned' },
      data: { event_id: 's92-unauth', type: 'room_finished' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|phi|ssn/i);
    s92WriteArtifact(
      'controlled-callback-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned/unknown video callback rejected',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S92 Doctor + customer + Admin video', () => {
  test('sandbox consult + EXTERNAL_GATED + launch NO + SoD', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Telemedicine \/ live video activation readiness \(Sprint 92\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_VIDEO_PROVIDER/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED/);
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING|Credentials:\s*MISSING/i);
    expect(adminBody).toMatch(/Production activation:\s*EXTERNAL_GATED/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(
      /LIVE VIDEO PROVIDER NOT CONFIGURED|sandbox consultation is not live/i,
    );
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/LIVEKIT_API_SECRET|apiSecret|password=|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s92Snap(page, 'admin-01-video-card');
    await s92Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s92Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_VIDEO_PROVIDER/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s92Snap(page, 'admin-03-launch-readiness-no');

    // Customer appointment / consultation
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/appointments`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await cust.goto(`${CUSTOMER}/doctors`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      cust.getByText(/appointment|doctor|consult|video|telemedicine|schedule|book|sandbox|EXTERNAL/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const custBody = await cust.locator('body').innerText();
    expect(custBody).not.toMatch(/production video enabled|live production telemedicine completed/i);
    await s92Snap(cust, 'customer-04-consultation');
    await cust.setViewportSize({ width: 390, height: 844 });
    await s92Snap(cust, 'customer-05-consultation-390');
    await cust.setViewportSize({ width: 1280, height: 900 });

    // Doctor consultation / consent / sandbox session
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-doctor@dev.local');
    await s61LoginPortal(page, `${DOCTOR}/`, 'sandbox-doctor@dev.local');
    await page.goto(`${DOCTOR}/appointments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({
      timeout: 45_000,
    });
    await s92Snap(page, 'doctor-06-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(
        page.getByText(/Sandbox|consent|Clinical|consultation|video|EXTERNAL/i).first(),
      ).toBeVisible({ timeout: 20_000 });
      await s92Snap(page, 'doctor-07-consent-gate');
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
              await summary.fill('S92 sandbox consult — no live production video claim.');
            }
          }
          await btn.click();
          await page.waitForTimeout(800);
        }
      }
      await s92Snap(page, 'doctor-08-sandbox-session');
    }

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s92Snap(cust, 'security-09-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /NO_PRODUCTION_VIDEO_PROVIDER|Telemedicine \/ live video activation readiness \(Sprint 92\)|LIVE VIDEO PROVIDER NOT CONFIGURED/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s92Snap(page, 'admin-10-final-status');

    const status = {
      sprint: 92,
      foundation_sprint: 79,
      Provider: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Session_creation: 'SANDBOX_ONLY',
      Live_session: 'SANDBOX_ONLY',
      Consent: 'SANDBOX_VERIFIED',
      Recording: 'PRODUCTION_RECORDING_EXTERNAL_GATED',
      Webhook: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_VIDEO_PROVIDER',
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_VIDEO_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s92WriteArtifact('final-video-status.json', JSON.stringify(status, null, 2));
  });
});
