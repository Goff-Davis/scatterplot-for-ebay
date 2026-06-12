let debounceTimer = null;

function openPanel() {
  const p = document.getElementById('ebay-scatter-panel');
  const t = document.getElementById('ebay-scatter-toggle');
  if (p && p.style.display === 'none') {
    p.style.display = 'flex';
    t.style.display = 'none';
    try { localStorage.setItem(PANEL_OPEN_KEY, '1'); } catch { /* non-fatal */ }
  }
}

// Caches each card's extracted data so the change handler and "Plot all" don't
// re-run extraction (which walks the DOM and calls getComputedStyle).
const cardData = new WeakMap();

function injectCheckbox(card, savedIds) {
  if (card.dataset.scatterInjected) {
    return;
  }

  const id = extractItemId(card);

  // Not a listing card (ad / promo tile) — mark it so it's never re-checked.
  if (!id || !card.querySelector("a[href*='/itm/']")) {
    card.dataset.scatterInjected = 'skip';
    return;
  }

  // A listing whose price/date may not have rendered yet. Extract once and reuse
  // the result. On failure, leave the card UNMARKED so a later observer pass
  // retries it (handles eBay's lazy rendering).
  const data = extractItemData(card);
  if (!data) {
    return;
  }

  card.dataset.scatterInjected = '1';
  cardData.set(card, data);

  const label = document.createElement('label');
  label.className = 'ebay-scatter-cb';
  label.title = 'Add to price chart';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.itemId = id;
  cb.checked = (savedIds ?? new Set(loadItems().map((i) => i.id))).has(id);

  label.appendChild(cb);
  label.appendChild(document.createTextNode(' Plot'));

  const attrArea =
    card.querySelector('.su-card-container__attributes__primary') || card;
  attrArea.appendChild(label);

  cb.addEventListener('change', () => {
    // Persist immediately, per change. The debounceTimer is shared by every
    // checkbox, so coalescing the storage write would drop all but the last
    // toggle in a fast multi-select; only the expensive redraw is debounced.
    const items = loadItems();

    if (cb.checked) {
      if (!items.some((i) => i.id === data.id)) {
        items.push(data);
        saveItems(items);
      }
      openPanel();
    } else {
      saveItems(items.filter((i) => i.id !== id));
    }

    reconcileCheckboxes();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderChart(loadItems());
      syncPlotAll();
    }, 150);
  });
}

function clearAll() {
  saveItems([]);
  document.querySelectorAll('.ebay-scatter-cb input').forEach((cb) => {
    cb.checked = false;
  });
  renderChart([]);
  syncPlotAll();
}

function syncPlotAll() {
  const plotAllCb = document.getElementById('ebay-scatter-plot-all');

  if (!plotAllCb) {
    return;
  }

  const all = Array.from(document.querySelectorAll('.ebay-scatter-cb input'));

  if (!all.length) {
    return;
  }

  const checkedCount = all.filter((cb) => cb.checked).length;

  if (checkedCount === 0) {
    plotAllCb.checked = false;
    plotAllCb.indeterminate = false;
  } else if (checkedCount === all.length) {
    plotAllCb.checked = true;
    plotAllCb.indeterminate = false;
  } else {
    plotAllCb.checked = false;
    plotAllCb.indeterminate = true;
  }
}

// Make every checkbox reflect what is actually in storage. saveItems() caps at
// MAX_ITEMS, so a bulk selection can drop the oldest items; without this the
// dropped items' boxes would stay checked and lie about what's plotted.
function reconcileCheckboxes() {
  const ids = new Set(loadItems().map((i) => i.id));
  document.querySelectorAll('.ebay-scatter-cb input').forEach((box) => {
    box.checked = ids.has(box.dataset.itemId);
  });
}

function buildPlotAllControl(listContainer) {
  const wrap = document.createElement('div');
  wrap.id = 'ebay-scatter-plot-all-wrap';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = 'ebay-scatter-plot-all';

  const lbl = document.createElement('label');
  lbl.htmlFor = 'ebay-scatter-plot-all';
  lbl.textContent = 'Plot all';

  wrap.appendChild(cb);
  wrap.appendChild(lbl);
  listContainer.insertAdjacentElement('beforebegin', wrap);

  cb.addEventListener('change', () => {
    if (cb.checked) {
      const items = loadItems();

      listContainer
        .querySelectorAll(':scope > li[data-scatter-injected="1"]')
        .forEach((card) => {
          const data = cardData.get(card);
          if (data && !items.some((i) => i.id === data.id)) {
            items.push(data);
          }
        });

      saveItems(items);
      openPanel();
      reconcileCheckboxes(); // honor the MAX_ITEMS cap so boxes match storage
      renderChart(loadItems());
      syncPlotAll();
    } else {
      // Only remove items visible on this page — items from other pages/types stay.
      const pageIds = new Set(
        Array.from(document.querySelectorAll('.ebay-scatter-cb input')).map(
          (box) => box.dataset.itemId,
        ),
      );
      saveItems(loadItems().filter((i) => !pageIds.has(i.id)));
      document.querySelectorAll('.ebay-scatter-cb input').forEach((box) => {
        box.checked = false;
      });
      renderChart(loadItems());
      syncPlotAll();
    }
  });
}
