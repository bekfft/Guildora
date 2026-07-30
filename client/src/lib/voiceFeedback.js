let feedbackAudioContext = null;

function getAudioContext() {
  if (feedbackAudioContext) return feedbackAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  feedbackAudioContext = new AudioContextClass();
  return feedbackAudioContext;
}

export async function primeVoiceFeedback() {
  const context = getAudioContext();
  if (context?.state === 'suspended') await context.resume();
}

export async function playVoiceFeedback(kind) {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') await context.resume();

  const frequencies = kind === 'leave' ? [523.25, 392] : [392, 523.25];
  const startAt = context.currentTime + 0.01;

  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + (index * 0.085);
    const noteEnd = noteStart + 0.11;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.01);
  });
}

export function createImmediateVoiceAnalyser(track) {
  const context = getAudioContext();
  const mediaStreamTrack = track?.mediaStreamTrack;
  if (!context || !mediaStreamTrack) throw new Error('Audiotrack kann nicht analysiert werden.');

  const source = context.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.12;
  analyser.minDecibels = -70;
  analyser.maxDecibels = -20;
  source.connect(analyser);

  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  return {
    calculateVolume() {
      analyser.getByteFrequencyData(frequencies);
      let energy = 0;
      for (const value of frequencies) energy += (value / 255) ** 2;
      return Math.sqrt(energy / frequencies.length);
    },
    cleanup() {
      source.disconnect();
      analyser.disconnect();
    }
  };
}

export function voiceActivityThreshold(sensitivity = 50) {
  const normalized = Math.max(0, Math.min(100, Number(sensitivity))) / 100;
  return 0.03 - (normalized * 0.022);
}
