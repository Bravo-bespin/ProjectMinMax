import { ipcMain, systemPreferences } from "electron";
import { createDoubleTapDetector } from "./double-tap.js";

export async function configureOverlay(window) {
  let controller;
  let hook;
  let detector;
  let cleared = false;
  let keyboardReady = false;
  let keyboardError = "";
  let overlayError = "";

  const restore = () => {
    if (!cleared || window.isDestroyed()) return;
    cleared = false;
    window.webContents.send("overlay:visibility", false);
    window.setOpacity(1);
    window.setIgnoreMouseEvents(false);
    window.show();
    if (controller?.targetHasFocus) controller.activateOverlay();
    else window.focus();
  };

  try {
    const { OverlayController } = await import("electron-overlay-window");
    controller = OverlayController;
    controller.attachByTitle(window, process.env.DESTINY_WINDOW_TITLE || "Destiny 2");
    // The library enables click-through on every game-focus event. Keep that
    // behavior only while clear; the visible panel must remain clickable.
    const updateInput = () => window.setIgnoreMouseEvents(cleared);
    controller.events.on("attach", updateInput);
    controller.events.on("focus", updateInput);
    window.once("closed", () => {
      controller.events.removeListener("attach", updateInput);
      controller.events.removeListener("focus", updateInput);
    });
  } catch (error) {
    controller = undefined;
    overlayError = `Game attachment unavailable: ${error.message}`;
    console.error(overlayError);
  }

  async function startKeyboard(requestPermission = false) {
    if (keyboardReady) return true;
    if (process.platform === "darwin" && !systemPreferences.isTrustedAccessibilityClient(requestPermission)) {
      keyboardError = "Enable Accessibility for this app in System Settings, then try Clear overlay again.";
      return false;
    }
    try {
      const { uIOhook, UiohookKey } = await import("uiohook-napi");
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

  const status = () => ({
    cleared,
    keyboardReady,
    message: keyboardError || overlayError || "Clear overlay hides everything. Press M twice within 350 ms to restore.",
  });
  const syncVisibility = () => window.webContents.send("overlay:visibility", cleared);
  window.webContents.on("did-finish-load", syncVisibility);
  const owns = (event) => event.sender === window.webContents;
  ipcMain.handle("overlay:status", (event) => owns(event) ? status() : undefined);
  ipcMain.handle("overlay:clear", async (event) => {
    if (!owns(event) || !await startKeyboard(true)) return status();
    if (window.isDestroyed()) return status();
    detector.reset();
    cleared = true;
    window.webContents.send("overlay:visibility", true);
    window.setIgnoreMouseEvents(true);
    window.setOpacity(0);
    if (controller?.targetHasFocus) controller.focusTarget();
    else window.blur();
    return status();
  });
  const close = (event) => { if (owns(event)) window.close(); };
  ipcMain.on("overlay:close", close);
  await startKeyboard();

  return { isCleared: () => cleared, dispose: () => {
    window.webContents.removeListener("did-finish-load", syncVisibility);
    hook?.removeListener("keydown", detector?.keydown);
    hook?.removeListener("keyup", detector?.keyup);
    if (keyboardReady) hook.stop();
    ipcMain.removeHandler("overlay:status");
    ipcMain.removeHandler("overlay:clear");
    ipcMain.removeListener("overlay:close", close);
  } };
}
