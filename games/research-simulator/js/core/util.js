/* 通用工具：随机数、格式化、事件总线 */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const U = (RS.U = {});

  U.rand = () => Math.random();
  U.range = (a, b) => a + Math.random() * (b - a);
  U.int = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.normal = (mean = 0, sd = 1) => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  U.chance = p => Math.random() < p;
  U.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  U.shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  U.sample = (arr, n) => U.shuffle(arr).slice(0, n);
  U.weighted = (items, wf) => {
    let tot = 0;
    const ws = items.map(it => { const w = Math.max(0, wf(it) || 0); tot += w; return w; });
    if (tot <= 0) return null;
    let r = Math.random() * tot;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sigmoid = x => 1 / (1 + Math.exp(-x));
  U.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  U.avg = (arr, f) => (arr.length ? U.sum(arr, f) / arr.length : 0);
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.fmtInt = n => Math.round(n).toLocaleString('en-US');
  U.pct = p => Math.round(p * 100) + '%';
  U.round1 = v => Math.round(v * 10) / 10;
  U.signed = (v, digits) => (v >= 0 ? '+' : '') + (digits ? v.toFixed(digits) : Math.round(v));
  U.compact = n => {
    n = Math.round(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(0) + 'k';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  };
  // 将 0~1 的概率转成口语化描述
  U.probWord = p => (p >= 0.8 ? '很高' : p >= 0.6 ? '较高' : p >= 0.4 ? '中等' : p >= 0.2 ? '较低' : '很低');

  // 简单事件总线：模拟层通过它通知界面层（音效、场景特效、提示）
  const listeners = {};
  RS.bus = {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    emit(type, data) {
      (listeners[type] || []).forEach(fn => {
        try { fn(data); } catch (e) { console.error(e); }
      });
    },
  };
})();
