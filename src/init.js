injectStyles();
buildPanel();
setDockSide(dockSide);

if (localStorage.getItem(PANEL_OPEN_KEY) && loadItems().length > 0) {
  document.getElementById('ebay-scatter-panel').style.display = 'flex';
  document.getElementById('ebay-scatter-toggle').style.display = 'none';
}

// eBay renames the results list's classes periodically (ul.srp-results became
// ul.su-grid), which silently switches the whole extension off. When the known
// selectors miss, fall back to whichever <ul> holds the most listing cards.
function findResultsList() {
  const direct = document.querySelector(RESULTS_SEL);

  if (direct) {
    return direct;
  }

  // Carousel modules nest their own <ul>, so closest('ul') attributes their items
  // to the carousel rather than the results list — the real list still wins.
  const counts = new Map();

  for (const el of document.querySelectorAll('[data-listingid]')) {
    const ul = el.closest('ul');

    if (ul) {
      counts.set(ul, (counts.get(ul) || 0) + 1);
    }
  }

  let best = null;
  let most = 0;

  for (const [ul, n] of counts) {
    if (n > most) {
      best = ul;
      most = n;
    }
  }

  return best;
}

const container = findResultsList();

if (!container) {
  // Report in the placeholder, not #ebay-scatter-status: the status span is a flex
  // item sharing a 320px row with "Clear All" (a 150px column when docked top/bottom)
  // and belongs to renderChart's item count, which would overwrite this. The
  // placeholder is a full-size centred box that already means "nothing to show", so
  // it has room to wrap and no longer contradicts the error by inviting the user to
  // check items that have no checkboxes.
  const placeholder = document.getElementById('ebay-scatter-placeholder');
  placeholder.textContent = '';
  placeholder.classList.add('ebay-scatter-error');

  const msg = document.createElement('div');
  msg.textContent =
    'Could not find listings — eBay may have changed its layout.';

  const report = document.createElement('a');
  report.href = 'https://github.com/Goff-Davis/scatterplot-for-ebay/issues';
  report.target = '_blank';
  report.rel = 'noreferrer';
  report.textContent = 'Report it';

  placeholder.append(msg, report);
  console.warn('[ebay-scatter] Results container not found');
} else {
  const savedItemsMap = new Map(
    loadItems().map((i) => [`${i.id}:${i.type || 'sold'}`, i]),
  );
  container
    .querySelectorAll(':scope > li')
    .forEach((card) => injectCheckbox(card, savedItemsMap));
  buildPlotAllControl(container);
  renderChart(loadItems());
  syncPlotAll();

  // Infinite scroll appends new <li> cards to the same list. On each change,
  // re-scan direct children that haven't been processed yet — this picks up
  // new cards and retries listing cards whose price/date rendered late.
  // (Filter, sort, and pagination trigger full page navigations, which
  // re-initialize the extension, so no in-place-swap observer is needed.)
  const listObserver = new MutationObserver(() => {
    container
      .querySelectorAll(':scope > li:not([data-scatter-injected])')
      .forEach((card) => injectCheckbox(card));
    syncPlotAll();
  });
  listObserver.observe(container, { childList: true });
}
