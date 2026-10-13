import { readFileSync } from 'node:fs';

const read = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

// Real listing cards captured from live eBay search pages, trimmed to the <li> and
// stripped of scripts/images/asset references (and the heavy base64 tracking
// attributes) so they are self-contained. Expected values in the tests are the
// real captured data — these are the markup-canary set: refresh when eBay changes.
//
// eBay has served two card layouts in 2026, named here by their markup:
// - s-card:  ul.srp-results > li.s-card[data-listingid]. Captured in June 2026 (the
//            groups just below) and again in October 2026 (the last group).
// - su-grid: ul.su-grid > li > div.su-item-card[data-listingid]. Captured in July 2026
//            (the group in the middle).
// scripts/extract-fixture.mjs cuts a card out of a saved page.
//
// June 2026, s-card layout. Sold-search cards (date plotted; type 'sold'):
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
export const AU_SOLD = read('au-sold.html');
export const UK_SOLD = read('uk-sold.html');
export const CA_EN_SOLD = read('ca-en-sold.html');
export const CA_FR_SOLD = read('ca-fr-sold.html');
export const FR_SOLD = read('fr-sold.html');
export const IT_GIU_SOLD = read('it-giu-sold.html');
export const IT_MAGG_SOLD = read('it-magg-sold.html');
export const DE_SOLD = read('de-sold.html');
export const ES_SOLD = read('es-sold.html');
export const MX_EN_SOLD = read('mx-en-sold.html');
export const MX_ES_SOLD = read('mx-es-sold.html');
export const NORMAL_FREE_SHIPPING = read('normal-free-shipping.html');
export const CHARGED_SHIPPING = read('charged-shipping.html');
export const BEST_OFFER = read('best-offer-strikethrough.html');
export const ACTIVE_RANGE_DELIVERY = read('active-range-delivery.html');
export const ACTIVE_RANGE = read('active-range.html');
export const ACTIVE_SPLIT_DELIVERY = read('active-split-delivery.html');

// ── su-grid layout cards (captured 2026-07) ──
// In this layout ul.srp-results became ul.su-grid, and data-listingid moved off
// the <li> onto an inner div.su-item-card. These four pin the behaviours that
// change brought. Kept to one per behaviour (canaries are kept few).
//
// - new-sold-best-offer: sold + "or Best Offer" (id 278185590765, $160.00 +
//                        $114.45 delivery → 274.45, bestOffer true). The shown price
//                        is the LISTING price — eBay no longer says whether an offer
//                        was accepted, which is exactly why the flag exists.
// - new-sold-discount:   sold, real price + struck "was" price (id 178228743563,
//                        $2,299.99 shown / $5,499.99 struck, free delivery → 2299.99,
//                        NO priceHigh). Strikethrough now means "discounted from",
//                        not "best offer accepted". Inline text-decoration added —
//                        the live page uses .strikethrough, which jsdom won't apply.
// - new-active-range:    range in a SINGLE span (id 187472505512, "$599.99 - $649.99"
//                        + $81.58 delivery → price 681.57, priceHigh 731.57). The old
//                        layout split ranges across sibling spans instead.
// - new-carousel-module: a related-items carousel <li> holding 2 nested listings
//                        (trimmed from 7). Not a listing → extractItemData null.
export const NEW_SOLD_BEST_OFFER = read('new-sold-best-offer.html');
export const NEW_SOLD_DISCOUNT = read('new-sold-discount.html');
export const NEW_ACTIVE_RANGE = read('new-active-range.html');
export const NEW_CAROUSEL_MODULE = read('new-carousel-module.html');

// ── s-card layout cards, October 2026 (captured 2026-10-12) ──
// eBay serves ul.srp-results > li.s-card[data-listingid] again, the same markup family
// as the June cards above. These add what the June set lacked: an active-search card for
// every site (most carry a range in that site's range word), live auctions, and the cases
// the October captures exposed. Expected values are read straight off the saved pages.
//
// Active-search cards (type 'unsold'; date = today's fallback):
// - uk-unsold-range:        £5.99 to £6.99, free delivery (id 387277080371). The
//                           unit-price and "Get it by" rows must be ignored.
// - au-unsold-range-struck: AU $31.57 to AU $54.12 with a struck AU $55.81 after the high
//                           end (id 287169811974) → 31.57 / 54.12. Inline line-through added.
// - ca-en-unsold-range:     C $239.52 to C $268.03 + C $14.26 shipping (id 198652190674)
//                           → 253.78 / 282.29
// - ca-fr-unsold-range:     the same listing on the French Canadian site: 239,52 $C à
//                           268,03 $C + expédition (14,26 $C), with a NBSP before the "("
// - fr-unsold-range:        34,58 EUR à 35,61 EUR, Livraison gratuite (id 406205301484)
// - fr-unsold-auction-bin:  live auction (id 237112788340): current bid 21,25 EUR, "0
//                           enchères", then Buy It Now 41,92 EUR in its own row, + 10,00
//                           EUR delivery. Plotted as a range: 31.25 / 51.92.
// - fr-unsold-auction:      live auction with no Buy It Now (id 307213128737): 2,94 EUR +
//                           2,78 EUR delivery → 5.72, no priceHigh
// - de-unsold-range:        EUR 12,59 bis EUR 12,69 (id 407133053311) → 12.59 / 12.69
// - de-unsold-uvp:          EUR 14,60, "UVP", EUR 49,90 (id 407023748864). The second
//                           figure is a list price, NOT a range high → 14.60, bestOffer
//                           (oder Preisvorschlag).
// - it-unsold-range:        EUR 15,90 a EUR 36,90 (id 376038945876) → 15.90 / 36.90
// - es-unsold-range-struck: 54,01 EUR a 59,41 EUR, struck 62,53 EUR, + 7,55 EUR de envío
//                           (id 366593258305) → 61.56 / 66.96. Inline line-through added.
//
// Sold-search cards (type 'sold'):
// - it-sold-best-offer:     Venduti 20 lug. 2026, EUR 64,85 + EUR 15,60, o Proposta
//                           d'acquisto (id 326416113275) → 80.45, bestOffer
// - us-sold-coupon:         $24.99 + $12.08 delivery, "$21.24 with coupon" in its own row
//                           (id 178522312514) → 37.07; the coupon price is not the price
// - us-sold-best-offer-new-listing: $168.99 + $2.88 delivery, or Best Offer, with the "New
//                           Listing" badge inside the heading (id 128131566857) → 171.87,
//                           and a title without the badge
export const UK_UNSOLD_RANGE = read('uk-unsold-range.html');
export const AU_UNSOLD_RANGE_STRUCK = read('au-unsold-range-struck.html');
export const CA_EN_UNSOLD_RANGE = read('ca-en-unsold-range.html');
export const CA_FR_UNSOLD_RANGE = read('ca-fr-unsold-range.html');
export const FR_UNSOLD_RANGE = read('fr-unsold-range.html');
export const FR_UNSOLD_AUCTION_BIN = read('fr-unsold-auction-bin.html');
export const FR_UNSOLD_AUCTION = read('fr-unsold-auction.html');
export const DE_UNSOLD_RANGE = read('de-unsold-range.html');
export const DE_UNSOLD_UVP = read('de-unsold-uvp.html');
export const IT_UNSOLD_RANGE = read('it-unsold-range.html');
export const ES_UNSOLD_RANGE_STRUCK = read('es-unsold-range-struck.html');
export const IT_SOLD_BEST_OFFER = read('it-sold-best-offer.html');
export const US_SOLD_COUPON = read('us-sold-coupon.html');
export const US_SOLD_BEST_OFFER_NEW_LISTING = read(
  'us-sold-best-offer-new-listing.html',
);
