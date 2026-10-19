// 8-bit 风格的音效（WebAudio 现场合成，不用音频文件）。
// 界面：所有按钮点下去都有声音，按钮的种类不同声音不同（installUiSounds）。
// 比赛：出手、挥棒、碰到球、进手套、接球、传球……都由动画在那一刻触发（cueSound），声音跟着动作：
// 打得扎实是清脆的「咔」，软弱的是闷的「咚」，触击是轻轻的「嗒」；球越快，进手套越响。
import type { StageCue } from '../render/stage';
import type { FieldCue } from '../render/field';

export type Sfx = 'click' | 'tick' | 'tab' | 'ok' | 'back' | 'aim' | 'cheer' | 'siren' | 'fanfare' | 'win' | 'lose' | 'event' | 'hr' | 'out' | 'ibb' | 'pickoff';

let ac: AudioContext | null = null;
let out: AudioNode | null = null;
let noiseBuf: AudioBuffer | null = null;
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
    if (!ac) {
      const a = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // 好几个声音叠在一起时不爆音
      const comp = a.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      const g = a.createGain();
      g.gain.value = 0.9;
      comp.connect(g).connect(a.destination);
      // 一秒白噪声：噪声类的声音都从这里截一段
      const buf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ac = a;
      out = comp;
      noiseBuf = buf;
    }
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

/** 测试用：页面上有 window.__pbSfxLog（数组）时，记下每个声音和时间 */
function log(n: string): void {
  const l = (window as unknown as { __pbSfxLog?: { n: string; t: number }[] }).__pbSfxLog;
  if (Array.isArray(l)) l.push({ n, t: performance.now() });
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.06, endFreq?: number): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out!);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** 一段滤过的噪声：f0 → f1 扫频，q 越大越尖；swell = 慢慢变大到最后（飞来的风声） */
function noise(a: AudioContext, start: number, dur: number, vol: number, f0: number, f1 = f0, q = 1, type: BiquadFilterType = 'bandpass', swell = false): void {
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, start + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, start);
  if (swell) {
    g.gain.exponentialRampToValueAtTime(vol, start + dur);
    g.gain.linearRampToValueAtTime(0.0001, start + dur + 0.04);
  } else {
    g.gain.linearRampToValueAtTime(vol, start + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  }
  src.connect(f).connect(g).connect(out!);
  src.start(start, Math.random() * 0.4, dur + 0.06);
}

/** 皮手套接住球的「啪」：越快越响、越脆 */
function pop(a: AudioContext, t: number, k: number): void {
  noise(a, t, 0.045, 0.16 + 0.3 * k, 1500, 700, 1.1);
  tone(a, 105 + 30 * k, t, 0.08, 'sine', 0.1 + 0.14 * k, 60);
}

export function sfx(name: Sfx): void {
  const a = ctx();
  if (!a) return;
  log(name);
  const t = a.currentTime + 0.005;
  switch (name) {
    case 'click':
      tone(a, 1320, t, 0.035, 'square', 0.03);
      noise(a, t, 0.012, 0.05, 3200, 3200, 0.7);
      break;
    case 'tick':
      tone(a, 1760, t, 0.025, 'triangle', 0.05);
      break;
    case 'tab':
      tone(a, 880, t, 0.03, 'square', 0.025);
      tone(a, 1175, t + 0.035, 0.035, 'square', 0.025);
      break;
    case 'ok':
      tone(a, 784, t, 0.045, 'square', 0.035);
      tone(a, 1175, t + 0.05, 0.07, 'square', 0.035);
      break;
    case 'back':
      tone(a, 784, t, 0.04, 'square', 0.03);
      tone(a, 523, t + 0.045, 0.06, 'square', 0.03);
      break;
    case 'aim':
      tone(a, 2093, t, 0.03, 'sine', 0.05);
      tone(a, 2637, t + 0.025, 0.04, 'sine', 0.035);
      break;
    case 'out':
      tone(a, 330, t, 0.08, 'square', 0.04);
      tone(a, 220, t + 0.08, 0.1, 'square', 0.04);
      break;
    case 'cheer':
      noise(a, t, 1.2, 0.08, 1100, 1300, 0.6);
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
      noise(a, t + 0.1, 1.6, 0.12, 1000, 1300, 0.5);
      break;
    case 'ibb':
      tone(a, 523, t, 0.08, 'triangle', 0.05);
      tone(a, 659, t + 0.09, 0.1, 'triangle', 0.05);
      break;
    case 'pickoff':
      noise(a, t, 0.08, 0.1, 1100, 2600, 1.1);
      pop(a, t + 0.22, 0.6);
      break;
  }
}

/** 动画到了某个时刻：配上和这个动作对应的声音 */
export function cueSound(c: StageCue | FieldCue): void {
  const a = ctx();
  if (!a) return;
  log(c.k === 'contact' ? `contact:${c.q}` : c.k === 'catch' ? `catch:${c.air ? 'air' : 'ground'}` : c.k);
  const t = a.currentTime + 0.003;
  switch (c.k) {
    case 'release': {
      // 甩臂的「咻」，踏步的一下；打击视角里球朝镜头飞来：风声越来越大，到本垒时最响
      const k = Math.min(1, Math.max(0, (c.kmh - 90) / 60));
      noise(a, t, 0.09, 0.12, 900, 3200, 1.2);
      tone(a, 92, t, 0.05, 'sine', 0.1, 60);
      if (c.toward && c.dur > 0.12) noise(a, t + 0.04, c.dur - 0.04, 0.03 + 0.04 * k, 500, 1800 + 900 * k, 0.9, 'bandpass', true);
      break;
    }
    case 'swing':
      // 挥棒的风声：从高到低扫过
      noise(a, t, 0.16, 0.2, 2400, 600, 1.4);
      break;
    case 'contact':
      if (c.q === 'hard') {
        // 打得又远又扎实：很脆的「咔！」，木头的回声，看台跟着「哦——」
        noise(a, t, 0.03, 0.55, 2500, 2500, 0.6, 'highpass');
        tone(a, 1450, t, 0.09, 'triangle', 0.16, 900);
        tone(a, 140, t, 0.07, 'sine', 0.2, 80);
        noise(a, t + 0.06, 1.0, 0.07, 900, 1400, 0.6);
      } else if (c.q === 'solid') {
        noise(a, t, 0.028, 0.4, 2000, 2000, 0.7, 'highpass');
        tone(a, 1150, t, 0.07, 'triangle', 0.12, 750);
        tone(a, 130, t, 0.06, 'sine', 0.14, 80);
      } else if (c.q === 'weak') {
        // 打到球棒的根部、前端：闷闷的「咚」
        noise(a, t, 0.035, 0.28, 900, 600, 1.5);
        tone(a, 520, t, 0.06, 'triangle', 0.1, 380);
      } else if (c.q === 'foul') {
        // 擦棒：细的「嗒」
        noise(a, t, 0.02, 0.3, 3000, 3000, 0.8, 'highpass');
        tone(a, 900, t, 0.045, 'triangle', 0.07, 600);
      } else {
        // 触击：轻轻碰一下
        noise(a, t, 0.03, 0.2, 700, 400, 1.2);
        tone(a, 330, t, 0.05, 'triangle', 0.08, 250);
      }
      break;
    case 'mitt':
      pop(a, t, Math.min(1, Math.max(0, (c.kmh - 90) / 60)));
      break;
    case 'hbp':
      noise(a, t, 0.08, 0.35, 320, 150, 0.9, 'lowpass');
      tone(a, 75, t, 0.12, 'sine', 0.25, 45);
      break;
    case 'catch':
      if (c.air) pop(a, t, 0.35);
      else {
        // 滚地球进手套：短的「嚓」
        noise(a, t, 0.03, 0.16, 800, 500, 1.2);
        tone(a, 100, t, 0.04, 'sine', 0.08, 60);
      }
      break;
    case 'land':
      // 球落在草皮上弹两下
      noise(a, t, 0.05, 0.2, 260, 180, 0.8, 'lowpass');
      noise(a, t + 0.17, 0.04, 0.1, 240, 180, 0.8, 'lowpass');
      break;
    case 'throw':
      noise(a, t, 0.08, 0.1, 1100, 2600, 1.1);
      break;
    case 'glove':
      pop(a, t, 0.55);
      break;
    case 'hr':
      sfx('hr');
      break;
  }
}

/** 界面上的按钮点下去的声音：主要按钮「确认」、关闭 / 取消「返回」、页签、开关和选项「嗒」，其余「咔」 */
function uiKind(el: Element): Sfx {
  const c = el.classList;
  if (c.contains('primary')) return 'ok';
  if (c.contains('x') || c.contains('close') || /关闭|取消/.test(el.getAttribute('aria-label') ?? '')) return 'back';
  if (el.closest('.bnav, .tabs, [role="tablist"]')) return 'tab';
  if (c.contains('chip') || c.contains('ptype') || c.contains('rcell') || c.contains('sp') || c.contains('seg') || el.tagName === 'INPUT') return 'tick';
  return 'click';
}

/** 所有按钮点下去都有声音（data-sfx="none" 的不出声，data-sfx="ok" 之类可以指定） */
export function installUiSounds(): void {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, a[href], [role="button"], select, summary, input[type="checkbox"], input[type="radio"]');
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      const k = el.getAttribute('data-sfx');
      if (k === 'none') return;
      sfx((k as Sfx | null) ?? uiKind(el));
    },
    true,
  );
}
