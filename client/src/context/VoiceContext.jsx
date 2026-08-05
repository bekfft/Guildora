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
import {
  createImmediateVoiceAnalyser,
  playVoiceFeedback,
  primeVoiceFeedback,
  voiceActivityThreshold
} from '../lib/voiceFeedback.js';
import {
  audioCaptureOptions,
  resolveAudioDeviceId,
  uniqueAudioDevices
} from '../lib/mediaDevices.js';
import { useAuth } from './AuthContext.jsx';
import VoiceStage from '../app/VoiceStage.jsx';

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
    ,is_screen_sharing: [...participant.videoTrackPublications.values()].some((publication) => publication.source === 'screen_share' && !publication.isMuted)
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

export function VoiceProvider({ children }) {
  const { settings, saveSettings } = useAuth();
  const roomRef = useRef(null);
  const participantListenerCleanupRef = useRef(() => {});
  const participantSyncTimerRef = useRef(null);
  const authoritativeParticipantIdsRef = useRef(null);
  const fastSpeakingIdsRef = useRef(new Set());
  const speakingAnalyzersRef = useRef(new Map());
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
  const [inputDeviceId, setInputDeviceId] = useState(settings?.voice_input_device || storedValue('guildora:voice-input'));
  const [outputDeviceId, setOutputDeviceId] = useState(settings?.voice_output_device || storedValue('guildora:voice-output'));
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [lastError, setLastError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState({});
  const [videoStreams, setVideoStreams] = useState([]);

  const refreshParticipants = useCallback((room = roomRef.current) => {
    if (!room || room !== roomRef.current) return;
    const authoritativeIds = authoritativeParticipantIdsRef.current;
    const nextParticipants = roomParticipants(room);
    const visibleParticipants = authoritativeIds
      ? nextParticipants.filter((participant) => authoritativeIds.has(participant.id))
      : nextParticipants;
    setParticipants(visibleParticipants.map((participant) => ({
      ...participant,
      is_speaking: participant.is_speaking || fastSpeakingIdsRef.current.has(participant.id)
    })));
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
          is_speaking: Boolean(liveParticipant.isSpeaking)
            || fastSpeakingIdsRef.current.has(participant.id),
          connection_quality: liveParticipant.connectionQuality || participant.connection_quality
        } : {
          ...participant,
          is_speaking: Boolean(participant.is_speaking)
            || fastSpeakingIdsRef.current.has(participant.id)
        };
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
    }, 15000);
  }, [clearParticipantSync, syncParticipantsFromServer]);

  const refreshDevices = useCallback(async (requestPermissions = false) => {
    const { Room } = await liveKit();
    const [microphones, speakers] = await Promise.all([
      Room.getLocalDevices('audioinput', requestPermissions).catch(() => []),
      Room.getLocalDevices('audiooutput', false).catch(() => [])
    ]);
    const nextInputs = uniqueAudioDevices(microphones, 'Mikrofon');
    const nextOutputs = uniqueAudioDevices(speakers, 'Lautsprecher');
    setInputs(nextInputs);
    setOutputs(nextOutputs);
    setInputDeviceId((current) => resolveAudioDeviceId(current, microphones, nextInputs));
    setOutputDeviceId((current) => resolveAudioDeviceId(current, speakers, nextOutputs));
  }, []);

  const clearAudioElements = useCallback(() => {
    for (const element of audioElementsRef.current) element.remove();
    audioElementsRef.current.clear();
    setVideoStreams([]);
  }, []);

  const clearSpeakingAnalyzers = useCallback(() => {
    for (const analyzer of speakingAnalyzersRef.current.values()) {
      window.cancelAnimationFrame(analyzer.frame);
      if (analyzer.releaseTimer) window.clearTimeout(analyzer.releaseTimer);
      void analyzer.cleanup();
    }
    speakingAnalyzersRef.current.clear();
    fastSpeakingIdsRef.current.clear();
  }, []);

  const leave = useCallback(async ({ withSound = true } = {}) => {
    clearParticipantSync();
    participantListenerCleanupRef.current();
    participantListenerCleanupRef.current = () => {};
    const room = roomRef.current;
    const wasConnected = Boolean(room);
    roomRef.current = null;
    authoritativeParticipantIdsRef.current = null;
    clearSpeakingAnalyzers();
    setChannel(null);
    setParticipants([]);
    setConnectionState('idle');
    setNeedsAudioStart(false);
    setLastError('');
    setCameraEnabled(false);
    setScreenShareEnabled(false);
    clearAudioElements();
    if (room) {
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
    }
    if (withSound && wasConnected) void playVoiceFeedback('leave').catch(() => {});
  }, [clearAudioElements, clearParticipantSync, clearSpeakingAnalyzers]);

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
    void primeVoiceFeedback().catch(() => {});
    await leave({ withSound: false });
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

    const {
      AudioPresets,
      DefaultReconnectPolicy,
      ParticipantEvent,
      Room,
      RoomEvent
    } = await liveKit();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      reconnectPolicy: new DefaultReconnectPolicy([0, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000]),
      disconnectOnPageLeave: true,
      audioCaptureDefaults: audioCaptureOptions(inputDeviceId),
      publishDefaults: {
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: true,
        forceStereo: false
      },
      videoCaptureDefaults: {
        deviceId: settings?.voice_camera_device || undefined
      }
    });
    roomRef.current = room;

    const update = () => {
      refreshParticipants(room);
      window.setTimeout(() => refreshParticipants(room), 0);
    };
    const videoKey = (track, participant) => `${participant?.identity || 'unknown'}:${track.sid || track.mediaStreamTrack?.id || track.source}`;
    const registerVideoTrack = (track, participant) => {
      if (!track || track.kind !== 'video' || !participant) return;
      const stream = {
        key: videoKey(track, participant),
        track,
        participant_id: participant.identity,
        name: participantView(participant, participant === room.localParticipant).name,
        source: track.source || 'camera',
        is_local: participant === room.localParticipant
      };
      setVideoStreams((current) => [...current.filter((item) => item.key !== stream.key), stream]);
    };
    const unregisterVideoTrack = (track, participant) => {
      if (!track || track.kind !== 'video') return;
      const key = videoKey(track, participant);
      setVideoStreams((current) => current.filter((item) => item.key !== key));
    };
    const upsertParticipant = (participant) => {
      if (!participant || room !== roomRef.current) return;
      const authoritativeIds = authoritativeParticipantIdsRef.current;
      if (authoritativeIds && !authoritativeIds.has(participant.identity)) return;
      const view = participantView(participant, participant === room.localParticipant);
      setParticipants((current) => sortParticipants([
        ...current.filter((item) => item.id !== participant.identity),
        {
          ...view,
          is_speaking: view.is_speaking || fastSpeakingIdsRef.current.has(participant.identity)
        }
      ]));
    };
    const setFastSpeaking = (participant, isSpeaking) => {
      if (!participant || room !== roomRef.current) return;
      if (isSpeaking) fastSpeakingIdsRef.current.add(participant.identity);
      else fastSpeakingIdsRef.current.delete(participant.identity);
      setParticipants((current) => current.map((item) => (
        item.id === participant.identity
          ? { ...item, is_speaking: Boolean(isSpeaking || participant.isSpeaking) }
          : item
      )));
    };
    const stopSpeakingAnalyzer = (participantId, track = null) => {
      const analyzer = speakingAnalyzersRef.current.get(participantId);
      if (!analyzer || (track && analyzer.track !== track)) return;
      window.cancelAnimationFrame(analyzer.frame);
      if (analyzer.releaseTimer) window.clearTimeout(analyzer.releaseTimer);
      void analyzer.cleanup();
      speakingAnalyzersRef.current.delete(participantId);
      fastSpeakingIdsRef.current.delete(participantId);
    };
    const startSpeakingAnalyzer = (track, participant) => {
      if (
        !track
        || track.kind !== 'audio'
        || !participant
        || (track.source && track.source !== 'microphone')
      ) return;
      stopSpeakingAnalyzer(participant.identity);
      let analyzer;
      try {
        analyzer = createImmediateVoiceAnalyser(track);
      } catch {
        return;
      }
      const state = {
        cleanup: analyzer.cleanup,
        frame: 0,
        releaseTimer: null,
        speaking: false,
        track
      };
      const threshold = voiceActivityThreshold();
      let lastMeasurement = 0;
      const measure = (timestamp) => {
        if (
          room !== roomRef.current
          || speakingAnalyzersRef.current.get(participant.identity) !== state
        ) return;
        const measurementInterval = document.hidden ? 250 : 50;
        if (timestamp - lastMeasurement < measurementInterval) {
          state.frame = window.requestAnimationFrame(measure);
          return;
        }
        lastMeasurement = timestamp;
        const speakingNow = analyzer.calculateVolume() >= threshold;
        if (speakingNow) {
          if (state.releaseTimer) {
            window.clearTimeout(state.releaseTimer);
            state.releaseTimer = null;
          }
          if (!state.speaking) {
            state.speaking = true;
            setFastSpeaking(participant, true);
          }
        } else if (state.speaking && !state.releaseTimer) {
          state.releaseTimer = window.setTimeout(() => {
            state.releaseTimer = null;
            state.speaking = false;
            setFastSpeaking(participant, false);
          }, 140);
        }
        state.frame = window.requestAnimationFrame(measure);
      };
      speakingAnalyzersRef.current.set(participant.identity, state);
      state.frame = window.requestAnimationFrame(measure);
    };
    const removeParticipant = (participant) => {
      if (!participant || room !== roomRef.current) return;
      unbindParticipant(participant);
      stopSpeakingAnalyzer(participant.identity);
      authoritativeParticipantIdsRef.current?.delete(participant.identity);
      setParticipants((current) => current.filter((item) => item.id !== participant.identity));
      setVideoStreams((current) => current.filter((item) => item.participant_id !== participant.identity));
    };
    const speakingListeners = new Map();
    const bindParticipant = (participant) => {
      if (!participant || speakingListeners.has(participant.identity)) return;
      const onSpeakingChanged = (isSpeaking) => {
        if (room !== roomRef.current) return;
        const isFastSpeaking = fastSpeakingIdsRef.current.has(participant.identity);
        setParticipants((current) => current.map((item) => (
          item.id === participant.identity
            ? { ...item, is_speaking: Boolean(isSpeaking || isFastSpeaking) }
            : item
        )));
      };
      participant.on(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
      speakingListeners.set(participant.identity, { participant, onSpeakingChanged });
    };
    const unbindParticipant = (participant) => {
      const listener = participant && speakingListeners.get(participant.identity);
      if (!listener) return;
      listener.participant.off(ParticipantEvent.IsSpeakingChanged, listener.onSpeakingChanged);
      speakingListeners.delete(participant.identity);
    };
    const clearParticipantListeners = () => {
      for (const listener of speakingListeners.values()) {
        listener.participant.off(ParticipantEvent.IsSpeakingChanged, listener.onSpeakingChanged);
      }
      speakingListeners.clear();
    };
    participantListenerCleanupRef.current = clearParticipantListeners;
    room
      .on(RoomEvent.ParticipantConnected, (participant) => {
        authoritativeParticipantIdsRef.current?.add(participant.identity);
        bindParticipant(participant);
        upsertParticipant(participant);
      })
      .on(RoomEvent.ParticipantDisconnected, removeParticipant)
      .on(RoomEvent.TrackMuted, (_publication, participant) => upsertParticipant(participant))
      .on(RoomEvent.TrackUnmuted, (_publication, participant) => upsertParticipant(participant))
      .on(RoomEvent.LocalTrackPublished, (publication, participant) => {
        if (publication.track) startSpeakingAnalyzer(publication.track, participant);
        if (publication.track) registerVideoTrack(publication.track, participant);
        if (publication.source === 'camera') setCameraEnabled(true);
        if (publication.source === 'screen_share') setScreenShareEnabled(true);
        upsertParticipant(participant);
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
        if (publication.track && participant) {
          stopSpeakingAnalyzer(participant.identity, publication.track);
        }
        if (publication.track) unregisterVideoTrack(publication.track, participant);
        if (publication.source === 'camera') setCameraEnabled(false);
        if (publication.source === 'screen_share') setScreenShareEnabled(false);
        upsertParticipant(participant);
      })
      .on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => upsertParticipant(participant))
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === 'audio' && participant) {
          const stored = Number(storedValue(`guildora:voice-volume:${participant.identity}`, '100'));
          track.setVolume(Math.max(0, Math.min(200, stored)) / 100);
          setParticipantVolumes((current) => ({ ...current, [participant.identity]: stored }));
        }
        startSpeakingAnalyzer(track, participant);
        if (track.kind === 'video') registerVideoTrack(track, participant);
        else attachAudioTrack(track);
        update();
      })
      .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (participant) stopSpeakingAnalyzer(participant.identity, track);
        if (track.kind === 'video') unregisterVideoTrack(track, participant);
        else detachAudioTrack(track);
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
      .on(RoomEvent.Reconnected, () => {
        if (room !== roomRef.current) return;
        setConnectionState('connected');
        setLastError('');
        refreshParticipants(room);
      })
      .on(RoomEvent.Disconnected, () => {
        if (room !== roomRef.current) return;
        clearParticipantSync();
        clearParticipantListeners();
        participantListenerCleanupRef.current = () => {};
        roomRef.current = null;
        authoritativeParticipantIdsRef.current = null;
        clearSpeakingAnalyzers();
        setConnectionState('error');
        setParticipants([]);
        setLastError('Die Voice-Verbindung wurde getrennt.');
        clearAudioElements();
      });

    try {
      await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
      bindParticipant(room.localParticipant);
      for (const participant of room.remoteParticipants.values()) bindParticipant(participant);
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
        await room.localParticipant.setMicrophoneEnabled(
          !mutedRef.current && !deafenedRef.current
        );
      } catch {
        mutedRef.current = true;
        setMuted(true);
        localStorage.setItem('guildora:voice-muted', 'true');
        setLastError('Kein verwendbares Mikrofon gefunden. Du bist als Zuhörer verbunden.');
      }
      for (const publication of room.localParticipant.audioTrackPublications.values()) {
        if (publication.track) startSpeakingAnalyzer(publication.track, room.localParticipant);
      }
      await refreshDevices(false);
      refreshParticipants(room);
      startParticipantSync(nextChannel.id, room);
      setConnectionState('connected');
      setNeedsAudioStart(!room.canPlaybackAudio);
      void playVoiceFeedback('join').catch(() => {});
    } catch (error) {
      if (room === roomRef.current) {
        roomRef.current = null;
        authoritativeParticipantIdsRef.current = null;
        setConnectionState('error');
        setParticipants([]);
        setLastError(error?.message || 'Die Voice-Verbindung konnte nicht aufgebaut werden.');
      }
      room.removeAllListeners();
      clearParticipantListeners();
      participantListenerCleanupRef.current = () => {};
      await room.disconnect().catch(() => {});
      clearParticipantSync();
      clearSpeakingAnalyzers();
      clearAudioElements();
      throw error;
    }
  }, [
    attachAudioTrack,
    channel?.id,
    clearAudioElements,
    clearParticipantSync,
    clearSpeakingAnalyzers,
    detachAudioTrack,
    inputDeviceId,
    leave,
    outputDeviceId,
    refreshDevices,
    refreshParticipants,
    startParticipantSync,
    settings
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
    const selected = deviceId || '';
    if (roomRef.current) {
      await roomRef.current.switchActiveDevice('audioinput', selected || 'default', true);
    }
    if (selected) localStorage.setItem('guildora:voice-input', selected);
    else localStorage.removeItem('guildora:voice-input');
    setInputDeviceId(selected);
    await saveSettings({ voice_input_device: selected || null });
  }, [saveSettings]);

  const selectOutputDevice = useCallback(async (deviceId) => {
    const selected = deviceId || '';
    if (roomRef.current) {
      const switched = await roomRef.current.switchActiveDevice('audiooutput', selected || 'default', true);
      if (!switched) throw new Error('Dieser Browser unterstützt keine Lautsprecherauswahl.');
    }
    if (selected) localStorage.setItem('guildora:voice-output', selected);
    else localStorage.removeItem('guildora:voice-output');
    setOutputDeviceId(selected);
    await saveSettings({ voice_output_device: selected || null });
  }, [saveSettings]);

  const startAudio = useCallback(async () => {
    if (!roomRef.current) return;
    await roomRef.current.startAudio();
    setNeedsAudioStart(false);
  }, []);

  const setParticipantVolume = useCallback((participantId, value) => {
    const normalized = Math.max(0, Math.min(200, Number(value)));
    setParticipantVolumes((current) => ({ ...current, [participantId]: normalized }));
    localStorage.setItem(`guildora:voice-volume:${participantId}`, String(normalized));
    const participant = roomRef.current?.remoteParticipants.get(participantId);
    for (const publication of participant?.audioTrackPublications?.values?.() || []) {
      publication.track?.setVolume(normalized / 100);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!roomRef.current) return;
    const next = !cameraEnabled;
    await roomRef.current.localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;
    const next = !screenShareEnabled;
    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(next, { audio: true });
      setScreenShareEnabled(next);
    } catch (error) {
      setScreenShareEnabled(false);
      if (error?.name === 'NotAllowedError') throw new Error('Die Bildschirmfreigabe wurde abgebrochen oder nicht erlaubt.');
      throw error;
    }
  }, [screenShareEnabled]);

  useEffect(() => {
    if (!settings) return;
    if (settings.voice_input_device !== undefined) setInputDeviceId(settings.voice_input_device || '');
    if (settings.voice_output_device !== undefined) setOutputDeviceId(settings.voice_output_device || '');
  }, [settings?.voice_input_device, settings?.voice_output_device]);

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
    participantListenerCleanupRef.current();
    participantListenerCleanupRef.current = () => {};
    const room = roomRef.current;
    roomRef.current = null;
    authoritativeParticipantIdsRef.current = null;
    room?.removeAllListeners();
    room?.disconnect();
    clearSpeakingAnalyzers();
    clearAudioElements();
  }, [clearAudioElements, clearParticipantSync, clearSpeakingAnalyzers]);

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
    cameraEnabled,
    screenShareEnabled,
    videoStreams,
    participantVolumes,
    needsAudioStart,
    lastError,
    join,
    leave,
    toggleMuted,
    toggleDeafened,
    refreshDevices,
    selectInputDevice,
    selectOutputDevice,
    startAudio,
    setParticipantVolume,
    toggleCamera,
    toggleScreenShare
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
    participantVolumes,
    refreshDevices,
    selectInputDevice,
    selectOutputDevice,
    startAudio,
    cameraEnabled,
    screenShareEnabled,
    videoStreams,
    setParticipantVolume,
    toggleCamera,
    toggleScreenShare,
    toggleDeafened,
    toggleMuted
  ]);

  return (
    <VoiceContext.Provider value={value}>
      {children}
      <div className="voice-audio-elements" ref={audioContainerRef} aria-hidden="true" />
      <VoiceStage voice={value} />
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) throw new Error('useVoice muss innerhalb des VoiceProviders verwendet werden.');
  return context;
}
