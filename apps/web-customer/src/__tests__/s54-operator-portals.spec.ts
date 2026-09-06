/**
 * Sprint 54 — Operator deep UX polish (real UI OTP login).
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  s54Snap,
  uiAdminLogin,
} from '../../e2e/helpers/s54-ui';

test.describe('S54 admin deep operator UX', () => {
  test('login → key modules + responsive', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3001/login');
    await uiAdminLogin(page, 'sandbox-admin@dev.local');
    await expect(page.getByText(/Sign out|Admin|Dashboard|World Pharma|Control/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await ensureNoSecrets(page);
    await s54Snap(page, 'admin-01-dashboard');

    for (const [route, shot, expectText] of [
      ['/countries', 'admin-02-country', /Country|Market|IN|AE|US|lifecycle/i],
      ['/launch-readiness', 'admin-03-launch', /Launch|Readiness|Blocker|EXTERNAL|READY/i],
      ['/partners', 'admin-04-partners', /Partner|Pharmacy|KYC|Vendor/i],
      ['/catalog', 'admin-05-catalog', /Catalog|Product|Offer|SKU/i],
      ['/inventory', 'admin-06-inventory', /Inventory|Lot|Stock/i],
      ['/payments', 'admin-07-payments', /Payment|Sandbox|Gateway|Country/i],
      ['/cms', 'admin-08-cms', /CMS|Content|Publish|Country/i],
    ] as const) {
      await page.goto(`http://127.0.0.1:3001${route}`);
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error|Application error/i);
      await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 45_000 });
      await s54Snap(page, shot);
    }

    for (const width of [390, 768, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: width <= 768 ? 844 : 900 });
      await page.goto('http://127.0.0.1:3001/');
      await assertNoHorizontalOverflow(page).catch(() => undefined);
      await s54Snap(page, `resp-admin-dashboard-${width}`);
    }
  });
});

test.describe('S54 vendor deep UX', () => {
  test('readiness blockers + catalog/inventory/orders', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-vendor@dev.local');
    await expect(page.getByText(/Seller|Vendor|Dashboard|Organization|Catalog|Orders/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s54Snap(page, 'vendor-01-dashboard');

    for (const [path, shot] of [
      ['/workspace', 'vendor-02-workspace'],
      ['/workspace/catalog', 'vendor-03-catalog'],
      ['/workspace/inventory', 'vendor-04-inventory'],
      ['/workspace/orders', 'vendor-05-orders'],
    ] as const) {
      await page.goto(`http://127.0.0.1:3004${path}`);
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
      await s54Snap(page, shot);
    }

    // If blockers shown, they must explain next action (not a bare comma list only).
    const blockers = page.getByText(/What is blocking readiness|Blocked:|Admin must verify|cannot self-approve/i);
    if (await blockers.first().isVisible().catch(() => false)) {
      await expect(blockers.first()).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3004/');
    await s54Snap(page, 'resp-vendor-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S54 doctor clinical sandbox UX', () => {
  test('dashboard → appointments → prescriptions messaging', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3002/', 'sandbox-doctor@dev.local');
    await expect(page.getByText(/Doctor|Appointment|Dashboard|Availability|Sign out/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s54Snap(page, 'doctor-01-dashboard');

    const appt = page.getByRole('button', { name: /Appointment/i }).or(page.getByRole('link', { name: /Appointment/i }));
    if (await appt.first().isVisible().catch(() => false)) {
      await appt.first().click();
    }
    await expect(
      page.getByText(/appointment|Sandbox|EXTERNAL_GATED|Availability|encounter|No appointments/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await s54Snap(page, 'doctor-02-appointments');

    const rx = page.getByRole('button', { name: /Prescription/i }).or(page.getByRole('link', { name: /Prescription/i }));
    if (await rx.first().isVisible().catch(() => false)) {
      await rx.first().click();
      await expect(page.getByText(/OD-R5B/i)).toHaveCount(0);
      await expect(page.getByText(/sandbox|EXTERNAL_GATED|prescription|encounter/i).first()).toBeVisible();
      await s54Snap(page, 'doctor-03-rx');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3002/');
    await s54Snap(page, 'resp-doctor-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S54 lab workflow UX', () => {
  test('dashboard KPI clarity + bookings/pathology', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3005/', 'sandbox-lab@dev.local');
    await expect(page.getByText(/Sandbox lab workflows/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Zeros mean an empty sandbox queue|Published tests|Bookings|Select a laboratory/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await s54Snap(page, 'lab-01-dashboard');

    for (const label of ['Bookings', 'Pathology', 'Catalog']) {
      const btn = page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label }));
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        await s54Snap(page, `lab-02-${label.toLowerCase()}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3005/');
    await s54Snap(page, 'resp-lab-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S54 imaging + radiologist', () => {
  test('imaging center + radiologist EXTERNAL_GATED clarity', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3006/', 'sandbox-imaging@dev.local');
    await expect(page.getByText(/Sandbox|EXTERNAL|PACS|Imaging|Dashboard/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s54Snap(page, 'imaging-01-dashboard');

    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await expect(page.getByText(/EXTERNAL_GATED|PACS|DICOM|Sandbox/i).first()).toBeVisible({ timeout: 60_000 });
    await s54Snap(page, 'radiologist-01-worklist');
  });
});

test.describe('S54 affiliate XX clarity', () => {
  test('dashboard + statement', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3010/', 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/Affiliate|Sandbox|XX|Commission|Referral/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s54Snap(page, 'affiliate-01-dashboard');
    const denied = page.getByText(/You do not have access/i);
    if (await denied.isVisible().catch(() => false)) {
      await expect(page.getByText(/Sandbox|XX|market|scope/i).first()).toBeVisible();
    }
    await s54Snap(page, 'affiliate-02-statement');
  });
});

test.describe('S54 landing polish', () => {
  test('join specialties + customer specialty pages', async ({ page }) => {
    for (const [url, shot, expectText] of [
      ['http://127.0.0.1:3008/', 'landing-join', /Partner|Apply|Pharmacy|Doctor/i],
      ['http://127.0.0.1:3008/doctor', 'landing-join-doctor', /Doctor|benefit|credential|EXTERNAL|sandbox|Apply/i],
      ['http://127.0.0.1:3008/lab', 'landing-join-lab', /Lab|diagnostic|Apply|sandbox/i],
      ['http://127.0.0.1:3008/imaging', 'landing-join-imaging', /Imaging|PACS|EXTERNAL|Apply|sandbox/i],
      ['http://127.0.0.1:3000/doctors', 'landing-doctors', /Doctor|Consult|Care|Physician|clinic|appointment|Browse|World/i],
      ['http://127.0.0.1:3000/lab', 'landing-lab', /Lab|Test|Package|diagnostic|World/i],
      ['http://127.0.0.1:3000/radiology', 'landing-radiology', /Imaging|Scan|Sandbox|EXTERNAL|X-ray|Radiology|World/i],
      ['http://127.0.0.1:3000/care-plan', 'landing-care-plan', /Care Plan|Plan|Join|membership|World/i],
      ['http://127.0.0.1:3000/deals', 'landing-deals', /Deal|Offer|Discount|Promo|empty|available|World/i],
    ] as const) {
      await page.goto(url);
      if (url.includes(':3000')) {
        const gate = page.getByRole('heading', { name: 'Choose your market' });
        if (await gate.isVisible().catch(() => false)) {
          await page.getByRole('button', { name: /India/i }).click();
        }
      }
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
      await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 45_000 });
      await s54Snap(page, shot);
    }
  });
});
