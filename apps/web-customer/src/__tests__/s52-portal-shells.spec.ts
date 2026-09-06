/**
 * Sprint 52 — Multi-portal landing + auth shell UX probe.
 * Visits every runnable web portal home/login and captures screenshots.
 */
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHOT_DIR = path.join(__dirname, '../../../test-results/s52-ux-shots');

const PORTALS: Array<{ id: string; url: string; expectText: RegExp }> = [
  { id: 'admin', url: 'http://127.0.0.1:3001/', expectText: /Admin|Sign in|World Pharma|OTP|Login/i },
  { id: 'doctor', url: 'http://127.0.0.1:3003/', expectText: /Doctor|Sign in|OTP|World Pharma|clinic/i },
  { id: 'vendor', url: 'http://127.0.0.1:3004/', expectText: /Vendor|Seller|Sign in|OTP|pharmacy|World Pharma/i },
  { id: 'lab', url: 'http://127.0.0.1:3005/', expectText: /Lab|Sign in|OTP|Laboratory|World Pharma/i },
  { id: 'imaging', url: 'http://127.0.0.1:3006/', expectText: /Imaging|Radiology|Sign in|OTP|World Pharma/i },
  { id: 'radiologist', url: 'http://127.0.0.1:3007/', expectText: /Radiologist|Sign in|OTP|World Pharma/i },
  { id: 'affiliate', url: 'http://127.0.0.1:3008/', expectText: /Affiliate|Sign in|OTP|World Pharma|Partner/i },
  { id: 'store', url: 'http://127.0.0.1:3009/', expectText: /Store|Pharmacy|Sign in|OTP|World Pharma/i },
  { id: 'logistics', url: 'http://127.0.0.1:3010/', expectText: /Logistics|Delivery|Sign in|OTP|World Pharma/i },
  { id: 'pathologist', url: 'http://127.0.0.1:3011/', expectText: /Patholog|Sign in|OTP|World Pharma/i },
  { id: 'join', url: 'http://127.0.0.1:3100/', expectText: /Partner|Join|Pharmacy|Doctor|Lab|World Pharma/i },
  { id: 'expo-customer-web', url: 'http://127.0.0.1:8092/', expectText: /./ },
];

async function snap(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

test.describe('S52 portal shells', () => {
  for (const portal of PORTALS) {
    test(`${portal.id} landing/auth shell is understandable`, async ({ page }) => {
      const res = await page.goto(portal.url, { waitUntil: 'domcontentloaded' });
      expect(res?.ok() || res?.status() === 200).toBeTruthy();
      if (portal.id === 'expo-customer-web') {
        await expect(page.locator('#root')).toHaveCount(1);
        await expect(page).toHaveTitle(/World Pharma/i);
      } else {
        await expect(page.locator('body')).toContainText(portal.expectText);
      }
      await expect(page.locator('body')).not.toContainText(/Cannot GET|Internal Server Error/i);
      await snap(page, `portal-${portal.id}`);
    });
  }

  test('join portal CTA destinations exist', async ({ page }) => {
    await page.goto('http://127.0.0.1:3100/');
    await expect(page.getByText(/Partner|Join|World Pharma/i).first()).toBeVisible();
    const links = page.locator('a[href]');
    const count = await links.count();
    expect(count).toBeGreaterThan(2);
    await snap(page, 'portal-join-detail');
  });
});
