import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';
import { makeChartStub } from './helpers/chart-stub.mjs';

// invariant — init.js is the entry point: its top-level code runs on load, so
// loadModules() executing the files in order IS the test. Nothing covered it before,
// which is how a layout-failure message that rendered as an overflowing run-on line
// (and could not be clicked) shipped unnoticed.
//
// The sandbox's jsdom starts with an empty <body>, so findResultsList() finds nothing
// and the failure path runs by default; the happy path seeds a list in setup(), which
// runs BEFORE the source files.

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
  'init.js',
];

const ISSUES_URL = 'https://github.com/Goff-Davis/scatterplot-for-ebay/issues';

// One card, current layout: id on an inner div, not the <li>.
const LIST_HTML = `
  <ul class="su-grid">
    <li>
      <div data-listingid="111">
        <a href="/itm/111">Item</a>
        <span>Sold  Jan 5, 2026</span>
        <span>$50.00</span>
        <div class="su-card-container__attributes__primary"></div>
      </div>
    </li>
  </ul>`;

const fresh = (bodyHTML = '') =>
  loadModules(ALL_FILES, {
    setup(sb) {
      sb.window.Chart = makeChartStub();
      sb.EasyCurrencies = {};
      // Not in the default vm sandbox; init.js and chart.js reach for them as
      // bare globals, and a missing one throws ReferenceError.
      sb.getComputedStyle = sb.window.getComputedStyle.bind(sb.window);
      sb.MutationObserver = sb.window.MutationObserver;
      sb.document.body.innerHTML = bodyHTML;
    },
  });

const placeholderOf = (s) =>
  s.document.getElementById('ebay-scatter-placeholder');

test('init: no results list → the failure message renders in the placeholder', () => {
  const s = fresh();
  const placeholder = placeholderOf(s);

  assert.ok(
    placeholder.classList.contains('ebay-scatter-error'),
    'placeholder is put into its error state',
  );
  assert.match(placeholder.textContent, /Could not find listings/);
  assert.doesNotMatch(
    placeholder.textContent,
    /Check items below/,
    'the default "check items below" text must not sit next to the error',
  );
});

test('init: the failure message offers a real, clickable link', () => {
  // The whole point of the fix: the URL used to be baked into a textContent string,
  // so it could not be clicked and, unbroken, overflowed the panel.
  const link = placeholderOf(fresh()).querySelector('a');

  assert.ok(link, 'there is an anchor, not a bare URL in text');
  assert.equal(link.getAttribute('href'), ISSUES_URL);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noreferrer');
  assert.ok(link.textContent.trim().length > 0, 'the link has visible text');
});

test('init: the failure message leaves the status span alone', () => {
  // #ebay-scatter-status belongs to renderChart's item count; writing the error there
  // means any later re-render silently wipes it.
  const s = fresh();

  assert.equal(
    s.document.getElementById('ebay-scatter-status').textContent,
    '',
  );
});

test('init: results list present → no error, and the list is wired up', () => {
  const s = fresh(LIST_HTML);
  const placeholder = placeholderOf(s);

  assert.equal(placeholder.classList.contains('ebay-scatter-error'), false);
  assert.match(placeholder.textContent, /Check items below/);
  assert.equal(placeholder.querySelector('a'), null);

  // The card got a checkbox and "Plot all" was anchored to the list.
  assert.equal(s.document.querySelectorAll('.ebay-scatter-cb input').length, 1);
  assert.ok(s.document.getElementById('ebay-scatter-plot-all'));
});
