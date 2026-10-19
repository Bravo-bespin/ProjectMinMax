import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDoubleTapDetector } from '../double-tap.js';

const M = { keycode: 50 };
function setup() {
  let count = 0;
  return { detector: createDoubleTapDetector(50, () => count++), count: () => count };
}
test('two separate M presses within 350 ms restore once', () => {
  const { detector, count } = setup();
  detector.keydown(M, 0);
  detector.keyup(M);
  detector.keydown(M, 350);
  assert.equal(count(), 1);
});
test('holding M does not count as a double tap', () => {
  const { detector, count } = setup();
  detector.keydown(M, 0);
  detector.keydown(M, 100);
  detector.keydown(M, 200);
  assert.equal(count(), 0);
});
test('slow presses, intervening keys and modifiers do not restore', () => {
  for (const middle of [null, { keycode: 30 }, { ...M, ctrlKey: true }]) {
    const { detector, count } = setup();
    detector.keydown(M, 0);
    detector.keyup(M);
    if (middle) detector.keydown(middle, 100);
    detector.keydown(M, middle ? 200 : 351);
    assert.equal(count(), 0);
  }
});
test('reset discards presses from before clearing', () => {
  const { detector, count } = setup();
  detector.keydown(M, 0);
  detector.keyup(M);
  detector.reset();
  detector.keydown(M, 100);
  assert.equal(count(), 0);
});
