// Returns leaf elements (no child elements) matching a selector within card.
function leafElements(card, sel) {
  return Array.from(card.querySelectorAll(sel)).filter(
    (el) => el.childElementCount === 0,
  );
}

// Resolves the element that actually carries one listing. In the current layout the
// <li> is only a grid slot — data-listingid sits on an inner div. A promo/carousel
// <li> wraps MANY of them, and treating it as a single card makes extractItemId's
// /itm/ fallback silently return the first nested item, plotting a bogus listing.
function listingRoot(card) {
  if (card.dataset.listingid) {
    return card; // old layout: the <li> itself carries the id
  }

  const found = card.querySelectorAll('[data-listingid]');

  if (found.length > 1) {
    return null; // carousel / promo module, not a single listing
  }

  // found[0] is the current layout. Falling back to the card keeps the old layout
  // working and preserves the lazy-render retry for a card that hasn't filled in yet.
  return found[0] || card;
}

function extractItemId(card) {
  if (card.dataset.listingid) {
    return card.dataset.listingid;
  }

  const a = card.querySelector("a[href*='/itm/']");

  if (!a) {
    return null;
  }

  const m = a.href.match(/\/itm\/(?:[^/?]+\/)?(\d+)/);

  return m ? m[1] : null;
}

function extractTitle(card) {
  const heading = card.querySelector("[role='heading'][aria-level='3']");

  if (heading) {
    const clone = heading.cloneNode(true);
    clone
      .querySelectorAll(".clipped, [aria-hidden='true']")
      .forEach((n) => n.remove());

    return clone.textContent.trim() || null;
  }

  return card.getAttribute('aria-label') || null;
}

function parseAmount(text) {
  // Comma-decimal (EUR, $C): "EUR 12,40", "29,01 EUR", "22,57 $C", "350 000,00 EUR".
  // Thousands sep may be . (DE "EUR 1.234,56"), space, or   (non-breaking space).
  // US thousands commas ("$1,234.56") always have 3+ digits after the comma so the
  // \d{2}(?=...|$) lookahead never matches them.
  const m = text.match(/\b(\d[\d.  ]*,\d{2})(?=[\s ]|$)/);
  if (m) {
    return parseFloat(m[1].replace(/[.  ]/g, '').replace(',', '.'));
  }
  // Period-decimal (US, UK, AU EN, CA EN, MX): "$X.XX", "C $X.XX", "MXN $X,XXX.XX".
  // Commas (thousands) and   (MX thousands) are stripped before matching.
  const pm = text.replace(/[, ]/g, '').match(/\d+\.?\d*/);
  return pm ? parseFloat(pm[0]) : NaN;
}

// One source of truth for a bare price amount, shared by PRICE_RE and RANGE_RE.
// The classes carry U+00A0 alongside a plain space: eBay uses both as separators.
const PRICE_BODY =
  '(?:[A-Z]{1,3}\\s)?\\$[\\d,\\u00a0 ]+\\.?\\d*' +
  '|£[\\d,\\u00a0 ]+\\.?\\d*' +
  '|EUR\\s+[\\d.\\u00a0 ]+,\\d{2}' +
  '|[\\d.\\u00a0 ]+,\\d{2}\\s*(?:EUR|\\$C)';

const PRICE_RE = new RegExp(`^(?:${PRICE_BODY})$`);

// A range inside ONE element: "$599.99 - $649.99". The old layout split a range
// across sibling spans instead — extractPrice still handles that separately.
// The separator carries its own case rather than an `i` flag: the flag would also
// apply to PRICE_BODY, making a range's endpoints accept `eur 12,40` when PRICE_RE
// (no flag) rejects it standalone.
const RANGE_RE = new RegExp(
  `^(${PRICE_BODY})\\s*(?:-|–|—|[Tt]o)\\s*(${PRICE_BODY})$`,
);

// Best Offer was ENABLED on this listing. It does NOT mean an offer was accepted:
// eBay stopped disclosing an accepted offer's amount, or even that one happened, so
// a sold card shows the LISTING price either way and only the item page reveals the
// truth. Treat this as "price is uncertain", never as "an offer was accepted".
// EN/ES/FR/CA-FR are confirmed against fixtures; DE and IT are unverified until an
// international page on the current layout is captured.
const BEST_OFFER_RE =
  /\b(?:or Best Offer|o Mejor oferta|ou Faire une offre|ou Offre directe|oder Preisvorschlag|o Proposta d'acquisto)\b/i;

function detectCurrencySymbol(text) {
  if (/£/.test(text)) {
    return '£';
  }

  if (/EUR/.test(text)) {
    return '€';
  }

  if (/\$C/.test(text)) {
    return 'C$';
  }

  const m = text.match(/^([A-Z]{1,3})\s\$/);
  if (m && m[1] !== 'US') {
    return m[1] + '$';
  }

  return '$';
}

// A struck price is a discounted "was" price on the current layout (it used to mark
// a best-offer sale). Walks up because the rule may sit on a wrapping row.
function isStruck(el) {
  let node = el;

  for (let i = 0; i < 4; i++) {
    if (!node) {
      break;
    }

    if (window.getComputedStyle(node).textDecoration.includes('line-through')) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function extractPrice(card) {
  // Find a leaf element whose entire text is a bare price amount or a range.
  const leaves = leafElements(card, 'span, div');
  let priceEl = null;
  let low;
  let high;

  for (const el of leaves) {
    const text = el.textContent.trim();
    const range = RANGE_RE.exec(text);

    if (range && !isStruck(el)) {
      priceEl = el;
      low = parseAmount(range[1]);

      // Same guard as the sibling scan below. A high that isn't above the low would
      // make the item vanish from the active chart: renderUnsoldChart suppresses the
      // dot for anything carrying a priceHigh, and the range line would be
      // zero-length or inverted. Leaving it unset plots a plain dot instead.
      const h = parseAmount(range[2]);

      if (!isNaN(h) && h > low) {
        high = h;
      }

      break;
    }

    if (PRICE_RE.test(text) && !isStruck(el)) {
      priceEl = el;
      low = parseAmount(text);
      break;
    }
  }

  if (!priceEl || isNaN(low)) {
    return null;
  }

  // Old-layout range: a second non-struck price in a sibling span ("$8.99 to $18.99"
  // spread across three spans in one attribute row). Restricted to LEAVES — wrapper
  // divs inherit their descendants' textContent, so an unfiltered scan matches the
  // discount row's wrappers and mistakes the struck "was" price for a range high.
  if (high === undefined) {
    const siblingPrices = leafElements(
      priceEl.parentElement,
      'span, div',
    ).filter(
      (el) =>
        el !== priceEl && PRICE_RE.test(el.textContent.trim()) && !isStruck(el),
    );

    if (siblingPrices.length > 0) {
      const h = parseAmount(
        siblingPrices[siblingPrices.length - 1].textContent,
      );

      if (!isNaN(h) && h > low) {
        high = h;
      }
    }
  }

  // Find shipping: only scan leaves that appear AFTER the price element in DOM order.
  // Shipping info always follows the price on eBay cards; scanning from the start
  // causes false positives when the product title contains a free-shipping phrase
  // (e.g. "SPEDIZIONE GRATUITA" in an Italian title, "Livraison gratuite" in a
  // French title) — those title spans come before the price, so skipping them is safe.
  let shipping = 0;

  for (const el of leaves.slice(leaves.indexOf(priceEl) + 1)) {
    const text = el.textContent.trim();

    if (
      /free\s+(?:delivery|shipping|postage)|kostenlos(?:er)?\s+versand|livraison\s+gratuite|spedizione\s+gratuita|env[ií]o\s+gratis/i.test(
        text,
      )
    ) {
      shipping = 0;
      break;
    }

    if (
      /(delivery|shipping|postage|versand|lieferung|livraison|consegna|spedizione|env[ií]o|exp[eé]dition)/i.test(
        text,
      ) &&
      /[$£]|EUR/.test(text)
    ) {
      const parsed = parseAmount(text);

      if (!isNaN(parsed)) {
        shipping = parsed;
        break;
      }
    }

    // "+amount" leaf — delivery cost in its own span, separate from any keyword text.
    // Matches $, £, EUR-prefix, and EUR-suffix formats; no end-anchor since DE/IT
    // spans include trailing text ("+EUR 2,95 Lieferung").
    if (
      /^\+\s*(?:(?:[A-Z]{1,3}\s)?\$[\d,  ]+\.?\d*|£[\d,  ]+\.?\d*|EUR\s+[\d.  ]+,\d{2}|[\d.  ]+,\d{2}\s*(?:EUR|\$C))/.test(
        text,
      )
    ) {
      const parsed = parseAmount(text);

      if (!isNaN(parsed)) {
        shipping = parsed;
        break;
      }
    }
  }

  const currencySymbol = detectCurrencySymbol(priceEl.textContent.trim());

  return high !== undefined
    ? { price: low + shipping, priceHigh: high + shipping, currencySymbol }
    : { price: low + shipping, currencySymbol };
}

const SOLD_RE =
  /^(?:Sold|Verkauft|Vendu(?:\s+le)?|Venduto|Venduti|Vendido|Vendidos)\b/i;

const MONTH_MAP = {
  // English (US, UK, AU, CA EN, MX EN; DE abbreviates Jun same as EN)
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  // French (FR, CA FR)
  janv: 0,
  fév: 1,
  févr: 1,
  mars: 2,
  avr: 3,
  mai: 4,
  juin: 5,
  juil: 6,
  août: 7,
  déc: 11,
  // Italian (IT)
  gen: 0,
  mag: 4,
  magg: 4,
  giu: 5,
  lug: 6,
  ago: 7,
  set: 8,
  ott: 9,
  dic: 11,
  // Spanish (ES, MX ES)
  ene: 0,
  abr: 3,
  // German (DE)
  mär: 2,
  märz: 2,
  okt: 9,
  dez: 11,
};

function extractDate(card) {
  const pad = (n) => String(n).padStart(2, '0');

  for (const el of leafElements(card, 'span, div')) {
    const text = el.textContent.trim();

    if (!SOLD_RE.test(text)) {
      continue;
    }

    const dateStr = text.replace(SOLD_RE, '').trim();

    // Day-first: "14 Jun 2026", "13. Jun 2026", "11 giu. 2026"
    const df = dateStr.match(/^(\d{1,2})\.?\s+([A-Za-zÀ-ɏ]+)\.?\s+(\d{4})$/);
    if (df) {
      const mon = MONTH_MAP[df[2].toLowerCase()];
      if (mon !== undefined) {
        return `${df[3]}-${pad(mon + 1)}-${pad(parseInt(df[1], 10))}`;
      }
    }

    // Month-first: "Jun 14, 2026" (US, MX EN)
    const mf = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
    if (mf) {
      const mon = MONTH_MAP[mf[1].toLowerCase()];
      if (mon !== undefined) {
        return `${mf[3]}-${pad(mon + 1)}-${pad(parseInt(mf[2], 10))}`;
      }
    }
    // sold-word matched but date didn't parse — keep scanning
  }

  return null;
}

// Every read is scoped to `root`, the element carrying the one listing: a carousel <li>
// would otherwise leak its first nested item's id/price/title into a record for the
// module itself. Callers that already resolved it (injectCheckbox) pass it in to save a
// second lookup; everyone else gets it resolved here.
function extractItemData(card, root = listingRoot(card)) {
  if (!root) {
    return null;
  }

  const id = extractItemId(root);
  const priceData = extractPrice(root);

  if (!id || !priceData) {
    return null;
  }

  const soldDate = extractDate(root);
  let date;

  if (soldDate) {
    date = soldDate;
  } else {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const item = {
    id,
    title: extractTitle(root) || 'Unknown item',
    date,
    price: priceData.price,
    type: soldDate ? 'sold' : 'unsold',
    currencySymbol: priceData.currencySymbol,
  };

  if (priceData.priceHigh !== undefined) {
    item.priceHigh = priceData.priceHigh;
  }

  if (
    leafElements(root, 'span, div').some((el) =>
      BEST_OFFER_RE.test(el.textContent),
    )
  ) {
    item.bestOffer = true;
  }

  return item;
}
