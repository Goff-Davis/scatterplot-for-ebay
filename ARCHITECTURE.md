# Architecture

## What it does

This is a Firefox browser extension that adds a price history panel to eBay sold/completed search results pages. You check a box on any listing to add it to the chart, which plots sale price over time as a scatterplot.

## How the extension loads

The extension is declared as a **content script** in `manifest.json`. Firefox injects it into any `ebay.com` page. The script checks the URL before doing anything — it only activates when both `LH_Complete=1` and `LH_Sold=1` are present in the query string (eBay's parameters for "sold/completed" searches).

There is no build step. The source files are loaded directly by Firefox in the order listed in `manifest.json`.

## File structure

```
manifest.json          Extension declaration
package.json           npm (Chart.js dependency only)
node_modules/
  chart.js/            Loaded as a content script before the extension code
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

Both the panel header and the toggle button are draggable. When you start dragging, the element detaches from its edge and follows the mouse freely. As the mouse gets within 80px of any viewport edge, a semi-transparent blue overlay (`#ebay-scatter-snap-preview`) appears showing where it will snap. On mouse release, the element always snaps to the nearest edge — there is no free-floating state.

## Resizing

The resize handle sits on the panel's free edge (the edge facing the page content). Dragging it inward expands the panel; dragging outward contracts it. The chart re-renders immediately during the drag. Switching dock sides resets the panel to its default size.

## Data extraction

Rather than relying on eBay's CSS class names (which change frequently), the extension uses content-based heuristics to pull data from each listing card:

- **Price** — finds a leaf element whose entire text matches `$X.XX`; skips items where that price has a strikethrough style (best-offer listings)
- **Shipping** — finds a nearby leaf element containing "delivery" or "shipping" and a `$` amount; recognises "free shipping/delivery" as $0
- **Date** — finds a leaf element whose text starts with "Sold " and parses the date from it
- **Item ID** — reads `data-listingid` on the card element, with a fallback to parsing the `/itm/<id>` URL

Items that fail any of these checks (missing price, missing date, best-offer) get no checkbox injected. This keeps the "Plot all" checkbox state accurate.

## Checkboxes and "Plot all"

Each valid listing gets a small "Plot" checkbox injected into its card. Checking it saves the item's data to `localStorage`; unchecking removes it. The chart re-renders after each change.

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

eBay's search page updates the DOM without full page reloads in two ways:

1. **Infinite scroll** — new listing cards are appended to `ul.srp-results`. A `MutationObserver` on that element detects new `<li>` children and injects checkboxes into them.
2. **Pagination** — eBay sometimes replaces the entire `ul.srp-results` element. A second `MutationObserver` on the parent detects this and reconnects the first observer to the new list.

## Dependencies

| Dependency | Purpose | How it's loaded |
|------------|---------|-----------------|
| `chart.js` | Scatterplot rendering | Listed in `manifest.json` before the `src/` files; available as `window.Chart` |

Chart.js is managed with npm (`package.json`) and loaded directly from `node_modules/`. eBay's Content Security Policy blocks CDN script injection, so the file must be bundled with the extension.
