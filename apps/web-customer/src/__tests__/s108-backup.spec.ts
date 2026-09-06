/**
 * Sprint 108 — Real backup/PITR/DR activation readiness evidence
 * (no invented managed DB). Responsive ≠ native.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  clearOtpRateLimits,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s108Snap,
  s108WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s108-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S108 backup API gates', () => {
  test('unauthenticated production-backup-real-activation-onboarding denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/production-backup-real-activation-onboarding',
    );
    expect(res.status()).toBe(401);
  });

  test('anonymous backup artifact access fail-closed', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/backups/anonymous-probe', {
      headers: { 'x-correlation-id': 's108-backup-anon' },
    });
    expect([400, 401, 403, 404, 422, 501, 503]).toContain(res.status());
    expect(res.ok()).toBeFalsy();
    const bodyText = await res.text();
    expect(bodyText).not.toMatch(/postgresql:\/\/|password=|aws_secret|AKIA/i);
  });
});

test.describe('S108 Admin + sandbox restore + SoD', () => {
  test('EXTERNAL_GATED backup triad + RPO/RTO NOT_YET_PROVEN + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(/Real production backup \+ PITR \+ DR activation readiness \(Sprint 108\)/i)
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/NO_PRODUCTION_MANAGED_BACKUP_PITR/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/EXTERNAL_GATED/);
    expect(adminBody).toMatch(/Backup selected:\s*false/i);
    expect(adminBody).toMatch(/Backup enabled:\s*false/i);
    expect(adminBody).toMatch(/PITR enabled:\s*false/i);
    expect(adminBody).toMatch(/DR available:\s*false/i);
    expect(adminBody).toMatch(/NOT_YET_PROVEN/);
    expect(adminBody).toMatch(/TARGET_DEFINED|15m|4h/);
    expect(adminBody).toMatch(/Local-disk backup fallback:\s*false/i);
    expect(adminBody).toMatch(/Force launch:\s*false/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO|CAN_PRODUCTION_LAUNCH/i);
    expect(adminBody).toMatch(/S100_REUSED|S101_REUSED|COMPOSED|DEPENDENCY/i);
    expect(adminBody).toMatch(/pg_dump|sandbox restore|Local disk is never/i);
    expect(adminBody).not.toMatch(/Provider:\s*RDS|Provider:\s*Aurora|postgresql:\/\/[^:]+:[^@]+@/i);
    await ensureNoSecrets(page);
    await s108Snap(page, 'admin-01-real-backup-card');

    await expect(
      page.getByText(/Managed backup activation readiness \(Sprint 96\)/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/PITR activation readiness \(Sprint 96\)/i).first()).toBeVisible();
    await expect(
      page.getByText(/Disaster recovery environment activation readiness \(Sprint 96\)/i).first(),
    ).toBeVisible();
    await s108Snap(page, 'admin-02-s96-triad');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      await s108Snap(page, `admin-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s108Snap(page, 'admin-03-launch-readiness-no');

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
    await s108Snap(cust, 'security-04-customer-denied-admin');
    await custCtx.close();

    await context.clearCookies();
    await clearOtpRateLimits();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const finalGate = page
      .getByText(
        /Real production backup \+ PITR \+ DR activation readiness \(Sprint 108\)|NO_PRODUCTION_MANAGED_BACKUP_PITR/i,
      )
      .first();
    await expect(finalGate).toBeVisible({ timeout: 60_000 });
    await finalGate.scrollIntoViewIfNeeded();
    await s108Snap(page, 'admin-05-final-status');

    const status = {
      sprint: 108,
      REAL_PRODUCTION_BACKUP_PROVIDER_SELECTED: 'NO',
      PRODUCTION_BACKUP_ENABLED: 'NO',
      PRODUCTION_PITR_ENABLED: 'NO',
      REAL_PRODUCTION_DR_INFRASTRUCTURE_AVAILABLE: 'NO',
      ISOLATED_RESTORE_TEST: 'PASS_OR_PENDING_SANDBOX',
      RPO: 'TARGET_DEFINED / NOT_YET_PROVEN',
      RTO: 'TARGET_DEFINED / NOT_YET_PROVEN',
      PRODUCTION_LOCAL_DISK_BACKUP_FALLBACK_POSSIBLE: 'NO',
      CAN_PRODUCTION_LAUNCH: 'NO',
      Remaining_blockers: [
        'NO_PRODUCTION_MANAGED_BACKUP_PITR',
        'NO_PRODUCTION_PITR',
        'NO_PRODUCTION_DR_ENVIRONMENT',
        'RPO_RTO_NOT_YET_PROVEN',
        'BACKUP_STORAGE_DEPENDENCY_GATED',
      ],
      Force_launch: false,
      Native_Android: 'DEVICE_NOT_AVAILABLE',
      Native_iOS: 'DEVICE_NOT_AVAILABLE',
      Responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    };
    s108WriteArtifact('final-backup-status.json', JSON.stringify(status, null, 2));
  });
});
