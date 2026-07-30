import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function resolveServerDataPath(override, fallbackName) {
  return override
    ? path.resolve(override)
    : path.join(serverRoot, 'data', fallbackName);
}
