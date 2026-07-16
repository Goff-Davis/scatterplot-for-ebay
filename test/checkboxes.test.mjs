import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';

// invariant — the two pure-ish state reconcilers from checkboxes.js. The rest of
// the file (injectCheckbox / buildPlotAllControl / clearAll) wires DOM events to
// eBay-specific markup and is out of scope (TEST_PLAN.md §7). The synthetic
// checkbox DOM below is NOT eBay markup, so these stay invariant-safe. extract.js
// and checkboxes.js are loaded only for their function declarations; only
// syncPlotAll and reconcileCheckboxes are called.

const fresh = () =>
  loadModules(['constants.js', 'storage.js', 'extract.js', 'checkboxes.js']);

// The "Plot all" tri-state box plus N per-item checkboxes, carrying the classes /
// data attributes the reconcilers query for.
function buildCheckboxDom(doc, perItem) {
  const all = doc.createElement('input');
  all.type = 'checkbox';
  all.id = 'ebay-scatter-plot-all';
  doc.body.appendChild(all);

  for (const { id, itemType, checked } of perItem) {
    const label = doc.createElement('label');
    label.className = 'ebay-scatter-cb';

    const cb = doc.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.itemId = id;

    if (itemType !== undefined) {
      cb.dataset.itemType = itemType;
    }

    cb.checked = checked;
    label.appendChild(cb);
    doc.body.appendChild(label);
  }

  return all;
}

// ── syncPlotAll (three-state "Plot all") ──────────────────────────────────────

test('syncPlotAll: none checked → unchecked, not indeterminate', () => {
  const s = fresh();
  const all = buildCheckboxDom(s.document, [
    { id: 'a', checked: false },
    { id: 'b', checked: false },
  ]);

  s.syncPlotAll();
  assert.equal(all.checked, false);
  assert.equal(all.indeterminate, false);
});

test('syncPlotAll: some checked → indeterminate', () => {
  const s = fresh();
  const all = buildCheckboxDom(s.document, [
    { id: 'a', checked: true },
    { id: 'b', checked: false },
  ]);

  s.syncPlotAll();
  assert.equal(all.checked, false);
  assert.equal(all.indeterminate, true);
});

test('syncPlotAll: all checked → checked, not indeterminate', () => {
  const s = fresh();
  const all = buildCheckboxDom(s.document, [
    { id: 'a', checked: true },
    { id: 'b', checked: true },
  ]);

  s.syncPlotAll();
  assert.equal(all.checked, true);
  assert.equal(all.indeterminate, false);
});

test('syncPlotAll: no per-item boxes → no throw, state untouched (early return)', () => {
  const s = fresh();
  const all = s.document.createElement('input');
  all.type = 'checkbox';
  all.id = 'ebay-scatter-plot-all';
  all.checked = true; // a deliberate pre-state the early return must not clobber
  all.indeterminate = true;
  s.document.body.appendChild(all);

  assert.doesNotThrow(() => s.syncPlotAll());
  assert.equal(all.checked, true);
  assert.equal(all.indeterminate, true);
});

// ── reconcileCheckboxes (make each box mirror storage) ────────────────────────

test('reconcileCheckboxes: each box reflects whether storage holds its id', () => {
  const s = fresh();
  s.saveItems([
    { id: 'a', type: 'sold' },
    { id: 'c', type: 'sold' },
  ]);
  buildCheckboxDom(s.document, [
    { id: 'a', itemType: 'sold', checked: false }, // → should flip to checked
    { id: 'b', itemType: 'sold', checked: true }, // → should flip to unchecked
    { id: 'c', itemType: 'sold', checked: false }, // → should flip to checked
  ]);
  s.reconcileCheckboxes();

  const checkedOf = (id) =>
    s.document.querySelector(`.ebay-scatter-cb input[data-item-id="${id}"]`)
      .checked;

  assert.equal(checkedOf('a'), true);
  assert.equal(checkedOf('b'), false);
  assert.equal(checkedOf('c'), true);
});

// documents-behavior — the fix for "Plot all on sold then switch to active shows partial"
test('reconcileCheckboxes: id in storage but different type → unchecked', () => {
  const s = fresh();
  s.saveItems([{ id: 'x', type: 'sold' }]); // saved from a sold-listings page
  buildCheckboxDom(s.document, [
    { id: 'x', itemType: 'unsold', checked: true }, // same ID, active-page checkbox
  ]);
  s.reconcileCheckboxes();

  const cb = s.document.querySelector(
    '.ebay-scatter-cb input[data-item-id="x"]',
  );

  assert.equal(cb.checked, false);
});

// documents-behavior: per-item change handler coexists sold+unsold records for the same id
const freshCross = () =>
  loadModules(['constants.js', 'storage.js', 'extract.js', 'checkboxes.js'], {
    setup: (sb) => {
      sb.getComputedStyle = sb.window.getComputedStyle.bind(sb.window);
      sb.clearTimeout = sb.window.clearTimeout.bind(sb.window);
      sb.setTimeout = sb.window.setTimeout.bind(sb.window);
      sb.renderChart = () => {};
      sb.renderChartConverted = () => {};
    },
  });

test('injectCheckbox change handler: cross-type id coexists in storage', () => {
  const s = freshCross();

  // Pre-store a sold record for id 'X'
  s.saveItems([
    { id: 'X', type: 'sold', price: 10, date: '2024-01-01', title: 'Item X' },
  ]);

  // Build a minimal active listing card for the same id
  const card = s.document.createElement('li');
  card.dataset.listingid = 'X';
  card.innerHTML = '<a href="/itm/X">Item X</a><span>$15.00</span>';
  s.document.body.appendChild(card);

  s.injectCheckbox(card); // no savedItemsMap → falls back to loadItems()

  const cb = card.querySelector('.ebay-scatter-cb input');
  // Sold record in storage doesn't match type 'unsold' → starts unchecked
  assert.equal(
    cb.checked,
    false,
    'starts unchecked (type mismatch with stored sold record)',
  );

  cb.checked = true;
  cb.dispatchEvent(new s.window.Event('change', { bubbles: true }));

  // Both records must coexist; the checkbox must stay checked
  const ids = s.loadItems().map((i) => `${i.id}:${i.type}`);

  assert.ok(ids.includes('X:sold'), 'sold X preserved');
  assert.ok(ids.includes('X:unsold'), 'active X added');
  assert.equal(
    cb.checked,
    true,
    'checkbox stays checked (no revert from reconcileCheckboxes)',
  );
});

// ── the sold-only Best Offer warning ──────────────────────────────────────────
// invariant — synthetic cards, not eBay markup. eBay shows the LISTING price on a
// sold Best Offer card and no longer says whether an offer was accepted, so the
// warning sends the user to the item page. Active cards are exempt: their price is
// the asking price, so there is nothing to go and check.

const soldBoCard = (s, id = 'B1') => {
  const li = s.document.createElement('li');
  li.dataset.listingid = id;
  li.innerHTML =
    `<a href="/itm/${id}">Item</a><span>Sold  Jan 5, 2026</span>` +
    '<span>$50.00</span><span>or Best Offer</span>' +
    '<div class="su-card-container__attributes__primary"></div>';
  s.document.body.appendChild(li);
  return li;
};

const warnsIn = (li) => li.querySelectorAll('.ebay-scatter-bo-warn');

test('injectCheckbox: sold + Best Offer gets exactly one warning, in the attributes area', () => {
  const s = freshCross();
  const li = soldBoCard(s);

  s.injectCheckbox(li);

  const warns = warnsIn(li);

  assert.equal(warns.length, 1);
  assert.equal(
    warns[0].parentElement.className,
    'su-card-container__attributes__primary',
    'warning sits beside the checkbox, not loose on the card',
  );
  assert.match(warns[0].textContent, /Best Offer enabled/);
});

test('injectCheckbox: active + Best Offer gets no warning', () => {
  // The asking price is accurate — opening the listing would reveal nothing.
  const s = freshCross();
  const li = s.document.createElement('li');
  li.dataset.listingid = 'B2';
  li.innerHTML =
    '<a href="/itm/B2">Item</a><span>$50.00</span><span>or Best Offer</span>' +
    '<div class="su-card-container__attributes__primary"></div>';
  s.document.body.appendChild(li);

  s.injectCheckbox(li);

  assert.equal(warnsIn(li).length, 0);

  // The flag is still recorded — only the warning is sold-only. (cardData is a
  // top-level const, so it is not on the sandbox; read it back through storage.)
  const cb = li.querySelector('.ebay-scatter-cb input');
  cb.checked = true;
  cb.dispatchEvent(new s.window.Event('change', { bubbles: true }));

  assert.equal(s.loadItems()[0].bestOffer, true, 'still flagged in storage');
});

test('injectCheckbox: sold without Best Offer gets no warning', () => {
  const s = freshCross();
  const li = s.document.createElement('li');
  li.dataset.listingid = 'B3';
  li.innerHTML =
    '<a href="/itm/B3">Item</a><span>Sold  Jan 5, 2026</span>' +
    '<span>$50.00</span><span>Buy It Now</span>' +
    '<div class="su-card-container__attributes__primary"></div>';
  s.document.body.appendChild(li);

  s.injectCheckbox(li);

  assert.equal(warnsIn(li).length, 0);
});

test('injectCheckbox: a carousel module gets neither checkbox nor warning', () => {
  // invariant — a promo <li> wrapping several listings must be skipped outright,
  // not mined for its first nested item.
  const s = freshCross();
  const li = s.document.createElement('li');
  li.innerHTML =
    '<div data-listingid="C1"><a href="/itm/C1">a</a><span>$10.00</span>' +
    '<span>or Best Offer</span></div>' +
    '<div data-listingid="C2"><a href="/itm/C2">b</a><span>$20.00</span></div>';
  s.document.body.appendChild(li);

  s.injectCheckbox(li);

  assert.equal(li.querySelectorAll('.ebay-scatter-cb').length, 0);
  assert.equal(warnsIn(li).length, 0);
  assert.equal(li.dataset.scatterInjected, 'skip');
});

test('injectCheckbox: current-layout card with the id on an inner div still works', () => {
  // invariant — data-listingid moved off the <li> onto div.su-item-card.
  const s = freshCross();
  const li = s.document.createElement('li');
  li.innerHTML =
    '<div data-listingid="N1"><a href="/itm/N1">Item</a>' +
    '<span>Sold  Jan 5, 2026</span><span>$50.00</span><span>or Best Offer</span>' +
    '<div class="su-card-container__attributes__primary"></div></div>';
  s.document.body.appendChild(li);

  s.injectCheckbox(li);

  assert.equal(li.dataset.scatterInjected, '1');
  assert.equal(warnsIn(li).length, 1);

  const boxes = li.querySelectorAll('.ebay-scatter-cb input');

  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].dataset.itemId, 'N1', 'id read from the inner div');
});
