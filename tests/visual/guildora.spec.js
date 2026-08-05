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
  return { ...created, user };
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

test('Community-Medien, Serverprofil und Statistiken bleiben Discord-orientiert und responsiv', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Die neuen Community-Flächen werden einmal auf Desktop und Mobile geprüft.');
  test.setTimeout(90_000);
  const { guild, channel, user } = await prepareAccount(page, testInfo, 'community-features');
  const profileResponse = await page.request.patch(`/api/social/profile/guilds/${guild.id}`, {
    data: { displayName: 'Mira im Testlabor', bio: 'Community-Profil nur für diesen Server.' }
  });
  expect(profileResponse.ok()).toBeTruthy();

  const voiceUpload = await page.request.post('/api/uploads', {
    multipart: {
      files: { name: 'guildora-sprachnachricht.webm', mimeType: 'audio/webm', buffer: Buffer.from('visual-voice-message') }
    }
  });
  expect(voiceUpload.ok()).toBeTruthy();
  const voiceAttachmentId = (await voiceUpload.json()).attachments[0].id;
  const voiceMessage = await page.request.post(`/api/channels/${channel.id}/messages`, {
    data: {
      content: '',
      attachmentIds: [voiceAttachmentId],
      voiceMessage: {
        attachmentId: voiceAttachmentId,
        durationMs: 7800,
        waveform: Array.from({ length: 36 }, (_, index) => 18 + (index % 9) * 9)
      }
    }
  });
  expect(voiceMessage.ok()).toBeTruthy();
  const linkMessage = await page.request.post(`/api/channels/${channel.id}/messages`, {
    data: { content: 'Weitere Informationen findest du auf https://example.com/' }
  });
  expect(linkMessage.ok()).toBeTruthy();

  await page.goto(`/app/channels/${guild.id}/${channel.id}`);
  await expect(page.locator('.voice-message')).toBeVisible();
  await expect(page.locator('.message-link-preview')).toContainText('Example Domain');
  await expect(page.getByTitle('Sprachnachricht aufnehmen')).toBeVisible();
  await expect(page.locator('.guildora-app')).toHaveScreenshot('community-media-desktop.png', { caret: 'hide' });

  await page.getByRole('button', { name: 'Profil von Mira im Testlabor öffnen' }).first().click();
  const profileDialog = page.getByRole('dialog', { name: 'Profil' });
  await expect(profileDialog).toContainText('Mira im Testlabor');
  await expect(profileDialog).toContainText('Community-Profil nur für diesen Server.');
  await expect(profileDialog).toHaveScreenshot('community-server-profile.png', { caret: 'hide' });
  await profileDialog.getByRole('button', { name: 'Serverprofil', exact: true }).click();
  await expect(profileDialog.locator('.server-profile-editor')).toBeVisible();
  await expect(profileDialog).toHaveScreenshot('community-server-profile-editor.png', { caret: 'hide' });
  await profileDialog.getByRole('button', { name: 'Dialog schließen' }).click();

  await page.locator('.guild-sidebar-header > button').click();
  await page.getByRole('button', { name: 'Server-Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Serverstatistiken', exact: true }).click();
  await expect(page.locator('.server-insights')).toBeVisible();
  await expect(page.locator('.insights-cards')).toContainText('Mitglieder');
  await expect(page.locator('.server-settings')).toHaveScreenshot('community-statistics-desktop.png', { caret: 'hide' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.server-settings')).toHaveScreenshot('community-statistics-mobile.png', { caret: 'hide' });
  expect(user.id).toBeTruthy();
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
  const targetAvatar = targetButton.locator('.staff-avatar img');
  await expect(targetAvatar).toHaveAttribute('src', /\/icons\/guildora-192\.png$/);
  const avatarGeometry = await targetAvatar.evaluate((avatar) => ({
    width: avatar.getBoundingClientRect().width,
    height: avatar.getBoundingClientRect().height,
    objectFit: getComputedStyle(avatar).objectFit
  }));
  expect(avatarGeometry.width).toBe(avatarGeometry.height);
  expect(avatarGeometry.objectFit).toBe('cover');
  await targetButton.click();
  await expect(page.getByRole('heading', { name: 'Benutzerdetails' })).toBeVisible();
  await expect(page.locator('.staff-detail-identity .staff-avatar img')).toHaveAttribute('src', /\/icons\/guildora-192\.png$/);

  await page.getByRole('button', { name: 'Staff-Menü öffnen' }).click();
  await page.getByRole('button', { name: 'Übersicht', exact: true }).click();
  await expect(page.locator('.staff-stats')).toBeVisible();
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

test('iOS Standalone erweitert einen verkürzten Layout-Viewport bis zum physischen Bildschirm', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Die iOS-Standalone-Geometrie wird einmal gezielt geprüft.');
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
    Object.defineProperty(Screen.prototype, 'width', { configurable: true, get: () => 440 });
    Object.defineProperty(Screen.prototype, 'height', { configurable: true, get: () => 956 });
  });
  const { guild, channel } = await prepareAccount(page, testInfo, 'iphone-gap');

  await page.setViewportSize({ width: 440, height: 890 });
  await page.goto(`/app/channels/${guild.id}/${channel.id}?standalone-preview=1`);
  await expect(page.locator('.guildora-app')).toBeVisible();
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientHeight,
    screen: window.screen.height,
    appHeightInline: document.documentElement.style.getPropertyValue('--app-height'),
    appBottom: Math.round(document.querySelector('.guildora-app').getBoundingClientRect().bottom)
  }));
  expect(geometry).toEqual({
    viewport: 890,
    screen: 956,
    appHeightInline: '956px',
    appBottom: 956
  });
});

test('iPhone 17 Pro Max Standalone füllt den Bildschirm und bedient Nachrichten per Langdruck', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Der iPhone-Viewport wird einmal gezielt geprüft.');
  test.setTimeout(90_000);
  const { guild, channel } = await prepareAccount(page, testInfo, 'iphone17');
  const messageResponse = await page.request.post(`/api/channels/${channel.id}/messages`, {
    data: { content: 'Diese Nachricht prüft Langdruck, Profil und mobile Abstände.', replyToId: null, attachmentIds: [] }
  });
  expect(messageResponse.ok()).toBeTruthy();

  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto(`/app/channels/${guild.id}/${channel.id}?standalone-preview=1`);
  await expect(page.locator('.message-row')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'standalone');
  await expect(page.locator('html')).toHaveAttribute('data-mobile-app', '');
  await expect(page.locator('.skip-link')).toBeHidden();
  await expect(page.locator('.message-avatar img')).toHaveAttribute('src', /\/icons\/guildora-192\.png$/);

  const shellGeometry = await page.evaluate(() => {
    const app = document.querySelector('.guildora-app').getBoundingClientRect();
    const composer = document.querySelector('.composer-area').getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.getBoundingClientRect().height,
      appTop: Math.round(app.top),
      appBottom: Math.round(app.bottom),
      appWidth: Math.round(app.width),
      composerBottom: Math.round(composer.bottom),
      appHeightInline: document.documentElement.style.getPropertyValue('--app-height')
    };
  });
  expect(shellGeometry.viewportWidth).toBe(440);
  expect(shellGeometry.viewportHeight).toBe(956);
  expect(shellGeometry.bodyWidth).toBeLessThanOrEqual(440);
  expect(shellGeometry.bodyHeight).toBe(956);
  expect(shellGeometry.appTop).toBe(0);
  expect(shellGeometry.appBottom).toBe(956);
  expect(shellGeometry.appWidth).toBe(440);
  expect(shellGeometry.composerBottom).toBe(956);
  expect(shellGeometry.appHeightInline).toBe('956px');

  const message = page.locator('.message-row').first();
  const actions = message.locator('.message-actions');
  await expect(actions).toBeHidden();
  const messageBox = await message.boundingBox();
  await message.dispatchEvent('pointerdown', {
    pointerType: 'touch', pointerId: 1, isPrimary: true,
    clientX: messageBox.x + 50, clientY: messageBox.y + 20
  });
  await page.waitForTimeout(520);
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Antworten' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Reaktion hinzufügen' })).toBeVisible();
  await expect(page.locator('.guildora-app')).toHaveScreenshot('iphone-17-pro-max-longpress.png', { caret: 'hide' });
  await message.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, isPrimary: true });

  await page.getByRole('button', { name: /Profil von .* öffnen/ }).first().click();
  const profileDialog = page.getByRole('dialog', { name: 'Profil' });
  await expect(profileDialog).toBeVisible();
  await page.waitForTimeout(220);
  const profileGeometry = await profileDialog.evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const close = dialog.querySelector('.app-modal__close').getBoundingClientRect();
    return {
      top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width),
      scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth,
      closeTop: Math.round(close.top), closeRight: Math.round(close.right)
    };
  });
  expect(profileGeometry.top).toBe(0);
  expect(profileGeometry.bottom).toBe(956);
  expect(profileGeometry.width).toBe(440);
  expect(profileGeometry.scrollWidth).toBeLessThanOrEqual(profileGeometry.clientWidth);
  expect(profileGeometry.closeTop).toBeGreaterThanOrEqual(10);
  expect(profileGeometry.closeRight).toBeLessThanOrEqual(440);
  await expect(profileDialog).toHaveScreenshot('iphone-17-pro-max-profile.png', { caret: 'hide' });
  await profileDialog.getByRole('button', { name: 'Dialog schließen' }).click();

  await page.evaluate(() => {
    window.__memberOpenProbe = { mounts: 0, animations: 0 };
    window.__memberOpenObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches('.member-list') || node.querySelector('.member-list'))) {
            window.__memberOpenProbe.mounts += 1;
          }
        }
      }
    });
    window.__memberOpenObserver.observe(document.querySelector('.guildora-app'), { childList: true, subtree: true });
    document.addEventListener('animationstart', (event) => {
      if (event.animationName === 'mobile-members-in') window.__memberOpenProbe.animations += 1;
    }, true);
  });
  await page.getByRole('button', { name: 'Mitgliederliste umschalten' }).click();
  const memberList = page.getByRole('complementary', { name: 'Mitglieder' });
  await expect(memberList).toBeVisible();
  await page.waitForTimeout(240);
  expect(await page.evaluate(() => window.__memberOpenProbe)).toEqual({ mounts: 1, animations: 1 });
  const memberGeometry = await memberList.locator('.member-row').first().evaluate((row) => {
    const avatar = row.querySelector('.member-avatar').getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    return { rowHeight: rect.height, avatarWidth: avatar.width, avatarHeight: avatar.height };
  });
  expect(memberGeometry.rowHeight).toBeGreaterThanOrEqual(54);
  expect(memberGeometry.avatarWidth).toBe(36);
  expect(memberGeometry.avatarHeight).toBe(36);
  await expect(page.locator('.guildora-app')).toHaveScreenshot('iphone-17-pro-max-members.png', { caret: 'hide' });
  await memberList.getByRole('button', { name: 'Mitgliederliste schließen' }).click();

  await page.evaluate(() => { window.__memberOpenProbe = { mounts: 0, animations: 0 }; });
  const appShell = page.locator('.guildora-app');
  const touch = (clientX, clientY) => ({ identifier: 1, clientX, clientY, pageX: clientX, pageY: clientY });
  await appShell.dispatchEvent('touchstart', { touches: [touch(420, 430)], changedTouches: [touch(420, 430)] });
  await appShell.dispatchEvent('touchmove', { touches: [touch(70, 434)], changedTouches: [touch(70, 434)] });
  await page.waitForTimeout(30);
  await appShell.dispatchEvent('touchend', { touches: [], changedTouches: [touch(70, 434)] });
  await expect(memberList).toBeVisible();
  await page.waitForTimeout(260);
  expect(await page.evaluate(() => window.__memberOpenProbe)).toEqual({ mounts: 1, animations: 0 });
  await page.waitForTimeout(220);
  await memberList.getByRole('button', { name: 'Mitgliederliste schließen' }).click();
  await expect(memberList).toBeHidden();

  await page.getByRole('button', { name: 'Navigation öffnen' }).click();
  const navigation = page.locator('.app-navigation');
  await expect(navigation).toBeVisible();
  const navigationGeometry = await navigation.evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    const rail = panel.querySelector('.server-rail').getBoundingClientRect();
    const sidebar = panel.querySelector('.channel-sidebar').getBoundingClientRect();
    const userPanel = panel.querySelector('.user-panel').getBoundingClientRect();
    return {
      top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height),
      railBottom: Math.round(rail.bottom), sidebarBottom: Math.round(sidebar.bottom),
      userPanelBottom: Math.round(userPanel.bottom),
      railColor: getComputedStyle(panel.querySelector('.server-rail')).backgroundColor,
      navigationBackground: getComputedStyle(panel).backgroundImage
    };
  });
  expect(navigationGeometry.top).toBe(0);
  expect(navigationGeometry.bottom).toBe(956);
  expect(navigationGeometry.height).toBe(956);
  expect(navigationGeometry.railBottom).toBe(956);
  expect(navigationGeometry.sidebarBottom).toBe(956);
  expect(navigationGeometry.userPanelBottom).toBe(956);
  expect(navigationGeometry.navigationBackground).toContain('72px');
  await expect(page.locator('.guildora-app')).toHaveScreenshot('iphone-17-pro-max-navigation.png', { caret: 'hide' });

  await navigation.getByRole('button', { name: 'Einstellungen' }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Einstellungen' });
  await expect(settingsDialog).toBeVisible();
  await page.waitForTimeout(220);
  const settingsGeometry = await settingsDialog.evaluate((dialog) => {
    const overlay = dialog.closest('.modal-overlay').getBoundingClientRect();
    const rect = dialog.getBoundingClientRect();
    const layout = dialog.querySelector('.settings-layout').getBoundingClientRect();
    const content = dialog.querySelector('.settings-content').getBoundingClientRect();
    return {
      overlayTop: Math.round(overlay.top), overlayBottom: Math.round(overlay.bottom),
      top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      layoutBottom: Math.round(layout.bottom), contentBottom: Math.round(content.bottom),
      background: getComputedStyle(dialog).backgroundColor,
      overlayBackground: getComputedStyle(dialog.closest('.modal-overlay')).backgroundColor
    };
  });
  expect(settingsGeometry.overlayTop).toBe(0);
  expect(settingsGeometry.overlayBottom).toBe(956);
  expect(settingsGeometry.top).toBe(0);
  expect(settingsGeometry.bottom).toBe(956);
  expect(settingsGeometry.layoutBottom).toBe(956);
  expect(settingsGeometry.contentBottom).toBe(956);
  expect(settingsGeometry.overlayBackground).toBe(settingsGeometry.background);
  await expect(settingsDialog).toHaveScreenshot('iphone-17-pro-max-settings.png', { caret: 'hide' });
  await settingsDialog.getByRole('button', { name: 'Dialog schließen' }).click();
  await expect(settingsDialog).toBeHidden();

  const textChannelRow = navigation.locator(`.channel-row:has(a[href="/app/channels/${guild.id}/${channel.id}"])`);
  await expect(textChannelRow).toHaveCount(1);
  const channelSettingsButton = textChannelRow.getByRole('button', { name: 'allgemein bearbeiten' });
  await expect(channelSettingsButton).toHaveCount(1);
  await channelSettingsButton.click();
  const channelSettingsDialog = page.getByRole('dialog', { name: 'Kanaleinstellungen für allgemein' });
  await expect(channelSettingsDialog).toBeVisible();
  await page.waitForTimeout(220);
  const channelSettingsGeometry = await channelSettingsDialog.evaluate((dialog) => {
    const overlay = dialog.closest('.server-settings-overlay').getBoundingClientRect();
    const rect = dialog.getBoundingClientRect();
    const content = dialog.querySelector('.server-settings__content').getBoundingClientRect();
    return {
      overlayTop: Math.round(overlay.top), overlayBottom: Math.round(overlay.bottom),
      top: Math.round(rect.top), bottom: Math.round(rect.bottom), contentBottom: Math.round(content.bottom),
      overlayBackground: getComputedStyle(dialog.closest('.server-settings-overlay')).backgroundColor,
      contentBackground: getComputedStyle(dialog.querySelector('.server-settings__content')).backgroundColor
    };
  });
  expect(channelSettingsGeometry.overlayTop).toBe(0);
  expect(channelSettingsGeometry.overlayBottom).toBe(956);
  expect(channelSettingsGeometry.top).toBe(0);
  expect(channelSettingsGeometry.bottom).toBe(956);
  expect(channelSettingsGeometry.contentBottom).toBe(956);
  expect(channelSettingsGeometry.contentBackground).toBe(channelSettingsGeometry.overlayBackground);
  await expect(channelSettingsDialog).toHaveScreenshot('iphone-17-pro-max-channel-settings.png', { caret: 'hide' });
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
