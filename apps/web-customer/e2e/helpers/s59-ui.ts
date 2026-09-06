import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
} from './s58-ui';

export const S59_SHOT_DIR = path.join(__dirname, '../../../test-results/s59-public-ux-shots');
export const JOIN = process.env.WP_JOIN_BASE_URL ?? 'http://127.0.0.1:3008';
export const CUSTOMER = process.env.WP_CUSTOMER_BASE_URL ?? 'http://127.0.0.1:3000';
export const ADMIN = process.env.WP_ADMIN_BASE_URL ?? 'http://127.0.0.1:3001';
export const CMS_MARKER = 'S59-SANDBOX-CMS-MARKER';

export async function s59Snap(page: Page, name: string) {
  fs.mkdirSync(S59_SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(S59_SHOT_DIR, `${name}.png`), fullPage: true });
}

export async function clearOtpRateLimits() {
  try {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    const patterns = ['rl:*', 'otp:*'];
    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(...keys);
    }
    await client.quit();
  } catch {
    /* optional */
  }
}

/** Expire PENDING OTP challenges so sandbox retests are not blocked by resend throttle. */
export async function expirePendingOtpChallenges(identifierNormalized?: string) {
  try {
    // Prefer database package; fall back to @prisma/client if linked.
    // Loose construct type — Playwright helpers must not block Next production typecheck.
    let PrismaClientCtor: new (...args: never[]) => {
      otpChallenge: {
        updateMany: (args: unknown) => Promise<unknown>;
      };
      $disconnect: () => Promise<void>;
    };
    try {
      const mod = await import('@world-pharma/database');
      PrismaClientCtor = mod.PrismaClient as typeof PrismaClientCtor;
    } catch {
      const mod = await import('@prisma/client');
      PrismaClientCtor = mod.PrismaClient as typeof PrismaClientCtor;
    }
    const prisma = new PrismaClientCtor();
    await prisma.otpChallenge.updateMany({
      where: {
        status: 'PENDING',
        ...(identifierNormalized
          ? { identifierNormalized: identifierNormalized.toLowerCase() }
          : {}),
      },
      data: { status: 'EXPIRED', resendAvailableAt: new Date(0) },
    });
    await prisma.$disconnect();
  } catch {
    /* optional — recovery may still wait on resend window */
  }
}

/** Customer OTP login with reliable React-controlled email fill (pressSequentially). */
export async function uiCustomerLogin(page: Page, email: string) {
  const emailField = page.getByLabel(/^Email$/i).or(page.getByLabel(/Work email|Email/i)).first();
  await emailField.click();
  await emailField.fill('');
  await emailField.pressSequentially(email, { delay: 15 });

  const send = page.getByRole('button', { name: 'Send OTP' });
  await send.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 40; i++) {
    if (await send.isEnabled().catch(() => false)) break;
    // Re-assert email if React reset the controlled value
    const current = await emailField.inputValue().catch(() => '');
    if (!current.includes('@')) {
      await emailField.click({ clickCount: 3 });
      await emailField.pressSequentially(email, { delay: 20 });
    }
    await page.waitForTimeout(250);
  }
  if (!(await send.isEnabled().catch(() => false))) {
    throw new Error('Send OTP remained disabled after email entry.');
  }
  await send.click();

  const otp = page.getByLabel(/One-time code/i);
  await otp.waitFor({ state: 'visible', timeout: 30_000 });
  const value = await otp.inputValue();
  if (!/^\d{4,8}$/.test(value)) {
    throw new Error(`Expected auto-filled OTP, got "${value}"`);
  }
  const verify = page.getByRole('button', { name: /Verify & sign in/i });
  if (await verify.isVisible().catch(() => false)) {
    await verify.click();
  } else {
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.getByRole('button', { name: /Sign out/i }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

export {
  assertNoHorizontalOverflow,
  ensureNoSecrets,
  loginPortal,
  selectMarketIfGated,
  uiAdminLogin,
  uiOtpLogin,
};
