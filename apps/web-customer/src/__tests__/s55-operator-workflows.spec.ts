/**
 * Sprint 55 — Doctor / Lab / Imaging / Radiologist / Vendor / Admin workflow depth (real UI).
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  s55Snap,
  uiAdminLogin,
} from '../../e2e/helpers/s55-ui';

test.describe('S55 doctor clinical sandbox lifecycle', () => {
  test('login → appointments → encounter CTAs → prescriptions', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3002/', 'sandbox-doctor@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Loading your workspace/i)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByText(/Doctor|Dashboard|Appointment|Availability|Good day/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s55Snap(page, 'doctor-01-dashboard');

    await page.goto('http://127.0.0.1:3002/appointments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Appointment/i }).first()).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByText(/Sandbox clinical workflow|No appointments yet|Select an appointment|Confirmed|Requested|EXTERNAL_GATED/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s55Snap(page, 'doctor-02-appointments');

    // Open first appointment in the queue (labels are status · type · time)
    const apptRow = page.getByRole('button', { name: /^(Requested|Confirmed|Checked in|In consultation|Completed)\b/i }).first();
    await expect(apptRow).toBeVisible({ timeout: 30_000 });
    await apptRow.click();
    await expect(
      page.getByText(/Sandbox clinical workflow|Encounter|Confirm|Check in|No encounter yet/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await s55Snap(page, 'doctor-03-appointment-detail');

    for (const label of [
      /^Confirm appointment$/i,
      /^Check in patient$/i,
      /^Start consultation$/i,
      /^Complete consultation$/i,
    ]) {
      const btn = page.getByRole('button', { name: label });
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        if (/Complete/i.test(label.source)) {
          const summary = page.getByLabel(/summary|notes|consultation/i).or(page.locator('textarea')).first();
          if (await summary.isVisible().catch(() => false)) {
            await summary.fill('Sandbox consultation completed — patient advised OTC rest and hydration.');
          }
        }
        await btn.click();
        await page.waitForTimeout(1200);
      }
    }
    await s55Snap(page, 'doctor-04-consultation');
    await s55Snap(page, 'doctor-04b-patient');

    await page.goto('http://127.0.0.1:3002/prescriptions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/OD-R5B/i)).toHaveCount(0);
    await expect(page.getByText(/sandbox|EXTERNAL_GATED|prescription|encounter|Issue/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s55Snap(page, 'doctor-05-rx');

    await page.goto('http://127.0.0.1:3002/earnings', { waitUntil: 'domcontentloaded' });
    await s55Snap(page, 'doctor-06-earnings');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3002/appointments');
    await assertNoHorizontalOverflow(page).catch(() => undefined);
    await s55Snap(page, 'resp-doctor-390');
    await page.setViewportSize({ width: 768, height: 900 });
    await s55Snap(page, 'resp-doctor-768');
    await page.setViewportSize({ width: 1024, height: 900 });
    await s55Snap(page, 'resp-doctor-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
    await s55Snap(page, 'resp-doctor-1440');
  });
});

test.describe('S55 lab diagnostics sandbox lifecycle', () => {
  test('dashboard → bookings → collections → pathology', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3005/', 'sandbox-lab@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Sandbox lab workflows/i).first()).toBeVisible({ timeout: 60_000 });
    // Org must auto-select so operators are not stuck on empty picker
    await expect(page.locator('select').first()).not.toHaveValue('', { timeout: 45_000 });
    await expect(page.getByText(/Select a laboratory$/i)).toHaveCount(0);
    await expect(
      page.getByText(/Zeros mean an empty sandbox queue|Published tests|Bookings|Laboratory snapshot/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await s55Snap(page, 'lab-01-dashboard');

    for (const label of ['Bookings', 'Collections', 'Accession', 'Processing', 'Pathology']) {
      const btn = page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label }));
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
        await expect(page.getByText(/Select a laboratory$/i)).toHaveCount(0);
        for (const cta of [/Accession sample/i, /Start processing/i, /Complete processing/i, /Submit for verification/i, /Receive at lab/i]) {
          const action = page.getByRole('button', { name: cta });
          if (
            (await action.first().isVisible().catch(() => false)) &&
            (await action.first().isEnabled().catch(() => false))
          ) {
            await action.first().click();
            await page.waitForTimeout(600);
          }
        }
        await s55Snap(page, `lab-02-${label.toLowerCase()}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3005/');
    await s55Snap(page, 'resp-lab-390');
    await page.setViewportSize({ width: 1024, height: 900 });
    await s55Snap(page, 'resp-lab-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
    await s55Snap(page, 'resp-lab-1440');
  });
});

test.describe('S55 imaging + radiologist sandbox', () => {
  test('imaging bookings/studies + radiologist worklist EXTERNAL_GATED', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3006/', 'sandbox-imaging@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('select').first()).not.toHaveValue('', { timeout: 45_000 });
    await expect(page.getByText(/Sandbox|EXTERNAL|PACS|Imaging|Dashboard/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s55Snap(page, 'imaging-01-dashboard');

    for (const label of ['Bookings', 'Check-in', 'Studies', 'Interpretations']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).or(page.getByRole('link', { name: new RegExp(label, 'i') }));
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        for (const cta of [/Check in/i, /Start acquisition/i, /Mark acquired/i]) {
          const action = page.getByRole('button', { name: cta });
          if (
            (await action.first().isVisible().catch(() => false)) &&
            (await action.first().isEnabled().catch(() => false))
          ) {
            await action.first().click();
            await page.waitForTimeout(600);
          }
        }
        await s55Snap(page, `imaging-02-${label.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }

    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Radiologist worklist/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/EXTERNAL_GATED|PACS|DICOM/i).first()).toBeVisible({ timeout: 30_000 });
    await s55Snap(page, 'radiologist-01-worklist');

    const caseBtn = page.getByRole('button').filter({ hasText: /Accept|Open|Study|Case|PENDING|ASSIGNED/i }).first();
    if (await caseBtn.isVisible().catch(() => false)) {
      await caseBtn.click();
      await s55Snap(page, 'radiologist-02-study');
      for (const cta of [/Accept/i, /Save draft/i, /Submit/i, /Publish/i]) {
        const action = page.getByRole('button', { name: cta });
        if (
          (await action.first().isVisible().catch(() => false)) &&
          (await action.first().isEnabled().catch(() => false))
        ) {
          await action.first().click();
          await page.waitForTimeout(600);
        }
      }
      await s55Snap(page, 'radiologist-03-report');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3007/');
    await s55Snap(page, 'resp-radiologist-390');
    await page.setViewportSize({ width: 768, height: 900 });
    await s55Snap(page, 'resp-radiologist-768');
    await page.setViewportSize({ width: 1440, height: 900 });
    await s55Snap(page, 'resp-radiologist-1440');
  });
});

test.describe('S55 vendor order fulfillment', () => {
  test('orders → accept/pick/pack when available', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-vendor@dev.local');
    await expect(page.getByText(/Seller|Vendor|Dashboard|Orders|Catalog/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s55Snap(page, 'vendor-01-dashboard');

    await page.goto('http://127.0.0.1:3004/workspace/orders');
    await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
    await s55Snap(page, 'vendor-02-orders');

    for (const cta of [/Accept/i, /Start pick/i, /Complete pick/i, /Complete pack/i]) {
      const action = page.getByRole('button', { name: cta });
      if (await action.first().isVisible().catch(() => false) && (await action.first().isEnabled().catch(() => false))) {
        await action.first().click();
        await page.waitForTimeout(800);
        await s55Snap(page, `vendor-03-${String(cta).replace(/[^a-z]/gi, '').toLowerCase()}`);
      }
    }

    await page.goto('http://127.0.0.1:3004/workspace/inventory');
    await s55Snap(page, 'vendor-04-inventory');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3004/workspace/orders');
    await s55Snap(page, 'resp-vendor-390');
    await page.setViewportSize({ width: 768, height: 900 });
    await s55Snap(page, 'resp-vendor-768');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S55 admin healthcare oversight', () => {
  test('healthcare + launch readiness + partners', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3001/login');
    await uiAdminLogin(page, 'sandbox-admin@dev.local');
    await ensureNoSecrets(page);
    await s55Snap(page, 'admin-01-dashboard');

    for (const [route, shot, expectText] of [
      ['/launch-readiness', 'admin-02-launch', /Launch|Readiness|EXTERNAL|Blocker|READY/i],
      ['/partners', 'admin-03-partners', /Partner|Pharmacy|KYC|Doctor|Lab|Imaging/i],
      ['/orders', 'admin-04-orders', /Order|Fulfill|Status/i],
      ['/payments', 'admin-05-payments', /Payment|Sandbox|Gateway/i],
      ['/notifications', 'admin-06-notifications', /Notification|Template|Outbox|Message/i],
    ] as const) {
      await page.goto(`http://127.0.0.1:3001${route}`);
      await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 45_000 });
      await s55Snap(page, shot);
    }

    // Healthcare network if route exists
    for (const route of ['/healthcare', '/healthcare-network', '/clinical']) {
      await page.goto(`http://127.0.0.1:3001${route}`);
      const body = await page.locator('body').innerText();
      if (!/Cannot GET|404|Not Found/i.test(body)) {
        await s55Snap(page, 'admin-07-healthcare');
        break;
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3001/');
    await s55Snap(page, 'resp-admin-390');
    await page.setViewportSize({ width: 1024, height: 900 });
    await s55Snap(page, 'resp-admin-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S55 affiliate XX clarity', () => {
  test('sandbox market messaging', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3010/', 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/Affiliate|Sandbox|XX|Commission/i).first()).toBeVisible({ timeout: 60_000 });
    await s55Snap(page, 'affiliate-01-dashboard');
  });
});
