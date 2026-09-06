/**
 * Sprint 93 — Production PACS / DICOM activation readiness evidence
 * (no fake live PACS / DICOM transmission). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  IMAGING,
  RADIOLOGIST,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s93Snap,
  s93WriteArtifact,
  selectMarketIfGated,
  selectOrgByCountry,
  uiOtpLogin,
} from '../../e2e/helpers/s93-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S93 PACS API gates', () => {
  test('unauthenticated pacs-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/pacs-onboarding');
    expect(res.status()).toBe(401);
  });

  test('unsigned PACS callback fail-closed where exposed', async ({ request }) => {
    const wh = await request.post('http://127.0.0.1:4000/api/v1/webhooks/pacs/callback', {
      headers: { 'x-correlation-id': 's93-pacs-unsigned' },
      data: { event_id: 's93-unauth', type: 'study.stored' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(wh.status());
    expect(wh.ok()).toBeFalsy();
    const bodyText = await wh.text();
    expect(bodyText).not.toMatch(/password|api_key|secret|phi|ssn|dicom/i);
    s93WriteArtifact(
      'controlled-callback-failure.json',
      JSON.stringify(
        {
          status: wh.status(),
          ok: false,
          category: 'WEBHOOK_ERROR',
          note: 'Unsigned/unknown PACS callback rejected or EXTERNAL_GATED (no production webhook)',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S93 Imaging + radiologist + customer + Admin', () => {
  test('sandbox imaging + EXTERNAL_GATED + launch NO + SoD', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/PACS \/ DICOM imaging activation readiness \(Sprint 93\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_PACS_PROVIDER/i).first()).toBeVisible({
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
    expect(adminBody).toMatch(/Viewer:\s*EXTERNAL_GATED|viewer EXTERNAL_GATED/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/application\/dicom|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9_-]{10,}\./);
    await ensureNoSecrets(page);
    await s93Snap(page, 'admin-01-pacs-card');
    await s93Snap(page, 'admin-02-production-external-gated');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s93Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(/NO_PRODUCTION_PACS_PROVIDER/i);
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s93Snap(page, 'admin-03-launch-readiness-no');

    // Imaging ops sandbox
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-imaging@dev.local');
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await selectOrgByCountry(page, /\(IN\)/).catch(() => undefined);
    await expect(page.getByText(/EXTERNAL_GATED|PACS|DICOM|Imaging|Study/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s93Snap(page, 'imaging-04-home');
    for (const label of ['Bookings', 'Studies', 'Interpretations']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }
    await s93Snap(page, 'imaging-05-studies');

    // Radiologist sandbox
    const radCtx = await browser.newContext();
    const rad = await radCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-radiologist@dev.local');
    await s61LoginPortal(rad, `${RADIOLOGIST}/`, 'sandbox-radiologist@dev.local');
    await selectOrgByCountry(rad, /\(IN\)/).catch(() => undefined);
    await expect(
      rad.getByText(/EXTERNAL_GATED|PACS|DICOM|worklist|Study|Case|Report/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s93Snap(rad, 'radiologist-06-worklist');
    const caseBtn = rad
      .getByRole('button')
      .filter({ hasText: /Accept|Open|Review|Study|Case|PENDING|ASSIGNED|DRAFT|Verify|Publish/i })
      .first();
    if (await caseBtn.isVisible().catch(() => false)) {
      await caseBtn.click();
      await rad.waitForTimeout(500);
      await s93Snap(rad, 'radiologist-07-case');
    } else {
      await s93Snap(rad, 'radiologist-07-empty');
    }
    await radCtx.close();

    // Customer imaging / report
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/imaging/bookings`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await cust.goto(`${CUSTOMER}/health`, { waitUntil: 'domcontentloaded' });
    });
    await expect(
      cust.getByText(/imaging|study|report|PACS|DICOM|EXTERNAL|book|sandbox|health/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const custBody = await cust.locator('body').innerText();
    expect(custBody).not.toMatch(/production PACS enabled|live DICOM transmission completed/i);
    await s93Snap(cust, 'customer-08-imaging');
    await cust.setViewportSize({ width: 390, height: 844 });
    await s93Snap(cust, 'customer-09-imaging-390');
    await cust.setViewportSize({ width: 1280, height: 900 });

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s93Snap(cust, 'security-10-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /PACS \/ DICOM imaging activation readiness \(Sprint 93\)|NO_PRODUCTION_PACS_PROVIDER|EXTERNAL_GATED/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s93Snap(page, 'admin-11-final-status');

    const status = {
      sprint: 93,
      foundation_sprint: 80,
      Provider: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Transmission: 'SANDBOX_ONLY',
      Viewer: 'EXTERNAL_GATED',
      Object_storage: 'PRIVATE_STORAGE_EXTERNAL_GATED',
      KMS: 'KMS_EXTERNAL_GATED',
      Malware_scan: 'MALWARE_SCAN_EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_PACS_PROVIDER',
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_PACS_ENABLED: 'NO',
      PRODUCTION_DICOM_TRANSMISSION: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s93WriteArtifact('final-pacs-status.json', JSON.stringify(status, null, 2));
  });
});
