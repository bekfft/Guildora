import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Gavel, LayoutDashboard, Search, Server, ShieldCheck, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/staff.css';
import '../styles/staff-team.css';

const ROLE_NAMES = { support: 'Support', moderation: 'Moderation', administration: 'Administration', management: 'Management' };
const STATUS_NAMES = { open: 'Offen', reviewing: 'In Prüfung', resolved: 'Gelöst', dismissed: 'Abgewiesen', accepted: 'Angenommen', rejected: 'Abgelehnt' };
const sections = [
  ['overview', 'Übersicht', LayoutDashboard], ['cases', 'Fälle', BookOpenCheck], ['users', 'Benutzer', Users],
  ['guilds', 'Server', Server], ['appeals', 'Einsprüche', Gavel], ['approvals', 'Freigaben', ShieldCheck], ['audit', 'Auditlog', ShieldCheck], ['team', 'Team', Users]
];

function date(value) { return value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '–'; }
function Empty({ children }) { return <div className="staff-empty">{children}</div>; }

export default function StaffPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const staff = user?.staff;
  const can = (permission) => staff?.permissions?.includes('*') || staff?.permissions?.includes(permission);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setSelected(null);
    try {
      const loaders = {
        overview: api.staffDashboard, cases: () => api.staffCases(), users: () => api.staffUsers(query), guilds: () => api.staffGuilds(query),
        appeals: api.staffAppeals, approvals: api.staffApprovals, audit: api.staffAudit, team: api.staffTeam
      };
      setData(await loaders[section]());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [query, section]);
  useEffect(() => { load(); }, [load]);

  async function open(kind, id) {
    setError('');
    try { setSelected(await (kind === 'case' ? api.staffCase(id) : kind === 'user' ? api.staffUser(id) : api.staffGuild(id))); }
    catch (e) { setError(e.message); }
  }
  async function act(fn) { setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } }

  if (!staff) return null;
  return (
    <main className="staff-shell">
      <aside className="staff-sidebar">
        <div className="staff-brand"><ShieldCheck /><div><strong>Guildora Staff</strong><span>{staff.is_owner ? 'Inhaber' : ROLE_NAMES[staff.role]}</span></div></div>
        <nav>{sections.filter(([id]) => id !== 'audit' || can('audit.view')).filter(([id]) => !['team', 'approvals'].includes(id) || can('staff.manage')).map(([id, label, Icon]) => (
          <button key={id} className={section === id ? 'is-active' : ''} onClick={() => setSection(id)}><Icon size={18} />{label}</button>
        ))}</nav>
        <button className="staff-back" onClick={() => navigate('/app')}><ArrowLeft size={18} /> Zurück zu Guildora</button>
      </aside>
      <section className="staff-workspace">
        <header><div><span className="staff-eyebrow">PLATTFORM-SICHERHEIT</span><h1>{sections.find(([id]) => id === section)?.[1]}</h1></div><span className="staff-role">{staff.is_owner ? 'bekfft · Inhaber' : ROLE_NAMES[staff.role]}</span></header>
        {!staff.two_factor_enabled && <div className="staff-warning"><strong>2FA erforderlich</strong><span>Aktiviere in deinen Kontoeinstellungen die Zwei-Faktor-Authentifizierung, bevor du Staff-Aktionen ausführst.</span></div>}
        {error && <div className="staff-error">{error}</div>}
        {['users', 'guilds'].includes(section) && <form className="staff-search" onSubmit={(e) => { e.preventDefault(); load(); }}><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={section === 'users' ? 'Benutzername, Anzeigename oder E-Mail' : 'Servername oder Slug'} /><button>Suchen</button></form>}
        {loading ? <div className="staff-empty">Staff-Bereich wird geladen …</div> : <StaffContent section={section} data={data} selected={selected} open={open} act={act} can={can} />}
      </section>
    </main>
  );
}

function StaffContent({ section, data, selected, open, act, can }) {
  if (section === 'overview') return <><div className="staff-stats"><Stat label="Offene Fälle" value={data.counts.cases}/><Stat label="Aktive Maßnahmen" value={data.counts.sanctions}/><Stat label="Einsprüche" value={data.counts.appeals}/><Stat label="Servermaßnahmen" value={data.counts.guilds}/></div><Panel title="Neue Fälle"><CaseList items={data.recent_cases} open={open}/></Panel></>;
  if (section === 'cases') return <div className="staff-split"><Panel title="Fallwarteschlange"><CaseList items={data.cases} open={open}/></Panel>{selected ? <CaseDetail value={selected} act={act} can={can}/> : <Empty>Wähle einen Fall aus.</Empty>}</div>;
  if (section === 'users') return <div className="staff-split"><Panel title="Benutzer"><div className="staff-list">{data.users.map((u) => <button key={u.id} onClick={() => open('user', u.id)}><Avatar value={u}/><span><strong>{u.display_name || u.username}{u.is_owner && ' · Inhaber'}</strong><small>@{u.username} · {u.email}</small></span>{u.staff_role && <em>{ROLE_NAMES[u.staff_role]}</em>}</button>)}</div></Panel>{selected ? <UserDetail value={selected} act={act} can={can}/> : <Empty>Suche und wähle einen Benutzer.</Empty>}</div>;
  if (section === 'guilds') return <div className="staff-split"><Panel title="Server"><div className="staff-list">{data.guilds.map((g) => <button key={g.id} onClick={() => open('guild', g.id)}><Avatar value={g}/><span><strong>{g.name}</strong><small>{g.member_count} Mitglieder · @{g.owner_username}</small></span></button>)}</div></Panel>{selected ? <GuildDetail value={selected} act={act} can={can}/> : <Empty>Suche und wähle einen Server.</Empty>}</div>;
  if (section === 'appeals') return <Panel title="Einsprüche"><div className="staff-cards">{data.appeals.length ? data.appeals.map((a) => <article key={a.id}><div><strong>@{a.appellant_username}</strong><span className={`staff-status ${a.status}`}>{STATUS_NAMES[a.status] || a.status}</span></div><p>{a.message}</p><small>{a.sanction_type || 'Maßnahme'} · {date(a.created_at)}</small>{can('appeals.manage') && a.status !== 'accepted' && a.status !== 'rejected' && <div className="staff-actions"><button onClick={() => act(() => api.reviewStaffAppeal(a.id, { status: 'accepted', response: 'Einspruch angenommen.' }))}>Annehmen</button><button className="danger" onClick={() => act(() => api.reviewStaffAppeal(a.id, { status: 'rejected', response: 'Einspruch nach Prüfung abgelehnt.' }))}>Ablehnen</button></div>}</article>) : <Empty>Keine Einsprüche vorhanden.</Empty>}</div></Panel>;
  if (section === 'approvals') return <Panel title="Vier-Augen-Freigaben"><div className="staff-cards">{data.approvals.length ? data.approvals.map((a) => <article key={a.id}><div><strong>{a.action}</strong><span className={`staff-status ${a.status}`}>{a.status}</span></div><p>{a.payload.reason}</p><small>Angefordert von @{a.requester_username} · {date(a.created_at)}</small>{a.status === 'pending' && <div className="staff-actions"><button onClick={() => act(() => api.decideStaffApproval(a.id, 'approved'))}>Freigeben</button><button className="danger" onClick={() => act(() => api.decideStaffApproval(a.id, 'rejected'))}>Ablehnen</button></div>}</article>) : <Empty>Keine Freigaben vorhanden.</Empty>}</div></Panel>;
  if (section === 'audit') return <Panel title="Unveränderliches Staff-Audit"><div className="staff-table">{data.logs.map((l) => <div key={l.id}><strong>{l.action}</strong><span>@{l.actor_username}</span><span>{l.target_type} · {l.target_id || '–'}</span><time>{date(l.created_at)}</time></div>)}</div></Panel>;
  if (section === 'team') return <TeamPanel team={data.team} act={act}/>;
  return null;
}

function Stat({ label, value }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function Panel({ title, children }) { return <section className="staff-panel"><h2>{title}</h2>{children}</section>; }
function Avatar({ value }) { return <span className="staff-avatar">{value.avatar_url || value.icon_url ? <img src={value.avatar_url || value.icon_url} alt=""/> : (value.display_name || value.name || value.username)[0].toUpperCase()}</span>; }
function CaseList({ items, open }) { return <div className="staff-list">{items?.length ? items.map((c) => <button key={c.id} onClick={() => open('case', c.id)}><span className={`staff-priority ${c.priority}`}/><span><strong>{c.target_username ? `@${c.target_username}` : c.category}</strong><small>{c.reason} · {date(c.created_at)}</small></span><em className={`staff-status ${c.status}`}>{STATUS_NAMES[c.status] || c.status}</em></button>) : <Empty>Keine Fälle in dieser Ansicht.</Empty>}</div>; }
function CaseDetail({ value, act, can }) { const c = value.case; const [note, setNote] = useState(''); return <Panel title={`Fall ${c.id.slice(0,8)}`}><div className="staff-detail"><span className={`staff-status ${c.status}`}>{STATUS_NAMES[c.status]}</span><h3>{c.target_username ? `@${c.target_username}` : c.category}</h3><p>{c.reason}</p><small>{c.guild_name || 'Plattformweit'} · {date(c.created_at)}</small>{value.evidence?.map((e) => <div className="staff-note" key={e.id}><strong>Gesicherter Inhalt</strong><p>{e.snapshot.content || e.snapshot.display_name || 'Metadaten wurden zum Meldezeitpunkt gesichert.'}</p>{can('content.remove') && e.snapshot.id && <button className="danger" onClick={() => act(() => api.removeStaffMessage(e.snapshot.id, { caseId: c.id, reason: c.reason }))}>Nachricht entfernen</button>}</div>)}{can('cases.manage') && <div className="staff-actions"><button onClick={() => act(() => api.updateStaffCase(c.id, { assignToMe: true, status: 'reviewing' }))}>Übernehmen</button><button onClick={() => act(() => api.updateStaffCase(c.id, { status: 'resolved', resolution: 'Bearbeitung abgeschlossen.' }))}>Lösen</button></div>}<h4>Interne Notizen</h4>{value.notes.map((n) => <p className="staff-note" key={n.id}><strong>@{n.author_username}</strong> {n.body}</p>)}<form className="staff-note-form" onSubmit={(e) => { e.preventDefault(); act(() => api.addStaffCaseNote(c.id, note)); setNote(''); }}><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Interne Notiz …"/><button>Speichern</button></form></div></Panel>; }
function UserDetail({ value, act, can }) { const u=value.user; const [type,setType]=useState('warning'); const [reason,setReason]=useState(''); return <Panel title="Benutzerdetails"><div className="staff-detail"><h3>{u.display_name || u.username}</h3><small>@{u.username} · {u.email}<br/>Registriert {date(u.created_at)}</small>{value.staff?.is_owner && <div className="staff-owner-lock"><ShieldCheck/> bekfft ist als Inhaber vollständig geschützt.</div>}<h4>Maßnahmen</h4>{value.sanctions.length ? value.sanctions.map((s) => <p className="staff-note" key={s.id}><strong>{s.type}</strong> {s.reason} {s.revoked_at && '· aufgehoben'}</p>) : <p className="staff-muted">Keine Maßnahmen.</p>}{can('users.warn') && !value.staff?.is_owner && <form className="staff-action-form" onSubmit={(e)=>{e.preventDefault();act(()=>api.sanctionStaffUser(u.id,{type,reason}));setReason('');}}><select value={type} onChange={(e)=>setType(e.target.value)}><option value="warning">Verwarnung</option><option value="restrict_communication">Kommunikation sperren</option><option value="restrict_dms">Direktnachrichten sperren</option><option value="restrict_guild_creation">Servererstellung sperren</option>{can('users.suspend') && <><option value="suspension">Suspendieren</option><option value="ban">Dauerhaft sperren</option></>}</select><textarea value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Begründung"/><button>Maßnahme anwenden</button></form>}</div></Panel>; }
function GuildDetail({ value, act, can }) { const g=value.guild; const [type,setType]=useState('discovery_hidden');const [reason,setReason]=useState('');return <Panel title="Serverdetails"><div className="staff-detail"><h3>{g.name}</h3><small>{value.members.length} Mitglieder · Inhaber @{g.owner_username}<br/>{value.channels.length} Channels · erstellt {date(g.created_at)}</small><h4>Aktive und frühere Maßnahmen</h4>{value.restrictions.length?value.restrictions.map((r)=><p className="staff-note" key={r.id}><strong>{r.type}</strong> {r.reason}</p>):<p className="staff-muted">Keine Servermaßnahmen.</p>}{can('guilds.manage')&&<form className="staff-action-form" onSubmit={(e)=>{e.preventDefault();act(()=>api.restrictStaffGuild(g.id,{type,reason}));setReason('');}}><select value={type} onChange={(e)=>setType(e.target.value)}><option value="discovery_hidden">Aus Discovery ausblenden</option><option value="restricted">Beitritt einschränken</option><option value="suspended">Server suspendieren</option></select><textarea value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Begründung"/><button>Servermaßnahme anwenden</button></form>}</div></Panel>;}
function TeamPanel({ team, act }) { const [userId,setUserId]=useState('');const [role,setRole]=useState('support');return <Panel title="Guildora-Team"><form className="staff-team-add" onSubmit={(e)=>{e.preventDefault();act(()=>api.updateStaffMember(userId.trim(),role));setUserId('');}}><input value={userId} onChange={(e)=>setUserId(e.target.value)} placeholder="Benutzer-ID" required/><select value={role} onChange={(e)=>setRole(e.target.value)}>{Object.entries(ROLE_NAMES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button>Teammitglied hinzufügen</button></form><div className="staff-cards">{team.map((m)=><article key={m.user_id}><div><strong>{m.display_name||m.username}</strong>{m.is_owner&&<span className="staff-owner">Inhaber</span>}</div><small>@{m.username}<br/>{m.user_id}</small><div className="staff-actions"><select disabled={m.is_owner} value={m.role} onChange={(e)=>act(()=>api.updateStaffMember(m.user_id,e.target.value))}>{Object.entries(ROLE_NAMES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{!m.is_owner&&<button className="danger" onClick={()=>act(()=>api.removeStaffMember(m.user_id))}>Entfernen</button>}</div></article>)}</div></Panel>;}
