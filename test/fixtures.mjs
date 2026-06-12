import { readFileSync } from 'node:fs';

const read = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

// Real listing cards captured from live eBay search pages, trimmed to the <li> and
// stripped of scripts/images/asset references (and the heavy base64 tracking
// attributes) so they are self-contained. Expected values in the tests are the
// real captured data — these are the markup-canary set: refresh when eBay changes.
//
// Sold-search cards (date plotted; type 'sold'):
// - normal-free-shipping: valid sold item, free delivery (id 336541855208, $69.99)
// - charged-shipping:      valid sold item, item + paid delivery (id 235256974061, $150.98 total)
// - best-offer:            struck-through price (id 406863531769). The original page
//                          marks the strike with a CSS class; an inline
//                          `text-decoration: line-through` was added to the price span
//                          so jsdom's getComputedStyle detects it (it does not apply
//                          class-based stylesheet rules). extractPrice -> null.
//
// Active-search cards (no "Sold " caption → type 'unsold', date = today's fallback):
// - active-range-delivery: range price + split-span paid delivery (id 284586461118,
//                          $5.99–$6.99 + $4.99 → price 10.98, priceHigh 11.98)
// - active-range:          range price, no delivery (id 167030069483,
//                          $8.99–$18.99 → price 8.99, priceHigh 18.99)
// - active-split-delivery: single price + split-span "+$3.90 delivery" (id 174433187577,
//                          $12.50 + $3.90 → price 16.40, no priceHigh)
export const NORMAL_FREE_SHIPPING = read('normal-free-shipping.html');
export const CHARGED_SHIPPING = read('charged-shipping.html');
export const BEST_OFFER = read('best-offer-strikethrough.html');
export const ACTIVE_RANGE_DELIVERY = read('active-range-delivery.html');
export const ACTIVE_RANGE = read('active-range.html');
export const ACTIVE_SPLIT_DELIVERY = read('active-split-delivery.html');
