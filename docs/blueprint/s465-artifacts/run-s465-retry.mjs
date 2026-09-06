import { chromium } from '../../../tools/playwright-harness/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dirname, 'screenshots');
const out = [];

async function expireOtp(identifier) {
  try {
    const { PrismaClient } = await import('@world-pharma/database');
    const prisma = new PrismaClient();
    await prisma.otpChallenge.updateMany({
      where: { status: 'PENDING', identifierNormalized: identifier.toLowerCase() },
      data: { status: 'EXPIRED', resendAvailableAt: new Date(0) },
    });
    await prisma.$disconnect();
  } catch (e) {
    out.push({ otpExpire: String(e.message || e) });
  }
}

async function otp(page, email, { admin = false } = {}) {
  await expireOtp(email);
  const f = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await f.waitFor({ state: 'visible', timeout: 25_000 });
  await f.click();
  await f.fill('');
  await f.pressSequentially(email, { delay: 15 });
  if (admin) {
    const cont = page.getByRole('button', { name: 'Continue' }).first();
    for (let i = 0; i < 40; i++) {
      if (await cont.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(250);
    }
    await cont.click();
  } else {
    const send = page.getByRole('button', { name: 'Send OTP' });
    for (let i = 0; i < 60; i++) {
      if (await send.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await send.click();
  }
  const otpField = page.getByLabel(/One-time code/i);
  await otpField.waitFor({ state: 'visible', timeout: 45_000 });
  for (let i = 0; i < 30; i++) {
    if (/^\d{4,8}$/.test(await otpField.inputValue())) break;
    await page.waitForTimeout(300);
  }
  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) await verify.click();
  else await page.getByRole('button', { name: 'Continue' }).first().click();
  const mfa = page.getByLabel(/Authenticator code/i);
  if (await mfa.isVisible({ timeout: 4000 }).catch(() => false)) {
    await page.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function pickIndia(page) {
  const gate = page.getByRole('heading', { name: 'Choose your market' });
  if (!(await gate.isVisible({ timeout: 2000 }).catch(() => false))) return true;
  await page.getByRole('button', { name: /India/i }).click();
  await gate.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  return !(await gate.isVisible().catch(() => false));
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // Logistics login on / and /login
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const cors = [];
    p.on('console', (m) => {
      if (/CORS|blocked by CORS/i.test(m.text())) cors.push(m.text());
    });
    try {
      await p.goto('http://127.0.0.1:3011/login', { waitUntil: 'domcontentloaded' });
      const body = await p.locator('body').innerText();
      if (/Page not found/i.test(body)) {
        await p.goto('http://127.0.0.1:3011/', { waitUntil: 'domcontentloaded' });
      }
      await otp(p, 'sandbox-delivery@dev.local');
      await p.screenshot({ path: path.join(SHOT, 'p0_logistics_ok.png'), fullPage: true });
      out.push({
        id: 'P0-01',
        FRONTEND: 'PASS',
        SECURITY_CORS: cors.length ? 'FAIL' : 'PASS',
        sample: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 180),
      });
    } catch (e) {
      await p.screenshot({ path: path.join(SHOT, 'p0_logistics_retry_fail.png'), fullPage: true }).catch(() => {});
      out.push({ id: 'P0-01', FRONTEND: 'FAIL', error: String(e.message || e), cors });
    }
    await c.close();
  }

  // Affiliate
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    try {
      await p.goto('http://127.0.0.1:3010/login', { waitUntil: 'domcontentloaded' });
      const loginOk = !(await p.getByRole('heading', { name: /Page not found/i }).isVisible().catch(() => false));
      await otp(p, 'sandbox-affiliate@dev.local');
      await p.goto('http://127.0.0.1:3010/earnings');
      await p.waitForTimeout(1200);
      const earn = await p.locator('body').innerText();
      await p.goto('http://127.0.0.1:3010/statement');
      await p.waitForTimeout(1200);
      const stmt = await p.locator('body').innerText();
      await p.screenshot({ path: path.join(SHOT, 'p0_aff_ok.png'), fullPage: true });
      const crash =
        /Affiliate portal error|countryCode is not defined/i.test(earn + stmt) ||
        errs.some((e) => /countryCode/i.test(e));
      out.push({
        id: 'P0-03',
        FRONTEND: crash ? 'FAIL' : 'PASS',
        P1_08_login: loginOk ? 'PASS' : 'FAIL',
        earn: earn.replace(/\s+/g, ' ').slice(0, 140),
        stmt: stmt.replace(/\s+/g, ' ').slice(0, 140),
        errs: errs.slice(0, 2),
      });
    } catch (e) {
      out.push({ id: 'P0-03', FRONTEND: 'FAIL', error: String(e.message || e), errs: errs.slice(0, 2) });
    }
    await c.close();
  }

  // Market + product image
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3000/');
      const clearedHome = await pickIndia(p);
      await p.goto('http://127.0.0.1:3000/search?q=paracetamol');
      const clearedSearch = await pickIndia(p);
      await p.waitForTimeout(1500);
      const searchUrl = p.url();
      const searchText = await p.locator('body').innerText();
      await p.goto('http://127.0.0.1:3000/p/demo-paracetamol-500');
      const clearedPdp = await pickIndia(p);
      await p.waitForTimeout(1500);
      const img = p.locator('img.mg-pdp-image').first();
      const visible = await img.isVisible({ timeout: 5000 }).catch(() => false);
      const src = visible ? await img.getAttribute('src') : null;
      const alt = visible ? await img.getAttribute('alt') : null;
      await p.screenshot({ path: path.join(SHOT, 'p1_product_ok.png'), fullPage: true });
      out.push({
        id: 'P1-market-product',
        clearedHome: clearedHome ? 'PASS' : 'FAIL',
        clearedSearch: clearedSearch ? 'PASS' : 'FAIL',
        clearedPdp: clearedPdp ? 'PASS' : 'FAIL',
        searchUrl,
        searchHasResults: /Results for|Paracetamol|Medicines|No results|Search medicines/i.test(searchText)
          ? 'PASS'
          : 'FAIL',
        image: visible && src ? 'PASS' : 'FAIL',
        alt: alt ? 'PASS' : 'FAIL',
        srcPreview: (src || '').slice(0, 100),
      });
    } catch (e) {
      out.push({ id: 'P1-market-product', FRONTEND: 'FAIL', error: String(e.message || e) });
    }
    await c.close();
  }

  fs.writeFileSync(path.join(__dirname, 'browser-verify-retry.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  if (out.some((r) => Object.values(r).includes('FAIL'))) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
