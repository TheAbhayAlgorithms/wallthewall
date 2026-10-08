// Web Audio API sound effects
let audioCtx = null;
let muted = localStorage.getItem('ember_muted') === 'true';

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone({ frequency, type = 'sine', duration = 0.1, volume = 0.3, attack = 0.005, decay = 0.05 }) {
  if (muted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.01);
  } catch {}
}

export const audio = {
  hit: () => playTone({ frequency: 440, type: 'square', duration: 0.08, volume: 0.2 }),
  wallBounce: () => playTone({ frequency: 220, type: 'triangle', duration: 0.06, volume: 0.15 }),
  score: () => {
    playTone({ frequency: 523, duration: 0.15, volume: 0.3 });
    setTimeout(() => playTone({ frequency: 659, duration: 0.15, volume: 0.3 }), 150);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone({ frequency: f, duration: 0.2, volume: 0.35, type: 'sine' }), i * 150);
    });
  },
  lose: () => {
    [392, 349, 294, 220].forEach((f, i) => {
      setTimeout(() => playTone({ frequency: f, duration: 0.25, volume: 0.25, type: 'sawtooth' }), i * 150);
    });
  },
  countdownTick: () => playTone({ frequency: 880, type: 'sine', duration: 0.12, volume: 0.25 }),
  countdownGo: () => {
    playTone({ frequency: 1047, type: 'sine', duration: 0.3, volume: 0.4 });
    setTimeout(() => playTone({ frequency: 1319, type: 'sine', duration: 0.3, volume: 0.4 }), 100);
  },
};

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('ember_muted', muted);
  return muted;
}
