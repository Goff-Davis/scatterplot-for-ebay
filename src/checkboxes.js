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

function clearAll() {
  saveItems([]);
  document.querySelectorAll(".ebay-scatter-cb input").forEach(cb => { cb.checked = false; });
  renderChart([]);
  syncPlotAll();
}

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
