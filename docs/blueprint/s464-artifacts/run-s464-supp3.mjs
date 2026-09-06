import { chromium } from '../../../tools/playwright-harness/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dirname, 'screenshots');
const out = [];

async function otp(page, email, { admin = false } = {}) {
  const f = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await f.waitFor({ state: 'visible', timeout: 20_000 });
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
    if (await send.isVisible().catch(() => false)) {
      for (let i = 0; i < 60; i++) {
        if (await send.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(500);
      }
      await send.click();
    } else {
      await page.getByRole('button', { name: 'Continue' }).click();
    }
  }
  const otpField = page.getByLabel(/One-time code/i);
  await otpField.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 20; i++) {
    if (/^\d{4,8}$/.test(await otpField.inputValue())) break;
    await page.waitForTimeout(250);
  }
  const v = page.getByRole('button', { name: /Verify & sign in/i });
  if (await v.isVisible().catch(() => false)) await v.click();
  else await page.getByRole('button', { name: 'Continue' }).first().click();
  const mfa = page.getByLabel(/Authenticator code/i);
  if (await mfa.isVisible({ timeout: 5000 }).catch(() => false)) {
    for (let i = 0; i < 20; i++) {
      if (/^\d{4,8}$/.test(await mfa.inputValue())) break;
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function snap(p, n) {
  const f = path.join(SHOT, `${n}.png`);
  await p.screenshot({ path: f, fullPage: true });
  return `s464-artifacts/screenshots/${n}.png`;
}

async function selectIndia(page) {
  if (await page.getByRole('heading', { name: 'Choose your market' }).isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: /India/i }).click();
    await page.waitForTimeout(1000);
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // Customer product + care journeys
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3000/login');
    await otp(p, 'sandbox-customer@dev.local');
    await selectIndia(p);
    await p.goto('http://127.0.0.1:3000/p/demo-paracetamol-500');
    await p.waitForTimeout(1200);
    out.push({
      page: 'product',
      shot: await snap(p, 'supp3__product_demo_paracetamol__desktop'),
      text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 700),
      overflow: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
    });
    const add = p.getByRole('button', { name: /add to cart|add to bag/i }).first();
    if (await add.isVisible({ timeout: 5000 }).catch(() => false)) {
      await add.click();
      await p.waitForTimeout(900);
    }
    await p.goto('http://127.0.0.1:3000/cart');
    await p.waitForTimeout(900);
    out.push({
      page: 'cart',
      shot: await snap(p, 'supp3__cart_with_item__desktop'),
      text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400),
    });
    await p.goto('http://127.0.0.1:3000/lab/demo-lipid-panel?country=IN');
    await p.waitForTimeout(1000);
    out.push({
      page: 'lab_detail',
      shot: await snap(p, 'supp3__lab_detail__desktop'),
      text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400),
    });
    await p.goto('http://127.0.0.1:3000/radiology/demo-chest-xray?country=IN');
    await p.waitForTimeout(1000);
    out.push({
      page: 'imaging_detail',
      shot: await snap(p, 'supp3__imaging_detail__desktop'),
      text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400),
    });
    await p.goto('http://127.0.0.1:3000/doctors/01a058ba-e25c-7af4-9853-6ae7279cca40');
    await p.waitForTimeout(1000);
    out.push({
      page: 'doctor_profile',
      shot: await snap(p, 'supp3__doctor_profile__desktop'),
      text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400),
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto('http://127.0.0.1:3000/p/demo-paracetamol-500');
    await p.waitForTimeout(1000);
    out.push({
      page: 'product_mobile',
      shot: await snap(p, 'supp3__product_demo_paracetamol__mobile'),
      overflow: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
      text: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300),
    });
    await c.close();
  }

  // Affiliate
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3010/login');
      await otp(p, 'sandbox-affiliate@dev.local');
      for (const r of ['/', '/links', '/earnings', '/statement', '/profile', '/inbox']) {
        await p.goto(`http://127.0.0.1:3010${r}`);
        await p.waitForTimeout(900);
        const t = await p.locator('body').innerText();
        out.push({
          app: 'affiliate',
          r,
          shot: await snap(p, `supp3_aff_${r.replace(/\W+/g, '_') || 'home'}__desktop`),
          err: /Affiliate portal error/i.test(t),
          sample: t.replace(/\s+/g, ' ').slice(0, 240),
        });
      }
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto('http://127.0.0.1:3010/links');
      await p.waitForTimeout(900);
      out.push({
        app: 'affiliate',
        r: 'links_mobile',
        shot: await snap(p, 'supp3_aff_links__mobile'),
        overflow: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
      });
    } catch (e) {
      out.push({ app: 'affiliate', error: String(e.message || e), shot: await snap(p, 'supp3_aff_fail') });
    }
    await c.close();
  }

  // Vendor
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3004/login');
      await otp(p, 'sandbox-vendor@dev.local');
      for (const t of ['', 'orders', 'catalog', 'inventory']) {
        await p.goto(`http://127.0.0.1:3004/workspace${t ? `/${t}` : ''}`);
        await p.waitForTimeout(900);
        out.push({
          app: 'vendor',
          t: t || 'home',
          shot: await snap(p, `supp3_vendor_${t || 'home'}__desktop`),
          sample: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240),
          overflow: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
        });
      }
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto('http://127.0.0.1:3004/workspace/orders');
      await p.waitForTimeout(900);
      out.push({
        app: 'vendor',
        t: 'orders_mobile',
        shot: await snap(p, 'supp3_vendor_orders__mobile'),
        overflow: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
        sample: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240),
      });
    } catch (e) {
      out.push({ app: 'vendor', error: String(e.message || e) });
    }
    await c.close();
  }

  // Admin
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    try {
      await p.goto('http://127.0.0.1:3001/login');
      await otp(p, 'sandbox-admin@dev.local', { admin: true });
      for (const r of ['/orders', '/catalog', '/payments', '/countries', '/provider-activation', '/launch-readiness', '/cms']) {
        try {
          await p.goto(`http://127.0.0.1:3001${r}`, { timeout: 90_000, waitUntil: 'domcontentloaded' });
          await p.waitForTimeout(1000);
          out.push({
            app: 'admin',
            r,
            shot: await snap(p, `supp3_admin_${r.replace(/\W+/g, '_')}__desktop`),
            sample: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260),
          });
        } catch (e) {
          out.push({ app: 'admin', r, error: String(e.message || e).slice(0, 350) });
        }
      }
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto('http://127.0.0.1:3001/');
      await p.waitForTimeout(1000);
      out.push({
        app: 'admin',
        r: 'mobile_home',
        shot: await snap(p, 'supp3_admin_home__mobile'),
        overflow: await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
        sample: (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260),
      });
    } catch (e) {
      out.push({ app: 'admin', error: String(e.message || e).slice(0, 350) });
    }
    await c.close();
  }

  fs.writeFileSync(path.join(__dirname, 'supplemental3-results.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.map((x) => ({ app: x.app, page: x.page, r: x.r, t: x.t, err: x.err || !!x.error, overflow: x.overflow })), null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
