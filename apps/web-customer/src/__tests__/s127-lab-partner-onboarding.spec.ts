/**
 * Sprint 127 — Lab partner onboarding + production activation control
 * (no invented accreditation / no production lab enablement).
 */
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  CUSTOMER,
  CUSTOMER_EMAIL,
  LAB,
  clearOtpRateLimits,
  ensureNoPiiPhi,
  ensureNoSecrets,
  expirePendingOtpChallenges,
  s60AdminLogin,
  s61LoginPortal,
  s127Snap,
  s127WriteArtifact,
  selectMarketIfGated,
  uiOtpLogin,
} from '../../e2e/helpers/s127-ui';

const LAB_EMAIL = 'sandbox-lab@dev.local';

test.beforeEach(async () => {
  await clearOtpRateLimits();
});

test.describe('S127 lab partner API gates', () => {
  test('unauthenticated lab-partner-onboarding-activation-preparation denied', async ({
    request,
  }) => {
    const res = await request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/lab-partner-onboarding-activation-preparation',
    );
    expect(res.status()).toBe(401);
  });

  test('customer cannot read admin lab activation prep', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/^Email$/i).click();
    await page.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(page, CUSTOMER_EMAIL);
    await selectMarketIfGated(page, /India/i).catch(() => undefined);

    const token = await page.evaluate(() => {
      try {
        for (const store of [window.localStorage, window.sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i) ?? '';
            if (/access.?token|wp_.*token/i.test(k)) {
              const v = store.getItem(k);
              if (v && v.length > 20) return v;
            }
          }
        }
      } catch {
        /* ignore */
      }
      return '';
    });

    const res = await page.request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/lab-partner-onboarding-activation-preparation',
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    expect([401, 403]).toContain(res.status());

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Sign in|login|permission|forbidden|unauthorized|Work email/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await s127Snap(page, 'security-customer-denied-admin');
    await context.close();
  });
});

test.describe('S127 Admin lab onboarding + activation control', () => {
  test('activation BLOCKED + labs queue + isolation + launch NO', async ({
    page,
    context,
    browser,
  }) => {
    await context.clearCookies();
    await s60AdminLogin(page);
    await ensureNoPiiPhi(page);

    await page.goto(`${ADMIN}/launch-readiness`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(/Lab partner onboarding \+ activation \(Sprint 127/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    const launchBody = await page.locator('body').innerText();
    expect(launchBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(launchBody).toMatch(/Production lab activation:\s*BLOCKED/i);
    expect(launchBody).toMatch(/Business\/KYB:\s*EXTERNAL_GATED/i);
    await s127Snap(page, 'admin-01-launch-lab-partner-blocker');

    await page.goto(`${ADMIN}/provider-activation`, { waitUntil: 'domcontentloaded' });
    const heading = page
      .getByText(
        /Real lab partner onboarding \+ production activation control \(Sprint\s*127\)/i,
      )
      .first();
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await heading.scrollIntoViewIfNeeded();
    const adminBody = await page.locator('body').innerText();
    expect(adminBody).toMatch(/Fake lab:\s*false/i);
    expect(adminBody).toMatch(/Fake accreditation:\s*false/i);
    expect(adminBody).toMatch(/Real production enabled:\s*false/i);
    expect(adminBody).toMatch(/Production lab activation:\s*BLOCKED/i);
    expect(adminBody).toMatch(/CAN_PRODUCTION_LAUNCH:\s*NO/i);
    expect(adminBody).toMatch(/DOCUMENT VERIFIED != PARTNER VERIFIED != PRODUCTION ENABLED/i);
    expect(adminBody).toMatch(/unverified_cannot_enable/i);
    expect(adminBody).toMatch(/sandbox_cannot_satisfy_production/i);
    expect(adminBody).not.toMatch(/sk_live_|BEGIN PRIVATE KEY/i);
    await ensureNoPiiPhi(page);
    await s127Snap(page, 'admin-02-provider-lab-partner-card');

    for (const [w, label] of [
      [390, '390'],
      [768, '768'],
      [1024, '1024'],
      [1440, '1440'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await s127Snap(page, `admin-03-provider-responsive-${label}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${ADMIN}/labs`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 60_000,
    });
    const labsBody = await page.locator('body').innerText();
    expect(labsBody).not.toMatch(/aadhaar|passport\s*no|ssn[=:]/i);
    await ensureNoPiiPhi(page);
    await s127Snap(page, 'admin-04-labs-queue');

    const openBtn = page.getByRole('button', { name: /open|view|details/i }).first();
    if (await openBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(800);
      await ensureNoPiiPhi(page);
      await s127Snap(page, 'admin-05-lab-case-detail');
    } else {
      const row = page.locator('table tbody tr, [data-testid="lab-row"]').first();
      if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await row.click();
        await page.waitForTimeout(800);
        await s127Snap(page, 'admin-05-lab-case-detail');
      } else {
        await s127Snap(page, 'admin-05-lab-queue-empty-or-list');
      }
    }

    // Lab portal: sandbox ops remain available; cannot self-approve production activation
    const labCtx = await browser.newContext();
    const labPage = await labCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(LAB_EMAIL);
    await s61LoginPortal(labPage, `${LAB}/`, LAB_EMAIL);
    await ensureNoSecrets(labPage);
    await s127Snap(labPage, 'lab-06-portal-sandbox');
    const labToken = await labPage.evaluate(() => {
      try {
        for (const store of [window.localStorage, window.sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i) ?? '';
            if (/access.?token|wp_.*token/i.test(k)) {
              const v = store.getItem(k);
              if (v && v.length > 20) return v;
            }
          }
        }
      } catch {
        /* ignore */
      }
      return '';
    });
    const labAdminRes = await labPage.request.get(
      'http://127.0.0.1:4000/api/v1/admin/control-plane/lab-partner-onboarding-activation-preparation',
      { headers: labToken ? { Authorization: `Bearer ${labToken}` } : {} },
    );
    expect([401, 403]).toContain(labAdminRes.status());
    await labCtx.close();

    // Customer discovery: sandbox labs may appear; production activation remains blocked in Admin
    const custCtx = await browser.newContext();
    const custPage = await custCtx.newPage();
    await clearOtpRateLimits();
    await expirePendingOtpChallenges(CUSTOMER_EMAIL);
    await custPage.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await custPage.getByLabel(/^Email$/i).click();
    await custPage.getByLabel(/^Email$/i).pressSequentially(CUSTOMER_EMAIL, { delay: 15 });
    await uiOtpLogin(custPage, CUSTOMER_EMAIL);
    await selectMarketIfGated(custPage, /India/i).catch(() => undefined);
    await custPage.goto(`${CUSTOMER}/lab`, { waitUntil: 'domcontentloaded' });
    await ensureNoPiiPhi(custPage);
    await s127Snap(custPage, 'cust-07-lab-discovery-sandbox');
    await custCtx.close();

    s127WriteArtifact(
      's127-status.json',
      JSON.stringify(
        {
          sprint: 127,
          production_lab_partner_activation: 'BLOCKED',
          can_production_launch: 'NO',
          remaining_blocker: 'NO_PRODUCTION_LAB_PARTNER_ACTIVATION',
          document_verified_neq_partner_verified: true,
          partner_verified_neq_production_enabled: true,
          sandbox_preserved: true,
          native: 'DEVICE_NOT_AVAILABLE',
        },
        null,
        2,
      ),
    );
  });
});
