// Globo de la primera pantalla (video de referencia del equipo): la Tierra
// gira como un holograma sobre un haz de luz cian, rodeada de orbitas
// punteadas por las que viajan pequenos satelites brillantes. Debajo esta el
// formulario. Solo se ve en la etapa "onboard" (ver src/ui/flow.js).
//  - Esfera: la misma de las capas (three.js) con las texturas de la Tierra de
//    dia y de noche de public/images/layers/.
//  - Orbitas y satelites: canvas 2D encima, con las partes "detras" del
//    planeta dibujadas antes y mas tenues para que se lea la profundidad.
// Con prefers-reduced-motion la Tierra no gira y las orbitas quedan quietas.
import { createEffectSphere } from '../globe/effect-sphere.js';

const ORBITS = [
  { rx: 0.47, ry: 0.11, tilt: -0.22, speed: 0.22, sats: 3, color: [190, 255, 235] },
  { rx: 0.43, ry: 0.16, tilt: 0.35, speed: -0.16, sats: 2, color: [150, 230, 255] },
  { rx: 0.5, ry: 0.07, tilt: 0.06, speed: 0.12, sats: 2, color: [215, 255, 245] }
];

export function createHeroGlobe(root, { baseUrl = '/' } = {}) {
  if (!root) return { render() {} };
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.innerHTML = '';
  const beam = document.createElement('div');
  beam.className = 'hero-beam';
  const base = document.createElement('div');
  base.className = 'hero-base';
  const back = document.createElement('canvas');
  back.className = 'hero-orbits hero-orbits-back';
  const host = document.createElement('div');
  host.className = 'hero-sphere';
  const front = document.createElement('canvas');
  front.className = 'hero-orbits hero-orbits-front';
  root.append(beam, base, back, host, front);

  const tex = (name) => `${baseUrl}images/layers/${name}`;
  const sphere = createEffectSphere(host, {
    style: 'earth',
    dayUrl: tex('earth-day.jpg'),
    nightUrl: tex('earth-night.jpg'),
    rim: [0.35, 0.95, 1],
    halo: [0.3, 0.9, 1],
    haloSize: 1.22,
    haloStrength: 0.28,
    brightness: 1.15,
    contrast: 1.12,
    saturation: 1.15
  });

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  function size(c) {
    const r = root.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }
  const ro = new ResizeObserver(() => {
    size(back);
    size(front);
    draw(performance.now());
  });
  ro.observe(root);

  // Una orbita = elipse inclinada; la mitad "de atras" (sin(a) < 0) va en el
  // canvas trasero, la de adelante en el delantero.
  function drawOrbits(t) {
    const W = back.width;
    const H = back.height;
    const cx = W / 2;
    const cy = H * 0.42;
    const S = Math.min(W, H * 1.05);
    for (const c of [back, front]) c.getContext('2d').clearRect(0, 0, W, H);
    ORBITS.forEach((o, k) => {
      const [r, g, b] = o.color;
      for (const [canvas, behind] of [[back, true], [front, false]]) {
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(o.tilt);
        // Puntos de la orbita
        const n = 120;
        for (let i = 0; i < n; i += 1) {
          const a = (i / n) * Math.PI * 2;
          if ((Math.sin(a) < 0) !== behind) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${behind ? 0.18 : 0.55})`;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * o.rx * S, Math.sin(a) * o.ry * S, 1.1 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        // Satelites
        for (let s = 0; s < o.sats; s += 1) {
          const a = t * o.speed + (s / o.sats) * Math.PI * 2 + k;
          if ((Math.sin(a) < 0) !== behind) continue;
          const x = Math.cos(a) * o.rx * S;
          const y = Math.sin(a) * o.ry * S;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 9 * dpr);
          glow.addColorStop(0, `rgba(${r},${g},${b},${behind ? 0.35 : 0.95})`);
          glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, 9 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    });
  }

  let raf = 0;
  let introDone = false;
  function draw(now) {
    raf = 0;
    drawOrbits(reduced() ? 0 : now / 1000);
    const visible = document.documentElement.dataset.stage === 'onboard';
    if (visible && !reduced()) raf = requestAnimationFrame(draw);
  }

  function render() {
    const onboard = document.documentElement.dataset.stage === 'onboard';
    root.hidden = !onboard;
    if (onboard) {
      if (!introDone) {
        introDone = true;
        sphere.intro();
      }
      if (!raf) raf = requestAnimationFrame(draw);
    }
  }

  size(back);
  size(front);
  return { render, sphere };
}
