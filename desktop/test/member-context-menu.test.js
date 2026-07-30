const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const clientRoot = path.resolve(__dirname, '..', '..', 'client', 'src');
const memberList = fs.readFileSync(path.join(clientRoot, 'app', 'MemberList.jsx'), 'utf8');
const appPage = fs.readFileSync(path.join(clientRoot, 'pages', 'AppPage.jsx'), 'utf8');
const channelView = fs.readFileSync(path.join(clientRoot, 'app', 'ChannelView.jsx'), 'utf8');

test('Mitglieder-Kontextmenü verwendet nur vorhandene Guildora-Aktionen', () => {
  assert.match(memberList, /onContextMenu=\{\(event\) => openContextMenu\(event, member\)\}/);
  assert.match(memberList, /api\.openConversation\(selected\.user_id\)/);
  assert.match(memberList, /api\.addFriend\(profile\.username\)/);
  assert.match(memberList, /api\.blockUser\(selected\.user_id\)/);
  assert.match(memberList, /api\.updateMemberNickname\(guildId, member\.id,/);
  assert.match(memberList, /api\.updateMemberRoles\(guildId, member\.id, next\)/);
  assert.match(memberList, /api\.timeoutMember\(guildId, member\.user_id,/);
  assert.match(memberList, /api\.kickMember\(guildId, member\.id\)/);
  assert.match(memberList, /api\.banMember\(guildId, member\.user_id,/);
});

test('Moderation, Rollen und Nickname werden durch Serverrechte begrenzt', () => {
  assert.match(memberList, /capabilities\.manageServer &&/);
  assert.match(memberList, /capabilities\.manageRoles && customRoles\.length > 0/);
  assert.match(memberList, /capabilities\.kickMembers/);
  assert.match(memberList, /selected\.user_id !== guildOwnerId/);
  assert.match(memberList, /&& !isSelf/);
  assert.match(appPage, /capabilities=\{capabilities\}/);
  assert.match(appPage, /guildOwnerId=\{guildData\?\.guild\.owner_id\}/);
});

test('Erwähnen übernimmt den vorhandenen Guildora-Composer', () => {
  assert.match(appPage, /setMentionRequest\(\{/);
  assert.match(channelView, /@\$\{mentionRequest\.username\}/);
  assert.match(channelView, /mentionRequest\.channelId !== channel\?\.id/);
  assert.match(channelView, /!canSendMessages/);
});
