# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Firefox browser extension (Manifest V3) that injects a scatterplot panel into eBay search pages to visualize listing prices. Works on all eBay search pages — sold listings are plotted by sale date; active listings are plotted in a price-distribution strip chart.

## Setup & development

```bash
npm install          # installs Chart.js + web-ext; postinstall vendors Chart.js into vendor/
```

The extension's own source (`src/*.js`) is loaded as-is — no bundler or transpiler. Third-party libraries are vendored via `scripts/vendor.mjs` (runs on `npm install` postinstall and before `npm run build`) so the packaged XPI never references `node_modules/`:

- **Chart.js** — file-copied directly into `vendor/chart.js/`
- **easy-currencies** — CJS/Node package (uses axios); cannot be loaded as a content script directly, so bundled via esbuild into a browser IIFE at `vendor/easy-currencies/easy-currencies.iife.js` exposing `window.EasyCurrencies`. `platform: 'browser'` in the esbuild config resolves axios's browser field automatically.

Load the extension in Firefox for development:

1. `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `manifest.json`
2. Navigate to any eBay search page (e.g. `*.ebay.com/sch/*`, `*.ebay.co.uk/sch/*`, etc.)
3. After editing any `src/*.js` file, click "Reload" on the extension card

To update Chart.js: `npm update chart.js` then `npm run vendor` (re-copies into `vendor/`).

Source is formatted with 2-space indent, single quotes, semicolons, and braces on all blocks — match the existing style when editing.

## Build & packaging

- `npm run lint` — `web-ext lint`, must pass with 0 errors before submitting
- `npm run build` — vendors Chart.js, then `web-ext build` → `web-ext-artifacts/scatterplot_for_ebay-<version>.zip`
- `npm run sign` — submits to AMO as a listed add-on (needs `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`)

Packaging ignores are under `webExt.ignoreFiles` in `package.json` — `node_modules/`, `scripts/`, `test/`, and docs, but `vendor/` IS shipped. Bump `version` in both `manifest.json` and `package.json` per release.

## Testing

```bash
npm test    # node:test runner; cross-env pins TZ=Australia/Sydney (cross-platform)
TZ=Australia/Sydney node --test test/storage.test.mjs   # run one file (keep the TZ pin)
```

Requires **Node ≥ 21** (declared in `package.json` `engines`): the test-file glob is expanded by Node's test runner, not the shell, so the script double-quotes it to work in both POSIX `sh` and Windows `cmd`.

The suite locks down the core logic that must stay stable regardless of eBay's markup: extraction (`src/extract.js`), the storage contract (`src/storage.js`), dock geometry (`nearestEdge`), chart data-shaping math (`src/chart.js`), and the checkbox state reconcilers (`src/checkboxes.js`). Coverage is **deliberately scoped** (see `TEST_PLAN.md`) — every test is labeled with one of three buckets: **invariant** (synthetic DOM, must hold forever), **documents-behavior** (a current/debatable choice pinned so a change is noticed), or **markup-canary** (a real captured eBay card; kept few, fails loudly when the markup shifts). Files live in `test/`:

- `test/extract.test.mjs` — `parseAmount`, `extractPrice`, `extractDate`, `extractItemId`, `extractTitle`, `extractItemData`, plus the markup-canary fixtures
- `test/storage.test.mjs` — `loadItems`/`saveItems` degradation + the `MAX_ITEMS` cap
- `test/dock.test.mjs` — `nearestEdge` geometry (incl. the center tie-break)
- `test/chart.test.mjs` — `renderChart` data-shaping (centering, range line-only, priceHigh-aware y-max) against a fake Chart
- `test/checkboxes.test.mjs` — `syncPlotAll` tri-state, `reconcileCheckboxes`, and `injectCheckbox` change-handler cross-type coexistence
- `test/panel.test.mjs` — `buildPanel` DOM/event wiring, font-size input, and dark/light theme toggle
- `test/helpers/load.mjs` — `loadModules(files, { url, setup })` loads any `src/` files into one shared jsdom-backed `node:vm` context (mirroring the content-script scope), so the **source stays free of any test-only exports** and tests run the exact shipped code; `loadExtract` is the extract-only shorthand
- `test/helpers/chart-stub.mjs` — `makeChartStub()`, a fake Chart.js constructor that records the config it was built with
- `test/fixtures/*.html` — real listing cards (sold-search **and** active-search), trimmed and self-contained (no external assets), with expected values asserted against the real data. International pages (`international-pages/LOCALE/TYPE/`) are minified single-line HTML — use Perl to extract cards: `perl -0777 -ne 'if (/(<li\b[^>]*data-listingid=ID[^>]*>.*?<\/li>)/s) { $c=$1; $c=~s/<img\b[^>]*>/ /g; print $c }' page.htm`. CSS-class-only strikethrough spans need `style="text-decoration: line-through"` added inline (jsdom ignores class-based rules).

Key conventions:

- **The `test` script pins `TZ=Australia/Sydney`** (a positive UTC offset) on purpose: `extractDate` must store the displayed calendar date, and the original H1 bug (UTC round-trip via `toISOString()`) only shows up at a positive offset. Running there means any reintroduction fails the date tests even on US machines.
- **`loadModules`/`loadExtract` return vm-realm values**: objects and arrays they hand back are constructed inside the `node:vm` sandbox, so `assert/strict` `deepEqual` rejects them on prototype identity — assert structural values via `JSON.stringify` (or spread `[...arr]` into the test realm), not `deepEqual`.
- **Summed prices are floats** (`item + shipping`), so assert them with a tolerance, never a hand-rounded literal.
- **`extractPrice` returns `{ price, priceHigh? }` or `null`** — `priceHigh` is set for range-priced listings (e.g. `$8.99 to $18.99`).
- **Best-offer/strikethrough**: jsdom's `getComputedStyle` reflects inline styles but not class-based stylesheet rules, so the best-offer fixture carries an inline `text-decoration: line-through` (the live page uses a CSS class); `extractPrice` then correctly returns `null`.
- **Browser globals are absent from the vm sandbox by default** — only `window`, `document`, `localStorage`, and `console` are wired. Any code path that calls other globals must add them in `setup` (e.g. `sb.getComputedStyle = sb.window.getComputedStyle.bind(sb.window)`). Specifically: `renderSoldChart`/`renderUnsoldChart` need `getComputedStyle` (via `getChartColors()`); `injectCheckbox`'s `change` handler needs `clearTimeout`, `setTimeout`, and a stubbed `renderChart`; loading `currency.js` requires `sb.EasyCurrencies = {}` (referenced at module load time). Bare `location` is not a global in the vm sandbox — source code must use `window.location.hostname`, not `location.hostname`. Missing globals throw `ReferenceError` — but jsdom catches errors thrown inside event listeners and prints them without failing the test, so the suite can show green with noisy output. Wire the globals to silence it.

## Architecture

Content scripts in `src/` are loaded sequentially by the manifest. All files share the same content script sandbox scope — no IIFE, no ES modules. Top-level `const`/`let`/`function` declarations in one file are accessible to all subsequently loaded files. The content scripts are registered for eBay search pages across all supported domains (`ebay.com`, `ebay.co.uk`, `ebay.de`, `ebay.ca`, `ebay.com.au`, `ebay.fr`, `ebay.it`, `ebay.es` — 8 patterns in the manifest), and `src/init.js` runs unconditionally on all matching pages (no URL guard). Chart.js is loaded first via the manifest (`vendor/chart.js/chart.umd.min.js`) so `window.Chart` is available synchronously — no CDN injection (eBay's CSP blocks it).

**Source files (load order matches manifest):**

- `src/constants.js` — nine `const` values: `RESULTS_SEL`, `STORAGE_KEY`, `MAX_ITEMS`, `DOCK_KEY`, `SNAP_THRESHOLD`, `PANEL_OPEN_KEY`, `THEME_KEY`, `FONT_SIZE_KEY`, `CURRENCY_KEY`
- `src/storage.js` — `loadItems`, `saveItems` (localStorage, 200-item cap)
- `src/extract.js` — content-based DOM extraction: `leafElements`, `extractItemId`, `extractTitle`, `parseAmount`, `extractPrice`, `extractDate`, `extractItemData`
- `src/styles.js` — `injectStyles` (injects a `<style>` tag with all extension CSS)
- `src/currency.js` — `SYMBOL_TO_CODE`, `CODE_TO_SYMBOL`, `TLD_TO_CODE`, `ALL_CURRENCY_CODES`; `getDefaultCurrencyCode` (TLD → currency code via `window.location.hostname`), `getSelectedCurrencyCode` (localStorage + default), `fetchRates` (1-hour in-memory cache via `window.EasyCurrencies`), `convertPrice`
- `src/chart.js` — `let chartInstance`, `let chartInstanceUnsold`, `renderChart`, `renderChartConverted` (async: renders face-value immediately, then re-renders with converted prices; all UI event handlers call this instead of `renderChart` — only `clearAll` calls `renderChart([])` directly), `renderSoldChart`, `renderUnsoldChart`, `rangeLinesPlugin`, `updateChartFontSizes`
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

**Theme & font size:** A dark/light toggle (`#ebay-scatter-theme`) and a font-size number input (`#ebay-scatter-font-size`) live in the header. Theme persists under `THEME_KEY` (default dark); the toggle flips `.theme-light` on both panel and toggle button and destroys/recreates both chart instances so they pick up the new CSS-variable colors. All themeable colors are CSS custom properties declared on `#ebay-scatter-panel` and overridden under `.theme-light`. Font size persists under `FONT_SIZE_KEY` (default 14px, range 10–28).

**Font sizing:** The panel base font-size is set via `panel.style.fontSize` (inline style) so it survives `setDockSide`'s style-clearing. Child CSS font-sizes use `em` units so they scale with the base — never add a hardcoded `px` font-size inside `#ebay-scatter-panel`. Chart.js axes/tooltips do **not** inherit CSS font-size; they need explicit `font: { size }` on tick options and `bodyFont: { size }` on tooltip options. `updateChartFontSizes(size)` in `src/chart.js` patches both live chart instances.

**Header drag guard:** The header `mousedown` handler skips drag logic when `e.target.closest('button, input, select')` is truthy. Any new interactive element added to the header must be included in this selector, or clicks will trigger drag logic and can pin/reset panel dimensions.

## Data extraction

Extraction is content-based (resilient to eBay class renames):

- **Item ID:** `data-listingid` attribute, fallback to `/itm/<id>` URL parsing
- **Date:** leaf element (`span`/`div`) matching `SOLD_RE` (`/^(?:Sold|Verkauft|Vendu(?:\s+le)?|Venduto|Venduti|Vendido|Vendidos)\b/i`) — parses the date substring using `MONTH_MAP` (EN/FR/IT/ES/DE month names). Handles day-first format ("14 Jun 2026", used by UK/AU/CA/DE/FR/IT/ES) and month-first ("Jun 14, 2026", US/MX EN) via pure string manipulation — no `new Date()` conversion (immune to UTC/TZ regression). Returns `null` for active (unsold) listings.
- **Price:** leaf element whose full text matches `PRICE_RE` (`$X.XX`, `£X.XX`, `EUR X,XX` prefix, or `X,XX EUR` suffix) — checks parent chain for `line-through` (best-offer items are skipped); shipping added if a leaf **after the price element in DOM order** contains a multi-language shipping keyword (`delivery`/`shipping`/`Versand`/`Lieferung`/`livraison`/`consegna`/`spedizione`/`envío`/`expédition`) and a currency amount, or a `+<amount>` leaf in any supported currency (split-span delivery pattern). Scanning only post-price leaves prevents false positives when product titles contain free-shipping phrases (e.g. Italian "SPEDIZIONE GRATUITA", French "Livraison gratuite") — title spans always precede the price in eBay card DOM. `parseAmount` auto-detects EUR comma-decimal (`X,XX` with exactly 2 digits before space/end) vs. period-decimal; US thousands commas (`$1,234.56`) always have 3+ digits after the comma and are never misread. Returns `{ price, priceHigh? }` or `null`. `priceHigh` is set when a second non-struck price span exists in the same parent element (range listings, e.g. `$8.99 to $18.99`). Mixed currencies (foreign sellers) appear on every eBay page and are plotted at face value — no currency conversion.
- **Title:** `[role="heading"][aria-level="3"]` with `.clipped`/`aria-hidden` nodes stripped; falls back to card `aria-label`

`extractItemData` returns `null` for best-offer items or items with unparseable prices. Items with a sold-prefix date get `type: 'sold'`; items without get `type: 'unsold'` and today's local date as a fallback (so they still appear in the chart). Items in localStorage from before the `type` field was added are treated as `'sold'`. `injectCheckbox` only injects a checkbox if `extractItemData` succeeds. Non-listing tiles (ads/promos) are marked `data-scatter-injected="skip"` and never re-checked; a listing card that fails extraction is left _unmarked_ so a later observer pass retries it (handles eBay's lazy rendering). Successfully extracted data is cached in a `WeakMap` (`cardData`) so the checkbox handler and "Plot all" don't re-extract.

## Checkboxes & "Plot all"

- Per-item checkboxes are injected into each valid listing card. Checking one saves the item to `localStorage` **immediately** and calls `openPanel()` to open the panel if it is minimized.
- `#ebay-scatter-plot-all` is inserted directly before `ul.srp-results` (anchored to the stable list container, not the filter bar which eBay re-renders). It has three states via the native `indeterminate` property: unchecked (none), indeterminate (some), checked (all). `syncPlotAll()` reconciles its state after every change.
- `clearAll()` wipes localStorage, unchecks all checkboxes, clears the chart.
- **Storage dedup key is `id+type`** — all mutation paths (add, remove, dedup) use composite key `"${id}:${type || 'sold'}"`. If you add a new write path, follow this pattern; id-only dedup silently drops one record when a multi-quantity item appears as both sold and active.

## Chart

Two separate chart sections are rendered inside the panel, each visible only when items of that type are selected:

**Sold listings** (`#ebay-scatter-sold-wrap`, blue dots): Chart.js scatter with x = sold date (millisecond timestamp), y = total price. Custom `ticks.callback` formats x-axis as `YYYY-MM-DD`. No date adapter needed.

**Active listings** (`#ebay-scatter-unsold-wrap`, blue dots): Items sorted by price; x = sequential index centered around 0 (no date meaning — used purely to spread overlapping prices and reveal price clusters). x-axis tick labels are hidden. Range-priced items show only a vertical line (dot suppressed).

Both charts use the `rangeLinesPlugin` (defined in `src/chart.js`) to draw a vertical line through range-priced items (`priceHigh` set). Both update in-place rather than destroying and recreating. Both `chartInstance` and `chartInstanceUnsold` are declared in `src/chart.js` and referenced directly by `src/dock.js` and `src/panel.js`.

**In-place update closure gotcha:** The `if (chartInstance)` early-return paths only patch `.data` and scale options — they do NOT refresh the tick/tooltip callbacks, which close over `sym` (the currency symbol) at chart-creation time. Any feature that changes what those callbacks display must explicitly reassign the callback functions in the in-place update branch, not only in the initial construction block.

## MutationObserver

One observer in `src/init.js`, on `ul.srp-results` (`childList`). On each mutation it re-scans the direct `<li>` children that aren't yet marked (`:scope > li:not([data-scatter-injected])`) and runs `injectCheckbox` on them. This covers infinite scroll (new cards) and retries listing cards whose price/date hadn't rendered on an earlier pass. Filter, sort, and pagination on eBay search pages trigger full page navigations, so the extension simply re-initializes. Pagination was verified to work this way: the next page is a full reload, and because selections persist in `localStorage`, the existing plot survives and new-page items can be added to it (plotting accumulates across pages). There is no separate observer for in-place list replacement — eBay was confirmed never to swap `ul.srp-results` in place.
