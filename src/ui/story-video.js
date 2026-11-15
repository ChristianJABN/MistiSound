// Video vertical (1080x1920) para TikTok / Reels: anima la tarjeta del relato
// mientras suena el relato completo (antes -> ahora) y graba imagen + el audio
// real del bus de la app con MediaRecorder. No publica nada: el resultado se
// comparte con la hoja de compartir del telefono o se descarga.
import { t } from '../i18n/index.js';
import { formatDegrees, formatCoords } from '../history/history-core.js';
import { formatBirthday } from '../history/story-core.js';

const W = 1080;
const H = 1920;
const FPS = 30;

export function pickVideoMime(MR = globalThis.MediaRecorder) {
  if (!MR?.isTypeSupported) return null;
  for (const type of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MR.isTypeSupported(type)) return type;
  }
  return null;
}

export function canRecordVideo() {
  return Boolean(pickVideoMime() && HTMLCanvasElement.prototype.captureStream);
}

const deg = (v) => (v === null || v === undefined ? '—' : `${formatDegrees(v, { signed: true })} °C`);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Tarjeta estilizada (mismo diseno que la de Instagram) animada: el momento
 * que suena se ilumina, un ecualizador sigue el audio real y las barras de
 * temperatura crecen. `bins` = espectro 0..1 del bus de audio.
 */
export function drawFrame(ctx, { result, layers, lang, state, elapsed, bins = [] }) {
  const h = state.history;
  const phase = h.playing?.epoch ?? (h.ended ? 'end' : 'a');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0d2e26');
  g.addColorStop(0.55, '#0b2520');
  g.addColorStop(1, '#2a2343');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Aurora suave que se mueve.
  const ag = ctx.createRadialGradient(W * (0.3 + 0.1 * Math.sin(elapsed * 0.4)), 260, 40, W * 0.3, 260, 700);
  ag.addColorStop(0, 'rgba(124,224,181,0.28)');
  ag.addColorStop(1, 'rgba(124,224,181,0)');
  ctx.fillStyle = ag;
  ctx.fillRect(0, 0, W, H);

  const place = result.placeLabel ?? formatCoords(result.point.lat, result.point.lon);
  ctx.fillStyle = '#baf4ce';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText('MISTI SOUND', 80, 150);
  ctx.fillStyle = '#f2f7f3';
  ctx.font = '400 74px Georgia, serif';
  let y = 260;
  for (const line of wrapLines(ctx, t(lang, 'storyCardTitle', { birthday: formatBirthday(result.birthday, lang) }), W - 160)) {
    ctx.fillText(line, 80, y);
    y += 86;
  }
  ctx.fillStyle = '#bacfc0';
  ctx.font = '400 40px system-ui, sans-serif';
  ctx.fillText(place, 80, y + 6);

  // Tres momentos.
  const co2 = layers?.co2;
  const oz = layers?.ozone;
  const moments = [
    { key: 'a', label: '1950', value: result.a.value, extra: co2 ? `${Math.round(co2.past.mean)} ppm` : '', color: '#9fd3f5' },
    ...(result.n ? [{ key: 'n', label: String(result.n.firstYear), value: result.n.value, extra: co2?.birth?.ppm ? `${Math.round(co2.birth.ppm)} ppm` : '', color: '#7ce0b5' }] : []),
    { key: 'b', label: `${result.b.firstYear}–${String(result.b.lastYear).slice(2)}`, value: result.b.value, extra: co2 ? `${Math.round(co2.recent.mean)} ppm` : '', color: '#f6a46b' }
  ];
  const top = y + 70;
  const gap = 24;
  const bw = (W - 160 - gap * (moments.length - 1)) / moments.length;
  moments.forEach((m, i) => {
    const x = 80 + i * (bw + gap);
    const on = phase === m.key || phase === 'end';
    const pulse = on && phase !== 'end' ? 0.5 + 0.5 * Math.sin(elapsed * 6) : 0;
    ctx.save();
    roundRect(ctx, x, top, bw, 300, 28);
    ctx.fillStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = on ? 4 : 2;
    ctx.strokeStyle = on ? m.color : 'rgba(255,255,255,0.15)';
    if (on) {
      ctx.shadowColor = m.color;
      ctx.shadowBlur = 20 + 25 * pulse;
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#bacfc0';
    ctx.font = '500 34px system-ui, sans-serif';
    ctx.fillText(m.label, x + 28, top + 64);
    ctx.fillStyle = m.color;
    ctx.font = `600 ${moments.length > 2 ? 64 : 84}px system-ui, sans-serif`;
    ctx.fillText(deg(m.value), x + 28, top + 170);
    ctx.fillStyle = '#d4e8dc';
    ctx.font = '400 30px system-ui, sans-serif';
    ctx.fillText(m.extra ? `CO₂ ${m.extra}` : '', x + 28, top + 240);
  });

  // Ecualizador con el audio real.
  const eqTop = top + 360;
  const eqH = 280;
  const n = 48;
  const bar = (W - 160) / n;
  for (let i = 0; i < n; i += 1) {
    const v = bins.length ? bins[Math.floor((i / n) * bins.length * 0.7)] ?? 0 : 0.1 + 0.08 * Math.sin(elapsed * 3 + i);
    const bh = 8 + v * eqH;
    const cg = ctx.createLinearGradient(0, eqTop + eqH - bh, 0, eqTop + eqH);
    cg.addColorStop(0, phase === 'b' ? '#ff6a3d' : phase === 'n' ? '#7ce0b5' : '#7af6ff');
    cg.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = cg;
    roundRect(ctx, 80 + i * bar + 3, eqTop + eqH - bh, bar - 6, bh, 6);
    ctx.fill();
  }

  // Barras de temperatura que crecen (1950s, tu anio, ultimos 5).
  const bars = [...result.a.series.map((s) => ({ v: s.value, c: '#9fd3f5' })), ...(result.n ? [{ v: result.n.value, c: '#7ce0b5' }] : []), ...result.b.series.map((s) => ({ v: s.value, c: '#f6a46b' }))];
  const base = eqTop + eqH + 330;
  const slot = (W - 160) / bars.length;
  const grow = Math.min(1, elapsed / 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(80, base);
  ctx.lineTo(W - 80, base);
  ctx.stroke();
  bars.forEach((b, i) => {
    const hh = Math.max(-150, Math.min(220, (b.v ?? 0) * 110)) * grow;
    ctx.fillStyle = b.c;
    ctx.fillRect(80 + i * slot + slot * 0.2, hh >= 0 ? base - hh : base, slot * 0.6, Math.abs(hh) || 3);
  });

  if (phase === 'end' && result.delta !== null) {
    ctx.fillStyle = '#ffb27a';
    ctx.font = '600 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t(lang, 'momentDeltaWarmer', { d: deg(Math.abs(result.delta)).replace('+', '') }), W / 2, base + 120);
    ctx.textAlign = 'start';
  }
  ctx.fillStyle = '#93ab9c';
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t(lang, 'videoFooter'), W / 2, H - 70);
  ctx.textAlign = 'start';
  void oz;
}

/**
 * Graba el relato. `start()` arranca el audio (controller.playAuto) y
 * devuelve una promesa; `isDone(state)` indica el final.
 */
export async function recordStoryVideo({ store, audioEngine, start, isDone, maxSeconds = 45 }) {
  const mime = pickVideoMime();
  if (!mime) throw new Error('MediaRecorder no disponible');
  const state0 = store.get();
  const result = state0.history.result;
  const layers = state0.history.layers?.data ?? null;
  const lang = state0.lang;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(FPS);
  const raw = audioEngine.Tone.getContext().rawContext;
  const dest = raw.createMediaStreamDestination();
  const bus = audioEngine.getBus();
  bus.connect(dest);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  const fft = audioEngine.Tone?.Analyser ? new audioEngine.Tone.Analyser('fft', 64) : null;
  if (fft) bus.connect(fft);
  const binsNow = () => (fft ? Array.from(fft.getValue(), (d) => Math.max(0, Math.min(1, (d + 100) / 70))) : []);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));

  const t0 = performance.now();
  const timer = setInterval(() => {
    drawFrame(ctx, { result, layers, lang, state: store.get(), elapsed: (performance.now() - t0) / 1000, bins: binsNow() });
  }, 1000 / FPS);
  drawFrame(ctx, { result, layers, lang, state: store.get(), elapsed: 0 });
  recorder.start(500);
  await start();
  await new Promise((resolve) => {
    let started = false;
    const check = setInterval(() => {
      const s = store.get();
      if (s.history.playing) started = true;
      const elapsed = (performance.now() - t0) / 1000;
      if ((started && isDone(s)) || elapsed > maxSeconds) {
        clearInterval(check);
        setTimeout(resolve, 1500); // cola del sonido + la tarjeta final
      }
    }, 200);
  });
  recorder.stop();
  await stopped;
  clearInterval(timer);
  try {
    bus.disconnect(dest);
    if (fft) {
      bus.disconnect(fft);
      fft.dispose();
    }
  } catch {
    // ya desconectado
  }
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}
