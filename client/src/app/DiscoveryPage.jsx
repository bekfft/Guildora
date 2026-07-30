import { ArrowRight, BadgeCheck, Compass, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useGuilds } from '../context/GuildContext.jsx';

const CATEGORIES = ['Alle', 'Gaming', 'Musik', 'Bildung', 'Technik', 'Community'];

function GuildStats({ guild }) {
  return (
    <div className="guild-card__stats">
      <span><i className="is-online" />{guild.online_count} Online</span>
      <span><i />{guild.member_count} Mitglieder</span>
    </div>
  );
}

export default function DiscoveryPage({ onToast }) {
  const navigate = useNavigate();
  const { guilds, joinGuild } = useGuilds();
  const [allGuilds, setAllGuilds] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Alle');
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.discoverGuilds()
      .then((result) => setAllGuilds(result.guilds))
      .catch((error) => onToast(error.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const visibleGuilds = useMemo(() => allGuilds.map((guild) => ({
    ...guild,
    is_member: guilds.some((item) => item.id === guild.id)
  })).filter((guild) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || guild.name.toLowerCase().includes(term) || guild.description.toLowerCase().includes(term);
    const matchesCategory = category === 'Alle' || guild.category === category;
    return matchesSearch && matchesCategory;
  }), [allGuilds, guilds, search, category]);

  const featured = visibleGuilds.find((guild) => guild.is_official);
  const gridGuilds = visibleGuilds.filter((guild) => !guild.is_official);

  async function handleJoin(guild) {
    if (guild.is_member) return;
    setJoiningId(guild.id);
    try {
      const result = await joinGuild(guild);
      onToast(`Willkommen bei ${guild.name}!`, 'success');
      navigate(`/app/channels/${guild.id}/${result.channel.id}`);
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setJoiningId(null);
    }
  }

  function openGuild(guild) {
    const saved = localStorage.getItem(`guildora:last-channel:${guild.id}`);
    navigate(saved ? `/app/channels/${guild.id}/${saved}` : `/app/channels/${guild.id}`);
  }

  return (
    <main className="discovery-page">
      <section className="discovery-hero">
        <Compass size={42} />
        <h1>Finde deine Community auf Guildora</h1>
        <p>Von Gaming bis Musik: Entdecke Orte, an denen du dich sofort zuhause fühlst.</p>
        <label className="discovery-search"><Search size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Durchsuche Server" /></label>
      </section>
      <div className="category-chips" aria-label="Server-Kategorien">
        {CATEGORIES.map((item) => <button type="button" className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}
      </div>
      {loading ? (
        <div className="discovery-skeleton"><span /><span /><span /></div>
      ) : visibleGuilds.length === 0 ? (
        <section className="discovery-empty"><Search size={44} /><h2>Keine Server gefunden</h2><p>Versuche einen anderen Suchbegriff oder wechsle die Kategorie.</p></section>
      ) : (
        <>
          {featured && (
            <article className="featured-guild">
              <div
                className="featured-guild__banner"
                style={featured.banner_url ? { backgroundImage: `url("${featured.banner_url}")` } : undefined}
              />
              <div className="featured-guild__icon">
                {featured.icon_url
                  ? <img src={featured.icon_url} alt="" />
                  : featured.name.slice(0, 2).toUpperCase()}
                <BadgeCheck size={21} />
              </div>
              <div className="featured-guild__body">
                <div>
                  <h2>{featured.name} <BadgeCheck size={19} /></h2>
                  <p>{featured.description}</p>
                  <GuildStats guild={featured} />
                </div>
                <div className="featured-guild__actions">
                  {featured.is_member ? (
                    <><button type="button" disabled>Bereits beigetreten</button><button className="text-action" type="button" onClick={() => openGuild(featured)}>Öffnen <ArrowRight size={17} /></button></>
                  ) : <button className="join-button" type="button" disabled={joiningId === featured.id} onClick={() => handleJoin(featured)}>{joiningId === featured.id ? 'Beitritt …' : 'Beitreten'}</button>}
                </div>
              </div>
            </article>
          )}
          {gridGuilds.length > 0 && <h2 className="discovery-section-title">Weitere Communities</h2>}
          <div className="guild-grid">
            {gridGuilds.map((guild) => (
              <article className="guild-card" key={guild.id}>
                <div
                  className="guild-card__banner"
                  style={guild.banner_url ? { backgroundImage: `url("${guild.banner_url}")` } : undefined}
                />
                <div className="guild-card__icon">
                  {guild.icon_url ? <img src={guild.icon_url} alt="" /> : guild.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="guild-card__body">
                  <h3>{guild.name}{guild.is_verified && <BadgeCheck size={16} />}</h3>
                  <p>{guild.description}</p>
                  <GuildStats guild={guild} />
                  {guild.is_member
                    ? <button className="guild-card__open" type="button" onClick={() => openGuild(guild)}>Öffnen <ArrowRight size={16} /></button>
                    : <button className="guild-card__join" type="button" onClick={() => handleJoin(guild)}><Users size={16} /> Beitreten</button>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
