/* 启动与主循环：模拟用 setInterval（后台也能跑），画面用 requestAnimationFrame */
(function () {
  'use strict';
  const RS = window.RS;
  const G = RS.G, Sim = RS.Sim, S = RS.Sys;
  const Main = (RS.Main = {});

  RS.settings = G.loadSettings();
  const SPEEDS = [1, 2, 4, 10];
  const MS_PER_DAY = 1500; // 1 倍速下，游戏里的一天 = 1.5 秒
  Main.SPEEDS = SPEEDS;
  Main.speedIdx = U(RS.settings.speedIdx);
  Main.paused = false;
  function U(v) { return Number.isInteger(v) && v >= 0 && v < SPEEDS.length ? v : 0; }

  let acc = 0;
  let lastPump = performance.now();
  let lastFrame = performance.now();
  let saveAcc = 0;

  Main.start = function (g, isNew) {
    RS.game = g;
    S.normalize(g);
    if (isNew) {
      if (g.phd) S.setupPhd(g);
      else S.setupNewGame(g);
    } else if (RS.settings.offline && g.savedAt && !Sim.blocked(g)) {
      const days = Math.min(120, Math.floor((Date.now() - g.savedAt) / MS_PER_DAY));
      if (days >= 2) {
        const n = Sim.catchUp(g, days);
        if (n > 0) setTimeout(() => RS.UI.toast(`你不在的时候，实验室又运转了 ${n} 天`, 'info'), 800);
      }
    }
    Main.paused = false;
    acc = 0;
    RS.Scene.setGame(g);
    RS.UI.setGame(g);
    G.save(g);
  };
  Main.stop = function () {
    RS.game = null;
    RS.Scene.setGame(null);
    RS.UI.setGame(null);
  };
  Main.setSpeed = function (i) {
    Main.speedIdx = U(i);
    Main.paused = false;
    RS.settings.speedIdx = Main.speedIdx;
    G.saveSettings(RS.settings);
    RS.UI.dirty();
  };
  Main.togglePause = function () {
    Main.paused = !Main.paused;
    RS.UI.dirty();
  };

  function pump() {
    const now = performance.now();
    let dt = now - lastPump;
    lastPump = now;
    if (dt > 120000) dt = 120000;
    const g = RS.game;
    if (!g) return;
    saveAcc += dt;
    if (saveAcc > 15000) { saveAcc = 0; G.save(g); }
    if (Main.paused || RS.UI.isBlocking() || Sim.blocked(g)) { acc = 0; return; }
    acc += dt * SPEEDS[Main.speedIdx];
    let n = 0;
    while (acc >= MS_PER_DAY && n < 400) {
      Sim.tick(g);
      acc -= MS_PER_DAY;
      n++;
      if (Sim.blocked(g)) { acc = 0; break; }
    }
    if (n) RS.UI.dirty();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    try {
      RS.Scene.update(dt);
      RS.Scene.draw();
      RS.UI.frame();
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    RS.UI.init();
    RS.Scene.init(document.getElementById('scene'));
    RS.UI.setGame(null);
    RS.UI.showStart(G.load());
    setInterval(pump, 100);
    requestAnimationFrame(frame);
  }

  window.addEventListener('beforeunload', () => { if (RS.game) G.save(RS.game); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && RS.game) G.save(RS.game); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
