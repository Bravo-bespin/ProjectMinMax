import { profileWindowChrome } from '../window-chrome.js';
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { configureOverlay } from '../overlay.js';

// Turn an otherwise-modal Electron uncaught-error dialog into a failing test.
process.on('uncaughtException', (error) => { console.error(error); app.exit(1); });
process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });
// Keep the test process alive after the last window closes to exercise late callbacks.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const window = new BrowserWindow({ show: false, ...profileWindowChrome(), transparent: true, alwaysOnTop: true });
    assert.equal(window.isMinimizable(), true);
    assert.equal(window.isMaximizable(), true);
    assert.equal(window.isFullScreenable(), true);
    if (process.platform === 'darwin') assert.deepEqual(window.getWindowButtonPosition(), { x: 16, y: 16 });
    const overlay = await configureOverlay(window);
    const { OverlayController: controller } = await import('electron-overlay-window');
    window.showInactive();
    window.emit('blur'); // The library previously hid the app here.
    assert.equal(window.isVisible(), true, 'Clicking away must leave the panel visible');
    controller.events.emit('blur');
    controller.events.emit('detach');
    assert.equal(window.isVisible(), true, 'Game blur/detach must not hide the panel');
    controller.events.emit('attach', { x: 50, y: 50, width: 800, height: 600, isFullscreen: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(window.getBounds().width, 800, 'Tracking mode must still follow game bounds');
    assert.equal(window.isVisible(), true);
    let closed = false;
    const didClose = new Promise((resolve) => window.once('closed', () => {
      // This exact after-destroy call previously threw "Object has been destroyed".
      overlay.dispose(); overlay.dispose(); closed = true; resolve();
    }));
    window.close();
    await didClose;
    assert.equal(closed, true);
    // Native tracker events may arrive after the BrowserWindow has closed.
    controller.events.emit('attach', { x: 0, y: 0, width: 900, height: 700 });
    controller.events.emit('moveresize', { x: 0, y: 0, width: 900, height: 700 });
    controller.events.emit('blur');
    controller.events.emit('focus');
    controller.events.emit('detach');
    controller.events.emit('fullscreen', { isFullscreen: true });
    await new Promise((resolve) => setTimeout(resolve, 75));
    console.log('Lifecycle checks passed: focus loss stays visible; game tracking works; close cleanup and late tracker events cause no JavaScript error.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
