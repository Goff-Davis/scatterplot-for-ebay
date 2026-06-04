function buildPanel() {
  const panel = document.createElement('div');
  panel.id = 'ebay-scatter-panel';
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
    });
  toggle.addEventListener('click', () => {
    if (toggleDragMoved) {
      toggleDragMoved = false;
      return;
    }
    panel.style.display = 'flex';
    toggle.style.display = 'none';
  });
  document
    .getElementById('ebay-scatter-clear')
    .addEventListener('click', clearAll);

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

  toggle.addEventListener('mousedown', (e) => {
    isToggleDragging = true;
    toggleDragMoved = false;
    const rect = toggle.getBoundingClientRect();
    toggleDragOffX = e.clientX - rect.left;
    toggleDragOffY = e.clientY - rect.top;
    toggle.style.left = rect.left + 'px';
    toggle.style.top = rect.top + 'px';
    toggle.style.right = 'auto';
    toggle.style.bottom = 'auto';
    toggle.style.transform = 'none';
    ['dock-right', 'dock-left', 'dock-top', 'dock-bottom'].forEach((c) =>
      toggle.classList.remove(c),
    );
    e.preventDefault();
  });

  // ── Drag to dock ─────────────────────────────────────────────────────────────
  const header = panel.querySelector('header');
  let isDragging = false;
  let panelDragMoved = false;
  let dragOffsetX = 0,
    dragOffsetY = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'ebay-scatter-close') {
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
    } else if (isToggleDragging) {
      toggleDragMoved = true;
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
      if (toggleDragMoved) {
        setDockSide(nearestEdge(e.clientX, e.clientY));
        // toggle.style.display stays "block" — panel remains closed
      }
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
