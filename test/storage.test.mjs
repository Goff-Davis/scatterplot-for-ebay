import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';

// invariant — the persistence contract: corrupt/missing storage degrades to [],
// and writes are capped at MAX_ITEMS keeping the MOST RECENT items. Each test gets
// a fresh sandbox (fresh jsdom → clean localStorage) to avoid cross-test bleed.
// The "quota exceeded / storage blocked" catch branch is not deterministically
// triggerable in jsdom, so it is intentionally not covered (TEST_PLAN.md §5F).

const STORAGE_KEY = 'ebay_scatterplot_items'; // mirrors src/constants.js (a const, not exported)
const fresh = () => loadModules(['constants.js', 'storage.js']);

// loadItems() builds its arrays inside the vm realm, so their prototype differs
// from the test realm's — assert/strict deepEqual would reject them on identity.
// Compare via JSON.stringify, which is realm-agnostic.

test('loadItems returns [] when nothing is stored', () => {
  const s = fresh();

  assert.equal(JSON.stringify(s.loadItems()), '[]');
});

test('loadItems returns [] on corrupt JSON', () => {
  const s = fresh();
  s.window.localStorage.setItem(STORAGE_KEY, '{not json');

  assert.equal(JSON.stringify(s.loadItems()), '[]');
});

test('loadItems returns [] when the stored value is literal null', () => {
  const s = fresh();
  s.window.localStorage.setItem(STORAGE_KEY, 'null'); // JSON.parse('null') || []

  assert.equal(JSON.stringify(s.loadItems()), '[]');
});

test('saveItems → loadItems round-trips', () => {
  const s = fresh();
  s.saveItems([{ id: 'a' }]);

  assert.equal(JSON.stringify(s.loadItems()), JSON.stringify([{ id: 'a' }]));
});

test('saveItems caps at MAX_ITEMS keeping the most recent (slice(-200))', () => {
  const s = fresh();
  const items = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }));
  s.saveItems(items);
  const got = s.loadItems();

  assert.equal(got.length, 200);
  assert.equal(got[0].id, '50'); // the first 50 are dropped
  assert.equal(got[199].id, '249'); // the newest is kept
});

test('saveItems leaves an under-cap list unchanged', () => {
  const s = fresh();
  const items = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
  s.saveItems(items);

  assert.equal(s.loadItems().length, 10);
});

test('saveItems([]) clears storage', () => {
  const s = fresh();
  s.saveItems([{ id: 'a' }]);
  s.saveItems([]);

  assert.equal(JSON.stringify(s.loadItems()), '[]');
});
