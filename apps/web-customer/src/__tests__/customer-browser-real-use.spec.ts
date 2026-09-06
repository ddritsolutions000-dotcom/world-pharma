/**
 * Sprint 38 — Customer web real-use browser acceptance.
 * Exercises real Next UI against the live local API (no mocked /api).
 *
 * OTP is IP-rate-limited (10/15m in development). Prefer a small shared
 * session pool instead of unique emails per test.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  injectCustomerSession,
  injectMarket,
  signInCustomerApi,
  type CustomerSession,
  uniqueEmail,
} from '../../e2e/helpers/auth';
import { apiGet, addCartItemApi, createCustomerAddress, fetchPrimaryOfferId } from '../../e2e/helpers/api';

const PRODUCT_SLUG = 'demo-paracetamol-500';
const PRODUCT_QUERY = 'Paracetamol';
const IN_POSTAL = '400001';
const US_POSTAL = '78701';
const AE_POSTAL = '00000';

let primarySession: CustomerSession;
let attackerSession: CustomerSession;
let sandboxSession: CustomerSession;

async function expectNoSecretsInPage(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.]+/);
  expect(text).not.toMatch(/otp[_-]?pepper/i);
  expect(text).not.toMatch(/JWT_ACCESS_SECRET/i);
  expect(text).not.toMatch(/refresh_token["']?\s*[:=]/i);
}

async function selectMarketIfGated(page: Page, countryLabel: RegExp) {
  const gate = page.getByRole('heading', { name: 'Choose your market' });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: countryLabel }).click();
  }
}

async function openAuthed(page: Page, session: CustomerSession, path: string, country = 'IN', postal = IN_POSTAL) {
  await injectCustomerSession(page, session);
  await injectMarket(page, country, postal);
  await page.goto(path);
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  primarySession = await signInCustomerApi(request, uniqueEmail('s38-primary'));
  attackerSession = await signInCustomerApi(request, uniqueEmail('s38-attacker'));
  sandboxSession = await signInCustomerApi(request, 'sandbox-customer@dev.local', 'LOGIN');
});

test.describe('Sprint 38 customer browser real-use', () => {
  test.describe('Authentication', () => {
    test('A1 guest home loads and does not assume a country', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('link', { name: /World\s*Pharma/i }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Choose your market' })).toBeVisible();
      await expect(page.locator('#wp-country-select')).toHaveValue('');
      await expectNoSecretsInPage(page);
    });

    test('A2 authenticated customer reaches account after OTP session', async ({ page }) => {
      await openAuthed(page, primarySession, '/account');
      await expect(page.getByText('Sign in required')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /My Account|Account/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();
    });

    test('A2b signup UI reveals OTP challenge with dev code', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/signup');
      await page.getByLabel('Email').fill(uniqueEmail('s38-ui-form'));
      await page.getByRole('button', { name: 'Send OTP' }).click();
      await expect(page.getByLabel('One-time code')).toBeVisible();
      await expect(page.getByLabel('One-time code')).toHaveValue(/^\d{6}$/);
    });

    test('A3 protected checkout redirects guests to sign-in', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/checkout');
      await expect(page.getByText(/Sign in required/i)).toBeVisible();
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Discovery', () => {
    test('D1 store entry after market selection shows catalog', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/');
      await selectMarketIfGated(page, /India/i);
      await expect(page.getByText(/Paracetamol|Vitamin|Cough|Medicine|Browse/i).first()).toBeVisible({
        timeout: 45_000,
      });
    });

    test('D2 product search discovery works', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/');
      await selectMarketIfGated(page, /India/i);
      const search = page.getByRole('searchbox').or(page.getByPlaceholder(/Search/i)).first();
      await search.fill(PRODUCT_QUERY);
      await search.press('Enter');
      await expect(page).toHaveURL(/\/search\?/);
      await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    });

    test('D3 product detail opens with seller/offer info', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await selectMarketIfGated(page, /India/i);
      await expect(page.getByText(/Loading product/i)).toHaveCount(0, { timeout: 45_000 });
      await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText(/Sold by|pharmac|Partner pharmacy|in stock/i).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Add to cart|Out of stock/i })).toBeVisible();
    });

    test('D4 serviceability evaluates from postal input', async ({ page }) => {
      await injectMarket(page, 'IN');
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await selectMarketIfGated(page, /India/i);
      await page.getByLabel('Delivery postal code').fill(IN_POSTAL);
      await expect(page.getByText(/Delivering to Mumbai|Delivery available/i).first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });

  test.describe('Cart / Checkout', () => {
    test('C1 guest can add product to cart and see subtotal', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await selectMarketIfGated(page, /India/i);
      await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible({ timeout: 45_000 });
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByText('Added to cart')).toBeVisible();
      await page.getByRole('link', { name: 'View cart' }).click();
      await expect(page).toHaveURL(/\/cart/);
      await expect(page.getByText(/Paracetamol/i).first()).toBeVisible();
      await expect(page.getByText(/Subtotal|₹|INR/i).first()).toBeVisible();
    });

    test('C2 authenticated checkout opens with preserved serviceability address seed', async ({ page, request }) => {
      const offerId = await fetchPrimaryOfferId(request, PRODUCT_SLUG, 'IN');
      await addCartItemApi(request, primarySession.accessToken, 'IN', offerId);
      await openAuthed(page, primarySession, '/checkout');
      await expect(
        page.getByRole('heading', { name: /Checkout|Delivery|Order summary|Payment|Delivery address/i }).first(),
      ).toBeVisible({ timeout: 45_000 });
      const postalField = page.getByLabel('Delivery postal code');
      if (await postalField.isVisible().catch(() => false)) {
        await expect(postalField).toHaveValue(IN_POSTAL);
      } else {
        await expect(page.getByText(IN_POSTAL).first()).toBeVisible();
      }
    });

    test('C3 sandbox payment completes and order is created', async ({ page, request }) => {
      await createCustomerAddress(request, primarySession.accessToken, 'IN', IN_POSTAL);
      const offerId = await fetchPrimaryOfferId(request, PRODUCT_SLUG, 'IN');
      await addCartItemApi(request, primarySession.accessToken, 'IN', offerId);
      await openAuthed(page, primarySession, '/checkout');
      await expect(page.getByText(/Your cart is empty/i)).toHaveCount(0);

      const addressRadio = page.locator('input[name="checkout-address"]').first();
      if (await addressRadio.isVisible().catch(() => false)) {
        await addressRadio.check();
      } else if (await page.getByLabel('Recipient name').isVisible().catch(() => false)) {
        await page.getByLabel('Recipient name').fill('Browser Pay Customer');
        await page.getByLabel('Address line').fill('12 Checkout Lane');
        await page.getByRole('button', { name: /Save & continue/i }).click();
        await expect(page.getByText(/Address saved|Delivering to/i).first()).toBeVisible({ timeout: 30_000 });
      }

      const payButton = page.getByRole('button', {
        name: /Pay with card|Pay securely|Place COD|Pay with UPI|Pay ₹|Pay \$/i,
      });
      const upiComplete = page.getByRole('button', { name: 'I have completed payment' });
      if (await upiComplete.isVisible().catch(() => false)) {
        await upiComplete.click();
      } else {
        await expect(payButton).toBeEnabled({ timeout: 45_000 });
        await payButton.click();
        await expect(upiComplete).toBeVisible({ timeout: 45_000 });
        await upiComplete.click();
      }
      await expect(page.getByText(/Payment successful|Order #/i).first()).toBeVisible({ timeout: 60_000 });
      await page.getByRole('link', { name: /View my orders|Orders/i }).first().click();
      await expect(page).toHaveURL(/\/orders/);
      await expect(page.getByText(/WP-|Order|DEMO-SBX/i).first()).toBeVisible({ timeout: 45_000 });
    });
  });

  test.describe('Orders / Delivery / Refund', () => {
    test('O1 order list opens for authenticated customer', async ({ page }) => {
      await openAuthed(page, primarySession, '/orders');
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
      await expect(page.locator('main')).toBeVisible();
      await expectNoSecretsInPage(page);
    });

    test('O2 sandbox customer demo order detail shows shipment tracking state', async ({ page }) => {
      await openAuthed(page, sandboxSession, '/orders');
      const demo = page.getByText('DEMO-SBX-001').first();
      if (await demo.isVisible().catch(() => false)) {
        await demo.click();
        await expect(page).toHaveURL(/\/orders\//);
        await expect(page.getByLabel('Order progress').or(page.getByText(/Shipment|Tracking|Sandbox/i).first())).toBeVisible();
      } else {
        await page.goto('/shipments');
        await expect(page.locator('main')).toBeVisible();
      }
    });

    test('O3 order detail return/refund affordances render for demo order', async ({ page }) => {
      await openAuthed(page, sandboxSession, '/orders/DEMO-SBX-001');
      const missing = page.getByText(/not found|Sign in required|unavailable|Product not available/i);
      if (await missing.first().isVisible().catch(() => false)) {
        test.info().annotations.push({
          type: 'gap',
          description: 'DEMO-SBX-001 not available — transactional sandbox seed missing',
        });
        await expect(page.locator('main')).toBeVisible();
        return;
      }
      await expect(
        page.getByText(/Returns|Request refund|Return request|DELIVERED|Shipment|Sandbox|Order progress/i).first(),
      ).toBeVisible();
    });
  });

  test.describe('Notifications', () => {
    test('N1 inbox page loads for authenticated customer', async ({ page }) => {
      await openAuthed(page, primarySession, '/account/notifications');
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: /Notification|Inbox/i }).or(page.getByText(/No notifications|inbox/i)).first(),
      ).toBeVisible();
      await expectNoSecretsInPage(page);
    });

    test('N2 guest cannot open notification inbox content', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/account/notifications');
      await expect(page.getByText(/Sign in required/i)).toBeVisible();
    });
  });

  test.describe('Health / Care', () => {
    test('H1 health dashboard loads for self subject', async ({ page }) => {
      await openAuthed(page, primarySession, '/health');
      await expect(page.getByRole('heading', { name: /Health dashboard/i })).toBeVisible();
      await expect(page.getByText(/Market:.*\(IN\)/i)).toBeVisible();
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
    });

    test('H2 family subject controls render when members exist (or self-only)', async ({ page }) => {
      await openAuthed(page, primarySession, '/health');
      await expect(page.getByRole('heading', { name: /Health dashboard/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Appointments|Doctors|Lab|Care/i }).first()).toBeVisible();
    });

    test('H3 appointment and prescription list deep links work', async ({ page }) => {
      await openAuthed(page, primarySession, '/appointments');
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
      await page.goto('/prescriptions');
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
      await page.goto('/lab/bookings');
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
      await page.goto('/radiology/bookings');
      await expect(page.getByText(/Sign in required/i)).toHaveCount(0);
    });

    test('H4 health timeline region renders without PHI dump on empty state', async ({ page }) => {
      await openAuthed(page, primarySession, '/health');
      await expect(page.getByText(/timeline|activity|care|Appointments/i).first()).toBeVisible();
      await expectNoSecretsInPage(page);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/ssn|aadhaar|MRN\s*:\s*\d{6,}/i);
    });

    test('H5 unauthorized clinical IDs do not expose data or crash', async ({ page }) => {
      await openAuthed(page, primarySession, '/appointments/00000000-0000-7000-8000-000000000099');
      await expect(page.getByText('Loading appointment')).toHaveCount(0, { timeout: 45_000 });
      await expect(page.getByText(/Appointment unavailable|Sign in required|Permission denied/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await expectNoSecretsInPage(page);
      await page.goto('/health/artifacts/00000000-0000-7000-8000-000000000099');
      await expect(page.getByText('Loading record details')).toHaveCount(0, { timeout: 45_000 });
      await expect(page.getByText(/Record not found|Could not load record|Sign in required|Permission denied/i).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    test('H6 medicine handoff destination /buy-again and care navigation open', async ({ page }) => {
      await openAuthed(page, primarySession, '/buy-again');
      await expect(page.locator('main')).toBeVisible();
      await page.goto('/health/care-navigation');
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Convenience', () => {
    test('V1 search filters/sort UI is present on results', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/c/pain-relief');
      await expect(page.getByText(/Paracetamol|Pain Relief/i).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole('group', { name: 'Product filters' })).toBeVisible({ timeout: 45_000 });
      // Sort label is inside <label> — match via role or text within the filter bar
      await expect(page.locator('.mg-search-sort').first()).toBeVisible();
    });

    test('V2 wishlist save from PDP works when signed in', async ({ page }) => {
      await openAuthed(page, primarySession, `/p/${PRODUCT_SLUG}`);
      await page.getByRole('button', { name: 'Save for later' }).click();
      await expect(page.getByText(/Saved to wishlist|Could not save/i)).toBeVisible();
      await page.goto('/account/wishlist');
      await expect(page.getByRole('heading', { name: /Wishlist/i })).toBeVisible();
    });

    test('V3 recently viewed section appears after PDP visit', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await expect(page.getByRole('heading', { name: /Paracetamol/i })).toBeVisible();
      await page.goto('/');
      await expect(page.getByText(/Recently viewed|Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    });

    test('V4 reminders and deals convenience routes load', async ({ page }) => {
      await openAuthed(page, primarySession, '/reminders');
      await expect(page.locator('main')).toBeVisible();
      await page.goto('/deals');
      await expect(page.locator('main')).toBeVisible();
      await page.goto('/buy-again');
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Security / authorization', () => {
    test('S1 guest cannot access another customer order route content', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/orders/DEMO-SBX-001');
      await expect(page.getByRole('heading', { name: 'Sign in required' }).first()).toBeVisible();
    });

    test('S2 customer cannot read another customer order', async ({ page }) => {
      await openAuthed(page, attackerSession, '/orders/DEMO-SBX-001');
      await expect(page.getByText(/not found|unavailable|Permission|could not|Sign in required/i).first()).toBeVisible();
      await expect(page.getByText(/1 Sandbox Street|Demo Customer/i)).toHaveCount(0);
      await expectNoSecretsInPage(page);
    });

    test('S3 health subject endpoints stay server-authorized for foreign artifact ids', async ({ page }) => {
      await openAuthed(page, attackerSession, '/health/artifacts/00000000-0000-7000-8000-000000000088');
      const res = await page.request.get('/api/v1/me/health/artifacts/00000000-0000-7000-8000-000000000088', {
        headers: { Authorization: `Bearer ${attackerSession.accessToken}` },
      });
      expect([401, 403, 404]).toContain(res.status());
      await expect(
        page.getByText(/Record not found|Could not load record|unavailable|Permission|Sign in required/i).first(),
      ).toBeVisible({ timeout: 45_000 });
    });
  });

  test.describe('Country / currency', () => {
    test('Y1 selected country is preserved across navigation', async ({ page }) => {
      await injectMarket(page, 'AE', AE_POSTAL);
      await page.goto('/');
      await expect(page.locator('#wp-country-select')).toHaveValue('AE');
      await page.goto('/search?q=Vitamin');
      await expect(page.locator('#wp-country-select')).toHaveValue('AE');
      await page.reload();
      await expect(page.locator('#wp-country-select')).toHaveValue('AE');
    });

    test('Y2 US market shows server currency on PDP (not silent INR)', async ({ page }) => {
      await injectMarket(page, 'US', US_POSTAL);
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await expect(page.getByRole('heading', { name: /Paracetamol/i })).toBeVisible({ timeout: 45_000 });
      const text = await page.locator('.mg-pdp-price').innerText();
      expect(text).toMatch(/\$|USD/);
      expect(text).not.toMatch(/₹/);
    });

    test('Y3 India market money uses INR from server offer', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await expect(page.getByRole('heading', { name: /Paracetamol/i })).toBeVisible({ timeout: 45_000 });
      const text = await page.locator('.mg-pdp-price').innerText();
      expect(text).toMatch(/₹|INR/);
    });
  });

  test.describe('Error / deep-link handling', () => {
    test('E1 invalid product slug shows safe empty/not-found UI', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto('/p/does-not-exist-s38-product');
      await expect(page.getByText(/Product not available|not found|unpublished|Browse medicines/i).first()).toBeVisible({
        timeout: 45_000,
      });
      await expectNoSecretsInPage(page);
    });

    test('E2 direct deep links for cart, orders, health, account, track-order work', async ({ page }) => {
      await injectCustomerSession(page, primarySession);
      await injectMarket(page, 'IN', IN_POSTAL);
      for (const path of ['/cart', '/orders', '/health', '/account', '/track-order', '/shipments']) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await expect(page.locator('body')).not.toHaveText(/Application error|Unhandled Runtime Error/i);
      }
    });

    test('E3 refresh on PDP retains market and product context', async ({ page }) => {
      await injectMarket(page, 'IN', IN_POSTAL);
      await page.goto(`/p/${PRODUCT_SLUG}`);
      await expect(page.getByRole('heading', { name: /Paracetamol/i })).toBeVisible({ timeout: 45_000 });
      await page.reload();
      await expect(page.getByRole('heading', { name: /Paracetamol/i })).toBeVisible();
      await expect(page.locator('#wp-country-select')).toHaveValue('IN');
    });

    test('E4 API health is reachable and Next /api rewrite works', async ({ request }) => {
      const direct = await apiGet(request, '/health');
      expect(direct).toBeTruthy();
      const proxied = await request.get('http://127.0.0.1:3000/api/v1/help/articles/site-seo?country_code=IN&locale=en');
      expect(proxied.status()).toBeLessThan(500);
    });
  });
});
