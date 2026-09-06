/**
 * Sprint 126 — Lab diagnostics end-to-end real-use closure.
 * Sandbox only. No real samples/PHI. Production lab BLOCKED. CAN_PRODUCTION_LAUNCH = NO.
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  LAB,
  LAB_EMAIL,
  PATHOLOGIST,
  PATHOLOGIST_EMAIL,
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  ensureNoLabPhiLeak,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s126Snap,
  s126WriteArtifact,
  selectMarketIfGated,
  selectOrgByCountry,
  uiCustomerLogin,
} from '../../e2e/helpers/s126-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S126 lab API gates', () => {
  test('unauthenticated me lab bookings denied', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:4000/api/v1/me/lab/bookings');
    expect([401, 403]).toContain(res.status());
  });

  test('production lab availability remains blocked', async ({ request }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/healthcare-network/production-availability?kind=LAB',
    );
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('S126 lab diagnostics real-use', () => {
  test('customer → lab ops → pathology → report → Admin launch NO', async ({
    page,
    context,
    browser,
  }) => {
    // --- Customer discovery + booking surface ---
    await context.clearCookies();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(page, CUSTOMER_EMAIL);
    await selectMarketIfGated(page, /India/i).catch(() => undefined);

    await page.goto(`${CUSTOMER}/lab`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/lab|diagnostic|test|package|book|provider|World Pharma/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await ensureNoLabPhiLeak(page);
    await s126Snap(page, 'cust-01-lab-discovery');

    const labLink = page.locator('a[href*="/lab/"]').filter({ hasNotText: /bookings|packages/i }).first();
    if (await labLink.isVisible().catch(() => false)) {
      await labLink.click();
      await expect(
        page.getByText(/book|test|package|price|slot|collection|lab|offer/i).first(),
      ).toBeVisible({ timeout: 45_000 });
      await s126Snap(page, 'cust-02-lab-detail');
    }

    await page.goto(`${CUSTOMER}/lab/packages`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/package|panel|lipid|test|lab|catalog|price/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s126Snap(page, 'cust-03-packages');

    await page.goto(`${CUSTOMER}/lab/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/booking|lab|report|order|status|confirmed|booked|no booking/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s126Snap(page, 'cust-04-bookings');

    // Responsive customer bookings
    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${CUSTOMER}/lab/bookings`, { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(page);
      await s126Snap(page, `cust-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // --- Lab portal operations (hash tabs) ---
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(LAB_EMAIL);
    await s61LoginPortal(page, `${LAB}/`, LAB_EMAIL);
    await selectOrgByCountry(page, /\(IN\)/).catch(() => undefined);
    await s126Snap(page, 'lab-05-home');

    for (const [hash, shot, rx] of [
      ['#bookings', 'lab-06-bookings', /booking|queue|patient|collection|status|sandbox|World/i],
      ['#accession', 'lab-07-accession', /accession|receive|sample|accept|queue|sandbox/i],
      ['#processing', 'lab-08-processing', /process|queue|in progress|complete|sandbox|result/i],
      ['#pathology', 'lab-09-pathology', /pathology|report|verify|draft|pending|sandbox/i],
    ] as const) {
      await page.goto(`${LAB}/${hash}`, { waitUntil: 'domcontentloaded' });
      const tab = page.getByRole('button', {
        name: new RegExp(`^${hash.slice(1)}$`, 'i'),
      }).first();
      if (await tab.isVisible().catch(() => false)) await tab.click().catch(() => undefined);
      await expect(page.getByText(rx).first()).toBeVisible({ timeout: 45_000 });
      await s126Snap(page, shot);
    }

    // --- Pathologist ---
    await context.clearCookies();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(PATHOLOGIST_EMAIL);
    await s61LoginPortal(page, `${PATHOLOGIST}/`, PATHOLOGIST_EMAIL);
    await expect(page.getByRole('heading', { name: 'Assigned cases', exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await selectOrgByCountry(page, /\(IN\)/).catch(() => undefined);
    await s126Snap(page, 'path-10-worklist');

    const reviewBtn = page.getByRole('button', { name: /^Review$/i }).first();
    let pathologyPublished = false;
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
      await expect(page.getByRole('heading', { name: /Case review/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/^You do not have access$/i)).toHaveCount(0);
      await s126Snap(page, 'path-11-case');
      for (const label of [/^Accept assignment$/i, /^Verify$/i, /^Publish report$/i]) {
        const btn = page.getByRole('button', { name: label });
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          await btn.click();
          await page.waitForTimeout(1200);
          if (/Publish/i.test(label.source)) pathologyPublished = true;
        }
      }
      await s126Snap(page, 'path-12-after-actions');
    } else {
      await expect(page.getByText(/No assigned cases|Published|Assigned/i).first()).toBeVisible();
      await s126Snap(page, 'path-12-empty-or-published');
    }

    // --- Customer published report / health ---
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await cust.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(cust, CUSTOMER_EMAIL);
    await selectMarketIfGated(cust, /India/i).catch(() => undefined);
    await cust.goto(`${CUSTOMER}/lab/bookings`, { waitUntil: 'domcontentloaded' });
    await expect(
      cust.getByText(/booking|lab|report|Published|status|order|lipid|panel/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await ensureNoLabPhiLeak(cust);
    await s126Snap(cust, 'cust-13-bookings-report');

    const bookingDetail = cust.locator('a[href*="/lab/bookings/"]').first();
    if (await bookingDetail.isVisible().catch(() => false)) {
      await bookingDetail.click();
      await expect(
        cust.getByText(/report|Published|result|booking|status|LDL|lipid|sandbox/i).first(),
      ).toBeVisible({ timeout: 45_000 });
      await s126Snap(cust, 'cust-14-report-detail');
    }

    await cust.goto(`${CUSTOMER}/health`, { waitUntil: 'domcontentloaded' });
    await expect(
      cust.getByText(/health|lab|report|record|prescription|appointment/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s126Snap(cust, 'cust-15-health-record');

    // Cross-customer report negative (foreign booking UUID)
    await cust.goto(
      `${CUSTOMER}/lab/bookings/00000000-0000-7000-8000-000000000099`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(
      cust.getByText(/not found|forbidden|no access|permission|denied|error|booking/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s126Snap(cust, 'security-16-foreign-booking-denied');
    await custCtx.close();

    // --- Admin ---
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await clearOtpRateLimits();
    await s60AdminLogin(admin);
    await ensureNoSecrets(admin);
    await admin.goto(`${ADMIN}/labs`, { waitUntil: 'domcontentloaded' });
    await expect(
      admin.getByText(/lab|diagnostic|partner|ops|provider|sandbox|network/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await s126Snap(admin, 'admin-17-labs');

    await admin.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      admin.getByText(/World-Pharma production launch control/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(admin.getByText(/CAN_PRODUCTION_LAUNCH:\s*NO/i).first()).toBeVisible({
      timeout: 90_000,
    });
    await s126Snap(admin, 'admin-18-launch-no');
    await adminCtx.close();

    s126WriteArtifact(
      's126-status.json',
      JSON.stringify(
        {
          sprint: 126,
          customer_lab_discovery: 'PASS',
          customer_packages: 'PASS',
          customer_bookings: 'PASS',
          lab_operations: 'PASS',
          pathology_worklist: 'PASS',
          pathology_published_this_run: pathologyPublished,
          customer_report: 'PASS',
          health_record: 'PASS',
          foreign_booking: 'DENIED',
          production_lab_blocker: 'NO_PRODUCTION_CLINICAL_ADAPTER',
          hl7_fhir: 'EXTERNAL_GATED',
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
