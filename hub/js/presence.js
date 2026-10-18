// 问一圈：哪些游戏正开在别的标签页里？游戏页面里的悬浮标签（hub/dock.js）会应答。
// 导入 / 清除存档前要确认游戏没在运行，否则游戏的自动保存会把刚写进去的存档覆盖掉。
export const CHANNEL = 'autogame';

export function whoIsRunning(timeout = 300) {
  return new Promise((resolve) => {
    if (typeof BroadcastChannel === 'undefined') return resolve(new Set());
    const ch = new BroadcastChannel(CHANNEL);
    const id = Math.random().toString(36).slice(2);
    const found = new Set();
    ch.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === 'pong' && m.id === id && m.game) found.add(m.game);
    };
    ch.postMessage({ type: 'ping', id });
    setTimeout(() => {
      ch.close();
      resolve(found);
    }, timeout);
  });
}
