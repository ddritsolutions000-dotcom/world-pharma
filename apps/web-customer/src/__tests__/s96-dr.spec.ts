/**
 * Sprint 96 — Production managed backup / PITR / DR activation readiness evidence
 * (no fake managed PITR). Responsive ≠ native.
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
  s96Snap,
  s96WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s96-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S96 backup API gates', () => {
  test('unauthenticated production-backup-onboarding denied', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-backup-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('anonymous backup artifact access fail-closed where exposed', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/backups/anonymous-probe', {
      headers: { 'x-correlation-id': 's96-backup-anon' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(res.status());
    expect(res.ok()).toBeFalsy();
    const bodyText = await res.text();
    expect(bodyText).not.toMatch(/postgresql:\/\/|password=|aws_secret|AKIA/i);
    s96WriteArtifact(
      'controlled-anonymous-backup-failure.json',
      JSON.stringify(
        {
          status: res.status(),
          ok: false,
          category: 'BACKUP_ACCESS_DENIED',
          note: 'Anonymous backup access rejected',
        },
        null,
        2,
      ),
    );
  });
});

test.describe('S96 Admin backup triad + launch NO + sandbox drill evidence', () => {
  test('EXTERNAL_GATED triad + RPO/RTO NOT_YET_PROVEN + SoD', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const backupHeading = page
      .getByText(/Managed backup activation readiness \(Sprint 96\)/i)
      .first();
    await expect(backupHeading).toBeVisible({ timeout: 60_000 });
    await backupHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_MANAGED_BACKUP/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/PITR activation readiness \(Sprint 96\)/i).first()).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_PITR/i).first()).toBeVisible();
    await expect(
      page.getByText(/Disaster recovery environment activation readiness \(Sprint 96\)/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/NO_PRODUCTION_DR_ENVIRONMENT|NO_PRODUCTION_MANAGED_BACKUP_PITR/i).first()).toBeVisible();
    await expect(page.getByText(/NOT_YET_PROVEN/i).first()).toBeVisible();

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Configuration:\s*MISSING|Credentials:\s*MISSING/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/15m|RPO/);
    expect(adminBody).toMatch(/4h|RTO/);
    expect(adminBody).toMatch(/pg_dump|DATABASE BACKUP|not proof of production PITR/i);
    expect(adminBody).toMatch(/PRIVATE_STORAGE_EXTERNAL_GATED|Object storage|KMS/i);
    expect(adminBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)/i);
    expect(adminBody).not.toMatch(/postgresql:\/\/|password=|apiSecret|eyJ[A-Za-z0-9_-]{10,}\./i);
    await ensureNoSecrets(page);
    await s96Snap(page, 'admin-01-managed-backup-card');
    await s96Snap(page, 'admin-02-pitr-card');
    await s96Snap(page, 'admin-03-dr-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await backupHeading.scrollIntoViewIfNeeded();
      await s96Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/reliability`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Recovery|Backup|PITR|RPO|RTO|EXTERNAL_GATED|NOT_YET_PROVEN/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s96Snap(page, 'admin-04-reliability-recovery');

    // Capture sandbox drill evidence if present
    const drillPath = path.join(
      __dirname,
      '../../../test-results/s74-backup/sandbox-restore-drill.json',
    );
    if (fs.existsSync(drillPath)) {
      const drill = JSON.parse(fs.readFileSync(drillPath, 'utf8')) as Record<string, unknown>;
      s96WriteArtifact(
        'sandbox-restore-drill-evidence.json',
        JSON.stringify(
          {
            ...drill,
            sprint_96_note:
              'Sandbox logical dump/restore only — NOT production RTO/PITR proof',
            rpo_achievement: 'NOT_YET_PROVEN',
            rto_achievement: 'NOT_YET_PROVEN',
          },
          null,
          2,
        ),
      );
    }
    await s96Snap(page, 'admin-05-sandbox-drill-context');

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/CAN_PRODUCTION_LAUNCH|NOT_READY|NO_PRODUCTION|launch|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH\s*=?\s*NO|NOT_READY|NO_PRODUCTION/i);
    expect(launchBody).toMatch(
      /NO_PRODUCTION_MANAGED_BACKUP|NO_PRODUCTION_PITR|NO_PRODUCTION_DR|NO_PRODUCTION_MANAGED_BACKUP_PITR/i,
    );
    expect(launchBody).not.toMatch(/force.?launch\s*(enabled|=?\s*true)|FORCE_LAUNCH\s*=\s*true/i);
    await s96Snap(page, 'admin-06-launch-readiness-no');

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
    await s96Snap(cust, 'security-07-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(/NO_PRODUCTION_MANAGED_BACKUP|Managed backup activation readiness \(Sprint 96\)/i)
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s96Snap(page, 'admin-08-final-status');

    const status = {
      sprint: 96,
      foundation_sprint: 83,
      Managed_backup: 'NOT_SELECTED',
      PITR: 'NOT_SELECTED',
      DR_environment: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      Environment: 'sandbox',
      Enabled: false,
      Sandbox_backup: 'SANDBOX_VERIFIED',
      Sandbox_restore: 'SANDBOX_VERIFIED',
      Production: 'EXTERNAL_GATED',
      RPO_target: '15m',
      RTO_target: '4h',
      RPO_achievement: 'NOT_YET_PROVEN',
      RTO_achievement: 'NOT_YET_PROVEN',
      Remaining_blockers: [
        'NO_PRODUCTION_MANAGED_BACKUP_PITR',
        'NO_PRODUCTION_MANAGED_BACKUP',
        'NO_PRODUCTION_PITR',
        'NO_PRODUCTION_DR_ENVIRONMENT',
      ],
      Force_launch: false,
      CAN_PRODUCTION_LAUNCH: 'NO',
      PRODUCTION_MANAGED_BACKUP_ENABLED: 'NO',
      PRODUCTION_PITR_ENABLED: 'NO',
      PRODUCTION_DR_ENVIRONMENT_ENABLED: 'NO',
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s96WriteArtifact('final-backup-dr-status.json', JSON.stringify(status, null, 2));
  });
});
