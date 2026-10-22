// Keep visibility under app control. Game tracking must never hide the panel
// just because another application, or the desktop, takes focus.
export function createOverlayWindowPolicy(window, { convertBounds = (bounds) => bounds } = {}) {
  let disposed = false;
  let timer;
  let pendingBounds;
  const alive = () => !disposed && !window.isDestroyed();
  function applyBounds() {
    timer = undefined;
    if (!alive() || !pendingBounds) return;
    const bounds = convertBounds(pendingBounds);
    if (!bounds) return;
    const previous = window.getBounds();
    if (['x', 'y', 'width', 'height'].some((key) => previous[key] !== bounds[key])) window.setBounds(bounds);
  }
  function move(bounds) {
    if (!alive() || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds?.[key]))) return;
    if (bounds.width <= 0 || bounds.height <= 0) return;
    pendingBounds = Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, Math.round(bounds[key])]));
    if (!timer) timer = setTimeout(applyBounds, 33);
  }
  return {
    move,
    fullscreen({ isFullscreen }) {
      if (alive() && process.platform === 'darwin') {
        window.setVisibleOnAllWorkspaces(Boolean(isFullscreen), { visibleOnFullScreen: true });
      }
    },
    dispose() { disposed = true; clearTimeout(timer); pendingBounds = undefined; },
  };
}
