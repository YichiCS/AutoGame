// 由 esbuild 处理的资源模块
declare module '*.css';
declare module '*.woff2' {
  const url: string;
  export default url;
}

/** AutoGame 游戏厅的接入脚本（hub/dock.js）提供的地址；单独打开、或者双击本地文件时没有 */
interface AutoGameHub {
  readonly gameId: string;
  /** 游戏厅首页 */
  readonly hubUrl: string;
  /** 游戏厅里这个游戏的存档管理 */
  readonly savesUrl: string;
}

interface Window {
  AutoGame?: AutoGameHub;
}
