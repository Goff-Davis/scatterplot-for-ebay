// Returns leaf elements (no child elements) matching a selector within card.
function leafElements(card, sel) {
  return Array.from(card.querySelectorAll(sel)).filter(
    (el) => el.childElementCount === 0,
  );
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

const PRICE_RE = /^(?:(?:[A-Z]{1,3}\s)?\$[\d,  ]+\.?\d*|£[\d,  ]+\.?\d*|EUR\s+[\d.  ]+,\d{2}|[\d.  ]+,\d{2}\s*(?:EUR|\$C))$/;

function extractPrice(card) {
  // Find a leaf element whose entire text is a bare price amount.
  const leaves = leafElements(card, 'span, div');
  const priceEl = leaves.find((el) => {
    if (!PRICE_RE.test(el.textContent.trim())) {
      return false;
    }
    let node = el;

    for (let i = 0; i < 4; i++) {
      if (!node) {
        break;
      }

      if (
        window.getComputedStyle(node).textDecoration.includes('line-through')
      ) {
        return false;
      }
      node = node.parentElement;
    }

    return true;
  });

  if (!priceEl) {
    return null;
  }

  const low = parseAmount(priceEl.textContent);

  if (isNaN(low)) {
    return null;
  }

  // Price range: look for a second non-struck $X.XX sibling in the same parent element
  // (e.g. "$8.99 to $18.99" on active listings — three spans in one attribute row)
  let high;
  const siblingPrices = Array.from(
    priceEl.parentElement.querySelectorAll('span, div'),
  ).filter((el) => {
    if (el === priceEl || !PRICE_RE.test(el.textContent.trim())) {
      return false;
    }

    // Exclude struck-through siblings (discounted original prices on sold cards)
    let n = el;

    for (let i = 0; i < 4; i++) {
      if (!n) {
        break;
      }

      if (window.getComputedStyle(n).textDecoration.includes('line-through')) {
        return false;
      }
      n = n.parentElement;
    }

    return true;
  });

  if (siblingPrices.length > 0) {
    const h = parseAmount(siblingPrices[siblingPrices.length - 1].textContent);
    if (!isNaN(h) && h > low) {
      high = h;
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

    if (/free\s+(?:delivery|shipping|postage)|kostenlos(?:er)?\s+versand|livraison\s+gratuite|spedizione\s+gratuita|env[ií]o\s+gratis/i.test(text)) {
      shipping = 0;
      break;
    }

    if (/(delivery|shipping|postage|versand|lieferung|livraison|consegna|spedizione|env[ií]o|exp[eé]dition)/i.test(text) && /[$£]|EUR/.test(text)) {
      const parsed = parseAmount(text);

      if (!isNaN(parsed)) {
        shipping = parsed;
        break;
      }
    }

    // "+amount" leaf — delivery cost in its own span, separate from any keyword text.
    // Matches $, £, EUR-prefix, and EUR-suffix formats; no end-anchor since DE/IT
    // spans include trailing text ("+EUR 2,95 Lieferung").
    if (/^\+\s*(?:(?:[A-Z]{1,3}\s)?\$[\d,  ]+\.?\d*|£[\d,  ]+\.?\d*|EUR\s+[\d.  ]+,\d{2}|[\d.  ]+,\d{2}\s*(?:EUR|\$C))/.test(text)) {
      const parsed = parseAmount(text);

      if (!isNaN(parsed)) {
        shipping = parsed;
        break;
      }
    }
  }

  return high !== undefined
    ? { price: low + shipping, priceHigh: high + shipping }
    : { price: low + shipping };
}

const SOLD_RE = /^(?:Sold|Verkauft|Vendu(?:\s+le)?|Venduto|Venduti|Vendido|Vendidos)\b/i;

const MONTH_MAP = {
  // English (US, UK, AU, CA EN, MX EN; DE abbreviates Jun same as EN)
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  // French (FR, CA FR)
  janv: 0, 'fév': 1, 'févr': 1, mars: 2, avr: 3, mai: 4, juin: 5,
  juil: 6, 'août': 7, 'déc': 11,
  // Italian (IT)
  gen: 0, mag: 4, magg: 4, giu: 5, lug: 6, ago: 7, set: 8, ott: 9, dic: 11,
  // Spanish (ES, MX ES)
  ene: 0, abr: 3,
  // German (DE)
  'mär': 2, 'märz': 2, okt: 9, dez: 11,
};

function extractDate(card) {
  const el = leafElements(card, 'span, div').find((el) =>
    SOLD_RE.test(el.textContent.trim()),
  );

  if (!el) {
    return null;
  }

  const dateStr = el.textContent.trim().replace(SOLD_RE, '').trim();
  const pad = (n) => String(n).padStart(2, '0');

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

  return null;
}

function extractItemData(card) {
  const id = extractItemId(card);
  const priceData = extractPrice(card);

  if (!id || !priceData) {
    return null;
  }

  const soldDate = extractDate(card);
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
    title: extractTitle(card) || 'Unknown item',
    date,
    price: priceData.price,
    type: soldDate ? 'sold' : 'unsold',
  };

  if (priceData.priceHigh !== undefined) {
    item.priceHigh = priceData.priceHigh;
  }

  return item;
}
