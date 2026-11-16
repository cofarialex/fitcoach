// Chart.js burkoló: a téma színeit a CSS változókból veszi, és kezeli a grafikonok újrarajzolását
const instances = new Map();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function palette() {
  return {
    text: css('--text-2'), grid: css('--border'), accent: css('--accent'), orange: css('--orange'), blue: css('--blue'),
    violet: css('--violet'), danger: css('--danger'), bg: css('--bg-elev'),
  };
}

function baseOptions(p, extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: !!extra.legend, position: 'bottom', labels: { color: p.text, usePointStyle: true, boxWidth: 8, padding: 14 } },
      tooltip: { backgroundColor: css('--text'), titleColor: css('--bg'), bodyColor: css('--bg'), padding: 10, cornerRadius: 8, displayColors: !!extra.legend },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: p.text, maxRotation: 0, autoSkipPadding: 12 }, border: { display: false } },
      y: { grid: { color: p.grid }, ticks: { color: p.text, maxTicksLimit: 5 }, border: { display: false }, beginAtZero: !!extra.zero, ...(extra.y || {}) },
    },
  };
}

export function chart(canvas, config) {
  if (!canvas || !window.Chart) return null;
  const old = instances.get(canvas);
  if (old) old.destroy();
  const c = new window.Chart(canvas, config);
  instances.set(canvas, c);
  return c;
}

// datasets: [{ label, data, color }]
export function lineChart(canvas, labels, datasets, opts = {}) {
  const p = palette();
  return chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label, data: d.data, borderColor: d.color || p.accent, backgroundColor: `${d.color || p.accent}22`,
        fill: datasets.length === 1, tension: 0.35, pointRadius: labels.length > 30 ? 0 : 3, pointHoverRadius: 5, borderWidth: 2.2, spanGaps: true,
      })),
    },
    options: baseOptions(p, { legend: datasets.length > 1, ...opts }),
  });
}

export function barChart(canvas, labels, datasets, opts = {}) {
  const p = palette();
  return chart(canvas, {
    type: 'bar',
    data: { labels, datasets: datasets.map((d) => ({ label: d.label, data: d.data, backgroundColor: d.color || p.accent, borderRadius: 6, maxBarThickness: 34 })) },
    options: baseOptions(p, { legend: datasets.length > 1, zero: true, ...opts }),
  });
}

export function doughnut(canvas, labels, data, colors) {
  const p = palette();
  return chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, spacing: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--text'), titleColor: css('--bg'), bodyColor: css('--bg') } } },
  });
}

export function destroyAll() {
  for (const c of instances.values()) c.destroy();
  instances.clear();
}
