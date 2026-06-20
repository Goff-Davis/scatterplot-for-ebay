function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    #ebay-scatter-panel {
      position: fixed; z-index: 2147483647;
      display: flex; flex-direction: column;
      font-family: system-ui, sans-serif;
      background: var(--scatter-bg); color: var(--scatter-text);
      --scatter-bg:           rgba(24,24,24,0.97);
      --scatter-text:         #eee;
      --scatter-subtext:      #bbb;
      --scatter-border:       #3a3a3a;
      --scatter-grid-line:    #2e2e2e;
      --scatter-tick:         #bbb;
      --scatter-placeholder:  #999;
      --scatter-accent:       rgba(99,179,237,0.8);
      --scatter-accent-solid: rgba(99,179,237,1);
      --scatter-accent-line:  rgba(99,179,237,0.7);
      --scatter-btn-bg:       #444;
      --scatter-btn-text:     #ddd;
      --scatter-btn-hover:    #555;
      --scatter-close-color:  #aaa;
      --scatter-shadow:       rgba(0,0,0,0.6);
      --scatter-tooltip-bg:   rgba(20,20,20,0.9);
      --scatter-tooltip-text: #eee;
    }
    #ebay-scatter-panel.theme-light {
      --scatter-bg:           rgba(255,255,255,0.98);
      --scatter-text:         #111;
      --scatter-subtext:      #444;
      --scatter-border:       #e0e0e0;
      --scatter-grid-line:    #ebebeb;
      --scatter-tick:         #555;
      --scatter-placeholder:  #888;
      --scatter-accent:       rgba(37,99,235,0.8);
      --scatter-accent-solid: rgba(37,99,235,1);
      --scatter-accent-line:  rgba(37,99,235,0.7);
      --scatter-btn-bg:       #ebebeb;
      --scatter-btn-text:     #222;
      --scatter-btn-hover:    #d5d5d5;
      --scatter-close-color:  #555;
      --scatter-shadow:       rgba(0,0,0,0.18);
      --scatter-tooltip-bg:   rgba(255,255,255,0.97);
      --scatter-tooltip-text: #111;
    }
    #ebay-scatter-panel.dock-right {
      right: 0; top: 0; width: 320px; height: 100vh;
      box-shadow: -4px 0 20px var(--scatter-shadow);
    }
    #ebay-scatter-panel.dock-left {
      left: 0; top: 0; width: 320px; height: 100vh;
      box-shadow: 4px 0 20px var(--scatter-shadow);
    }
    #ebay-scatter-panel.dock-top {
      top: 0; left: 0; width: 100vw; height: 280px;
      box-shadow: 0 4px 20px var(--scatter-shadow);
    }
    #ebay-scatter-panel.dock-bottom {
      bottom: 0; left: 0; width: 100vw; height: 280px;
      box-shadow: 0 -4px 20px var(--scatter-shadow);
    }
    #ebay-scatter-panel.dragging {
      opacity: 0.88; box-shadow: 0 8px 32px var(--scatter-shadow);
    }
    #ebay-scatter-panel header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid var(--scatter-border); flex-shrink: 0;
      cursor: grab; user-select: none;
    }
    #ebay-scatter-panel header.dragging { cursor: grabbing; }
    #ebay-scatter-panel.dock-top header,
    #ebay-scatter-panel.dock-bottom header { padding-right: 28px; }
    #ebay-scatter-panel header h2 { margin: 0; font-size: 1em; font-weight: 600; }
    .ebay-scatter-header-actions {
      display: flex; align-items: center; gap: 2px;
    }
    #ebay-scatter-close,
    #ebay-scatter-theme {
      background: none; border: none; color: var(--scatter-close-color);
      cursor: pointer; padding: 0 3px; line-height: 1;
    }
    #ebay-scatter-close { font-size: 20px; }
    #ebay-scatter-theme { font-size: 15px; }
    #ebay-scatter-close:hover,
    #ebay-scatter-theme:hover { color: var(--scatter-text); }
    #ebay-scatter-font-size {
      width: 42px; padding: 1px 3px; border-radius: 3px; text-align: center;
      font-size: 0.875em; font-family: inherit;
      background: var(--scatter-btn-bg); color: var(--scatter-btn-text);
      border: 1px solid var(--scatter-border); cursor: default;
    }
    #ebay-scatter-font-size:focus { outline: 1px solid var(--scatter-accent-solid); }
    #ebay-scatter-currency {
      padding: 1px 3px; border-radius: 3px;
      font-size: 0.875em; font-family: inherit;
      background: var(--scatter-btn-bg); color: var(--scatter-btn-text);
      border: 1px solid var(--scatter-border); cursor: pointer;
    }
    #ebay-scatter-currency:focus { outline: 1px solid var(--scatter-accent-solid); }
    .ebay-scatter-body {
      display: flex; flex: 1; min-height: 0; flex-direction: column;
    }
    #ebay-scatter-panel.dock-top .ebay-scatter-body,
    #ebay-scatter-panel.dock-bottom .ebay-scatter-body {
      flex-direction: row;
    }
    #ebay-scatter-controls {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 12px; border-bottom: 1px solid var(--scatter-border); flex-shrink: 0;
    }
    #ebay-scatter-panel.dock-top #ebay-scatter-controls,
    #ebay-scatter-panel.dock-bottom #ebay-scatter-controls {
      flex-direction: column; align-items: flex-start;
      width: 150px; flex-shrink: 0;
      border-bottom: none; border-right: 1px solid var(--scatter-border);
    }
    #ebay-scatter-clear {
      background: var(--scatter-btn-bg); border: none; color: var(--scatter-btn-text);
      padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.875em;
    }
    #ebay-scatter-clear:hover { background: var(--scatter-btn-hover); }
    #ebay-scatter-status { font-size: 0.875em; color: var(--scatter-subtext); }
    #ebay-scatter-chart-wrap {
      flex: 1; min-height: 0; min-width: 0; padding: 8px; position: relative;
      display: flex; flex-direction: column;
    }
    #ebay-scatter-sold-wrap,
    #ebay-scatter-unsold-wrap {
      display: none; flex: 1; flex-direction: column; min-height: 0;
    }
    #ebay-scatter-sold-wrap.visible,
    #ebay-scatter-unsold-wrap.visible { display: flex; }
    #ebay-scatter-sold-wrap.visible + #ebay-scatter-unsold-wrap.visible {
      border-top: 1px solid var(--scatter-border);
    }
    .ebay-scatter-section-label {
      font-weight: 600; color: var(--scatter-text);
      padding: 4px 0 2px; flex-shrink: 0;
    }
    #ebay-scatter-sold-wrap canvas,
    #ebay-scatter-unsold-wrap canvas { flex: 1; min-height: 0; display: block; }
    #ebay-scatter-placeholder {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      color: var(--scatter-placeholder); text-align: center; padding: 20px;
    }
    #ebay-scatter-toggle {
      position: fixed; z-index: 2147483646;
      background: var(--scatter-toggle-bg, rgba(24,24,24,0.92));
      color: var(--scatter-toggle-text, #eee);
      border: none; cursor: pointer; font-size: 18px; display: none;
      --scatter-toggle-bg:    rgba(24,24,24,0.92);
      --scatter-toggle-text:  #eee;
      --scatter-toggle-hover: #333;
      --scatter-shadow:       rgba(0,0,0,0.6);
    }
    #ebay-scatter-toggle.theme-light {
      --scatter-toggle-bg:    rgba(255,255,255,0.92);
      --scatter-toggle-text:  #111;
      --scatter-toggle-hover: #f0f0f0;
      --scatter-shadow:       rgba(0,0,0,0.18);
    }
    #ebay-scatter-toggle:hover { background: var(--scatter-toggle-hover); }
    #ebay-scatter-toggle.dock-right {
      right: 0; top: 50%; transform: translateY(-50%);
      border-radius: 6px 0 0 6px; padding: 10px 6px;
      box-shadow: -2px 0 10px var(--scatter-shadow);
    }
    #ebay-scatter-toggle.dock-left {
      left: 0; top: 50%; transform: translateY(-50%);
      border-radius: 0 6px 6px 0; padding: 10px 6px;
      box-shadow: 2px 0 10px var(--scatter-shadow);
    }
    #ebay-scatter-toggle.dock-top {
      top: 0; left: 50%; transform: translateX(-50%);
      border-radius: 0 0 6px 6px; padding: 4px 14px;
      box-shadow: 0 2px 10px var(--scatter-shadow);
    }
    #ebay-scatter-toggle.dock-bottom {
      bottom: 0; left: 50%; transform: translateX(-50%);
      border-radius: 6px 6px 0 0; padding: 4px 14px;
      box-shadow: 0 -2px 10px var(--scatter-shadow);
    }
    #ebay-scatter-resize {
      position: absolute; z-index: 10;
    }
    .dock-right #ebay-scatter-resize {
      left: 0; top: 0; width: 6px; height: 100%; cursor: col-resize;
    }
    .dock-left #ebay-scatter-resize {
      right: 0; top: 0; width: 6px; height: 100%; cursor: col-resize;
    }
    .dock-top #ebay-scatter-resize {
      bottom: 0; left: 0; height: 6px; width: 100%; cursor: row-resize;
    }
    .dock-bottom #ebay-scatter-resize {
      top: 0; left: 0; height: 6px; width: 100%; cursor: row-resize;
    }
    #ebay-scatter-resize:hover { background: rgba(99,179,237,0.18); }
    #ebay-scatter-resize.resizing { background: rgba(99,179,237,0.28); }
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
