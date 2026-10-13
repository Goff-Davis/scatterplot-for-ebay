// eBay has served both list shapes in 2026: ul.srp-results (June, and again in October)
// and ul.su-grid (July). Both are matched so whichever one eBay serves keeps working.
const RESULTS_SEL = 'ul.srp-results, ul.su-grid';
const STORAGE_KEY = 'ebay_scatterplot_items';
const MAX_ITEMS = 200;
const DOCK_KEY = 'ebay_scatterplot_dock';
const SNAP_THRESHOLD = 80;
const PANEL_OPEN_KEY = 'ebay_scatterplot_panel_open';
const THEME_KEY = 'ebay_scatterplot_theme';
const FONT_SIZE_KEY = 'ebay_scatterplot_fontsize';
const CURRENCY_KEY = 'ebay_scatterplot_currency';
