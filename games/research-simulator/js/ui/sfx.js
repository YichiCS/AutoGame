/* 8-bit 音效：用 WebAudio 现场合成，不需要音频文件 */
(function () {
  'use strict';
  const RS = window.RS;
  const SFX = (RS.SFX = {});
  let ac = null;
  // 浏览器要求先有真实的用户操作才能播放声音
  let unlocked = false;
  const unlock = () => { unlocked = true; };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  function audio() {
    if (!unlocked) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, start, dur, type, vol) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator();
    const gn = a.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    const v = (vol || 0.15) * (RS.settings ? RS.settings.volume : 0.5);
    const t0 = a.currentTime + start;
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(v, t0 + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn);
    gn.connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  const SOUNDS = {
    click: () => tone(880, 0, 0.04, 'square', 0.06),
    popup: () => { tone(523, 0, 0.07, 'square', 0.1); tone(784, 0.07, 0.12, 'square', 0.1); },
    good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.14, 'square', 0.09)),
    bad: () => { tone(392, 0, 0.16, 'triangle', 0.16); tone(294, 0.16, 0.3, 'triangle', 0.16); },
    coin: () => { tone(988, 0, 0.06, 'square', 0.08); tone(1319, 0.06, 0.2, 'square', 0.08); },
    fanfare: () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.12, 'square', 0.09)),
    door: () => { tone(660, 0, 0.1, 'sine', 0.12); tone(880, 0.12, 0.2, 'sine', 0.12); },
  };
  SFX.play = function (name) {
    if (!RS.settings || !RS.settings.sound) return;
    try { (SOUNDS[name] || SOUNDS.click)(); } catch (e) { /* 浏览器不允许时静默 */ }
  };
})();
