/**
 * S464 supplemental — market-gated customer commerce + deeper interaction shots.
 * READ/TEST ONLY.
 */
import { chromium } from '../../../tools/playwright-harness/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dirname, 'screenshots');
const EXTRA = [];

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {}
}

async function snap(page, label) {
  const file = `${safeName(label)}.png`;
  await page.screenshot({ path: path.join(SHOT, file), fullPage: true });
  return `s464-artifacts/screenshots/${file}`;
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      url: location.href,
      title: document.title,
      overflowX: doc.scrollWidth > doc.clientWidth + 2,
      overflowAmount: Math.max(0, doc.scrollWidth - doc.clientWidth),
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
      hasMarketGate: /Choose your market/i.test(document.body.innerText || ''),
      productLinks: Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && (/\/p\/|\/medicines|\/product|sku|offer/i.test(h)))
        .slice(0, 20),
      allHrefsSample: Array.from(document.querySelectorAll('main a[href], [data-testid] a[href], a[href*="/p/"]'))
        .map((a) => a.getAttribute('href'))
        .slice(0, 30),
    };
  });
}

async function otpLogin(page, email) {
  const emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await emailField.waitFor({ state: 'visible', timeout: 20_000 });
  await emailField.click();
  await emailField.fill('');
  await emailField.pressSequentially(email, { delay: 12 });
  const send = page.getByRole('button', { name: 'Send OTP' });
  if (await send.isVisible().catch(() => false)) {
    for (let i = 0; i < 45; i++) {
      if (await send.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await send.click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  const otp = page.getByLabel(/One-time code/i);
  await otp.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 20; i++) {
    if (/^\d{4,8}$/.test(await otp.inputValue())) break;
    await page.waitForTimeout(250);
  }
  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) await verify.click();
  else await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function selectMarket(page, country = /India/i) {
  const gate = page.getByRole('heading', { name: 'Choose your market' });
  if (await gate.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByRole('button', { name: country }).click();
    await settle(page, 1000);
    return true;
  }
  // also try button with IN
  const btn = page.getByRole('button', { name: country });
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click();
    await settle(page, 1000);
    return true;
  }
  return false;
}

async function inspect(page, name, viewport) {
  await settle(page);
  const m = await measure(page);
  const shot = await snap(page, `supp__${name}__${viewport}`);
  const row = { name, viewport, shot, ...m };
  EXTRA.push(row);
  console.log(JSON.stringify({ name, viewport, url: m.url, gate: m.hasMarketGate, overflow: m.overflowX, products: m.productLinks.length, hrefs: m.allHrefsSample.slice(0, 8) }));
  return row;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Public with market
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await selectMarket(page, /India/i);
  await inspect(page, 'customer_home_after_market', 'desktop');

  await page.goto('http://127.0.0.1:3000/search', { waitUntil: 'domcontentloaded' });
  await selectMarket(page, /India/i);
  await inspect(page, 'customer_search_after_market', 'desktop');

  // try click first meaningful product-ish card/link
  const candidates = page.locator('main a, main button, [href*="/p/"], [href*="/medicines"]');
  const count = await candidates.count();
  console.log('candidate_count', count);
  // dump links
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({ href: a.getAttribute('href'), text: (a.innerText || '').slice(0, 60) }))
      .filter((x) => x.href && !x.href.startsWith('#') && !x.href.includes('javascript'))
      .slice(0, 80),
  );
  fs.writeFileSync(path.join(__dirname, 'customer-links-after-market.json'), JSON.stringify(links, null, 2));

  // Auth + market
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
  await otpLogin(page, 'sandbox-customer@dev.local');
  await selectMarket(page, /India/i);
  await inspect(page, 'customer_auth_home_market', 'desktop');

  for (const route of ['/search', '/categories', '/lab', '/radiology', '/doctors', '/deals', '/cart', '/checkout', '/orders']) {
    await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'domcontentloaded' });
    await selectMarket(page, /India/i);
    await inspect(page, `customer_auth_${route.replace(/\W+/g, '_')}`, 'desktop');
  }

  // Try medicines category / brands
  for (const route of ['/brands', '/salts', '/stores', '/c/pain-relief', '/medicines']) {
    try {
      const resp = await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await selectMarket(page, /India/i);
      await inspect(page, `customer_explore_${route.replace(/\W+/g, '_')}`, 'desktop');
      console.log('explore', route, resp?.status());
    } catch (e) {
      EXTRA.push({ name: `explore_fail_${route}`, error: String(e.message || e) });
    }
  }

  // Mobile after market
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await selectMarket(page, /India/i);
  await inspect(page, 'customer_home_market', 'mobile');
  await page.goto('http://127.0.0.1:3000/search', { waitUntil: 'domcontentloaded' });
  await inspect(page, 'customer_search_market', 'mobile');
  await page.goto('http://127.0.0.1:3000/cart', { waitUntil: 'domcontentloaded' });
  await inspect(page, 'customer_cart_market', 'mobile');

  // Affiliate statement + codes after login
  await page.setViewportSize({ width: 1440, height: 900 });
  const aff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ap = await aff.newPage();
  await ap.goto('http://127.0.0.1:3010/login', { waitUntil: 'domcontentloaded' });
  try {
    await otpLogin(ap, 'sandbox-affiliate@dev.local');
    for (const r of ['/', '/links', '/codes', '/earnings', '/statement', '/inbox', '/support', '/profile']) {
      await ap.goto(`http://127.0.0.1:3010${r}`, { waitUntil: 'domcontentloaded' });
      await settle(ap);
      const shot = await snap(ap, `supp_aff_${r.replace(/\W+/g, '_') || 'home'}__desktop`);
      const text = await ap.locator('body').innerText();
      EXTRA.push({
        app: 'affiliate',
        route: r,
        shot,
        errorBoundary: /Affiliate portal error/i.test(text),
        sample: text.replace(/\s+/g, ' ').slice(0, 200),
      });
      console.log('aff', r, /Affiliate portal error/i.test(text));
    }
  } catch (e) {
    EXTRA.push({ app: 'affiliate', error: String(e.message || e), shot: await snap(ap, 'supp_aff_login_fail') });
  }
  await aff.close();

  // Vendor workspace tabs visual
  const vend = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const vp = await vend.newPage();
  await vp.goto('http://127.0.0.1:3004/login', { waitUntil: 'domcontentloaded' });
  try {
    await otpLogin(vp, 'sandbox-vendor@dev.local');
    for (const tab of ['orders', 'catalog', 'inventory', 'settlements', 'returns', 'compliance', 'team', 'settings']) {
      await vp.goto(`http://127.0.0.1:3004/workspace/${tab}`, { waitUntil: 'domcontentloaded' });
      await settle(vp);
      EXTRA.push({
        app: 'vendor',
        tab,
        shot: await snap(vp, `supp_vendor_${tab}__desktop`),
        sample: (await vp.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 180),
        overflowX: await vp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
      });
    }
    await vp.setViewportSize({ width: 390, height: 844 });
    await vp.goto('http://127.0.0.1:3004/workspace/orders', { waitUntil: 'domcontentloaded' });
    EXTRA.push({
      app: 'vendor',
      tab: 'orders_mobile',
      shot: await snap(vp, 'supp_vendor_orders__mobile'),
      overflowX: await vp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
      sample: (await vp.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 180),
    });
  } catch (e) {
    EXTRA.push({ app: 'vendor', error: String(e.message || e) });
  }
  await vend.close();

  // Admin denser pages + launch readiness retry
  const adm = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ad = await adm.newPage();
  await ad.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  try {
    const emailField = ad.getByLabel(/Work email|Email/i).first();
    await emailField.fill('sandbox-admin@dev.local');
    await ad.getByRole('button', { name: 'Continue' }).click();
    const otp = ad.getByLabel(/One-time code/i);
    await otp.waitFor({ state: 'visible', timeout: 30000 });
    for (let i = 0; i < 20; i++) {
      if (/^\d{4,8}$/.test(await otp.inputValue())) break;
      await ad.waitForTimeout(250);
    }
    await ad.getByRole('button', { name: 'Continue' }).click();
    const mfa = ad.getByLabel(/Authenticator code/i);
    if (await mfa.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ad.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
    }
    await ad.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60000 });
    for (const r of ['/orders', '/catalog', '/payments', '/countries', '/policy-packs', '/provider-activation', '/cms', '/crm', '/launch-readiness', '/kyc', '/pharmacy', '/pharmacies']) {
      try {
        await ad.goto(`http://127.0.0.1:3001${r}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await settle(ad, 1000);
        EXTRA.push({
          app: 'admin',
          route: r,
          shot: await snap(ad, `supp_admin_${r.replace(/\W+/g, '_')}__desktop`),
          sample: (await ad.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200),
          overflowX: await ad.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
        });
      } catch (e) {
        EXTRA.push({ app: 'admin', route: r, error: String(e.message || e) });
      }
    }
    await ad.setViewportSize({ width: 390, height: 844 });
    await ad.goto('http://127.0.0.1:3001/', { waitUntil: 'domcontentloaded' });
    EXTRA.push({
      app: 'admin',
      route: '/_mobile',
      shot: await snap(ad, 'supp_admin_home__mobile'),
      overflowX: await ad.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
      sample: (await ad.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200),
    });
  } catch (e) {
    EXTRA.push({ app: 'admin', error: String(e.message || e) });
  }
  await adm.close();

  // Logistics CORS detail
  const log = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await log.newPage();
  const net = [];
  lp.on('response', async (r) => {
    if (r.url().includes('/auth/otp') || r.status() >= 400) {
      net.push({ url: r.url(), status: r.status() });
    }
  });
  await lp.goto('http://127.0.0.1:3011/login', { waitUntil: 'domcontentloaded' });
  try {
    const emailField = lp.getByLabel(/Email/i).first();
    await emailField.fill('sandbox-delivery@dev.local');
    await lp.getByRole('button', { name: 'Send OTP' }).click();
    await settle(lp, 2000);
    EXTRA.push({
      app: 'logistics',
      shot: await snap(lp, 'supp_logistics_otp_attempt__desktop'),
      sample: (await lp.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300),
      net,
    });
  } catch (e) {
    EXTRA.push({ app: 'logistics', error: String(e.message || e), net });
  }
  await log.close();

  fs.writeFileSync(path.join(__dirname, 'supplemental-results.json'), JSON.stringify(EXTRA, null, 2));
  await browser.close();
  console.log('supplemental_done', EXTRA.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
