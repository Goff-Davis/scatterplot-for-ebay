import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';
import { makeChartStub } from './helpers/chart-stub.mjs';

// invariant — the stable data-shaping algorithm in chart.js, NOT Chart.js itself.
// The active strip centers points around 0 with a minimum half-range and sorts by
// price (range items render a line only, dot suppressed); both charts compute a
// priceHigh-aware y-max. A fake Chart records the config it was constructed with.
// Fresh load per test: module-level chartInstance/chartInstanceUnsold persist, so a
// 2nd renderChart on a shared sandbox would take the in-place update() path
// (TEST_PLAN.md §5H). Arrays produced inside the vm realm are spread into the test
// realm before deepEqual (cross-realm prototypes differ); y-max products use a
// tolerance.

const SCAFFOLD_IDS = [
  'ebay-scatter-status',
  'ebay-scatter-placeholder',
  'ebay-scatter-sold-wrap',
  'ebay-scatter-canvas',
  'ebay-scatter-unsold-wrap',
  'ebay-scatter-canvas-unsold',
];

function freshChart() {
  let Chart;
  const s = loadModules(['constants.js', 'chart.js'], {
    setup: (sb) => {
      Chart = makeChartStub();
      sb.window.Chart = Chart;
    },
  });
  for (const id of SCAFFOLD_IDS) {
    const el = s.document.createElement('div');
    el.id = id;
    s.document.body.appendChild(el);
  }
  return { ...s, Chart };
}

const unsold = (price, extra = {}) => ({ id: 'u', type: 'unsold', price, ...extra });
const sold = (price, extra = {}) => ({
  id: 's',
  type: 'sold',
  date: '2024-01-05',
  price,
  ...extra,
});
const ds0 = (c) => c.Chart.created[0].config.data.datasets[0];
const scales0 = (c) => c.Chart.created[0].config.options.scales;

// ── renderUnsoldChart (active price-distribution strip) ───────────────────────

test('unsold: sorts by price and centers x around 0', () => {
  const c = freshChart();
  c.renderChart([30, 10, 20].map((p, i) => unsold(p, { id: `u${i}` })));
  assert.equal(c.Chart.created.length, 1);
  const data = ds0(c).data;
  assert.deepEqual([...data.map((d) => d.y)], [10, 20, 30]); // sorted ascending
  assert.deepEqual([...data.map((d) => d.x)], [-1, 0, 1]); // centered (half = 1)
  assert.equal(scales0(c).x.min, -6); // max(half, 5) + 1 pad
  assert.equal(scales0(c).x.max, 6);
});

test('unsold: a single price gets x=0 and the minimum half-range', () => {
  const c = freshChart();
  c.renderChart([unsold(42)]);
  assert.deepEqual([...ds0(c).data.map((d) => d.x)], [0]);
  assert.equal(scales0(c).x.min, -6); // half = 0 → min half-range 5, +1 pad
  assert.equal(scales0(c).x.max, 6);
});

test('unsold: the half-range grows past the floor for many points', () => {
  const c = freshChart();
  c.renderChart(Array.from({ length: 12 }, (_, i) => unsold(i + 1, { id: `u${i}` })));
  const xs = [...ds0(c).data.map((d) => d.x)];
  assert.ok(Math.abs(xs[0] - -5.5) < 1e-9); // half = (12-1)/2 = 5.5
  assert.ok(Math.abs(xs[11] - 5.5) < 1e-9);
  assert.equal(scales0(c).x.min, -6.5);
  assert.equal(scales0(c).x.max, 6.5);
});

test('unsold: a range item suppresses its dot (line only)', () => {
  const c = freshChart();
  // sorted by price: normal (10) then range (20); pointRadius mirrors that order.
  c.renderChart([unsold(10, { id: 'n' }), unsold(20, { id: 'r', priceHigh: 30 })]);
  const radii = ds0(c).pointRadius;
  assert.equal(radii[0], 5); // normal point keeps its radius
  assert.equal(radii[1], 0); // range point is hidden (rangeLinesPlugin draws the line)
});

test('unsold: y-max accounts for priceHigh, not just y', () => {
  const c = freshChart();
  c.renderChart([unsold(10, { priceHigh: 90 })]);
  assert.ok(Math.abs(scales0(c).y.suggestedMax - 90 * 1.025) < 0.01);
});

// ── renderSoldChart (sold date scatter) ───────────────────────────────────────

test('sold: x is the ms timestamp of the sold date', () => {
  const c = freshChart();
  c.renderChart([sold(100)]);
  const pt = ds0(c).data[0];
  assert.equal(pt.x, new Date('2024-01-05').getTime());
  assert.equal(pt.y, 100);
});

test('sold: y-max accounts for priceHigh so ranges are not clipped', () => {
  const c = freshChart();
  c.renderChart([sold(10, { priceHigh: 200 })]);
  assert.ok(Math.abs(scales0(c).y.suggestedMax - 200 * 1.025) < 0.01);
});

test('sold: an item with no type field lands in the sold chart (legacy default)', () => {
  const c = freshChart();
  c.renderChart([{ id: 'legacy', date: '2024-01-05', price: 5 }]); // i.type || 'sold'
  assert.equal(c.Chart.created.length, 1);
  assert.equal(c.Chart.created[0].canvas.id, 'ebay-scatter-canvas'); // the sold canvas
});

// ── renderChart (placeholder + status) ────────────────────────────────────────

test('renderChart([]) shows the placeholder and clears the status', () => {
  const c = freshChart();
  c.renderChart([]);
  assert.equal(c.document.getElementById('ebay-scatter-placeholder').style.display, 'flex');
  assert.equal(c.document.getElementById('ebay-scatter-status').textContent, '');
  assert.equal(c.Chart.created.length, 0);
});

test('renderChart(items) hides the placeholder and writes the count (sing/plural)', () => {
  const c1 = freshChart();
  c1.renderChart([sold(5)]);
  assert.equal(c1.document.getElementById('ebay-scatter-placeholder').style.display, 'none');
  assert.equal(c1.document.getElementById('ebay-scatter-status').textContent, '1 item');

  const c2 = freshChart();
  c2.renderChart([sold(5, { id: 's1' }), sold(6, { id: 's2', date: '2024-01-06' })]);
  assert.equal(c2.document.getElementById('ebay-scatter-status').textContent, '2 items');
});
