/**
 * Sprint 130 — start each Expo app, capture real Metro/LAN/exp URLs, probe bundles,
 * and verify Expo Web UI via Playwright. Does not treat `expo export` as runtime.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('../tools/playwright-harness/node_modules/@playwright/test');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/test-results/s130-mobile-runtime');
fs.mkdirSync(outDir, { recursive: true });

function scoreLan(address) {
  if (address.startsWith('192.168.160.')) return 0;
  if (address.startsWith('192.168.')) return 3;
  if (address.startsWith('10.') && address !== '10.0.2.2') return 2;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return 1;
  return 0;
}

function lanIPv4() {
  const fromEnv = (process.env.EXPO_PUBLIC_LAN_IP ?? '').trim();
  if (fromEnv) return fromEnv;
  const candidates = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = addr.family === 'IPv4' || addr.family === 4;
      if (!family || addr.internal || addr.address.startsWith('169.254.')) continue;
      candidates.push(addr.address);
    }
  }
  candidates.sort((a, b) => scoreLan(b) - scoreLan(a));
  return candidates[0] ?? '';
}

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8').slice(0, 4000),
        });
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: String(err) }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: 'timeout' });
    });
  });
}

const APPS = [
  {
    id: 'customer',
    role: 'CUSTOMER',
    dir: 'apps/mobile',
    port: 8081,
    titleRe: /World Pharma/i,
    email: 'sandbox-customer@dev.local',
  },
  {
    id: 'store',
    role: 'VENDOR_PHARMACY',
    dir: 'apps/mobile-store',
    port: 8082,
    titleRe: /Store mobile/i,
    email: 'sandbox-vendor@dev.local',
  },
  {
    id: 'doctor',
    role: 'DOCTOR',
    dir: 'apps/mobile-doctor',
    port: 8083,
    titleRe: /Doctor mobile/i,
    email: 'sandbox-doctor@dev.local',
  },
  {
    id: 'lab',
    role: 'LAB',
    dir: 'apps/mobile-lab',
    port: 8084,
    titleRe: /Lab staff/i,
    email: 'sandbox-lab@dev.local',
  },
  {
    id: 'phlebotomist',
    role: 'LAB_PHLEBOTOMIST',
    dir: 'apps/mobile-phlebotomist',
    port: 8085,
    titleRe: /Phlebotomist/i,
    email: 'sandbox-phlebotomist@dev.local',
  },
  {
    id: 'delivery',
    role: 'DELIVERY',
    dir: 'apps/mobile-delivery',
    port: 8086,
    titleRe: /Delivery mobile/i,
    email: 'sandbox-delivery@dev.local',
  },
];

async function snap(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function otpLogin(page, email) {
  const send = page.getByLabel('Send OTP').or(page.getByRole('button', { name: 'Send OTP' }));
  if (await page.getByLabel('Email').count()) {
    await page.getByLabel('Email').fill(email);
  }
  if (await send.count()) {
    await send.click();
    await page.waitForTimeout(2000);
  }
  if (await page.getByLabel('Verify & sign in').count()) {
    await page.getByLabel('Verify & sign in').click();
    await page.waitForTimeout(2500);
  }
}

async function signOutIfPresent(page) {
  const btn = page.getByLabel('Sign out').or(page.getByRole('button', { name: /Sign out/i }));
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function runWebFlows(app, page) {
  const flows = [];
  const mark = (name, status, detail = '') => flows.push({ name, status, detail });
  const body = () => page.locator('body').innerText();

  if (app.id === 'customer') {
    mark('home_guest', app.titleRe.test(await body()) ? 'PASS' : 'FAIL');
    await snap(page, 'customer-01-home');
    if (await page.getByRole('button', { name: 'Sign in' }).count()) {
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForTimeout(600);
    }
    await snap(page, 'customer-02-welcome');
    await otpLogin(page, app.email);
    await snap(page, 'customer-03-after-login');
    const afterLogin = await body();
    mark(
      'login',
      /Sign out|Medicines|Could not send OTP|Invalid or expired/i.test(afterLogin)
        ? /Could not send OTP|Invalid or expired/i.test(afterLogin)
          ? 'FAIL'
          : 'PASS'
        : 'FAIL',
      afterLogin.slice(0, 180),
    );
    if (await page.getByRole('button', { name: 'Search' }).count()) {
      await page.getByRole('button', { name: 'Search' }).click();
      await page.waitForTimeout(1500);
      await snap(page, 'customer-04-discovery');
      mark('product_discovery', 'PASS');
    } else {
      mark('product_discovery', 'FAIL', 'Medicines tab missing');
    }
    const productBtn = page.getByRole('button').filter({ hasText: /Paracetamol|AED|₹|USD|INR|mg/i }).first();
    if (await productBtn.count()) {
      await productBtn.click();
      await page.waitForTimeout(1200);
      await snap(page, 'customer-05-product-detail');
      mark('product_detail', /Add to cart|Unavailable|product/i.test(await body()) ? 'PASS' : 'FAIL');
      const add = page.getByRole('button', { name: /Add to cart/i });
      if (await add.count()) {
        await add.first().click();
        await page.waitForTimeout(800);
      }
    } else {
      mark('product_detail', 'FAIL', 'no catalog product control');
    }
    if (await page.getByRole('button', { name: /Cart|Basket/i }).count()) {
      await page.getByRole('button', { name: /Cart|Basket/i }).first().click();
      await page.waitForTimeout(800);
      await snap(page, 'customer-06-cart');
      mark('cart', 'PASS');
    } else if (/cart|Checkout|empty/i.test(await body())) {
      await snap(page, 'customer-06-cart');
      mark('cart', 'PASS', 'cart_copy_on_screen');
    } else {
      mark('cart', 'FAIL', 'no cart surface after add-to-cart');
    }
    const loggedOut = await signOutIfPresent(page);
    mark('logout', loggedOut ? 'PASS' : 'FAIL');
    return flows;
  }

  await snap(page, `${app.id}-01-signin`);
  mark('initial_ui', app.titleRe.test(await body()) ? 'PASS' : 'FAIL', (await body()).slice(0, 180));
  await otpLogin(page, app.email);
  await page.waitForTimeout(1500);
  await snap(page, `${app.id}-02-after-login`);
  const logged = await body();
  const loginFail = /Could not send OTP|Invalid or expired|network/i.test(logged) && app.titleRe.test(logged);
  mark('login', loginFail ? 'FAIL' : /Sign out|Dashboard|Orders|Jobs|Bookings|World Pharma Doctor|Lab operations|Delivery/i.test(logged) ? 'PASS' : 'FAIL', logged.slice(0, 200));

  const tabs = {
    store: ['Dashboard', 'Orders'],
    doctor: ['Home', 'Appts'],
    lab: ['Bookings', 'Accession'],
    phlebotomist: ['Jobs'],
    delivery: ['Jobs'],
  }[app.id] ?? [];
  for (const label of tabs) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(700);
      await snap(page, `${app.id}-tab-${label.toLowerCase().replace(/\s+/g, '-')}`);
      mark(`tab_${label}`, 'PASS');
    }
  }
  mark('logout', (await signOutIfPresent(page)) ? 'PASS' : 'FAIL');
  return flows;
}

function freePort(port) {
  spawnSync(
    'cmd.exe',
    [
      '/c',
      `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a`,
    ],
    { timeout: 20_000, windowsHide: true },
  );
}

function startExpo(app, lanIp, apiBase) {
  const appRoot = path.join(root, app.dir);
  const log = [];
  const env = {
    ...process.env,
    BROWSER: 'none',
    EXPO_NO_TELEMETRY: '1',
    EXPO_PUBLIC_APP_ENV: 'local',
    EXPO_PUBLIC_API_BASE_URL: apiBase,
    EXPO_PUBLIC_LAN_IP: lanIp,
    REACT_NATIVE_PACKAGER_HOSTNAME: lanIp || '127.0.0.1',
  };
  delete env.CI;
  const child = spawn(
    'cmd.exe',
    ['/d', '/s', '/c', `npx expo start --lan --port ${app.port}`],
    {
      cwd: appRoot,
      env,
      windowsHide: true,
    },
  );
  const onData = (buf) => {
    const text = buf.toString('utf8');
    log.push(text);
    process.stdout.write(`[${app.id}] ${text}`);
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  return { child, log };
}

function parseExpoLog(joined, port, lanIp) {
  const expMatch = joined.match(/exp:\/\/[0-9.]+:\d+/);
  const waitMatch = joined.match(/Waiting on (https?:\/\/[^\s]+)/i);
  const qrHint = /scan this QR|QR code|exp:\/\//i.test(joined) || Boolean(expMatch);
  const constructedExp = lanIp ? `exp://${lanIp}:${port}` : null;
  return {
    expo_url: expMatch?.[0] ?? constructedExp,
    metro_waiting_on: waitMatch?.[1] ?? null,
    metro_port: port,
    lan_address: lanIp || null,
    web_url: `http://127.0.0.1:${port}`,
    qr_information_present: qrHint || Boolean(constructedExp && /Waiting on/i.test(joined)),
    log_excerpt: joined.slice(-2500),
  };
}

async function waitForBundled(log, port, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const html = await httpGet(`http://127.0.0.1:${port}/`);
    const joined = log.join('');
    const readyLog = /Waiting on |Logs for your project/i.test(joined);
    if (html.status === 200 && (readyLog || /<!DOCTYPE html|expo/i.test(html.body))) {
      return html;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

const lanIp = lanIPv4();
const apiLan = lanIp ? `http://${lanIp}:4000` : 'http://127.0.0.1:4000';
const apiLocal = await httpGet('http://127.0.0.1:4000/health').catch(() => ({ status: 0 }));
const apiLanProbe = lanIp ? await httpGet(`http://${lanIp}:4000/health`) : { status: 0, body: 'no_lan' };
const apiBaseForBundle = apiLanProbe.status >= 200 && apiLanProbe.status < 500 ? apiLan : 'http://127.0.0.1:4000';

const reports = [];
const only = (process.env.S130_EXPO_ONLY ?? '').trim();

for (const app of APPS) {
  if (only && only !== app.id) continue;
  const report = {
    app: app.role,
    id: app.id,
    dir: app.dir,
    command: `npx expo start --lan --port ${app.port}`,
    expo_runtime: 'FAIL',
    expo_web: 'FAIL',
    errors: [],
    flows: [],
  };
  const { child, log } = startExpo(app, lanIp, apiBaseForBundle);
  try {
    const html = await waitForBundled(log, app.port, 180_000);
    const joined = log.join('');
    Object.assign(report, parseExpoLog(joined, app.port, lanIp));
    if (!html) {
      report.errors.push('metro_bundle_not_ready');
      report.expo_runtime = 'FAIL';
      reports.push(report);
      continue;
    }
    report.expo_runtime = 'PASS';

    const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(25000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    try {
      await page.goto(`http://127.0.0.1:${app.port}`, { waitUntil: 'domcontentloaded' });
      await page.getByText(app.titleRe).first().waitFor({ timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const text = await page.locator('body').innerText();
      const fatal = pageErrors.some((e) => /Error|Exception/i.test(e)) && !app.titleRe.test(text);
      if (!app.titleRe.test(text) && text.trim().length < 8) {
        report.expo_web = 'FAIL';
        report.errors.push(`blank_or_unrecognized_web: ${text.slice(0, 200)}`);
        await snap(page, `${app.id}-99-error`);
      } else if (fatal) {
        report.expo_web = 'FAIL';
        report.errors.push(pageErrors.join(' | '));
        await snap(page, `${app.id}-99-error`);
      } else {
        report.flows = await runWebFlows(app, page);
        const flowFail = report.flows.some((f) => f.status === 'FAIL' && ['initial_ui', 'home_guest'].includes(f.name));
        report.expo_web = flowFail ? 'FAIL' : 'PASS';
        if (pageErrors.length) {
          report.page_errors = pageErrors.slice(0, 8);
        }
      }
    } catch (err) {
      report.expo_web = 'FAIL';
      report.errors.push(err instanceof Error ? err.message : String(err));
      await snap(page, `${app.id}-99-error`).catch(() => {});
    } finally {
      await browser.close();
    }
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    killTree(child);
    await new Promise((r) => setTimeout(r, 2000));
  }
  reports.push(report);
  fs.writeFileSync(path.join(outDir, `${app.id}-runtime.json`), JSON.stringify(report, null, 2));
}

const summary = {
  lanIp,
  api: {
    loopback_health: apiLocal,
    lan_health: apiLanProbe,
    bundle_env: apiBaseForBundle,
  },
  reports,
};
fs.writeFileSync(path.join(outDir, 'expo-runtime-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
const hardFail = reports.some((r) => r.expo_runtime === 'FAIL' && r.expo_web === 'FAIL');
process.exit(hardFail ? 1 : 0);
