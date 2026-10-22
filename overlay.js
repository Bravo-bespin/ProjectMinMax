import { ipcMain, screen, systemPreferences } from "electron";
import { createDoubleTapDetector } from "./double-tap.js";
import { createOverlayWindowPolicy } from "./overlay-window-policy.js";

export async function configureOverlay(window) {
  // Capture this while the BrowserWindow is alive. Its webContents getter throws
  // once destroyed, including inside the window's `closed` event.
  const contents = window.webContents;
  let controller;
  let hook;
  let detector;
  let disposed = false;
  let cleared = false;
  let keyboardReady = false;
  let keyboardError = "";
  let overlayError = "";
  const controllerListeners = [];
  const alive = () => !disposed && !window.isDestroyed() && !contents.isDestroyed();
  const policy = createOverlayWindowPolicy(window, {
    convertBounds: (bounds) => process.platform === 'win32' ? screen.screenToDipRect(window, bounds) : bounds,
  });
  const syncVisibility = () => { if (alive()) contents.send("overlay:visibility", cleared); };
  const status = () => ({
    cleared, keyboardReady,
    message: keyboardError || overlayError || "Clear overlay hides everything. Press M twice within 350 ms to restore.",
  });
  const owns = (event) => alive() && event.sender === contents;

  function restore() {
    if (!cleared || !alive()) return;
    cleared = false;
    syncVisibility();
    if (process.platform === "darwin") window.setWindowButtonVisibility(true);
    window.setOpacity(1);
    window.setIgnoreMouseEvents(false);
    window.show();
    window.focus();
  }

  async function startKeyboard(requestPermission = false) {
    if (!alive()) return false;
    if (keyboardReady) return true;
    if (process.platform === "darwin" && !systemPreferences.isTrustedAccessibilityClient(requestPermission)) {
      keyboardError = "Enable Accessibility for this app in System Settings, then try Clear overlay again.";
      return false;
    }
    try {
      const { uIOhook, UiohookKey } = await import("uiohook-napi");
      if (!alive()) return false;
      hook = uIOhook;
      detector ??= createDoubleTapDetector(UiohookKey.M, restore);
      hook.removeListener("keydown", detector.keydown);
      hook.removeListener("keyup", detector.keyup);
      hook.on("keydown", detector.keydown);
      hook.on("keyup", detector.keyup);
      hook.start();
      keyboardReady = true;
      keyboardError = "";
    } catch (error) {
      keyboardError = `Double-M listener unavailable: ${error.message}`;
      console.error(keyboardError);
    }
    return keyboardReady;
  }

  const close = (event) => { if (owns(event)) window.close(); };
  function dispose() {
    if (disposed) return;
    disposed = true;
    policy.dispose();
    // EventEmitter listener removal remains safe on a destroyed WebContents
    // reference; never retrieve it from the destroyed BrowserWindow here.
    contents.removeListener("did-finish-load", syncVisibility);
    for (const [event, listener] of controllerListeners) controller.events.removeListener(event, listener);
    if (hook && detector) {
      hook.removeListener("keydown", detector.keydown);
      hook.removeListener("keyup", detector.keyup);
    }
    if (keyboardReady) { keyboardReady = false; hook.stop(); }
    ipcMain.removeHandler("overlay:status");
    ipcMain.removeHandler("overlay:clear");
    ipcMain.removeListener("overlay:close", close);
    window.removeListener("close", dispose);
    window.removeListener("closed", dispose);
  }

  contents.on("did-finish-load", syncVisibility);
  window.once("close", dispose);
  window.once("closed", dispose);
  ipcMain.handle("overlay:status", (event) => owns(event) ? status() : undefined);
  ipcMain.handle("overlay:clear", async (event) => {
    if (!owns(event) || !await startKeyboard(true) || !alive()) return status();
    detector.reset();
    cleared = true;
    syncVisibility();
    window.setIgnoreMouseEvents(true);
    if (process.platform === "darwin") window.setWindowButtonVisibility(false);
    window.setOpacity(0);
    if (controller?.targetHasFocus) controller.focusTarget();
    else window.blur();
    return status();
  });
  ipcMain.on("overlay:close", close);

  try {
    const { OverlayController } = await import("electron-overlay-window");
    if (alive()) {
      controller = OverlayController;
      // Tracking mode avoids the library's automatic hide-on-blur and callbacks
      // that retain a destroyed BrowserWindow. We apply only its geometry events.
      controller.attachByTitle(undefined, process.env.DESTINY_WINDOW_TITLE || "Destiny 2");
      const attach = (event) => {
        if (alive()) {
          window.setAlwaysOnTop(true, "screen-saver");
          policy.move(event);
          policy.fullscreen(event);
        }
      };
      for (const [event, listener] of [["attach", attach], ["moveresize", policy.move], ["fullscreen", policy.fullscreen]]) {
        controller.events.on(event, listener);
        controllerListeners.push([event, listener]);
      }
    }
  } catch (error) {
    overlayError = `Game attachment unavailable: ${error.message}`;
    console.error(overlayError);
  }
  await startKeyboard();
  return { isCleared: () => cleared, dispose };
}
