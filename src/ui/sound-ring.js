// Anillo de picos radiales alrededor de cada esfera (como en el video de
// referencia): la altura de cada pico sale del espectro REAL del bus de audio
// de la app (Tone.Analyser 'fft'). En reposo dibuja un anillo tenue que
// respira. Solo dibuja; el bucle lo maneja quien lo usa.
export function createSoundRing(canvas, { colors = ['#ffb35c', '#ff5a1f'], spikes = 96 } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * dpr));
    h = Math.max(1, Math.round(r.height * dpr));
    canvas.width = w;
    canvas.height = h;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /** bins: valores 0..1 (cualquier largo); active: si suena esta capa. */
  function draw(bins, { active = false, time = 0 } = {}) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) * 0.36;
    const maxLen = Math.min(w, h) * 0.14;
    const grad = ctx.createRadialGradient(cx, cy, base * 0.9, cx, cy, base + maxLen);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * base) / spikes / 2.4);
    ctx.globalAlpha = active ? 0.95 : 0.35;
    for (let i = 0; i < spikes; i += 1) {
      // Espejo para que el anillo sea simetrico (graves arriba y abajo).
      const k = i < spikes / 2 ? i : spikes - 1 - i;
      const idx = Math.floor((k / (spikes / 2)) * (bins.length * 0.7));
      const v = active ? bins[idx] ?? 0 : 0.12 + 0.08 * Math.sin(time * 1.4 + i * 0.35);
      const len = 2 + v * maxLen;
      const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + c * base, cy + s * base);
      ctx.lineTo(cx + c * (base + len), cy + s * (base + len));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  return { draw, dispose: () => ro.disconnect() };
}

/** Espectro en dB (Tone.Analyser 'fft') -> valores 0..1. */
export function normalizeFft(db, { floor = -100, ceil = -30 } = {}) {
  const out = new Array(db.length);
  for (let i = 0; i < db.length; i += 1) {
    const v = (db[i] - floor) / (ceil - floor);
    out[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }
  return out;
}
