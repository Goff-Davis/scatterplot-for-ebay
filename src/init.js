const params = new URLSearchParams(window.location.search);

if (params.get('LH_Complete') === '1' || params.get('LH_Sold') === '1') {
  injectStyles();
  buildPanel();
  setDockSide(dockSide);

  const container = document.querySelector(RESULTS_SEL);
  if (!container) {
    document.getElementById('ebay-scatter-status').textContent =
      'Could not find listings — eBay may have changed its layout';
    console.warn('[ebay-scatter] Results container not found');
  } else {
    container
      .querySelectorAll(':scope > li')
      .forEach((card) => injectCheckbox(card));
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
    });
    listObserver.observe(container, { childList: true });
  }
}
