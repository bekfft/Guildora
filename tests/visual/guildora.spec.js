import { expect, test } from '@playwright/test';

async function prepareAccount(page, testInfo, variant = 'app') {
  await page.goto('/');
  const suffix = `${testInfo.project.name}-${variant}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const registration = await page.request.post('/api/auth/register', {
    data: {
      email: `${suffix}@visual.guildora.test`,
      username: `visual_${suffix}`.slice(0, 32),
      password: 'Guildora2026!',
      birthdate: '1995-04-12',
      newsletter: false
    }
  });
  expect(registration.ok()).toBeTruthy();
  const { user } = await registration.json();
  const guildResponse = await page.request.post('/api/guilds', { data: { name: 'Guildora Testlabor' } });
  expect(guildResponse.ok()).toBeTruthy();
  const created = await guildResponse.json();
  await page.evaluate(({ userId }) => {
    localStorage.setItem(`guildora:onboarding:${userId}:v1`, 'done');
    localStorage.setItem('guildora:install-prompt-dismissed', '1');
  }, { userId: user.id });
  return created;
}

async function screenshot(page, name) {
  await expect(page.locator('.guildora-app')).toHaveScreenshot(name, { caret: 'hide' });
}

test('zentrale App-Ansichten bleiben visuell stabil', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const { guild, channel } = await prepareAccount(page, testInfo);
  await page.goto(`/app/channels/${guild.id}/${channel.id}`);
  await expect(page.locator('.main-header')).toBeVisible();
  await expect(page.locator('.sidebar-loading')).toHaveCount(0);
  await screenshot(page, 'chat.png');

  if (testInfo.project.name.startsWith('mobile')) {
    await page.locator('.main-header__menu').click();
    await expect(page.locator('.app-navigation')).toBeVisible();
    await screenshot(page, 'navigation.png');
    await page.mouse.click(page.viewportSize().width - 5, Math.round(page.viewportSize().height / 2));
    await expect(page.locator('.guildora-app')).not.toHaveClass(/drawer-open/);
  }

  if (!await page.locator('.member-list').isVisible()) {
    await page.getByRole('button', { name: 'Mitgliederliste umschalten' }).click();
  }
  await expect(page.locator('.member-list')).toBeVisible();
  await screenshot(page, 'members.png');
  const memberClose = page.getByRole('complementary', { name: 'Mitglieder' }).getByRole('button', { name: 'Mitgliederliste schließen' });
  if (await memberClose.isVisible()) await memberClose.click();

  await page.getByRole('button', { name: 'Suche', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nachrichten durchsuchen' })).toBeVisible();
  await screenshot(page, 'search.png');
  await page.getByRole('button', { name: 'Suche schließen' }).click();

  await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Benachrichtigungen' })).toBeVisible();
  await screenshot(page, 'notifications.png');
  await page.getByRole('button', { name: 'Benachrichtigungen schließen' }).click();

  await page.goto('/app/channels/@me');
  await expect(page.locator('.friends-view')).toBeVisible();
  await screenshot(page, 'friends.png');

  const settingsButton = page.getByRole('button', { name: 'Einstellungen', exact: true });
  const settingsBox = await settingsButton.boundingBox();
  if (!settingsBox || settingsBox.x < 0 || settingsBox.x >= page.viewportSize().width) {
    await page.locator('.main-header__menu').click();
    await expect(page.locator('.guildora-app')).toHaveClass(/drawer-open/);
  }
  await settingsButton.click();
  await expect(page.locator('.app-modal--settings')).toBeVisible();
  await screenshot(page, 'settings.png');
});

test('Landingpage bleibt an jeder Zielgröße stabil', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.landing')).toBeVisible();
  await expect(page.locator('.landing')).toHaveScreenshot('landing.png', { caret: 'hide', fullPage: true });
});

test('Staff-Konsole passt visuell zu Guildora auf Desktop und Mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Desktop und Mobile werden in einer isolierten Inhaber-Sitzung geprüft.');
  const registration = await page.request.post('/api/auth/register', { data: {
    email: 'bekfft@visual.guildora.test', username: 'bekfft', password: 'Guildora2026!', birthdate: '1995-04-12', newsletter: false
  }});
  expect(registration.ok()).toBeTruthy();
  const targetRegistration = await page.request.post('/api/auth/register', { data: {
    email: 'target@visual.guildora.test', username: 'mobile.target', password: 'Guildora2026!', birthdate: '1995-04-12', newsletter: false
  }});
  expect(targetRegistration.ok()).toBeTruthy();
  const target = (await targetRegistration.json()).user;
  expect((await page.request.post('/api/guilds', { data: { name: 'Mobile Preview Community' } })).ok()).toBeTruthy();
  expect((await page.request.post('/api/auth/register', { data: {
    email: 'reporter@visual.guildora.test', username: 'mobile.reporter', password: 'Guildora2026!', birthdate: '1995-04-12', newsletter: false
  }})).ok()).toBeTruthy();
  expect((await page.request.post(`/api/social/users/${target.id}/report`, { data: {
    reason: 'Wiederholte Belästigung und unerwünschte Nachrichten im mobilen Test.'
  }})).ok()).toBeTruthy();
  expect((await page.request.post('/api/auth/login', { data: {
    identifier: 'bekfft', password: 'Guildora2026!'
  }})).ok()).toBeTruthy();
  await page.goto('/staff');
  await expect(page.locator('.staff-stats')).toBeVisible();
  await expect(page.locator('.staff-shell')).toHaveScreenshot('staff-desktop.png', { caret: 'hide' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/staff?standalone-preview=1');
  await expect(page.locator('.staff-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Staff-Menü öffnen' })).toBeVisible();

  for (const section of ['Fälle', 'Benutzer', 'Server', 'Einsprüche', 'Freigaben', 'Auditlog', 'Team']) {
    await page.getByRole('button', { name: 'Staff-Menü öffnen' }).click();
    await expect(page.locator('.staff-shell')).toHaveClass(/staff-menu-open/);
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.locator('.staff-mobile-header strong')).toHaveText(section);
    await expect(page.locator('.staff-empty[role="status"]')).toHaveCount(0);
    await expect(page.locator('.staff-workspace')).toBeVisible();
  }

  await page.getByRole('button', { name: 'Staff-Menü öffnen' }).click();
  await page.getByRole('button', { name: 'Benutzer', exact: true }).click();
  await page.getByLabel('Benutzer suchen').fill('mobile.target');
  await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  const targetButton = page.locator('.staff-list > button').filter({ hasText: '@mobile.target' });
  await expect(targetButton).toHaveCount(1);
  await targetButton.click();
  await expect(page.getByRole('heading', { name: 'Benutzerdetails' })).toBeVisible();

  await page.getByRole('button', { name: 'Staff-Menü öffnen' }).click();
  await page.getByRole('button', { name: 'Übersicht', exact: true }).click();
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
    shell: document.querySelector('.staff-shell').getBoundingClientRect().width,
    workspace: document.querySelector('.staff-workspace').getBoundingClientRect().width,
    workspaceScroll: document.querySelector('.staff-workspace').scrollWidth,
    stats: document.querySelector('.staff-stats').getBoundingClientRect().width,
    statsColumns: getComputedStyle(document.querySelector('.staff-stats')).gridTemplateColumns,
    cardLefts: [...document.querySelectorAll('.staff-stats article')].map((card) => Math.round(card.getBoundingClientRect().left))
  }));
  expect(geometry.shell).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.workspace).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.workspaceScroll).toBeLessThanOrEqual(geometry.workspace);
  expect(geometry.stats).toBeLessThanOrEqual(geometry.workspace);
  expect(geometry.statsColumns.split(' ')).toHaveLength(2);
  expect(new Set(geometry.cardLefts).size).toBe(2);
  await expect(page.locator('.staff-shell')).toHaveScreenshot('staff-mobile.png', { caret: 'hide' });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(page.locator('.staff-stats')).toBeVisible();
  const narrowGeometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
    workspace: document.querySelector('.staff-workspace').clientWidth,
    workspaceScroll: document.querySelector('.staff-workspace').scrollWidth,
    controlsOutsideViewport: [...document.querySelectorAll('.staff-workspace button, .staff-workspace input, .staff-workspace select, .staff-workspace textarea')]
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left < 0 || rect.right > document.documentElement.clientWidth;
      }).length
  }));
  expect(narrowGeometry.body).toBeLessThanOrEqual(narrowGeometry.viewport);
  expect(narrowGeometry.workspaceScroll).toBeLessThanOrEqual(narrowGeometry.workspace);
  expect(narrowGeometry.controlsOutsideViewport).toBe(0);
});

test('helles Hochkontrast-Design und reduzierte Bewegung bleiben nutzbar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Eine Referenz reicht für den globalen Theme-Zustand.');
  await prepareAccount(page, testInfo, 'a11y');
  const response = await page.request.patch('/api/account/settings', {
    data: { theme: 'light', high_contrast: true, reduce_motion: true, font_scale: 120 }
  });
  expect(response.ok()).toBeTruthy();
  await page.goto('/app/channels/@me');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await page.keyboard.press('Tab');
  await expect(page.locator('.guildora-app')).toHaveScreenshot('accessibility-light.png', { caret: 'hide' });
});

test('Browser meldet ein neues Release und kann die aktuelle Version neu laden', async ({ page }) => {
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests += 1;
  });
  await page.route('**/api/releases/latest', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: '99.0.0', publishedAt: new Date().toISOString(), windows: {} })
  }));
  await page.goto('/app/channels/@me');
  const notice = page.getByRole('status', { name: 'Guildora-Update verfügbar' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Version 99.0.0');
  await expect(notice.getByRole('button', { name: 'Jetzt neu laden' })).toBeVisible();

  const requestsBeforeReload = documentRequests;
  await notice.getByRole('button', { name: 'Jetzt neu laden' }).click();
  await expect.poll(() => documentRequests).toBeGreaterThan(requestsBeforeReload);
});
