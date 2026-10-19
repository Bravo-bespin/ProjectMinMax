import { app, BrowserWindow } from 'electron';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configureOverlay } from '../overlay.js';
app.whenReady().then(async () => {
const window = new BrowserWindow({ show: false, frame: false, transparent: true,
  webPreferences: { preload: fileURLToPath(new URL('../preload.cjs', import.meta.url)), sandbox: true, contextIsolation: true, nodeIntegration: false } });
const overlay = await configureOverlay(window);
let html = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8')
  .replace('__PROFILE_DATA__', '[]').replace('__REFRESH_TIME__', 'smoke test')
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${readFileSync(new URL('../renderer/styles.css', import.meta.url), 'utf8')}</style>`)
  .replace('<script src="./app.js"></script>', () => `<script>${readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')}</script>`);
try {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const status = await window.webContents.executeJavaScript('window.minmaxOverlay.status()');
  const button = await window.webContents.executeJavaScript('Boolean(document.querySelector("#clear-overlay"))');
  if (!button || !status || typeof status.keyboardReady !== 'boolean') throw Error('Renderer/preload integration failed');
  console.log('Overlay renderer/preload smoke passed:', JSON.stringify(status));
  if (status.keyboardReady) {
    const cleared = await window.webContents.executeJavaScript('window.minmaxOverlay.clear()');
    if (!cleared.cleared || window.getOpacity() !== 0) throw Error('Clear failed');
    if (!overlay.isCleared()) throw Error('Clear state missing');
    await window.webContents.reload();
    await new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
    const hidden = await window.webContents.executeJavaScript('document.documentElement.classList.contains("overlay-clear")');
    if (!hidden || window.getOpacity() !== 0) throw Error('Refresh restored the cleared UI');
    const { uIOhook, UiohookKey } = await import('uiohook-napi');
    uIOhook.emit('keydown', { keycode: UiohookKey.M });
    uIOhook.emit('keyup', { keycode: UiohookKey.M });
    uIOhook.emit('keydown', { keycode: UiohookKey.M });
    uIOhook.emit('keyup', { keycode: UiohookKey.M });
    const restored = await window.webContents.executeJavaScript('!document.documentElement.classList.contains("overlay-clear")');
    if (!restored || overlay.isCleared() || window.getOpacity() !== 1) throw Error('Double-M restoration failed');
    console.log('Clear, refresh persistence, and simulated double-M restoration smoke passed');
  }
  overlay.dispose();
  window.destroy();
  app.exit(0);
} catch (error) {
  console.error(error);
  overlay.dispose();
  app.exit(1);
}

});
