let chartInstance = null;
let chartInstanceUnsold = null;

function getChartFontSize() {
  const panel = document.getElementById('ebay-scatter-panel');

  return parseInt(panel ? panel.style.fontSize : '14', 10) || 14;
}

function getChartColors() {
  const panel = document.getElementById('ebay-scatter-panel');

  if (!panel) {
    return {
      tick: '#bbb',
      grid: '#2e2e2e',
      accent: 'rgba(99,179,237,0.8)',
      accentSolid: 'rgba(99,179,237,1)',
      accentLine: 'rgba(99,179,237,0.7)',
      tooltipBg: 'rgba(20,20,20,0.9)',
      tooltipText: '#eee',
    };
  }

  const cs = getComputedStyle(panel);
  const v = (k) => cs.getPropertyValue(k).trim();

  return {
    tick: v('--scatter-tick'),
    grid: v('--scatter-grid-line'),
    accent: v('--scatter-accent'),
    accentSolid: v('--scatter-accent-solid'),
    accentLine: v('--scatter-accent-line'),
    tooltipBg: v('--scatter-tooltip-bg'),
    tooltipText: v('--scatter-tooltip-text'),
  };
}

const rangeLinesPlugin = {
  id: 'rangeLines',
  afterDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    const { ctx } = chart;
    const { accentLine } = getChartColors();
    ctx.save();
    ctx.strokeStyle = accentLine;
    ctx.lineWidth = 2;
    chart.data.datasets[0].data.forEach((pt, i) => {
      if (pt.priceHigh === undefined) {
        return;
      }

      const { x } = meta.data[i];
      ctx.beginPath();
      ctx.moveTo(x, chart.scales.y.getPixelForValue(pt.y));
      ctx.lineTo(x, chart.scales.y.getPixelForValue(pt.priceHigh));
      ctx.stroke();
    });
    ctx.restore();
  },
};

function renderChart(items) {
  const soldItems = items.filter((i) => (i.type || 'sold') === 'sold');
  const unsoldItems = items.filter((i) => i.type === 'unsold');

  const status = document.getElementById('ebay-scatter-status');
  status.textContent = items.length
    ? `${items.length} item${items.length === 1 ? '' : 's'}`
    : '';

  const placeholder = document.getElementById('ebay-scatter-placeholder');
  placeholder.style.display = items.length ? 'none' : 'flex';

  renderSoldChart(soldItems);
  renderUnsoldChart(unsoldItems);
}

function renderSoldChart(items) {
  const wrap = document.getElementById('ebay-scatter-sold-wrap');
  const canvas = document.getElementById('ebay-scatter-canvas');

  if (!items.length) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    wrap.classList.remove('visible');

    return;
  }

  wrap.classList.add('visible');

  const data = items.map((item) => ({
    x: new Date(item.date).getTime(),
    y: item.price,
    title: item.title,
    date: item.date,
    ...(item.priceHigh !== undefined ? { priceHigh: item.priceHigh } : {}),
  }));

  // Chart.js only sees the y (low) values; suggestedMax must account for priceHigh
  // so range lines aren't clipped at the top of the y-axis.
  const yMax = data.reduce(
    (m, pt) => Math.max(m, pt.priceHigh !== undefined ? pt.priceHigh : pt.y),
    -Infinity,
  );

  if (chartInstance) {
    chartInstance.data.datasets[0].data = data;
    chartInstance.options.scales.y.suggestedMax = yMax * 1.025;
    chartInstance.update();

    return;
  }

  const c = getChartColors();
  const fontSize = getChartFontSize();

  chartInstance = new window.Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Total Price',
          data,
          pointRadius: 5,
          pointHoverRadius: 7,
          backgroundColor: c.accent,
          borderColor: c.accentSolid,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg,
          bodyColor: c.tooltipText,
          bodyFont: { size: fontSize },
          callbacks: {
            label: (ctx) => {
              const { title, date, y, priceHigh } = ctx.raw;
              const priceStr =
                priceHigh !== undefined
                  ? `$${y.toFixed(2)}–$${priceHigh.toFixed(2)}`
                  : `$${y.toFixed(2)}`;

              return `${priceStr} | ${date} | ${title}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: c.tick,
            font: { size: fontSize },
            maxTicksLimit: 6,
            callback: (v) => new Date(v).toISOString().slice(0, 10),
          },
          grid: { color: c.grid },
        },
        y: {
          suggestedMax: yMax * 1.025,
          ticks: {
            color: c.tick,
            font: { size: fontSize },
            callback: (v) => `$${v.toFixed(0)}`,
          },
          grid: { color: c.grid },
        },
      },
    },
    plugins: [rangeLinesPlugin],
  });
}

function renderUnsoldChart(items) {
  const wrap = document.getElementById('ebay-scatter-unsold-wrap');
  const canvas = document.getElementById('ebay-scatter-canvas-unsold');

  if (!items.length) {
    if (chartInstanceUnsold) {
      chartInstanceUnsold.destroy();
      chartInstanceUnsold = null;
    }

    wrap.classList.remove('visible');

    return;
  }

  wrap.classList.add('visible');

  // Sort by price so items with similar prices cluster visually. x values are
  // centered around 0 so points expand outward from center regardless of count.
  // A minimum half-range (5) keeps a small cluster from stretching across the
  // full chart width; padding of 1 unit gives breathing room on each side.
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const half = (sorted.length - 1) / 2;
  const xHalf = Math.max(half, 5);
  const xPad = 1;
  const xMin = -(xHalf + xPad);
  const xMax = xHalf + xPad;

  const data = sorted.map((item, idx) => ({
    x: idx - half,
    y: item.price,
    title: item.title,
    ...(item.priceHigh !== undefined ? { priceHigh: item.priceHigh } : {}),
  }));

  const yMax = data.reduce(
    (m, pt) => Math.max(m, pt.priceHigh !== undefined ? pt.priceHigh : pt.y),
    -Infinity,
  );

  // Range items show only a line (drawn by rangeLinesPlugin); suppress the dot.
  const radii = data.map((pt) => (pt.priceHigh !== undefined ? 0 : 5));
  const hoverRadii = data.map((pt) => (pt.priceHigh !== undefined ? 0 : 7));

  if (chartInstanceUnsold) {
    chartInstanceUnsold.data.datasets[0].data = data;
    chartInstanceUnsold.data.datasets[0].pointRadius = radii;
    chartInstanceUnsold.data.datasets[0].pointHoverRadius = hoverRadii;
    chartInstanceUnsold.options.scales.x.min = xMin;
    chartInstanceUnsold.options.scales.x.max = xMax;
    chartInstanceUnsold.options.scales.y.suggestedMax = yMax * 1.025;
    chartInstanceUnsold.update();

    return;
  }

  const c = getChartColors();
  const fontSize = getChartFontSize();

  chartInstanceUnsold = new window.Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Asking Price',
          data,
          pointRadius: radii,
          pointHoverRadius: hoverRadii,
          backgroundColor: c.accent,
          borderColor: c.accentSolid,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg,
          bodyColor: c.tooltipText,
          bodyFont: { size: fontSize },
          callbacks: {
            label: (ctx) => {
              const { title, y, priceHigh } = ctx.raw;
              const priceStr =
                priceHigh !== undefined
                  ? `$${y.toFixed(2)}–$${priceHigh.toFixed(2)}`
                  : `$${y.toFixed(2)}`;

              return `${priceStr} | ${title}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: xMin,
          max: xMax,
          ticks: { display: false },
          grid: { color: c.grid },
        },
        y: {
          suggestedMax: yMax * 1.025,
          ticks: {
            color: c.tick,
            font: { size: fontSize },
            callback: (v) => `$${v.toFixed(0)}`,
          },
          grid: { color: c.grid },
        },
      },
    },
    plugins: [rangeLinesPlugin],
  });
}

function updateChartFontSizes(size) {
  const font = { size };

  for (const chart of [chartInstance, chartInstanceUnsold]) {
    if (!chart) {
      continue;
    }

    const { scales, plugins } = chart.options;

    if (scales.x?.ticks) {
      scales.x.ticks.font = font;
    }

    if (scales.y?.ticks) {
      scales.y.ticks.font = font;
    }

    if (plugins?.tooltip) {
      plugins.tooltip.bodyFont = font;
    }

    chart.update();
  }
}
