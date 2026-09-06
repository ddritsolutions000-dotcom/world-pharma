/**
 * Sprint 52 — Real-user UX probe (Playwright).
 * Opens live UIs, exercises journeys, captures screenshots.
 * Does not mock the API.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  injectCustomerSession,
  injectMarket,
  signInCustomerApi,
  type CustomerSession,
} from '../../e2e/helpers/auth';
import { addCartItemApi, fetchPrimaryOfferId } from '../../e2e/helpers/api';

const SHOT_DIR = path.join(__dirname, '../../../test-results/s52-ux-shots');
const IN_POSTAL = '400001';
const PRODUCT_SLUG = 'demo-paracetamol-500';

function shot(name: string) {
  return path.join(SHOT_DIR, `${name}.png`);
}

async function snap(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: shot(name), fullPage: true });
}

async function selectMarketIfGated(page: Page, countryLabel: RegExp) {
  const gate = page.getByRole('heading', { name: 'Choose your market' });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: countryLabel }).click();
  }
}

async function openAuthed(page: Page, session: CustomerSession, pathName: string, country = 'IN', postal = IN_POSTAL) {
  await injectCustomerSession(page, session);
  await injectMarket(page, country, postal);
  await page.goto(pathName);
}

let session: CustomerSession;

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  session = await signInCustomerApi(request, 'sandbox-customer@dev.local', 'LOGIN');
});

test.describe('S52 customer real-user journey', () => {
  test('guest landing → market → home → search → product → cart → checkout gate', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: /World\s*Pharma/i }).first()).toBeVisible();
    await snap(page, '01-customer-guest-home-390');

    await injectMarket(page, 'IN', IN_POSTAL);
    await page.goto('/');
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Paracetamol|Vitamin|Medicine|Browse|Lab/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await snap(page, '02-customer-home-IN-390');

    const search = page.getByRole('searchbox').or(page.getByPlaceholder(/Search/i)).first();
    await search.fill('Paracetamol');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    await snap(page, '03-customer-search-390');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/p/${PRODUCT_SLUG}`);
    await selectMarketIfGated(page, /India/i);
    await expect(page.getByText(/Paracetamol/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: /Add to cart|Out of stock/i })).toBeVisible();
    await snap(page, '04-customer-product-1440');

    const offerId = await fetchPrimaryOfferId(request, PRODUCT_SLUG, 'IN');
    await addCartItemApi(request, session.accessToken, 'IN', offerId);
    await openAuthed(page, session, '/cart');
    await expect(page.getByText(/Cart|Paracetamol|Checkout/i).first()).toBeVisible({ timeout: 45_000 });
    await snap(page, '05-customer-cart');

    await page.goto('/checkout');
    await expect(page.getByText(/Checkout|delivery|Pay|Address|Sign in/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await snap(page, '06-customer-checkout');

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: /My Account|Account/i }).first()).toBeVisible();
    await snap(page, '07-customer-account');

    await page.goto('/orders');
    await expect(page.getByText(/Orders|No orders|order/i).first()).toBeVisible({ timeout: 45_000 });
    await snap(page, '08-customer-orders');

    await page.goto('/health');
    await expect(page.getByText(/Health|records|profile|timeline/i).first()).toBeVisible({
      timeout: 45_000,
    });
    await snap(page, '09-customer-health');

    await page.goto('/help');
    await expect(page.getByText(/Help|FAQ|article|support/i).first()).toBeVisible({ timeout: 45_000 });
    await snap(page, '10-customer-help');
  });

  test('landing pages feel usable as a visitor', async ({ page }) => {
    await injectMarket(page, 'IN', IN_POSTAL);
    const pages = [
      ['/doctors', 'doctors'],
      ['/lab', 'lab'],
      ['/radiology', 'radiology'],
      ['/ayurveda', 'ayurveda'],
      ['/pet-care', 'pet-care'],
      ['/vaccines', 'vaccines'],
      ['/cancer-care', 'cancer-care'],
      ['/care-plan', 'care-plan'],
      ['/about', 'about'],
      ['/contact', 'contact'],
      ['/legal/privacy-policy', 'privacy'],
      ['/legal/terms-and-conditions', 'terms'],
    ] as const;

    for (const [route, name] of pages) {
      await page.goto(route);
      await selectMarketIfGated(page, /India/i);
      const body = page.locator('body');
      await expect(body).not.toContainText(/Cannot GET|Internal Server Error|Application error/i);
      await snap(page, `landing-${name}`);
    }
  });

  test('no empty-country catalog request after market hydrate', async ({ page }) => {
    const bad: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.includes('/api/')) return;
      if (
        /country_code=(?:&|$)|country_code=%22%22|country_code=$/i.test(url) ||
        /[?&]country=(?:&|$)/i.test(url)
      ) {
        bad.push(url);
      }
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Choose your market' })).toBeVisible();
    await page.getByRole('button', { name: /India/i }).click();
    await page.waitForTimeout(2500);
    expect(bad, `empty-country requests: ${bad.join('\n')}`).toEqual([]);
  });
});
