import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ImagePlus,
  Info,
  LoaderCircle,
  LogOut,
  Palette,
  UserPen,
  UserRound,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDesktop } from '../context/DesktopContext.jsx';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';

const TABS = [
  { id: 'Mein Konto', label: 'Mein Konto', icon: UserRound },
  { id: 'Profil', label: 'Profile', icon: UserPen },
  { id: 'Erscheinungsbild', label: 'Erscheinungsbild', icon: Palette }
];

function moveItem(items, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function ProfileSettings({ user, refreshUser, onToast }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ displayName: '', bio: '', customStatus: '' });
  const [badges, setBadges] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarObjectUrl = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile]);
  const bannerObjectUrl = useMemo(() => bannerFile ? URL.createObjectURL(bannerFile) : null, [bannerFile]);

  useEffect(() => () => {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    if (bannerObjectUrl) URL.revokeObjectURL(bannerObjectUrl);
  }, [avatarObjectUrl, bannerObjectUrl]);

  useEffect(() => {
    api.profile(user.id)
      .then(({ profile: loaded }) => {
        setProfile(loaded);
        setForm({
          displayName: loaded.display_name || loaded.username,
          bio: loaded.bio || '',
          customStatus: loaded.custom_status || ''
        });
        setBadges(loaded.badges.map((badge) => ({ ...badge, visible: badge.is_visible !== false })));
      })
      .catch((error) => onToast(error.message, 'error'));
  }, [onToast, user.id]);

  async function uploadOne(file) {
    if (!file) return undefined;
    const result = await api.uploadFiles([file]);
    return result.attachments[0].id;
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const [avatarAttachmentId, bannerAttachmentId] = await Promise.all([
        uploadOne(avatarFile),
        uploadOne(bannerFile)
      ]);
      await api.updateProfile({
        ...form,
        ...(avatarAttachmentId ? { avatarAttachmentId } : {}),
        ...(bannerAttachmentId ? { bannerAttachmentId } : {}),
        ...(removeAvatar ? { avatarAttachmentId: null } : {}),
        ...(removeBanner ? { bannerAttachmentId: null } : {})
      });
      await api.updateBadgePreferences(badges.map((badge) => ({ id: badge.id, visible: badge.visible })));
      await refreshUser();
      const loaded = await api.profile(user.id);
      setProfile(loaded.profile);
      setBadges(loaded.profile.badges.map((badge) => ({ ...badge, visible: badge.is_visible !== false })));
      setAvatarFile(null);
      setBannerFile(null);
      setRemoveAvatar(false);
      setRemoveBanner(false);
      onToast('Profil gespeichert.', 'success');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <div className="profile-settings-loading"><LoaderCircle className="spin" size={20} /> Profil wird geladen …</div>;

  const avatarPreview = avatarObjectUrl || (!removeAvatar ? profile.avatar_url : null);
  const bannerPreview = bannerObjectUrl || (!removeBanner ? profile.banner_url : null);

  return (
    <form className="profile-settings" onSubmit={save}>
      <div className="profile-settings-preview">
        <div className="profile-settings-preview__banner" style={bannerPreview ? { backgroundImage: `url("${bannerPreview}")` } : undefined}>
          <label><ImagePlus size={16} /> Banner<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { setBannerFile(event.target.files[0] || null); setRemoveBanner(false); }} /></label>
          {(profile.banner_url || bannerFile) && <button type="button" onClick={() => { setBannerFile(null); setRemoveBanner(true); }} aria-label="Banner entfernen"><Trash2 size={15} /></button>}
        </div>
        <div className="profile-settings-preview__avatar">
          {avatarPreview ? <img src={avatarPreview} alt="" /> : (form.displayName || user.username)[0].toUpperCase()}
          <label aria-label="Avatar auswählen"><ImagePlus size={15} /><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { setAvatarFile(event.target.files[0] || null); setRemoveAvatar(false); }} /></label>
          {(profile.avatar_url || avatarFile) && <button type="button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); }} aria-label="Avatar entfernen"><Trash2 size={13} /></button>}
        </div>
      </div>

      <label className="settings-field"><span>Anzeigename</span><input value={form.displayName} minLength={2} maxLength={32} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
      <label className="settings-field"><span>Status</span><input value={form.customStatus} maxLength={80} placeholder="Was machst du gerade?" onChange={(event) => setForm({ ...form, customStatus: event.target.value })} /><small>{form.customStatus.length}/80</small></label>
      <label className="settings-field"><span>Über mich</span><textarea value={form.bio} maxLength={190} rows={4} placeholder="Erzähle etwas über dich …" onChange={(event) => setForm({ ...form, bio: event.target.value })} /><small>{form.bio.length}/190</small></label>

      {badges.length > 0 && (
        <section className="profile-badge-settings">
          <h4>Profilabzeichen</h4>
          <p>Lege fest, welche Abzeichen andere sehen und in welcher Reihenfolge sie erscheinen.</p>
          {badges.map((badge, index) => (
            <div className={!badge.visible ? 'is-hidden' : ''} key={badge.id}>
              <i style={{ background: `linear-gradient(145deg, ${badge.color_start}, ${badge.color_end})` }} />
              <span><strong>{badge.name}</strong><small>{badge.description}</small></span>
              <button type="button" onClick={() => setBadges(moveItem(badges, index, -1))} disabled={index === 0} aria-label={`${badge.name} nach oben`}><ChevronUp size={15} /></button>
              <button type="button" onClick={() => setBadges(moveItem(badges, index, 1))} disabled={index === badges.length - 1} aria-label={`${badge.name} nach unten`}><ChevronDown size={15} /></button>
              <button type="button" onClick={() => setBadges(badges.map((item) => item.id === badge.id ? { ...item, visible: !item.visible } : item))} aria-label={`${badge.name} ${badge.visible ? 'ausblenden' : 'einblenden'}`}>
                {badge.visible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          ))}
        </section>
      )}

      <Button variant="primary" type="submit" disabled={saving}>
        {saving ? <LoaderCircle className="spin" size={17} /> : null} Profil speichern
      </Button>
    </form>
  );
}

export default function SettingsModal({ onClose, onToast, initialTab = 'Mein Konto' }) {
  const [tab, setTab] = useState(initialTab);
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const desktop = useDesktop();
  const tabs = desktop?.isDesktop
    ? [...TABS, { id: 'Über', label: 'Über Guildora', icon: Info }]
    : TABS;

  function updateStatus() {
    const state = desktop.update;
    if (state.type === 'checking') return 'Suche nach Updates …';
    if (state.type === 'available') return `Version ${state.version} wird geladen …`;
    if (state.type === 'progress') return `Update wird geladen … ${state.percent} %`;
    if (state.type === 'downloaded') return `Version ${state.version} ist bereit.`;
    if (state.type === 'error') return state.message;
    return 'Du bist auf dem neuesten Stand.';
  }

  async function handleLogout() {
    await logout();
    onClose();
    navigate('/login', { replace: true });
  }

  return (
    <Modal title="Einstellungen" className="app-modal--settings" onClose={onClose}>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <button className="settings-user-summary" type="button" onClick={() => setTab('Profil')}>
            <span>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.username[0].toUpperCase()}</span>
            <span><strong>{user.display_name || user.username}</strong><small>Profil bearbeiten</small></span>
          </button>
          <span className="settings-nav-label">Benutzereinstellungen</span>
          <nav aria-label="Einstellungsbereiche">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button className={tab === item.id ? 'is-active' : ''} type="button" onClick={() => setTab(item.id)} key={item.id}>
                  <Icon size={18} /><span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button className="settings-sidebar__logout" type="button" onClick={handleLogout}><LogOut size={18} /> Abmelden</button>
        </aside>
        <main className="settings-content">
          <div className="settings-content__inner">
            <header className="settings-content__header">
              <span>Benutzereinstellungen</span>
              <h3>{tabs.find((item) => item.id === tab)?.label || tab}</h3>
            </header>
            {tab === 'Mein Konto' && (
              <>
                <div className="account-card">
                  <div>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.username[0].toUpperCase()}</div>
                  <span><strong>{user.display_name || user.username}</strong><small>@{user.username}</small></span>
                  <Button variant="primary" onClick={() => setTab('Profil')}>Profil bearbeiten</Button>
                </div>
                <section className="account-info-panel">
                  <h4>Account-Info</h4>
                  <div><span><small>Anzeigename</small><strong>{user.display_name || user.username}</strong></span><button type="button" onClick={() => setTab('Profil')}>Bearbeiten</button></div>
                  <div><span><small>Benutzername</small><strong>@{user.username}</strong></span></div>
                  <div><span><small>E-Mail-Adresse</small><strong>{user.email}</strong></span></div>
                </section>
              </>
            )}
            {tab === 'Profil' && <ProfileSettings user={user} refreshUser={refreshUser} onToast={onToast} />}
            {tab === 'Erscheinungsbild' && (
              <section className="settings-large-panel">
                <h4>Dunkles Erscheinungsbild</h4>
                <p>Guildora verwendet das optimierte dunkle Design für eine ruhige und kontrastreiche Darstellung.</p>
                <div className="appearance-preview"><span /><span /><span /></div>
              </section>
            )}
            {tab === 'Über' && desktop?.isDesktop && (
              <div className="desktop-about settings-large-panel">
                <p><strong>Guildora Desktop</strong><span>Version {desktop.version}</span></p>
                <Button variant="primary" onClick={desktop.checkForUpdates}>Nach Updates suchen</Button>
                <small>{updateStatus()}</small>
                {desktop.update.type === 'progress' && <div className="desktop-about__progress"><span style={{ width: `${desktop.update.percent}%` }} /></div>}
                <label><input type="checkbox" checked={Boolean(desktop.settings?.autostart)} onChange={(event) => desktop.setSettings({ autostart: event.target.checked })} /> Guildora beim Anmelden starten</label>
                <label><input type="checkbox" checked={desktop.settings?.minimizeToTray !== false} onChange={(event) => desktop.setSettings({ minimizeToTray: event.target.checked })} /> Beim Schließen in den Infobereich minimieren</label>
              </div>
            )}
          </div>
        </main>
      </div>
    </Modal>
  );
}
