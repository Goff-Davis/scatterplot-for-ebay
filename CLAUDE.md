# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Firefox browser extension (Manifest V3) that injects a scatterplot panel into eBay sold/completed search results pages to visualize listing prices over time.

## Setup & development

```bash
npm install          # installs Chart.js + web-ext; postinstall vendors Chart.js into vendor/
```

The extension's own source (`src/*.js`) is loaded as-is — no bundler or transpiler. Chart.js is the one third-party file the extension ships; `scripts/vendor.mjs` copies it (and its license) from `node_modules/` into `vendor/chart.js/` so the packaged XPI never references `node_modules/`. The vendor step runs automatically on `npm install` (postinstall) and before `npm run build`.

Load the extension in Firefox for development:
1. `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`
2. Navigate to an eBay sold/completed search (both `LH_Complete=1` and `LH_Sold=1` must be in the URL)
3. After editing any `src/*.js` file, click "Reload" on the extension card

To update Chart.js: `npm update chart.js` then `npm run vendor` (re-copies into `vendor/`).

Source is formatted with 2-space indent, single quotes, semicolons, and braces on all blocks — match the existing style when editing.

## Build & packaging

- `npm run lint` — `web-ext lint`, must pass with 0 errors before submitting
- `npm run build` — vendors Chart.js, then `web-ext build` → `web-ext-artifacts/ebay_scatterplot-<version>.zip`
- `npm run sign` — submits to AMO as a listed add-on (needs `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`)

Packaging ignores are under `webExt.ignoreFiles` in `package.json` — `node_modules/`, `scripts/`, `test/`, and the docs are excluded, but `vendor/` IS shipped. Bump `version` in both `manifest.json` and `package.json` per release. Full AMO submission flow and reviewer notes are in `SUBMITTING.md`.

## Testing

```bash
npm test    # node:test runner, pinned to TZ=Australia/Sydney
```

Unit tests cover the pure extraction functions in `src/extract.js` (the heuristic, eBay-markup-fragile core). Files live in `test/`:
- `test/extract.test.mjs` — the cases (`parseAmount`, `extractPrice`, `extractDate`, `extractItemId`, `extractTitle`, `extractItemData`)
- `test/helpers/load.mjs` — loads the real `src/extract.js` into a jsdom-backed `node:vm` context and returns its functions, so the **source stays free of any test-only exports** and tests run the exact shipped code
- `test/fixtures/*.html` — real listing cards captured from a live sold page, trimmed and self-contained (no external assets), with expected values asserted against the real data

Key conventions:
- **The `test` script pins `TZ=Australia/Sydney`** (a positive UTC offset) on purpose: `extractDate` must store the displayed calendar date, and the original H1 bug (UTC round-trip via `toISOString()`) only shows up at a positive offset. Running there means any reintroduction fails the date tests even on US machines.
- **Summed prices are floats** (`item + shipping`), so assert them with a tolerance, never a hand-rounded literal.
- **Best-offer/strikethrough**: jsdom's `getComputedStyle` reflects inline styles but not class-based stylesheet rules, so the best-offer fixture carries an inline `text-decoration: line-through` (the live page uses a CSS class); `extractPrice` then correctly returns `null`.

## Architecture

Content scripts in `src/` are loaded sequentially by the manifest. All files share the same content script sandbox scope — no IIFE, no ES modules. Top-level `const`/`let`/`function` declarations in one file are accessible to all subsequently loaded files. The content scripts are registered only for eBay search pages (`*://*.ebay.com/sch/*` in the manifest), and `src/init.js` further guards on both `LH_Complete=1` and `LH_Sold=1` being present in the URL (it checks the values, not just the keys). Chart.js is loaded first via the manifest (`vendor/chart.js/chart.umd.min.js`) so `window.Chart` is available synchronously — no CDN injection (eBay's CSP blocks it).

**Source files (load order matches manifest):**
- `src/constants.js` — five `const` values: `RESULTS_SEL`, `STORAGE_KEY`, `MAX_ITEMS`, `DOCK_KEY`, `SNAP_THRESHOLD`
- `src/storage.js` — `loadItems`, `saveItems` (localStorage, 200-item cap)
- `src/extract.js` — content-based DOM extraction: `leafElements`, `extractItemId`, `extractTitle`, `parseAmount`, `extractPrice`, `extractDate`, `extractItemData`
- `src/styles.js` — `injectStyles` (injects a `<style>` tag with all extension CSS)
- `src/chart.js` — `let chartInstance`, `renderChart`
- `src/dock.js` — `let dockSide`, `nearestEdge`, `setDockSide`
- `src/checkboxes.js` — `let debounceTimer`, `injectCheckbox`, `clearAll`, `syncPlotAll`, `buildPlotAllControl`
- `src/panel.js` — `buildPanel` (DOM construction + all mouse interaction)
- `src/init.js` — URL guard, init sequence, MutationObservers

## Panel features

**Docking:** The panel docks to any of the four viewport edges. Dock side persists in `localStorage` under `ebay_scatterplot_dock`. `setDockSide(side)` in `src/dock.js` applies the correct CSS class (`dock-left/right/top/bottom`) to both the panel and the toggle button, and clears any inline styles left over from dragging.

- Left/right docks: 320px wide, full viewport height (portrait layout)
- Top/bottom docks: full viewport width, 280px tall (landscape layout — controls sidebar on the left, chart fills the right)

**Drag to redock:** The `<header>` is the drag handle (cursor: grab). On mousedown it pins the panel to its current pixel position (removing the dock class), then `mousemove` floats it. Within `SNAP_THRESHOLD` (80px) of any edge, a `#ebay-scatter-snap-preview` overlay shows where it will snap. On mouseup, `setDockSide(nearestEdge(...))` is called — the panel always snaps to a side, never free-floats.

**Toggle button:** The `#ebay-scatter-toggle` (📈) is a tab-shaped button that appears on the docked edge when the panel is closed. Its shape and position are set by `.dock-*` CSS classes (matching the panel's dock side). The toggle is also independently draggable to change the dock side without opening the panel — uses the same snap-preview UX.

**Resize:** `#ebay-scatter-resize` is an invisible 6px strip on the panel's free edge. Hovering shows a `col-resize` or `row-resize` cursor. Dragging resizes width (left/right docks) or height (top/bottom docks) inward. Min/max: width `[200px, 70vw]`, height `[120px, 70vh]`. `chartInstance.resize()` is called during drag. `setDockSide` clears inline width/height so size resets to CSS defaults when switching dock sides.

**z-index:** Panel is `2147483647` (max int32), toggle is `2147483646`, snap preview is `2147483645` — ensures the panel sits above eBay's sticky navigation.

## Data extraction

Extraction is content-based (resilient to eBay class renames):
- **Item ID:** `data-listingid` attribute, fallback to `/itm/<id>` URL parsing
- **Date:** leaf element (`span`/`div`) whose text starts with `"Sold "` — parses the date substring
- **Price:** leaf element whose full text matches `$X.XX` — checks parent chain for `line-through` (best-offer items are skipped); shipping added if a nearby leaf contains "delivery"/"shipping" and a `$` amount
- **Title:** `[role="heading"][aria-level="3"]` with `.clipped`/`aria-hidden` nodes stripped; falls back to card `aria-label`

`extractItemData` returns `null` for best-offer items, items missing a date, or items with unparseable prices. `injectCheckbox` only injects a checkbox if `extractItemData` succeeds, which keeps `syncPlotAll`'s total count accurate. Non-listing tiles (ads/promos) are marked `data-scatter-injected="skip"` and never re-checked; a listing card that fails extraction is left *unmarked* so a later observer pass retries it (handles eBay's lazy rendering). Successfully extracted data is cached in a `WeakMap` (`cardData`) so the checkbox handler and "Plot all" don't re-extract.

## Checkboxes & "Plot all"

- Per-item checkboxes are injected into each valid listing card. Checking one saves the item to `localStorage`; unchecking removes it. Changes debounce 150ms before updating storage and re-rendering the chart.
- `#ebay-scatter-plot-all` is inserted directly before `ul.srp-results` (anchored to the stable list container, not the filter bar which eBay re-renders). It has three states via the native `indeterminate` property: unchecked (none), indeterminate (some), checked (all). `syncPlotAll()` reconciles its state after every change.
- `clearAll()` wipes localStorage, unchecks all checkboxes, clears the chart.

## Chart

Chart.js scatter type with a linear x-axis (millisecond timestamps). Custom `ticks.callback` formats x-axis labels as `YYYY-MM-DD` — no date adapter needed. Chart updates in-place (`chartInstance.data.datasets[0].data = data; chartInstance.update()`) rather than destroying and recreating. `chartInstance` is declared in `src/chart.js` and referenced directly by `src/dock.js` and `src/panel.js`.

## MutationObserver

One observer in `src/init.js`, on `ul.srp-results` (`childList`). On each mutation it re-scans the direct `<li>` children that aren't yet marked (`:scope > li:not([data-scatter-injected])`) and runs `injectCheckbox` on them. This covers infinite scroll (new cards) and retries listing cards whose price/date hadn't rendered on an earlier pass. Filter, sort, and pagination on the sold-search page trigger full page navigations, so the extension simply re-initializes. Pagination was verified to work this way: the next page is a full reload, and because selections persist in `localStorage`, the existing plot survives and new-page items can be added to it (plotting accumulates across pages). There is no separate observer for in-place list replacement — eBay was confirmed never to swap `ul.srp-results` in place.
