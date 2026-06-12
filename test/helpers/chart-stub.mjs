// A fake Chart.js constructor for testing the data-shaping math in src/chart.js
// without a real canvas. chart.js calls `new window.Chart(canvas, config)`; this
// records what it was constructed with so a test can inspect the dataset it built
// (e.g. created[i].config.data.datasets[0].data) and the scale bounds it set
// (created[i].config.options.scales). The in-place update() path mutates
// this.data / this.options, so those alias the config too.
export function makeChartStub() {
  const created = [];
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      created.push(this);
    }
    update() {}
    resize() {}
    destroy() {}
  }
  FakeChart.created = created;
  return FakeChart;
}
