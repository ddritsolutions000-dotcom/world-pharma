/**
 * S464 — Full UI/UX browser visual QA harness (READ/TEST ONLY).
 * Does not modify application code. Uses system Chrome via Playwright channel.
 */
import { chromium } from '../../../tools/playwright-harness/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(__dirname);
const SHOT = path.join(OUT, 'screenshots');
const FINDINGS = [];
const PAGE_RESULTS = [];
const CONSOLE_ERRORS = [];

fs.mkdirSync(SHOT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const APPS = {
  customer: 'http://127.0.0.1:3000',
  admin: 'http://127.0.0.1:3001',
  doctor: 'http://127.0.0.1:3002',
  store: 'http://127.0.0.1:3003',
  vendor: 'http://127.0.0.1:3004',
  lab: 'http://127.0.0.1:3005',
  radiology: 'http://127.0.0.1:3006',
  radiologist: 'http://127.0.0.1:3007',
  join: 'http://127.0.0.1:3008',
  pathologist: 'http://127.0.0.1:3009',
  affiliate: 'http://127.0.0.1:3010',
  logistics: 'http://127.0.0.1:3011',
};

const ACTORS = {
  customer: 'sandbox-customer@dev.local',
  admin: 'sandbox-admin@dev.local',
  doctor: 'sandbox-doctor@dev.local',
  vendor: 'sandbox-vendor@dev.local',
  lab: 'sandbox-lab@dev.local',
  imaging: 'sandbox-imaging@dev.local',
  radiologist: 'sandbox-radiologist@dev.local',
  pathologist: 'sandbox-pathologist@dev.local',
  delivery: 'sandbox-delivery@dev.local',
  affiliate: 'sandbox-affiliate@dev.local',
};

function addFinding(f) {
  FINDINGS.push({ id: `S464-${String(FINDINGS.length + 1).padStart(3, '0')}`, ...f });
}

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

async function settle(page, ms = 800) {
  await page.waitForTimeout(ms);
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    /* tolerate slow polling */
  }
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const overflowX = doc.scrollWidth > doc.clientWidth + 2;
    const overflowAmount = Math.max(0, doc.scrollWidth - doc.clientWidth);
    const texts = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
    let clippedText = 0;
    let overlappingSuspect = 0;
    let brokenImg = 0;
    let rawJson = 0;
    const imgs = Array.from(document.images);
    for (const img of imgs) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) brokenImg += 1;
    }
    const bodyText = body.innerText || '';
    if (/^\s*[\{\[]/.test(bodyText.trim()) && bodyText.includes('"') && bodyText.length < 4000) {
      rawJson += 1;
    }
    if (/"status"\s*:\s*"|"error"\s*:\s*|{\s*"data"\s*:/.test(bodyText) && body.querySelectorAll('pre,code').length === 0) {
      // soft signal only counted if large JSON-looking blocks
      const matches = bodyText.match(/\{[^{}]{80,}\}/g);
      if (matches && matches.length) rawJson += matches.length;
    }
    const localhostClaims = (bodyText.match(/localhost:\d+/gi) || []).length;
    const mockProdClaims = /live production|real psp|production ready|go-live complete/i.test(bodyText);
    // sample overlapping fixed/absolute elements
    const candidates = Array.from(document.querySelectorAll('header, nav, main, footer, [role="dialog"], button, h1, h2'));
    const boxes = candidates.slice(0, 40).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        text: (el.innerText || '').slice(0, 40),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        z: cs.zIndex,
        pos: cs.position,
        overflow: cs.overflow,
        display: cs.display,
      };
    });
    for (const el of Array.from(document.querySelectorAll('p, span, a, button, td, th, label, h1, h2, h3')).slice(0, 200)) {
      const cs = getComputedStyle(el);
      if (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') {
        if (el.scrollWidth > el.clientWidth + 2) clippedText += 1;
      }
    }
    // cramped / whitespace heuristics
    const main = document.querySelector('main') || body;
    const mainRect = main.getBoundingClientRect();
    const children = Array.from(main.children).filter((c) => getComputedStyle(c).display !== 'none');
    let largeEmptyGaps = 0;
    for (let i = 1; i < Math.min(children.length, 20); i++) {
      const a = children[i - 1].getBoundingClientRect();
      const b = children[i].getBoundingClientRect();
      const gap = b.top - a.bottom;
      if (gap > 120) largeEmptyGaps += 1;
    }
    const buttons = Array.from(document.querySelectorAll('button')).slice(0, 40).map((b) => {
      const r = b.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width), text: (b.innerText || '').slice(0, 30) };
    });
    const heights = buttons.map((b) => b.h).filter((h) => h > 0);
    const uniqueHeights = [...new Set(heights)];
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).slice(0, 30).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, h: Math.round(r.height), type: el.getAttribute('type') || '' };
    });
    const tables = Array.from(document.querySelectorAll('table')).map((t) => {
      const r = t.getBoundingClientRect();
      return {
        overflowParent: t.parentElement ? t.parentElement.scrollWidth > t.parentElement.clientWidth + 2 : false,
        cols: t.querySelectorAll('th').length || t.querySelectorAll('td').length,
        width: Math.round(r.width),
        viewportOverflow: r.right > window.innerWidth + 2,
      };
    });
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 12).map((h) => ({
      tag: h.tagName,
      text: (h.innerText || '').slice(0, 80),
    }));
    return {
      title: document.title,
      url: location.href,
      overflowX,
      overflowAmount,
      brokenImg,
      rawJson,
      localhostClaims,
      mockProdClaims,
      clippedText,
      largeEmptyGaps,
      mainWidth: Math.round(mainRect.width),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      buttonHeightVariants: uniqueHeights.length,
      buttonHeights: uniqueHeights.slice(0, 8),
      buttonsSample: buttons.slice(0, 8),
      inputsSample: inputs.slice(0, 8),
      tables,
      headings,
      bodyTextLen: bodyText.length,
      hasSignOut: /sign out/i.test(bodyText),
      hasSendOtp: /send otp/i.test(bodyText),
      visibleTextSample: bodyText.replace(/\s+/g, ' ').slice(0, 400),
    };
  });
}

async function snap(page, label) {
  const file = `${safeName(label)}.png`;
  const full = path.join(SHOT, file);
  await page.screenshot({ path: full, fullPage: true });
  return `s464-artifacts/screenshots/${file}`;
}

async function inspectPage(page, meta) {
  const { app, pageName, viewport, auth } = meta;
  await settle(page, 600);
  const metrics = await measureLayout(page);
  const shot = await snap(page, `${app}__${pageName}__${viewport}`);
  const status = {
    app,
    page: pageName,
    viewport,
    auth: !!auth,
    url: page.url(),
    title: metrics.title,
    shot,
    overflowX: metrics.overflowX,
    overflowAmount: metrics.overflowAmount,
    brokenImg: metrics.brokenImg,
    rawJson: metrics.rawJson,
    localhostClaims: metrics.localhostClaims,
    clippedText: metrics.clippedText,
    largeEmptyGaps: metrics.largeEmptyGaps,
    buttonHeightVariants: metrics.buttonHeightVariants,
    tables: metrics.tables,
    headings: metrics.headings,
    hasSignOut: metrics.hasSignOut,
    bodyTextLen: metrics.bodyTextLen,
    visibleTextSample: metrics.visibleTextSample,
    consoleErrors: [],
  };

  if (metrics.overflowX) {
    addFinding({
      severity: viewport === 'mobile' || viewport === 'tablet' ? 'P1' : 'P2',
      app,
      page: pageName,
      viewport,
      element: 'document/page',
      problem: `Horizontal page overflow (+${metrics.overflowAmount}px)`,
      expected: 'No horizontal scrollbar; content fits viewport',
      actual: `scrollWidth exceeds clientWidth by ${metrics.overflowAmount}px`,
      evidence: shot,
      reproduction: `Open ${page.url()} at ${viewport} ${meta.vpSize}`,
    });
  }
  if (metrics.brokenImg > 0) {
    addFinding({
      severity: 'P2',
      app,
      page: pageName,
      viewport,
      element: 'img',
      problem: `${metrics.brokenImg} broken image(s)`,
      expected: 'All images load or show intentional placeholders',
      actual: `${metrics.brokenImg} img with naturalWidth=0`,
      evidence: shot,
      reproduction: `Open ${page.url()}`,
    });
  }
  if (metrics.rawJson > 0) {
    addFinding({
      severity: 'P1',
      app,
      page: pageName,
      viewport,
      element: 'body text',
      problem: 'Possible raw JSON exposed to users',
      expected: 'Human-readable UI states only',
      actual: `rawJson heuristic=${metrics.rawJson}; sample=${metrics.visibleTextSample.slice(0, 120)}`,
      evidence: shot,
      reproduction: `Open ${page.url()}`,
    });
  }
  if (metrics.localhostClaims > 2 && app === 'customer' && !auth) {
    addFinding({
      severity: 'P2',
      app,
      page: pageName,
      viewport,
      element: 'page copy',
      problem: `localhost URLs visible in page text (${metrics.localhostClaims})`,
      expected: 'No localhost links presented as production content',
      actual: `${metrics.localhostClaims} localhost mentions`,
      evidence: shot,
      reproduction: `Open ${page.url()} logged out`,
    });
  }
  if (metrics.tables.some((t) => t.viewportOverflow)) {
    addFinding({
      severity: viewport === 'mobile' ? 'P1' : 'P2',
      app,
      page: pageName,
      viewport,
      element: 'table',
      problem: 'Table overflows viewport',
      expected: 'Tables scroll within container or stack responsively',
      actual: 'table.getBoundingClientRect().right > viewport',
      evidence: shot,
      reproduction: `Open ${page.url()} at ${viewport}`,
    });
  }
  if (metrics.buttonHeightVariants >= 4) {
    addFinding({
      severity: 'P3',
      app,
      page: pageName,
      viewport,
      element: 'buttons',
      problem: `Inconsistent button heights (${metrics.buttonHeightVariants} variants: ${metrics.buttonHeights.join(',')})`,
      expected: 'Consistent primary/secondary control heights per design system',
      actual: `${metrics.buttonHeightVariants} distinct heights`,
      evidence: shot,
      reproduction: `Open ${page.url()}`,
    });
  }
  if (metrics.bodyTextLen < 40 && !/login|sign/i.test(pageName)) {
    addFinding({
      severity: 'P2',
      app,
      page: pageName,
      viewport,
      element: 'main content',
      problem: 'Near-empty page body after settle',
      expected: 'Meaningful content, empty-state, or loading completed',
      actual: `bodyTextLen=${metrics.bodyTextLen}`,
      evidence: shot,
      reproduction: `Open ${page.url()}`,
    });
  }

  PAGE_RESULTS.push(status);
  return { metrics, shot, status };
}

async function otpLogin(page, email, { admin = false } = {}) {
  // Prefer labeled email field
  const emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await emailField.waitFor({ state: 'visible', timeout: 20_000 });
  await emailField.click();
  await emailField.fill('');
  await emailField.pressSequentially(email, { delay: 12 });

  if (admin) {
    const cont = page.getByRole('button', { name: 'Continue' }).first();
    await cont.click();
  } else {
    const send = page.getByRole('button', { name: 'Send OTP' });
    if (await send.isVisible().catch(() => false)) {
      for (let i = 0; i < 45; i++) {
        if (await send.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(500);
      }
      if (!(await send.isEnabled().catch(() => false))) {
        throw new Error(`Send OTP disabled for ${email}`);
      }
      await send.click();
    } else {
      await page.getByRole('button', { name: 'Continue' }).click();
    }
  }

  const otp = page.getByLabel(/One-time code/i);
  await otp.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 20; i++) {
    const v = await otp.inputValue();
    if (/^\d{4,8}$/.test(v)) break;
    await page.waitForTimeout(250);
  }
  const v = await otp.inputValue();
  if (!/^\d{4,8}$/.test(v)) throw new Error(`OTP not auto-filled for ${email}`);

  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) {
    await verify.click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).first().click();
  }

  const mfa = page.getByLabel(/Authenticator code/i);
  if (await mfa.isVisible({ timeout: 4000 }).catch(() => false)) {
    for (let i = 0; i < 20; i++) {
      const mv = await mfa.inputValue();
      if (/^\d{4,8}$/.test(mv)) break;
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
  }

  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function tryGoto(page, url) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  return resp;
}

async function clickIfVisible(page, role, name, timeout = 2500) {
  const loc = page.getByRole(role, { name });
  if (await loc.first().isVisible({ timeout }).catch(() => false)) {
    await loc.first().click();
    return true;
  }
  return false;
}

async function runPublicCustomer(context) {
  const routes = [
    ['home', '/'],
    ['medicines_search', '/search'],
    ['categories', '/categories'],
    ['deals', '/deals'],
    ['lab', '/lab'],
    ['radiology', '/radiology'],
    ['doctors', '/doctors'],
    ['health', '/health'],
    ['faq', '/faq'],
    ['help', '/help'],
    ['contact', '/contact'],
    ['about', '/about'],
    ['cart', '/cart'],
    ['wishlist', '/wishlist'],
    ['login', '/login'],
    ['legal', '/legal'],
  ];
  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') CONSOLE_ERRORS.push({ app: 'customer', page: page.url(), text: msg.text() });
    });
    page.on('pageerror', (err) => CONSOLE_ERRORS.push({ app: 'customer', page: page.url(), text: String(err) }));
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, route] of routes) {
      try {
        await tryGoto(page, `${APPS.customer}${route}`);
        await inspectPage(page, {
          app: 'customer',
          pageName: `public_${name}`,
          viewport: vp.name,
          vpSize: `${vp.width}x${vp.height}`,
          auth: false,
        });
      } catch (e) {
        addFinding({
          severity: 'P0',
          app: 'customer',
          page: `public_${name}`,
          viewport: vp.name,
          element: 'navigation',
          problem: `Failed to open/inspect ${route}`,
          expected: 'Page loads and settles',
          actual: String(e.message || e),
          evidence: 'n/a',
          reproduction: `Open ${APPS.customer}${route} at ${vp.name}`,
        });
      }
    }
    // Product discovery click-through on desktop only (deeper)
    if (vp.name === 'desktop') {
      try {
        await tryGoto(page, `${APPS.customer}/search`);
        await settle(page, 1000);
        const productLink = page.locator('a[href*="/p/"], a[href*="/c/"]').first();
        if (await productLink.isVisible({ timeout: 8000 }).catch(() => false)) {
          await productLink.click();
          await inspectPage(page, {
            app: 'customer',
            pageName: 'public_product_detail',
            viewport: vp.name,
            vpSize: `${vp.width}x${vp.height}`,
            auth: false,
          });
        } else {
          addFinding({
            severity: 'P1',
            app: 'customer',
            page: 'public_search',
            viewport: vp.name,
            element: 'product listing',
            problem: 'No product links found to open product detail',
            expected: 'Search/listing shows clickable products',
            actual: 'No /p/ or /c/ anchors visible',
            evidence: await snap(page, 'customer__public_search_no_products__desktop'),
            reproduction: 'Open /search as public user',
          });
        }
      } catch (e) {
        addFinding({
          severity: 'P1',
          app: 'customer',
          page: 'public_product_detail',
          viewport: vp.name,
          element: 'product detail',
          problem: 'Product detail click-through failed',
          expected: 'Can open a product from search',
          actual: String(e.message || e),
          evidence: 'n/a',
          reproduction: 'Search → click product',
        });
      }
    }
    await page.close();
  }
}

async function runAuthenticatedCustomer(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') CONSOLE_ERRORS.push({ app: 'customer-auth', page: page.url(), text: msg.text() });
  });
  try {
    await tryGoto(page, `${APPS.customer}/login`);
    await otpLogin(page, ACTORS.customer);
    await settle(page, 1000);
    await inspectPage(page, {
      app: 'customer',
      pageName: 'auth_home',
      viewport: 'desktop',
      vpSize: '1440x900',
      auth: true,
    });

    const authRoutes = [
      ['orders', '/orders'],
      ['account', '/account'],
      ['family', '/family'],
      ['wishlist', '/wishlist'],
      ['cart', '/cart'],
      ['checkout', '/checkout'],
      ['appointments', '/appointments'],
      ['prescriptions', '/prescriptions'],
      ['lab', '/lab'],
      ['radiology', '/radiology'],
      ['doctors', '/doctors'],
      ['health', '/health'],
      ['track_order', '/track-order'],
      ['buy_again', '/buy-again'],
      ['reminders', '/reminders'],
    ];
    for (const [name, route] of authRoutes) {
      try {
        await tryGoto(page, `${APPS.customer}${route}`);
        await inspectPage(page, {
          app: 'customer',
          pageName: `auth_${name}`,
          viewport: 'desktop',
          vpSize: '1440x900',
          auth: true,
        });
      } catch (e) {
        addFinding({
          severity: 'P1',
          app: 'customer',
          page: `auth_${name}`,
          viewport: 'desktop',
          element: 'route',
          problem: `Auth route failed: ${route}`,
          expected: 'Authenticated page loads',
          actual: String(e.message || e),
          evidence: 'n/a',
          reproduction: `Login as customer → ${route}`,
        });
      }
    }

    // Interaction: medicines → product → add to cart if possible
    try {
      await tryGoto(page, `${APPS.customer}/search`);
      await settle(page, 1000);
      const productLink = page.locator('a[href*="/p/"]').first();
      if (await productLink.isVisible({ timeout: 8000 }).catch(() => false)) {
        await productLink.click();
        await inspectPage(page, {
          app: 'customer',
          pageName: 'auth_product_detail',
          viewport: 'desktop',
          vpSize: '1440x900',
          auth: true,
        });
        const add = page.getByRole('button', { name: /add to cart|add to bag/i }).first();
        if (await add.isVisible({ timeout: 5000 }).catch(() => false)) {
          await add.click();
          await settle(page, 800);
          await tryGoto(page, `${APPS.customer}/cart`);
          await inspectPage(page, {
            app: 'customer',
            pageName: 'auth_cart_after_add',
            viewport: 'desktop',
            vpSize: '1440x900',
            auth: true,
          });
        }
      }
    } catch (e) {
      addFinding({
        severity: 'P1',
        app: 'customer',
        page: 'auth_commerce_interaction',
        viewport: 'desktop',
        element: 'add to cart',
        problem: 'Commerce interaction failed',
        expected: 'Can open product and attempt add-to-cart',
        actual: String(e.message || e),
        evidence: 'n/a',
        reproduction: 'Search → product → Add to cart → Cart',
      });
    }

    // Mobile auth spot-check
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, route] of [
      ['home', '/'],
      ['orders', '/orders'],
      ['cart', '/cart'],
      ['account', '/account'],
    ]) {
      await tryGoto(page, `${APPS.customer}${route}`);
      await inspectPage(page, {
        app: 'customer',
        pageName: `auth_mobile_${name}`,
        viewport: 'mobile',
        vpSize: '390x844',
        auth: true,
      });
    }
  } catch (e) {
    addFinding({
      severity: 'P0',
      app: 'customer',
      page: 'login',
      viewport: 'desktop',
      element: 'OTP login',
      problem: 'Customer sandbox login failed',
      expected: 'OTP login succeeds with AUTH_DEV_REVEAL',
      actual: String(e.message || e),
      evidence: await snap(page, 'customer__login_fail__desktop').catch(() => 'n/a'),
      reproduction: 'Open /login → sandbox-customer@dev.local → Send OTP → Verify',
    });
  }
  await context.close();
}

async function runPortal(browser, { app, base, email, routes, admin = false, tabs = [] }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') CONSOLE_ERRORS.push({ app, page: page.url(), text: msg.text() });
  });
  page.on('pageerror', (err) => CONSOLE_ERRORS.push({ app, page: page.url(), text: String(err) }));

  try {
    await tryGoto(page, `${base}/login`);
    if (!(await page.getByLabel(/Email/i).first().isVisible({ timeout: 5000 }).catch(() => false))) {
      await tryGoto(page, base);
    }
    await inspectPage(page, {
      app,
      pageName: 'login',
      viewport: 'desktop',
      vpSize: '1440x900',
      auth: false,
    });
    await otpLogin(page, email, { admin });
    await settle(page, 1200);
    await inspectPage(page, {
      app,
      pageName: 'dashboard_home',
      viewport: 'desktop',
      vpSize: '1440x900',
      auth: true,
    });

    for (const [name, route] of routes) {
      try {
        await tryGoto(page, `${base}${route}`);
        await inspectPage(page, {
          app,
          pageName: name,
          viewport: 'desktop',
          vpSize: '1440x900',
          auth: true,
        });
      } catch (e) {
        addFinding({
          severity: 'P1',
          app,
          page: name,
          viewport: 'desktop',
          element: 'route',
          problem: `Failed route ${route}`,
          expected: 'Page loads',
          actual: String(e.message || e),
          evidence: 'n/a',
          reproduction: `Login ${email} → ${route}`,
        });
      }
    }

    // Click visible tab/nav buttons if provided
    for (const tab of tabs) {
      try {
        const clicked =
          (await clickIfVisible(page, 'link', new RegExp(tab, 'i'))) ||
          (await clickIfVisible(page, 'button', new RegExp(`^${tab}$`, 'i'))) ||
          (await clickIfVisible(page, 'tab', new RegExp(tab, 'i')));
        if (clicked) {
          await settle(page, 700);
          await inspectPage(page, {
            app,
            pageName: `tab_${safeName(tab)}`,
            viewport: 'desktop',
            vpSize: '1440x900',
            auth: true,
          });
        }
      } catch (e) {
        addFinding({
          severity: 'P2',
          app,
          page: `tab_${tab}`,
          viewport: 'desktop',
          element: 'tab/nav',
          problem: `Tab interaction failed: ${tab}`,
          expected: 'Tab/nav control works',
          actual: String(e.message || e),
          evidence: 'n/a',
          reproduction: `Click ${tab}`,
        });
      }
    }

    // Responsive spot checks
    for (const vp of [
      { name: 'laptop', width: 1280, height: 800 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await tryGoto(page, base);
      await settle(page, 700);
      await inspectPage(page, {
        app,
        pageName: 'dashboard_home',
        viewport: vp.name,
        vpSize: `${vp.width}x${vp.height}`,
        auth: true,
      });
    }
  } catch (e) {
    addFinding({
      severity: 'P0',
      app,
      page: 'login',
      viewport: 'desktop',
      element: 'auth',
      problem: `${app} login/session failed`,
      expected: 'Sandbox OTP login succeeds',
      actual: String(e.message || e),
      evidence: await snap(page, `${app}__login_fail`).catch(() => 'n/a'),
      reproduction: `Open ${base} → login as ${email}`,
    });
  }
  await context.close();
}

async function runJoinPublic(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const routes = [
    ['home', '/'],
    ['login', '/login'],
    ['apply', '/apply'],
    ['pharmacy', '/pharmacy'],
    ['doctor', '/doctor'],
    ['lab', '/lab'],
    ['imaging', '/imaging'],
    ['delivery', '/delivery'],
    ['affiliate', '/affiliate'],
    ['status', '/status'],
  ];
  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, route] of routes) {
      try {
        await tryGoto(page, `${APPS.join}${route}`);
        await inspectPage(page, {
          app: 'join',
          pageName: name,
          viewport: vp.name,
          vpSize: `${vp.width}x${vp.height}`,
          auth: false,
        });
      } catch (e) {
        addFinding({
          severity: 'P1',
          app: 'join',
          page: name,
          viewport: vp.name,
          element: 'route',
          problem: `Join route failed ${route}`,
          expected: 'Page loads',
          actual: String(e.message || e),
          evidence: 'n/a',
          reproduction: `Open ${APPS.join}${route}`,
        });
      }
    }
  }
  await context.close();
}

async function main() {
  const started = new Date().toISOString();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  // Public customer all viewports
  {
    const ctx = await browser.newContext();
    await runPublicCustomer(ctx);
    await ctx.close();
  }

  await runAuthenticatedCustomer(browser);

  await runPortal(browser, {
    app: 'admin',
    base: APPS.admin,
    email: ACTORS.admin,
    admin: true,
    routes: [
      ['customers_identity', '/identity'],
      ['vendors', '/vendor'],
      ['doctors', '/doctors'],
      ['labs', '/labs'],
      ['imaging', '/imaging'],
      ['delivery', '/delivery'],
      ['affiliates', '/affiliates'],
      ['catalog', '/catalog'],
      ['inventory', '/inventory'],
      ['orders', '/orders'],
      ['payments', '/payments'],
      ['finance', '/finance'],
      ['countries', '/countries'],
      ['policy_packs', '/policy-packs'],
      ['provider_activation', '/provider-activation'],
      ['launch_readiness', '/launch-readiness'],
      ['notifications', '/notifications'],
      ['support', '/support'],
      ['cms', '/cms'],
      ['crm', '/crm'],
      ['marketing', '/marketing'],
      ['seo', '/seo'],
      ['storefront', '/storefront'],
      ['logistics', '/logistics'],
      ['approvals', '/approvals'],
      ['governance', '/governance'],
      ['security', '/security'],
    ],
    tabs: [],
  });

  await runPortal(browser, {
    app: 'vendor',
    base: APPS.vendor,
    email: ACTORS.vendor,
    routes: [
      ['workspace', '/workspace'],
      ['workspace_orders', '/workspace/orders'],
      ['workspace_catalog', '/workspace/catalog'],
      ['workspace_inventory', '/workspace/inventory'],
      ['workspace_settlements', '/workspace/settlements'],
      ['workspace_returns', '/workspace/returns'],
      ['workspace_team', '/workspace/team'],
      ['workspace_settings', '/workspace/settings'],
    ],
    tabs: ['Dashboard', 'Orders', 'Catalog', 'Inventory', 'Settlements'],
  });

  await runPortal(browser, {
    app: 'doctor',
    base: APPS.doctor,
    email: ACTORS.doctor,
    routes: [
      ['appointments', '/appointments'],
      ['availability', '/availability'],
      ['patients', '/patients'],
      ['prescriptions', '/prescriptions'],
      ['profile', '/profile'],
      ['inbox', '/inbox'],
      ['settings', '/settings'],
      ['support', '/support'],
      ['earnings', '/earnings'],
      ['credentials', '/credentials'],
      ['refill_requests', '/refill-requests'],
    ],
    tabs: [],
  });

  await runPortal(browser, {
    app: 'lab',
    base: APPS.lab,
    email: ACTORS.lab,
    routes: [['home', '/']],
    tabs: ['Orders', 'Bookings', 'Reports', 'Schedule', 'Settings', 'Dashboard'],
  });

  await runPortal(browser, {
    app: 'radiology',
    base: APPS.radiology,
    email: ACTORS.imaging,
    routes: [['home', '/']],
    tabs: ['Studies', 'Bookings', 'Reports', 'Schedule', 'Settings', 'Dashboard'],
  });

  await runPortal(browser, {
    app: 'radiologist',
    base: APPS.radiologist,
    email: ACTORS.radiologist,
    routes: [['home', '/']],
    tabs: ['Worklist', 'Studies', 'Reports', 'Settings', 'Dashboard'],
  });

  await runPortal(browser, {
    app: 'pathologist',
    base: APPS.pathologist,
    email: ACTORS.pathologist,
    routes: [['home', '/']],
    tabs: ['Worklist', 'Cases', 'Reports', 'Settings', 'Dashboard'],
  });

  await runPortal(browser, {
    app: 'logistics',
    base: APPS.logistics,
    email: ACTORS.delivery,
    routes: [['home', '/']],
    tabs: ['Shipments', 'Orders', 'History', 'Dashboard', 'Tracking', 'Assignments'],
  });

  await runPortal(browser, {
    app: 'affiliate',
    base: APPS.affiliate,
    email: ACTORS.affiliate,
    routes: [
      ['links', '/links'],
      ['codes', '/codes'],
      ['earnings', '/earnings'],
      ['statement', '/statement'],
      ['inbox', '/inbox'],
      ['support', '/support'],
      ['profile', '/profile'],
    ],
    tabs: [],
  });

  await runPortal(browser, {
    app: 'store',
    base: APPS.store,
    email: ACTORS.vendor,
    routes: [['home', '/']],
    tabs: ['Dashboard', 'Orders', 'Inventory', 'Catalog'],
  });

  await runJoinPublic(browser);

  await browser.close();

  const summary = {
    sprint: 'S464',
    started,
    finished: new Date().toISOString(),
    browser: 'playwright + channel=chrome (system Google Chrome)',
    runtime: 'DEVELOPMENT/SANDBOX',
    application_code_changed: 'NO',
    feature_work: 'NO',
    pages_inspected: PAGE_RESULTS.length,
    findings_total: FINDINGS.length,
    findings_by_severity: {
      P0: FINDINGS.filter((f) => f.severity === 'P0').length,
      P1: FINDINGS.filter((f) => f.severity === 'P1').length,
      P2: FINDINGS.filter((f) => f.severity === 'P2').length,
      P3: FINDINGS.filter((f) => f.severity === 'P3').length,
    },
    console_errors: CONSOLE_ERRORS.length,
    overflow_pages: PAGE_RESULTS.filter((p) => p.overflowX).length,
  };

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(FINDINGS, null, 2));
  fs.writeFileSync(path.join(OUT, 'page-results.json'), JSON.stringify(PAGE_RESULTS, null, 2));
  fs.writeFileSync(path.join(OUT, 'console-errors.json'), JSON.stringify(CONSOLE_ERRORS, null, 2));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
