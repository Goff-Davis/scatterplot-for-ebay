injectStyles();
buildPanel();
setDockSide(dockSide);

if (localStorage.getItem(PANEL_OPEN_KEY) && loadItems().length > 0) {
  document.getElementById('ebay-scatter-panel').style.display = 'flex';
  document.getElementById('ebay-scatter-toggle').style.display = 'none';
}

const container = document.querySelector(RESULTS_SEL);
if (!container) {
  document.getElementById('ebay-scatter-status').textContent =
    'Could not find listings — eBay may have changed its layout';
  console.warn('[ebay-scatter] Results container not found');
} else {
  const savedItemsMap = new Map(loadItems().map((i) => [i.id, i]));
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
