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

Content scripts in `src/` loaded sequentially by the manifest. All files share the same content script sandbox scope (no IIFE, no modules needed). Loads only when both `LH_Complete=1` and `LH_Sold=1` are in the URL (guard in `src/init.js`). Chart.js is loaded first via the manifest (`node_modules/chart.js/dist/chart.umd.min.js`) so `window.Chart` is available synchronously — no CDN injection (eBay's CSP blocks it).

**Source files (load order matches manifest):**
- `src/constants.js` — shared constants (STORAGE_KEY, DOCK_KEY, etc.)
- `src/storage.js` — `loadItems`, `saveItems`
- `src/extract.js` — DOM extraction helpers (`extractItemData` and friends)
- `src/styles.js` — `injectStyles` (all CSS)
- `src/chart.js` — `chartInstance`, `renderChart`
- `src/dock.js` — `dockSide` state, `nearestEdge`, `setDockSide`
- `src/checkboxes.js` — `injectCheckbox`, `clearAll`, `syncPlotAll`, `buildPlotAllControl`
- `src/panel.js` — `buildPanel` (DOM + resize/drag/toggle interaction)
- `src/init.js` — URL guard, init sequence, MutationObservers

**Key design decisions:**
- DOM selectors are class-based for the container (`ul.srp-results`) and individual item fields, but extraction falls back to content-based heuristics: date found by "Sold " text prefix on leaf elements, price found by `$X.XX` pattern on leaf elements, shipping by "delivery"/"shipping" keyword. This makes the extension resilient to eBay class renames.
- Individual items are `li` direct children of the container, not filtered by class.
- Checkboxes are only injected on items where `extractItemData` succeeds — best-offer (strikethrough price) and unparseable items get no checkbox. This keeps the "Plot all" sync accurate.
- Item data persists in `localStorage` under key `ebay_scatterplot_items` (capped at 200 items), keyed by eBay item ID (`data-listingid` attribute, fallback to `/itm/<id>` URL parsing).
- The "Plot all" checkbox has three states via the native `indeterminate` property: unchecked (none selected), indeterminate (some selected), checked (all selected). `syncPlotAll()` is called after every state change to keep it in sync.
- Chart renders in-place (updates existing instance rather than destroying/recreating) using Chart.js scatter type with linear x-axis (millisecond timestamps) and a custom `ticks.callback` for `YYYY-MM-DD` display — no date adapter needed.
- A `MutationObserver` on `ul.srp-results` handles infinite scroll; a second observer on its parent handles full list replacement on pagination.
