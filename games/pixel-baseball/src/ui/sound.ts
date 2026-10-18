// 8-bit 风格音效（WebAudio 合成）
type Sfx = 'click' | 'bat' | 'mitt' | 'cheer' | 'siren' | 'fanfare' | 'win' | 'lose' | 'event' | 'hr' | 'out';

let ac: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function soundEnabled(): boolean {
  return enabled;
}

function ctx(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.06, endFreq?: number): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.linearRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(a: AudioContext, start: number, dur: number, vol: number, hp = 1000, lp = 8000): void {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f1 = a.createBiquadFilter();
  f1.type = 'highpass';
  f1.frequency.value = hp;
  const f2 = a.createBiquadFilter();
  f2.type = 'lowpass';
  f2.frequency.value = lp;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f1).connect(f2).connect(g).connect(a.destination);
  src.start(start);
  src.stop(start + dur);
}

export function sfx(name: Sfx): void {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (name) {
    case 'click':
      tone(a, 880, t, 0.04, 'square', 0.03);
      break;
    case 'bat':
      noise(a, t, 0.08, 0.25, 1500, 9000);
      tone(a, 180, t, 0.06, 'triangle', 0.12);
      break;
    case 'mitt':
      tone(a, 110, t, 0.08, 'triangle', 0.12, 70);
      noise(a, t, 0.03, 0.08, 400, 2000);
      break;
    case 'out':
      tone(a, 330, t, 0.08, 'square', 0.04);
      tone(a, 220, t + 0.08, 0.1, 'square', 0.04);
      break;
    case 'cheer':
      noise(a, t, 1.2, 0.08, 600, 3500);
      break;
    case 'siren':
      tone(a, 420, t, 2.4, 'sine', 0.05, 820);
      tone(a, 820, t + 2.4, 1.2, 'sine', 0.05, 420);
      break;
    case 'fanfare':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.12, 0.18, 'square', 0.05));
      tone(a, 1047, t + 0.5, 0.5, 'square', 0.05);
      break;
    case 'win':
      [523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.1, 0.16, 'square', 0.05));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(a, f, t + i * 0.16, 0.22, 'triangle', 0.06));
      break;
    case 'event':
      tone(a, 660, t, 0.1, 'square', 0.04);
      tone(a, 990, t + 0.1, 0.14, 'square', 0.04);
      break;
    case 'hr':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, f, t + i * 0.07, 0.12, 'square', 0.05));
      noise(a, t + 0.2, 1.4, 0.1, 600, 3500);
      break;
  }
}
