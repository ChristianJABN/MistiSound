// Graficos animados bajo cada esfera (canvas 2D), inspirados en el video:
//  - Historico de CO2: linea brillante 1950 -> hoy + "onda" de barras.
//  - Evolucion del ozono: cintas onduladas; menos ozono = mas agitadas.
//  - Tendencia de temperatura: barras que crecen (anios 50, tu anio, ultimos 5).
// `t` = segundos desde que aparecio el tablero; `level` = nivel del sonido 0..1.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);

function setup(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

export function drawCo2Chart(canvas, { history = [], marks = [], t = 0, level = 0 }) {
  const { ctx, w, h } = setup(canvas);
  if (history.length < 2) return;
  const pad = { l: 34, r: 14, t: 16, b: 30 };
  const years = history.map((p) => p.year);
  const y0 = years[0];
  const y1 = years.at(-1);
  const min = 300;
  const max = Math.max(430, ...history.map((p) => p.ppm));
  const X = (y) => pad.l + ((y - y0) / (y1 - y0)) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - min) / (max - min)) * (h - pad.t - pad.b);
  const prog = ease(t / 1.6);
  // Onda de barras (audio) en el fondo.
  const bars = 70;
  for (let i = 0; i < bars; i += 1) {
    const x = pad.l + (i / bars) * (w - pad.l - pad.r);
    const amp = (0.25 + 0.75 * (i / bars)) * (0.35 + level) * (0.5 + 0.5 * Math.sin(t * 6 + i * 0.9));
    const bh = amp * (h - pad.t - pad.b) * 0.55 * prog;
    ctx.fillStyle = `rgba(255,${110 + i},40,${0.18 + 0.25 * (i / bars)})`;
    ctx.fillRect(x, (h - pad.b) / 2 + pad.t / 2 - bh / 2, 2.2, bh);
  }
  // Linea de CO2.
  ctx.save();
  ctx.shadowColor = '#ffb050';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#ffc070';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const n = Math.max(2, Math.round(history.length * prog));
  history.slice(0, n).forEach((p, i) => (i ? ctx.lineTo(X(p.year), Y(p.ppm)) : ctx.moveTo(X(p.year), Y(p.ppm))));
  ctx.stroke();
  ctx.restore();
  // Marcas: 1950, tu anio, hoy.
  ctx.font = '600 16px system-ui, sans-serif';
  for (const m of marks) {
    const p = history.find((q) => q.year === m.year) ?? history.at(-1);
    if (!p || prog < (p.year - y0) / (y1 - y0)) continue;
    ctx.fillStyle = m.color ?? '#fff';
    ctx.beginPath();
    ctx.arc(X(p.year), Y(p.ppm), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`${m.label} · ${Math.round(p.ppm)}`, Math.min(w - 120, X(p.year) + 8), Y(p.ppm) - 10);
  }
  ctx.fillStyle = '#b9d6c9';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(String(y0), pad.l, h - 8);
  ctx.fillText(String(y1), w - pad.r - 34, h - 8);
  ctx.fillText('ppm', 4, pad.t + 10);
}

export function drawOzoneChart(canvas, { values = [], t = 0, level = 0 }) {
  const { ctx, w, h } = setup(canvas);
  // values: [{ label, du }] ; la agitacion depende del ozono mas bajo.
  const dus = values.map((v) => v.du).filter((d) => typeof d === 'number');
  const low = dus.length ? Math.min(...dus) : 300;
  const wind = clamp01((330 - low) / 90);
  const colors = ['#5ef0ff', '#7aa8ff', '#b37aff', '#ff7ae0', '#6cffc8'];
  const prog = ease(t / 1.4);
  for (let k = 0; k < colors.length; k += 1) {
    ctx.beginPath();
    const amp = (h * 0.12 + h * 0.2 * wind) * (0.6 + 0.4 * Math.sin(k)) * prog * (1 + level * 0.8);
    const freq = 1.5 + k * 0.35 + wind * 1.5;
    for (let x = 0; x <= w; x += 4) {
      const y = h * 0.48 + Math.sin((x / w) * Math.PI * 2 * freq + t * (1 + wind * 2) + k) * amp * Math.sin((x / w) * Math.PI);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = colors[k];
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3 + (k % 2);
    ctx.shadowColor = colors[k];
    ctx.shadowBlur = 10;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#e8f6ff';
  const text = values.map((v) => `${v.label}: ${v.du == null ? '—' : `${Math.round(v.du)} DU`}`).join('   ·   ');
  ctx.fillText(text, 12, h - 10);
}

function tempColor(v) {
  if (v == null) return '#4b5d55';
  if (v < 0) return '#6fb7ff';
  if (v < 0.5) return '#ffd66b';
  if (v < 1.2) return '#ff9a3c';
  return '#ff4b2b';
}

export function drawTempChart(canvas, { bars = [], t = 0, level = 0 }) {
  const { ctx, w, h } = setup(canvas);
  if (!bars.length) return;
  const pad = { l: 10, r: 10, t: 12, b: 28 };
  const zero = h - pad.b - (h - pad.t - pad.b) * 0.3; // linea de 0 °C
  const scale = (h - pad.t - pad.b) * 0.3; // px por grado
  const slot = (w - pad.l - pad.r) / bars.length;
  ctx.strokeStyle = '#ffffff40';
  ctx.beginPath();
  ctx.moveTo(pad.l, zero);
  ctx.lineTo(w - pad.r, zero);
  ctx.stroke();
  bars.forEach((b, i) => {
    const grow = ease((t - i * 0.05) / 0.9);
    const v = b.value ?? 0;
    const bh = Math.max(-scale * 1.5, Math.min(scale * 2.3, v * scale)) * grow * (1 + level * 0.12 * Math.sin(t * 8 + i));
    const x = pad.l + i * slot + slot * 0.15;
    const bw = slot * 0.7;
    const g = ctx.createLinearGradient(0, zero - bh, 0, zero);
    g.addColorStop(0, tempColor(v));
    g.addColorStop(1, '#ffd66b55');
    ctx.fillStyle = b.kind === 'birth' ? '#7ce0b5' : g;
    if (b.kind === 'birth') {
      ctx.shadowColor = '#7ce0b5';
      ctx.shadowBlur = 14;
    }
    ctx.fillRect(x, bh >= 0 ? zero - bh : zero, bw, Math.abs(bh) || 2);
    ctx.shadowBlur = 0;
    if (b.showLabel) {
      ctx.fillStyle = '#d4e8dc';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, x + bw / 2, h - 8);
      ctx.textAlign = 'start';
    }
  });
}
