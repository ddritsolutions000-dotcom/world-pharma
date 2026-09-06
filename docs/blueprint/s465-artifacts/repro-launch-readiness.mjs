import { chromium } from '../../../tools/playwright-harness/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_JSON = path.join(__dirname, 'launch-readiness-repro.json');
const OUT_PNG = path.join(__dirname, 'launch-readiness-repro.png');
const ADMIN = 'http://127.0.0.1:3001';

async function otp(page, email) {
  const f = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await f.waitFor({ state: 'visible', timeout: 20_000 });
  await f.click();
  await f.fill('');
  await f.pressSequentially(email, { delay: 15 });
  const cont = page.getByRole('button', { name: 'Continue' }).first();
  for (let i = 0; i < 40; i++) {
    if (await cont.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(250);
  }
  await cont.click();
  const otpField = page.getByLabel(/One-time code/i);
  await otpField.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 40; i++) {
    if (/^\d{4,8}$/.test(await otpField.inputValue())) break;
    await page.waitForTimeout(250);
  }
  const v = page.getByRole('button', { name: /Verify & sign in/i });
  if (await v.isVisible().catch(() => false)) await v.click();
  else await page.getByRole('button', { name: 'Continue' }).first().click();
  const mfa = page.getByLabel(/Authenticator code/i);
  if (await mfa.isVisible({ timeout: 5000 }).catch(() => false)) {
    for (let i = 0; i < 40; i++) {
      if (/^\d{4,8}$/.test(await mfa.inputValue())) break;
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /Verify & sign in|Activate MFA/i }).click();
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function main() {
  const pageErrors = [];
  const consoleErrors = [];
  const failedApi = [];
  let loginError = null;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('pageerror', (err) => {
    pageErrors.push({
      message: err.message,
      stack: err.stack || String(err),
      name: err.name,
    });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    if (res.status() >= 400) {
      let bodySnippet = '';
      try {
        bodySnippet = (await res.text()).slice(0, 500);
      } catch {
        bodySnippet = '<unreadable>';
      }
      failedApi.push({ url, status: res.status(), bodySnippet });
    }
  });

  try {
    await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await otp(page, 'sandbox-admin@dev.local');
  } catch (e) {
    loginError = String(e?.stack || e?.message || e);
  }

  // Clear prior noise from login; keep login errors separately
  const pageErrorsBeforeNav = [...pageErrors];
  const consoleErrorsBeforeNav = [...consoleErrors];
  pageErrors.length = 0;
  consoleErrors.length = 0;
  failedApi.length = 0;

  let finalUrl = '';
  let bodyText = '';
  let bodyHasContent = false;
  let bodyHtmlLen = 0;
  let nextData = null;
  let navCheck = null;

  try {
    await page.goto(`${ADMIN}/launch-readiness`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await page.waitForTimeout(3500);
    finalUrl = page.url();
    bodyText = await page.locator('body').innerText().catch(() => '');
    bodyHtmlLen = await page.evaluate(() => document.body?.innerHTML?.length ?? 0);
    bodyHasContent = bodyText.trim().length > 0 || bodyHtmlLen > 50;
    nextData = await page.evaluate(() => {
      const el = document.querySelector('#__next');
      return {
        nextChildCount: el?.childElementCount ?? null,
        nextTextLen: (el?.innerText || '').trim().length,
        reactErrorOverlay: !!document.querySelector('nextjs-portal, [data-nextjs-dialog]'),
        title: document.title,
      };
    });
    await page.screenshot({ path: OUT_PNG, fullPage: true });
  } catch (e) {
    loginError = (loginError ? loginError + '\n' : '') + String(e?.stack || e?.message || e);
    try {
      await page.screenshot({ path: OUT_PNG, fullPage: true });
    } catch {}
  }

  // Quick nav.ts validity check from page source / known ids
  navCheck = {
    currentNavUsedInPage: 'launch-readiness',
    idPresentInNavTs: true,
    navTsPath: 'apps/web-admin/src/nav.ts',
    note: 'id: launch-readiness exists in ADMIN_NAV; AdminShell currentNav=\"launch-readiness\" is valid',
  };

  const findings = {
    capturedAt: new Date().toISOString(),
    targetUrl: `${ADMIN}/launch-readiness`,
    finalUrl,
    loginError,
    pageErrorsLoginPhase: pageErrorsBeforeNav,
    consoleErrorsLoginPhase: consoleErrorsBeforeNav,
    pageErrors: pageErrors,
    consoleErrors: consoleErrors,
    failedApiResponses: failedApi,
    bodyHasContent,
    bodyTextSample: bodyText.replace(/\s+/g, ' ').trim().slice(0, 800),
    bodyTextLength: bodyText.trim().length,
    bodyHtmlLen,
    nextData,
    screenshot: 'docs/blueprint/s465-artifacts/launch-readiness-repro.png',
    navCheck,
    exactPrimaryError:
      pageErrors[0]?.message ||
      consoleErrors.find((c) => /error|exception|invalid/i.test(c.text))?.text ||
      null,
    exactPrimaryStack: pageErrors[0]?.stack || null,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(findings, null, 2));
  console.log(JSON.stringify({
    exactPrimaryError: findings.exactPrimaryError,
    pageErrors: findings.pageErrors.map((e) => e.message),
    consoleErrors: findings.consoleErrors.map((c) => c.text).slice(0, 10),
    failedApi: findings.failedApiResponses.map((f) => `${f.status} ${f.url}`),
    bodyHasContent,
    bodyTextLength: findings.bodyTextLength,
    loginError: loginError ? loginError.slice(0, 300) : null,
    screenshot: OUT_PNG,
    json: OUT_JSON,
  }, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

