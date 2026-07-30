import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { api } from '../lib/api.js';

const VoiceContext = createContext(null);
let liveKitModulePromise;

function liveKit() {
  if (!liveKitModulePromise) liveKitModulePromise = import('livekit-client');
  return liveKitModulePromise;
}

function storedValue(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function participantMetadata(participant) {
  try {
    return JSON.parse(participant.metadata || '{}');
  } catch {
    return {};
  }
}

function participantView(participant, local = false) {
  const metadata = participantMetadata(participant);
  return {
    id: participant.identity,
    name: participant.name || metadata.username || 'Unbekannt',
    username: metadata.username || null,
    avatar_url: metadata.avatarUrl || null,
    is_local: local,
    is_speaking: Boolean(participant.isSpeaking),
    is_muted: !participant.isMicrophoneEnabled,
    connection_quality: participant.connectionQuality || 'unknown'
  };
}

function sortParticipants(participants) {
  return participants.sort((left, right) => {
    if (left.is_local !== right.is_local) return left.is_local ? -1 : 1;
    return left.name.localeCompare(right.name, 'de');
  });
}

function roomParticipants(room) {
  if (!room || room.state === 'disconnected') return [];
  return sortParticipants([
    participantView(room.localParticipant, true),
    ...[...room.remoteParticipants.values()].map((participant) => participantView(participant))
  ]);
}

function deviceView(device, index, type) {
  return {
    id: device.deviceId,
    label: device.label || `${type} ${index + 1}`
  };
}

export function VoiceProvider({ children }) {
  const roomRef = useRef(null);
  const participantSyncTimerRef = useRef(null);
  const authoritativeParticipantIdsRef = useRef(null);
  const deafenedRef = useRef(storedValue('guildora:voice-deafened') === 'true');
  const mutedRef = useRef(storedValue('guildora:voice-muted') === 'true');
  const audioElementsRef = useRef(new Set());
  const audioContainerRef = useRef(null);
  const [channel, setChannel] = useState(null);
  const [connectionState, setConnectionState] = useState('idle');
  const [participants, setParticipants] = useState([]);
  const [muted, setMuted] = useState(mutedRef.current);
  const [deafened, setDeafened] = useState(deafenedRef.current);
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [inputDeviceId, setInputDeviceId] = useState(storedValue('guildora:voice-input'));
  const [outputDeviceId, setOutputDeviceId] = useState(storedValue('guildora:voice-output'));
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [lastError, setLastError] = useState('');

  const refreshParticipants = useCallback((room = roomRef.current) => {
    if (!room || room !== roomRef.current) return;
    const authoritativeIds = authoritativeParticipantIdsRef.current;
    const nextParticipants = roomParticipants(room);
    setParticipants(authoritativeIds
      ? nextParticipants.filter((participant) => authoritativeIds.has(participant.id))
      : nextParticipants);
  }, []);

  const clearParticipantSync = useCallback(() => {
    if (!participantSyncTimerRef.current) return;
    window.clearInterval(participantSyncTimerRef.current);
    participantSyncTimerRef.current = null;
  }, []);

  const syncParticipantsFromServer = useCallback(async (channelId, room = roomRef.current) => {
    if (!channelId || !room || room !== roomRef.current) return;
    try {
      const response = await api.voiceParticipants(channelId);
      if (room !== roomRef.current) return;
      authoritativeParticipantIdsRef.current = new Set(
        response.participants.map((participant) => participant.id)
      );
      const liveParticipants = new Map([
        [room.localParticipant.identity, room.localParticipant],
        ...[...room.remoteParticipants.values()].map((participant) => [participant.identity, participant])
      ]);
      setParticipants(sortParticipants(response.participants.map((participant) => {
        const liveParticipant = liveParticipants.get(participant.id);
        return liveParticipant ? {
          ...participant,
          is_speaking: Boolean(liveParticipant.isSpeaking),
          connection_quality: liveParticipant.connectionQuality || participant.connection_quality
        } : participant;
      })));
    } catch (error) {
      console.warn('Voice-Teilnehmer konnten nicht synchronisiert werden.', error);
      // LiveKit-Ereignisse halten die Liste auch bei einem kurzen API-Ausfall nutzbar.
    }
  }, []);

  const startParticipantSync = useCallback((channelId, room) => {
    clearParticipantSync();
    void syncParticipantsFromServer(channelId, room);
    participantSyncTimerRef.current = window.setInterval(() => {
      void syncParticipantsFromServer(channelId, room);
    }, 2500);
  }, [clearParticipantSync, syncParticipantsFromServer]);

  const refreshDevices = useCallback(async (requestPermissions = false) => {
    const { Room } = await liveKit();
    const [microphones, speakers] = await Promise.all([
      Room.getLocalDevices('audioinput', requestPermissions).catch(() => []),
      Room.getLocalDevices('audiooutput', false).catch(() => [])
    ]);
    const nextInputs = microphones.map((device, index) => deviceView(device, index, 'Mikrofon'));
    const nextOutputs = speakers.map((device, index) => deviceView(device, index, 'Lautsprecher'));
    setInputs(nextInputs);
    setOutputs(nextOutputs);
    setInputDeviceId((current) => (
      current && nextInputs.some((device) => device.id === current) ? current : nextInputs[0]?.id || ''
    ));
    setOutputDeviceId((current) => (
      current && nextOutputs.some((device) => device.id === current) ? current : nextOutputs[0]?.id || ''
    ));
  }, []);

  const clearAudioElements = useCallback(() => {
    for (const element of audioElementsRef.current) element.remove();
    audioElementsRef.current.clear();
  }, []);

  const leave = useCallback(async () => {
    clearParticipantSync();
    const room = roomRef.current;
    roomRef.current = null;
    authoritativeParticipantIdsRef.current = null;
    setChannel(null);
    setParticipants([]);
    setConnectionState('idle');
    setNeedsAudioStart(false);
    setLastError('');
    clearAudioElements();
    if (room) {
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
    }
  }, [clearParticipantSync, syncParticipantsFromServer]);

  const attachAudioTrack = useCallback((track) => {
    if (track.kind !== 'audio') return;
    const element = track.attach();
    element.autoplay = true;
    element.muted = deafenedRef.current;
    element.className = 'voice-remote-audio';
    audioElementsRef.current.add(element);
    audioContainerRef.current?.appendChild(element);
  }, []);

  const detachAudioTrack = useCallback((track) => {
    for (const element of track.detach()) {
      audioElementsRef.current.delete(element);
      element.remove();
    }
  }, []);

  const join = useCallback(async (nextChannel, guild) => {
    if (!nextChannel || nextChannel.type !== 'voice') return;
    if (roomRef.current && channel?.id === nextChannel.id) return;
    await leave();
    setConnectionState('connecting');
    setLastError('');
    setChannel({
      id: nextChannel.id,
      name: nextChannel.name,
      guild_id: guild.id,
      guild_name: guild.name
    });

    let credentials;
    try {
      credentials = await api.voiceToken(nextChannel.id);
    } catch (error) {
      setConnectionState('error');
      setLastError(error.message);
      throw error;
    }

    const { Room, RoomEvent } = await liveKit();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    roomRef.current = room;

    const update = () => {
      refreshParticipants(room);
      window.setTimeout(() => refreshParticipants(room), 0);
    };
    const upsertParticipant = (participant) => {
      if (!participant || room !== roomRef.current) return;
      const authoritativeIds = authoritativeParticipantIdsRef.current;
      if (authoritativeIds && !authoritativeIds.has(participant.identity)) return;
      setParticipants((current) => sortParticipants([
        ...current.filter((item) => item.id !== participant.identity),
        participantView(participant, participant === room.localParticipant)
      ]));
    };
    const removeParticipant = (participant) => {
      if (!participant || room !== roomRef.current) return;
      setParticipants((current) => current.filter((item) => item.id !== participant.identity));
    };
    const updateActiveSpeakers = (speakers) => {
      if (room !== roomRef.current) return;
      const speaking = new Set(speakers.map((participant) => participant.identity));
      setParticipants((current) => current.map((participant) => ({
        ...participant,
        is_speaking: speaking.has(participant.id)
      })));
    };
    room
      .on(RoomEvent.ParticipantConnected, upsertParticipant)
      .on(RoomEvent.ParticipantDisconnected, removeParticipant)
      .on(RoomEvent.ActiveSpeakersChanged, updateActiveSpeakers)
      .on(RoomEvent.TrackMuted, (_publication, participant) => upsertParticipant(participant))
      .on(RoomEvent.TrackUnmuted, (_publication, participant) => upsertParticipant(participant))
      .on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => upsertParticipant(participant))
      .on(RoomEvent.TrackSubscribed, (track) => {
        attachAudioTrack(track);
        update();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        detachAudioTrack(track);
        update();
      })
      .on(RoomEvent.MediaDevicesChanged, () => refreshDevices(false))
      .on(RoomEvent.MediaDevicesError, (error) => {
        setLastError(error?.message || 'Auf das Audiogerät konnte nicht zugegriffen werden.');
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room === roomRef.current) setNeedsAudioStart(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Reconnecting, () => room === roomRef.current && setConnectionState('reconnecting'))
      .on(RoomEvent.Reconnected, () => room === roomRef.current && setConnectionState('connected'))
      .on(RoomEvent.Disconnected, () => {
        if (room !== roomRef.current) return;
        clearParticipantSync();
        roomRef.current = null;
        authoritativeParticipantIdsRef.current = null;
        setConnectionState('error');
        setParticipants([]);
        setLastError('Die Voice-Verbindung wurde getrennt.');
        clearAudioElements();
      });

    try {
      await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
      if (inputDeviceId) {
        try {
          await room.switchActiveDevice('audioinput', inputDeviceId);
        } catch {
          localStorage.removeItem('guildora:voice-input');
          setInputDeviceId('');
        }
      }
      if (outputDeviceId) {
        try {
          await room.switchActiveDevice('audiooutput', outputDeviceId);
        } catch {
          localStorage.removeItem('guildora:voice-output');
          setOutputDeviceId('');
        }
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(!mutedRef.current && !deafenedRef.current);
      } catch {
        mutedRef.current = true;
        setMuted(true);
        localStorage.setItem('guildora:voice-muted', 'true');
        setLastError('Kein verwendbares Mikrofon gefunden. Du bist als Zuhörer verbunden.');
      }
      await refreshDevices(false);
      refreshParticipants(room);
      startParticipantSync(nextChannel.id, room);
      setConnectionState('connected');
      setNeedsAudioStart(!room.canPlaybackAudio);
    } catch (error) {
      if (room === roomRef.current) {
        roomRef.current = null;
        authoritativeParticipantIdsRef.current = null;
        setConnectionState('error');
        setParticipants([]);
        setLastError(error?.message || 'Die Voice-Verbindung konnte nicht aufgebaut werden.');
      }
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
      clearParticipantSync();
      clearAudioElements();
      throw error;
    }
  }, [
    attachAudioTrack,
    channel?.id,
    clearAudioElements,
    clearParticipantSync,
    detachAudioTrack,
    inputDeviceId,
    leave,
    outputDeviceId,
    refreshDevices,
    refreshParticipants,
    startParticipantSync
  ]);

  const toggleMuted = useCallback(async () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    localStorage.setItem('guildora:voice-muted', String(next));
    if (!next && deafenedRef.current) {
      deafenedRef.current = false;
      setDeafened(false);
      localStorage.setItem('guildora:voice-deafened', 'false');
      for (const element of audioElementsRef.current) element.muted = false;
    }
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
        refreshParticipants();
        await refreshDevices(false);
      } catch (error) {
        mutedRef.current = !next;
        setMuted(!next);
        localStorage.setItem('guildora:voice-muted', String(!next));
        throw error;
      }
    }
  }, [refreshDevices, refreshParticipants]);

  const toggleDeafened = useCallback(async () => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    localStorage.setItem('guildora:voice-deafened', String(next));
    for (const element of audioElementsRef.current) element.muted = next;
    if (next && !mutedRef.current) {
      mutedRef.current = true;
      setMuted(true);
      localStorage.setItem('guildora:voice-muted', 'true');
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      refreshParticipants();
    }
  }, [refreshParticipants]);

  const selectInputDevice = useCallback(async (deviceId) => {
    if (roomRef.current) await roomRef.current.switchActiveDevice('audioinput', deviceId, true);
    localStorage.setItem('guildora:voice-input', deviceId);
    setInputDeviceId(deviceId);
  }, []);

  const selectOutputDevice = useCallback(async (deviceId) => {
    if (roomRef.current) {
      const switched = await roomRef.current.switchActiveDevice('audiooutput', deviceId, true);
      if (!switched) throw new Error('Dieser Browser unterstützt keine Lautsprecherauswahl.');
    }
    localStorage.setItem('guildora:voice-output', deviceId);
    setOutputDeviceId(deviceId);
  }, []);

  const startAudio = useCallback(async () => {
    if (!roomRef.current) return;
    await roomRef.current.startAudio();
    setNeedsAudioStart(false);
  }, []);

  useEffect(() => {
    const syncParticipants = () => {
      if (document.visibilityState === 'visible' && channel?.id) {
        void syncParticipantsFromServer(channel.id, roomRef.current);
      }
    };

    window.addEventListener('focus', syncParticipants);
    document.addEventListener('visibilitychange', syncParticipants);
    return () => {
      window.removeEventListener('focus', syncParticipants);
      document.removeEventListener('visibilitychange', syncParticipants);
    };
  }, [channel?.id, syncParticipantsFromServer]);

  useEffect(() => () => {
    clearParticipantSync();
    const room = roomRef.current;
    roomRef.current = null;
    authoritativeParticipantIdsRef.current = null;
    room?.removeAllListeners();
    room?.disconnect();
    clearAudioElements();
  }, [clearAudioElements, clearParticipantSync]);

  const value = useMemo(() => ({
    channel,
    connectionState,
    participants,
    muted,
    deafened,
    inputs,
    outputs,
    inputDeviceId,
    outputDeviceId,
    needsAudioStart,
    lastError,
    join,
    leave,
    toggleMuted,
    toggleDeafened,
    refreshDevices,
    selectInputDevice,
    selectOutputDevice,
    startAudio
  }), [
    channel,
    connectionState,
    deafened,
    inputDeviceId,
    inputs,
    join,
    lastError,
    leave,
    muted,
    needsAudioStart,
    outputDeviceId,
    outputs,
    participants,
    refreshDevices,
    selectInputDevice,
    selectOutputDevice,
    startAudio,
    toggleDeafened,
    toggleMuted
  ]);

  return (
    <VoiceContext.Provider value={value}>
      {children}
      <div className="voice-audio-elements" ref={audioContainerRef} aria-hidden="true" />
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) throw new Error('useVoice muss innerhalb des VoiceProviders verwendet werden.');
  return context;
}
