(function () {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("LH_Complete") || !params.has("LH_Sold")) return;

  const RESULTS_SEL = "ul.srp-results";

  const STORAGE_KEY = "ebay_scatterplot_items";
  const MAX_ITEMS   = 200;

  // ── localStorage ────────────────────────────────────────────────────────────

  function loadItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  }

  // ── Data extraction ──────────────────────────────────────────────────────────

  // Returns leaf elements (no child elements) matching a selector within card.
  function leafElements(card, sel) {
    return Array.from(card.querySelectorAll(sel)).filter(el => el.childElementCount === 0);
  }

  function extractItemId(card) {
    if (card.dataset.listingid) return card.dataset.listingid;
    const a = card.querySelector("a[href*='/itm/']");
    if (!a) return null;
    const m = a.href.match(/\/itm\/(?:[^/?]+\/)?(\d+)/);
    return m ? m[1] : null;
  }

  function extractTitle(card) {
    // Prefer the semantic heading; fall back to aria-label on the card itself
    const heading = card.querySelector("[role='heading'][aria-level='3']");
    if (heading) {
      const clone = heading.cloneNode(true);
      clone.querySelectorAll(".clipped, [aria-hidden='true']").forEach(n => n.remove());
      return clone.textContent.trim() || null;
    }
    return card.getAttribute("aria-label") || null;
  }

  function parseAmount(text) {
    const m = text.replace(/,/g, "").match(/\d+\.?\d*/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function extractPrice(card) {
    // Find a leaf element whose entire text is a bare dollar amount: "$107.94"
    const priceEl = leafElements(card, "span, div").find(el =>
      /^\$[\d,]+\.?\d*$/.test(el.textContent.trim())
    );
    if (!priceEl) return null;

    // Best offer: price is crossed out
    let node = priceEl;
    for (let i = 0; i < 4; i++) {
      if (!node) break;
      if (window.getComputedStyle(node).textDecoration.includes("line-through")) return null;
      node = node.parentElement;
    }

    const sold = parseAmount(priceEl.textContent);
    if (isNaN(sold)) {
      console.warn("[ebay-scatter] Could not parse price:", priceEl.textContent);
      return null;
    }

    // Find shipping: leaf element containing "delivery" or "shipping" and a "$" amount
    let shipping = 0;
    for (const el of leafElements(card, "span, div")) {
      const text = el.textContent.trim();
      if (/free\s+(delivery|shipping)/i.test(text)) { shipping = 0; break; }
      if (/(delivery|shipping)/i.test(text) && /\$/.test(text)) {
        const parsed = parseAmount(text);
        if (!isNaN(parsed)) { shipping = parsed; break; }
      }
    }

    return sold + shipping;
  }

  function extractDate(card) {
    // Find a leaf element whose text starts with "Sold "
    const el = leafElements(card, "span, div").find(el =>
      /^Sold\b/i.test(el.textContent.trim())
    );
    if (!el) return null;
    const m = el.textContent.match(/([A-Za-z]+ \d{1,2},?\s*\d{4})/);
    if (!m) return null;
    const d = new Date(m[1]);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  function extractItemData(card) {
    const id    = extractItemId(card);
    const price = extractPrice(card); // returns null for best-offer items
    const date  = extractDate(card);
    if (!id || price === null || !date) {
      console.warn("[ebay-scatter] Skipping card:", { id: !!id, price, date });
      return null;
    }
    const a = card.querySelector("a[href*='/itm/']");
    return { id, title: extractTitle(card) || "Unknown item", date, price, url: a ? a.href : "" };
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
      #ebay-scatter-panel {
        position: fixed; right: 0; top: 0;
        width: 320px; height: 100vh;
        background: rgba(24,24,24,0.97); color: #eee;
        z-index: 99999; display: flex; flex-direction: column;
        box-shadow: -4px 0 20px rgba(0,0,0,0.6);
        font-family: system-ui, sans-serif; font-size: 13px;
      }
      #ebay-scatter-panel header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #3a3a3a; flex-shrink: 0;
      }
      #ebay-scatter-panel header h2 { margin: 0; font-size: 14px; font-weight: 600; }
      #ebay-scatter-close {
        background: none; border: none; color: #888; font-size: 20px;
        cursor: pointer; padding: 0 2px; line-height: 1;
      }
      #ebay-scatter-close:hover { color: #fff; }
      #ebay-scatter-controls {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 12px; border-bottom: 1px solid #3a3a3a; flex-shrink: 0;
      }
      #ebay-scatter-clear {
        background: #444; border: none; color: #ddd;
        padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
      }
      #ebay-scatter-clear:hover { background: #666; }
      #ebay-scatter-status { font-size: 12px; color: #888; }
      #ebay-scatter-chart-wrap {
        flex: 1; min-height: 0; padding: 8px; position: relative;
      }
      #ebay-scatter-placeholder {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        color: #555; font-size: 13px; text-align: center; padding: 20px;
      }
      #ebay-scatter-toggle {
        position: fixed; right: 0; top: 50%; transform: translateY(-50%);
        z-index: 99998; background: rgba(24,24,24,0.92); color: #eee;
        border: none; border-radius: 6px 0 0 6px;
        padding: 10px 6px; cursor: pointer; font-size: 18px;
        box-shadow: -2px 0 10px rgba(0,0,0,0.4); display: none;
      }
      #ebay-scatter-toggle:hover { background: #333; }
      .ebay-scatter-cb {
        display: inline-flex; align-items: center; gap: 4px;
        margin-top: 6px; cursor: pointer; user-select: none;
        font-size: 12px; color: #555;
      }
      .ebay-scatter-cb input { cursor: pointer; margin: 0; }
      #ebay-scatter-plot-all-wrap {
        display: flex; align-items: center; gap: 6px;
        padding: 6px 0 2px; font-size: 13px;
      }
      #ebay-scatter-plot-all-wrap label { cursor: pointer; }
      #ebay-scatter-plot-all {
        appearance: none; -webkit-appearance: none;
        width: 15px; height: 15px; flex-shrink: 0;
        border: 2px solid #767676; border-radius: 2px;
        background: #fff; cursor: pointer; position: relative;
        vertical-align: middle;
      }
      #ebay-scatter-plot-all:checked,
      #ebay-scatter-plot-all:indeterminate {
        background: #0064d2; border-color: #0064d2;
      }
      #ebay-scatter-plot-all:checked::after {
        content: ''; position: absolute;
        left: 3px; top: 0px; width: 5px; height: 9px;
        border: 2px solid #fff; border-top: none; border-left: none;
        transform: rotate(45deg);
      }
      #ebay-scatter-plot-all:indeterminate::after {
        content: ''; position: absolute;
        left: 2px; right: 2px; top: 50%; height: 2px;
        background: #fff; transform: translateY(-50%);
      }
    `;
    document.head.appendChild(s);
  }

  // ── Panel ────────────────────────────────────────────────────────────────────

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "ebay-scatter-panel";
    panel.innerHTML = `
      <header>
        <h2>Price History</h2>
        <button id="ebay-scatter-close" title="Close">&times;</button>
      </header>
      <div id="ebay-scatter-controls">
        <button id="ebay-scatter-clear">Clear All</button>
        <span id="ebay-scatter-status"></span>
      </div>
      <div id="ebay-scatter-chart-wrap">
        <div id="ebay-scatter-placeholder">Check items below to plot prices</div>
        <canvas id="ebay-scatter-canvas"></canvas>
      </div>
    `;
    document.body.appendChild(panel);

    const toggle = document.createElement("button");
    toggle.id = "ebay-scatter-toggle";
    toggle.title = "Show Price History";
    toggle.textContent = "📈";
    document.body.appendChild(toggle);

    document.getElementById("ebay-scatter-close").addEventListener("click", () => {
      panel.style.display = "none";
      toggle.style.display = "block";
    });
    toggle.addEventListener("click", () => {
      panel.style.display = "flex";
      toggle.style.display = "none";
    });
    document.getElementById("ebay-scatter-clear").addEventListener("click", clearAll);
  }

  // ── Chart ────────────────────────────────────────────────────────────────────

  let chartInstance = null;

  function renderChart(items) {
    const canvas      = document.getElementById("ebay-scatter-canvas");
    const placeholder = document.getElementById("ebay-scatter-placeholder");
    const status      = document.getElementById("ebay-scatter-status");

    status.textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";

    if (!items.length) {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      canvas.style.display = "none";
      placeholder.style.display = "flex";
      return;
    }

    placeholder.style.display = "none";
    canvas.style.display = "block";

    const data = items.map(item => ({
      x: new Date(item.date).getTime(),
      y: item.price,
      title: item.title,
      date: item.date,
    }));

    if (chartInstance) {
      chartInstance.data.datasets[0].data = data;
      chartInstance.update();
      return;
    }

    chartInstance = new window.Chart(canvas, {
      type: "scatter",
      data: {
        datasets: [{
          label: "Total Price",
          data,
          pointRadius: 5,
          pointHoverRadius: 7,
          backgroundColor: "rgba(99,179,237,0.8)",
          borderColor: "rgba(99,179,237,1)",
        }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#bbb" } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.raw.title} | ${ctx.raw.date} | $${ctx.raw.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            ticks: {
              color: "#999",
              maxTicksLimit: 6,
              callback: v => new Date(v).toISOString().slice(0, 10),
            },
            grid: { color: "#2e2e2e" },
          },
          y: {
            ticks: {
              color: "#999",
              callback: v => `$${v.toFixed(0)}`,
            },
            grid: { color: "#2e2e2e" },
          },
        },
      },
    });
  }

  // ── Checkboxes ───────────────────────────────────────────────────────────────

  let debounceTimer = null;

  function injectCheckbox(card) {
    if (card.dataset.scatterInjected) return;
    card.dataset.scatterInjected = "1"; // mark early to prevent re-entry from observer
    const id = extractItemId(card);
    if (!id || !card.querySelector("a[href*='/itm/']")) return;
    // Only inject a checkbox if the item's data can actually be extracted.
    // This keeps syncPlotAll's "all" count accurate — unextractable items
    // (no date, no price, best-offer) are never counted.
    if (!extractItemData(card)) return;

    const label = document.createElement("label");
    label.className = "ebay-scatter-cb";
    label.title = "Add to price chart";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = loadItems().some(i => i.id === id);

    label.appendChild(cb);
    label.appendChild(document.createTextNode(" Plot"));

    const attrArea = card.querySelector(".su-card-container__attributes__primary") || card;
    attrArea.appendChild(label);

    cb.addEventListener("change", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const items = loadItems();
        if (cb.checked) {
          const data = extractItemData(card);
          if (!data) { cb.checked = false; return; }
          if (!items.some(i => i.id === data.id)) {
            items.push(data);
            saveItems(items);
          }
        } else {
          saveItems(items.filter(i => i.id !== id));
        }
        renderChart(loadItems());
        syncPlotAll();
      }, 150);
    });
  }

  // ── Clear all ────────────────────────────────────────────────────────────────

  function clearAll() {
    saveItems([]);
    document.querySelectorAll(".ebay-scatter-cb input").forEach(cb => { cb.checked = false; });
    renderChart([]);
    syncPlotAll();
  }

  // ── Plot-all sync ─────────────────────────────────────────────────────────────

  function syncPlotAll() {
    const plotAllCb = document.getElementById("ebay-scatter-plot-all");
    if (!plotAllCb) return;
    const all = Array.from(document.querySelectorAll(".ebay-scatter-cb input"));
    if (!all.length) return;
    const checkedCount = all.filter(cb => cb.checked).length;
    if (checkedCount === 0) {
      plotAllCb.checked = false;
      plotAllCb.indeterminate = false;
    } else if (checkedCount === all.length) {
      plotAllCb.checked = true;
      plotAllCb.indeterminate = false;
    } else {
      plotAllCb.checked = false;
      plotAllCb.indeterminate = true;
    }
  }

  // ── Plot All ─────────────────────────────────────────────────────────────────

  function buildPlotAllControl(listContainer) {
    const wrap = document.createElement("div");
    wrap.id = "ebay-scatter-plot-all-wrap";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "ebay-scatter-plot-all";

    const lbl = document.createElement("label");
    lbl.htmlFor = "ebay-scatter-plot-all";
    lbl.textContent = "Plot all";

    wrap.appendChild(cb);
    wrap.appendChild(lbl);
    listContainer.insertAdjacentElement("beforebegin", wrap);

    cb.addEventListener("change", () => {
      if (cb.checked) {
        const items = loadItems();
        listContainer.querySelectorAll(":scope > li[data-scatter-injected]").forEach(card => {
          const cardCb = card.querySelector(".ebay-scatter-cb input");
          if (!cardCb || cardCb.checked) return;
          const data = extractItemData(card);
          if (data && !items.some(i => i.id === data.id)) {
            items.push(data);
            cardCb.checked = true;
          }
        });
        saveItems(items);
        renderChart(loadItems());
        syncPlotAll();
      } else {
        clearAll();
      }
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  injectStyles();
  buildPanel();

  const container = document.querySelector(RESULTS_SEL);
  if (!container) {
    document.getElementById("ebay-scatter-status").textContent = "Could not find listings — eBay may have changed its layout";
    console.warn("[ebay-scatter] Results container not found");
    return;
  }

  container.querySelectorAll(":scope > li").forEach(card => injectCheckbox(card));
  buildPlotAllControl(container);
  renderChart(loadItems());
  syncPlotAll();

  // Watch for new cards (infinite scroll / pagination)
  const listObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1 && node.tagName === "LI") injectCheckbox(node);
      }
    }
  });
  listObserver.observe(container, { childList: true });

  // Watch parent in case eBay replaces the whole results list on pagination
  if (container.parentElement) {
    new MutationObserver(() => {
      const fresh = document.querySelector(RESULTS_SEL);
      if (fresh && fresh !== container) {
        listObserver.disconnect();
        fresh.querySelectorAll(":scope > li").forEach(card => injectCheckbox(card));
        listObserver.observe(fresh, { childList: true });
      }
    }).observe(container.parentElement, { childList: true });
  }
})();
