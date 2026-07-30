import { Hash, LoaderCircle, Search, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';

function authorName(author) {
  return author?.display_name || author?.username || 'Unbekannt';
}

function resultTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
}

function startOfDay(value) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : '';
}

function endOfDay(value) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : '';
}

export default function MessageSearch({ guildData, members, onClose, onNavigate, onToast }) {
  const [query, setQuery] = useState('');
  const [channelId, setChannelId] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const result = await api.searchMessages(guildData.guild.id, {
        q: query.trim(),
        channelId: channelId || undefined,
        authorId: authorId || undefined,
        dateFrom: startOfDay(dateFrom) || undefined,
        dateTo: endOfDay(dateTo) || undefined
      });
      setResults(result.results);
      setSearched(true);
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="engagement-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="engagement-panel engagement-panel--search" role="dialog" aria-modal="true" aria-labelledby="search-title">
        <header>
          <div><Search size={20} /><h2 id="search-title">Nachrichten durchsuchen</h2></div>
          <button type="button" aria-label="Suche schließen" onClick={onClose}><X size={21} /></button>
        </header>
        <form className="message-search-form" onSubmit={submit}>
          <label className="message-search-query">
            <Search size={18} />
            <input
              value={query}
              autoFocus
              minLength={2}
              maxLength={100}
              placeholder={`In ${guildData.guild.name} suchen`}
              aria-label="Suchbegriff"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" disabled={query.trim().length < 2 || loading}>
              {loading ? <LoaderCircle className="spin" size={17} /> : 'Suchen'}
            </button>
          </label>
          <div className="message-search-filters">
            <label>
              <span>Channel</span>
              <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
                <option value="">Alle Channels</option>
                {guildData.channels.filter((channel) => channel.type === 'text').map((channel) => (
                  <option value={channel.id} key={channel.id}>#{channel.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Mitglied</span>
              <select value={authorId} onChange={(event) => setAuthorId(event.target.value)}>
                <option value="">Alle Mitglieder</option>
                {members.map((member) => (
                  <option value={member.user_id} key={member.user_id}>
                    {member.display_name || member.username}
                  </option>
                ))}
              </select>
            </label>
            <label><span>Von</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label><span>Bis</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          </div>
        </form>
        <div className="search-results">
          {loading && <div className="engagement-loading"><LoaderCircle className="spin" size={22} />Suche läuft …</div>}
          {!loading && !searched && (
            <div className="engagement-empty"><Search size={34} /><strong>Finde jede Nachricht wieder</strong><span>Filtere nach Channel, Mitglied oder Zeitraum.</span></div>
          )}
          {!loading && searched && results.length === 0 && (
            <div className="engagement-empty"><Search size={34} /><strong>Keine Treffer</strong><span>Versuche einen anderen Suchbegriff oder weniger Filter.</span></div>
          )}
          {!loading && results.map((result) => (
            <button className="search-result" type="button" key={result.id} onClick={() => onNavigate(result)}>
              <span className="search-result__meta">
                <strong>{authorName(result.author)}</strong>
                <span><Hash size={12} />{result.channel.name}</span>
                <time>{resultTime(result.created_at)}</time>
              </span>
              <span className="search-result__content">{result.content}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
