# Scatterplot for eBay

A Firefox extension that adds a price history panel to eBay search pages. Select listings to plot their sale prices — sold listings are charted by sale date; active listings are shown in a price-distribution view.

Supports all major eBay sites: ebay.com, ebay.co.uk, ebay.de, ebay.ca, ebay.com.au, ebay.fr, ebay.it, and ebay.es.

## Features

- **Scatterplot panel** docked to any edge of the screen (top, right, bottom, left)
- **Per-listing checkboxes** to choose which items to include in the chart
- **"Plot all"** checkbox to select or deselect all valid listings at once
- **Drag to redock** — drag the panel header or the toggle tab to move the panel to a different edge
- **Resizable** — drag the panel's free edge to expand or contract it
- **Currency conversion** — choose a display currency from the panel header; all prices are converted from their original listing currencies using live exchange rates
- **Dark / light theme** — toggle in the panel header
- **Adjustable text size** — set the panel font size from the header
- **Persists across page loads** — selected items, dock position, panel open/closed state, theme, and font size are saved in `localStorage`
- Handles infinite scroll and pagination automatically

## Installation

This extension is not listed on AMO, so it must be loaded manually as a temporary add-on.

**Prerequisites:** Firefox, Node.js (for npm)

1. Clone or download this repository
2. Run `npm install` (installs Chart.js and easy-currencies plus dev tooling, and vendors them into `vendor/`)
3. Open Firefox and go to `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on** and select `manifest.json` from this folder

The extension will remain active until Firefox is closed. Repeat step 4 after restarting.

## Usage

1. Go to any eBay search page — the 📈 tab appears on the edge of the screen
2. Click the 📈 tab to open the price history panel (or check a listing to open it automatically)
3. Check the **Plot** box on any listing to add it to the chart
4. Use **Plot all** to select everything on the page at once
5. Hover over a point on the chart to see the item title and price

**Sold vs. active listings:** Sold listings are charted by sale date. Active (unsold) listings appear in a separate "Active Listings" strip chart sorted by price — the x-axis spreads items horizontally so price clusters are visible. Both chart sections appear in the same panel when you have both types selected.

**Across pages:** Your selections are saved, so you can move to the next page of results and keep adding listings — the chart accumulates points from every page you visit.

**Moving the panel:** Drag the "Price History" header to any edge of the screen. Release near an edge to snap it there. Close the panel with the × button — a small tab appears to reopen it. The tab can also be dragged to a different edge.

**Resizing:** Hover over the panel's inner edge until the cursor changes, then drag to resize.

**Theme and text size:** Use the header controls to switch between dark and light mode (☉/☾) and to set the panel's text size. Both preferences are saved and restored on your next visit.

**Currency conversion:** The panel header includes a currency dropdown (USD, GBP, EUR, CAD, AUD, MXN). It defaults to the native currency of the eBay site you're on. Changing it converts all charted prices on the fly using live exchange rates; your selection is saved and restored on your next visit.

## Development

No build step is needed to develop. After editing any file in `src/`:

1. Go to `about:debugging#/runtime/this-firefox`
2. Find the extension and click **Reload**

Run the unit tests with `npm test` (covers extraction, storage, dock geometry, chart math, checkbox state, and panel header wiring).

To package the extension for distribution, run `npm run lint` and `npm run build`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full explanation of how the extension works.
