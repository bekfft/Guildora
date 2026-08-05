import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Eye, EyeOff, Gavel, LayoutDashboard, Menu, MessageCircle, Search, Server, ShieldCheck, TriangleAlert, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
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
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const requestId = useRef(0);
  const staff = user?.staff;
  const can = (permission) => staff?.permissions?.includes('*') || staff?.permissions?.includes(permission);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError('');
    try {
      const loaders = {
        overview: api.staffDashboard, cases: () => api.staffCases(), users: () => api.staffUsers(appliedQuery), guilds: () => api.staffGuilds(appliedQuery),
        appeals: api.staffAppeals, approvals: api.staffApprovals, audit: api.staffAudit, team: api.staffTeam
      };
      const nextData = await loaders[section]();
      if (requestId.current === currentRequest) setData(nextData);
    } catch (e) {
      if (requestId.current === currentRequest) setError(e.message);
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [appliedQuery, section]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refreshMention = ({ caseId } = {}) => {
      if (section !== 'cases') return;
      load();
      if (selected?.case?.id === caseId) open('case', caseId);
    };
    socket.on('staff:mention', refreshMention);
    if (!socket.connected) socket.connect();
    return () => socket.off('staff:mention', refreshMention);
  }, [load, section, selected?.case?.id]);

  function selectSection(nextSection) {
    if (nextSection === section) { setMenuOpen(false); return; }
    requestId.current += 1;
    setLoading(true);
    setData(null);
    setSelected(null);
    setError('');
    setQuery('');
    setAppliedQuery('');
    setSection(nextSection);
    setMenuOpen(false);
  }

  async function open(kind, id) {
    setError('');
    try { setSelected(await (kind === 'case' ? api.staffCase(id) : kind === 'user' ? api.staffUser(id) : kind === 'guild' ? api.staffGuild(id) : api.staffAppeal(id))); }
    catch (e) { setError(e.message); }
  }
  async function act(fn, refresh = null) { setError(''); try { await fn(); await load(); if (refresh) await open(refresh.kind, refresh.id); else setSelected(null); } catch (e) { setError(e.message); } }

  if (!staff) return null;
  return (
    <main className={`staff-shell${menuOpen ? ' staff-menu-open' : ''}`}>
      <header className="staff-mobile-header">
        <button type="button" className="staff-mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Staff-Menü öffnen"><Menu /></button>
        <div><span>Guildora Staff</span><strong>{sections.find(([id]) => id === section)?.[1]}</strong></div>
        <button type="button" className="staff-mobile-back" onClick={() => navigate('/app')} aria-label="Zurück zu Guildora"><ArrowLeft /></button>
      </header>
      <button type="button" className="staff-nav-backdrop" onClick={() => setMenuOpen(false)} aria-label="Staff-Menü schließen" />
      <aside className="staff-sidebar" aria-label="Staff-Navigation">
        <div className="staff-brand"><ShieldCheck /><div><strong>Guildora Staff</strong><span>{staff.is_owner ? 'Inhaber' : ROLE_NAMES[staff.role]}</span></div></div>
        <nav>{sections.filter(([id]) => id !== 'audit' || can('audit.view')).filter(([id]) => !['team', 'approvals'].includes(id) || can('staff.manage')).map(([id, label, Icon]) => (
          <button type="button" key={id} className={section === id ? 'is-active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => selectSection(id)}><Icon size={18} />{label}</button>
        ))}</nav>
        <button type="button" className="staff-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Staff-Menü schließen"><X /></button>
        <button type="button" className="staff-back" onClick={() => navigate('/app')}><ArrowLeft size={18} /> Zurück zu Guildora</button>
      </aside>
      <section className="staff-workspace">
        <header><div><span className="staff-eyebrow">PLATTFORM-SICHERHEIT</span><h1>{sections.find(([id]) => id === section)?.[1]}</h1></div><span className="staff-role">{staff.is_owner ? 'bekfft · Inhaber' : ROLE_NAMES[staff.role]}</span></header>
        {error && <div className="staff-error">{error}</div>}
        {['users', 'guilds'].includes(section) && <form className="staff-search" onSubmit={(e) => { e.preventDefault(); setSelected(null); const nextQuery = query.trim(); if (nextQuery === appliedQuery) load(); else setAppliedQuery(nextQuery); }}><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={section === 'users' ? 'Benutzername, Anzeigename oder E-Mail' : 'Servername oder Slug'} aria-label={section === 'users' ? 'Benutzer suchen' : 'Server suchen'} /><button>Suchen</button></form>}
        {loading || !data ? <div className="staff-empty" role="status">Staff-Bereich wird geladen …</div> : <StaffContent section={section} data={data} selected={selected} open={open} act={act} can={can} />}
      </section>
    </main>
  );
}

function StaffContent({ section, data, selected, open, act, can }) {
  if (section === 'overview') return <><div className="staff-stats"><Stat label="Offene Fälle" value={data.counts.cases}/><Stat label="Aktive Maßnahmen" value={data.counts.sanctions}/><Stat label="Einsprüche" value={data.counts.appeals}/><Stat label="Servermaßnahmen" value={data.counts.guilds}/></div><Panel title="Neue Fälle"><CaseList items={data.recent_cases} open={open}/></Panel></>;
  if (section === 'cases') return <div className="staff-split"><Panel title="Fallwarteschlange"><CaseList items={data.cases} open={open}/></Panel>{selected ? <CaseDetail value={selected} act={act} can={can}/> : <Empty>Wähle einen Fall aus.</Empty>}</div>;
  if (section === 'users') return <div className="staff-split"><Panel title="Benutzer"><div className="staff-list">{data.users.map((u) => <button key={u.id} onClick={() => open('user', u.id)}><Avatar value={u}/><span><strong>{u.display_name || u.username}{u.is_owner && ' · Inhaber'}</strong><small>@{u.username} · {u.email}</small></span>{u.staff_role && <em>{ROLE_NAMES[u.staff_role]}</em>}</button>)}</div></Panel>{selected ? <UserDetail value={selected} act={act} can={can}/> : <Empty>Suche und wähle einen Benutzer.</Empty>}</div>;
  if (section === 'guilds') return <div className="staff-split"><Panel title="Server"><div className="staff-list">{data.guilds.map((g) => <button key={g.id} onClick={() => open('guild', g.id)}><Avatar value={g}/><span><strong>{g.name}</strong><small>{g.member_count} Mitglieder · @{g.owner_username}</small></span></button>)}</div></Panel>{selected ? <GuildDetail value={selected} act={act} can={can}/> : <Empty>Suche und wähle einen Server.</Empty>}</div>;
  if (section === 'appeals') return <div className="staff-split"><Panel title="Einsprüche"><AppealList items={data.appeals} open={open}/></Panel>{selected ? <AppealDetail value={selected} act={act} can={can}/> : <Empty>Wähle einen Einspruch aus, um den Verlauf zu öffnen.</Empty>}</div>;
  if (section === 'approvals') return <Panel title="Vier-Augen-Freigaben"><div className="staff-cards">{data.approvals.length ? data.approvals.map((a) => <article key={a.id}><div><strong>{a.action}</strong><span className={`staff-status ${a.status}`}>{a.status}</span></div><p>{a.payload.reason}</p><small>Angefordert von @{a.requester_username} · {date(a.created_at)}</small>{a.status === 'pending' && <div className="staff-actions"><button onClick={() => act(() => api.decideStaffApproval(a.id, 'approved'))}>Freigeben</button><button className="danger" onClick={() => act(() => api.decideStaffApproval(a.id, 'rejected'))}>Ablehnen</button></div>}</article>) : <Empty>Keine Freigaben vorhanden.</Empty>}</div></Panel>;
  if (section === 'audit') return <Panel title="Unveränderliches Staff-Audit"><div className="staff-table">{data.logs.map((l) => <div key={l.id}><strong>{l.action}</strong><span>@{l.actor_username}</span><span>{l.target_type} · {l.target_id || '–'}</span><time>{date(l.created_at)}</time></div>)}</div></Panel>;
  if (section === 'team') return <TeamPanel data={data} act={act}/>;
  return null;
}

function Stat({ label, value }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function Panel({ title, children }) { return <section className="staff-panel"><h2>{title}</h2>{children}</section>; }
function Avatar({ value }) { return <span className="staff-avatar">{value.avatar_url || value.icon_url ? <img src={value.avatar_url || value.icon_url} alt=""/> : (value.display_name || value.name || value.username)[0].toUpperCase()}</span>; }
function CaseList({ items, open }) { return <div className="staff-list">{items?.length ? items.map((c) => <button key={c.id} onClick={() => open('case', c.id)}><span className={`staff-priority ${c.priority}`}/><span><strong>{c.target_username ? `@${c.target_username}` : c.category}</strong><small>{c.reason} · {date(c.created_at)}</small></span>{c.watcher_count > 0 && <span className="staff-watch-count"><Eye size={13}/>{c.watcher_count}</span>}<em className={`staff-status ${c.status}`}>{STATUS_NAMES[c.status] || c.status}</em></button>) : <Empty>Keine Fälle in dieser Ansicht.</Empty>}</div>; }
function CaseDetail({ value, act, can }) { const c = value.case; const [note, setNote] = useState(''); const refresh={kind:'case',id:c.id}; return <Panel title={`Fall ${c.id.slice(0,8)}`}><div className="staff-detail"><div className="staff-detail-toolbar"><span className={`staff-status ${c.status}`}>{STATUS_NAMES[c.status]}</span>{can('cases.note')&&<button type="button" className="staff-ghost-button" onClick={()=>act(()=>c.is_watching?api.unwatchStaffCase(c.id):api.watchStaffCase(c.id),refresh)}>{c.is_watching?<><EyeOff size={16}/>Nicht mehr beobachten</>:<><Eye size={16}/>Beobachten</>}</button>}</div><h3>{c.target_username ? `@${c.target_username}` : c.category}</h3><p>{c.reason}</p><small>{c.guild_name || 'Plattformweit'} · {date(c.created_at)}</small>{value.watchers?.length>0&&<div className="staff-watchers"><strong>Beobachter</strong><div>{value.watchers.map((watcher)=><span key={watcher.user_id} title={`@${watcher.username}`}><Avatar value={watcher}/></span>)}</div></div>}{value.evidence?.map((e) => <div className="staff-note" key={e.id}><strong>Gesicherter Inhalt</strong><p>{e.snapshot.content || e.snapshot.display_name || 'Metadaten wurden zum Meldezeitpunkt gesichert.'}</p>{can('content.remove') && e.snapshot.id && <button className="danger" onClick={() => act(() => api.removeStaffMessage(e.snapshot.id, { caseId: c.id, reason: c.reason }))}>Nachricht entfernen</button>}</div>)}{can('cases.manage') && <div className="staff-actions"><button onClick={() => act(() => api.updateStaffCase(c.id, { assignToMe: true, status: 'reviewing' }))}>Übernehmen</button><button onClick={() => act(() => api.updateStaffCase(c.id, { status: 'resolved', resolution: 'Bearbeitung abgeschlossen.' }))}>Lösen</button></div>}<h4>Interne Notizen</h4>{value.notes.map((n) => <p className="staff-note" key={n.id}><strong>@{n.author_username}</strong> {n.body}</p>)}<form className="staff-note-form" onSubmit={(e) => { e.preventDefault(); if(!note.trim())return; act(() => api.addStaffCaseNote(c.id, note),refresh); setNote(''); }}><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Interne Notiz – mit @benutzer erwähnen"/><button>Speichern</button></form></div></Panel>; }
function UserDetail({ value, act, can }) {
  const u = value.user;
  const [type, setType] = useState('warning');
  const [reason, setReason] = useState('');
  return (
    <Panel title="Benutzerdetails">
      <div className="staff-detail">
        <div className="staff-detail-identity">
          <Avatar value={u} />
          <div>
            <h3>{u.display_name || u.username}</h3>
            <small>@{u.username} · {u.email}<br />Registriert {date(u.created_at)}</small>
          </div>
        </div>
        {value.staff?.is_owner && <div className="staff-owner-lock"><ShieldCheck /> bekfft ist als Inhaber vollständig geschützt.</div>}
        <div className={`staff-risk staff-risk-${value.risk.level}`}>
          <div><TriangleAlert size={18}/><strong>Risikohinweis: {value.risk.score}/100</strong><span>{value.risk.level === 'critical' ? 'Kritisch' : value.risk.level === 'high' ? 'Hoch' : value.risk.level === 'elevated' ? 'Erhöht' : 'Niedrig'}</span></div>
          {value.risk.signals.length ? <ul>{value.risk.signals.map((signal)=><li key={signal}>{signal}</li>)}</ul> : <p>Keine aktuellen Risikosignale aus Fällen, Meldungen oder Maßnahmen.</p>}
          <small>Nur Entscheidungshilfe · löst niemals automatisch eine Maßnahme aus.</small>
        </div>
        <h4>Maßnahmen</h4>
        {value.sanctions.length ? value.sanctions.map((sanction) => (
          <div className="staff-note staff-sanction" key={sanction.id}>
            <p><strong>{sanction.type}</strong> {sanction.reason} {sanction.revoked_at && '· aufgehoben'}</p>
            {can('users.restrict') && !sanction.revoked_at && (
              <button type="button" className="staff-inline-danger" onClick={() => act(() => api.revokeStaffSanction(sanction.id))}>Aufheben</button>
            )}
          </div>
        )) : <p className="staff-muted">Keine Maßnahmen.</p>}
        {can('users.warn') && !value.staff?.is_owner && (
          <form className="staff-action-form" onSubmit={(event) => {
            event.preventDefault();
            act(() => api.sanctionStaffUser(u.id, { type, reason }));
            setReason('');
          }}>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="warning">Verwarnung</option>
              <option value="restrict_social">Soziale Funktionen sperren</option>
              <option value="restrict_communication">Kommunikation sperren</option>
              <option value="restrict_dms">Direktnachrichten sperren</option>
              <option value="restrict_guild_creation">Servererstellung sperren</option>
              {can('users.suspend') && <><option value="suspension">Suspendieren</option><option value="ban">Dauerhaft sperren</option></>}
            </select>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Begründung" required />
            <button>Maßnahme anwenden</button>
          </form>
        )}
      </div>
    </Panel>
  );
}
function GuildDetail({ value, act, can }) { const g=value.guild; const [type,setType]=useState('discovery_hidden');const [reason,setReason]=useState('');return <Panel title="Serverdetails"><div className="staff-detail"><h3>{g.name}</h3><small>{value.members.length} Mitglieder · Inhaber @{g.owner_username}<br/>{value.channels.length} Channels · erstellt {date(g.created_at)}</small><h4>Aktive und frühere Maßnahmen</h4>{value.restrictions.length?value.restrictions.map((r)=><div className="staff-note staff-sanction" key={r.id}><p><strong>{r.type}</strong> {r.reason} {r.revoked_at && '· aufgehoben'}</p>{can('guilds.manage')&&!r.revoked_at&&<button type="button" className="staff-inline-danger" onClick={()=>act(()=>api.revokeStaffGuildRestriction(r.id))}>Aufheben</button>}</div>):<p className="staff-muted">Keine Servermaßnahmen.</p>}{can('guilds.manage')&&<form className="staff-action-form" onSubmit={(e)=>{e.preventDefault();act(()=>api.restrictStaffGuild(g.id,{type,reason}));setReason('');}}><select value={type} onChange={(e)=>setType(e.target.value)}><option value="discovery_hidden">Aus Discovery ausblenden</option><option value="restricted">Beitritt einschränken</option><option value="suspended">Server suspendieren</option></select><textarea value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Begründung" required/><button>Servermaßnahme anwenden</button></form>}</div></Panel>;}

function AppealList({ items, open }) { return <div className="staff-list">{items.length ? items.map((appeal)=><button key={appeal.id} onClick={()=>open('appeal',appeal.id)}><MessageCircle size={19}/><span><strong>@{appeal.appellant_username}</strong><small>{appeal.message} · {date(appeal.created_at)}</small></span><span className="staff-message-count">{appeal.message_count}</span><em className={`staff-status ${appeal.status}`}>{STATUS_NAMES[appeal.status]||appeal.status}</em></button>):<Empty>Keine Einsprüche vorhanden.</Empty>}</div>; }

function AppealDetail({ value, act, can }) {
  const { appeal, messages } = value;
  const [body,setBody]=useState('');
  const refresh={kind:'appeal',id:appeal.id};
  const closed=['accepted','rejected'].includes(appeal.status);
  return <Panel title={`Einspruch von @${appeal.appellant_username}`}><div className="staff-detail"><div className="staff-detail-toolbar"><span className={`staff-status ${appeal.status}`}>{STATUS_NAMES[appeal.status]}</span><small>{appeal.sanction_type||'Maßnahme'} · {date(appeal.created_at)}</small></div>{appeal.sanction_reason&&<div className="staff-note"><strong>Ursprüngliche Maßnahme</strong><p>{appeal.sanction_reason}</p></div>}<div className="staff-appeal-thread">{messages.map((message)=><article key={message.id} className={message.is_staff?'is-staff':''}><div><strong>{message.is_staff?'Staff':`@${message.author_username}`}</strong><time>{date(message.created_at)}</time></div><p>{message.body}</p></article>)}</div>{can('appeals.manage')&&!closed&&<form className="staff-note-form" onSubmit={(event)=>{event.preventDefault();if(!body.trim())return;act(()=>api.addStaffAppealMessage(appeal.id,body),refresh);setBody('');}}><textarea value={body} onChange={(event)=>setBody(event.target.value)} placeholder="Antwort an den Nutzer …"/><button>Antwort senden</button></form>}{can('appeals.manage')&&!closed&&<div className="staff-actions"><button onClick={()=>act(()=>api.reviewStaffAppeal(appeal.id,{status:'accepted',response:'Einspruch nach Prüfung angenommen.'}))}>Annehmen</button><button className="danger" onClick={()=>act(()=>api.reviewStaffAppeal(appeal.id,{status:'rejected',response:'Einspruch nach Prüfung abgelehnt.'}))}>Ablehnen</button></div>}</div></Panel>;
}

function TeamPanel({ data, act }) { const [userId,setUserId]=useState('');const [role,setRole]=useState('support');return <Panel title="Guildora-Team"><form className="staff-team-add" onSubmit={(e)=>{e.preventDefault();act(()=>api.updateStaffMember(userId.trim(),role));setUserId('');}}><input value={userId} onChange={(e)=>setUserId(e.target.value)} placeholder="Benutzername, E-Mail oder ID" aria-label="Teammitglied suchen" required/><select value={role} onChange={(e)=>setRole(e.target.value)}>{Object.entries(ROLE_NAMES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button>Teammitglied hinzufügen</button></form><div className="staff-permission-hint">Rollen liefern sinnvolle Standards. Bei Bedarf können die Rechte jedes Teammitglieds einzeln angepasst werden.</div><div className="staff-cards staff-team-cards">{data.team.map((member)=><StaffMemberCard key={member.user_id} member={member} definitions={data.permission_definitions} defaults={data.role_permissions} act={act}/>)}</div></Panel>;}

function StaffMemberCard({ member, definitions, defaults, act }) {
  const allIds=definitions.map(({id})=>id);
  const [role,setRole]=useState(member.role);
  const [custom,setCustom]=useState(member.custom_permissions!==null);
  const [selected,setSelected]=useState(member.permissions.includes('*')?allIds:member.permissions);
  const toggle=(id)=>setSelected((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id]);
  return <article><div><strong>{member.display_name||member.username}</strong>{member.is_owner&&<span className="staff-owner">Inhaber</span>}</div><small>@{member.username}<br/><span className="staff-id">{member.user_id}</span></small><div className="staff-actions"><select aria-label={`Rolle von ${member.username}`} disabled={member.is_owner} value={role} onChange={(event)=>{const next=event.target.value;setRole(next);if(!custom)setSelected(defaults[next]||[]);}}>{Object.entries(ROLE_NAMES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>{!member.is_owner&&<><label className="staff-custom-toggle"><input type="checkbox" checked={custom} onChange={(event)=>{setCustom(event.target.checked);setSelected(event.target.checked?selected:(defaults[role]||[]));}}/> Rechte individuell festlegen</label>{custom&&<div className="staff-permission-grid">{definitions.map(({id,label})=><label key={id}><input type="checkbox" checked={selected.includes(id)} disabled={id==='staff.access'} onChange={()=>toggle(id)}/><span>{label}</span></label>)}</div>}<div className="staff-actions"><button onClick={()=>act(()=>api.updateStaffMember(member.user_id,role,custom?selected:null))}>Berechtigungen speichern</button><button type="button" className="danger" onClick={()=>act(()=>api.removeStaffMember(member.user_id))}>Entfernen</button></div></>}</article>;
}
