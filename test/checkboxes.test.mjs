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
