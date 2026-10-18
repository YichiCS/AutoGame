// 桌面版外壳：npm install && npm start
const { app, BrowserWindow, ipcMain, screen, Menu, shell } = require('electron');
const path = require('path');

let win = null;
let normalBounds = null;
let onTopPref = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 480,
    minHeight: 300,
    backgroundColor: '#12132a',
    title: '科研模拟器',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 最小化或被遮挡时游戏也要继续跑
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('focus', () => win.flashFrame(false));
  win.on('closed', () => { win = null; });
}

// 迷你模式：缩到屏幕右下角并置顶，适合挂机
ipcMain.handle('set-compact', (e, on) => {
  if (!win) return;
  if (on) {
    normalBounds = win.getBounds();
    const area = screen.getDisplayMatching(normalBounds).workArea;
    // 画面 480x240 放大 1.5 倍，再加上顶栏的高度
    const w = Math.min(740, area.width - 32);
    const h = Math.round((w - 20) / 2) + 90;
    win.setAlwaysOnTop(true, 'floating');
    win.setBounds({ x: area.x + area.width - w - 16, y: area.y + area.height - h - 16, width: w, height: h });
  } else {
    win.setAlwaysOnTop(onTopPref);
    if (normalBounds) win.setBounds(normalBounds);
  }
});
ipcMain.handle('set-on-top', (e, on) => {
  onTopPref = !!on;
  if (win) win.setAlwaysOnTop(onTopPref);
});
ipcMain.handle('set-zoom', (e, z) => {
  if (win) win.webContents.setZoomFactor(Math.min(3, Math.max(0.5, Number(z) || 1)));
});
// 需要玩家做决定、而窗口不在前台时，任务栏图标闪烁
ipcMain.on('attention', () => {
  if (win && !win.isFocused()) win.flashFrame(true);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
