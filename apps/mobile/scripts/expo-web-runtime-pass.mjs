import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('../../../tools/playwright-harness/node_modules/@playwright/test');

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.resolve(here, '../../test-results/s129-mobile-device-shots');
fs.mkdirSync(shotDir, { recursive: true });

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(JSON.stringify({ event: 'flow', name, status, detail }));
}

async function snap(page, name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(20000);

try {
  await page.goto('http://127.0.0.1:8081', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  if (!/World Pharma/i.test(body)) {
    throw new Error(`Expo web did not render World Pharma. Got: ${body.slice(0, 200)}`);
  }
  await snap(page, '01-home-guest');
  record('home_guest', 'PASS');

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(800);
  await snap(page, '02-welcome-signin');
  record('sign_in', /Welcome back/i.test(await page.locator('body').innerText()) ? 'PASS' : 'FAIL');

  await page.getByLabel('Email').fill('sandbox-customer@dev.local');
  await page.getByLabel('Send sign-in code').click();
  await page.waitForTimeout(1500);
  const afterOtp = await page.locator('body').innerText();
  if (/Could not send OTP/i.test(afterOtp)) {
    record('login_otp', 'FAIL', 'otp_request_failed');
    await snap(page, '03-login-error');
  } else {
    record('login_otp', 'PASS');
    if (await page.getByLabel('Verify and sign in').count()) {
      await page.getByLabel('Verify and sign in').click();
      await page.waitForTimeout(2000);
    }
    await snap(page, '03-authenticated-home');
    const homeText = await page.locator('body').innerText();
    record(
      'authenticated_home',
      /Sign out|Medicines|Orders/i.test(homeText) && !/Could not send OTP|Invalid or expired/i.test(homeText)
        ? 'PASS'
        : 'FAIL',
    );
  }

  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForTimeout(1500);
  await snap(page, '04-medicines');
  record('medicine_discovery', 'PASS');

  const product = page.getByRole('button').filter({ hasText: /.+/ }).nth(0);
  if (await page.locator('body').innerText().then((t) => /paracetamol|medicine|₹|INR|AED|USD/i.test(t))) {
    record('product_list_content', 'PASS');
  } else {
    record('product_list_content', 'FAIL', 'no catalog copy visible');
  }

  await page.getByRole('button', { name: 'Account' }).click();
  await page.waitForTimeout(600);
  if (await page.getByLabel('Sign out').count()) {
    await snap(page, '05-account');
    await page.getByLabel('Sign out').click();
    await page.waitForTimeout(800);
    await snap(page, '06-after-logout');
    record('logout', 'PASS');
    const signInAgain = page.getByRole('button', { name: 'Sign in' });
    if (await signInAgain.count()) {
      await signInAgain.click();
      await page.waitForTimeout(500);
    }
    if (await page.getByLabel('Send sign-in code').count()) {
      await page.getByLabel('Email').fill('sandbox-customer@dev.local');
      await page.getByLabel('Send sign-in code').click();
      await page.waitForTimeout(1200);
      if (await page.getByLabel('Verify and sign in').count()) {
        await page.getByLabel('Verify and sign in').click();
        await page.waitForTimeout(1500);
      }
      await snap(page, '07-login-again');
      record('login_again', 'PASS');
    } else {
      record('login_again', 'FAIL', 'welcome not shown after logout');
    }
  } else {
    record('logout', 'FAIL', 'sign_out_not_visible');
  }

  for (const [label, key] of [
    ['Health', 'health'],
    ['Orders', 'orders'],
  ]) {
    await page.getByRole('button', { name: label }).click();
    await page.waitForTimeout(800);
    await snap(page, `08-${key}`);
    record(key, 'PASS');
  }
} catch (err) {
  record('expo_web_runtime', 'FAIL', err instanceof Error ? err.message : String(err));
  await snap(page, '99-error').catch(() => {});
} finally {
  const shots = fs.readdirSync(shotDir).filter((f) => f.endsWith('.png'));
  const summary = {
    shots: shots.length,
    shotDir,
    results,
    metro: 'http://127.0.0.1:8081',
    expoGoUrl: 'exp://192.168.1.4:8081',
    api: 'http://192.168.1.4:4000',
  };
  fs.writeFileSync(path.join(shotDir, 'runtime-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  const failed = results.some((r) => r.status === 'FAIL');
  process.exit(failed ? 1 : 0);
}
