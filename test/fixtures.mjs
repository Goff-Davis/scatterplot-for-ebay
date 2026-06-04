import { readFileSync } from 'node:fs';

const read = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

// Real listing cards captured from a live eBay sold/completed search page,
// trimmed to the <li> and stripped of scripts/images/asset references so they
// are self-contained. Expected values in the tests are the real captured data.
//
// - normal-free-shipping: valid sold item, free delivery (id 336541855208, $69.99)
// - charged-shipping:      valid sold item, item + paid delivery (id 235256974061, $150.98 total)
// - best-offer:            struck-through price (id 406863531769). The original page
//                          marks the strike with a CSS class; an inline
//                          `text-decoration: line-through` was added to the price span
//                          so jsdom's getComputedStyle detects it (it does not apply
//                          class-based stylesheet rules). extractPrice -> null.
export const NORMAL_FREE_SHIPPING = read('normal-free-shipping.html');
export const CHARGED_SHIPPING = read('charged-shipping.html');
export const BEST_OFFER = read('best-offer-strikethrough.html');
