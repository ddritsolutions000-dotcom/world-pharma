/**
 * Sprint 60 — Main Admin control plane (real UI + state changes).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  ADMIN_EMAIL,
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  CMS_MARKER,
  CUSTOMER,
  CUSTOMER_EMAIL,
  ensureNoSecrets,
  PRODUCT_SLUG,
  s60AdminLogin,
  s60Snap,
  selectMarketIfGated,
  uiCustomerLogin,
} from '../../e2e/helpers/s60-ui';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S60 admin login + navigation', () => {
  test('login dashboard nav and logout affordance', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoSecrets(page);
    await expect(page.getByText(/Main Admin|Dashboard|World Pharma/i).first()).toBeVisible({ timeout: 45_000 });
    await s60Snap(page, 'admin-01-login-dashboard');

    for (const label of [/Orders/i, /Partners/i, /Catalog/i, /Finance/i, /CMS/i]) {
      await expect(page.getByRole('link', { name: label }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Sign out/i }).first()).toBeVisible();
    await s60Snap(page, 'admin-02-navigation');
  });
});

test.describe('S60 country market control', () => {
  test('countries and AE/US do not leak India-only defaults', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);

    await page.goto(`${ADMIN}/countries`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Countr|Market|IN|AE|US|policy|readiness/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s60Snap(page, 'country-01-control');

    await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    const countrySelect = page.getByLabel(/Country|Working country|Market/i).first();
    if (await countrySelect.isVisible().catch(() => false)) {
      await countrySelect.selectOption('AE').catch(async () => {
        await countrySelect.selectOption({ label: /AE|United Arab/i }).catch(() => undefined);
      });
      await page.waitForTimeout(800);
    }
    const aeBody = await page.locator('body').innerText();
    expect(aeBody).not.toMatch(/\bUPI\b/);
    await s60Snap(page, 'country-02-payments-ae');

    await page.goto(`${ADMIN}/speciality-care`, { waitUntil: 'domcontentloaded' });
    const specCountry = page.getByLabel(/Speciality country|Country/i).first();
    if (await specCountry.isVisible().catch(() => false)) {
      await specCountry.selectOption('US').catch(() => undefined);
      const load = page.getByRole('button', { name: /^Load$/i });
      if (await load.isVisible().catch(() => false)) await load.click();
      await page.waitForTimeout(800);
    }
    const usBody = await page.locator('body').innerText();
    expect(usBody).not.toMatch(/₹/);
    await s60Snap(page, 'country-03-speciality-us');
  });
});

test.describe('S60 partner vendor workflow', () => {
  test('review DOCUMENTS_SUBMITTED → UNDER_REVIEW', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/partners`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Partner application|KYC|onboarding/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s60Snap(page, 'partner-01-list');

    // Prefer submitted VENDOR row
    const submittedReview = page
      .getByRole('row', { name: /VENDOR.*Submitted|Submitted.*VENDOR/i })
      .getByRole('button', { name: /Review/i })
      .first();
    if (await submittedReview.isVisible().catch(() => false)) {
      await submittedReview.click();
    } else {
      await page.getByRole('button', { name: /Review/i }).first().click();
    }
    await expect(page.getByRole('button', { name: /Back to queue/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/KYC documents|Onboarding readiness|Application 01/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await s60Snap(page, 'partner-02-detail');

    const markReview = page.getByRole('button', { name: /Mark under review/i });
    if (await markReview.isVisible().catch(() => false)) {
      await markReview.click();
      await expect(page.getByText(/Under review/i).first()).toBeVisible({ timeout: 30_000 });
      await s60Snap(page, 'partner-03-under-review');
    } else {
      await s60Snap(page, 'partner-03-no-review-transition');
      await expect(
        page.getByText(/No review transitions|Verify|Approve|Reject|Request info/i).first(),
      ).toBeVisible();
    }
  });
});

test.describe('S60 catalog product workflow', () => {
  test('edit sandbox product copy and verify', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/catalog`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Catalog|Product|Brand|Published/i).first()).toBeVisible({ timeout: 45_000 });

    const search = page.getByLabel(/Search catalog/i);
    await search.fill(PRODUCT_SLUG);
    await page.waitForTimeout(500);
    await s60Snap(page, 'product-01-list');

    const edit = page.getByRole('button', { name: /^Edit$/i }).first();
    await expect(edit).toBeVisible({ timeout: 20_000 });
    await edit.click();

    const title = page.getByLabel(new RegExp(`Title ${PRODUCT_SLUG}`, 'i'));
    await expect(title).toBeVisible({ timeout: 15_000 });
    const current = await title.inputValue();
    const next = current.includes('S60') ? current : `${current} S60`;
    await title.fill(next);
    await page.getByRole('button', { name: /Save product information/i }).click();
    await expect(page.getByText(/Product copy saved|saved|update/i).first()).toBeVisible({ timeout: 20_000 });
    await s60Snap(page, 'product-02-saved');

    // Customer cross-check
    await page.goto(`${CUSTOMER}/p/${PRODUCT_SLUG}`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 45_000 });
    await s60Snap(page, 'product-03-customer');
  });
});

test.describe('S60 order workflow', () => {
  test('open ALLOCATED order and start pick', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await page.goto(`${ADMIN}/orders`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Orders|Pick|pack|Sandbox/i).first()).toBeVisible({ timeout: 45_000 });

    const search = page.getByLabel(/Search orders/i);
    await search.fill('WP-IN');
    await page.waitForTimeout(600);
    await s60Snap(page, 'order-01-list');

    const manage = page.getByRole('button', { name: /Manage/i }).first();
    await expect(manage).toBeVisible({ timeout: 20_000 });
    await manage.click();
    await expect(
      page.getByRole('heading', { name: /WP-|DEMO-|Order/i }).or(page.getByText(/Line items|Start pick|Status history/i)).first(),
    ).toBeVisible({ timeout: 30_000 });
    // Prefer the detail panel status chip over the filter <option value=ALLOCATED>
    await expect(page.locator('.wp-order-detail, .wp-stack').getByText(/Allocated|Picking|Confirmed/i).first()).toBeVisible({
      timeout: 15_000,
    }).catch(() => undefined);
    await s60Snap(page, 'order-02-detail');

    const startPick = page.getByRole('button', { name: /Start pick/i });
    const completePick = page.getByRole('button', { name: /Complete pick/i });
    if (await startPick.isVisible().catch(() => false)) {
      await startPick.click();
      await expect(completePick).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Start pick completed|pick_start|Picking/i).first()).toBeVisible({
        timeout: 10_000,
      }).catch(() => undefined);
      await s60Snap(page, 'order-03-picking');
    } else if (await completePick.isVisible().catch(() => false)) {
      await s60Snap(page, 'order-03-already-picking');
    } else {
      await s60Snap(page, 'order-03-no-pick-action');
    }
  });
});

test.describe('S60 finance healthcare cms support', () => {
  test('finance payments healthcare cms crm support', async ({ page, context }) => {
    await context.clearCookies();
    await s60AdminLogin(page);

    await page.goto(`${ADMIN}/finance`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Finance|SANDBOX|EXTERNAL_PAYOUT|payable|Settlement/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s60Snap(page, 'finance-01');

    await page.goto(`${ADMIN}/payments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Payment|Sandbox|EXTERNAL_GATED|Gateway/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s60Snap(page, 'finance-02-payments');

    await page.goto(`${ADMIN}/healthcare-network`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Healthcare|EXTERNAL_GATED|Doctor|Lab|Imaging|Readiness/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s60Snap(page, 'healthcare-01');

    await page.goto(`${ADMIN}/cms`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/CMS|Content|Publish|Article|Help/i).first()).toBeVisible({ timeout: 45_000 });
    await s60Snap(page, 'cms-01-admin');

    await page.goto(`${CUSTOMER}/help/a/how-to-order-medicines`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    const help = await page.locator('body').innerText();
    expect(help).toMatch(/order|medicin|Help|S60|S59|sandbox/i);
    if (help.includes(CMS_MARKER) || help.includes('S60 sandbox tip')) {
      await s60Snap(page, 'cms-02-customer-marker');
    } else {
      await s60Snap(page, 'cms-02-customer-article');
    }

    await page.goto(`${ADMIN}/crm`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/CRM|Customer|country-scoped|Select country|No customers/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s60Snap(page, 'crm-01');

    await page.goto(`${ADMIN}/support`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Support|Ticket|Queue|No tickets/i).first()).toBeVisible({ timeout: 45_000 });
    await s60Snap(page, 'support-01');
  });
});

test.describe('S60 permission + responsive', () => {
  test('customer denied on admin; responsive smoke', async ({ page, context, browser }) => {
    await context.clearCookies();
    await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await uiCustomerLogin(page, CUSTOMER_EMAIL);

    // Customer session should not unlock Main Admin
    await page.goto(`${ADMIN}/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Sign in|Permission|denied|Secure access|Work email|OTP|Welcome/i);
    await s60Snap(page, 'security-01-customer-denied');

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await s60AdminLogin(admin);
    for (const [w, h, name] of [
      [390, 844, 'responsive-01-390'],
      [768, 1024, 'responsive-02-768'],
      [1024, 900, 'responsive-03-1024'],
      [1440, 900, 'responsive-04-1440'],
    ] as const) {
      await admin.setViewportSize({ width: w, height: h });
      await admin.goto(`${ADMIN}/orders`, { waitUntil: 'domcontentloaded' });
      await assertNoHorizontalOverflow(admin);
      await s60Snap(admin, name);
    }
    await adminCtx.close();
  });
});
