import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';
import { makeChartStub } from './helpers/chart-stub.mjs';
import { US_SOLD_COUPON, US_SOLD_BEST_OFFER_NEW_LISTING } from './fixtures.mjs';

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

test('init: ul.srp-results with the id on the <li> (s-card layout) is wired up', () => {
  // eBay serves ul.srp-results > li.s-card[data-listingid] again (October 2026), so the
  // su-grid list above is not the only shape init.js must handle. A real captured card
  // keeps this honest.
  const s = fresh(
    `<ul class="srp-results srp-list clearfix">${US_SOLD_COUPON}</ul>`,
  );
  const list = s.document.querySelector('ul.srp-results');

  assert.equal(
    placeholderOf(s).classList.contains('ebay-scatter-error'),
    false,
  );
  assert.equal(list.firstElementChild.dataset.scatterInjected, '1');
  assert.equal(s.document.querySelectorAll('.ebay-scatter-cb input').length, 1);
  assert.equal(
    s.document.getElementById('ebay-scatter-plot-all-wrap').nextElementSibling,
    list,
    '"Plot all" sits directly before the list',
  );
});

// ── eBay swaps the results region in place ────────────────────────────────────
// eBay's x-wire navigation (filters, sort, pagination, the "Sold items" filter) fetches
// an HTML fragment and replaces whole [wire-region] elements without a page load, so the
// <ul>, its cards and our injected controls are thrown away while the content script
// never runs again. These tests are the reason refreshList() watches the whole <body>.

const resultsRegion = (cards) =>
  `<div wire-region="results"><ul class="srp-results srp-list clearfix">${cards}</ul></div>`;

// Mirrors x-wire's updateRegions(): the new region goes in before the old one, which is
// then removed.
const swapRegion = (s, cards) => {
  const old = s.document.querySelector('[wire-region="results"]');
  const tpl = s.document.createElement('template');

  tpl.innerHTML = resultsRegion(cards);
  old.parentNode.insertBefore(tpl.content.firstElementChild, old);
  old.remove();
};

// MutationObserver callbacks are microtasks, so one macrotask turn lets them all run. (A
// callback that kept mutating the DOM would starve this and hang the test.)
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const boxIds = (s) =>
  Array.from(s.document.querySelectorAll('.ebay-scatter-cb input')).map(
    (cb) => cb.dataset.itemId,
  );

const controls = (s) =>
  s.document.querySelectorAll('#ebay-scatter-plot-all-wrap');

test('init: when eBay swaps the results region in place, the new list is wired up', async () => {
  const s = fresh(resultsRegion(US_SOLD_COUPON));

  assert.deepEqual(boxIds(s), ['178522312514']);

  swapRegion(s, US_SOLD_BEST_OFFER_NEW_LISTING);
  await settle();

  // Only the new page's card: the old one left with its region.
  assert.deepEqual(boxIds(s), ['128131566857']);
  assert.equal(controls(s).length, 1);
  assert.equal(
    controls(s)[0].nextElementSibling,
    s.document.querySelector('ul.srp-results'),
    '"Plot all" sits directly before the new list',
  );
});

test('init: when only the <ul> is replaced, "Plot all" is rebuilt for the new list', async () => {
  // The control lives in the parent, which survives, but it is bound to the list it was
  // built for: left alone it would act on a detached <ul> and plot nothing.
  const s = fresh(resultsRegion(US_SOLD_COUPON));
  const next = s.document.createElement('ul');

  next.className = 'srp-results srp-list clearfix';
  next.innerHTML = US_SOLD_BEST_OFFER_NEW_LISTING;
  s.document.querySelector('ul.srp-results').replaceWith(next);
  await settle();

  assert.equal(controls(s).length, 1);

  const all = s.document.getElementById('ebay-scatter-plot-all');

  all.checked = true;
  all.dispatchEvent(new s.window.Event('change'));

  assert.deepEqual(
    [...s.loadItems()].map((i) => i.id),
    ['128131566857'],
  );
});

test('init: a list that turns up after load clears the layout error and is wired up', async () => {
  const s = fresh(); // nothing to find yet

  assert.ok(placeholderOf(s).classList.contains('ebay-scatter-error'));

  s.document.body.insertAdjacentHTML(
    'beforeend',
    resultsRegion(US_SOLD_COUPON),
  );
  await settle();

  const placeholder = placeholderOf(s);

  assert.equal(placeholder.classList.contains('ebay-scatter-error'), false);
  assert.match(placeholder.textContent, /Check items below/);
  assert.equal(placeholder.querySelector('a'), null);
  assert.deepEqual(boxIds(s), ['178522312514']);
});

test('init: "Plot all" is put back if eBay re-renders its region without it', async () => {
  const s = fresh(resultsRegion(US_SOLD_COUPON));

  controls(s)[0].remove();
  await settle();

  assert.equal(controls(s).length, 1);
  assert.equal(
    controls(s)[0].nextElementSibling,
    s.document.querySelector('ul.srp-results'),
  );
});

test('init: cards appended to the list (infinite scroll) get checkboxes', async () => {
  const s = fresh(resultsRegion(US_SOLD_COUPON));

  s.document
    .querySelector('ul.srp-results')
    .insertAdjacentHTML('beforeend', US_SOLD_BEST_OFFER_NEW_LISTING);
  await settle();

  assert.deepEqual(boxIds(s), ['178522312514', '128131566857']);
});

test('init: unrelated DOM changes leave the wiring alone (no duplicates)', async () => {
  const s = fresh(resultsRegion(US_SOLD_COUPON));

  for (let i = 0; i < 3; i++) {
    s.document.body.insertAdjacentHTML('beforeend', '<div class="ad">x</div>');
    await settle();
  }

  assert.equal(controls(s).length, 1);
  assert.deepEqual(boxIds(s), ['178522312514']);
});

test('init: a swap does not redraw the chart', async () => {
  // documents-behavior. Only the first wire-up draws it. A swap leaves the saved items
  // untouched, and a redraw would drop any currency conversion already applied.
  const s = fresh(resultsRegion(US_SOLD_COUPON));
  let draws = 0;

  s.renderChart = () => {
    draws++;
  };
  swapRegion(s, US_SOLD_BEST_OFFER_NEW_LISTING);
  await settle();

  assert.equal(draws, 0);
});
