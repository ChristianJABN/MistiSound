// Flujo de Misti Sound (videos de referencia):
//   onboard -> solo el formulario (lugar, dia, mes, anio) sobre la aurora.
//   intro   -> particulas + ondas + textos mientras se cargan los datos.
//   dash    -> se revelan las esferas, graficos y el panel de sonido.
// El estado vive en <html data-stage>. Al revelar se emite 'misti:reveal'
// (las esferas hacen su acercamiento y empieza el relato).
import { t } from '../i18n/index.js';
import { buildIntroLines } from './intro-lines.js';

// Cada frase se queda LINE_MS en pantalla (aparece palabra por palabra, se lee
// con calma y se desvanece). La intro dura al menos las 3 frases completas.
const LINE_MS = 5500;
const FALLBACK = ['introLine1', 'introLine2', 'introLine3'];

export function createFlow({ store, narrator = null }) {
  const root = document.documentElement;
  const overlay = document.getElementById('intro-overlay');
  const canvas = document.getElementById('intro-canvas');
  const text = document.getElementById('intro-text');
  const skip = document.getElementById('intro-skip');
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // El relator solo narra la presentacion (las frases de la intro). Los
  // momentos del relato se anuncian con voz solo si la persona lo activa en
  // "Opciones de escucha". Respeta el silencio y la preferencia guardada.
  const introVoice = () => {
    if (!narrator || store.get().audio?.muted) return false;
    try {
      if (localStorage.getItem('misti-intro-voice') === 'off') return false;
    } catch {
      /* sin almacenamiento */
    }
    return narrator.isSupported?.() ?? true;
  };
  let startedAt = 0;
  let raf = 0;
  let lineTimer = 0;
  let lineIdx = 0;
  let skipRequested = false;
  // El logo vuelve a la pantalla principal: no regresar solo al tablero
  // hasta que la persona pida otra fecha.
  let stayHome = false;
  let lines = [];
  let minIntroMs = LINE_MS * 3;

  const stage = () => root.dataset.stage;
  function setStage(next) {
    if (stage() === next) return;
    root.dataset.stage = next;
    if (next === 'dash') {
      requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('misti:reveal')));
    }
  }

  function showLine() {
    // Al terminar las frases, si los datos aun no llegan, repite el cierre.
    const segs = lines[Math.min(lineIdx, lines.length - 1)];
    text.classList.remove('is-in');
    void text.offsetWidth;
    text.replaceChildren();
    let i = 0;
    for (const seg of segs) {
      for (const part of seg.text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { text.append(part); continue; }
        const w = document.createElement('span');
        w.className = seg.hl ? 'intro-word intro-hl' : 'intro-word';
        w.style.setProperty('--i', String(i));
        w.textContent = part;
        text.append(w);
        i += 1;
      }
    }
    const plain = segs.map((s) => s.text).join('');
    text.setAttribute('aria-label', plain);
    // Relator: lee cada frase de la intro una sola vez (sin repetir el cierre
    // si los datos tardan), con un ritmo sereno.
    if (introVoice() && lineIdx < lines.length) narrator.speak(plain, store.get().lang, { rate: 0.9 });
    text.classList.add('is-in');
    lineIdx += 1;
  }

  // Particulas que giran y tres cintas de ondas (CO2 dorado, ozono cian,
  // temperatura violeta). Cada cinta = muchos hilos finos entre dos curvas que
  // se cruzan: donde se cruzan los hilos se juntan y la cinta "se tuerce",
  // como en el video de referencia. Con 'lighter' los cruces brillan solos.
  const parts = Array.from({ length: 220 }, (_, i) => ({ a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.5, s: 0.2 + Math.random() * 0.8, z: i % 3 }));
  const dust = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 2 - 1, s: 0.3 + Math.random() * 0.7, p: Math.random() * 6.28 }));
  const RIBBONS = [
    { c: ['#ffe2a0', '#ffb35c', '#ffd27a'], f: [3.1, 5.3], s: [0.9, -0.6], p: 0.0, amp: 0.95, twist: 1.4 },
    { c: ['#7af6ff', '#4fc9ff', '#9ff3ff'], f: [2.6, 4.4], s: [-0.7, 0.8], p: 2.1, amp: 1.0, twist: 1.1 },
    { c: ['#c39bff', '#8f7aff', '#b37aff'], f: [3.6, 2.2], s: [0.6, 0.9], p: 4.2, amp: 0.85, twist: 1.7 }
  ];
  const STRANDS = 14;
  let cw = 0;
  let ch = 0;
  function drawIntro(now) {
    raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    // Redimensionar el canvas borra y reserva memoria: solo si cambia.
    if (w !== cw || h !== ch) { canvas.width = cw = w; canvas.height = ch = h; }
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

    // ---- Cintas de ondas ----
    const baseY = h * 0.74;
    const x0 = w * 0.04;
    const x1 = w * 0.96;
    const span = x1 - x0;
    const grow = Math.min(1, tt / 1.6);
    const ampMax = h * 0.1 * grow;
    const step = Math.max(3, Math.round(4 * dpr));
    const env = (u) => Math.pow(Math.sin(Math.PI * u), 1.6);
    ctx.globalCompositeOperation = 'lighter';
    // Polvo brillante que flota sobre la banda de ondas.
    for (const d of dust) {
      const x = x0 + ((d.x + tt * 0.01 * d.s) % 1) * span;
      const u = (x - x0) / span;
      const y = baseY + d.y * ampMax * 1.6 * env(u) + Math.sin(tt * d.s + d.p) * 6 * dpr;
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(tt * 1.5 + d.p));
      ctx.fillStyle = '#fff1cf';
      ctx.beginPath();
      ctx.arc(x, y, (0.8 + d.s) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const rb of RIBBONS) {
      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, rb.c[0]);
      grad.addColorStop(0.5, rb.c[1]);
      grad.addColorStop(1, rb.c[2]);
      // Dos curvas borde: A y B (B desfasada) -> los hilos van de A a B.
      const n = Math.floor(span / step) + 1;
      const ya = new Float32Array(n);
      const yb = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        const u = i / (n - 1);
        const e = env(u) * ampMax * rb.amp;
        const k1 = Math.PI * 2 * rb.f[0] * u;
        const k2 = Math.PI * 2 * rb.f[1] * u;
        ya[i] = baseY + e * (0.72 * Math.sin(k1 + tt * rb.s[0] + rb.p) + 0.28 * Math.sin(k2 + tt * rb.s[1]));
        yb[i] = baseY + e * 0.75 * (0.72 * Math.sin(k1 + tt * rb.s[0] + rb.p + rb.twist) + 0.28 * Math.sin(k2 + tt * rb.s[1] + rb.twist * 0.6));
      }
      // Velo translucido entre las dos curvas.
      ctx.globalAlpha = 0.11;
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) ctx.lineTo(x0 + i * step, ya[i]);
      for (let i = n - 1; i >= 0; i -= 1) ctx.lineTo(x0 + i * step, yb[i]);
      ctx.closePath();
      ctx.fill();
      // Hilos finos.
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1 * dpr;
      for (let k = 0; k < STRANDS; k += 1) {
        const m = k / (STRANDS - 1);
        const edge = k === 0 || k === STRANDS - 1;
        ctx.globalAlpha = edge ? 0.9 : 0.22 + 0.18 * Math.sin(m * Math.PI);
        ctx.lineWidth = (edge ? 1.7 : 1) * dpr;
        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
          const y = ya[i] + (yb[i] - ya[i]) * m;
          if (i === 0) ctx.moveTo(x0, y);
          else ctx.lineTo(x0 + i * step, y);
        }
        ctx.stroke();
      }
      // Borde superior con brillo suave (pasada ancha y tenue).
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 6 * dpr;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) ctx.lineTo(x0 + i * step, ya[i]);
      ctx.stroke();
    }
    // Linea central brillante que recorre todo el ancho (y se afina en los extremos).
    const core = ctx.createLinearGradient(x0, 0, x1, 0);
    core.addColorStop(0, 'rgba(255,240,200,0)');
    core.addColorStop(0.06, 'rgba(255,240,200,0.95)');
    core.addColorStop(0.3, 'rgba(220,250,255,0.35)');
    core.addColorStop(0.5, 'rgba(220,250,255,0.2)');
    core.addColorStop(0.7, 'rgba(220,250,255,0.35)');
    core.addColorStop(0.94, 'rgba(255,240,200,0.95)');
    core.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.strokeStyle = core;
    ctx.globalAlpha = 0.35 * grow;
    ctx.lineWidth = 7 * dpr;
    ctx.beginPath();
    ctx.moveTo(x0, baseY);
    ctx.lineTo(x1, baseY);
    ctx.stroke();
    ctx.globalAlpha = 0.9 * grow;
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (stage() === 'intro') raf = requestAnimationFrame(drawIntro);
  }

  /** Volver a la pantalla principal (logo): corta la intro y deja el formulario. */
  function home() {
    stayHome = true;
    clearInterval(lineTimer);
    cancelAnimationFrame(raf);
    raf = 0;
    overlay.hidden = true;
    setStage('onboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startIntro(event) {
    stayHome = false;
    skipRequested = false;
    lineIdx = 0;
    const lang = store.get().lang;
    try {
      lines = buildIntroLines(lang, event?.detail ?? {});
    } catch {
      lines = [];
    }
    if (!lines.length) lines = FALLBACK.map((k) => [{ text: t(lang, k), hl: false }]);
    // Relator: descarga ya las 3 frases para que la voz no se retrase.
    if (introVoice()) for (const segs of lines) narrator.preload?.(segs.map((x) => x.text).join(''), lang, { rate: 0.9 });
    minIntroMs = LINE_MS * lines.length - 300;
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
    lineTimer = setInterval(showLine, LINE_MS);
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
        const left = minIntroMs - (performance.now() - startedAt);
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
    if (ready && stage() === 'onboard' && !stayHome) setStage('dash');
  }

  return { render, startIntro, stage, home };
}
