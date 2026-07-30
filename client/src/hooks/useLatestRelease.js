import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function formatMegabytes(bytes) {
  if (!bytes) return '–';
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export default function useLatestRelease() {
  const [state, setState] = useState({ loading: true, release: null, error: null });
  useEffect(() => {
    let active = true;
    api.latestRelease()
      .then((release) => active && setState({ loading: false, release, error: null }))
      .catch((error) => active && setState({ loading: false, release: null, error }));
    return () => { active = false; };
  }, []);
  return state;
}
