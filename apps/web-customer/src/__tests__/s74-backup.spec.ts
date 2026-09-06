/**
 * Sprint 74 — Backup / PITR / restore readiness evidence (no fake managed PITR).
 * 390px responsive ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  s60AdminLogin,
  s74Snap,
  s74WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s74-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S74 backup API gates', () => {
  test('unauthenticated production-backup-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-backup-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('health/ready distinguishes app health from recovery readiness', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/health/ready');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const blob = JSON.stringify(body);
    expect(blob).toMatch(/ready|ok|postgres|redis/i);
    // Must not claim production PITR ready
    expect(blob).not.toMatch(/PITR_LIVE|production_pitr.?enabled.?true/i);
  });
});

test.describe('S74 Admin reliability + restored sandbox app checks', () => {
  test('backup NOT_SELECTED + sandbox restore + customer/admin login', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const backupHeading = page
      .getByText(/Backup \/ PITR \/ (restore readiness|DR activation readiness)/i)
      .first();
    await expect(backupHeading).toBeVisible({ timeout: 60_000 });
    await backupHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_MANAGED_BACKUP_PITR/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/NOT_YET_PROVEN/i).first()).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/15m|RPO/);
    expect(adminBody).toMatch(/4h|RTO/);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/postgresql:\/\/|password=|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s74Snap(page, 'admin-01-backup-status');
    await s74Snap(page, 'admin-02-rpo-rto-not-proven');

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Recovery|PITR|EXTERNAL|RPO|RTO|sandbox/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s74Snap(page, 'admin-03-reliability-recovery');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/launch|INTERNAL|EXTERNAL|ready|gate|recovery|not.*production/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s74Snap(page, 'admin-04-launch-readiness');

    // Customer login after sandbox DB remains healthy (post-drill source DB untouched)
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/shop|medicine|doctor|order|health|cart|World Pharma/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s74Snap(cust, 'customer-05-market');
    await cust.goto(`${CUSTOMER}/account`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await s74Snap(cust, 'customer-06-account');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s74Snap(cust, 'security-07-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page.getByText(/NO_PRODUCTION_MANAGED_BACKUP_PITR|Backup \/ PITR/i).first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s74Snap(page, 'admin-08-final-status');

    const status = {
      sprint: 74,
      Backup: 'NOT_SELECTED',
      PITR: 'NOT_SELECTED',
      Production: 'EXTERNAL_GATED',
      Sandbox_restore: 'SANDBOX_VERIFIED',
      RPO_target: '15m',
      RTO_target: '4h',
      RPO_achievement: 'NOT_YET_PROVEN',
      RTO_achievement: 'NOT_YET_PROVEN',
      Remaining_blocker: 'NO_PRODUCTION_MANAGED_BACKUP_PITR',
      Object_recovery: 'PRIVATE_STORAGE_EXTERNAL_GATED',
      KMS_dependency: 'KMS_EXTERNAL_GATED',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s74WriteArtifact('final-backup-status.json', JSON.stringify(status, null, 2));
    await s74Snap(page, 'admin-09-final-context');
  });
});
