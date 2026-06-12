# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Firefox browser extension (Manifest V3) that injects a scatterplot panel into eBay search pages to visualize listing prices. Works on all eBay search pages — sold listings are plotted by sale date; active listings are plotted in a price-distribution strip chart.

## Setup & development

```bash
npm install          # installs Chart.js + web-ext; postinstall vendors Chart.js into vendor/
```

The extension's own source (`src/*.js`) is loaded as-is — no bundler or transpiler. Chart.js is the one third-party file the extension ships; `scripts/vendor.mjs` copies it (and its license) from `node_modules/` into `vendor/chart.js/` so the packaged XPI never references `node_modules/`. The vendor step runs automatically on `npm install` (postinstall) and before `npm run build`.

Load the extension in Firefox for development:
1. `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`
2. Navigate to any eBay search page (`*://*.ebay.com/sch/*`)
3. After editing any `src/*.js` file, click "Reload" on the extension card

To update Chart.js: `npm update chart.js` then `npm run vendor` (re-copies into `vendor/`).

Source is formatted with 2-space indent, single quotes, semicolons, and braces on all blocks — match the existing style when editing.

## Build & packaging

- `npm run lint` — `web-ext lint`, must pass with 0 errors before submitting
- `npm run build` — vendors Chart.js, then `web-ext build` → `web-ext-artifacts/scatterplot_for_ebay-<version>.zip`
- `npm run sign` — submits to AMO as a listed add-on (needs `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`)

Packaging ignores are under `webExt.ignoreFiles` in `package.json` — `node_modules/`, `scripts/`, `test/`, docs, and any `*.htm`/`*_files/**` reference pages are excluded, but `vendor/` IS shipped. Bump `version` in both `manifest.json` and `package.json` per release.

## Testing

```bash
npm test    # node:test runner; cross-env pins TZ=Australia/Sydney (cross-platform)
```

Requires **Node ≥ 21** (declared in `package.json` `engines`): the test-file glob is expanded by Node's test runner, not the shell, so the script double-quotes it to work in both POSIX `sh` and Windows `cmd`.

Unit tests cover the pure extraction functions in `src/extract.js` (the heuristic, eBay-markup-fragile core). Files live in `test/`:
- `test/extract.test.mjs` — the cases (`parseAmount`, `extractPrice`, `extractDate`, `extractItemId`, `extractTitle`, `extractItemData`)
- `test/helpers/load.mjs` — loads the real `src/extract.js` into a jsdom-backed `node:vm` context and returns its functions, so the **source stays free of any test-only exports** and tests run the exact shipped code
- `test/fixtures/*.html` — real listing cards captured from a live sold page, trimmed and self-contained (no external assets), with expected values asserted against the real data

Key conventions:
- **The `test` script pins `TZ=Australia/Sydney`** (a positive UTC offset) on purpose: `extractDate` must store the displayed calendar date, and the original H1 bug (UTC round-trip via `toISOString()`) only shows up at a positive offset. Running there means any reintroduction fails the date tests even on US machines.
- **Summed prices are floats** (`item + shipping`), so assert them with a tolerance, never a hand-rounded literal.
- **`extractPrice` returns `{ price, priceHigh? }` or `null`** — `priceHigh` is set for range-priced listings (e.g. `$8.99 to $18.99`).
- **Best-offer/strikethrough**: jsdom's `getComputedStyle` reflects inline styles but not class-based stylesheet rules, so the best-offer fixture carries an inline `text-decoration: line-through` (the live page uses a CSS class); `extractPrice` then correctly returns `null`.

## Architecture

Content scripts in `src/` are loaded sequentially by the manifest. All files share the same content script sandbox scope — no IIFE, no ES modules. Top-level `const`/`let`/`function` declarations in one file are accessible to all subsequently loaded files. The content scripts are registered only for eBay search pages (`*://*.ebay.com/sch/*` in the manifest), and `src/init.js` runs unconditionally on all matching pages (no URL guard). Chart.js is loaded first via the manifest (`vendor/chart.js/chart.umd.min.js`) so `window.Chart` is available synchronously — no CDN injection (eBay's CSP blocks it).

**Source files (load order matches manifest):**
- `src/constants.js` — six `const` values: `RESULTS_SEL`, `STORAGE_KEY`, `MAX_ITEMS`, `DOCK_KEY`, `SNAP_THRESHOLD`, `PANEL_OPEN_KEY`
- `src/storage.js` — `loadItems`, `saveItems` (localStorage, 200-item cap)
- `src/extract.js` — content-based DOM extraction: `leafElements`, `extractItemId`, `extractTitle`, `parseAmount`, `extractPrice`, `extractDate`, `extractItemData`
- `src/styles.js` — `injectStyles` (injects a `<style>` tag with all extension CSS)
- `src/chart.js` — `let chartInstance`, `let chartInstanceUnsold`, `renderChart`, `renderSoldChart`, `renderUnsoldChart`, `rangeLinesPlugin`
- `src/dock.js` — `let dockSide`, `nearestEdge`, `setDockSide`
- `src/checkboxes.js` — `let debounceTimer`, `cardData` WeakMap, `openPanel`, `injectCheckbox`, `clearAll`, `reconcileCheckboxes`, `syncPlotAll`, `buildPlotAllControl`
- `src/panel.js` — `buildPanel` (DOM construction + all mouse interaction)
- `src/init.js` — init sequence, MutationObservers (no URL guard)

## Panel features

**Default state:** The panel starts minimized on first visit — only the 📈 toggle tab is visible. The panel opens when the user clicks the toggle or checks a listing to plot. Once opened, the open state is persisted in `localStorage` under `PANEL_OPEN_KEY` (`ebay_scatterplot_panel_open`) and restored on subsequent page loads as long as there is saved data. If the panel is closed with the × button the flag is cleared, and a reload with no saved items also starts minimized regardless of the flag.

**Docking:** The panel docks to any of the four viewport edges. Dock side persists in `localStorage` under `ebay_scatterplot_dock`. `setDockSide(side)` in `src/dock.js` applies the correct CSS class (`dock-left/right/top/bottom`) to both the panel and the toggle button, and clears any inline styles left over from dragging.

- Left/right docks: 320px wide, full viewport height (portrait layout)
- Top/bottom docks: full viewport width, 280px tall (landscape layout — controls sidebar on the left, chart fills the right)

**Drag to redock:** The `<header>` is the drag handle (cursor: grab). On mousedown it pins the panel to its current pixel position (removing the dock class), then `mousemove` floats it. Within `SNAP_THRESHOLD` (80px) of any edge, a `#ebay-scatter-snap-preview` overlay shows where it will snap. On mouseup, if the panel was actually dragged it snaps to the nearest edge (`setDockSide(nearestEdge(...))`); a plain click with no movement restores the current dock — a no-op (guarded by a `panelDragMoved` flag, mirroring the toggle's `toggleDragMoved`). The panel always snaps to a side, never free-floats.

**Toggle button:** The `#ebay-scatter-toggle` (📈) is a tab-shaped button that appears on the docked edge when the panel is closed. Its shape and position are set by `.dock-*` CSS classes (matching the panel's dock side). The toggle is also independently draggable to change the dock side without opening the panel — uses the same snap-preview UX. The drag pin (removing dock classes, setting inline `left`/`top`) is deferred until the first `mousemove` so a plain click never alters the button's appearance.

**Resize:** `#ebay-scatter-resize` is an invisible 6px strip on the panel's free edge. Hovering shows a `col-resize` or `row-resize` cursor. Dragging resizes width (left/right docks) or height (top/bottom docks) inward. Min/max: width `[200px, 70vw]`, height `[120px, 70vh]`. Both `chartInstance` and `chartInstanceUnsold` are resized during drag. `setDockSide` clears inline width/height so size resets to CSS defaults when switching dock sides.

**z-index:** Panel is `2147483647` (max int32), toggle is `2147483646`, snap preview is `2147483645` — ensures the panel sits above eBay's sticky navigation.

## Data extraction

Extraction is content-based (resilient to eBay class renames):
- **Item ID:** `data-listingid` attribute, fallback to `/itm/<id>` URL parsing
- **Date:** leaf element (`span`/`div`) whose text starts with `"Sold "` — parses the date substring. Returns `null` for active (unsold) listings.
- **Price:** leaf element whose full text matches `$X.XX` — checks parent chain for `line-through` (best-offer items are skipped); shipping added if a nearby leaf contains "delivery"/"shipping" and a `$` amount, or a `+$X.XX` leaf (split-span delivery pattern on active listings). Returns `{ price, priceHigh? }` or `null`. `priceHigh` is set when a second non-struck `$X.XX` span exists in the same parent element (range listings, e.g. `$8.99 to $18.99`).
- **Title:** `[role="heading"][aria-level="3"]` with `.clipped`/`aria-hidden` nodes stripped; falls back to card `aria-label`

`extractItemData` returns `null` for best-offer items or items with unparseable prices. Items with a `"Sold "` date get `type: 'sold'`; items without get `type: 'unsold'` and today's local date as a fallback (so they still appear in the chart). Items in localStorage from before the `type` field was added are treated as `'sold'`. `injectCheckbox` only injects a checkbox if `extractItemData` succeeds. Non-listing tiles (ads/promos) are marked `data-scatter-injected="skip"` and never re-checked; a listing card that fails extraction is left *unmarked* so a later observer pass retries it (handles eBay's lazy rendering). Successfully extracted data is cached in a `WeakMap` (`cardData`) so the checkbox handler and "Plot all" don't re-extract.

## Checkboxes & "Plot all"

- Per-item checkboxes are injected into each valid listing card. Checking one saves the item to `localStorage` **immediately** and calls `openPanel()` to open the panel if it is minimized.
- `#ebay-scatter-plot-all` is inserted directly before `ul.srp-results` (anchored to the stable list container, not the filter bar which eBay re-renders). It has three states via the native `indeterminate` property: unchecked (none), indeterminate (some), checked (all). `syncPlotAll()` reconciles its state after every change.
- `clearAll()` wipes localStorage, unchecks all checkboxes, clears the chart.

## Chart

Two separate chart sections are rendered inside the panel, each visible only when items of that type are selected:

**Sold listings** (`#ebay-scatter-sold-wrap`, blue dots): Chart.js scatter with x = sold date (millisecond timestamp), y = total price. Custom `ticks.callback` formats x-axis as `YYYY-MM-DD`. No date adapter needed.

**Active listings** (`#ebay-scatter-unsold-wrap`, blue dots): Items sorted by price; x = sequential index centered around 0 (no date meaning — used purely to spread overlapping prices and reveal price clusters). x-axis tick labels are hidden. Range-priced items show only a vertical line (dot suppressed).

Both charts use the `rangeLinesPlugin` (defined in `src/chart.js`) to draw a vertical line through range-priced items (`priceHigh` set). Both update in-place rather than destroying and recreating. Both `chartInstance` and `chartInstanceUnsold` are declared in `src/chart.js` and referenced directly by `src/dock.js` and `src/panel.js`.

## MutationObserver

One observer in `src/init.js`, on `ul.srp-results` (`childList`). On each mutation it re-scans the direct `<li>` children that aren't yet marked (`:scope > li:not([data-scatter-injected])`) and runs `injectCheckbox` on them. This covers infinite scroll (new cards) and retries listing cards whose price/date hadn't rendered on an earlier pass. Filter, sort, and pagination on eBay search pages trigger full page navigations, so the extension simply re-initializes. Pagination was verified to work this way: the next page is a full reload, and because selections persist in `localStorage`, the existing plot survives and new-page items can be added to it (plotting accumulates across pages). There is no separate observer for in-place list replacement — eBay was confirmed never to swap `ul.srp-results` in place.
