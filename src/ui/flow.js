// Flujo de Misti Sound (videos de referencia):
//   onboard -> solo el formulario (lugar, dia, mes, anio) sobre la aurora.
//   intro   -> particulas + ondas + textos mientras se cargan los datos.
//   dash    -> se revelan las esferas, graficos y el panel de sonido.
// El estado vive en <html data-stage>. Al revelar se emite 'misti:reveal'
// (las esferas hacen su acercamiento y empieza el relato).
import { t } from '../i18n/index.js';

const MIN_INTRO_MS = 4200;
const LINES = ['introLine1', 'introLine2', 'introLine3'];

export function createFlow({ store }) {
  const root = document.documentElement;
  const overlay = document.getElementById('intro-overlay');
  const canvas = document.getElementById('intro-canvas');
  const text = document.getElementById('intro-text');
  const skip = document.getElementById('intro-skip');
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let startedAt = 0;
  let raf = 0;
  let lineTimer = 0;
  let lineIdx = 0;
  let skipRequested = false;

  const stage = () => root.dataset.stage;
  function setStage(next) {
    if (stage() === next) return;
    root.dataset.stage = next;
    if (next === 'dash') {
      requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('misti:reveal')));
    }
  }

  function showLine() {
    text.classList.remove('is-in');
    void text.offsetWidth;
    text.textContent = t(store.get().lang, LINES[lineIdx % LINES.length]);
    text.classList.add('is-in');
    lineIdx += 1;
  }

  // Particulas que giran y tres ondas de colores (CO2, ozono, temperatura).
  const parts = Array.from({ length: 220 }, (_, i) => ({ a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.5, s: 0.2 + Math.random() * 0.8, z: i % 3 }));
  function drawIntro(now) {
    raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (canvas.width = Math.round(innerWidth * dpr));
    const h = (canvas.height = Math.round(innerHeight * dpr));
    const ctx = canvas.getContext('2d');
    const tt = (now - startedAt) / 1000;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.45;
    const R = Math.min(w, h);
    for (const p of parts) {
      const a = p.a + tt * p.s * 0.6;
      const rr = p.r * R * (0.6 + 0.4 * Math.min(1, tt / 2));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.55;
      ctx.fillStyle = ['#fff6d8', '#9ff3ff', '#ffc68a'][p.z];
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(tt * 2 + p.a * 5));
      ctx.beginPath();
      ctx.arc(x, y, (1 + p.s * 1.6) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.85;
    const waves = [
      ['#ffb35c', 1.2, 0],
      ['#5ef0ff', 1.7, 1.5],
      ['#b37aff', 2.3, 3]
    ];
    for (const [color, f, ph] of waves) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const env = Math.sin((x / w) * Math.PI);
        const y = h * 0.74 + Math.sin((x / w) * Math.PI * 2 * f + tt * 2 + ph) * h * 0.06 * env * Math.min(1, tt);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * dpr;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * dpr;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (stage() === 'intro') raf = requestAnimationFrame(drawIntro);
  }

  function startIntro() {
    skipRequested = false;
    lineIdx = 0;
    startedAt = performance.now();
    if (reduced()) {
      setStage('intro');
      overlay.hidden = false;
      showLine();
      return;
    }
    setStage('intro');
    overlay.hidden = false;
    showLine();
    clearInterval(lineTimer);
    lineTimer = setInterval(showLine, 1500);
    if (!raf) raf = requestAnimationFrame(drawIntro);
  }

  function endIntro(next) {
    clearInterval(lineTimer);
    cancelAnimationFrame(raf);
    raf = 0;
    overlay.hidden = true;
    setStage(next);
  }

  skip?.addEventListener('click', () => {
    skipRequested = true;
    render(store.get());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stage() === 'intro') {
      skipRequested = true;
      render(store.get());
    }
  });
  document.addEventListener('misti:submit', startIntro);

  let checkTimer = 0;
  function render(state) {
    const h = state.history;
    const ready = h.status === 'ready' && h.result?.story;
    if (skip) skip.textContent = t(state.lang, 'introSkip');
    if (stage() === 'intro') {
      if (h.status === 'error' || h.status === 'idle') {
        endIntro('onboard');
        return;
      }
      if (ready) {
        const left = MIN_INTRO_MS - (performance.now() - startedAt);
        if (left <= 0 || skipRequested || reduced()) endIntro('dash');
        else {
          clearTimeout(checkTimer);
          checkTimer = setTimeout(() => render(store.get()), left);
        }
      }
      return;
    }
    // Enlace compartido: va directo al tablero. Una vez en el tablero no se
    // vuelve al inicio al editar el formulario (se ven guiones hasta consultar).
    if (ready && stage() === 'onboard') setStage('dash');
  }

  return { render, startIntro, stage };
}
