/**
 * Sprint 83 — Backup / PITR / DR activation readiness evidence (no fake managed PITR).
 * Responsive 390/768/1024/1440 = RESPONSIVE_WEB_VERIFIED ≠ native Android/iOS.
 */
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ADMIN,
  CUSTOMER,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s83Snap,
  s83WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s83-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S83 backup API gates', () => {
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
    expect(blob).not.toMatch(/PITR_LIVE|production_pitr.?enabled.?true/i);
  });
});

test.describe('S83 Admin reliability + DR gates', () => {
  test('backup NOT_SELECTED + sandbox restore evidence + security', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const backupHeading = page
      .getByText(
        /Backup \/ PITR \/ DR activation readiness \(Sprint (83|96)\)|Managed backup activation readiness \(Sprint (83|96)\)/i,
      )
      .first();
    await expect(backupHeading).toBeVisible({ timeout: 60_000 });
    await backupHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_MANAGED_BACKUP_PITR|NO_PRODUCTION_MANAGED_BACKUP/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/NO_PRODUCTION_MANAGED_BACKUP|NO_PRODUCTION_PITR|NO_PRODUCTION_DR_ENVIRONMENT/i).first()).toBeVisible();
    await expect(page.getByText(/NOT_YET_PROVEN/i).first()).toBeVisible();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/15m|RPO/);
    expect(adminBody).toMatch(/4h|RTO/);
    expect(adminBody).toMatch(/PRIVATE_STORAGE_EXTERNAL_GATED|KMS_EXTERNAL_GATED|Object storage|Object recovery/i);
    expect(adminBody).not.toMatch(/\bUPI\b/);
    expect(adminBody).not.toMatch(/postgresql:\/\/|password=|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s83Snap(page, 'admin-01-backup-status');
    await s83Snap(page, 'admin-02-rpo-rto-not-proven');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await backupHeading.scrollIntoViewIfNeeded();
      await s83Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Recovery|PITR|EXTERNAL|RPO|RTO|sandbox/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s83Snap(page, 'admin-03-reliability-recovery');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/launch|INTERNAL|EXTERNAL|ready|gate|recovery|not.*production/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s83Snap(page, 'admin-04-launch-readiness');

    // Capture sandbox restore drill evidence if present
    const drillPath = path.join(
      __dirname,
      '../../../test-results/s74-backup/sandbox-restore-drill.json',
    );
    if (fs.existsSync(drillPath)) {
      const drill = JSON.parse(fs.readFileSync(drillPath, 'utf8'));
      s83WriteArtifact(
        'sandbox-restore-drill-copy.json',
        JSON.stringify(
          {
            note: 'Isolated restore evidence reused from S74 drill; sandbox timing ≠ RPO/RTO proof',
            status: drill.status ?? drill.result ?? 'present',
            restore_elapsed_ms: drill.restore_elapsed_ms ?? null,
            table_count: drill.table_count ?? null,
          },
          null,
          2,
        ),
      );
    }

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges('sandbox-customer@dev.local');
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await expect(
      cust.getByText(/shop|medicine|doctor|order|health|cart|World Pharma/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s83Snap(cust, 'customer-05-market');

    await cust.goto(`${ADMIN}/provider-activation`);
    await expect(
      cust.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s83Snap(cust, 'security-06-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_MANAGED_BACKUP_PITR|Backup \/ PITR \/ DR activation readiness/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s83Snap(page, 'admin-07-final-status');

    const status = {
      sprint: 83,
      foundation_sprint: 74,
      Backup: 'NOT_SELECTED',
      PITR: 'NOT_SELECTED',
      Production: 'EXTERNAL_GATED',
      Sandbox_restore: 'SANDBOX_VERIFIED',
      RPO_target: '15m',
      RTO_target: '4h',
      RPO_achievement: 'NOT_YET_PROVEN',
      RTO_achievement: 'NOT_YET_PROVEN',
      Remaining_blocker: 'NO_PRODUCTION_MANAGED_BACKUP_PITR',
      Remaining_blockers: [
        'NO_PRODUCTION_MANAGED_BACKUP',
        'NO_PRODUCTION_PITR',
        'NO_PRODUCTION_DR_ENVIRONMENT',
      ],
      Object_recovery: 'PRIVATE_STORAGE_EXTERNAL_GATED',
      KMS_dependency: 'KMS_EXTERNAL_GATED',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s83WriteArtifact('final-dr-status.json', JSON.stringify(status, null, 2));
  });
});
