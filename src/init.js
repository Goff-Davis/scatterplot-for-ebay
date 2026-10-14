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

// What the placeholder said before the layout error replaced it.
let placeholderDefault = '';

function showLayoutError() {
  // Report in the placeholder, not #ebay-scatter-status: the status span is a flex
  // item sharing a 320px row with "Clear All" (a 150px column when docked top/bottom)
  // and belongs to renderChart's item count, which would overwrite this. The
  // placeholder is a full-size centred box that already means "nothing to show", so
  // it has room to wrap and no longer contradicts the error by inviting the user to
  // check items that have no checkboxes.
  const placeholder = document.getElementById('ebay-scatter-placeholder');
  placeholderDefault = placeholder.textContent;
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
}

// The list can turn up after load, or arrive via an in-place swap into a results page,
// so the error has to be able to go away again.
function clearLayoutError() {
  const placeholder = document.getElementById('ebay-scatter-placeholder');

  if (!placeholder.classList.contains('ebay-scatter-error')) {
    return;
  }

  placeholder.classList.remove('ebay-scatter-error');
  placeholder.textContent = placeholderDefault;
}

// The results <ul> that is currently wired up. eBay no longer reloads the page for
// filters, sort or pagination: its x-wire navigation fetches an HTML fragment and swaps
// whole regions in place ([wire-region="results"] holds the list, and our "Plot all"
// control beside it), so the <ul>, its cards and everything injected into them are
// thrown away while this script never runs again. refreshList() therefore runs on every
// DOM change under <body> and re-wires whenever the list it knows about has been replaced.
let wiredList = null;

// The list the current "Plot all" control was built for.
let controlList = null;

// Idempotent: it does nothing when the list, its cards and "Plot all" are all in place,
// so it is cheap to call on every mutation, including the ones our own injection causes.
function refreshList() {
  const list = findResultsList();

  if (!list) {
    return false;
  }

  const first = wiredList === null;

  if (list !== wiredList) {
    wiredList = list;
    clearLayoutError();
  }

  // Cards with no checkbox yet: infinite scroll, a swapped-in page, or a card whose
  // price/date rendered late and failed extraction on an earlier pass (left unmarked).
  const pending = list.querySelectorAll(
    ':scope > li:not([data-scatter-injected])',
  );

  if (pending.length) {
    const savedItemsMap = new Map(
      loadItems().map((i) => [`${i.id}:${i.type || 'sold'}`, i]),
    );
    pending.forEach((card) => injectCheckbox(card, savedItemsMap));
  }

  // "Plot all" sits beside the list, so it leaves with the region when eBay swaps it. It
  // is also bound to the list it was built for, so it must be rebuilt when only the <ul>
  // is replaced and the control (in the surviving parent) stays behind.
  const control = document.getElementById('ebay-scatter-plot-all-wrap');

  if (!control || controlList !== list || !list.parentNode.contains(control)) {
    if (control) {
      control.remove();
    }

    buildPlotAllControl(list);
    controlList = list;
  }

  // Only the first wire-up draws the chart: a swap leaves the saved items, and any
  // currency conversion already applied, exactly as they were.
  if (first) {
    renderChart(loadItems());
  }

  syncPlotAll();

  return true;
}

if (!refreshList()) {
  showLayoutError();
}

new MutationObserver(refreshList).observe(document.body, {
  childList: true,
  subtree: true,
});
