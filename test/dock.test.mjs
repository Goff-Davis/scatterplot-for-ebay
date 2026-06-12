import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';

// invariant — pure geometry: nearestEdge picks the closest of the four viewport
// edges. The viewport is pinned so the math is deterministic. Only nearestEdge is
// exercised; setDockSide dereferences panel/toggle DOM and chartInstance, which
// are not loaded here (TEST_PLAN.md §5G).

const sandbox = loadModules(['constants.js', 'dock.js'], {
  setup: (s) => {
    Object.defineProperty(s.window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(s.window, 'innerHeight', { value: 800, configurable: true });
  },
});
const { nearestEdge } = sandbox;

test('nearestEdge picks the closest viewport edge', () => {
  // invariant (1000×800 viewport)
  assert.equal(nearestEdge(10, 400), 'left');
  assert.equal(nearestEdge(990, 400), 'right');
  assert.equal(nearestEdge(500, 10), 'top');
  assert.equal(nearestEdge(500, 790), 'bottom');
});

test('nearestEdge tie-break at the exact center favors bottom', () => {
  // documents-behavior — reduce uses strict <, so equal distances keep the LATER
  // entry in iteration order (left, right, top, bottom). At dead center top and
  // bottom tie for the minimum, and bottom is last → 'bottom'.
  assert.equal(nearestEdge(500, 400), 'bottom');
});
