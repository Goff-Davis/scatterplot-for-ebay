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
  const m = text.replace(/,/g, '').match(/\d+\.?\d*/);
  return m ? parseFloat(m[0]) : NaN;
}

function extractPrice(card) {
  // Find a leaf element whose entire text is a bare dollar amount: "$107.94"
  const priceEl = leafElements(card, 'span, div').find((el) =>
    /^\$[\d,]+\.?\d*$/.test(el.textContent.trim()),
  );

  if (!priceEl) {
    return null;
  }

  // Best offer: price is crossed out
  let node = priceEl;
  for (let i = 0; i < 4; i++) {
    if (!node) {
      break;
    }

    if (window.getComputedStyle(node).textDecoration.includes('line-through')) {
      return null;
    }

    node = node.parentElement;
  }

  const sold = parseAmount(priceEl.textContent);
  if (isNaN(sold)) {
    console.warn('[ebay-scatter] Could not parse price:', priceEl.textContent);
    return null;
  }

  // Find shipping: leaf element containing "delivery" or "shipping" and a "$" amount
  let shipping = 0;
  for (const el of leafElements(card, 'span, div')) {
    const text = el.textContent.trim();

    if (/free\s+(delivery|shipping)/i.test(text)) {
      shipping = 0;
      break;
    }

    if (/(delivery|shipping)/i.test(text) && /\$/.test(text)) {
      const parsed = parseAmount(text);

      if (!isNaN(parsed)) {
        shipping = parsed;
        break;
      }
    }
  }

  return sold + shipping;
}

function extractDate(card) {
  // Find a leaf element whose text starts with "Sold "
  const el = leafElements(card, 'span, div').find((el) =>
    /^Sold\b/i.test(el.textContent.trim()),
  );

  if (!el) {
    return null;
  }

  const m = el.textContent.match(/([A-Za-z]+ \d{1,2},?\s*\d{4})/);

  if (!m) {
    return null;
  }

  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function extractItemData(card) {
  const id = extractItemId(card);
  const price = extractPrice(card); // returns null for best-offer items
  const date = extractDate(card);

  if (!id || price === null || !date) {
    console.warn('[ebay-scatter] Skipping card:', { id: !!id, price, date });
    return null;
  }

  const a = card.querySelector("a[href*='/itm/']");
  return {
    id,
    title: extractTitle(card) || 'Unknown item',
    date,
    price,
    url: a ? a.href : '',
  };
}
