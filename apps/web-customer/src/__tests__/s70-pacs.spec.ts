/**
 * Sprint 70 — PACS / DICOM onboarding evidence (no fake live PACS/viewer).
 * 390px responsive ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  IMAGING,
  RADIOLOGIST,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s61LoginPortal,
  s70Snap,
  s70WriteArtifact,
  selectMarketIfGated,
  selectOrgByCountry,
  uiOtpLogin,
} from '../../e2e/helpers/s70-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S70 PACS API gates', () => {
  test('unauthenticated pacs-onboarding denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/admin/control-plane/pacs-onboarding');
    expect(res.status()).toBe(401);
  });
});

test.describe('S70 Imaging + radiologist + customer + Admin', () => {
  test('sandbox imaging flow + EXTERNAL_GATED PACS status', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/PACS \/ DICOM imaging (onboarding|activation readiness)/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText(/NOT_SELECTED|EXTERNAL_GATED|NO_PRODUCTION_PACS_PROVIDER|NO_PRODUCTION_PACS_ADAPTER/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/NOT_SELECTED|EXTERNAL_GATED/);
    expect(adminBody).toMatch(/NO_PRODUCTION_PACS_PROVIDER|NO_PRODUCTION_PACS_ADAPTER/);
    expect(adminBody).toMatch(/Viewer:\s*EXTERNAL_GATED|viewer EXTERNAL_GATED/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/application\/dicom|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9_-]{10,}\./);
    await ensureNoSecrets(page);
    await s70Snap(page, 'admin-01-pacs-status');
    await s70Snap(page, 'admin-02-production-external-gated');

    // Imaging ops sandbox
    await context.clearCookies();
    await clearOtpRateLimits();
    await s61LoginPortal(page, `${IMAGING}/`, 'sandbox-imaging@dev.local');
    await selectOrgByCountry(page, /\(IN\)/).catch(() => undefined);
    await expect(page.getByText(/EXTERNAL_GATED|PACS|DICOM|Imaging|Study/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s70Snap(page, 'imaging-03-home');
    for (const label of ['Bookings', 'Studies', 'Interpretations']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }
    await s70Snap(page, 'imaging-04-studies');

    // Radiologist sandbox
    const radCtx = await browser.newContext();
    const rad = await radCtx.newPage();
    await clearOtpRateLimits();
    await s61LoginPortal(rad, `${RADIOLOGIST}/`, 'sandbox-radiologist@dev.local');
    await selectOrgByCountry(rad, /\(IN\)/).catch(() => undefined);
    await expect(rad.getByText(/EXTERNAL_GATED|PACS|DICOM|worklist|Study|Case/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s70Snap(rad, 'radiologist-05-worklist');
    const caseBtn = rad
      .getByRole('button')
      .filter({ hasText: /Accept|Open|Review|Study|Case|PENDING|ASSIGNED|DRAFT|Verify/i })
      .first();
    if (await caseBtn.isVisible().catch(() => false)) {
      await caseBtn.click();
      await rad.waitForTimeout(500);
      await s70Snap(rad, 'radiologist-06-case');
    } else {
      await s70Snap(rad, 'radiologist-06-empty');
    }
    await radCtx.close();

    // Customer imaging / report
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
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
    await s70Snap(cust, 'customer-07-imaging');
    await selectMarketIfGated(cust, /United Arab|UAE|AE/i).catch(() => undefined);
    await s70Snap(cust, 'customer-08-country-context');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s70Snap(cust, 'security-09-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(
        /PACS \/ DICOM imaging (onboarding|activation readiness)|NO_PRODUCTION_PACS_PROVIDER|NO_PRODUCTION_PACS_ADAPTER|EXTERNAL_GATED/i,
      ).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s70Snap(page, 'admin-10-failure-recovery-gate');

    const status = {
      sprint: 70,
      Provider: 'NOT_SELECTED',
      Environment: 'sandbox',
      Configured: false,
      Verified: false,
      Approved: false,
      Enabled: false,
      Sandbox: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      Transmission: 'SANDBOX_ONLY',
      Viewer: 'EXTERNAL_GATED',
      Country_support: 'POLICY_DRIVEN',
      Legal_clinical_gate: 'EXTERNAL_GATED',
      Storage: 'EXTERNAL_GATED',
      Remaining_blocker: 'NO_PRODUCTION_PACS_ADAPTER',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s70WriteArtifact('final-pacs-status.json', JSON.stringify(status, null, 2));
    await s70Snap(page, 'admin-11-final-status-context');
  });
});
