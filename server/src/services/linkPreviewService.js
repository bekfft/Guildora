import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { db } from '../db/index.js';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const MAX_HTML_BYTES = 512 * 1024;

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && [0, 2].includes(c)) || b === 168))
      || (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return privateAddress(value.slice(7));
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd')
    || /^fe[89ab]/.test(value) || value.startsWith('ff') || value.startsWith('2001:db8:');
}

async function assertPublicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsupported url');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) throw new Error('local url');
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error('private url');
  return url;
}

function decode(value = '') {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ').trim();
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  return decode(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || '');
}

async function fetchHtml(initial) {
  let current = await assertPublicUrl(initial);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Guildora-LinkPreview/1.0', Accept: 'text/html,application/xhtml+xml' }
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = await assertPublicUrl(new URL(response.headers.get('location'), current).href);
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
    }
    await reader.cancel().catch(() => {});
    return { html: new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).subarray(0, MAX_HTML_BYTES)), url: current };
  }
  return null;
}

async function createPreview(messageId, content, directMessage = false) {
  const matched = content.match(URL_PATTERN)?.[0]?.replace(/[),.!?]+$/, '');
  if (!matched) return null;
  try {
    const result = await fetchHtml(matched);
    if (!result) return null;
    const titleMatch = result.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const preview = {
      id: crypto.randomUUID(),
      url: result.url.href,
      site_name: (meta(result.html, 'og:site_name') || result.url.hostname.replace(/^www\./, '')).slice(0, 120),
      title: (meta(result.html, 'og:title') || meta(result.html, 'twitter:title') || decode(titleMatch)).slice(0, 240),
      description: (meta(result.html, 'og:description') || meta(result.html, 'description') || meta(result.html, 'twitter:description')).slice(0, 500)
    };
    if (!preview.title && !preview.description) return null;
    const table = directMessage ? 'dm_message_link_previews' : 'message_link_previews';
    const ownerColumn = directMessage ? 'dm_message_id' : 'message_id';
    await db.run(
      `INSERT INTO ${table} (id, ${ownerColumn}, url, site_name, title, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [preview.id, messageId, preview.url, preview.site_name, preview.title, preview.description]
    );
    return preview;
  } catch {
    return null;
  }
}

export function createLinkPreview(messageId, content) {
  return createPreview(messageId, content, false);
}

export function createDmLinkPreview(messageId, content) {
  return createPreview(messageId, content, true);
}
