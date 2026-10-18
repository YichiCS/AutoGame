/* AutoGame 游戏厅 · 游戏内悬浮标签
 *
 * 每个游戏的入口 HTML 里加一行（路径按入口文件所在目录写到仓库根目录的 hub/dock.js）：
 *   <script src="../../hub/dock.js" data-game="<游戏 id>" defer></script>
 *
 * 作用：
 *   1. 屏幕左边缘一个小标签：返回游戏厅、跳到存档中心。可以上下拖动，位置按游戏分别记住。
 *   2. 应答游戏厅的「哪些游戏在运行」询问，防止导入 / 清除存档时被游戏的自动保存覆盖。
 * 不依赖游戏的任何代码，样式放在 Shadow DOM 里，和游戏互不影响。
 */
(function () {
  'use strict';
  const script = document.currentScript;
  if (!script || window.__autogameDock) return;
  window.__autogameDock = true;

  const gameId = script.getAttribute('data-game') || '';
  const hubRoot = new URL('../', script.src); // .../hub/dock.js → 站点根目录
  const STORE_KEY = 'autogame:dock';
  const TAB_H = 44;

  // ---------- 应答「谁在运行」 ----------
  if (gameId && typeof BroadcastChannel !== 'undefined') {
    const bc = new BroadcastChannel('autogame');
    bc.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === 'ping') bc.postMessage({ type: 'pong', id: m.id, game: gameId });
    };
  }

  // 直接双击打开的本地文件没有游戏厅可回，不显示标签
  if (location.protocol === 'file:') return;

  const ICON =
    '<svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">' +
    '<rect x="0" y="0" width="3" height="3" fill="#ffcd75"/><rect x="5" y="0" width="3" height="3" fill="#73eff7"/>' +
    '<rect x="0" y="5" width="3" height="3" fill="#a7f070"/><rect x="5" y="5" width="3" height="3" fill="#ef7d57"/></svg>';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap { position: relative; font: 12px/16px 'Fusion Pixel', 'FusionPixel', 'Microsoft YaHei', 'PingFang SC', sans-serif; color: #f4f4f4; -webkit-font-smoothing: none; }
    .tab {
      display: flex; align-items: center; justify-content: center;
      width: 20px; height: ${TAB_H}px; margin: 0; padding: 0 2px 0 0; border: 0;
      background: #262b44; cursor: pointer; opacity: .6; touch-action: none;
      box-shadow: inset -2px 0 0 #566c86, inset 0 2px 0 #566c86, inset 0 -2px 0 #566c86;
      clip-path: polygon(0 0, calc(100% - 2px) 0, calc(100% - 2px) 2px, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) calc(100% - 2px), calc(100% - 2px) 100%, 0 100%);
      transition: opacity .15s, width .15s;
    }
    .tab:hover, .tab:focus-visible, .tab[aria-expanded="true"], .tab.drag { opacity: 1; width: 24px; }
    .tab:focus-visible { outline: none; box-shadow: inset -2px 0 0 #73eff7, inset 0 2px 0 #73eff7, inset 0 -2px 0 #73eff7; }
    .tab.drag { cursor: grabbing; }
    .menu {
      position: absolute; left: 30px; top: 0; width: 184px; padding: 10px;
      background: #1a1c2c; border: 2px solid #566c86; box-shadow: 4px 4px 0 rgba(11, 12, 20, .75);
    }
    .menu[hidden] { display: none; }
    .hd { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
    .logo { color: #ffcd75; letter-spacing: 1px; }
    .game { color: #94b0c2; }
    .item, .confirm button {
      display: block; width: 100%; margin: 0 0 6px; padding: 5px 8px; border: 0;
      font: inherit; text-align: left; text-decoration: none; color: #f4f4f4; background: #333c57; cursor: pointer;
      box-shadow: inset -2px -2px 0 rgba(0,0,0,.35), inset 2px 2px 0 rgba(255,255,255,.15);
    }
    .item:hover, .confirm button:hover { background: #3b5dc9; }
    .item:focus-visible, .confirm button:focus-visible { outline: 2px solid #73eff7; outline-offset: 1px; }
    .confirm { margin-top: 2px; }
    .confirm[hidden] { display: none; }
    .confirm p { margin: 0 0 8px; color: #ffcd75; }
    .confirm .yes { background: #b13e53; }
    .tip { margin-top: 2px; color: #6b7a99; }
    @media print { .wrap { display: none; } }
    @media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
  `;

  function boot() {
    const host = document.createElement('autogame-dock');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;visibility:hidden;';
    const root = host.attachShadow({ mode: 'open' });
    const hubURL = hubRoot.href;
    const savesURL = new URL(`#saves/${encodeURIComponent(gameId)}`, hubRoot).href;
    root.innerHTML = `<style>${CSS}</style>
      <div class="wrap">
        <button class="tab" type="button" aria-label="AutoGame 游戏厅" aria-haspopup="true" aria-expanded="false" title="AutoGame 游戏厅（可上下拖动）">${ICON}</button>
        <div class="menu" role="group" aria-label="AutoGame 游戏厅" hidden>
          <div class="hd"><span class="logo">AUTOGAME 游戏厅</span><span class="game"></span></div>
          <a class="item" data-go href="${hubURL}">◀ 返回游戏厅</a>
          <a class="item" data-go href="${savesURL}">■ 存档管理</a>
          <div class="confirm" hidden><p></p><button class="yes" type="button">仍然离开</button><button class="no" type="button">留在游戏里</button></div>
          <div class="tip">拖动标签可以上下移动</div>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(host);

    const tab = root.querySelector('.tab');
    const menu = root.querySelector('.menu');
    const confirmBox = root.querySelector('.confirm');
    let meta = null;
    let pendingHref = '';

    // ---------- 位置（0 = 顶，1 = 底），按游戏记住 ----------
    const loadAll = () => {
      try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      } catch {
        return {};
      }
    };
    const saved = loadAll()[gameId];
    let y = typeof saved === 'number' ? saved : 0.5;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const place = () => {
      host.style.top = `${Math.round(y * Math.max(0, innerHeight - TAB_H))}px`;
      if (!menu.hidden) placeMenu();
    };
    const persist = () => {
      try {
        const all = loadAll();
        all[gameId] = Math.round(y * 1000) / 1000;
        localStorage.setItem(STORE_KEY, JSON.stringify(all));
      } catch {
        /* ignore */
      }
    };
    const placeMenu = () => {
      const top = host.getBoundingClientRect().top;
      const h = menu.offsetHeight;
      const want = (TAB_H - h) / 2;
      const min = 8 - top;
      const max = innerHeight - 8 - h - top;
      menu.style.top = `${Math.round(Math.max(min, Math.min(max, want)))}px`;
    };
    const show = () => {
      host.style.visibility = 'visible';
    };

    // ---------- 菜单 ----------
    const open = () => {
      menu.hidden = false;
      confirmBox.hidden = true;
      tab.setAttribute('aria-expanded', 'true');
      placeMenu();
    };
    const close = () => {
      menu.hidden = true;
      tab.setAttribute('aria-expanded', 'false');
    };
    const toggle = () => (menu.hidden ? open() : close());

    // 拖动和点击：移动超过 5px 算拖动
    let drag = null;
    let suppressClick = false;
    tab.addEventListener('mousedown', (e) => e.preventDefault()); // 不抢焦点：游戏的空格等快捷键照常可用
    tab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, y0: e.clientY, top0: host.getBoundingClientRect().top, moved: false };
      tab.setPointerCapture(e.pointerId);
    });
    tab.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) < 5) return;
      drag.moved = true;
      tab.classList.add('drag');
      y = clamp((drag.top0 + dy) / Math.max(1, innerHeight - TAB_H));
      place();
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        persist();
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
      }
      tab.classList.remove('drag');
      drag = null;
    };
    tab.addEventListener('pointerup', endDrag);
    tab.addEventListener('pointercancel', endDrag);
    tab.addEventListener('click', () => {
      if (!suppressClick) toggle();
    });
    // 键盘：不让按键漏给游戏（比如空格会让游戏暂停）
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        close();
        tab.focus();
      }
      e.stopPropagation();
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!menu.hidden && !e.composedPath().includes(host)) close();
      },
      true,
    );

    // 离开前确认（game.json 里 dock.leaveConfirm 有内容的游戏，比如只在特定时刻自动存档的）
    root.querySelectorAll('[data-go]').forEach((a) =>
      a.addEventListener('click', (e) => {
        const text = meta && meta.dock && meta.dock.leaveConfirm;
        if (!text) return;
        e.preventDefault();
        pendingHref = a.href;
        confirmBox.querySelector('p').textContent = text;
        confirmBox.hidden = false;
        placeMenu();
        confirmBox.querySelector('.no').focus();
      }),
    );
    confirmBox.querySelector('.yes').addEventListener('click', () => {
      if (pendingHref) location.href = pendingHref;
    });
    confirmBox.querySelector('.no').addEventListener('click', () => {
      confirmBox.hidden = true;
      placeMenu();
    });

    addEventListener('resize', place);
    place();

    // 读游戏信息：名字、版本、默认位置、离开确认
    const timer = setTimeout(show, 1000);
    fetch(new URL(`games/${encodeURIComponent(gameId)}/game.json`, hubRoot), { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        meta = m;
        root.querySelector('.game').textContent = `${m.name || gameId}${m.version ? ` v${m.version}` : ''}`;
        if (typeof saved !== 'number' && m.dock && typeof m.dock.y === 'number') {
          y = clamp(m.dock.y);
          place();
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        show();
      });
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
