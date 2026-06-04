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

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) {
      return;
    }

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
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) {
      return;
    }

    isResizing = false;
    resizeHandle.classList.remove('resizing');
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

  document.addEventListener('mousemove', (e) => {
    if (!isToggleDragging) {
      return;
    }

    toggleDragMoved = true;
    toggle.style.left = e.clientX - toggleDragOffX + 'px';
    toggle.style.top = e.clientY - toggleDragOffY + 'px';

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
  });

  document.addEventListener('mouseup', (e) => {
    if (!isToggleDragging) {
      return;
    }

    isToggleDragging = false;
    preview.style.display = 'none';

    if (toggleDragMoved) {
      setDockSide(nearestEdge(e.clientX, e.clientY));
      // toggle.style.display stays "block" — panel remains closed
    }
  });

  // ── Drag to dock ─────────────────────────────────────────────────────────────
  const header = panel.querySelector('header');
  let isDragging = false;
  let dragOffsetX = 0,
    dragOffsetY = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'ebay-scatter-close') {
      return;
    }

    isDragging = true;
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

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) {
      return;
    }

    panel.style.left = e.clientX - dragOffsetX + 'px';
    panel.style.top = e.clientY - dragOffsetY + 'px';

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
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    header.classList.remove('dragging');
    panel.classList.remove('dragging');
    preview.style.display = 'none';
    setDockSide(nearestEdge(e.clientX, e.clientY));
  });
}
