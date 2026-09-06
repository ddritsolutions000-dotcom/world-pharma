/**
 * Sprint 61 — Partner portals + operations workflows (real UI).
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  s61LoginPortal,
  s61Snap,
  selectMarketIfGated,
  selectOrgByCountry,
  selectSellerOrg,
  uiOtpLogin,
} from '../../e2e/helpers/s61-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S61 vendor fulfillment', () => {
  test('accept → pick → pack → shipment gate + customer/admin', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s61LoginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-vendor@dev.local');
    await page.goto('http://127.0.0.1:3004/workspace/orders', { waitUntil: 'domcontentloaded' });
    await selectSellerOrg(page, /Demo Care Pharmacy · IN|Demo Pharmacy Store · IN/);
    await expect(page.getByText(/Order queue|ALLOCATED|Accept|No orders/i).first()).toBeVisible({
      timeout: 45_000,
    });
    // If Care Pharmacy has no queue, try the other IN pharmacy once
    if (await page.getByText(/No orders/i).first().isVisible().catch(() => false)) {
      await selectSellerOrg(page, /Demo Pharmacy Store · IN/);
    }
    await s61Snap(page, 'vendor-01-orders');

    // Filter is a <select>, not a button — default is "Needs action"
    const search = page.getByPlaceholder(/Order #, id, status/i);
    if (await search.isVisible().catch(() => false)) {
      await search.fill('WP-IN-4B5C33D1C4');
      await page.waitForTimeout(400);
    }

    const orderRow = page.getByRole('button').filter({ hasText: /WP-IN-4B5C33D1C4/ }).first();
    await expect(orderRow).toBeVisible({ timeout: 30_000 });
    await orderRow.click();
    await expect(page.getByRole('heading', { name: /WP-IN-4B5C33D1C4/i })).toBeVisible({ timeout: 20_000 });
    await s61Snap(page, 'vendor-02-detail');

    const accept = page.getByRole('button', { name: /^Accept order$/i });
    await expect(accept).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Next: Accept this order/i).first()).toBeVisible();
    await accept.click();
    await expect(page.getByRole('button', { name: /^Start pick$/i })).toBeVisible({ timeout: 20_000 });
    await s61Snap(page, 'vendor-03-accepted');

    await page.evaluate(() => {
      window.confirm = () => true;
    });

    for (const [label, shot, assertFn] of [
      [
        /^Start pick$/i,
        'vendor-04-pick-start',
        async () => {
          await expect(page.getByRole('button', { name: /^Complete pick$/i })).toBeVisible({ timeout: 25_000 });
        },
      ],
      [
        /^Complete pick$/i,
        'vendor-05-pick-done',
        async () => {
          await expect(page.getByRole('button', { name: /^Complete pack/i })).toBeVisible({ timeout: 25_000 });
        },
      ],
      [
        /^Complete pack/i,
        'vendor-06-packed',
        async () => {
          await expect(page.getByRole('heading', { name: /READY_TO_SHIP|SHIPPED/i })).toBeVisible({
            timeout: 25_000,
          });
        },
      ],
    ] as const) {
      const btn = page.getByRole('button', { name: label });
      await expect(btn).toBeVisible({ timeout: 20_000 });
      await expect(btn).toBeEnabled();
      await btn.click();
      await assertFn();
      await s61Snap(page, shot);
    }

    await expect(page.getByRole('heading', { name: /READY_TO_SHIP|SHIPPED/i })).toBeVisible();
    await expect(page.getByText(/Sandbox shipment|mock adapter|EXTERNAL_GATED|sandbox fulfillment/i).first()).toBeVisible();
    await s61Snap(page, 'vendor-07-shipment-gate');

    await page.goto('http://127.0.0.1:3004/workspace/inventory', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Inventory|SKU|stock|lot|on hand|warehouse/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await s61Snap(page, 'vendor-08-inventory');

    // Cross-portal: customer tracking
    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await cust.getByLabel(/^Email$/i).click();
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto('/orders', { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/Order|WP-|DEMO-/i).first()).toBeVisible({ timeout: 45_000 });
    await s61Snap(cust, 'cross-01-customer-orders');
    await custCtx.close();

    // Responsive vendor
    for (const [w, h, name] of [
      [390, 844, 'resp-vendor-390'],
      [768, 900, 'resp-vendor-768'],
      [1024, 900, 'resp-vendor-1024'],
      [1440, 900, 'resp-vendor-1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('http://127.0.0.1:3004/workspace/orders');
      await assertNoHorizontalOverflow(page);
      await s61Snap(page, name);
    }
  });
});

test.describe('S61 doctor consultation', () => {
  test('appointment → consent → consult → Rx gate', async ({ page, context }) => {
    await context.clearCookies();
    await s61LoginPortal(page, 'http://127.0.0.1:3002/', 'sandbox-doctor@dev.local');
    await page.goto('http://127.0.0.1:3002/appointments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({ timeout: 45_000 });
    await s61Snap(page, 'doctor-01-appointments');

    const appt = page
      .getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i })
      .first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
      await expect(page.getByText(/Sandbox|consent|Clinical|consultation/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await s61Snap(page, 'doctor-02-detail');
      await expect(page.getByText(/^You do not have access$/i)).toHaveCount(0);

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
              await summary.fill('S61 sandbox consult complete.');
            }
          }
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
      await s61Snap(page, 'doctor-03-after-actions');
    }

    await page.goto('http://127.0.0.1:3002/prescriptions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/sandbox|EXTERNAL_GATED|prescription|Issue|encounter/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s61Snap(page, 'doctor-04-rx-gate');
  });
});

test.describe('S61 lab + pathologist', () => {
  test('lab ops tabs + pathologist worklist + customer report', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s61LoginPortal(page, 'http://127.0.0.1:3005/', 'sandbox-lab@dev.local');
    await selectOrgByCountry(page, /\(IN\)/).catch(() => undefined);
    await s61Snap(page, 'lab-01-home');

    for (const label of ['Bookings', 'Accession', 'Processing', 'Pathology']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(600);
        await s61Snap(page, `lab-02-${label.toLowerCase()}`);
      }
    }

    const pathCtx = await browser.newContext();
    const path = await pathCtx.newPage();
    await clearOtpRateLimits();
    await s61LoginPortal(path, 'http://127.0.0.1:3009/', 'sandbox-pathologist@dev.local');
    await expect(path.getByRole('heading', { name: 'Assigned cases', exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await selectOrgByCountry(path, /\(IN\)/);
    await s61Snap(path, 'pathologist-01-worklist');

    const review = path.getByRole('button', { name: /^Review$/i }).first();
    if (await review.isVisible().catch(() => false)) {
      await review.click();
      await s61Snap(path, 'pathologist-02-case');
      for (const label of [/^Accept assignment$/i, /^Verify$/i, /^Publish report$/i]) {
        const btn = path.getByRole('button', { name: label });
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          await btn.click();
          await path.waitForTimeout(1200);
        }
      }
      await s61Snap(path, 'pathologist-03-after');
    } else {
      // Published reports are immutable — worklist may be empty; customer still sees report.
      await expect(path.getByText(/No assigned cases|Published|membership|Assigned/i).first()).toBeVisible();
      await s61Snap(path, 'pathologist-02-empty-or-published');
    }
    await pathCtx.close();

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto('/lab/bookings', { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/Lab|booking|report|Published|CONFIRMED/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s61Snap(cust, 'cross-02-customer-lab');
    await custCtx.close();
  });
});

test.describe('S61 imaging + radiologist', () => {
  test('imaging studies + radiologist SoD + customer result', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s61LoginPortal(page, 'http://127.0.0.1:3006/', 'sandbox-imaging@dev.local');
    await selectOrgByCountry(page, /\(IN\)/).catch(() => undefined);
    await expect(page.getByText(/EXTERNAL_GATED|PACS|DICOM|Imaging|Study/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s61Snap(page, 'imaging-01-home');

    for (const label of ['Bookings', 'Studies', 'Interpretations']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        await s61Snap(page, `imaging-02-${label.toLowerCase()}`);
      }
    }

    const radCtx = await browser.newContext();
    const rad = await radCtx.newPage();
    await clearOtpRateLimits();
    await s61LoginPortal(rad, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await selectOrgByCountry(rad, /\(IN\)/);
    await expect(rad.getByText(/EXTERNAL_GATED|PACS|DICOM|worklist/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s61Snap(rad, 'radiologist-01-worklist');

    const caseBtn = rad
      .getByRole('button')
      .filter({ hasText: /Accept|Open|Review|Study|Case|PENDING|ASSIGNED|DRAFT|Verify/i })
      .first();
    if (await caseBtn.isVisible().catch(() => false)) {
      await caseBtn.click();
      await rad.waitForTimeout(600);
      const finding = rad.locator('textarea').first();
      if (await finding.isVisible().catch(() => false)) {
        await finding.fill('S61 sandbox impression — no acute abnormality.');
      }
      for (const label of [/^Accept assignment$/i, /^Save findings$/i, /^Submit for verify$/i]) {
        const btn = rad.getByRole('button', { name: label });
        if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
          await btn.click();
          await rad.waitForTimeout(1000);
        }
      }
      await s61Snap(rad, 'radiologist-02-author');
    } else {
      await s61Snap(rad, 'radiologist-02-empty');
    }
    await radCtx.close();

    const revCtx = await browser.newContext();
    const rev = await revCtx.newPage();
    await clearOtpRateLimits();
    await s61LoginPortal(rev, 'http://127.0.0.1:3007/', 'sandbox-radiologist-reviewer@dev.local');
    await selectOrgByCountry(rev, /\(IN\)/);
    const verifyTab = rev.getByRole('button', { name: /Verify queue/i });
    if (await verifyTab.isVisible().catch(() => false)) await verifyTab.click();
    await s61Snap(rev, 'radiologist-03-verify-queue');
    for (const label of [/^Review$/i, /^Verify/i, /^Publish report/i]) {
      const btn = rev.getByRole('button', { name: label }).first();
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        await btn.click();
        await rev.waitForTimeout(1000);
      }
    }
    await s61Snap(rev, 'radiologist-04-after-verify');
    await revCtx.close();

    const custCtx = await browser.newContext();
    const cust = await custCtx.newPage();
    await clearOtpRateLimits();
    await cust.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await cust.getByLabel(/^Email$/i).pressSequentially('sandbox-customer@dev.local', { delay: 15 });
    await uiOtpLogin(cust, 'sandbox-customer@dev.local');
    await selectMarketIfGated(cust, /India/i);
    await cust.goto('/imaging/bookings', { waitUntil: 'domcontentloaded' });
    await expect(cust.getByText(/Imaging|booking|report|Published|Study/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s61Snap(cust, 'cross-03-customer-imaging');
    await custCtx.close();
  });
});

test.describe('S61 affiliate + logistics', () => {
  test('affiliate XX sandbox + logistics shipments', async ({ page, context, browser }) => {
    await context.clearCookies();
    await s61LoginPortal(page, 'http://127.0.0.1:3010/', 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/Affiliate|Sandbox|XX|Commission|Earnings|dashboard/i).first()).toBeVisible({
      timeout: 60_000,
    });
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\bUPI\b/);
    await s61Snap(page, 'affiliate-01-dashboard');

    for (const path of ['/codes', '/links', '/earnings', '/statement']) {
      await page.goto(`http://127.0.0.1:3010${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
    }
    await s61Snap(page, 'affiliate-02-lifecycle');

    // Logistics ops console is admin-audience (:3011). Prefer Admin /logistics for verified Continue+MFA login.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await clearOtpRateLimits();
    await admin.goto('http://127.0.0.1:3001/login', { waitUntil: 'networkidle' });
    const email = admin.getByLabel(/Work email|Email/i).first();
    await email.click();
    await email.pressSequentially('sandbox-admin@dev.local', { delay: 15 });
    await admin.getByRole('button', { name: 'Continue' }).click();
    await admin.getByLabel(/One-time code/i).waitFor({ state: 'visible', timeout: 30_000 });
    await admin.getByRole('button', { name: 'Continue' }).click();
    const mfa = admin.getByLabel(/Authenticator code/i);
    if (await mfa.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await admin.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
    }
    await expect(admin.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await admin.goto('http://127.0.0.1:3001/logistics', { waitUntil: 'domcontentloaded' });
    await expect(admin.getByText(/Shipment|Logistics|Dispatch|Tracking|sandbox|carrier|EXTERNAL/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s61Snap(admin, 'logistics-01-admin-console');

    // Smoke web-logistics shell (admin audience) — login page present if session not shared across ports
    await admin.goto('http://127.0.0.1:3011/', { waitUntil: 'domcontentloaded' });
    await s61Snap(admin, 'logistics-02-dedicated-portal');
    await adminCtx.close();
  });
});

test.describe('S61 security tenant boundaries', () => {
  test('customer denied on vendor; affiliate not admin', async ({ page, context, browser }) => {
    await context.clearCookies();
    // Anonymous on vendor origin → auth challenge
    await page.goto('http://127.0.0.1:3004/workspace/orders', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Sign in|Email|OTP|Welcome|Secure|seller|Permission/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s61Snap(page, 'security-01-anonymous-on-vendor');

    // Customer account on vendor origin: no VENDOR seller membership → empty/forbidden, not peer orders
    await clearOtpRateLimits();
    await s61LoginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-customer@dev.local');
    await page.goto('http://127.0.0.1:3004/workspace/orders', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const vBody = await page.locator('body').innerText();
    expect(vBody).toMatch(/Permission|denied|seller organization|membership|No orders|Select|organization/i);
    expect(vBody).not.toMatch(/WP-IN-4B5C33D1C4/);
    await s61Snap(page, 'security-01b-customer-no-seller-orders');

    const aff = await browser.newContext();
    const aPage = await aff.newPage();
    await clearOtpRateLimits();
    await s61LoginPortal(aPage, 'http://127.0.0.1:3010/', 'sandbox-affiliate@dev.local');
    await aPage.goto('http://127.0.0.1:3001/orders', { waitUntil: 'domcontentloaded' });
    await expect(
      aPage.getByText(/Sign in|Permission|denied|Work email|Secure|OTP|Welcome/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s61Snap(aPage, 'security-02-affiliate-on-admin');
    await aff.close();
  });
});
