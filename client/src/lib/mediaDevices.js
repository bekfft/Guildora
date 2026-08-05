const AUDIO_ALIAS_PREFIX = /^(default|communications?|standard|kommunikations?(?:gerät)?)\s*-\s*/i;

function cleanLabel(label, fallback) {
  const value = String(label || '').trim();
  return value ? value.replace(AUDIO_ALIAS_PREFIX, '').trim() : fallback;
}

function aliasPriority(device) {
  const label = String(device.label || '').trim();
  if (!AUDIO_ALIAS_PREFIX.test(label)) return 3;
  if (/^(default|standard)\s*-/i.test(label)) return 2;
  return 1;
}

export function uniqueAudioDevices(devices, type = 'Audiogerät') {
  const preferred = new Map();

  devices.forEach((device, index) => {
    if (!device?.deviceId) return;
    const fallback = `${type} ${index + 1}`;
    const label = cleanLabel(device.label, fallback);
    const key = device.label
      ? `${device.kind}:${label.toLocaleLowerCase('de-DE')}`
      : `${device.kind}:${device.deviceId}`;
    const next = {
      id: device.deviceId,
      kind: device.kind,
      groupId: device.groupId || '',
      label,
      priority: aliasPriority(device)
    };
    const current = preferred.get(key);
    if (!current || next.priority > current.priority) preferred.set(key, next);
  });

  return [...preferred.values()].map(({ priority, ...device }) => device);
}

export function resolveAudioDeviceId(currentId, rawDevices, visibleDevices) {
  if (!currentId || currentId === 'default') return '';
  if (visibleDevices.some((device) => device.id === currentId)) return currentId;

  const current = rawDevices.find((device) => device.deviceId === currentId);
  if (!current?.label) return '';
  const normalized = cleanLabel(current.label, '').toLocaleLowerCase('de-DE');
  return visibleDevices.find(
    (device) => device.label.toLocaleLowerCase('de-DE') === normalized
  )?.id || '';
}

export function audioCaptureOptions(deviceId = '') {
  return {
    autoGainControl: false,
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
    sampleSize: { ideal: 16 },
    deviceId: { ideal: deviceId || 'default' }
  };
}
