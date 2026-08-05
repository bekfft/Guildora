const VERBS = Object.freeze({
  playing: 'Spielt',
  streaming: 'Streamt',
  listening: 'Hört',
  watching: 'Schaut',
  competing: 'Tritt an in'
});

export function activityVerb(type) {
  return VERBS[type] || 'Spielt';
}

export function activityHeadline(activity) {
  return activity ? `${activityVerb(activity.type)} ${activity.name}` : '';
}

export function activityElapsed(startedAt, now = Date.now()) {
  if (!startedAt || startedAt > now) return null;
  const minutes = Math.floor((now - startedAt) / 60_000);
  if (minutes < 1) return 'gerade gestartet';
  if (minutes < 60) return `seit ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `seit ${hours} Std.${rest ? ` ${rest} Min.` : ''}`;
}
