# Scatterplot for eBay

A Firefox extension that adds a price history panel to eBay sold/completed search results. Select listings to plot their sale prices over time.

> **eBay.com only.** International eBay sites (ebay.co.uk, ebay.de, …) aren't supported — the extension matches `*://*.ebay.com/sch/*`, and its date/price/keyword parsing assumes the US English layout.

## Features

- **Scatterplot panel** docked to any edge of the screen (top, right, bottom, left)
- **Per-listing checkboxes** to choose which items to include in the chart
- **"Plot all"** checkbox to select or deselect all valid listings at once
- **Drag to redock** — drag the panel header or the toggle tab to move the panel to a different edge
- **Resizable** — drag the panel's free edge to expand or contract it
- **Persists across page loads** — selected items and dock position are saved in `localStorage`
- Handles infinite scroll and pagination automatically

## Installation

This extension is not listed on AMO, so it must be loaded manually as a temporary add-on.

**Prerequisites:** Firefox, Node.js (for npm)

1. Clone or download this repository
2. Run `npm install` (installs Chart.js plus dev tooling, and copies Chart.js into `vendor/`)
3. Open Firefox and go to `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on** and select `manifest.json` from this folder

The extension will remain active until Firefox is closed. Repeat step 4 after restarting.

## Usage

1. Go to an eBay search and filter to **Sold listings** (or **Completed listings**)
   The URL must contain `LH_Sold=1`
2. The price history panel appears on the right side of the page
3. Check the **Plot** box on any listing to add it to the chart
4. Use **Plot all** to select everything on the page at once
5. Hover over a point on the chart to see the item title, date, and price

**Across pages:** Your selections are saved, so you can move to the next page of results and keep adding listings — the chart accumulates points from every page you visit.

**Moving the panel:** Drag the "Price History" header to any edge of the screen. Release near an edge to snap it there. Close the panel with the × button — a small tab appears to reopen it. The tab can also be dragged to a different edge.

**Resizing:** Hover over the panel's inner edge until the cursor changes, then drag to resize.

## Development

No build step is needed to develop. After editing any file in `src/`:

1. Go to `about:debugging#/runtime/this-firefox`
2. Find the extension and click **Reload**

Run the unit tests with `npm test` (covers the data-extraction logic in `src/extract.js`).

To package the extension for distribution, run `npm run lint` and `npm run build`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full explanation of how the extension works.
