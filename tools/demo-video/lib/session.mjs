// Signs the demo account in through the real login page (not filmed).
// The login form re-renders once the auth client has loaded, so wait for
// the page to settle before typing, and check the field took the value.
export async function login(page, baseUrl, env) {
  if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) throw new Error('DEMO_EMAIL / DEMO_PASSWORD missing (expected in /root/.demo-video.env).');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('#email').fill(env.DEMO_EMAIL);
    await page.locator('#password').fill(env.DEMO_PASSWORD);
    await page.waitForTimeout(300);
    if ((await page.locator('#email').inputValue()) === env.DEMO_EMAIL && (await page.locator('#password').inputValue()) === env.DEMO_PASSWORD) break;
  }
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => new URL(u).pathname.startsWith('/dashboard'), { timeout: 120000 });
  // Builds before #927 bounce back to /login once the password is accepted
  // (the session is valid): open the dashboard again in that case.
  await page.waitForTimeout(2500);
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle', timeout: 120000 });
  }
  await page.waitForURL((u) => new URL(u).pathname.startsWith('/dashboard'), { timeout: 60000 });
}
