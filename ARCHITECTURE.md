# Architecture

## What it does

This is a Firefox browser extension that adds a price history panel to eBay search pages. You check a box on any listing to add it to the chart. Sold listings are plotted by sale date; active (unsold) listings appear in a separate price-distribution strip chart.

## How the extension loads

The extension is declared as a **content script** in `manifest.json`, registered for eBay search-result pages (URLs under `/sch/`) across all supported domains: `ebay.com` (US and Mexico), `ebay.co.uk` (UK), `ebay.de` (Germany), `ebay.ca` (Canada), `ebay.com.au` (Australia and New Zealand), `ebay.fr` (France), `ebay.it` (Italy), and `ebay.es` (Spain). It runs on all matching pages — there is no URL guard. The panel starts minimized by default (only the 📈 toggle tab is visible) and opens on first interaction. Once opened, that state is stored in `localStorage` and restored on the next page load if saved data exists; closing the panel with × clears the flag.

The extension's own code has no build step — Firefox loads the `src/` files directly, in the order listed in `manifest.json`, with no bundler or transpiler. The third-party libraries it ships (Chart.js and easy-currencies) are _vendored_ into `vendor/` so they travel with the extension; see _Dependencies and vendoring_ below. Packaging the whole thing into a distributable `.zip` is done with `web-ext` (`npm run build`).

## File structure

```
manifest.json          Extension declaration (lists the scripts to inject)
package.json           npm metadata, scripts, and dependencies
scripts/
  vendor.mjs           Copies Chart.js and bundles easy-currencies into vendor/
vendor/
  chart.js/            Vendored Chart.js — loaded before the extension code, and shipped
  easy-currencies/     Bundled easy-currencies IIFE — exposes window.EasyCurrencies, shipped
src/
  constants.js         Shared constants (including CURRENCY_KEY)
  storage.js           Read/write items to localStorage
  extract.js           Parse item data from the eBay DOM
  styles.js            Inject all CSS into the page
  currency.js          Currency maps, locale detection, rate fetching, price conversion
  chart.js             Manage the Chart.js instance; renderChartConverted is the async entry point
  dock.js              Track and change which edge the panel is docked to
  checkboxes.js        Per-item checkboxes, "Plot all" control
  panel.js             Build the panel DOM and handle all mouse interaction
  init.js              Entry point — startup sequence, panel state restore, scroll observers
test/
  extract.test.mjs     Unit tests for the extraction logic + markup-canary fixtures
  storage.test.mjs     loadItems/saveItems degradation + MAX_ITEMS cap
  dock.test.mjs        nearestEdge geometry
  chart.test.mjs       renderChart data-shaping math (against a fake Chart)
  checkboxes.test.mjs  syncPlotAll tri-state, reconcileCheckboxes, injectCheckbox cross-type coexistence
  panel.test.mjs       buildPanel wiring: font-size input + dark/light theme toggle
  helpers/load.mjs     Loads any src/ files into a shared jsdom context for testing
  helpers/chart-stub.mjs  Fake Chart.js constructor that records its config
  fixtures/            Real eBay card HTML (sold + active) used by the tests
node_modules/          Dev dependencies (Chart.js source, web-ext, jsdom) — never shipped
```

## Shared scope

All `src/` files are loaded as classic (non-module) content scripts into the same sandbox. This means top-level variables and functions declared in one file are accessible to all files loaded after it. There is no `import`/`export` and no bundler. The load order in `manifest.json` is the dependency order.

## The panel

The panel (`#ebay-scatter-panel`) is a fixed-position overlay injected into the page. It has four sections:

1. **Header** — "Price History" title, a font-size input, a currency-selector dropdown, a dark/light theme toggle, and a close button. The header is the drag handle (mousedown on any of its buttons, inputs, or selects is excluded from drag logic).
2. **Controls bar** — "Clear All" button and an item count.
3. **Chart area** — two stacked `<canvas>` sections: `#ebay-scatter-sold-wrap` (sold listings) and `#ebay-scatter-unsold-wrap` (active listings). Each section is hidden until it has data.
4. **Resize handle** — an invisible 6px strip on the panel's free edge.

When the panel is closed, a small tab button (`#ebay-scatter-toggle`, the 📈 icon) appears on the docked edge so the panel can be reopened.

## Docking

The panel always docks to one of the four viewport edges. The current side is stored in `localStorage` so it persists across page loads.

- **Left / Right:** 320px wide, full viewport height — portrait orientation
- **Top / Bottom:** full viewport width, 280px tall — landscape orientation (controls on the left, chart fills the right)

The active dock side is tracked by `dockSide` in `src/dock.js`. `setDockSide(side)` applies the CSS class (`dock-left/right/top/bottom`) to the panel and toggle button, and clears any inline styles left over from dragging.

## Dragging and snapping

Both the panel header and the toggle button are draggable. When you start dragging, the element detaches from its edge and follows the mouse freely. As the mouse gets within 80px of any viewport edge, a semi-transparent blue overlay (`#ebay-scatter-snap-preview`) appears showing where it will snap. On mouse release, the element always snaps to the nearest edge — there is no free-floating state. Releasing without having moved (a plain click) leaves the element on its current edge.

For the toggle button, the detach (removing dock classes and pinning inline position) is deferred until the first `mousemove` event, so a plain click never visually alters the button.

## Resizing

The resize handle sits on the panel's free edge (the edge facing the page content). Dragging it inward expands the panel; dragging outward contracts it. The chart re-renders immediately during the drag. Switching dock sides resets the panel to its default size.

## Currency conversion

A `<select>` in the panel header lets the user pick a display currency (USD, GBP, EUR, CAD, AUD, MXN). The selected currency is persisted in `localStorage` under `CURRENCY_KEY` and defaults to the eBay site's native currency (detected from `window.location.hostname`). On change, `renderChartConverted` fetches live rates via `window.EasyCurrencies` (bundled from the `easy-currencies` package), converts each item's `price` and `priceHigh` using the formula `price * (rates[toCode] / rates[fromCode])`, and re-renders both charts. Rates are cached in memory for one hour. On a network failure, the initial face-value render shown synchronously is left in place with no crash.

## Theme and font size

Two header controls adjust the panel's appearance, both persisted in `localStorage`:

- **Theme toggle** (`#ebay-scatter-theme`, ☉/☾) flips between dark (default) and light. Every themeable color is a CSS custom property declared on `#ebay-scatter-panel` and overridden under `.theme-light`; toggling adds/removes that class on both the panel and the toggle tab. Because Chart.js reads its colors once at construction time, the toggle destroys and recreates both chart instances so they pick up the new variable values.
- **Font-size input** (`#ebay-scatter-font-size`, default 14px) sets the panel's base size via an inline `style.fontSize`, which survives the inline-style clearing that `setDockSide` does. All child text uses `em` units so it scales from that base. Chart.js axis ticks and tooltips don't inherit CSS font size, so `updateChartFontSizes(size)` patches the live chart instances directly.

## Data extraction

Rather than relying on eBay's CSS class names (which change frequently), the extension uses content-based heuristics to pull data from each listing card:

- **Price** — finds a leaf element whose entire text matches a price in any supported currency: `$X.XX` (US/AU/CA/MX), `£X.XX` (UK), `EUR X,XX` prefix (DE/IT), or `X,XX EUR` suffix (FR/ES). Skips items where that price has a strikethrough style (best-offer accepted). Returns `{ price, priceHigh? }` — `priceHigh` is set when a second non-struck price span is found in the same parent element (range pricing, e.g. `$8.99 to $18.99`). `parseAmount` auto-detects EUR comma-decimal format (exactly two digits after the comma) vs. period-decimal — US thousands commas (`$1,234.56`) always have three or more digits after the comma and are never misread. Mixed currencies appear on every eBay site (e.g. a US seller on `ebay.de` shows `$` prices; a European seller on `ebay.com` shows `EUR` prices); the universal `PRICE_RE` matches all formats, and amounts are plotted at face value with no currency conversion.
- **Shipping** — finds a leaf element **after the price element in DOM order** containing a multi-language shipping keyword (`delivery`, `shipping`, `postage`, `Versand`, `Lieferung`, `livraison`, `consegna`, `spedizione`, `envío`, `expédition`, etc.) and a currency amount, or a `+<amount>` leaf in any supported currency format (the split-span pattern on active listings). Scanning only post-price leaves prevents false positives when product titles contain free-shipping phrases (e.g. Italian "SPEDIZIONE GRATUITA") — title spans always precede the price in eBay card DOM. Recognises free-shipping phrases in all supported languages as $0.
- **Date** — finds a leaf element whose text starts with a supported sold prefix (`Sold`, `Verkauft`, `Vendu le`, `Vendu`, `Venduto`, `Venduti`, `Vendido`, `Vendidos`) and parses the date from it. Handles both day-first formats used by most international sites ("14 Jun 2026", "13. Jun 2026", "11 giu. 2026") and the month-first format used by the US/MX English ("Jun 14, 2026") via a `MONTH_MAP` covering English, French, Italian, Spanish, and German month names. The result is stored as `YYYY-MM-DD` via pure string manipulation (no `new Date()` conversion), so the stored day matches what eBay displayed regardless of the user's timezone. Returns `null` for active (unsold) listings which have no sold date.
- **Item ID** — reads `data-listingid` on the card element, with a fallback to parsing the `/itm/<id>` URL

`extractItemData` returns `null` only for best-offer or unparseable-price items. Items with a sold date get `type: 'sold'`; items without get `type: 'unsold'` and today's local date as a fallback (so they appear in the active-listings chart). Items in localStorage without a `type` field (saved before this field existed) are treated as `'sold'`. Non-listings (ad/promo tiles) are marked and skipped permanently; a real listing card that simply hasn't finished rendering is left unmarked and retried on the next observer pass.

## Checkboxes and "Plot all"

Each valid listing gets a small "Plot" checkbox injected into its card. Checking it saves the item's data to `localStorage` immediately (each change persists on its own, so a fast multi-select can't drop selections), and calls `openPanel()` to open the panel if it is currently minimized. Unchecking removes it. The chart re-render is debounced (150 ms) so a burst of selections redraws once.

Storage deduplicates by `id+type` (composite key `"${id}:${type || 'sold'}"`). A multi-quantity eBay item can appear as both a sold listing on one search page and an active listing on another — the two records coexist independently. Unchecking an active listing only removes the active record; a separately saved sold record for the same item is unaffected.

The "Plot all" checkbox sits above the results list and has three visual states using the browser's native `indeterminate` property:

| State                      | Meaning                  |
| -------------------------- | ------------------------ |
| Unchecked                  | No items selected        |
| Indeterminate (filled bar) | Some items selected      |
| Checked                    | All valid items selected |

`syncPlotAll()` is called after every state change to keep the three-state checkbox accurate.

## Chart

The panel contains two independent chart sections, each visible only when items of that type are selected:

**Sold listings** (blue dots) — scatter chart with sale date (millisecond timestamp) on the x-axis and total price on the y-axis. The x-axis uses a custom tick formatter for `YYYY-MM-DD` labels — no date adapter needed.

**Active listings** (blue dots) — strip/dot chart for price distribution. Items are sorted by price; x values are centered around 0 (sequential sort index offset by half the count) so points expand outward from the center regardless of how many there are. A minimum half-range of 5 units prevents a small cluster from stretching across the full chart width. x-axis tick labels are hidden. Range-priced items show only a vertical line with no dot.

Both charts use an inline `rangeLinesPlugin` that draws a vertical line through any data point with a `priceHigh` value (range-priced listings). Both update in place rather than destroying and recreating. `chartInstance` (sold) and `chartInstanceUnsold` (active) are both in `src/chart.js` and referenced by `src/dock.js` and `src/panel.js` for resize handling.

The standard chart entry point for UI event handlers is `renderChartConverted(items)` — it calls `renderChart(items)` synchronously for immediate feedback, then fetches exchange rates asynchronously and re-renders with converted prices. Only `clearAll()` calls `renderChart([])` directly (no network hit for an empty array).

## Handling eBay's dynamic page updates

As you scroll, eBay appends new listing cards to `ul.srp-results` without a full page reload (infinite scroll). A single `MutationObserver` on that element watches for child-list changes; on each one it re-scans the direct `<li>` children that haven't been processed yet and injects checkboxes. The same pass retries any listing card whose price or date rendered late.

Filtering, sorting, and pagination on the sold-search page trigger full page navigations rather than in-place DOM swaps, so the extension simply re-initializes. This has been verified for pagination specifically: clicking to the next page reloads the page, and because selections live in `localStorage`, everything already plotted survives the reload and stays on the chart while items from the newly loaded page can be added to the same plot — so you can page through results and accumulate points across multiple pages. No extra observer is needed for in-place list replacement (which eBay was confirmed never to do here).

## Dependencies and vendoring

The extension ships two third-party libraries. eBay's Content Security Policy blocks loading scripts from a CDN, so both have to travel inside the extension. Neither is referenced from `node_modules/` in the packaged add-on; instead, `scripts/vendor.mjs` (run on `npm install` postinstall and before `npm run build`) puts them into `vendor/`:

- **Chart.js** — file-copied directly into `vendor/chart.js/`. Loaded first in `manifest.json` so `window.Chart` is available synchronously.
- **easy-currencies** — a CJS/Node package that uses axios and cannot be loaded as a content script directly. `scripts/vendor.mjs` bundles it via esbuild (`platform: 'browser'`, `format: 'iife'`, `globalName: 'EasyCurrencies'`) into `vendor/easy-currencies/easy-currencies.iife.js`, which exposes `window.EasyCurrencies`. `platform: 'browser'` causes esbuild to resolve axios's browser field automatically.

| Dependency        | Type    | Purpose                                                         |
| ----------------- | ------- | --------------------------------------------------------------- |
| `chart.js`        | runtime | Scatterplot rendering (vendored into `vendor/`, shipped)        |
| `easy-currencies` | runtime | Live exchange rates for currency conversion (vendored, shipped) |
| `esbuild`         | dev     | Bundles easy-currencies into a browser IIFE during vendor step  |
| `web-ext`         | dev     | Lint, build, and sign the extension for Firefox Add-ons         |
| `jsdom`           | dev     | DOM implementation used by the unit tests                       |

## Building and packaging

There's no bundler for the extension's own code, but `web-ext` (Mozilla's tool) handles linting and packaging:

- `npm run lint` — checks the extension against Firefox Add-on policies
- `npm run build` — vendors Chart.js, then produces a `.zip` in `web-ext-artifacts/`
- `npm run sign` — submits to addons.mozilla.org (AMO) as a listed add-on

`webExt.ignoreFiles` in `package.json` controls what's left out of the package: `node_modules/`, `scripts/`, `test/`, and the docs are excluded; `vendor/` is included.

## Testing

Unit tests (`npm test`) lock down the core logic that must stay stable regardless of eBay's markup: extraction (`src/extract.js`), the storage contract (`src/storage.js`), dock geometry (`nearestEdge`), chart data-shaping math (`src/chart.js`), the checkbox state reconcilers (`src/checkboxes.js`), and the panel's header wiring — font-size input and theme toggle (`src/panel.js`). Coverage is deliberately scoped (see `TEST_PLAN.md`): every test is one of three buckets — **invariant** (synthetic DOM, must hold forever), **documents-behavior** (a current choice pinned so a change is noticed), or **markup-canary** (a real captured card, kept few, fails loudly when the markup shifts).

Because the `src/` files have no `export`s (they share one content-script scope), the tests load the real source into a jsdom-backed `node:vm` sandbox and call its functions directly — running the exact code that ships, with no test-only exports. `test/helpers/load.mjs` exposes `loadModules(files, { url, setup })`, which loads any combination of `src/` files into one shared context (separate `runInContext` calls share top-level `const`/`let`, mirroring the content-script scope); chart math is exercised against a fake Chart.js constructor (`test/helpers/chart-stub.mjs`).

Fixtures (`test/fixtures/*.html`) are real listing cards captured from live sold-search **and** active-search pages, then trimmed and made self-contained. The suite is pinned to a positive-offset timezone (`TZ=Australia/Sydney`) so that any regression in the date parsing — which must store the date eBay displayed, not a UTC-shifted one — fails the tests even on machines in the Americas.
