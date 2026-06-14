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
// International sold-search cards (markup-canary: one per supported locale):
// - au-sold:      AU $33.46 + AU $12.54 delivery  (id 316831955834, total ~46.00)
// - uk-sold:      £15.99 + £1.55 split-span        (id 316831955834, total ~17.54)
// - ca-en-sold:   C $29.98 + C $11.23 shipping     (id 316831955834, total ~41.21)
// - ca-fr-sold:   22,57 $C + expédition 19,62 $C   (id 146893875871, total ~42.19)
// - fr-sold:      6,00 EUR, Livraison gratuite      (id 295875474042, total 6.00)
// - it-giu-sold:  EUR 13,17 + EUR 14,34 consegna   (id 176502963636, total ~27.51)
//                 title contains "SPEDIZIONE GRATUITA" — must not trigger free-shipping
// - it-magg-sold: EUR 9,47 + EUR 18,45 consegna    (id 186698751424, total ~27.92)
//                 "magg." = maggio (May) — the abbreviation fixed in MONTH_MAP
// - de-sold:      EUR 7,75 + EUR 2,95 Lieferung    (id 176380896866, total ~10.70)
// - es-sold:      22,43 EUR + 17,33 EUR de envío   (id 188471718932, total ~39.76)
// - mx-en-sold:   MXN $310.12 + MXN $909.16        (id 188285590204, total ~1219.28)
// - mx-es-sold:   MXN $861.27 + MXN $2987.99 envío (id 147349367091, total ~3849.26)
//                 "was" price span has inline text-decoration:line-through added
//                 (live page uses CSS class; jsdom can't see class-based rules)
export const AU_SOLD      = read('au-sold.html');
export const UK_SOLD      = read('uk-sold.html');
export const CA_EN_SOLD   = read('ca-en-sold.html');
export const CA_FR_SOLD   = read('ca-fr-sold.html');
export const FR_SOLD      = read('fr-sold.html');
export const IT_GIU_SOLD  = read('it-giu-sold.html');
export const IT_MAGG_SOLD = read('it-magg-sold.html');
export const DE_SOLD      = read('de-sold.html');
export const ES_SOLD      = read('es-sold.html');
export const MX_EN_SOLD   = read('mx-en-sold.html');
export const MX_ES_SOLD   = read('mx-es-sold.html');
export const NORMAL_FREE_SHIPPING = read('normal-free-shipping.html');
export const CHARGED_SHIPPING = read('charged-shipping.html');
export const BEST_OFFER = read('best-offer-strikethrough.html');
export const ACTIVE_RANGE_DELIVERY = read('active-range-delivery.html');
export const ACTIVE_RANGE = read('active-range.html');
export const ACTIVE_SPLIT_DELIVERY = read('active-split-delivery.html');
