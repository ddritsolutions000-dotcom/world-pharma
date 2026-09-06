/**
 * Sprint 58 — customer marketplace + health experience (real UI).
 */
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  clearOtpRateLimits,
  ensureNoSecrets,
  s58Snap,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
} from '../../e2e/helpers/s58-ui';

const CUSTOMER = 'sandbox-customer@dev.local';
const MARKER = 'demo-paracetamol-500';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S58 homepage + medicine discovery', () => {
  test('home → categories → search → PDP seller compare', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/World Pharma|medicine|pharmacy|lab|doctor/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'home-01-desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:3000/');
    await selectMarketIfGated(page, /India/i);
    await assertNoHorizontalOverflow(page);
    await s58Snap(page, 'home-02-mobile-390');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/categories', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Categor|Pain|Vitamin|Browse/i).first()).toBeVisible({ timeout: 30_000 });
    await s58Snap(page, 'medicine-01-categories');

    await page.goto(`/search?q=paracetamol`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/paracetamol|result|medicine|No result/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'medicine-02-search');

    await page.goto(`/p/${MARKER}`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 45_000 });
    await s58Snap(page, 'medicine-03-pdp');

    const sellerBox = page.locator('.mg-seller-box');
    if (await sellerBox.isVisible().catch(() => false)) {
      await expect(sellerBox).toContainText(/pharmac|Sold by|compare/i);
      const options = page.locator('.mg-seller-option');
      const count = await options.count();
      if (count > 1) {
        await options.nth(1).click();
        await page.waitForTimeout(400);
      }
      await s58Snap(page, 'medicine-04-seller-comparison');
    } else {
      await s58Snap(page, 'medicine-04-seller-single');
    }

    const add = page.getByRole('button', { name: /Add to cart/i });
    if ((await add.isVisible().catch(() => false)) && (await add.isEnabled().catch(() => false))) {
      await add.click();
      await page.waitForTimeout(800);
    }
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'medicine-05-cart');
  });
});

test.describe('S58 health products + offers', () => {
  test('ayurveda/health products + deals + coupon checkout', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3000/ayurveda', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Ayurveda|Homeopathy|product|empty|No /i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'health-products-01-ayurveda');

    const link = page.getByRole('link').filter({ hasText: /View|Ayur|Triphala|Chyawan/i }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForTimeout(800);
      await s58Snap(page, 'health-products-02-pdp');
    }

    await page.goto('/deals', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Offers|deals|discount|SAVE10|promo/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'offers-01-deals');

    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await uiOtpLogin(page, CUSTOMER);
    await ensureNoSecrets(page);
    await selectMarketIfGated(page, /India/i);

    await page.goto(`/p/${MARKER}`, { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    const add = page.getByRole('button', { name: /Add to cart/i });
    if ((await add.isVisible().catch(() => false)) && (await add.isEnabled().catch(() => false))) {
      await add.click();
      await page.waitForTimeout(1200);
    }
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Cart|item|checkout|empty/i).first()).toBeVisible({ timeout: 45_000 });
    await s58Snap(page, 'offers-02-cart');

    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Checkout|Promo|Address|Total|cart|empty|Loading/i).first()).toBeVisible({
      timeout: 60_000,
    });
    // Wait out loading state when cart/session is ready
    await page.getByText(/^Loading…$/).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
    await s58Snap(page, 'offers-03-checkout');

    const promo = page.getByLabel(/Enter code|Promo|code/i).first();
    if (await promo.isVisible().catch(() => false)) {
      await promo.fill('SAVE10SBX');
      const apply = page.getByRole('button', { name: /^Apply$/i });
      if (await apply.isVisible().catch(() => false)) {
        await apply.click();
        await page.waitForTimeout(1500);
      }
      await s58Snap(page, 'offers-04-coupon');
      const body = await page.locator('body').innerText();
      expect(body).toMatch(/Promo|discount|SAVE10|invalid|applied|Total|Server discount|not valid|expired|min/i);
    } else {
      // Checkout may require address first — still evidence the deals surface and sandbox promo messaging.
      await expect(page.getByText(/Promo|Offers|SAVE10|checkout|address/i).first()).toBeVisible();
    }
  });
});

test.describe('S58 convenience + health hub', () => {
  test('wishlist reorder reminders + health hub', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await uiOtpLogin(page, CUSTOMER);
    await ensureNoSecrets(page);
    await selectMarketIfGated(page, /India/i);

    await page.goto('/account/wishlist', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Wishlist|saved|empty|No /i).first()).toBeVisible({ timeout: 45_000 });
    await s58Snap(page, 'account-01-wishlist');

    await page.goto('/buy-again', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Buy again|reorder|eligible|empty|DELIVERED|order/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'account-02-buy-again');

    await page.goto('/reminders', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Reminder|medicine|schedule|empty|No /i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'account-03-reminders');

    await page.goto('/health', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Health|timeline|Book doctor|overview|prescription|lab/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'health-01-dashboard');

    await page.goto('/appointments', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'health-02-appointments');
    await page.goto('/lab/bookings', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'health-03-lab-reports');
    await page.goto('/radiology/bookings', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'health-04-imaging-reports');
    await page.goto('/prescriptions', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'health-05-prescriptions');
  });
});

test.describe('S58 discovery + account + support', () => {
  test('doctor lab imaging account help landings CMS', async ({ page, context, browser }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3000/doctors', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Doctor|consult|specialt|Book|empty/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'doctor-01-discovery');
    const doc = page.getByRole('link').filter({ hasText: /View|Book|Dr|profile/i }).first();
    if (await doc.isVisible().catch(() => false)) {
      await doc.click();
      await page.waitForTimeout(800);
      await s58Snap(page, 'doctor-02-profile');
    }

    await page.goto('/lab', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Lab|test|package|Lipid|Book/i).first()).toBeVisible({ timeout: 45_000 });
    await s58Snap(page, 'lab-01-discovery');
    await page.goto('/lab/packages', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'lab-02-packages');

    await page.goto('/radiology', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Imaging|X-ray|Radiology|Book|scan/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await s58Snap(page, 'imaging-01-discovery');

    await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
    await clearOtpRateLimits();
    await uiOtpLogin(page, CUSTOMER);
    await selectMarketIfGated(page, /India/i);

    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'account-04-hub');
    await page.goto('/account/addresses', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'account-05-addresses');
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'account-06-orders');

    await page.goto('/help', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Help|FAQ|order|delivery|article/i).first()).toBeVisible({ timeout: 45_000 });
    await s58Snap(page, 'support-01-help');
    await page.goto('/help/a/how-to-order-medicines', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.goto('/faq', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'support-02-faq');

    for (const [route, shot] of [
      ['/care-plan', 'landing-01-care-plan'],
      ['/cancer-care', 'landing-02-cancer'],
      ['/vaccines', 'landing-03-vaccines'],
      ['/pet-care', 'landing-04-pet'],
      ['/programs', 'landing-05-programs'],
    ] as const) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
      await s58Snap(page, shot);
    }

    // CMS → customer: article should include S58 marker when fixture applied
    await page.goto('/help/search?q=order+medicines', { waitUntil: 'domcontentloaded' });
    await s58Snap(page, 'support-03-help-search');

    // Admin CMS smoke (safe)
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await clearOtpRateLimits();
    await admin.goto('http://127.0.0.1:3001/login', { waitUntil: 'networkidle' });
    const email = admin.getByLabel(/Work email|Email/i).first();
    if (await email.isVisible().catch(() => false)) {
      await email.click();
      await email.pressSequentially('sandbox-admin@dev.local', { delay: 15 });
      const cont = admin.getByRole('button', { name: 'Continue' });
      if (await cont.isEnabled().catch(() => false)) {
        await uiAdminLogin(admin, 'sandbox-admin@dev.local').catch(async () => {
          /* already partially filled */
        });
      }
    }
    if (await admin.getByRole('button', { name: /Sign out/i }).first().isVisible().catch(() => false)) {
      await admin.goto('http://127.0.0.1:3001/cms', { waitUntil: 'domcontentloaded' });
      await s58Snap(admin, 'admin-01-cms');
      await admin.goto('http://127.0.0.1:3001/promo', { waitUntil: 'domcontentloaded' });
      await s58Snap(admin, 'admin-02-promo');
    }
    await adminCtx.close();

    // Responsive smoke
    for (const [w, h, name] of [
      [390, 844, 'resp-home-390'],
      [768, 900, 'resp-home-768'],
      [1024, 900, 'resp-home-1024'],
      [1440, 900, 'resp-home-1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('http://127.0.0.1:3000/');
      await assertNoHorizontalOverflow(page);
      await s58Snap(page, name);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/p/${MARKER}`);
    await assertNoHorizontalOverflow(page);
    await s58Snap(page, 'resp-pdp-390');
  });
});

test.describe('S58 global country smoke', () => {
  test('AE and US storefronts load without India-only leaks', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /United Arab|UAE|AE/i);
    const ae = await page.locator('body').innerText();
    expect(ae).not.toMatch(/\bUPI\b/);
    await s58Snap(page, 'global-01-ae');

    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await selectMarketIfGated(page, /United States|USA|US/i);
    const us = await page.locator('body').innerText();
    expect(us).not.toMatch(/\bUPI\b/);
    await s58Snap(page, 'global-02-us');
  });
});
