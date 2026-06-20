import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers/load.mjs';

// invariant — pure conversion math and TLD-to-code default lookup.
// fetchRates is async/network — not tested here; the math is what matters.

const fresh = (url = 'https://www.ebay.com/sch/i.html') =>
  loadModules(['constants.js', 'currency.js'], {
    url,
    setup(sb) {
      sb.EasyCurrencies = {};
    },
  });

// ── convertPrice ─────────────────────────────────────────────────────────────

const RATES = { USD: 1, GBP: 0.8, EUR: 0.9, CAD: 1.35, AUD: 1.5, MXN: 17 };

test('convertPrice: same currency is identity', () => {
  const s = fresh();
  assert.equal(s.convertPrice(100, '$', 'USD', RATES), 100);
  assert.equal(s.convertPrice(50, '£', 'GBP', RATES), 50);
  assert.equal(s.convertPrice(80, '€', 'EUR', RATES), 80);
});

test('convertPrice: USD to EUR', () => {
  const s = fresh();
  const result = s.convertPrice(100, '$', 'EUR', RATES);
  // 100 * (0.9 / 1)
  assert.ok(Math.abs(result - 90) < 0.001, `expected ~90, got ${result}`);
});

test('convertPrice: USD to GBP', () => {
  const s = fresh();
  const result = s.convertPrice(100, '$', 'GBP', RATES);
  assert.ok(Math.abs(result - 80) < 0.001, `expected ~80, got ${result}`);
});

test('convertPrice: EUR to GBP', () => {
  const s = fresh();
  // 100 EUR * (rates.GBP / rates.EUR) = 100 * (0.8 / 0.9)
  const result = s.convertPrice(100, '€', 'GBP', RATES);
  assert.ok(
    Math.abs(result - (100 * 0.8) / 0.9) < 0.001,
    `expected ~${(100 * 0.8) / 0.9}, got ${result}`,
  );
});

test('convertPrice: C$ to USD', () => {
  const s = fresh();
  // 135 CAD * (1 / 1.35) = 100
  const result = s.convertPrice(135, 'C$', 'USD', RATES);
  assert.ok(Math.abs(result - 100) < 0.001, `expected ~100, got ${result}`);
});

test('convertPrice: AU$ to USD', () => {
  const s = fresh();
  const result = s.convertPrice(150, 'AU$', 'USD', RATES);
  assert.ok(Math.abs(result - 100) < 0.001, `expected ~100, got ${result}`);
});

test('convertPrice: MXN$ to USD', () => {
  const s = fresh();
  const result = s.convertPrice(170, 'MXN$', 'USD', RATES);
  assert.ok(Math.abs(result - 10) < 0.001, `expected ~10, got ${result}`);
});

test('convertPrice: unknown symbol falls back to USD', () => {
  const s = fresh();
  // Unknown symbol → treated as USD; converting USD→EUR: 100 * 0.9
  const result = s.convertPrice(100, '¥', 'EUR', RATES);
  assert.ok(Math.abs(result - 90) < 0.001, `expected ~90, got ${result}`);
});

// ── getDefaultCurrencyCode ────────────────────────────────────────────────────

test('getDefaultCurrencyCode: ebay.com → USD', () => {
  const s = fresh('https://www.ebay.com/sch/i.html');
  assert.equal(s.getDefaultCurrencyCode(), 'USD');
});

test('getDefaultCurrencyCode: ebay.co.uk → GBP', () => {
  const s = fresh('https://www.ebay.co.uk/sch/i.html');
  assert.equal(s.getDefaultCurrencyCode(), 'GBP');
});

test('getDefaultCurrencyCode: ebay.de → EUR', () => {
  const s = fresh('https://www.ebay.de/sch/i.html');
  assert.equal(s.getDefaultCurrencyCode(), 'EUR');
});

test('getDefaultCurrencyCode: ebay.com.au → AUD', () => {
  const s = fresh('https://www.ebay.com.au/sch/i.html');
  assert.equal(s.getDefaultCurrencyCode(), 'AUD');
});

test('getDefaultCurrencyCode: ebay.ca → CAD', () => {
  const s = fresh('https://www.ebay.ca/sch/i.html');
  assert.equal(s.getDefaultCurrencyCode(), 'CAD');
});

test('getDefaultCurrencyCode: unknown TLD → USD', () => {
  const s = fresh('https://www.ebay.mx/sch/i.html');
  assert.equal(s.getDefaultCurrencyCode(), 'USD');
});
