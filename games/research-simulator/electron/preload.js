// 只向网页暴露几个桌面功能，网页本身拿不到 Node 权限
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  setCompact: on => ipcRenderer.invoke('set-compact', !!on),
  setOnTop: on => ipcRenderer.invoke('set-on-top', !!on),
  setZoom: z => ipcRenderer.invoke('set-zoom', Number(z) || 1),
  attention: () => ipcRenderer.send('attention'),
});
