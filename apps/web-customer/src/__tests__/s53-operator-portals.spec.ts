/**
 * Sprint 53 — Authenticated operator portal deep UX (real UI OTP login).
 *
 * Local ports (from each app package.json):
 *   customer 3000 · admin 3001 · doctor 3002 · store 3003 · vendor 3004
 *   lab 3005 · imaging 3006 · radiologist 3007 · join 3008 · affiliate 3010 · ds-web 3100
 */
import { expect, test, type Page } from '@playwright/test';
import { ensureNoSecrets, s53Snap, uiAdminLogin, uiOtpLogin } from '../../e2e/helpers/s53-ui';

async function loginPortal(page: Page, baseUrl: string, email: string) {
  await page.goto(baseUrl);
  // Many portals show auth on `/` when anonymous.
  const emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Email/i)).first();
  if (!(await emailField.isVisible().catch(() => false))) {
    await page.goto(`${baseUrl.replace(/\/$/, '')}/login`);
  }
  await uiOtpLogin(page, email);
  await ensureNoSecrets(page);
}

test.describe('S53 admin deep journey (UI login)', () => {
  test('login → dashboard → country → launch → partners → catalog → payments → cms', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3001/login');
    await uiAdminLogin(page, 'sandbox-admin@dev.local');
    await expect(page.getByText(/Sign out|Admin|Dashboard|World Pharma|Control/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, 'admin-01-dashboard');

    const routes: Array<[string, string, RegExp]> = [
      ['/countries', 'admin-02-country', /Country|Market|Control|IN|AE|US|lifecycle|production/i],
      ['/launch-readiness', 'admin-03-launch', /Launch|Readiness|Blocker|EXTERNAL|NOT_READY|READY/i],
      ['/partners', 'admin-04-partners', /Partner|Pharmacy|KYC|Application|Vendor/i],
      ['/catalog', 'admin-05-catalog', /Catalog|Product|Offer|SKU|Item/i],
      ['/inventory', 'admin-06-inventory', /Inventory|Lot|Stock|Warehouse|Location/i],
      ['/orders', 'admin-07-orders', /Order|Fulfill|Status/i],
      ['/payments', 'admin-08-payments', /Payment|Country|Sandbox|Gateway|Select country/i],
      ['/finance', 'admin-09-finance', /Finance|Settlement|Payable|Ledger|Dashboard/i],
      ['/cms', 'admin-10-cms', /CMS|Content|Publish|Banner|Article|Country/i],
      ['/crm', 'admin-11-crm', /CRM|Customer|Segment|Country|Select/i],
      ['/marketing', 'admin-12-marketing', /Marketing|Campaign|Promo|Offer|Country/i],
      ['/support', 'admin-13-support', /Support|Ticket|Queue|Inbox/i],
      ['/notifications', 'admin-14-notifications', /Notification|Template|Outbox|Message/i],
      ['/security', 'admin-15-security', /Security|Audit|Event|Session/i],
      ['/reliability', 'admin-16-reliability', /Reliability|Health|Infrastructure|Operations/i],
    ];

    for (const [route, shot, expectText] of routes) {
      await page.goto(`http://127.0.0.1:3001${route}`);
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error|Application error/i);
      await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 45_000 });
      // Prefer selecting IN where a country picker exists.
      const countrySelect = page.getByLabel(/Country/i).first();
      if (await countrySelect.isVisible().catch(() => false)) {
        const tag = await countrySelect.evaluate((el) => el.tagName.toLowerCase());
        if (tag === 'select') {
          await countrySelect.selectOption({ label: 'IN' }).catch(async () => {
            await countrySelect.selectOption('IN').catch(() => undefined);
          });
        }
      }
      await s53Snap(page, shot);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3001/');
    await s53Snap(page, 'admin-17-dashboard-390');
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

test.describe('S53 vendor journey (UI login)', () => {
  test('login → dashboard → catalog → inventory → orders', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3004/', 'sandbox-vendor@dev.local');
    await expect(page.getByText(/Seller|Vendor|Dashboard|Organization|Catalog|Orders/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, 'vendor-01-dashboard');

    for (const [path, shot] of [
      ['/', 'vendor-02-home'],
      ['/workspace', 'vendor-03-workspace'],
      ['/workspace/catalog', 'vendor-04-catalog'],
      ['/workspace/inventory', 'vendor-05-inventory'],
      ['/workspace/orders', 'vendor-06-orders'],
    ] as const) {
      await page.goto(`http://127.0.0.1:3004${path}`);
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
      await s53Snap(page, shot);
    }
  });
});

test.describe('S53 doctor journey (UI login)', () => {
  test('login → dashboard → appointments', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3002/', 'sandbox-doctor@dev.local');
    await expect(page.getByText(/Doctor|Appointment|Dashboard|Availability|Sign out/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, 'doctor-01-dashboard');
    await page.goto('http://127.0.0.1:3002/#appointments').catch(() => undefined);
    const appt = page.getByRole('button', { name: /Appointment/i }).first();
    if (await appt.isVisible().catch(() => false)) {
      await appt.click();
    }
    await s53Snap(page, 'doctor-02-appointments');
  });
});

test.describe('S53 lab journey (UI login)', () => {
  test('login → dashboard → bookings → pathology', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3005/', 'sandbox-lab@dev.local');
    await expect(page.getByText(/Lab|Sandbox|Dashboard|Organization|Booking/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/Sandbox lab workflows/i).first()).toBeVisible();
    await s53Snap(page, 'lab-01-dashboard');

    for (const label of ['Bookings', 'Pathology', 'Catalog']) {
      const btn = page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label }));
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        await s53Snap(page, `lab-02-${label.toLowerCase()}`);
      }
    }
  });
});

test.describe('S53 imaging + radiologist (UI login)', () => {
  test('imaging center sandbox messaging', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3006/', 'sandbox-imaging@dev.local');
    await expect(page.getByText(/Imaging|Radiology|Sandbox|EXTERNAL|PACS|Dashboard/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, 'imaging-01-dashboard');
  });

  test('radiologist worklist', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3007/', 'sandbox-radiologist@dev.local');
    await expect(page.getByText(/Radiologist|Worklist|Study|Sandbox|Sign out|Dashboard/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, 'radiologist-01-worklist');
  });
});

test.describe('S53 affiliate journey (UI login)', () => {
  test('login → dashboard with XX sandbox clarity', async ({ page, context }) => {
    await context.clearCookies();
    await loginPortal(page, 'http://127.0.0.1:3010/', 'sandbox-affiliate@dev.local');
    await expect(page.getByText(/Affiliate|Dashboard|Referral|Sandbox|XX|Commission|Click/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await s53Snap(page, 'affiliate-01-dashboard');
    // Ensure XX sandbox is explicit rather than a bare 403 wall
    const denied = page.getByText(/You do not have access/i);
    if (await denied.isVisible().catch(() => false)) {
      await expect(page.getByText(/Sandbox|XX|market|scope/i).first()).toBeVisible();
    }
    await s53Snap(page, 'affiliate-02-statement');
  });
});

test.describe('S53 landing polish check', () => {
  test('join + specialty landings still coherent', async ({ page }) => {
    for (const [url, shot] of [
      ['http://127.0.0.1:3008/', 'landing-join'],
      ['http://127.0.0.1:3000/doctors', 'landing-doctors'],
      ['http://127.0.0.1:3000/lab', 'landing-lab'],
      ['http://127.0.0.1:3000/care-plan', 'landing-care-plan'],
    ] as const) {
      await page.goto(url);
      if (url.includes(':3000')) {
        const gate = page.getByRole('heading', { name: 'Choose your market' });
        if (await gate.isVisible().catch(() => false)) {
          await page.getByRole('button', { name: /India/i }).click();
        }
      }
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
      await s53Snap(page, shot);
    }
  });
});
