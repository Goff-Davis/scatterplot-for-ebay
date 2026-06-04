import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExtract } from './helpers/load.mjs';
import {
  NORMAL_FREE_SHIPPING,
  CHARGED_SHIPPING,
  BEST_OFFER,
} from './fixtures.mjs';

const x = loadExtract();
const {
  parseAmount,
  extractPrice,
  extractDate,
  extractItemId,
  extractTitle,
  extractItemData,
  card,
  parse,
} = x;

// ── parseAmount ────────────────────────────────────────────────────────────

test('parseAmount strips $, commas, and prefixes', () => {
  assert.equal(parseAmount('$1,234.56'), 1234.56);
  assert.equal(parseAmount('$107.94'), 107.94);
  assert.equal(parseAmount('US $99'), 99); // any leading prefix is ignored
  assert.ok(Number.isNaN(parseAmount('Free')));
});

// ── extractDate (H1 lock-in) ─────────────────────────────────────────────────
// These assert the displayed calendar date is stored verbatim. The suite runs
// under a pinned positive-offset TZ (see package.json "test"); the pre-fix code
// round-tripped through toISOString() (UTC) and returned the PREVIOUS day, so
// these would fail there — that is the H1 regression guard.

test('extractDate returns the displayed local date', () => {
  assert.equal(extractDate(card('<span>Sold Jan 5, 2024</span>')), '2024-01-05');
  // real eBay caption uses a double space after "Sold"
  assert.equal(extractDate(card('<span>Sold  May 26, 2026</span>')), '2026-05-26');
});

test('extractDate returns null when there is no Sold date', () => {
  assert.equal(extractDate(card('<span>Brand New</span>')), null);
  assert.equal(extractDate(card('<span>Sold by someone</span>')), null);
});

// ── extractPrice ─────────────────────────────────────────────────────────────

test('extractPrice reads a bare $ price (free shipping → item only)', () => {
  assert.equal(extractPrice(parse(NORMAL_FREE_SHIPPING)), 69.99);
});

test('extractPrice adds charged shipping (float sum → tolerance)', () => {
  const total = extractPrice(parse(CHARGED_SHIPPING));
  assert.ok(Math.abs(total - 150.98) < 0.005, `got ${total}`);
});

test('extractPrice sums synthetic item + delivery, ignores free delivery', () => {
  assert.ok(
    Math.abs(extractPrice(card('<span>$10.00</span><span>+$2.50 delivery</span>')) - 12.5) < 0.005,
  );
  assert.equal(extractPrice(card('<span>$10.00</span><span>Free delivery</span>')), 10);
});

test('extractPrice returns null for best-offer (strikethrough) prices', () => {
  assert.equal(extractPrice(parse(BEST_OFFER)), null);
});

test('extractPrice: bare $ only — a single-leaf "US $" is not matched (documents M1)', () => {
  // The captured page never emits "US $107.94" in one leaf; if it ever did, the
  // current regex would skip it. This documents that assumption rather than
  // asserting it is desirable.
  assert.equal(extractPrice(card('<span>US $107.94</span>')), null);
  assert.equal(extractPrice(card('<span>$107.94</span>')), 107.94);
});

// ── extractItemId ────────────────────────────────────────────────────────────

test('extractItemId prefers data-listingid', () => {
  const li = card('<a href="/itm/999">x</a>');
  li.setAttribute('data-listingid', '123456789012');
  assert.equal(extractItemId(li), '123456789012');
});

test('extractItemId falls back to the /itm/ URL', () => {
  const li = card('<a href="https://www.ebay.com/itm/203456789012?hash=abc">x</a>');
  assert.equal(extractItemId(li), '203456789012');
});

// ── extractTitle ─────────────────────────────────────────────────────────────

test('extractTitle uses the heading and strips clipped/hidden nodes', () => {
  const li = card(
    '<div role="heading" aria-level="3">Real Title<span class="clipped">Opens in a new window</span></div>',
  );
  assert.equal(extractTitle(li), 'Real Title');
});

test('extractTitle falls back to the card aria-label', () => {
  const li = card('<div>no heading here</div>');
  li.setAttribute('aria-label', 'Card Label');
  assert.equal(extractTitle(li), 'Card Label');
});

// ── extractItemData (integration) ────────────────────────────────────────────

test('extractItemData returns a full record for a valid card', () => {
  const d = extractItemData(parse(NORMAL_FREE_SHIPPING));
  assert.equal(d.id, '336541855208');
  assert.equal(d.date, '2026-04-24');
  assert.equal(d.price, 69.99);
  assert.ok(d.title.length > 0);
  assert.match(d.url, /\/itm\//);
});

test('extractItemData returns null for best-offer cards', () => {
  assert.equal(extractItemData(parse(BEST_OFFER)), null);
});

test('extractItemData returns null when the date is missing', () => {
  const li = card('<a href="/itm/111">t</a><span>$5.00</span>');
  li.setAttribute('data-listingid', '111');
  assert.equal(extractItemData(li), null);
});
