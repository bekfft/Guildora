const API_BASE = import.meta.env.VITE_API_URL || '';
let refreshRequest = null;

export class ApiError extends Error {
  constructor(error, status) {
    super(error?.message || 'Die Anfrage ist fehlgeschlagen.');
    this.code = error?.code;
    this.field = error?.field;
    this.status = status;
  }
}

function refreshSession() {
  if (!refreshRequest) {
    refreshRequest = request('/api/auth/refresh', { method: 'POST' }, false)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

async function request(path, options = {}, allowRefresh = true) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    },
    ...options
  });

  if (response.status === 401 && allowRefresh && !path.includes('/auth/refresh')) {
    try {
      await refreshSession();
      return request(path, options, false);
    } catch {
      // Die ursprüngliche Antwort liefert anschließend den passenden Fehler.
    }
  }

  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error, response.status);
  return body;
}

export const api = {
  latestRelease: () => request('/api/releases/latest'),
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  refresh: refreshSession,
  me: () => request('/api/auth/me'),
  staffMe: () => request('/api/staff/me'),
  staffDashboard: () => request('/api/staff/dashboard'),
  staffCases: (query = '') => request(`/api/staff/cases${query}`),
  staffCase: (id) => request(`/api/staff/cases/${id}`),
  updateStaffCase: (id, data) => request(`/api/staff/cases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addStaffCaseNote: (id, body) => request(`/api/staff/cases/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  watchStaffCase: (id) => request(`/api/staff/cases/${id}/watch`, { method: 'PUT' }),
  unwatchStaffCase: (id) => request(`/api/staff/cases/${id}/watch`, { method: 'DELETE' }),
  staffUsers: (q = '') => request(`/api/staff/users?q=${encodeURIComponent(q)}`),
  staffUser: (id) => request(`/api/staff/users/${id}`),
  sanctionStaffUser: (id, data) => request(`/api/staff/users/${id}/sanctions`, { method: 'POST', body: JSON.stringify(data) }),
  revokeStaffSanction: (id) => request(`/api/staff/sanctions/${id}`, { method: 'DELETE' }),
  removeStaffMessage: (id, data = {}) => request(`/api/staff/messages/${id}`, { method: 'DELETE', body: JSON.stringify(data) }),
  staffGuilds: (q = '') => request(`/api/staff/guilds?q=${encodeURIComponent(q)}`),
  staffGuild: (id) => request(`/api/staff/guilds/${id}`),
  restrictStaffGuild: (id, data) => request(`/api/staff/guilds/${id}/restrictions`, { method: 'POST', body: JSON.stringify(data) }),
  staffAppeals: () => request('/api/staff/appeals'),
  staffAppeal: (id) => request(`/api/staff/appeals/${id}`),
  addStaffAppealMessage: (id, body) => request(`/api/staff/appeals/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  reviewStaffAppeal: (id, data) => request(`/api/staff/appeals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  staffAudit: () => request('/api/staff/audit'),
  staffApprovals: () => request('/api/staff/approvals'),
  decideStaffApproval: (id, decision) => request(`/api/staff/approvals/${id}`, { method: 'PATCH', body: JSON.stringify({ decision }) }),
  staffTeam: () => request('/api/staff/team'),
  updateStaffMember: (id, role, customPermissions) => request(`/api/staff/team/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ role, ...(customPermissions === undefined ? {} : { customPermissions }) }) }),
  removeStaffMember: (id) => request(`/api/staff/team/${id}`, { method: 'DELETE' }),
  revokeStaffGuildRestriction: (id) => request(`/api/staff/guild-restrictions/${id}`, { method: 'DELETE' }),
  accountSettings: () => request('/api/account/settings'),
  updateAccountSettings: (data) => request('/api/account/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  updateAccount: (data) => request('/api/account', { method: 'PATCH', body: JSON.stringify(data) }),
  updatePassword: (data) => request('/api/account/password', { method: 'PATCH', body: JSON.stringify(data) }),
  sessions: () => request('/api/account/sessions'),
  revokeSession: (id) => request(`/api/account/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => request('/api/account/sessions/others', { method: 'DELETE' }),
  twoFactorStatus: () => request('/api/account/2fa'),
  setupTwoFactor: (currentPassword) => request('/api/account/2fa/setup', { method: 'POST', body: JSON.stringify({ currentPassword }) }),
  confirmTwoFactor: (code) => request('/api/account/2fa/confirm', { method: 'POST', body: JSON.stringify({ code }) }),
  disableTwoFactor: (currentPassword, code) => request('/api/account/2fa', { method: 'DELETE', body: JSON.stringify({ currentPassword, code }) }),
  connections: () => request('/api/account/connections'),
  deleteConnection: (id) => request(`/api/account/connections/${id}`, { method: 'DELETE' }),
  accountSafety: () => request('/api/account/safety'),
  myAppeals: () => request('/api/account/appeals'),
  myAppeal: (id) => request(`/api/account/appeals/${id}`),
  addMyAppealMessage: (id, body) => request(`/api/account/appeals/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  createAppeal: (sanctionId, message) => request('/api/account/appeals', { method: 'POST', body: JSON.stringify({ sanctionId, message }) }),
  deactivateAccount: (currentPassword) => request('/api/account/deactivate', { method: 'POST', body: JSON.stringify({ currentPassword }) }),
  deleteAccount: (currentPassword, confirmation) => request('/api/account', { method: 'DELETE', body: JSON.stringify({ currentPassword, confirmation }) }),
  myGuilds: () => request('/api/guilds/@me'),
  developerApps: () => request('/api/developer/apps'),
  createDeveloperApp: (data) => request('/api/developer/apps', { method: 'POST', body: JSON.stringify(data) }),
  updateDeveloperApp: (id, data) => request(`/api/developer/apps/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDeveloperApp: (id) => request(`/api/developer/apps/${id}`, { method: 'DELETE' }),
  rotateDeveloperToken: (id) => request(`/api/developer/apps/${id}/token`, { method: 'POST' }),
  installDeveloperApp: (id, data) => request(`/api/developer/apps/${id}/guilds`, { method: 'POST', body: JSON.stringify(data) }),
  uninstallDeveloperApp: (id, guildId) => request(`/api/developer/apps/${id}/guilds/${guildId}`, { method: 'DELETE' }),
  createDeveloperCommand: (id, data) => request(`/api/developer/apps/${id}/commands`, { method: 'POST', body: JSON.stringify(data) }),
  deleteDeveloperCommand: (id, commandId) => request(`/api/developer/apps/${id}/commands/${commandId}`, { method: 'DELETE' }),
  guildCommands: (guildId) => request(`/api/developer/guilds/${guildId}/commands`),
  invokeGuildCommand: (guildId, name, data) => request(`/api/developer/guilds/${guildId}/commands/${encodeURIComponent(name)}/invoke`, { method: 'POST', body: JSON.stringify(data) }),
  invite: (code) => request(`/api/invites/${encodeURIComponent(code)}`),
  joinInvite: (code) => request(`/api/invites/${encodeURIComponent(code)}/join`, { method: 'POST' }),
  guildInvites: (guildId) => request(`/api/guilds/${guildId}/invites`),
  createGuildInvite: (guildId, data) => request(`/api/guilds/${guildId}/invites`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteGuildInvite: (guildId, inviteId) => request(`/api/guilds/${guildId}/invites/${inviteId}`, { method: 'DELETE' }),
  discoverGuilds: (query = '') => request(`/api/guilds/discovery${query}`),
  guild: (id) => request(`/api/guilds/${id}`),
  guildMembers: (id) => request(`/api/guilds/${id}/members`),
  guildStatistics: (id) => request(`/api/guilds/${id}/statistics`),
  joinGuild: (id) => request(`/api/guilds/${id}/join`, { method: 'POST' }),
  leaveGuild: (id) => request(`/api/guilds/${id}/leave`, { method: 'DELETE' }),
  createGuild: (data) => request('/api/guilds', { method: 'POST', body: JSON.stringify(data) }),
  channel: (id) => request(`/api/channels/${id}`),
  voiceStatus: () => request('/api/voice/status'),
  voiceParticipants: (channelId) => request(`/api/voice/channels/${channelId}/participants`),
  voiceToken: (channelId) => request(`/api/voice/channels/${channelId}/token`, { method: 'POST' }),
  messages: (channelId, { before, around, limit = 50 } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set('before', before);
    if (around) query.set('around', around);
    return request(`/api/channels/${channelId}/messages?${query}`);
  },
  markChannelRead: (channelId, messageId = null) => request(`/api/channels/${channelId}/read`, {
    method: 'POST',
    body: JSON.stringify({ messageId })
  }),
  notifications: ({ unreadOnly = false, limit = 50 } = {}) => {
    const query = new URLSearchParams({
      unreadOnly: String(unreadOnly),
      limit: String(limit)
    });
    return request(`/api/notifications?${query}`);
  },
  readNotification: (notificationId) => request(`/api/notifications/${notificationId}/read`, {
    method: 'PATCH'
  }),
  readAllNotifications: () => request('/api/notifications/read-all', { method: 'POST' }),
  searchMessages: (guildId, filters) => {
    const query = new URLSearchParams({ q: filters.q, limit: String(filters.limit || 50) });
    if (filters.channelId) query.set('channelId', filters.channelId);
    if (filters.authorId) query.set('authorId', filters.authorId);
    if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) query.set('dateTo', filters.dateTo);
    return request(`/api/guilds/${guildId}/messages/search?${query}`);
  },
  searchUsers: (q) => request(`/api/social/users/search?q=${encodeURIComponent(q)}`),
  profile: (userId, guildId = null) => request(
    `/api/social/users/${userId}/profile${guildId ? `?guildId=${encodeURIComponent(guildId)}` : ''}`
  ),
  updateProfile: (data) => request('/api/social/profile', {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  updateGuildProfile: (guildId, data) => request(`/api/social/profile/guilds/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  updateBadgePreferences: (badges) => request('/api/social/profile/badges', {
    method: 'PUT',
    body: JSON.stringify({ badges })
  }),
  reportProfile: (userId, reason) => request(`/api/social/users/${userId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  }),
  friends: () => request('/api/social/friends'),
  addFriend: (username) => request('/api/social/friends', { method: 'POST', body: JSON.stringify({ username }) }),
  respondFriend: (id, action) => request(`/api/social/friends/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  removeFriend: (id) => request(`/api/social/friends/${id}`, { method: 'DELETE' }),
  blockUser: (userId) => request(`/api/social/users/${userId}/block`, { method: 'PUT' }),
  unblockUser: (userId) => request(`/api/social/users/${userId}/block`, { method: 'DELETE' }),
  conversations: () => request('/api/social/dm/conversations'),
  openConversation: (userId) => request(`/api/social/dm/users/${userId}`, { method: 'POST' }),
  dmMessages: (id) => request(`/api/social/dm/conversations/${id}/messages`),
  sendDm: (id, content, attachmentIds = [], voiceMessage = null) => request(`/api/social/dm/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, attachmentIds, voiceMessage })
  }),
  markDmRead: (id) => request(`/api/social/dm/conversations/${id}/read`, { method: 'POST' }),
  uploadFiles: (files) => {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    return request('/api/uploads', { method: 'POST', body });
  },
  moderation: (guildId) => request(`/api/guilds/${guildId}/moderation`),
  banMember: (guildId, userId, reason) => request(`/api/guilds/${guildId}/moderation/bans`, {
    method: 'POST', body: JSON.stringify({ userId, reason })
  }),
  unbanMember: (guildId, userId) => request(`/api/guilds/${guildId}/moderation/bans/${userId}`, { method: 'DELETE' }),
  timeoutMember: (guildId, userId, durationMinutes, reason) => request(`/api/guilds/${guildId}/moderation/timeouts`, {
    method: 'POST', body: JSON.stringify({ userId, durationMinutes, reason })
  }),
  clearTimeout: (guildId, userId) => request(`/api/guilds/${guildId}/moderation/timeouts/${userId}`, { method: 'DELETE' }),
  report: (guildId, data) => request(`/api/guilds/${guildId}/reports`, { method: 'POST', body: JSON.stringify(data) }),
  resolveReport: (guildId, reportId, status) => request(`/api/guilds/${guildId}/reports/${reportId}`, {
    method: 'PATCH', body: JSON.stringify({ status })
  }),
  sendMessage: (channelId, content, replyToId = null, attachmentIds = [], voiceMessage = null) => request(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, replyToId, attachmentIds, voiceMessage })
  }),
  updateMessage: (messageId, content) => request(`/api/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content })
  }),
  deleteMessage: (messageId) => request(`/api/messages/${messageId}`, { method: 'DELETE' }),
  toggleReaction: (messageId, emoji) => request(`/api/messages/${messageId}/reactions`, {
    method: 'PUT',
    body: JSON.stringify({ emoji })
  }),
  updateGuild: (guildId, data) => request(`/api/guilds/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  createCategory: (guildId, data) => request(`/api/guilds/${guildId}/categories`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateCategory: (guildId, categoryId, data) => request(`/api/guilds/${guildId}/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  deleteCategory: (guildId, categoryId) => request(`/api/guilds/${guildId}/categories/${categoryId}`, { method: 'DELETE' }),
  createChannel: (guildId, data) => request(`/api/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateChannel: (guildId, channelId, data) => request(`/api/guilds/${guildId}/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  deleteChannel: (guildId, channelId) => request(`/api/guilds/${guildId}/channels/${channelId}`, { method: 'DELETE' }),
  channelPermissions: (guildId, channelId) => request(`/api/guilds/${guildId}/channels/${channelId}/permissions`),
  updateChannelPermissions: (guildId, channelId, roleId, data) => request(`/api/guilds/${guildId}/channels/${channelId}/permissions/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  resetChannelPermissions: (guildId, channelId, roleId) => request(`/api/guilds/${guildId}/channels/${channelId}/permissions/${roleId}`, { method: 'DELETE' }),
  createRole: (guildId, data) => request(`/api/guilds/${guildId}/roles`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateRole: (guildId, roleId, data) => request(`/api/guilds/${guildId}/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  deleteRole: (guildId, roleId) => request(`/api/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
  updateMemberRoles: (guildId, memberId, roleIds) => request(`/api/guilds/${guildId}/members/${memberId}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roleIds })
  }),
  updateMemberNickname: (guildId, memberId, nickname) => request(`/api/guilds/${guildId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ nickname })
  }),
  kickMember: (guildId, memberId) => request(`/api/guilds/${guildId}/members/${memberId}`, { method: 'DELETE' })
};
