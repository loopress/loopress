import { chromium } from '@playwright/test';

const BASE = 'http://loopress-2.local';
const shot = '/private/tmp/claude-501/-Users-maximeblanc-Localdev-loopress-monorepo/99495d4f-b8e9-47f3-b246-ddc57ecfe18c/scratchpad/app-password.png';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`${BASE}/wp-admin`);
await page.fill('#user_login', 'root');
await page.fill('#user_pass', 'root');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle');

await page.goto(`${BASE}/wp-admin/profile.php`);
await page.waitForLoadState('networkidle');

await page.fill('#new_application_password_name', 'lps-acf-verification');
await page.click('#do_new_application_password');
await page.waitForTimeout(2000);

await page.screenshot({ path: shot, fullPage: true });

const bodyText = await page.locator('body').innerText();
const match = bodyText.match(/([A-Za-z0-9]{4} ){5}[A-Za-z0-9]{4}/);
console.log('APPLICATION_PASSWORD=' + (match ? match[0] : '(not found)'));

await browser.close();
