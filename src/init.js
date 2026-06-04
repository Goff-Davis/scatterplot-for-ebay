const params = new URLSearchParams(window.location.search);

if (params.has('LH_Complete') && params.has('LH_Sold')) {
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

    // Watch for new cards (infinite scroll / pagination)
    const listObserver = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType === 1 && node.tagName === 'LI') {
            injectCheckbox(node);
          }
        }
      }
    });
    listObserver.observe(container, { childList: true });

    // Watch parent in case eBay replaces the whole results list on pagination
    if (container.parentElement) {
      new MutationObserver(() => {
        const fresh = document.querySelector(RESULTS_SEL);
        if (fresh && fresh !== container) {
          listObserver.disconnect();
          fresh
            .querySelectorAll(':scope > li')
            .forEach((card) => injectCheckbox(card));
          listObserver.observe(fresh, { childList: true });
        }
      }).observe(container.parentElement, { childList: true });
    }
  }
}
