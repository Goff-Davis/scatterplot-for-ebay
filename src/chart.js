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
