function buildPanel() {
  const panel = document.createElement('div');
  panel.id = 'ebay-scatter-panel';
  panel.innerHTML = `
    <header>
      <h2>Price History</h2>
      <span class="ebay-scatter-header-actions">
        <input type="number" id="ebay-scatter-font-size" min="10" max="28" step="1" title="Font size (px)" aria-label="Font size (px)">
        <select id="ebay-scatter-currency" title="Display currency" aria-label="Display currency">
          <option value="USD">$ USD</option>
          <option value="GBP">£ GBP</option>
          <option value="EUR">€ EUR</option>
          <option value="CAD">C$ CAD</option>
          <option value="AUD">AU$ AUD</option>
          <option value="MXN">MXN$ MXN</option>
        </select>
        <button id="ebay-scatter-theme" title="Toggle light/dark" aria-label="Switch to light mode"></button>
        <button id="ebay-scatter-close" title="Close">&times;</button>
      </span>
    </header>
    <div class="ebay-scatter-body">
      <div id="ebay-scatter-controls">
        <button id="ebay-scatter-clear">Clear All</button>
        <span id="ebay-scatter-status"></span>
      </div>
      <div id="ebay-scatter-chart-wrap">
        <div id="ebay-scatter-placeholder">Check items below to plot prices</div>
        <div id="ebay-scatter-sold-wrap">
          <div class="ebay-scatter-section-label">Sold Listings</div>
          <canvas id="ebay-scatter-canvas"></canvas>
        </div>
        <div id="ebay-scatter-unsold-wrap">
          <div class="ebay-scatter-section-label">Active Listings</div>
          <canvas id="ebay-scatter-canvas-unsold"></canvas>
        </div>
      </div>
    </div>
    <div id="ebay-scatter-resize"></div>
  `;
  document.body.appendChild(panel);

  const toggle = document.createElement('button');
  toggle.id = 'ebay-scatter-toggle';
  toggle.title = 'Show Price History';
  toggle.textContent = '📈';
  document.body.appendChild(toggle);

  const preview = document.createElement('div');
  preview.id = 'ebay-scatter-snap-preview';
  document.body.appendChild(preview);

  // Apply stored theme
  const storedTheme = localStorage.getItem(THEME_KEY) || 'dark';

  if (storedTheme === 'light') {
    panel.classList.add('theme-light');
    toggle.classList.add('theme-light');
  }

  const themeBtn = document.getElementById('ebay-scatter-theme');
  themeBtn.textContent = storedTheme === 'light' ? '☾' : '☉';
  themeBtn.setAttribute(
    'aria-label',
    storedTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode',
  );

  // Apply stored font size as an inline font-size so all em-based children scale.
  const storedSize = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10) || 14;
  panel.style.fontSize = storedSize + 'px';
  document.getElementById('ebay-scatter-font-size').value = storedSize;

  // Start minimized — panel opens on first interaction (toggle click or checkbox).
  panel.style.display = 'none';
  toggle.style.display = 'block';

  // Shows the snap-target overlay when the cursor is near a viewport edge.
  const showSnapPreview = (e) => {
    const edge = nearestEdge(e.clientX, e.clientY);
    const dist = {
      left: e.clientX,
      right: window.innerWidth - e.clientX,
      top: e.clientY,
      bottom: window.innerHeight - e.clientY,
    }[edge];

    if (dist < SNAP_THRESHOLD) {
      preview.className = 'snap-' + edge;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  };

  document
    .getElementById('ebay-scatter-close')
    .addEventListener('click', () => {
      panel.style.display = 'none';
      toggle.style.display = 'block';

      try {
        localStorage.removeItem(PANEL_OPEN_KEY);
      } catch {
        /* non-fatal */
      }
    });
  toggle.addEventListener('click', () => {
    if (toggleDragMoved) {
      toggleDragMoved = false;
      return;
    }

    panel.style.display = 'flex';
    toggle.style.display = 'none';

    try {
      localStorage.setItem(PANEL_OPEN_KEY, '1');
    } catch {
      /* non-fatal */
    }
  });
  document
    .getElementById('ebay-scatter-clear')
    .addEventListener('click', clearAll);

  themeBtn.addEventListener('click', () => {
    const isLight = panel.classList.toggle('theme-light');
    toggle.classList.toggle('theme-light', isLight);
    themeBtn.textContent = isLight ? '☾' : '☉';
    themeBtn.setAttribute(
      'aria-label',
      isLight ? 'Switch to dark mode' : 'Switch to light mode',
    );

    try {
      localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
    } catch {
      /* non-fatal */
    }

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    if (chartInstanceUnsold) {
      chartInstanceUnsold.destroy();
      chartInstanceUnsold = null;
    }

    renderChartConverted(loadItems());
  });

  const fsInput = document.getElementById('ebay-scatter-font-size');
  fsInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);

    if (!isNaN(val) && val >= 10 && val <= 28) {
      panel.style.fontSize = val + 'px';
      updateChartFontSizes(val);

      try {
        localStorage.setItem(FONT_SIZE_KEY, val);
      } catch {
        /* non-fatal */
      }
    }
  });
  fsInput.addEventListener('blur', () => {
    fsInput.value = parseInt(panel.style.fontSize, 10) || 14;
  });

  const currencySelect = document.getElementById('ebay-scatter-currency');
  currencySelect.value = getSelectedCurrencyCode();
  currencySelect.addEventListener('change', () => {
    try {
      localStorage.setItem(CURRENCY_KEY, currencySelect.value);
    } catch {
      /* non-fatal */
    }

    renderChartConverted(loadItems());
  });

  // ── Resize ──────────────────────────────────────────────────────────────────
  const resizeHandle = document.getElementById('ebay-scatter-resize');
  let isResizing = false;
  let resizeStartPos = 0;
  let resizeStartDim = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    const rect = panel.getBoundingClientRect();
    const horiz = dockSide === 'left' || dockSide === 'right';
    resizeStartPos = horiz ? e.clientX : e.clientY;
    resizeStartDim = horiz ? rect.width : rect.height;
    resizeHandle.classList.add('resizing');

    e.preventDefault();
    e.stopPropagation();
  });

  // ── Toggle drag ──────────────────────────────────────────────────────────────
  let isToggleDragging = false;
  let toggleDragMoved = false;
  let toggleDragOffX = 0,
    toggleDragOffY = 0;
  let togglePinLeft = 0,
    togglePinTop = 0;

  toggle.addEventListener('mousedown', (e) => {
    isToggleDragging = true;
    toggleDragMoved = false;
    const rect = toggle.getBoundingClientRect();
    toggleDragOffX = e.clientX - rect.left;
    toggleDragOffY = e.clientY - rect.top;
    togglePinLeft = rect.left;
    togglePinTop = rect.top;

    e.preventDefault();
  });

  // ── Drag to dock ─────────────────────────────────────────────────────────────
  const header = panel.querySelector('header');
  let isDragging = false;
  let panelDragMoved = false;
  let dragOffsetX = 0,
    dragOffsetY = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, input, select')) {
      return;
    }

    isDragging = true;
    panelDragMoved = false;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    // Pin panel to its current pixel position before removing dock class
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = rect.width + 'px';
    panel.style.height = rect.height + 'px';
    ['dock-right', 'dock-left', 'dock-top', 'dock-bottom'].forEach((c) =>
      panel.classList.remove(c),
    );
    header.classList.add('dragging');
    panel.classList.add('dragging');

    e.preventDefault();
  });

  // ── Shared drag/resize handlers ──────────────────────────────────────────────
  // One mousemove + one mouseup dispatch on whichever operation is active. The
  // flags are mutually exclusive — each mousedown starts exactly one.
  document.addEventListener('mousemove', (e) => {
    if (e.buttons === 0) {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove('resizing');
      } else if (isToggleDragging) {
        isToggleDragging = false;
        preview.style.display = 'none';
        setDockSide(dockSide);
      } else if (isDragging) {
        isDragging = false;
        header.classList.remove('dragging');
        panel.classList.remove('dragging');
        preview.style.display = 'none';
        setDockSide(dockSide);
      }

      return;
    }

    if (isResizing) {
      let newDim;

      switch (dockSide) {
        case 'right': {
          newDim = resizeStartDim + (resizeStartPos - e.clientX);
          break;
        }
        case 'left': {
          newDim = resizeStartDim + (e.clientX - resizeStartPos);
          break;
        }
        case 'top': {
          newDim = resizeStartDim + (e.clientY - resizeStartPos);
          break;
        }
        case 'bottom': {
          newDim = resizeStartDim + (resizeStartPos - e.clientY);
          break;
        }
        default: {
          newDim = resizeStartDim + (resizeStartPos - e.clientX);
          console.warn('[panel.js] Invalid dockSide');
        }
      }

      const horiz = dockSide === 'left' || dockSide === 'right';
      newDim = Math.max(
        horiz ? 200 : 120,
        Math.min(
          horiz ? window.innerWidth * 0.7 : window.innerHeight * 0.7,
          newDim,
        ),
      );
      panel.style[horiz ? 'width' : 'height'] = newDim + 'px';

      if (chartInstance) {
        chartInstance.resize();
      }

      if (chartInstanceUnsold) {
        chartInstanceUnsold.resize();
      }
    } else if (isToggleDragging) {
      if (!toggleDragMoved) {
        toggle.style.left = togglePinLeft + 'px';
        toggle.style.top = togglePinTop + 'px';
        toggle.style.right = 'auto';
        toggle.style.bottom = 'auto';
        toggle.style.transform = 'none';
        ['dock-right', 'dock-left', 'dock-top', 'dock-bottom'].forEach((c) =>
          toggle.classList.remove(c),
        );
        toggleDragMoved = true;
      }

      toggle.style.left = e.clientX - toggleDragOffX + 'px';
      toggle.style.top = e.clientY - toggleDragOffY + 'px';
      showSnapPreview(e);
    } else if (isDragging) {
      panelDragMoved = true;
      panel.style.left = e.clientX - dragOffsetX + 'px';
      panel.style.top = e.clientY - dragOffsetY + 'px';
      showSnapPreview(e);
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('resizing');
    } else if (isToggleDragging) {
      isToggleDragging = false;
      preview.style.display = 'none';
      setDockSide(
        toggleDragMoved ? nearestEdge(e.clientX, e.clientY) : dockSide,
      );
      // toggle.style.display stays "block" — panel remains closed
    } else if (isDragging) {
      isDragging = false;
      header.classList.remove('dragging');
      panel.classList.remove('dragging');
      preview.style.display = 'none';
      // Only re-dock on an actual drag; a plain click restores the current side
      // (clearing the inline pixel styles the mousedown pinned), so it's a no-op.
      setDockSide(
        panelDragMoved ? nearestEdge(e.clientX, e.clientY) : dockSide,
      );
    }
  });
}
