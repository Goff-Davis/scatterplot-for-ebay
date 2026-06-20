import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';
import { makeChartStub } from './helpers/chart-stub.mjs';

// documents-behavior — the font-size input MUST update panel.style.fontSize
// directly. Using a CSS custom property (the earlier approach) silently failed
// in the extension context: the handler ran, the variable was set, but no text
// changed because child elements had hardcoded px font-sizes that won out over
// CSS inheritance. The fix: panel.style.fontSize (inline style) + em units on
// children so they scale relative to the parent. These tests catch any
// regression back to the non-working custom-property approach.

const ALL_FILES = [
  'constants.js',
  'storage.js',
  'extract.js',
  'currency.js',
  'chart.js',
  'dock.js',
  'checkboxes.js',
  'styles.js',
  'panel.js',
];

const fresh = () => {
  let Chart;
  const s = loadModules(ALL_FILES, {
    setup(sb) {
      Chart = makeChartStub();
      sb.window.Chart = Chart;
      sb.EasyCurrencies = {};
      // getComputedStyle is a window method not in the default vm sandbox;
      // chart.js needs it when the panel element exists in the DOM.
      sb.getComputedStyle = sb.window.getComputedStyle.bind(sb.window);
    },
  });

  return { ...s, Chart };
};

test('buildPanel: default font-size is 14px', () => {
  const s = fresh();
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');

  assert.equal(panel.style.fontSize, '14px');
});

test('font-size input: changing value updates panel inline font-size', () => {
  const s = fresh();
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const input = s.document.getElementById('ebay-scatter-font-size');
  input.value = '20';
  input.dispatchEvent(new s.window.Event('input', { bubbles: true }));

  assert.equal(panel.style.fontSize, '20px');
});

test('font-size input: value persists to localStorage', () => {
  const s = fresh();
  s.buildPanel();
  const input = s.document.getElementById('ebay-scatter-font-size');
  input.value = '18';
  input.dispatchEvent(new s.window.Event('input', { bubbles: true }));

  assert.equal(s.localStorage.getItem('ebay_scatterplot_fontsize'), '18');
});

test('font-size input: out-of-range value is ignored', () => {
  const s = fresh();
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const input = s.document.getElementById('ebay-scatter-font-size');
  input.value = '50';
  input.dispatchEvent(new s.window.Event('input', { bubbles: true }));

  assert.equal(panel.style.fontSize, '14px');
});

test('font-size input: stored value is restored on buildPanel', () => {
  const s = fresh();
  s.localStorage.setItem('ebay_scatterplot_fontsize', '22');
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');

  assert.equal(panel.style.fontSize, '22px');
});

// ── Dark/light mode toggle ────────────────────────────────────────────────────

// documents-behavior: the theme toggle must flip the class, update the button
// glyph, persist to storage, and force a chart rebuild so new CSS variable
// colors are picked up. Each test gets a fresh sandbox to avoid cross-test
// chartInstance state.

test('buildPanel: default theme is dark (no theme-light class, ☉ glyph)', () => {
  const s = fresh();
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const btn = s.document.getElementById('ebay-scatter-theme');

  assert.equal(panel.classList.contains('theme-light'), false);
  assert.equal(btn.textContent, '☉');
});

test('buildPanel: stored light theme restores theme-light class and ☾ glyph', () => {
  const s = fresh();
  s.localStorage.setItem('ebay_scatterplot_theme', 'light');
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const toggle = s.document.getElementById('ebay-scatter-toggle');
  const btn = s.document.getElementById('ebay-scatter-theme');

  assert.equal(panel.classList.contains('theme-light'), true);
  assert.equal(toggle.classList.contains('theme-light'), true);
  assert.equal(btn.textContent, '☾');
});

test('theme toggle: dark → light adds class on panel + toggle, persists "light"', () => {
  const s = fresh();
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const toggle = s.document.getElementById('ebay-scatter-toggle');
  const btn = s.document.getElementById('ebay-scatter-theme');

  btn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

  assert.equal(panel.classList.contains('theme-light'), true);
  assert.equal(toggle.classList.contains('theme-light'), true);
  assert.equal(btn.textContent, '☾');
  assert.equal(s.localStorage.getItem('ebay_scatterplot_theme'), 'light');
});

test('theme toggle: light → dark removes class on panel + toggle, persists "dark"', () => {
  const s = fresh();
  s.localStorage.setItem('ebay_scatterplot_theme', 'light');
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const toggle = s.document.getElementById('ebay-scatter-toggle');
  const btn = s.document.getElementById('ebay-scatter-theme');

  btn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

  assert.equal(panel.classList.contains('theme-light'), false);
  assert.equal(toggle.classList.contains('theme-light'), false);
  assert.equal(btn.textContent, '☉');
  assert.equal(s.localStorage.getItem('ebay_scatterplot_theme'), 'dark');
});

test('theme toggle: two clicks return to original state', () => {
  const s = fresh();
  s.buildPanel();
  const panel = s.document.getElementById('ebay-scatter-panel');
  const btn = s.document.getElementById('ebay-scatter-theme');

  btn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));
  btn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

  assert.equal(panel.classList.contains('theme-light'), false);
  assert.equal(btn.textContent, '☉');
  assert.equal(s.localStorage.getItem('ebay_scatterplot_theme'), 'dark');
});

test('theme toggle: destroys existing chart and recreates it from storage', () => {
  const s = fresh();
  s.saveItems([
    { id: 'a', price: 10, date: '2024-01-01', title: 'T', type: 'sold' },
  ]);
  s.buildPanel();
  // Create the initial chart instance
  s.renderSoldChart([
    { id: 'a', price: 10, date: '2024-01-01', title: 'T', type: 'sold' },
  ]);

  assert.equal(s.Chart.created.length, 1);

  const btn = s.document.getElementById('ebay-scatter-theme');
  btn.dispatchEvent(new s.window.MouseEvent('click', { bubbles: true }));

  // The toggle destroys the old instance (chartInstance → null) then
  // renderChart(loadItems()) sees the saved item and creates a second Chart.
  assert.equal(s.Chart.created.length, 2);
});

// ── Font-size input ───────────────────────────────────────────────────────────

test('font-size input: chart tick and tooltip fonts are updated when charts exist', () => {
  const s = fresh();
  s.buildPanel();
  s.renderSoldChart([
    { id: 'a', price: 10, date: '2024-01-01', title: 'T', type: 'sold' },
  ]);
  const input = s.document.getElementById('ebay-scatter-font-size');
  input.value = '20';

  input.dispatchEvent(new s.window.Event('input', { bubbles: true }));

  const chart = s.Chart.created[0];

  assert.equal(chart.options.scales.y.ticks.font.size, 20);
  assert.equal(chart.options.scales.x.ticks.font.size, 20);
  assert.equal(chart.options.plugins.tooltip.bodyFont.size, 20);
});
