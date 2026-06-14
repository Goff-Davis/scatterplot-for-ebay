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
  const leaves = leafElements(card, 'span, div');
  const priceEl = leaves.find((el) => {
    if (!/^\$[\d,]+\.?\d*$/.test(el.textContent.trim())) {
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
    if (el === priceEl || !/^\$[\d,]+\.?\d*$/.test(el.textContent.trim())) {
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

  // Find shipping: leaf element containing "delivery" or "shipping" and a "$" amount
  let shipping = 0;

  for (const el of leaves) {
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

    // "+$X.XX" leaf — delivery cost displayed in its own span, separate from "delivery" text
    if (/^\+\$[\d,]+(?:\.\d+)?\s*$/.test(text)) {
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

  if (isNaN(d.getTime())) {
    return null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
