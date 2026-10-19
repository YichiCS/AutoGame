/* AutoGame 游戏厅 · 游戏接入脚本
 *
 * 每个游戏的入口 HTML 里加一行（路径按入口文件所在目录写到仓库根目录的 hub/dock.js）：
 *   <script src="../../hub/dock.js" data-game="<游戏 id>" defer></script>
 *
 * 不在游戏画面上显示任何东西，只做两件事：
 *   1. 应答游戏厅的「哪些游戏在运行」询问，防止导入 / 清除存档时被游戏的自动保存覆盖。
 *   2. 提供 window.AutoGame，游戏在自己的菜单里放「返回游戏厅」「存档管理」时用：
 *        AutoGame.hubUrl     游戏厅首页
 *        AutoGame.savesUrl   游戏厅里这个游戏的存档管理
 *      脚本是 defer 加载的，游戏刚启动时可能还读不到；读不到（或者是单独打开的原仓库版本）就不显示这两个按钮。
 *      加载完会派发 window 上的 'autogame:ready' 事件。
 * 不依赖游戏的任何代码。
 */
(function () {
  'use strict';
  const script = document.currentScript;
  if (!script || window.__autogameDock) return;
  window.__autogameDock = true;

  const gameId = script.getAttribute('data-game') || '';
  const hubRoot = new URL('../', script.src); // .../hub/dock.js → 站点根目录

  // ---------- 应答「谁在运行」 ----------
  if (gameId && typeof BroadcastChannel !== 'undefined') {
    const bc = new BroadcastChannel('autogame');
    bc.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === 'ping') bc.postMessage({ type: 'pong', id: m.id, game: gameId });
    };
  }

  // 直接双击打开的本地文件没有游戏厅可回
  if (location.protocol === 'file:') return;

  window.AutoGame = Object.freeze({
    gameId,
    hubUrl: hubRoot.href,
    savesUrl: new URL(`#saves/${encodeURIComponent(gameId)}`, hubRoot).href,
  });
  // 游戏厅 v1.2.0 之前的悬浮标签记过它在每个游戏里的位置，已经用不上了
  try {
    localStorage.removeItem('autogame:dock');
  } catch {
    /* 隐私模式等 */
  }
  dispatchEvent(new Event('autogame:ready'));
})();
