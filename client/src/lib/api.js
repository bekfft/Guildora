const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(error, status) {
    super(error?.message || 'Die Anfrage ist fehlgeschlagen.');
    this.code = error?.code;
    this.field = error?.field;
    this.status = status;
  }
}

async function request(path, options = {}, allowRefresh = true) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (response.status === 401 && allowRefresh && !path.includes('/auth/refresh')) {
    try {
      await request('/api/auth/refresh', { method: 'POST' }, false);
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
  refresh: () => request('/api/auth/refresh', { method: 'POST' }, false),
  me: () => request('/api/auth/me'),
  myGuilds: () => request('/api/guilds/@me'),
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
  joinGuild: (id) => request(`/api/guilds/${id}/join`, { method: 'POST' }),
  leaveGuild: (id) => request(`/api/guilds/${id}/leave`, { method: 'DELETE' }),
  createGuild: (data) => request('/api/guilds', { method: 'POST', body: JSON.stringify(data) }),
  channel: (id) => request(`/api/channels/${id}`),
  messages: (channelId, { before, limit = 50 } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set('before', before);
    return request(`/api/channels/${channelId}/messages?${query}`);
  },
  sendMessage: (channelId, content, replyToId = null) => request(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, replyToId })
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
