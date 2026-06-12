let chartInstance = null;
let chartInstanceUnsold = null;

const rangeLinesPlugin = {
  id: 'rangeLines',
  afterDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(99,179,237,0.7)';
    ctx.lineWidth = 2;
    chart.data.datasets[0].data.forEach((pt, i) => {
      if (pt.priceHigh === undefined) { return; }
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

  chartInstance = new window.Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Total Price',
          data,
          pointRadius: 5,
          pointHoverRadius: 7,
          backgroundColor: 'rgba(99,179,237,0.8)',
          borderColor: 'rgba(99,179,237,1)',
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#bbb' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const { title, date, y, priceHigh } = ctx.raw;
              const priceStr =
                priceHigh !== undefined
                  ? `$${y.toFixed(2)}–$${priceHigh.toFixed(2)}`
                  : `$${y.toFixed(2)}`;
              return `${title} | ${date} | ${priceStr}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#999',
            maxTicksLimit: 6,
            callback: (v) => new Date(v).toISOString().slice(0, 10),
          },
          grid: { color: '#2e2e2e' },
        },
        y: {
          suggestedMax: yMax * 1.025,
          ticks: {
            color: '#999',
            callback: (v) => `$${v.toFixed(0)}`,
          },
          grid: { color: '#2e2e2e' },
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

  chartInstanceUnsold = new window.Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Asking Price',
          data,
          pointRadius: radii,
          pointHoverRadius: hoverRadii,
          backgroundColor: 'rgba(99,179,237,0.8)',
          borderColor: 'rgba(99,179,237,1)',
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#bbb' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const { title, y, priceHigh } = ctx.raw;
              const priceStr =
                priceHigh !== undefined
                  ? `$${y.toFixed(2)}–$${priceHigh.toFixed(2)}`
                  : `$${y.toFixed(2)}`;
              return `${title} | ${priceStr}`;
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
          grid: { color: '#2e2e2e' },
        },
        y: {
          suggestedMax: yMax * 1.025,
          ticks: {
            color: '#999',
            callback: (v) => `$${v.toFixed(0)}`,
          },
          grid: { color: '#2e2e2e' },
        },
      },
    },
    plugins: [rangeLinesPlugin],
  });
}
