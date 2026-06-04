# Architecture

## What it does

This is a Firefox browser extension that adds a price history panel to eBay sold/completed search results pages. You check a box on any listing to add it to the chart, which plots sale price over time as a scatterplot.

## How the extension loads

The extension is declared as a **content script** in `manifest.json`, registered only for eBay search-result pages (URLs under `/sch/` on `ebay.com`). Even there it checks the URL before doing anything — it only activates when both `LH_Complete=1` and `LH_Sold=1` are set to `1` in the query string (eBay's parameters for "sold/completed" searches).

The extension's own code has no build step — Firefox loads the `src/` files directly, in the order listed in `manifest.json`, with no bundler or transpiler. The one third-party library it ships, Chart.js, is *vendored* (copied into `vendor/`) so it travels with the extension; see *Dependencies and vendoring* below. Packaging the whole thing into a distributable `.zip` is done with `web-ext` (`npm run build`).

## File structure

```
manifest.json          Extension declaration (lists the scripts to inject)
package.json           npm metadata, scripts, and dependencies
scripts/
  vendor.mjs           Copies Chart.js from node_modules/ into vendor/
vendor/
  chart.js/            Vendored Chart.js — loaded before the extension code, and shipped
src/
  constants.js         Shared constants
  storage.js           Read/write items to localStorage
  extract.js           Parse item data from the eBay DOM
  styles.js            Inject all CSS into the page
  chart.js             Manage the Chart.js instance
  dock.js              Track and change which edge the panel is docked to
  checkboxes.js        Per-item checkboxes, "Plot all" control
  panel.js             Build the panel DOM and handle all mouse interaction
  init.js              Entry point — URL guard, startup sequence, scroll/pagination observers
test/
  extract.test.mjs     Unit tests for the extraction logic
  helpers/load.mjs     Loads src/extract.js into a jsdom context for testing
  fixtures/            Real eBay card HTML used by the tests
node_modules/          Dev dependencies (Chart.js source, web-ext, jsdom) — never shipped
```

## Shared scope

All `src/` files are loaded as classic (non-module) content scripts into the same sandbox. This means top-level variables and functions declared in one file are accessible to all files loaded after it. There is no `import`/`export` and no bundler. The load order in `manifest.json` is the dependency order.

## The panel

The panel (`#ebay-scatter-panel`) is a fixed-position overlay injected into the page. It has four sections:

1. **Header** — "Price History" title and a close button. The header is the drag handle.
2. **Controls bar** — "Clear All" button and an item count.
3. **Chart area** — a `<canvas>` where Chart.js renders the scatterplot.
4. **Resize handle** — an invisible 6px strip on the panel's free edge.

When the panel is closed, a small tab button (`#ebay-scatter-toggle`, the 📈 icon) appears on the docked edge so the panel can be reopened.

## Docking

The panel always docks to one of the four viewport edges. The current side is stored in `localStorage` so it persists across page loads.

- **Left / Right:** 320px wide, full viewport height — portrait orientation
- **Top / Bottom:** full viewport width, 280px tall — landscape orientation (controls on the left, chart fills the right)

The active dock side is tracked by `dockSide` in `src/dock.js`. `setDockSide(side)` applies the CSS class (`dock-left/right/top/bottom`) to the panel and toggle button, and clears any inline styles left over from dragging.

## Dragging and snapping

Both the panel header and the toggle button are draggable. When you start dragging, the element detaches from its edge and follows the mouse freely. As the mouse gets within 80px of any viewport edge, a semi-transparent blue overlay (`#ebay-scatter-snap-preview`) appears showing where it will snap. On mouse release, the element always snaps to the nearest edge — there is no free-floating state. Releasing without having moved (a plain click) leaves the element on its current edge.

## Resizing

The resize handle sits on the panel's free edge (the edge facing the page content). Dragging it inward expands the panel; dragging outward contracts it. The chart re-renders immediately during the drag. Switching dock sides resets the panel to its default size.

## Data extraction

Rather than relying on eBay's CSS class names (which change frequently), the extension uses content-based heuristics to pull data from each listing card:

- **Price** — finds a leaf element whose entire text matches `$X.XX`; skips items where that price has a strikethrough style (best-offer listings)
- **Shipping** — finds a nearby leaf element containing "delivery" or "shipping" and a `$` amount; recognises "free shipping/delivery" as $0
- **Date** — finds a leaf element whose text starts with "Sold " and parses the date from it, stored as `YYYY-MM-DD` formatted from local date components (so the stored day matches what eBay displayed, regardless of the user's timezone)
- **Item ID** — reads `data-listingid` on the card element, with a fallback to parsing the `/itm/<id>` URL

Items that fail any of these checks (missing price, missing date, best-offer) get no checkbox injected, which keeps the "Plot all" checkbox state accurate. Obvious non-listings (ad/promo tiles) are marked and skipped permanently; a real listing card that simply hasn't finished rendering is left unmarked and retried on the next observer pass.

## Checkboxes and "Plot all"

Each valid listing gets a small "Plot" checkbox injected into its card. Checking it saves the item's data to `localStorage` immediately (each change persists on its own, so a fast multi-select can't drop selections); unchecking removes it. The chart re-render is debounced (150 ms) so a burst of selections redraws once.

The "Plot all" checkbox sits above the results list and has three visual states using the browser's native `indeterminate` property:

| State | Meaning |
|-------|---------|
| Unchecked | No items selected |
| Indeterminate (filled bar) | Some items selected |
| Checked | All valid items selected |

`syncPlotAll()` is called after every state change to keep the three-state checkbox accurate.

## Chart

Chart.js renders a scatter chart with sale dates on the x-axis and total price (item + shipping) on the y-axis. The x-axis uses raw millisecond timestamps with a custom tick formatter for `YYYY-MM-DD` labels — no date adapter plugin is needed. The chart instance is updated in place rather than destroyed and recreated, which avoids flickering.

## Handling eBay's dynamic page updates

As you scroll, eBay appends new listing cards to `ul.srp-results` without a full page reload (infinite scroll). A single `MutationObserver` on that element watches for child-list changes; on each one it re-scans the direct `<li>` children that haven't been processed yet and injects checkboxes. The same pass retries any listing card whose price or date rendered late.

Filtering, sorting, and pagination on the sold-search page trigger full page navigations rather than in-place DOM swaps, so the extension simply re-initializes. This has been verified for pagination specifically: clicking to the next page reloads the page, and because selections live in `localStorage`, everything already plotted survives the reload and stays on the chart while items from the newly loaded page can be added to the same plot — so you can page through results and accumulate points across multiple pages. No extra observer is needed for in-place list replacement (which eBay was confirmed never to do here).

## Dependencies and vendoring

The extension ships exactly one third-party file: **Chart.js**. It's installed via npm and loaded as a content script (listed in `manifest.json` before the `src/` files, so `window.Chart` is available synchronously). eBay's Content Security Policy blocks loading scripts from a CDN, so Chart.js has to travel inside the extension.

Rather than point the manifest at `node_modules/` (which isn't part of a packaged add-on), a small script — `scripts/vendor.mjs` — copies Chart.js and its license from `node_modules/` into `vendor/chart.js/`, and the manifest loads `vendor/chart.js/chart.umd.min.js`. Vendoring runs automatically on `npm install` (a `postinstall` hook) and again before every `npm run build`, so `vendor/` always matches the installed version.

| Dependency | Type | Purpose |
|------------|------|---------|
| `chart.js` | runtime | Scatterplot rendering (vendored into `vendor/`, shipped) |
| `web-ext` | dev | Lint, build, and sign the extension for Firefox Add-ons |
| `jsdom` | dev | DOM implementation used by the unit tests |

## Building and packaging

There's no bundler for the extension's own code, but `web-ext` (Mozilla's tool) handles linting and packaging:

- `npm run lint` — checks the extension against Firefox Add-on policies
- `npm run build` — vendors Chart.js, then produces a `.zip` in `web-ext-artifacts/`
- `npm run sign` — submits to addons.mozilla.org (AMO) as a listed add-on

`webExt.ignoreFiles` in `package.json` controls what's left out of the package: `node_modules/`, `scripts/`, `test/`, and the docs are excluded; `vendor/` is included. The full submission process is documented in `SUBMITTING.md`.

## Testing

The pure data-extraction functions in `src/extract.js` — the part most likely to break when eBay changes its markup — are covered by unit tests. Run them with `npm test`.

Because the `src/` files have no `export`s (they share one content-script scope), the tests load `src/extract.js` into a jsdom-backed `node:vm` sandbox (`test/helpers/load.mjs`) and call its functions directly. The tests therefore run the exact code that ships, without adding any test-only exports to the source.

Fixtures (`test/fixtures/*.html`) are real listing cards captured from a live sold-search page, then trimmed and made self-contained. The suite is pinned to a positive-offset timezone (`TZ=Australia/Sydney`) so that any regression in the date parsing — which must store the date eBay displayed, not a UTC-shifted one — fails the tests even on machines in the Americas.
