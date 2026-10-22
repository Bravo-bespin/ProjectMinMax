import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayWindowPolicy } from '../overlay-window-policy.js';
const tick = () => new Promise((resolve) => setTimeout(resolve, 45));
function setup() {
  let destroyed = false;
  let bounds = { x: 0, y: 0, width: 800, height: 600 };
  const changes = [];
  const window = {
    isDestroyed: () => destroyed,
    getBounds: () => { assert.equal(destroyed, false); return bounds; },
    setBounds: (next) => { assert.equal(destroyed, false); bounds = next; changes.push(next); },
    setVisibleOnAllWorkspaces: () => { assert.equal(destroyed, false); },
  };
  return { window, changes, destroy: () => { destroyed = true; } };
}
test('game geometry updates coalesce without changing window visibility', async () => {
  const { window, changes } = setup();
  const policy = createOverlayWindowPolicy(window);
  policy.move({ x: 10, y: 10, width: 1000, height: 700 });
  policy.move({ x: 20, y: 30, width: 1100, height: 750 });
  await tick();
  assert.deepEqual(changes, [{ x: 20, y: 30, width: 1100, height: 750 }]);
  policy.dispose();
});
test('pending geometry and late fullscreen callbacks do not touch a closed window', async () => {
  const { window, changes, destroy } = setup();
  const policy = createOverlayWindowPolicy(window);
  policy.move({ x: 10, y: 10, width: 1000, height: 700 });
  destroy(); policy.dispose(); policy.dispose();
  policy.move({ x: 1, y: 1, width: 1, height: 1 });
  policy.fullscreen({ isFullscreen: true });
  await tick();
  assert.deepEqual(changes, []);
});
test('invalid and unchanged target bounds do not cause resize work', async () => {
  const { window, changes } = setup();
  const policy = createOverlayWindowPolicy(window);
  policy.move({ x: 0, y: 0, width: 0, height: 0 });
  policy.move({ x: NaN, y: 0, width: 800, height: 600 });
  policy.move({ x: 0, y: 0, width: 800, height: 600 });
  await tick(); assert.deepEqual(changes, []); policy.dispose();
});
