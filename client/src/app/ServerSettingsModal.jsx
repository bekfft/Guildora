import {
  BadgeCheck, Check, ChevronRight, CircleUserRound, Copy, FolderPlus, Hash, LayoutDashboard,
  Gavel, Link2, LoaderCircle, Lock, Minus, Plus, RotateCcw, Save, Settings2, Shield, Trash2,
  UserMinus, Users, Volume2, X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useGuildoraDialog } from '../context/GuildoraDialogContext.jsx';

const EMPTY_PERMISSIONS = {
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  kickMembers: false,
  manageMessages: false
};

const PERMISSION_LABELS = {
  manageServer: ['Server verwalten', 'Serverprofil und grundlegende Einstellungen ändern'],
  manageChannels: ['Channels verwalten', 'Channels und Kategorien erstellen oder bearbeiten'],
  manageRoles: ['Rollen verwalten', 'Rollen und deren Berechtigungen bearbeiten'],
  kickMembers: ['Mitglieder entfernen', 'Mitglieder aus dem Server entfernen'],
  manageMessages: ['Nachrichten moderieren', 'Nachrichten anderer Mitglieder verwalten']
};

const CHANNEL_PERMISSION_LABELS = {
  viewChannel: ['Channel anzeigen', 'Legt fest, ob diese Rolle den Channel in der Liste sehen kann.'],
  readHistory: ['Nachrichtenverlauf anzeigen', 'Erlaubt das Laden bereits gesendeter Nachrichten.'],
  sendMessages: ['Nachrichten senden', 'Erlaubt neue Nachrichten in diesem Channel.'],
  attachFiles: ['Dateien anhängen', 'Erlaubt Datei- und Bilduploads, sobald Uploads aktiviert sind.'],
  manageMessages: ['Nachrichten verwalten', 'Erlaubt das Löschen fremder Nachrichten in diesem Channel.']
};

const EMPTY_CHANNEL_PERMISSIONS = {
  viewChannel: 0,
  readHistory: 0,
  sendMessages: 0,
  attachFiles: 0,
  manageMessages: 0
};

const TABS = [
  { id: 'overview', label: 'Serverprofil', icon: LayoutDashboard },
  { id: 'invites', label: 'Einladungen', icon: Link2 },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'roles', label: 'Rollen', icon: Shield },
  { id: 'members', label: 'Mitglieder', icon: Users },
  { id: 'moderation', label: 'Moderation', icon: Gavel }
];

function memberName(member) {
  return member.nickname || member.display_name || member.username;
}

function defaultRoleDraft(role) {
  return {
    name: role?.name || 'Neue Rolle',
    color: role?.color || '#5865f2',
    position: role?.position ?? 1,
    permissions: { ...EMPTY_PERMISSIONS, ...(role?.permissions || {}) }
  };
}

function inviteExpiry(invite) {
  if (!invite.expires_at) return 'Läuft nie ab';
  if (invite.is_expired) return 'Abgelaufen';
  return `Läuft ${new Intl.RelativeTimeFormat('de', { numeric: 'auto' }).format(
    Math.max(1, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 3600000)),
    'hour'
  )} ab`;
}

export default function ServerSettingsModal({
  guildData,
  members,
  capabilities,
  initialTab,
  onClose,
  onRefresh,
  onToast
}) {
  const dialog = useGuildoraDialog();
  const availableTabs = TABS.filter((item) => (
    (item.id === 'overview' && capabilities.manageServer)
    || (item.id === 'invites' && capabilities.manageServer)
    || (item.id === 'channels' && capabilities.manageChannels)
    || (item.id === 'roles' && capabilities.manageRoles)
    || (item.id === 'members' && (capabilities.manageServer || capabilities.manageRoles || capabilities.kickMembers))
    || (item.id === 'moderation' && capabilities.kickMembers)
  ));
  const [tab, setTab] = useState(
    availableTabs.some((item) => item.id === initialTab) ? initialTab : (availableTabs[0]?.id || 'overview')
  );
  const [busy, setBusy] = useState('');
  const [closing, setClosing] = useState(false);
  const [profile, setProfile] = useState({
    name: guildData.guild.name,
    description: guildData.guild.description || '',
    category: guildData.guild.category || 'Community'
  });
  const [newCategory, setNewCategory] = useState('');
  const [newChannel, setNewChannel] = useState({
    name: '',
    type: 'text',
    categoryId: guildData.categories[0]?.id || null,
    topic: ''
  });
  const [selectedRoleId, setSelectedRoleId] = useState(guildData.roles[0]?.id || null);
  const [roleDraft, setRoleDraft] = useState(defaultRoleDraft(guildData.roles[0]));
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [invites, setInvites] = useState([]);
  const [inviteDraft, setInviteDraft] = useState({ expiresIn: '86400', maxUses: 'none' });
  const [moderation, setModeration] = useState({ bans: [], timeouts: [], reports: [], audit_logs: [] });
  const dialogRef = useRef(null);

  const selectedRole = guildData.roles.find((role) => role.id === selectedRoleId);
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const filteredMembers = useMemo(() => members.filter((member) => {
    const term = memberSearch.trim().toLowerCase();
    return !term || memberName(member).toLowerCase().includes(term) || member.username.toLowerCase().includes(term);
  }), [memberSearch, members]);

  useEffect(() => {
    if (!selectedRole) return;
    setRoleDraft(defaultRoleDraft(selectedRole));
  }, [selectedRoleId, selectedRole?.name, selectedRole?.color, selectedRole?.position, selectedRole?.permissions]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    const close = (event) => event.key === 'Escape' && requestClose();
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('keydown', close);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (tab === 'invites') loadInvites();
  }, [tab, guildData.guild.id]);

  useEffect(() => {
    if (tab !== 'moderation') return;
    api.moderation(guildData.guild.id).then(setModeration).catch((error) => onToast(error.message, 'error'));
  }, [tab, guildData.guild.id, onToast]);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    window.setTimeout(onClose, delay);
  }

  async function run(key, action, success) {
    if (busy) return null;
    setBusy(key);
    try {
      const result = await action();
      await onRefresh();
      if (success) onToast(success, 'success');
      return result;
    } catch (error) {
      onToast(error.message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function loadInvites() {
    setBusy('invite-load');
    try {
      const result = await api.guildInvites(guildData.guild.id);
      setInvites(result.invites);
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function createInvite(event) {
    event.preventDefault();
    if (busy) return;
    setBusy('invite-new');
    try {
      const result = await api.createGuildInvite(guildData.guild.id, {
        expiresIn: inviteDraft.expiresIn === 'none' ? null : Number(inviteDraft.expiresIn),
        maxUses: inviteDraft.maxUses === 'none' ? null : Number(inviteDraft.maxUses)
      });
      setInvites((current) => [result.invite, ...current]);
      onToast('Einladung erstellt.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function copyInvite(invite) {
    const url = `${window.location.origin}/invite/${invite.code}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast('Einladungslink kopiert.', 'success');
    } catch {
      onToast(`Link: ${url}`, 'info');
    }
  }

  async function deleteInvite(invite) {
    if (!await dialog.confirm({
      title: 'Einladung deaktivieren?',
      message: 'Der Einladungslink kann danach nicht mehr verwendet werden.',
      confirmLabel: 'Einladung deaktivieren'
    })) return;
    setBusy(`invite-${invite.id}`);
    try {
      await api.deleteGuildInvite(guildData.guild.id, invite.id);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      onToast('Einladung deaktiviert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    await run('profile', () => api.updateGuild(guildData.guild.id, profile), 'Serverprofil gespeichert.');
  }

  async function createCategory(event) {
    event.preventDefault();
    if (!newCategory.trim()) return;
    const result = await run(
      'category-new',
      () => api.createCategory(guildData.guild.id, { name: newCategory.trim() }),
      'Kategorie erstellt.'
    );
    if (result) {
      setNewCategory('');
      setNewChannel((current) => ({ ...current, categoryId: result.category.id }));
    }
  }

  async function renameCategory(category, name) {
    if (!name.trim() || name.trim().toUpperCase() === category.name) return;
    await run(
      `category-${category.id}`,
      () => api.updateCategory(guildData.guild.id, category.id, { name: name.trim(), position: category.position }),
      'Kategorie aktualisiert.'
    );
  }

  async function removeCategory(category) {
    if (!await dialog.confirm({
      title: 'Kategorie löschen?',
      message: `Die Kategorie „${category.name}“ wird gelöscht. Die Channels bleiben ohne Kategorie erhalten.`,
      confirmLabel: 'Kategorie löschen'
    })) return;
    await run(
      `category-${category.id}`,
      () => api.deleteCategory(guildData.guild.id, category.id),
      'Kategorie gelöscht.'
    );
  }

  async function createChannel(event) {
    event.preventDefault();
    if (!newChannel.name.trim()) return;
    const result = await run(
      'channel-new',
      () => api.createChannel(guildData.guild.id, {
        ...newChannel,
        categoryId: newChannel.categoryId || null,
        topic: newChannel.topic || null
      }),
      'Channel erstellt.'
    );
    if (result) setNewChannel((current) => ({ ...current, name: '', topic: '' }));
  }

  async function saveChannel(channel, form) {
    await run(
      `channel-${channel.id}`,
      () => api.updateChannel(guildData.guild.id, channel.id, form),
      'Channel aktualisiert.'
    );
  }

  async function removeChannel(channel) {
    if (!await dialog.confirm({
      title: 'Channel löschen?',
      message: `Der Channel „${channel.name}“ wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Channel löschen'
    })) return;
    await run(
      `channel-${channel.id}`,
      () => api.deleteChannel(guildData.guild.id, channel.id),
      'Channel gelöscht.'
    );
  }

  async function createRole() {
    const result = await run(
      'role-new',
      () => api.createRole(guildData.guild.id, defaultRoleDraft()),
      'Rolle erstellt.'
    );
    if (result) setSelectedRoleId(result.role.id);
  }

  async function saveRole(event) {
    event.preventDefault();
    if (!selectedRole) return;
    await run(
      `role-${selectedRole.id}`,
      () => api.updateRole(guildData.guild.id, selectedRole.id, roleDraft),
      'Rolle gespeichert.'
    );
  }

  async function removeRole() {
    if (!selectedRole || !await dialog.confirm({
      title: 'Rolle löschen?',
      message: `Die Rolle „${selectedRole.name}“ wird dauerhaft gelöscht und allen Mitgliedern entzogen.`,
      confirmLabel: 'Rolle löschen'
    })) return;
    const nextRole = guildData.roles.find((role) => role.id !== selectedRole.id);
    const result = await run(
      `role-${selectedRole.id}`,
      () => api.deleteRole(guildData.guild.id, selectedRole.id),
      'Rolle gelöscht.'
    );
    if (result !== null) setSelectedRoleId(nextRole?.id || null);
  }

  async function saveMemberNickname(member, nickname) {
    await run(
      `member-${member.id}`,
      () => api.updateMemberNickname(guildData.guild.id, member.id, nickname.trim() || null),
      'Serverprofil aktualisiert.'
    );
  }

  async function toggleMemberRole(member, roleId, checked) {
    const current = member.roles.filter((role) => !role.is_default).map((role) => role.id);
    const next = checked ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId);
    await run(
      `member-${member.id}`,
      () => api.updateMemberRoles(guildData.guild.id, member.id, next),
      'Rollen aktualisiert.'
    );
  }

  async function kick(member) {
    if (!await dialog.confirm({
      title: 'Mitglied entfernen?',
      message: `${memberName(member)} wird vom Server entfernt und muss erneut eingeladen werden, um zurückzukehren.`,
      confirmLabel: 'Mitglied entfernen'
    })) return;
    const result = await run(
      `member-${member.id}`,
      () => api.kickMember(guildData.guild.id, member.id),
      'Mitglied entfernt.'
    );
    if (result !== null) setSelectedMemberId(null);
  }

  async function refreshModeration() {
    setModeration(await api.moderation(guildData.guild.id));
  }

  async function moderateMember(member, type) {
    const reason = await dialog.prompt({
      title: type === 'ban' ? 'Mitglied sperren' : 'Timeout vergeben',
      message: type === 'ban'
        ? 'Gib optional einen Grund für die Serversperre an.'
        : 'Gib optional einen Grund für den Timeout an.',
      label: 'Grund',
      placeholder: 'Optionaler Grund …',
      confirmLabel: 'Weiter'
    });
    if (reason === null) return;
    if (type === 'ban') {
      if (!await dialog.confirm({
        title: `${memberName(member)} sperren?`,
        message: 'Das Mitglied wird gesperrt und sofort vom Server entfernt.',
        confirmLabel: 'Mitglied sperren'
      })) return;
      await run(`moderate-${member.id}`, () => api.banMember(guildData.guild.id, member.user_id, reason), 'Mitglied gesperrt.');
      setSelectedMemberId(null);
    } else {
      const timeoutValue = await dialog.prompt({
        title: 'Dauer des Timeouts',
        message: 'Lege fest, wie viele Minuten das Mitglied keine Aktionen ausführen darf.',
        label: 'Minuten',
        inputType: 'number',
        inputMode: 'numeric',
        initialValue: '10',
        min: 1,
        step: 1,
        required: true,
        confirmLabel: 'Timeout setzen',
        validate: (value) => {
          const minutes = Number(value);
          return Number.isInteger(minutes) && minutes >= 1 ? '' : 'Bitte gib eine ganze Zahl ab 1 ein.';
        }
      });
      if (timeoutValue === null) return;
      const minutes = Number(timeoutValue);
      if (!Number.isInteger(minutes) || minutes < 1) return;
      await run(`moderate-${member.id}`, () => api.timeoutMember(guildData.guild.id, member.user_id, minutes, reason), 'Timeout gesetzt.');
    }
  }

  return (
    <div className={`server-settings-overlay ${closing ? 'is-closing' : ''}`}>
      <section
        className="server-settings"
        role="dialog"
        aria-modal="true"
        aria-label={`Servereinstellungen für ${guildData.guild.name}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <aside className="server-settings__sidebar">
          <div className="server-settings__server-name">{guildData.guild.name}</div>
          <nav aria-label="Servereinstellungen">
            <span className="server-settings__group">Einstellungen</span>
            {availableTabs.map(({ id, label, icon: Icon }) => (
              <button className={tab === id ? 'is-active' : ''} type="button" onClick={() => setTab(id)} key={id}>
                <Icon size={17} />{label}
              </button>
            ))}
          </nav>
          <div className="server-settings__owner">
            <CircleUserRound size={17} />
            <span><small>Serverbesitzer</small><strong>@{members.find((item) => item.user_id === guildData.guild.owner_id)?.username}</strong></span>
          </div>
        </aside>

        <main className="server-settings__content">
          <button className="server-settings__close" type="button" onClick={requestClose} aria-label="Servereinstellungen schließen">
            <X size={22} /><span>ESC</span>
          </button>

          {tab === 'overview' && (
            <form className="settings-page" onSubmit={saveProfile}>
              <header><h2>Serverprofil</h2><p>Lege fest, wie dein Server in Guildora angezeigt wird.</p></header>
              <section className="server-profile-card">
                <div className="server-profile-card__icon">
                  {guildData.guild.icon_url
                    ? <img src={guildData.guild.icon_url} alt="" />
                    : guildData.guild.name.slice(0, 2).toUpperCase()}
                </div>
                <div><strong>{profile.name || guildData.guild.name}</strong><span>{members.length} Mitglied{members.length === 1 ? '' : 'er'}</span></div>
              </section>
              <label className="settings-field">
                <span>Servername</span>
                <input value={profile.name} maxLength={80} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
              </label>
              <label className="settings-field">
                <span>Beschreibung</span>
                <textarea value={profile.description} maxLength={1000} rows={5} onChange={(event) => setProfile({ ...profile, description: event.target.value })} />
                <small>{profile.description.length}/1000</small>
              </label>
              <label className="settings-field">
                <span>Kategorie</span>
                <select value={profile.category} onChange={(event) => setProfile({ ...profile, category: event.target.value })}>
                  {['Community', 'Gaming', 'Technik', 'Musik', 'Bildung', 'Kreativ'].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <div className="settings-info-note">
                <BadgeCheck size={18} />
                <span><strong>Discovery wird vom Guildora-Team verwaltet</strong><small>Nur freigeschaltete Server erscheinen unter „Server entdecken“.</small></span>
              </div>
              <button className="settings-primary" type="submit" disabled={busy === 'profile'}>
                {busy === 'profile' ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Änderungen speichern
              </button>
            </form>
          )}

          {tab === 'invites' && (
            <div className="settings-page settings-page--wide">
              <header><h2>Einladungen</h2><p>Erstelle kontrollierte Links, über die neue Mitglieder diesem Server beitreten können.</p></header>
              <form className="invite-create-card" onSubmit={createInvite}>
                <div>
                  <label><span>Ablaufzeit</span>
                    <select value={inviteDraft.expiresIn} onChange={(event) => setInviteDraft({ ...inviteDraft, expiresIn: event.target.value })}>
                      <option value="1800">30 Minuten</option>
                      <option value="3600">1 Stunde</option>
                      <option value="21600">6 Stunden</option>
                      <option value="43200">12 Stunden</option>
                      <option value="86400">1 Tag</option>
                      <option value="604800">7 Tage</option>
                      <option value="none">Nie</option>
                    </select>
                  </label>
                  <label><span>Maximale Nutzungen</span>
                    <select value={inviteDraft.maxUses} onChange={(event) => setInviteDraft({ ...inviteDraft, maxUses: event.target.value })}>
                      {[1, 5, 10, 25, 50, 100].map((value) => <option value={value} key={value}>{value}</option>)}
                      <option value="none">Unbegrenzt</option>
                    </select>
                  </label>
                </div>
                <button className="settings-primary" type="submit" disabled={busy === 'invite-new'}>
                  {busy === 'invite-new' ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />} Einladung erstellen
                </button>
              </form>

              <div className="invite-management-list">
                {busy === 'invite-load' ? (
                  <div className="invite-management-empty"><LoaderCircle className="spin" size={24} /> Einladungen werden geladen …</div>
                ) : invites.length ? invites.map((invite) => (
                  <article className={`invite-management-row ${invite.is_active ? '' : 'is-inactive'}`} key={invite.id}>
                    <div className="invite-management-row__code">
                      <Link2 size={19} />
                      <span><strong>/invite/{invite.code}</strong><small>Erstellt von @{invite.creator?.username || 'unbekannt'}</small></span>
                    </div>
                    <div className="invite-management-row__stats">
                      <span>{inviteExpiry(invite)}</span>
                      <span>{invite.uses}{invite.max_uses === null ? '' : ` / ${invite.max_uses}`} Nutzungen</span>
                    </div>
                    <div className="invite-management-row__actions">
                      <button type="button" disabled={!invite.is_active} onClick={() => copyInvite(invite)} aria-label="Einladungslink kopieren"><Copy size={17} /></button>
                      <button className="is-danger" type="button" disabled={busy === `invite-${invite.id}`} onClick={() => deleteInvite(invite)} aria-label="Einladung deaktivieren"><Trash2 size={17} /></button>
                    </div>
                  </article>
                )) : (
                  <div className="invite-management-empty"><Link2 size={28} /><strong>Noch keine Einladungen</strong><span>Erstelle oben den ersten Einladungslink.</span></div>
                )}
              </div>
              <p className="invite-domain-note">Die Links verwenden automatisch die aktuell geöffnete Domain. Bei einem späteren Domainwechsel bleiben die Einladungscodes gültig.</p>
            </div>
          )}

          {tab === 'channels' && (
            <div className="settings-page settings-page--wide">
              <header><h2>Channels</h2><p>Strukturiere Text- und Sprach-Channels in Kategorien.</p></header>
              <form className="settings-create-row" onSubmit={createCategory}>
                <FolderPlus size={19} />
                <input value={newCategory} maxLength={60} placeholder="Neue Kategorie" aria-label="Neue Kategorie" onChange={(event) => setNewCategory(event.target.value)} />
                <button type="submit" disabled={!newCategory.trim() || busy === 'category-new'}>Kategorie erstellen</button>
              </form>
              <div className="settings-category-list">
                {guildData.categories.map((category) => (
                  <CategoryEditor
                    category={category}
                    guildId={guildData.guild.id}
                    channels={guildData.channels.filter((channel) => channel.category_id === category.id)}
                    categories={guildData.categories}
                    roles={guildData.roles}
                    busy={busy}
                    onRename={renameCategory}
                    onDelete={removeCategory}
                    onSaveChannel={saveChannel}
                    onDeleteChannel={removeChannel}
                    onToast={onToast}
                    key={category.id}
                  />
                ))}
                {guildData.channels.some((channel) => !channel.category_id) && (
                  <CategoryEditor
                    category={{ id: null, name: 'OHNE KATEGORIE', position: 9999 }}
                    guildId={guildData.guild.id}
                    channels={guildData.channels.filter((channel) => !channel.category_id)}
                    categories={guildData.categories}
                    roles={guildData.roles}
                    busy={busy}
                    onSaveChannel={saveChannel}
                    onDeleteChannel={removeChannel}
                    onToast={onToast}
                  />
                )}
              </div>
              <form className="new-channel-card" onSubmit={createChannel}>
                <h3><Plus size={18} /> Channel erstellen</h3>
                <div className="new-channel-card__grid">
                  <label><span>Name</span><input value={newChannel.name} maxLength={80} placeholder="neuer-channel" onChange={(event) => setNewChannel({ ...newChannel, name: event.target.value })} /></label>
                  <label><span>Typ</span><select value={newChannel.type} onChange={(event) => setNewChannel({ ...newChannel, type: event.target.value })}><option value="text">Text</option><option value="voice">Sprache</option></select></label>
                  <label><span>Kategorie</span><select value={newChannel.categoryId || ''} onChange={(event) => setNewChannel({ ...newChannel, categoryId: event.target.value || null })}><option value="">Keine Kategorie</option>{guildData.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  <label className="is-wide"><span>Thema</span><input value={newChannel.topic} maxLength={1024} placeholder="Worum geht es in diesem Channel?" onChange={(event) => setNewChannel({ ...newChannel, topic: event.target.value })} /></label>
                </div>
                <button className="settings-primary" type="submit" disabled={!newChannel.name.trim() || busy === 'channel-new'}>Channel erstellen</button>
              </form>
            </div>
          )}

          {tab === 'roles' && (
            <div className="settings-page settings-page--wide">
              <header><h2>Rollen</h2><p>Gruppiere Mitglieder und vergebe Verwaltungsrechte.</p></header>
              <div className="role-settings-grid">
                <aside className="role-settings-list">
                  <button className="role-create-button" type="button" onClick={createRole}><Plus size={17} /> Rolle erstellen</button>
                  {guildData.roles.map((role) => (
                    <button className={selectedRoleId === role.id ? 'is-active' : ''} type="button" onClick={() => setSelectedRoleId(role.id)} key={role.id}>
                      <i style={{ background: role.color || '#949ba4' }} />
                      <span>{role.is_default ? '@everyone' : role.name}<small>{role.is_default ? members.length : members.filter((member) => member.roles.some((item) => item.id === role.id)).length} Mitglieder</small></span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </aside>
                {selectedRole && (
                  <form className="role-editor" onSubmit={saveRole}>
                    <div className="role-editor__heading">
                      <div><i style={{ background: roleDraft.color }} /><span><small>Rolle bearbeiten</small><strong>{selectedRole.is_default ? '@everyone' : roleDraft.name}</strong></span></div>
                      {!selectedRole.is_default && <button className="settings-danger-icon" type="button" onClick={removeRole} aria-label="Rolle löschen"><Trash2 size={17} /></button>}
                    </div>
                    <div className="role-editor__fields">
                      <label className="settings-field"><span>Rollenname</span><input value={selectedRole.is_default ? '@everyone' : roleDraft.name} maxLength={80} disabled={selectedRole.is_default} onChange={(event) => setRoleDraft({ ...roleDraft, name: event.target.value })} /></label>
                      <label className="settings-field color-field"><span>Rollenfarbe</span><input type="color" value={roleDraft.color} disabled={selectedRole.is_default} onChange={(event) => setRoleDraft({ ...roleDraft, color: event.target.value })} /><code>{roleDraft.color.toUpperCase()}</code></label>
                    </div>
                    <h3>Berechtigungen</h3>
                    <div className="permission-list">
                      {Object.entries(PERMISSION_LABELS).map(([key, [label, description]]) => (
                        <label className="settings-switch" key={key}>
                          <span><strong>{label}</strong><small>{description}</small></span>
                          <input type="checkbox" checked={roleDraft.permissions[key]} onChange={(event) => setRoleDraft({ ...roleDraft, permissions: { ...roleDraft.permissions, [key]: event.target.checked } })} />
                        </label>
                      ))}
                    </div>
                    <button className="settings-primary" type="submit" disabled={!roleDraft.name.trim() || busy === `role-${selectedRole.id}`}>
                      <Check size={17} /> Rolle speichern
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {tab === 'members' && (
            <div className="settings-page settings-page--wide">
              <header><h2>Servermitglieder</h2><p>Verwalte Servernamen, Rollen und Mitgliedschaften.</p></header>
              <label className="member-search"><Users size={18} /><input value={memberSearch} placeholder="Mitglieder suchen" onChange={(event) => setMemberSearch(event.target.value)} /></label>
              <div className="member-management">
                <div className="member-management__list">
                  {filteredMembers.map((member) => (
                    <button className={selectedMemberId === member.id ? 'is-active' : ''} type="button" onClick={() => setSelectedMemberId(member.id)} key={member.id}>
                      <span className="member-avatar">{memberName(member)[0].toUpperCase()}</span>
                      <span><strong>{memberName(member)}</strong><small>@{member.username}</small></span>
                      <div>{member.roles.filter((role) => !role.is_default).slice(0, 3).map((role) => <i title={role.name} style={{ background: role.color || '#949ba4' }} key={role.id} />)}</div>
                      <Settings2 size={17} />
                    </button>
                  ))}
                </div>
                {selectedMember ? (
                  <MemberEditor
                    member={selectedMember}
                    roles={guildData.roles}
                    ownerId={guildData.guild.owner_id}
                    capabilities={capabilities}
                    busy={busy}
                    onSaveNickname={saveMemberNickname}
                    onToggleRole={toggleMemberRole}
                    onKick={kick}
                    onBan={(member) => moderateMember(member, 'ban')}
                    onTimeout={(member) => moderateMember(member, 'timeout')}
                  />
                ) : (
                  <div className="member-management__empty"><CircleUserRound size={38} /><p>Wähle ein Mitglied aus.</p></div>
                )}
              </div>
            </div>
          )}
          {tab === 'moderation' && (
            <div className="settings-page settings-page--wide moderation-page">
              <header><h2>Moderation & Audit-Log</h2><p>Bearbeite Meldungen, Sperren und aktive Timeouts nachvollziehbar.</p></header>
              <h3>Offene Meldungen</h3>
              <div className="moderation-list">
                {moderation.reports.filter((item) => item.status === 'open').map((report) => (
                  <article key={report.id}>
                    <div><strong>@{report.reported_username || 'unbekannt'}</strong><span>{report.reason}</span><small>Gemeldet von @{report.reporter_username}</small></div>
                    <button type="button" onClick={async () => { await api.resolveReport(guildData.guild.id, report.id, 'resolved'); await refreshModeration(); }}>Erledigt</button>
                    <button type="button" onClick={async () => { await api.resolveReport(guildData.guild.id, report.id, 'dismissed'); await refreshModeration(); }}>Verwerfen</button>
                  </article>
                ))}
                {!moderation.reports.some((item) => item.status === 'open') && <p>Keine offenen Meldungen.</p>}
              </div>
              <h3>Serversperren</h3>
              <div className="moderation-list">{moderation.bans.map((ban) => <article key={ban.user_id}><div><strong>@{ban.username}</strong><span>{ban.reason || 'Kein Grund angegeben'}</span></div><button type="button" onClick={async () => { await api.unbanMember(guildData.guild.id, ban.user_id); await refreshModeration(); }}>Entsperren</button></article>)}</div>
              <h3>Aktive Timeouts</h3>
              <div className="moderation-list">{moderation.timeouts.map((timeout) => <article key={timeout.user_id}><div><strong>@{timeout.username}</strong><span>Bis {new Date(timeout.expires_at).toLocaleString('de-DE')}</span></div><button type="button" onClick={async () => { await api.clearTimeout(guildData.guild.id, timeout.user_id); await refreshModeration(); }}>Aufheben</button></article>)}</div>
              <h3>Audit-Log</h3>
              <div className="audit-list">{moderation.audit_logs.map((log) => <article key={log.id}><strong>{log.action}</strong><span>@{log.actor_username}{log.target_username ? ` → @${log.target_username}` : ''}</span><time>{new Date(log.created_at).toLocaleString('de-DE')}</time></article>)}</div>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

function CategoryEditor({
  category, guildId, channels, categories, roles, busy, onRename, onDelete,
  onSaveChannel, onDeleteChannel, onToast
}) {
  const [name, setName] = useState(category.name);
  return (
    <section className="settings-category">
      <div className="settings-category__header">
        <input value={name} disabled={!category.id} aria-label={`Kategorie ${category.name}`} onChange={(event) => setName(event.target.value)} onBlur={() => category.id && onRename(category, name)} />
        <span>{channels.length} Channel</span>
        {category.id && <button type="button" onClick={() => onDelete(category)} aria-label={`${category.name} löschen`}><Trash2 size={15} /></button>}
      </div>
      <div>
        {channels.map((channel) => (
          <ChannelEditor
            channel={channel}
            guildId={guildId}
            categories={categories}
            roles={roles}
            busy={busy === `channel-${channel.id}`}
            onSave={onSaveChannel}
            onDelete={onDeleteChannel}
            onToast={onToast}
            key={channel.id}
          />
        ))}
      </div>
    </section>
  );
}

function ChannelEditor({ channel, guildId, categories, roles, busy, onSave, onDelete, onToast }) {
  const [editing, setEditing] = useState(false);
  const [pane, setPane] = useState('overview');
  const [form, setForm] = useState({
    name: channel.name,
    type: channel.type,
    categoryId: channel.category_id,
    topic: channel.topic || '',
    position: channel.position
  });
  return (
    <div className={`settings-channel ${editing ? 'is-editing' : ''}`}>
      <button className="settings-channel__summary" type="button" onClick={() => setEditing((value) => !value)}>
        {channel.type === 'text' ? <Hash size={19} /> : <Volume2 size={19} />}
        <span><strong>{channel.name}</strong><small>{channel.topic || (channel.type === 'text' ? 'Text-Channel' : 'Sprach-Channel')}</small></span>
        <Settings2 size={17} />
      </button>
      {editing && (
        <div className="channel-editor-panel">
          <div className="channel-editor-tabs" role="tablist" aria-label={`Einstellungen für ${channel.name}`}>
            <button className={pane === 'overview' ? 'is-active' : ''} type="button" role="tab" aria-selected={pane === 'overview'} onClick={() => setPane('overview')}>Übersicht</button>
            <button className={pane === 'permissions' ? 'is-active' : ''} type="button" role="tab" aria-selected={pane === 'permissions'} onClick={() => setPane('permissions')}><Lock size={14} /> Berechtigungen</button>
          </div>
          {pane === 'overview' ? (
            <form onSubmit={async (event) => { event.preventDefault(); await onSave(channel, { ...form, topic: form.topic || null }); setEditing(false); }}>
              <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label><span>Typ</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="text">Text</option><option value="voice">Sprache</option></select></label>
              <label><span>Kategorie</span><select value={form.categoryId || ''} onChange={(event) => setForm({ ...form, categoryId: event.target.value || null })}><option value="">Keine</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label className="is-wide"><span>Thema</span><input value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} /></label>
              <div className="settings-channel__actions">
                <button className="danger-text" type="button" onClick={() => onDelete(channel)}><Trash2 size={15} /> Löschen</button>
                <button className="settings-primary" type="submit" disabled={busy}><Save size={15} /> Speichern</button>
              </div>
            </form>
          ) : (
            <ChannelPermissionEditor guildId={guildId} channel={channel} roles={roles} onToast={onToast} />
          )}
        </div>
      )}
    </div>
  );
}

export function ChannelPermissionEditor({ guildId, channel, roles, onToast }) {
  const defaultRole = roles.find((role) => role.is_default) || roles[roles.length - 1];
  const [selectedRoleId, setSelectedRoleId] = useState(defaultRole?.id || null);
  const [overrides, setOverrides] = useState({});
  const [draft, setDraft] = useState(EMPTY_CHANNEL_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.channelPermissions(guildId, channel.id)
      .then((result) => {
        if (!active) return;
        const next = Object.fromEntries(result.permissions.map((item) => [item.roleId, item]));
        setOverrides(next);
        setDraft({ ...EMPTY_CHANNEL_PERMISSIONS, ...(next[selectedRoleId] || {}) });
      })
      .catch((error) => active && onToast(error.message, 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [guildId, channel.id]);

  useEffect(() => {
    setDraft({ ...EMPTY_CHANNEL_PERMISSIONS, ...(overrides[selectedRoleId] || {}) });
  }, [selectedRoleId, overrides]);

  async function save(nextDraft = draft) {
    if (!selectedRoleId || saving) return;
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.keys(EMPTY_CHANNEL_PERMISSIONS).map((key) => [key, Number(nextDraft[key] || 0)]));
      await api.updateChannelPermissions(guildId, channel.id, selectedRoleId, payload);
      setOverrides((current) => ({ ...current, [selectedRoleId]: { roleId: selectedRoleId, ...payload } }));
      setDraft(payload);
      onToast('Channel-Berechtigungen gespeichert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!selectedRoleId || saving) return;
    setSaving(true);
    try {
      await api.resetChannelPermissions(guildId, channel.id, selectedRoleId);
      setOverrides((current) => {
        const next = { ...current };
        delete next[selectedRoleId];
        return next;
      });
      setDraft(EMPTY_CHANNEL_PERMISSIONS);
      onToast('Berechtigungen werden wieder vererbt.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function togglePrivate() {
    if (!defaultRole) return;
    const current = { ...EMPTY_CHANNEL_PERMISSIONS, ...(overrides[defaultRole.id] || {}) };
    const next = { ...current, viewChannel: Number(current.viewChannel) === -1 ? 0 : -1 };
    setSelectedRoleId(defaultRole.id);
    setDraft(next);
    setSaving(true);
    try {
      await api.updateChannelPermissions(guildId, channel.id, defaultRole.id, next);
      setOverrides((items) => ({ ...items, [defaultRole.id]: { roleId: defaultRole.id, ...next } }));
      onToast(next.viewChannel === -1 ? 'Channel ist jetzt privat.' : 'Channel ist wieder öffentlich.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const isPrivate = Number(overrides[defaultRole?.id]?.viewChannel || 0) === -1;
  if (loading) return <div className="channel-permissions-loading"><LoaderCircle className="spin" size={20} /> Berechtigungen werden geladen …</div>;

  return (
    <div className="channel-permissions">
      <label className="channel-private-toggle">
        <span><Lock size={18} /><span><strong>Privater Channel</strong><small>Nur ausdrücklich erlaubte Rollen können diesen Channel sehen.</small></span></span>
        <input type="checkbox" checked={isPrivate} disabled={saving} onChange={togglePrivate} />
      </label>
      <div className="channel-permissions-grid">
        <aside className="channel-permission-roles">
          <h4>Rollen</h4>
          {roles.map((role) => (
            <button className={selectedRoleId === role.id ? 'is-active' : ''} type="button" onClick={() => setSelectedRoleId(role.id)} key={role.id}>
              <i style={{ background: role.color || '#949ba4' }} />
              <span>{role.is_default ? '@everyone' : role.name}</span>
              {overrides[role.id] && <b title="Individuelle Rechte gesetzt" />}
            </button>
          ))}
        </aside>
        <div className="channel-permission-editor">
          <div className="channel-permission-editor__title">
            <div><small>Berechtigungen für</small><strong>{roles.find((role) => role.id === selectedRoleId)?.name}</strong></div>
            <button type="button" onClick={reset} disabled={!overrides[selectedRoleId] || saving}><RotateCcw size={15} /> Zurücksetzen</button>
          </div>
          {Object.entries(CHANNEL_PERMISSION_LABELS).map(([key, [label, description]]) => (
            <div className="channel-permission-row" key={key}>
              <span><strong>{label}</strong><small>{description}</small></span>
              <div className="permission-tristate" role="radiogroup" aria-label={label}>
                <button className={Number(draft[key]) === -1 ? 'is-deny' : ''} type="button" role="radio" aria-checked={Number(draft[key]) === -1} aria-label={`${label} verweigern`} onClick={() => setDraft({ ...draft, [key]: -1 })}><X size={16} /></button>
                <button className={Number(draft[key]) === 0 ? 'is-inherit' : ''} type="button" role="radio" aria-checked={Number(draft[key]) === 0} aria-label={`${label} vererben`} onClick={() => setDraft({ ...draft, [key]: 0 })}><Minus size={16} /></button>
                <button className={Number(draft[key]) === 1 ? 'is-allow' : ''} type="button" role="radio" aria-checked={Number(draft[key]) === 1} aria-label={`${label} erlauben`} onClick={() => setDraft({ ...draft, [key]: 1 })}><Check size={16} /></button>
              </div>
            </div>
          ))}
          <button className="settings-primary" type="button" onClick={() => save()} disabled={saving}><Save size={16} /> Berechtigungen speichern</button>
        </div>
      </div>
    </div>
  );
}

function MemberEditor({ member, roles, ownerId, capabilities, busy, onSaveNickname, onToggleRole, onKick, onBan, onTimeout }) {
  const [nickname, setNickname] = useState(member.nickname || '');
  useEffect(() => setNickname(member.nickname || ''), [member.id, member.nickname]);
  return (
    <aside className="member-editor">
      <div className="member-editor__profile">
        <span className="member-avatar">{memberName(member)[0].toUpperCase()}</span>
        <div><strong>{memberName(member)}</strong><small>@{member.username}</small></div>
        {member.user_id === ownerId && <span className="owner-badge">Besitzer</span>}
      </div>
      {capabilities.manageServer && (
        <>
          <label className="settings-field"><span>Servername</span><input value={nickname} maxLength={80} placeholder={member.display_name || member.username} onChange={(event) => setNickname(event.target.value)} /></label>
          <button className="settings-secondary" type="button" disabled={busy === `member-${member.id}`} onClick={() => onSaveNickname(member, nickname)}>Servername speichern</button>
        </>
      )}
      {capabilities.manageRoles && (
        <>
          <h3>Rollen</h3>
          <div className="member-role-list">
            {roles.filter((role) => !role.is_default).map((role) => (
              <label key={role.id}>
                <span><i style={{ background: role.color || '#949ba4' }} />{role.name}</span>
                <input
                  type="checkbox"
                  checked={member.roles.some((item) => item.id === role.id)}
                  disabled={busy === `member-${member.id}`}
                  onChange={(event) => onToggleRole(member, role.id, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {capabilities.kickMembers && member.user_id !== ownerId && (
        <div className="member-moderation-actions">
          <button type="button" onClick={() => onTimeout(member)}>Timeout</button>
          <button type="button" onClick={() => onBan(member)}>Sperren</button>
          <button className="member-kick-button" type="button" onClick={() => onKick(member)}><UserMinus size={17} /> Entfernen</button>
        </div>
      )}
    </aside>
  );
}
