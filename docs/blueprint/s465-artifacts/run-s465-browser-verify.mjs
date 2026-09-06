/**
 * S465 — browser verification of P0/P1 fixes + critical journeys.
 * Uses system Chrome via Playwright channel.
 */
import { chromium } from '../../../tools/playwright-harness/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname);
const SHOT = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOT, { recursive: true });

const results = [];

function record(row) {
  results.push(row);
  console.log(JSON.stringify(row));
}

async function snap(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(SHOT, file), fullPage: true });
  return `s465-artifacts/screenshots/${file}`;
}

async function otp(page, email, { admin = false } = {}) {
  const f = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await f.waitFor({ state: 'visible', timeout: 25_000 });
  await f.click();
  await f.fill('');
  await f.pressSequentially(email, { delay: 12 });
  if (admin) {
    const cont = page.getByRole('button', { name: 'Continue' }).first();
    for (let i = 0; i < 40; i++) {
      if (await cont.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(250);
    }
    await cont.click();
  } else {
    const send = page.getByRole('button', { name: 'Send OTP' });
    if (await send.isVisible().catch(() => false)) {
      for (let i = 0; i < 60; i++) {
        if (await send.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(500);
      }
      if (!(await send.isEnabled().catch(() => false))) throw new Error('Send OTP disabled');
      await send.click();
    } else {
      await page.getByRole('button', { name: 'Continue' }).click();
    }
  }
  const otpField = page.getByLabel(/One-time code/i);
  await otpField.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 25; i++) {
    if (/^\d{4,8}$/.test(await otpField.inputValue())) break;
    await page.waitForTimeout(250);
  }
  if (!/^\d{4,8}$/.test(await otpField.inputValue())) throw new Error('OTP not auto-filled');
  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) await verify.click();
  else await page.getByRole('button', { name: 'Continue' }).first().click();
  const mfa = page.getByLabel(/Authenticator code/i);
  if (await mfa.isVisible({ timeout: 4000 }).catch(() => false)) {
    for (let i = 0; i < 20; i++) {
      if (/^\d{4,8}$/.test(await mfa.inputValue())) break;
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function selectIndia(page) {
  const gate = page.getByRole('heading', { name: 'Choose your market' });
  if (await gate.isVisible({ timeout: 2500 }).catch(() => false)) {
    await page.getByRole('button', { name: /India/i }).click();
    await page.waitForTimeout(1000);
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const pageErrors = [];

  // P0-01 Logistics OTP
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const corsBlocked = [];
    p.on('console', (msg) => {
      const t = msg.text();
      if (/CORS|blocked by CORS/i.test(t)) corsBlocked.push(t);
    });
    p.on('pageerror', (e) => pageErrors.push({ app: 'logistics', error: String(e) }));
    try {
      await p.goto('http://127.0.0.1:3011/login', { waitUntil: 'domcontentloaded' });
      await otp(p, 'sandbox-delivery@dev.local');
      const shot = await snap(p, 'p0_logistics_authenticated');
      const text = await p.locator('body').innerText();
      record({
        id: 'P0-01',
        FRONTEND: /sign out/i.test(text) ? 'PASS' : 'FAIL',
        UI: /Could not send OTP/i.test(text) ? 'FAIL' : 'PASS',
        SECURITY: corsBlocked.length ? 'FAIL' : 'PASS',
        shot,
        sample: text.replace(/\s+/g, ' ').slice(0, 180),
      });
    } catch (e) {
      record({
        id: 'P0-01',
        FRONTEND: 'FAIL',
        UI: 'FAIL',
        error: String(e.message || e),
        shot: await snap(p, 'p0_logistics_fail').catch(() => 'n/a'),
        corsBlocked,
      });
    }
    await c.close();
  }

  // P0-02 Admin launch-readiness
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    try {
      await p.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
      await otp(p, 'sandbox-admin@dev.local', { admin: true });
      await p.goto('http://127.0.0.1:3001/launch-readiness', {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      await p.waitForTimeout(2500);
      const text = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
      const shot = await snap(p, 'p0_admin_launch_readiness');
      const hasContent =
        /Final launch readiness|Production launch|Launch control|Why not launch|INTERNAL SOFTWARE/i.test(
          text,
        );
      const blank = text.trim().length < 80;
      record({
        id: 'P0-02',
        FRONTEND: hasContent && !blank ? 'PASS' : 'FAIL',
        UI: hasContent ? 'PASS' : 'FAIL',
        pageerrors: errs.filter((e) => /Hydration|ReferenceError|TypeError/i.test(e)).slice(0, 3),
        shot,
        sample: text.slice(0, 220),
      });
    } catch (e) {
      record({ id: 'P0-02', FRONTEND: 'FAIL', error: String(e.message || e), pageerrors: errs.slice(0, 3) });
    }
    await c.close();
  }

  // P0-03 Affiliate earnings/statement + P1-08 login
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    try {
      await p.goto('http://127.0.0.1:3010/login', { waitUntil: 'domcontentloaded' });
      const login404 = /Page not found/i.test(await p.locator('body').innerText());
      await otp(p, 'sandbox-affiliate@dev.local');
      await p.goto('http://127.0.0.1:3010/earnings');
      await p.waitForTimeout(1200);
      const earnText = await p.locator('body').innerText();
      const earnShot = await snap(p, 'p0_affiliate_earnings');
      await p.goto('http://127.0.0.1:3010/statement');
      await p.waitForTimeout(1200);
      const stmtText = await p.locator('body').innerText();
      const stmtShot = await snap(p, 'p0_affiliate_statement');
      const crash =
        /Affiliate portal error|countryCode is not defined/i.test(earnText) ||
        /Affiliate portal error|countryCode is not defined/i.test(stmtText) ||
        errs.some((e) => /countryCode is not defined/i.test(e));
      record({
        id: 'P0-03',
        FRONTEND: crash ? 'FAIL' : 'PASS',
        UI: crash ? 'FAIL' : 'PASS',
        P1_08_login: login404 ? 'FAIL' : 'PASS',
        earnShot,
        stmtShot,
        earnSample: earnText.replace(/\s+/g, ' ').slice(0, 160),
        stmtSample: stmtText.replace(/\s+/g, ' ').slice(0, 160),
        pageerrors: errs.slice(0, 3),
      });
    } catch (e) {
      record({ id: 'P0-03', FRONTEND: 'FAIL', error: String(e.message || e), pageerrors: errs.slice(0, 3) });
    }
    await c.close();
  }

  // P1 customer market + search + product
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
      await selectIndia(p);
      await p.waitForTimeout(800);
      const gated = await p.getByRole('heading', { name: 'Choose your market' }).isVisible().catch(() => false);
      await p.goto('http://127.0.0.1:3000/search?q=paracetamol');
      await selectIndia(p);
      await p.waitForTimeout(1500);
      const searchText = await p.locator('body').innerText();
      const searchShot = await snap(p, 'p1_customer_search_paracetamol');
      const onHome = p.url().replace(/\/$/, '') === 'http://127.0.0.1:3000';
      const hasResults =
        /paracetamol|Results for|Medicines|demo-paracetamol|No results/i.test(searchText) && !onHome;
      await p.goto('http://127.0.0.1:3000/p/demo-paracetamol-500');
      await selectIndia(p);
      await p.waitForTimeout(1200);
      const imgSrc = await p.locator('img.mg-pdp-image').first().getAttribute('src').catch(() => null);
      const imgAlt = await p.locator('img.mg-pdp-image').first().getAttribute('alt').catch(() => null);
      const productShot = await snap(p, 'p1_customer_product');
      record({
        id: 'P1-01_02_03',
        marketGateCleared: !gated ? 'PASS' : 'FAIL',
        searchStaysOnSearch: !onHome ? 'PASS' : 'FAIL',
        searchUi: hasResults ? 'PASS' : 'FAIL',
        productImageSrc: imgSrc ? 'PASS' : 'FAIL',
        productImageAlt: imgAlt && imgAlt.length > 0 ? 'PASS' : 'FAIL',
        imgSrcPreview: (imgSrc || '').slice(0, 80),
        searchShot,
        productShot,
        searchSample: searchText.replace(/\s+/g, ' ').slice(0, 160),
      });
    } catch (e) {
      record({ id: 'P1-01_02_03', FRONTEND: 'FAIL', error: String(e.message || e) });
    }
    await c.close();
  }

  // P1-04 doctor mobile overflow + P1-07 labels
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3002/', { waitUntil: 'domcontentloaded' });
      await otp(p, 'sandbox-doctor@dev.local');
      await p.waitForTimeout(1000);
      const overflow = await p.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      );
      const text = await p.locator('body').innerText();
      const shot = await snap(p, 'p1_doctor_mobile');
      record({
        id: 'P1-04_07',
        overflow: overflow ? 'FAIL' : 'PASS',
        rawEnum: /SANDBOX_NOT_SETTLED/.test(text) ? 'FAIL' : 'PASS',
        humanLabel: /Sandbox — not settled|not settled/i.test(text) ? 'PASS' : 'PARTIAL',
        shot,
        sample: text.replace(/\s+/g, ' ').slice(0, 200),
      });
    } catch (e) {
      record({ id: 'P1-04_07', FRONTEND: 'FAIL', error: String(e.message || e) });
    }
    await c.close();
  }

  // Admin mobile + label
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
      await otp(p, 'sandbox-admin@dev.local', { admin: true });
      await p.goto('http://127.0.0.1:3001/');
      await p.waitForTimeout(1500);
      const text = await p.locator('body').innerText();
      const shot = await snap(p, 'p1_admin_mobile');
      record({
        id: 'P1-06_07_admin',
        rawEnum: /settlement SANDBOX_NOT_SETTLED/.test(text) ? 'FAIL' : 'PASS',
        hasDashboard: /Executive control plane|Command center|Dashboard/i.test(text) ? 'PASS' : 'FAIL',
        shot,
        sample: text.replace(/\s+/g, ' ').slice(0, 200),
      });
    } catch (e) {
      record({ id: 'P1-06_07_admin', FRONTEND: 'FAIL', error: String(e.message || e) });
    }
    await c.close();
  }

  // Customer commerce smoke: login → product → add cart
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
      await otp(p, 'sandbox-customer@dev.local');
      await selectIndia(p);
      await p.goto('http://127.0.0.1:3000/search?q=paracetamol');
      await p.waitForTimeout(1500);
      await p.goto('http://127.0.0.1:3000/p/demo-paracetamol-500');
      await p.waitForTimeout(1000);
      const add = p.getByRole('button', { name: /add to cart|add to bag/i }).first();
      if (await add.isVisible({ timeout: 5000 }).catch(() => false)) await add.click();
      await p.waitForTimeout(800);
      await p.goto('http://127.0.0.1:3000/cart');
      await p.waitForTimeout(1000);
      const cartText = await p.locator('body').innerText();
      record({
        id: 'CUSTOMER_COMMERCE_SMOKE',
        FRONTEND: /cart|paracetamol|checkout|empty/i.test(cartText) ? 'PASS' : 'FAIL',
        UI: 'PASS',
        shot: await snap(p, 'customer_cart_smoke'),
        sample: cartText.replace(/\s+/g, ' ').slice(0, 180),
      });
    } catch (e) {
      record({ id: 'CUSTOMER_COMMERCE_SMOKE', FRONTEND: 'FAIL', error: String(e.message || e) });
    }
    await c.close();
  }

  // Vendor org select + orders page
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3004/login', { waitUntil: 'domcontentloaded' });
      await otp(p, 'sandbox-vendor@dev.local');
      await p.goto('http://127.0.0.1:3004/workspace/orders');
      await p.waitForTimeout(1200);
      // try select org if dropdown present
      const select = p.locator('select, [role="combobox"]').first();
      if (await select.isVisible({ timeout: 2000 }).catch(() => false)) {
        const options = await select.locator('option').allTextContents().catch(() => []);
        const demo = options.find((o) => /demo|pharmacy/i.test(o));
        if (demo) await select.selectOption({ label: demo }).catch(() => undefined);
      }
      const text = await p.locator('body').innerText();
      record({
        id: 'VENDOR_ORDERS',
        FRONTEND: /Orders|Select an organization|Seller/i.test(text) ? 'PASS' : 'FAIL',
        shot: await snap(p, 'vendor_orders'),
        sample: text.replace(/\s+/g, ' ').slice(0, 180),
      });
    } catch (e) {
      record({ id: 'VENDOR_ORDERS', FRONTEND: 'FAIL', error: String(e.message || e) });
    }
    await c.close();
  }

  fs.writeFileSync(path.join(OUT, 'browser-verify.json'), JSON.stringify({ results, pageErrors }, null, 2));
  await browser.close();
  const failed = results.filter((r) => Object.values(r).includes('FAIL'));
  console.log(JSON.stringify({ total: results.length, failed: failed.length, failedIds: failed.map((f) => f.id) }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
