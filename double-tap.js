// Require two physical presses: key repeat from holding M must not restore the UI.
export function createDoubleTapDetector(keycode, onDoubleTap, interval = 350) {
  let held = false;
  let lastPress;
  return {
    reset() { held = false; lastPress = undefined; },
    keydown(event, now = performance.now()) {
      if (event.keycode !== keycode || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        lastPress = undefined;
        return;
      }
      if (held) return;
      held = true;
      if (lastPress !== undefined && now - lastPress <= interval) {
        lastPress = undefined;
        onDoubleTap();
      } else {
        lastPress = now;
      }
    },
    keyup(event) { if (event.keycode === keycode) held = false; },
  };
}
