import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExtract } from './helpers/load.mjs';
import {
  NORMAL_FREE_SHIPPING,
  CHARGED_SHIPPING,
  BEST_OFFER,
  ACTIVE_RANGE_DELIVERY,
  ACTIVE_RANGE,
  ACTIVE_SPLIT_DELIVERY,
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

// Test buckets (TEST_PLAN.md §1):
//   invariant          — logic that must hold forever; synthetic DOM via card().
//   documents-behavior — a current/debatable choice pinned so a change is noticed.
//   markup-canary      — real captured eBay cards; fail loudly when markup shifts.
// Float sums are asserted with a tolerance, never a hand-rounded literal.

// ── parseAmount ──────────────────────────────────────────────────────────────

test('parseAmount strips $, commas, and prefixes', () => {
  // invariant
  assert.equal(parseAmount('$1,234.56'), 1234.56);
  assert.equal(parseAmount('$107.94'), 107.94);
  assert.equal(parseAmount('$5'), 5); // integer, no decimal
  assert.equal(parseAmount('$1,200.00'), 1200); // thousands
  assert.equal(parseAmount('US $99'), 99); // any leading prefix is ignored
  assert.ok(Number.isNaN(parseAmount('Free')));
  assert.ok(Number.isNaN(parseAmount('')));
});

test('parseAmount grabs the first number run', () => {
  // documents-behavior — parseAmount is a blunt "first number" scan, not a parser.
  assert.equal(parseAmount('Was $19.99 now'), 19.99);
  assert.equal(parseAmount('$10 to $20'), 10);
});

// ── extractDate (H1 lock-in) ─────────────────────────────────────────────────
// These assert the displayed calendar date is stored verbatim. The suite runs
// under a pinned positive-offset TZ (package.json "test"); the pre-fix code
// round-tripped through toISOString() (UTC) and returned the PREVIOUS day, so
// these would fail there — that is the H1 regression guard.

test('extractDate returns the displayed local date', () => {
  // invariant
  assert.equal(
    extractDate(card('<span>Sold Jan 5, 2024</span>')),
    '2024-01-05',
  );
  // real eBay caption uses a double space after "Sold"
  assert.equal(
    extractDate(card('<span>Sold  May 26, 2026</span>')),
    '2026-05-26',
  );
  // year boundary, other side
  assert.equal(
    extractDate(card('<span>Sold Jan 1, 2024</span>')),
    '2024-01-01',
  );
  // comma is optional in the regex
  assert.equal(
    extractDate(card('<span>Sold Jun 15 2026</span>')),
    '2026-06-15',
  );
});

test('extractDate keeps Dec 31 (strongest H1 / TZ lock-in)', () => {
  // invariant — THE H1 case. Under TZ=Australia/Sydney the old toISOString() bug
  // returned 2023-12-30 (the previous day). If this fails, the UTC round-trip
  // regression is back.
  assert.equal(
    extractDate(card('<span>Sold Dec 31, 2023</span>')),
    '2023-12-31',
  );
});

test('extractDate returns null when there is no Sold date', () => {
  // invariant
  assert.equal(extractDate(card('<span>Brand New</span>')), null);
  assert.equal(extractDate(card('<span>Sold by someone</span>')), null);
});

// ── extractPrice (synthetic semantics) ───────────────────────────────────────
// Class renames must not break these — they run on synthetic card() DOM.

test('extractPrice reads a bare $ price', () => {
  // invariant
  assert.equal(extractPrice(card('<span>$107.94</span>')).price, 107.94);
  assert.equal(extractPrice(card('<span>$5</span>')).price, 5); // integer price
  assert.equal(extractPrice(card('<span>$1,200.00</span>')).price, 1200); // thousands
});

test('extractPrice sums item + shipping; free shipping adds nothing', () => {
  // invariant — assert float sums with tolerance.
  assert.ok(
    Math.abs(
      extractPrice(card('<span>$10.00</span><span>+$2.50 delivery</span>'))
        .price - 12.5,
    ) < 0.005,
  ); // split-span delivery
  assert.ok(
    Math.abs(
      extractPrice(card('<span>$10.00</span><span>$3.99 shipping</span>'))
        .price - 13.99,
    ) < 0.005,
  ); // "shipping" + $
  assert.equal(
    extractPrice(card('<span>$10.00</span><span>Free delivery</span>')).price,
    10,
  );
  assert.equal(
    extractPrice(card('<span>$10.00</span><span>Free shipping</span>')).price,
    10,
  );
});

test('extractPrice detects a $X to $Y price range', () => {
  // invariant
  const d = extractPrice(
    card('<span>$8.99</span><span> to </span><span>$18.99</span>'),
  );

  assert.ok(Math.abs(d.price - 8.99) < 0.005);
  assert.ok(Math.abs(d.priceHigh - 18.99) < 0.005);
});

test('extractPrice adds shipping to BOTH ends of a range', () => {
  // invariant
  const d = extractPrice(
    card('<span>$8.99</span><span>$18.99</span><span>+$2.00 delivery</span>'),
  );

  assert.ok(Math.abs(d.price - 10.99) < 0.005, `got ${d.price}`);
  assert.ok(Math.abs(d.priceHigh - 20.99) < 0.005, `got ${d.priceHigh}`);
});

test('extractPrice returns null for a strikethrough (best-offer) price', () => {
  // invariant — strikethrough must be an INLINE style (jsdom ignores class rules).
  assert.equal(
    extractPrice(
      card('<span style="text-decoration: line-through">$50.00</span>'),
    ),
    null,
  );
});

test('extractPrice does not read a struck original price as the range high', () => {
  // invariant — a struck "was" price beside the real price is not a range high.
  const d = extractPrice(
    card(
      '<span>$10.00</span><span style="text-decoration: line-through">$40.00</span>',
    ),
  );

  assert.equal(d.price, 10);
  assert.equal(d.priceHigh, undefined);
});

test('extractPrice: a single-leaf "US $" is not matched (documents M1)', () => {
  // documents-behavior — the captured page never emits "US $107.94" in one leaf;
  // if it did, the current regex would skip it. This pins the assumption rather
  // than asserting it is desirable.
  assert.equal(extractPrice(card('<span>US $107.94</span>')), null);
  assert.equal(extractPrice(card('<span>$107.94</span>')).price, 107.94);
});

// ── extractItemId ────────────────────────────────────────────────────────────

test('extractItemId prefers data-listingid', () => {
  // invariant
  const li = card('<a href="/itm/999">x</a>');
  li.setAttribute('data-listingid', '123456789012');

  assert.equal(extractItemId(li), '123456789012');
});

test('extractItemId falls back to the /itm/ URL', () => {
  // invariant
  assert.equal(
    extractItemId(
      card('<a href="https://www.ebay.com/itm/203456789012?hash=abc">x</a>'),
    ),
    '203456789012',
  );
});

test('extractItemId parses the id after a title slug segment', () => {
  // invariant — /itm/<slug>/<id> form
  assert.equal(
    extractItemId(
      card(
        '<a href="https://www.ebay.com/itm/Some-Cool-Title/203456789012?x=1">x</a>',
      ),
    ),
    '203456789012',
  );
});

test('extractItemId returns null with no listingid and no /itm/ link', () => {
  // invariant
  assert.equal(extractItemId(card('<a href="/p/foo">x</a>')), null);
});

// ── extractTitle ─────────────────────────────────────────────────────────────

test('extractTitle uses the heading and strips clipped/hidden nodes', () => {
  // invariant
  const li = card(
    '<div role="heading" aria-level="3">Real Title<span class="clipped">Opens in a new window</span></div>',
  );

  assert.equal(extractTitle(li), 'Real Title');
});

test('extractTitle falls back to the card aria-label', () => {
  // invariant
  const li = card('<div>no heading here</div>');
  li.setAttribute('aria-label', 'Card Label');

  assert.equal(extractTitle(li), 'Card Label');
});

// ── extractItemData (classification rules, synthetic) ─────────────────────────

test("extractItemData uses today's date and type='unsold' for active listings", () => {
  // invariant — no "Sold " caption → type unsold, date falls back to today (local).
  const li = card('<a href="/itm/111">t</a><span>$5.00</span>');
  li.setAttribute('data-listingid', '111');
  const item = extractItemData(li);

  assert.ok(item !== null);
  assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(item.type, 'unsold');
  assert.equal(item.price, 5);
});

test("extractItemData sets type='sold' and stores the sold date", () => {
  // invariant
  const li = card(
    '<a href="/itm/222">t</a><span>$5.00</span><span>Sold Jan 5, 2024</span>',
  );
  li.setAttribute('data-listingid', '222');
  const item = extractItemData(li);

  assert.equal(item.type, 'sold');
  assert.equal(item.date, '2024-01-05');
});

test('extractItemData propagates priceHigh into the record', () => {
  // invariant
  const li = card(
    '<a href="/itm/333">t</a><span>$8.99</span><span> to </span><span>$18.99</span>',
  );
  li.setAttribute('data-listingid', '333');

  assert.ok(Math.abs(extractItemData(li).priceHigh - 18.99) < 0.005);
});

test('extractItemData returns null without an id', () => {
  // invariant — id required (no listingid, no /itm/ link)
  assert.equal(extractItemData(card('<span>$5.00</span>')), null);
});

test('extractItemData returns null without a parseable price', () => {
  // invariant — price required
  const li = card('<a href="/itm/444">t</a><span>no price here</span>');
  li.setAttribute('data-listingid', '444');

  assert.equal(extractItemData(li), null);
});

test("extractItemData falls back to 'Unknown item' with no title", () => {
  // invariant — title fallback (no heading and no aria-label)
  const li = card('<a href="/itm/555">t</a><span>$5.00</span>');
  li.setAttribute('data-listingid', '555');

  assert.equal(extractItemData(li).title, 'Unknown item');
});

// ── markup-canary: real captured eBay cards ──────────────────────────────────
// Intentionally coupled to eBay's HTML — these fail loudly when the markup shifts.
// markup-canary: refresh when eBay changes.

test('markup-canary: NORMAL_FREE_SHIPPING — sold, free delivery', () => {
  const d = extractItemData(parse(NORMAL_FREE_SHIPPING));

  assert.equal(d.id, '336541855208');
  assert.equal(d.date, '2026-04-24');
  assert.equal(d.price, 69.99);
  assert.equal(d.type, 'sold');
  assert.ok(d.title.length > 0);
});

test('markup-canary: CHARGED_SHIPPING — sold, item + paid delivery', () => {
  const r = extractPrice(parse(CHARGED_SHIPPING));

  assert.ok(Math.abs(r.price - 150.98) < 0.005, `got ${r.price}`);
});

test('markup-canary: BEST_OFFER — struck price → null', () => {
  assert.equal(extractPrice(parse(BEST_OFFER)), null);
  assert.equal(extractItemData(parse(BEST_OFFER)), null);
});

test('markup-canary: ACTIVE_RANGE_DELIVERY — active range + split delivery', () => {
  const d = extractItemData(parse(ACTIVE_RANGE_DELIVERY));

  assert.equal(d.id, '284586461118');
  assert.equal(d.type, 'unsold');
  assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/); // today's fallback — never a literal date
  assert.ok(Math.abs(d.price - 10.98) < 0.005, `got ${d.price}`); // 5.99 + 4.99
  assert.ok(Math.abs(d.priceHigh - 11.98) < 0.005, `got ${d.priceHigh}`); // 6.99 + 4.99
});

test('markup-canary: ACTIVE_RANGE — active range, no delivery', () => {
  const d = extractItemData(parse(ACTIVE_RANGE));

  assert.equal(d.id, '167030069483');
  assert.equal(d.type, 'unsold');
  assert.ok(Math.abs(d.price - 8.99) < 0.005, `got ${d.price}`);
  assert.ok(Math.abs(d.priceHigh - 18.99) < 0.005, `got ${d.priceHigh}`);
});

test('markup-canary: ACTIVE_SPLIT_DELIVERY — active, split-span delivery', () => {
  const d = extractItemData(parse(ACTIVE_SPLIT_DELIVERY));

  assert.equal(d.id, '174433187577');
  assert.equal(d.type, 'unsold');
  assert.ok(Math.abs(d.price - 16.4) < 0.005, `got ${d.price}`); // 12.50 + 3.90
  assert.equal(d.priceHigh, undefined);
});
