(function () {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("LH_Complete") || !params.has("LH_Sold")) return;

  const RESULTS_SEL    = "ul.srp-results";
  const STORAGE_KEY    = "ebay_scatterplot_items";
  const MAX_ITEMS      = 200;
  const DOCK_KEY       = "ebay_scatterplot_dock";
  const SNAP_THRESHOLD = 80;

  let dockSide = localStorage.getItem(DOCK_KEY) || "right";

  // ── localStorage ────────────────────────────────────────────────────────────

  function loadItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  }

  // ── Data extraction ──────────────────────────────────────────────────────────

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
    const priceEl = leafElements(card, "span, div").find(el =>
      /^\$[\d,]+\.?\d*$/.test(el.textContent.trim())
    );
    if (!priceEl) return null;

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
    const price = extractPrice(card);
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
        position: fixed; z-index: 2147483647;
        background: rgba(24,24,24,0.97); color: #eee;
        display: flex; flex-direction: column;
        font-family: system-ui, sans-serif; font-size: 13px;
      }
      #ebay-scatter-panel.dock-right {
        right: 0; top: 0; width: 320px; height: 100vh;
        box-shadow: -4px 0 20px rgba(0,0,0,0.6);
      }
      #ebay-scatter-panel.dock-left {
        left: 0; top: 0; width: 320px; height: 100vh;
        box-shadow: 4px 0 20px rgba(0,0,0,0.6);
      }
      #ebay-scatter-panel.dock-top {
        top: 0; left: 0; width: 100vw; height: 280px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      }
      #ebay-scatter-panel.dock-bottom {
        bottom: 0; left: 0; width: 100vw; height: 280px;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.6);
      }
      #ebay-scatter-panel.dragging {
        opacity: 0.88; box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      }
      #ebay-scatter-panel header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #3a3a3a; flex-shrink: 0;
        cursor: grab; user-select: none;
      }
      #ebay-scatter-panel header.dragging { cursor: grabbing; }
      #ebay-scatter-panel header h2 { margin: 0; font-size: 14px; font-weight: 600; }
      #ebay-scatter-close {
        background: none; border: none; color: #888; font-size: 20px;
        cursor: pointer; padding: 0 2px; line-height: 1;
      }
      #ebay-scatter-close:hover { color: #fff; }
      .ebay-scatter-body {
        display: flex; flex: 1; min-height: 0; flex-direction: column;
      }
      #ebay-scatter-panel.dock-top .ebay-scatter-body,
      #ebay-scatter-panel.dock-bottom .ebay-scatter-body {
        flex-direction: row;
      }
      #ebay-scatter-controls {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 12px; border-bottom: 1px solid #3a3a3a; flex-shrink: 0;
      }
      #ebay-scatter-panel.dock-top #ebay-scatter-controls,
      #ebay-scatter-panel.dock-bottom #ebay-scatter-controls {
        flex-direction: column; align-items: flex-start;
        width: 150px; flex-shrink: 0;
        border-bottom: none; border-right: 1px solid #3a3a3a;
      }
      #ebay-scatter-clear {
        background: #444; border: none; color: #ddd;
        padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
      }
      #ebay-scatter-clear:hover { background: #666; }
      #ebay-scatter-status { font-size: 12px; color: #888; }
      #ebay-scatter-chart-wrap {
        flex: 1; min-height: 0; min-width: 0; padding: 8px; position: relative;
      }
      #ebay-scatter-placeholder {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        color: #555; font-size: 13px; text-align: center; padding: 20px;
      }
      #ebay-scatter-toggle {
        position: fixed; z-index: 2147483646;
        background: rgba(24,24,24,0.92); color: #eee;
        border: none; cursor: pointer; font-size: 18px; display: none;
      }
      #ebay-scatter-toggle:hover { background: #333; }
      #ebay-scatter-toggle.dock-right {
        right: 0; top: 50%; transform: translateY(-50%);
        border-radius: 6px 0 0 6px; padding: 10px 6px;
        box-shadow: -2px 0 10px rgba(0,0,0,0.4);
      }
      #ebay-scatter-toggle.dock-left {
        left: 0; top: 50%; transform: translateY(-50%);
        border-radius: 0 6px 6px 0; padding: 10px 6px;
        box-shadow: 2px 0 10px rgba(0,0,0,0.4);
      }
      #ebay-scatter-toggle.dock-top {
        top: 0; left: 50%; transform: translateX(-50%);
        border-radius: 0 0 6px 6px; padding: 4px 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      }
      #ebay-scatter-toggle.dock-bottom {
        bottom: 0; left: 50%; transform: translateX(-50%);
        border-radius: 6px 6px 0 0; padding: 4px 14px;
        box-shadow: 0 -2px 10px rgba(0,0,0,0.4);
      }
      #ebay-scatter-snap-preview {
        position: fixed; z-index: 2147483645; pointer-events: none; display: none;
        background: rgba(99,179,237,0.12); border: 2px solid rgba(99,179,237,0.55);
      }
      #ebay-scatter-snap-preview.snap-right  { right: 0; top: 0; width: 320px; height: 100vh; }
      #ebay-scatter-snap-preview.snap-left   { left: 0; top: 0; width: 320px; height: 100vh; }
      #ebay-scatter-snap-preview.snap-top    { top: 0; left: 0; width: 100vw; height: 280px; }
      #ebay-scatter-snap-preview.snap-bottom { bottom: 0; left: 0; width: 100vw; height: 280px; }
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

  // ── Dock helpers ──────────────────────────────────────────────────────────────

  function nearestEdge(mouseX, mouseY) {
    const W = window.innerWidth, H = window.innerHeight;
    const dists = { left: mouseX, right: W - mouseX, top: mouseY, bottom: H - mouseY };
    return Object.entries(dists).reduce((a, b) => a[1] < b[1] ? a : b)[0];
  }

  function setDockSide(side) {
    dockSide = side;
    localStorage.setItem(DOCK_KEY, side);
    const panel  = document.getElementById("ebay-scatter-panel");
    const toggle = document.getElementById("ebay-scatter-toggle");
    ["dock-right", "dock-left", "dock-top", "dock-bottom"].forEach(c => {
      panel.classList.remove(c);
      toggle.classList.remove(c);
    });
    ["left", "top", "right", "bottom", "width", "height"].forEach(p => panel.style[p] = "");
    panel.classList.add("dock-" + side);
    toggle.classList.add("dock-" + side);
    if (chartInstance) chartInstance.resize();
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
      <div class="ebay-scatter-body">
        <div id="ebay-scatter-controls">
          <button id="ebay-scatter-clear">Clear All</button>
          <span id="ebay-scatter-status"></span>
        </div>
        <div id="ebay-scatter-chart-wrap">
          <div id="ebay-scatter-placeholder">Check items below to plot prices</div>
          <canvas id="ebay-scatter-canvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const toggle = document.createElement("button");
    toggle.id = "ebay-scatter-toggle";
    toggle.title = "Show Price History";
    toggle.textContent = "📈";
    document.body.appendChild(toggle);

    const preview = document.createElement("div");
    preview.id = "ebay-scatter-snap-preview";
    document.body.appendChild(preview);

    document.getElementById("ebay-scatter-close").addEventListener("click", () => {
      panel.style.display = "none";
      toggle.style.display = "block";
    });
    toggle.addEventListener("click", () => {
      panel.style.display = "flex";
      toggle.style.display = "none";
    });
    document.getElementById("ebay-scatter-clear").addEventListener("click", clearAll);

    // ── Drag to dock ──────────────────────────────────────────────────────────
    const header = panel.querySelector("header");
    let isDragging = false;
    let dragOffsetX = 0, dragOffsetY = 0;

    header.addEventListener("mousedown", e => {
      if (e.target.id === "ebay-scatter-close") return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      // Pin panel to its current pixel position before removing dock class
      panel.style.left   = rect.left + "px";
      panel.style.top    = rect.top  + "px";
      panel.style.right  = "auto";
      panel.style.bottom = "auto";
      panel.style.width  = rect.width  + "px";
      panel.style.height = rect.height + "px";
      ["dock-right", "dock-left", "dock-top", "dock-bottom"].forEach(c => panel.classList.remove(c));
      header.classList.add("dragging");
      panel.classList.add("dragging");
      e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - dragOffsetX) + "px";
      panel.style.top  = (e.clientY - dragOffsetY) + "px";
      const edge = nearestEdge(e.clientX, e.clientY);
      const dist = { left: e.clientX, right: window.innerWidth - e.clientX,
                     top: e.clientY,  bottom: window.innerHeight - e.clientY }[edge];
      if (dist < SNAP_THRESHOLD) {
        preview.className = "snap-" + edge;
        preview.style.display = "block";
      } else {
        preview.style.display = "none";
      }
    });

    document.addEventListener("mouseup", e => {
      if (!isDragging) return;
      isDragging = false;
      header.classList.remove("dragging");
      panel.classList.remove("dragging");
      preview.style.display = "none";
      setDockSide(nearestEdge(e.clientX, e.clientY));
    });
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
    card.dataset.scatterInjected = "1";
    const id = extractItemId(card);
    if (!id || !card.querySelector("a[href*='/itm/']")) return;
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
  setDockSide(dockSide);

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
