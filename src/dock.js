let dockSide = localStorage.getItem(DOCK_KEY) || 'right';

function nearestEdge(mouseX, mouseY) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dists = {
    left: mouseX,
    right: W - mouseX,
    top: mouseY,
    bottom: H - mouseY,
  };

  return Object.entries(dists).reduce((a, b) => (a[1] < b[1] ? a : b))[0];
}

function setDockSide(side) {
  const panel = document.getElementById('ebay-scatter-panel');
  const toggle = document.getElementById('ebay-scatter-toggle');

  dockSide = side;

  try {
    localStorage.setItem(DOCK_KEY, side);
  } catch {
    /* non-fatal */
  }

  ['dock-right', 'dock-left', 'dock-top', 'dock-bottom'].forEach((c) => {
    panel.classList.remove(c);
    toggle.classList.remove(c);
  });

  ['left', 'top', 'right', 'bottom', 'width', 'height'].forEach(
    (p) => (panel.style[p] = ''),
  );

  ['left', 'top', 'right', 'bottom', 'transform'].forEach(
    (p) => (toggle.style[p] = ''),
  );

  panel.classList.add('dock-' + side);
  toggle.classList.add('dock-' + side);

  if (chartInstance) {
    chartInstance.resize();
  }

  if (chartInstanceUnsold) {
    chartInstanceUnsold.resize();
  }
}
