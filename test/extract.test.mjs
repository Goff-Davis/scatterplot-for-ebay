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
  AU_SOLD,
  UK_SOLD,
  CA_EN_SOLD,
  CA_FR_SOLD,
  FR_SOLD,
  IT_GIU_SOLD,
  IT_MAGG_SOLD,
  DE_SOLD,
  ES_SOLD,
  MX_EN_SOLD,
  MX_ES_SOLD,
  NEW_SOLD_BEST_OFFER,
  NEW_SOLD_DISCOUNT,
  NEW_ACTIVE_RANGE,
  NEW_CAROUSEL_MODULE,
  UK_UNSOLD_RANGE,
  AU_UNSOLD_RANGE_STRUCK,
  CA_EN_UNSOLD_RANGE,
  CA_FR_UNSOLD_RANGE,
  FR_UNSOLD_RANGE,
  FR_UNSOLD_AUCTION_BIN,
  FR_UNSOLD_AUCTION,
  DE_UNSOLD_RANGE,
  DE_UNSOLD_UVP,
  IT_UNSOLD_RANGE,
  ES_UNSOLD_RANGE_STRUCK,
  IT_SOLD_BEST_OFFER,
  US_SOLD_COUPON,
  US_SOLD_BEST_OFFER_NEW_LISTING,
} from './fixtures.mjs';

const x = loadExtract();
const {
  parseAmount,
  extractPrice,
  extractDate,
  extractItemId,
  extractTitle,
  extractItemData,
  listingRoot,
  card,
  parse,
} = x;

// Test buckets:
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

test('extractPrice reads prefixed dollar amounts (C $, AU $, MXN $, US $)', () => {
  // invariant — international dollar prefixes are now supported.
  assert.ok(
    Math.abs(extractPrice(card('<span>C $22.57</span>')).price - 22.57) < 0.005,
  );
  assert.ok(
    Math.abs(extractPrice(card('<span>AU $33.46</span>')).price - 33.46) <
      0.005,
  );
  assert.ok(
    Math.abs(extractPrice(card('<span>MXN $1,464.45</span>')).price - 1464.45) <
      0.005,
  );
  assert.ok(
    Math.abs(extractPrice(card('<span>US $107.94</span>')).price - 107.94) <
      0.005,
  );
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

// ── International: parseAmount — space/NBSP thousands ────────────────────────

test('parseAmount handles space and NBSP thousands separators', () => {
  // invariant
  assert.equal(parseAmount('350 000,00 EUR'), 350000); // space sep, comma decimal (FR large)
  assert.equal(parseAmount('MXN $6 460.80'), 6460.8); // NBSP sep, period decimal (MX ES)
});

// ── International: parseAmount EUR comma-decimal ─────────────────────────────

test('parseAmount handles EUR comma-decimal format', () => {
  // invariant
  assert.equal(parseAmount('EUR 12,40'), 12.4);
  assert.equal(parseAmount('29,01 EUR'), 29.01);
  assert.equal(parseAmount('EUR 1.234,56'), 1234.56); // EUR with thousands period
  assert.equal(parseAmount('+EUR 2,95 Lieferung'), 2.95); // DE shipping with keyword
  assert.equal(parseAmount('+ 8,50 EUR de envío'), 8.5); // ES shipping
});

// ── International: extractDate day-first and non-English months ───────────────

test('extractDate handles day-first format (UK, AU, CA EN)', () => {
  // invariant
  assert.equal(
    extractDate(card('<span>Sold  14 Jun 2026</span>')),
    '2026-06-14',
  );
});

test('extractDate handles non-English sold prefixes and month names', () => {
  // invariant
  assert.equal(
    extractDate(card('<span>Verkauft  13. Jun 2026</span>')),
    '2026-06-13',
  );
  assert.equal(
    extractDate(card('<span>Vendu le  8 mai 2026</span>')),
    '2026-05-08',
  );
  assert.equal(
    extractDate(card('<span>Vendu  13 juin 2026</span>')),
    '2026-06-13',
  );
  assert.equal(
    extractDate(card('<span>Venduti  11 giu. 2026</span>')),
    '2026-06-11',
  );
  assert.equal(
    extractDate(card('<span>Venduti  10 magg. 2026</span>')),
    '2026-05-10',
  );
  assert.equal(
    extractDate(card('<span>Vendidos  14 jun 2026</span>')),
    '2026-06-14',
  );
  assert.equal(
    extractDate(card('<span>Vendido  11 jun 2026</span>')),
    '2026-06-11',
  );
});

test('extractDate skips a title leaf that starts with a sold-word but has no parseable date', () => {
  // invariant — "Sold Out…" title must not shadow the real date caption
  assert.equal(
    extractDate(
      card(
        '<span>Sold Out - Available Soon</span><span>Sold  14 Jun 2026</span>',
      ),
    ),
    '2026-06-14',
  );
});

// ── International: extractPrice £ and EUR formats ────────────────────────────

test('extractPrice reads £ prices (UK)', () => {
  // invariant
  assert.ok(
    Math.abs(extractPrice(card('<span>£11.00</span>')).price - 11.0) < 0.005,
  );
});

test('extractPrice reads EUR prefix prices (DE, IT)', () => {
  // invariant
  assert.ok(
    Math.abs(extractPrice(card('<span>EUR 12,40</span>')).price - 12.4) < 0.005,
  );
});

test('extractPrice reads EUR suffix prices (FR, ES)', () => {
  // invariant
  assert.ok(
    Math.abs(extractPrice(card('<span>29,01 EUR</span>')).price - 29.01) <
      0.005,
  );
});

test('extractPrice reads $C prices (Canada French)', () => {
  // invariant
  assert.ok(
    Math.abs(extractPrice(card('<span>22,57 $C</span>')).price - 22.57) < 0.005,
  );
});

test('extractPrice detects currency symbol from price element text', () => {
  // invariant
  assert.equal(extractPrice(card('<span>£15.99</span>')).currencySymbol, '£');
  assert.equal(
    extractPrice(card('<span>EUR 12,40</span>')).currencySymbol,
    '€',
  );
  assert.equal(
    extractPrice(card('<span>29,01 EUR</span>')).currencySymbol,
    '€',
  );
  assert.equal(
    extractPrice(card('<span>C $29.98</span>')).currencySymbol,
    'C$',
  );
  assert.equal(
    extractPrice(card('<span>22,57 $C</span>')).currencySymbol,
    'C$',
  );
  assert.equal(
    extractPrice(card('<span>AU $33.46</span>')).currencySymbol,
    'AU$',
  );
  assert.equal(
    extractPrice(card('<span>MXN $310.12</span>')).currencySymbol,
    'MXN$',
  );
  assert.equal(extractPrice(card('<span>$107.94</span>')).currencySymbol, '$');
  assert.equal(
    extractPrice(card('<span>US $107.94</span>')).currencySymbol,
    '$',
  );
});

test('extractPrice adds EUR shipping to price (DE/IT pattern)', () => {
  // invariant
  const d = extractPrice(
    card('<span>EUR 7,75</span><span>+EUR 2,95 Lieferung</span>'),
  );
  assert.ok(Math.abs(d.price - 10.7) < 0.005, `got ${d.price}`);
});

test('extractPrice adds EUR shipping to price (FR/ES pattern)', () => {
  // invariant
  const d = extractPrice(
    card('<span>29,01 EUR</span><span>+13,04 EUR pour la livraison</span>'),
  );
  assert.ok(Math.abs(d.price - 42.05) < 0.005, `got ${d.price}`);
});

// ── markup-canary: international sold listings ────────────────────────────────

test('markup-canary: AU_SOLD — AU$ day-first date, split delivery', () => {
  const d = extractItemData(parse(AU_SOLD));
  assert.equal(d.id, '316831955834');
  assert.equal(d.date, '2026-06-14');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 46.0) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, 'AU$');
});

test('markup-canary: UK_SOLD — £ price, split +£1.55 delivery span', () => {
  const d = extractItemData(parse(UK_SOLD));
  assert.equal(d.id, '316831955834');
  assert.equal(d.date, '2026-06-14');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 17.54) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, '£');
});

test('markup-canary: CA_EN_SOLD — C$ prefix price, day-first date', () => {
  const d = extractItemData(parse(CA_EN_SOLD));
  assert.equal(d.id, '316831955834');
  assert.equal(d.date, '2026-06-14');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 41.21) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, 'C$');
});

test('markup-canary: CA_FR_SOLD — $C suffix price, Vendu french date, expédition shipping', () => {
  const d = extractItemData(parse(CA_FR_SOLD));
  assert.equal(d.id, '146893875871');
  assert.equal(d.date, '2026-06-13');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 42.19) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, 'C$');
});

test('markup-canary: FR_SOLD — EUR suffix, Vendu le + mai, free shipping', () => {
  const d = extractItemData(parse(FR_SOLD));
  assert.equal(d.id, '295875474042');
  assert.equal(d.date, '2026-05-08');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 6.0) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, '€');
});

test('markup-canary: IT_GIU_SOLD — EUR prefix, Venduti + giu., "SPEDIZIONE GRATUITA" in title ignored', () => {
  const d = extractItemData(parse(IT_GIU_SOLD));
  assert.equal(d.id, '176502963636');
  assert.equal(d.date, '2026-06-11');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 27.51) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, '€');
});

test('markup-canary: IT_MAGG_SOLD — Venduti + magg. (maggio fix), EUR prefix', () => {
  const d = extractItemData(parse(IT_MAGG_SOLD));
  assert.equal(d.id, '186698751424');
  assert.equal(d.date, '2026-05-31');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 27.92) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, '€');
});

test('markup-canary: DE_SOLD — EUR prefix, Verkauft + period-day, Lieferung shipping', () => {
  const d = extractItemData(parse(DE_SOLD));
  assert.equal(d.id, '176380896866');
  assert.equal(d.date, '2026-06-13');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 10.7) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, '€');
});

test('markup-canary: ES_SOLD — EUR suffix, Vendidos, envío shipping', () => {
  const d = extractItemData(parse(ES_SOLD));
  assert.equal(d.id, '188471718932');
  assert.equal(d.date, '2026-06-14');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 39.76) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, '€');
});

test('markup-canary: MX_EN_SOLD — MXN$ prefix, month-first date', () => {
  const d = extractItemData(parse(MX_EN_SOLD));
  assert.equal(d.id, '188285590204');
  assert.equal(d.date, '2026-06-14');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 1219.28) < 0.005, `got ${d.price}`);
  assert.equal(d.currencySymbol, 'MXN$');
});

test('markup-canary: MX_ES_SOLD — MXN$ + NBSP thousands, Vendido, envío shipping', () => {
  const d = extractItemData(parse(MX_ES_SOLD));
  assert.equal(d.id, '147349367091');
  assert.equal(d.date, '2026-06-11');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 3849.26) < 0.005, `got ${d.price}`);
  assert.equal(d.priceHigh, undefined);
  assert.equal(d.currencySymbol, 'MXN$');
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

// ── listingRoot (current layout moved data-listingid off the <li>) ────────────

test('listingRoot returns the card itself when the id is on it (old layout)', () => {
  // invariant
  const li = card('<a href="/itm/1">x</a>');
  li.dataset.listingid = '123';

  assert.equal(listingRoot(li), li);
});

test('listingRoot returns the inner element carrying the id (current layout)', () => {
  // invariant
  const li = card('<div data-listingid="123"><a href="/itm/1">x</a></div>');

  assert.equal(listingRoot(li), li.querySelector('[data-listingid]'));
});

test('listingRoot returns null for a module wrapping several listings', () => {
  // invariant — a carousel <li> holds many cards; treating it as one makes
  // extractItemId's /itm/ fallback return the first nested item.
  const li = card(
    '<div data-listingid="1"><a href="/itm/1">a</a></div>' +
      '<div data-listingid="2"><a href="/itm/2">b</a></div>',
  );

  assert.equal(listingRoot(li), null);
});

test('listingRoot falls back to the card when no id has rendered yet', () => {
  // invariant — keeps the observer's lazy-render retry working.
  const li = card('<a href="/itm/1">x</a>');

  assert.equal(listingRoot(li), li);
});

// ── single-span ranges (current layout renders "$599.99 - $649.99" as one span) ──

test('extractPrice parses a range inside a single element', () => {
  // invariant
  const d = extractPrice(card('<span>$599.99 - $649.99</span>'));

  assert.ok(Math.abs(d.price - 599.99) < 0.005, `got ${d.price}`);
  assert.ok(Math.abs(d.priceHigh - 649.99) < 0.005, `got ${d.priceHigh}`);
});

test('extractPrice parses a single-span range with a "to" separator', () => {
  // invariant
  const d = extractPrice(card('<span>$8.99 to $18.99</span>'));

  assert.ok(Math.abs(d.price - 8.99) < 0.005, `got ${d.price}`);
  assert.ok(Math.abs(d.priceHigh - 18.99) < 0.005, `got ${d.priceHigh}`);
});

test('extractPrice ignores a struck "was" price rather than reading it as a range high', () => {
  // invariant — the wrapper divs inherit the struck span's textContent, so an
  // unfiltered sibling scan mistook the "was" price for the top of a range.
  const d = extractPrice(
    card(
      '<div><span>$450.00</span>' +
        '<div><div><span style="text-decoration: line-through">$500.00</span></div></div></div>',
    ),
  );

  assert.ok(Math.abs(d.price - 450) < 0.005, `got ${d.price}`);
  assert.equal(d.priceHigh, undefined);
});

// ── bestOffer (Best Offer ENABLED — never "an offer was accepted") ────────────

test('extractItemData flags bestOffer in every supported locale phrasing', () => {
  // invariant. Every phrase was copied from a real card (DE and IT are pinned on real
  // markup by the DE_UNSOLD_UVP and IT_SOLD_BEST_OFFER canaries below).
  const phrases = [
    'or Best Offer',
    'o Mejor oferta',
    'ou Faire une offre',
    'ou Offre directe',
    'oder Preisvorschlag',
    "o Proposta d'acquisto",
  ];

  for (const p of phrases) {
    const li = card(
      `<a href="/itm/9">t</a><span>$10.00</span><span>${p}</span>`,
    );
    li.dataset.listingid = '9';

    assert.equal(extractItemData(li).bestOffer, true, p);
  }
});

test('extractItemData omits bestOffer when Best Offer is not offered', () => {
  // invariant — absent, not false, so the field only appears when it means something.
  const li = card(
    '<a href="/itm/9">t</a><span>$10.00</span><span>Buy It Now</span>',
  );
  li.dataset.listingid = '9';

  assert.equal('bestOffer' in extractItemData(li), false);
});

// ── markup-canary: current layout (captured 2026-07) ──────────────────────────

test('markup-canary: NEW_SOLD_BEST_OFFER — sold + Best Offer, flagged', () => {
  const d = extractItemData(parse(NEW_SOLD_BEST_OFFER));

  assert.equal(d.id, '278185590765');
  assert.equal(d.type, 'sold');
  assert.equal(d.date, '2026-07-15');
  assert.equal(d.bestOffer, true);
  assert.ok(Math.abs(d.price - 274.45) < 0.005, `got ${d.price}`); // 160.00 + 114.45
});

test('markup-canary: NEW_SOLD_DISCOUNT — struck "was" price is not a range', () => {
  const d = extractItemData(parse(NEW_SOLD_DISCOUNT));

  assert.equal(d.id, '178228743563');
  assert.equal(d.type, 'sold');
  assert.ok(Math.abs(d.price - 2299.99) < 0.005, `got ${d.price}`); // free delivery
  assert.equal(d.priceHigh, undefined); // the struck $5,499.99 must not leak in
});

test('markup-canary: NEW_ACTIVE_RANGE — single-span range + delivery', () => {
  const d = extractItemData(parse(NEW_ACTIVE_RANGE));

  assert.equal(d.id, '187472505512');
  assert.equal(d.type, 'unsold');
  assert.ok(Math.abs(d.price - 681.57) < 0.005, `got ${d.price}`); // 599.99 + 81.58
  assert.ok(Math.abs(d.priceHigh - 731.57) < 0.005, `got ${d.priceHigh}`); // 649.99 + 81.58
});

test('markup-canary: NEW_CAROUSEL_MODULE — a carousel is not a listing', () => {
  assert.equal(extractItemData(parse(NEW_CAROUSEL_MODULE)), null);
});

test('extractPrice ignores a single-span range whose high is not above the low', () => {
  // invariant — a priceHigh <= price makes the item INVISIBLE on the active chart:
  // renderUnsoldChart suppresses the dot for anything with a priceHigh and the range
  // line is zero-length/inverted, so it stays checked and counted but unplotted.
  const same = extractPrice(card('<span>$599.99 - $599.99</span>'));

  assert.ok(Math.abs(same.price - 599.99) < 0.005, `got ${same.price}`);
  assert.equal(same.priceHigh, undefined);

  const reversed = extractPrice(card('<span>$50.00 - $20.00</span>'));

  assert.ok(Math.abs(reversed.price - 50) < 0.005, `got ${reversed.price}`);
  assert.equal(reversed.priceHigh, undefined);
});

test('RANGE_RE is no looser about case than PRICE_RE', () => {
  // invariant — both are built from PRICE_BODY, so a currency code rejected on its own
  // must also be rejected inside a range. RANGE_RE used to carry the `i` flag (needed
  // only for the "to" separator), which silently made its endpoints case-insensitive.
  assert.equal(extractPrice(card('<span>eur 12,40</span>')), null);
  assert.equal(extractPrice(card('<span>eur 12,40 - eur 15,00</span>')), null);

  // ...and the separator still tolerates either case.
  for (const text of ['$8.99 to $18.99', '$8.99 To $18.99']) {
    const d = extractPrice(card(`<span>${text}</span>`));

    assert.ok(Math.abs(d.price - 8.99) < 0.005, text);
    assert.ok(Math.abs(d.priceHigh - 18.99) < 0.005, text);
  }
});

// ── October 2026: s-card layout, all nine sites ───────────────────────────────

const near = (got, want, what) =>
  assert.ok(Math.abs(got - want) < 0.005, `${what}: got ${got}, want ${want}`);

// eBay puts a real NBSP in a few price and delivery strings (ES "+ 12,03 EUR", CA-FR
// "expédition (22,98 $C)"). Built from its code point so the file holds no literal one.
const NBSP = String.fromCharCode(160);

// One <div> row per cell, as on the real cards, so cells sit in different parents.
const rows = (...cells) =>
  cells.map((c) => `<div><span>${c}</span></div>`).join('');

// ── extractDate: month vocabulary ────────────────────────────────────────────

test('extractDate reads the two captions that used to fall through (DE Mrz, IT genn.)', () => {
  // invariant. Both are real sold captions. The unknown month made the caption unparseable,
  // so the card was typed unsold, dated today, and plotted on the active chart.
  assert.equal(
    extractDate(card('<span>Verkauft  22. Mrz 2026</span>')),
    '2026-03-22',
  );
  assert.equal(
    extractDate(card('<span>Venduti  19 genn. 2025</span>')),
    '2025-01-19',
  );
});

test('extractDate knows all twelve months of every site', () => {
  // invariant. [sold prefix, day, the twelve month tokens as eBay writes them]. A single
  // missing token silently turns sold items into active ones, so every month is listed,
  // not only the ones seen so far. Not seen in any capture (standard forms of the same
  // family): IT febbr. and sett., CA-FR juill.
  const sites = {
    'US/UK/AU/CA-EN': [
      'Sold',
      '5',
      'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec',
    ],
    FR: [
      'Vendu le',
      '5',
      'janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc.',
    ],
    'CA-FR': [
      'Vendu',
      '5',
      'janv. févr. mars avr. mai juin juill. août sept. oct. nov. déc.',
    ],
    DE: ['Verkauft', '5.', 'Jan Feb Mrz Apr Mai Jun Jul Aug Sep Okt Nov Dez'],
    IT: [
      'Venduti',
      '5',
      'genn. febbr. mar. apr. magg. giu. lug. ago. sett. ott. nov. dic.',
    ],
    ES: ['Vendidos', '5', 'ene feb mar abr may jun jul ago sep oct nov dic'],
  };

  for (const [site, [prefix, day, months]] of Object.entries(sites)) {
    months.split(' ').forEach((token, i) => {
      const mm = String(i + 1).padStart(2, '0');

      assert.equal(
        extractDate(card(`<span>${prefix}  ${day} ${token} 2026</span>`)),
        `2026-${mm}-05`,
        `${site}: ${token}`,
      );
    });
  }
});

// ── extractPrice: ranges split across spans ──────────────────────────────────

test("extractPrice reads a split range in every site's range word", () => {
  // invariant. [low, word between, high, expected low, expected high]. eBay puts "to",
  // "à", "bis" or "a" between the two ends, each in its own span.
  const cases = [
    ['£5.99', 'to', '£6.99', 5.99, 6.99],
    ['AU $31.57', 'to', 'AU $54.12', 31.57, 54.12],
    ['C $239.52', 'to', 'C $268.03', 239.52, 268.03],
    ['239,52 $C', 'à', '268,03 $C', 239.52, 268.03],
    ['34,58 EUR', 'à', '35,61 EUR', 34.58, 35.61],
    ['EUR 12,59', 'bis', 'EUR 12,69', 12.59, 12.69],
    ['EUR 15,90', 'a', 'EUR 36,90', 15.9, 36.9],
    ['54,01 EUR', 'a', '59,41 EUR', 54.01, 59.41],
  ];

  for (const [lo, word, hi, wantLo, wantHi] of cases) {
    const d = extractPrice(
      card(
        `<div><span>${lo}</span><span> ${word} </span><span>${hi}</span></div>`,
      ),
    );

    near(d.price, wantLo, `${lo} ${word} ${hi}, low`);
    near(d.priceHigh, wantHi, `${lo} ${word} ${hi}, high`);
  }
});

test('extractPrice does not read a labelled reference price as a range high', () => {
  // invariant. DE rows read "EUR 14,60  UVP  EUR 49,90": UVP is the manufacturer's list
  // price, so the second figure is not the top of a range. Only a bare range word, or
  // nothing, may sit between the two prices.
  for (const label of ['UVP ', 'RRP ', 'Was ', 'From ']) {
    const d = extractPrice(
      card(
        '<div><span>EUR 14,60</span><span class="su-spacer"></span>' +
          `<span>${label}</span><span>EUR 49,90</span></div>`,
      ),
    );

    near(d.price, 14.6, label);
    assert.equal(d.priceHigh, undefined, label);
  }
});

// ── extractPrice: delivery wordings and coupons ──────────────────────────────

test('extractPrice adds estimated delivery in every wording', () => {
  // invariant. [price, delivery text, expected total]. Foreign-seller cards say the
  // delivery cost is an estimate, but it is still added.
  const cases = [
    ['EUR 8,27', '+ ca. EUR 16,01 Versand', 24.28],
    ['EUR 2,09', '+EUR 17,51 di spese di spedizione stimate', 19.6],
    ['47,26 EUR', `+${NBSP}18,31 EUR de envío estimado`, 65.57],
    ['AU $75.81', '+AU $37.73 postage estimate', 113.54],
    ['C $47.17', '+C $40.08 shipping estimate', 87.25],
    ['47,17 $C', "+40,08 $C de frais d'expédition estimés", 87.25],
    ['75,45 $C', `+ expédition${NBSP}(29,34 $C)`, 104.79],
  ];

  for (const [price, shipping, want] of cases) {
    near(extractPrice(card(rows(price, shipping))).price, want, shipping);
  }
});

test('extractPrice adds nothing when postage is not specified', () => {
  // documents-behavior. AU "Postage not specified" has no amount, so the price stands alone.
  const d = extractPrice(card(rows('AU $396.88', 'Postage not specified')));

  near(d.price, 396.88, 'price');
  assert.equal(d.priceHigh, undefined);
});

test('extractPrice ignores a coupon price in its own row', () => {
  // documents-behavior. "$24.99" then "$21.24 with coupon": the list price is plotted.
  // The coupon figure is neither the price nor a range high (it sits in another row).
  const d = extractPrice(
    card(
      rows('$24.99') +
        '<div><span>$21.24</span><span>with coupon</span></div>' +
        rows('+$12.08 delivery'),
    ),
  );

  near(d.price, 37.07, 'price');
  assert.equal(d.priceHigh, undefined);
});

// ── extractTitle ─────────────────────────────────────────────────────────────

test('extractTitle drops the "New listing" badge', () => {
  // invariant. The badge is a sibling span inside the heading, in the site's language
  // ("New Listing", "Nouvelle annonce", "Neues Angebot", ...), and used to be glued onto
  // the front of the title.
  const li = card(
    '<div role="heading" aria-level="3">' +
      '<span class="s-card__new-listing">Nouvelle annonce</span>' +
      '<span>Real Title</span>' +
      '<span class="clipped">Opens in a new window or tab</span></div>',
  );

  assert.equal(extractTitle(li), 'Real Title');
});

// ── extractPrice: live auctions with Buy It Now ──────────────────────────────

test('extractPrice reads a live auction with Buy It Now as a range from the current bid', () => {
  // invariant. The card lists the current bid, the bid count, the Buy It Now price in its
  // own row, a Buy It Now label, then delivery. Delivery is added to both ends, like a
  // variation range. Each site words the bid count differently.
  const cases = [
    // [site, bid, bid count, Buy It Now, label, delivery, low, high]
    [
      'US',
      '$12.00',
      '3 bids',
      '$25.00',
      'Buy It Now',
      '+$5.00 delivery',
      17,
      30,
    ],
    [
      'UK, 1 bid',
      '£8.00',
      '1 bid',
      '£20.00',
      'Buy It Now',
      'Free delivery',
      8,
      20,
    ],
    [
      'AU, 0 bids',
      'AU $5.00',
      '0 bids',
      'AU $15.00',
      'Buy It Now',
      '+AU $4.00 delivery',
      9,
      19,
    ],
    [
      'CA-EN',
      'C $10.00',
      '2 bids',
      'C $30.00',
      'Buy It Now',
      '+C $5.00 shipping',
      15,
      35,
    ],
    [
      'CA-FR',
      '10,00 $C',
      '2 enchères',
      '30,00 $C',
      'Achat immédiat',
      `+ expédition${NBSP}(5,00 $C)`,
      15,
      35,
    ],
    [
      'FR, NBSP in count',
      '21,25 EUR',
      `0${NBSP}enchères`,
      '41,92 EUR',
      'Achat immédiat',
      '+10,00 EUR pour la livraison',
      31.25,
      51.92,
    ],
    [
      'DE, Gebote',
      'EUR 9,00',
      '5 Gebote',
      'EUR 19,00',
      'Sofort-Kaufen',
      '+EUR 4,00 Lieferung',
      13,
      23,
    ],
    [
      'DE, 1 Gebot',
      'EUR 9,00',
      '1 Gebot',
      'EUR 19,00',
      'Sofort-Kaufen',
      'Gratis Lieferung',
      9,
      19,
    ],
    [
      'IT, offerte',
      'EUR 9,00',
      '4 offerte',
      'EUR 19,00',
      'Compralo Subito',
      '+EUR 4,00 per la consegna',
      13,
      23,
    ],
    [
      'IT, 1 offerta',
      'EUR 9,00',
      '1 offerta',
      'EUR 19,00',
      'Compralo Subito',
      'Consegna gratuita',
      9,
      19,
    ],
    [
      'ES, pujas',
      '9,00 EUR',
      '5 pujas',
      '19,00 EUR',
      '¡Cómpralo ya!',
      `+${NBSP}4,00 EUR de envío`,
      13,
      23,
    ],
    [
      'ES, 1 puja',
      '9,00 EUR',
      '1 puja',
      '19,00 EUR',
      '¡Cómpralo ya!',
      'Envío gratis',
      9,
      19,
    ],
  ];

  for (const [site, bid, count, bin, label, shipping, lo, hi] of cases) {
    const d = extractPrice(card(rows(bid, count, bin, label, shipping)));

    near(d.price, lo, `${site}, low`);
    near(d.priceHigh, hi, `${site}, high`);
  }
});

test('extractPrice keeps a live auction without Buy It Now as a single price', () => {
  // invariant
  const d = extractPrice(card(rows('$12.00', '3 bids', '+$5.00 delivery')));

  near(d.price, 17, 'price');
  assert.equal(d.priceHigh, undefined);
});

test('extractPrice shows a sold auction as its final price only', () => {
  // documents-behavior. "Sold ... 10 bids" is the end of the auction, not a live one, and
  // eBay shows no Buy It Now price on it, so there is nothing to range to.
  const d = extractPrice(
    card(rows('Sold  Oct 12, 2026', '$43.00', '10 bids', '+$9.50 delivery')),
  );

  near(d.price, 52.5, 'price');
  assert.equal(d.priceHigh, undefined);
});

test('extractPrice ignores a struck or not-higher Buy It Now price', () => {
  // invariant
  const struck = extractPrice(
    card(
      rows('$12.00', '3 bids') +
        '<div><span style="text-decoration: line-through">$25.00</span></div>',
    ),
  );
  const lower = extractPrice(
    card(rows('$30.00', '3 bids', '$25.00', 'Buy It Now')),
  );

  assert.equal(struck.priceHigh, undefined, 'struck');
  assert.equal(lower.priceHigh, undefined, 'not above the bid');
});

// ── markup-canary: October 2026, s-card layout ───────────────────────────────

test('markup-canary: UK_UNSOLD_RANGE, £ range with free delivery and a unit-price row', () => {
  const d = extractItemData(parse(UK_UNSOLD_RANGE));

  assert.equal(d.id, '387277080371');
  assert.equal(d.type, 'unsold');
  assert.equal(d.currencySymbol, '£');
  near(d.price, 5.99, 'price');
  near(d.priceHigh, 6.99, 'priceHigh');
});

test('markup-canary: AU_UNSOLD_RANGE_STRUCK, struck price after the high end is ignored', () => {
  const d = extractItemData(parse(AU_UNSOLD_RANGE_STRUCK));

  assert.equal(d.id, '287169811974');
  assert.equal(d.type, 'unsold');
  assert.equal(d.currencySymbol, 'AU$');
  near(d.price, 31.57, 'price');
  near(d.priceHigh, 54.12, 'priceHigh'); // not the struck AU $55.81
});

test('markup-canary: CA_EN_UNSOLD_RANGE and CA_FR_UNSOLD_RANGE, one listing in both languages', () => {
  for (const html of [CA_EN_UNSOLD_RANGE, CA_FR_UNSOLD_RANGE]) {
    const d = extractItemData(parse(html));

    assert.equal(d.id, '198652190674');
    assert.equal(d.type, 'unsold');
    assert.equal(d.currencySymbol, 'C$');
    near(d.price, 253.78, 'price'); // 239.52 + 14.26
    near(d.priceHigh, 282.29, 'priceHigh'); // 268.03 + 14.26
  }
});

test('markup-canary: FR_UNSOLD_RANGE, "à" range with free delivery', () => {
  const d = extractItemData(parse(FR_UNSOLD_RANGE));

  assert.equal(d.id, '406205301484');
  assert.equal(d.type, 'unsold');
  near(d.price, 34.58, 'price');
  near(d.priceHigh, 35.61, 'priceHigh');
});

test('markup-canary: FR_UNSOLD_AUCTION_BIN, live auction is a range from the bid to Buy It Now', () => {
  const d = extractItemData(parse(FR_UNSOLD_AUCTION_BIN));

  assert.equal(d.id, '237112788340');
  assert.equal(d.type, 'unsold');
  near(d.price, 31.25, 'price'); // bid 21,25 + 10,00 delivery
  near(d.priceHigh, 51.92, 'priceHigh'); // Buy It Now 41,92 + 10,00 delivery
});

test('markup-canary: FR_UNSOLD_AUCTION, live auction without Buy It Now stays a single price', () => {
  const d = extractItemData(parse(FR_UNSOLD_AUCTION));

  assert.equal(d.id, '307213128737');
  assert.equal(d.type, 'unsold');
  near(d.price, 5.72, 'price'); // 2,94 + 2,78 delivery
  assert.equal(d.priceHigh, undefined);
});

test('markup-canary: DE_UNSOLD_RANGE, "bis" range', () => {
  const d = extractItemData(parse(DE_UNSOLD_RANGE));

  assert.equal(d.id, '407133053311');
  assert.equal(d.type, 'unsold');
  near(d.price, 12.59, 'price');
  near(d.priceHigh, 12.69, 'priceHigh');
});

test('markup-canary: DE_UNSOLD_UVP, the list price after "UVP" is not a range high', () => {
  const d = extractItemData(parse(DE_UNSOLD_UVP));

  assert.equal(d.id, '407023748864');
  assert.equal(d.type, 'unsold');
  near(d.price, 14.6, 'price');
  assert.equal(d.priceHigh, undefined); // EUR 49,90 is the UVP
  assert.equal(d.bestOffer, true); // "oder Preisvorschlag", confirmed on real markup
});

test('markup-canary: IT_UNSOLD_RANGE, "a" range', () => {
  const d = extractItemData(parse(IT_UNSOLD_RANGE));

  assert.equal(d.id, '376038945876');
  assert.equal(d.type, 'unsold');
  near(d.price, 15.9, 'price');
  near(d.priceHigh, 36.9, 'priceHigh');
});

test('markup-canary: ES_UNSOLD_RANGE_STRUCK, "a" range, struck price ignored, delivery on both ends', () => {
  const d = extractItemData(parse(ES_UNSOLD_RANGE_STRUCK));

  assert.equal(d.id, '366593258305');
  assert.equal(d.type, 'unsold');
  near(d.price, 61.56, 'price'); // 54,01 + 7,55
  near(d.priceHigh, 66.96, 'priceHigh'); // 59,41 + 7,55, not the struck 62,53
});

test('markup-canary: IT_SOLD_BEST_OFFER, Venduti + lug. date, Best Offer flagged', () => {
  const d = extractItemData(parse(IT_SOLD_BEST_OFFER));

  assert.equal(d.id, '326416113275');
  assert.equal(d.type, 'sold');
  assert.equal(d.date, '2026-07-20');
  assert.equal(d.bestOffer, true); // "o Proposta d'acquisto", confirmed on real markup
  near(d.price, 80.45, 'price'); // 64,85 + 15,60 delivery
});

test('markup-canary: US_SOLD_COUPON, the coupon price is not the price', () => {
  const d = extractItemData(parse(US_SOLD_COUPON));

  assert.equal(d.id, '178522312514');
  assert.equal(d.type, 'sold');
  assert.equal(d.bestOffer, true);
  near(d.price, 37.07, 'price'); // $24.99 + $12.08, not the $21.24 coupon price
  assert.equal(d.priceHigh, undefined);
});

test('markup-canary: US_SOLD_BEST_OFFER_NEW_LISTING, title has no "New Listing" prefix', () => {
  const d = extractItemData(parse(US_SOLD_BEST_OFFER_NEW_LISTING));

  assert.equal(d.id, '128131566857');
  assert.equal(d.type, 'sold');
  assert.equal(d.date, '2026-10-12');
  assert.equal(d.bestOffer, true);
  assert.equal(
    d.title,
    'Apple AirPods Pro 3rd Wireless Active Noise Cancelling Earbuds - White MFHP4LL/A',
  );
  near(d.price, 171.87, 'price'); // $168.99 + $2.88 delivery
});
