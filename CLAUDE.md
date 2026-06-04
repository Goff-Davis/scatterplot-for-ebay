# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Firefox browser extension (Manifest V3) that injects a scatterplot panel into eBay sold/completed search results pages to visualize listing prices over time. Full feature spec is in `prompt.md`.

## Setup & development

```bash
npm install          # install Chart.js (required before loading extension)
```

No build step. Load the extension in Firefox:
1. `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`
2. Navigate to an eBay sold/completed search (both `LH_Complete=1` and `LH_Sold=1` must be in the URL)
3. After editing any `src/*.js` file, click "Reload" on the extension card

To update Chart.js: `npm update chart.js` then reload the extension.

## Architecture

Content scripts in `src/` are loaded sequentially by the manifest. All files share the same content script sandbox scope — no IIFE, no ES modules. Top-level `const`/`let`/`function` declarations in one file are accessible to all subsequently loaded files. The extension only activates when both `LH_Complete=1` and `LH_Sold=1` are in the URL (guard in `src/init.js`). Chart.js is loaded first via the manifest (`node_modules/chart.js/dist/chart.umd.min.js`) so `window.Chart` is available synchronously — no CDN injection (eBay's CSP blocks it).

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

`extractItemData` returns `null` for best-offer items, items missing a date, or items with unparseable prices. `injectCheckbox` only injects a checkbox if `extractItemData` succeeds, which keeps `syncPlotAll`'s total count accurate.

## Checkboxes & "Plot all"

- Per-item checkboxes are injected into each valid listing card. Checking one saves the item to `localStorage`; unchecking removes it. Changes debounce 150ms before updating storage and re-rendering the chart.
- `#ebay-scatter-plot-all` is inserted directly before `ul.srp-results` (anchored to the stable list container, not the filter bar which eBay re-renders). It has three states via the native `indeterminate` property: unchecked (none), indeterminate (some), checked (all). `syncPlotAll()` reconciles its state after every change.
- `clearAll()` wipes localStorage, unchecks all checkboxes, clears the chart.

## Chart

Chart.js scatter type with a linear x-axis (millisecond timestamps). Custom `ticks.callback` formats x-axis labels as `YYYY-MM-DD` — no date adapter needed. Chart updates in-place (`chartInstance.data.datasets[0].data = data; chartInstance.update()`) rather than destroying and recreating. `chartInstance` is declared in `src/chart.js` and referenced directly by `src/dock.js` and `src/panel.js`.

## MutationObservers

Two observers in `src/init.js`:
1. On `ul.srp-results` — watches for new `<li>` children (infinite scroll), calls `injectCheckbox` on each
2. On the parent of `ul.srp-results` — detects when eBay replaces the entire list on pagination, reconnects the first observer to the new container
