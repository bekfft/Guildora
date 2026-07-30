import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encryptionKey() {
  const source = process.env.ACCOUNT_ENCRYPTION_SECRET
    || process.env.JWT_ACCESS_SECRET
    || (process.env.NODE_ENV === 'production' ? null : 'guildora-dev-account-encryption');
  if (!source) throw new Error('ACCOUNT_ENCRYPTION_SECRET oder JWT_ACCESS_SECRET muss gesetzt sein.');
  return crypto.createHash('sha256').update(source).digest();
}

export function generateTotpSecret() {
  let bits = '';
  for (const byte of crypto.randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map((chunk) => ALPHABET[Number.parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}

function decodeBase32(value) {
  let bits = '';
  for (const character of value.replace(/=+$/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Ungültiges TOTP-Secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) || []).map((byte) => Number.parseInt(byte, 2)));
}

function totpAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, '0');
}

export function verifyTotp(secret, code, now = Date.now()) {
  const current = Math.floor(now / 30_000);
  return [-1, 0, 1].some((offset) => {
    const expected = Buffer.from(totpAt(secret, current + offset));
    const actual = Buffer.from(String(code || ''));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value) {
  const [iv, tag, encrypted] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
