// Video vertical (1080x1920) para TikTok / Reels: anima la tarjeta del relato
// mientras suena el relato completo (antes -> ahora) y graba imagen + el audio
// real del bus de la app con MediaRecorder. No publica nada: el resultado se
// comparte con la hoja de compartir del telefono o se descarga.
import { t } from '../i18n/index.js';
import { formatDegrees, formatCoords } from '../history/history-core.js';
import { formatBirthday, pastLabel, recentLabel } from '../history/story-core.js';

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

function drawFrame(ctx, { result, layers, lang, state, elapsed }) {
  const h = state.history;
  const phase = h.playing?.epoch ?? (h.ended ? 'end' : 'a');
  const warm = phase === 'b';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, warm ? '#2a1408' : '#06201a');
  g.addColorStop(1, warm ? '#4a1d0c' : '#0a2f3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Estrellas (CO2): mas en el presente.
  const ppm = warm ? layers?.co2?.recent.mean : layers?.co2?.past.mean;
  const stars = ppm ? Math.round(20 + (ppm - 280) * 1.2) : 40;
  ctx.fillStyle = '#ffffffcc';
  for (let i = 0; i < stars; i += 1) {
    const x = (i * 397) % W;
    const y = (i * 911 + elapsed * (warm ? 140 : 40)) % (H * 0.45);
    ctx.fillRect(x, y, 3, 3);
  }

  // Latido (temperatura): circulo que pulsa al ritmo del compas actual.
  const bpm = warm ? h.beat?.bpm ?? 90 : 56;
  const beat = (elapsed * bpm) / 60;
  const pulse = Math.exp(-((beat % 1) * 6));
  ctx.beginPath();
  ctx.arc(W / 2, 1080, 220 + pulse * 60, 0, Math.PI * 2);
  ctx.fillStyle = warm ? `rgba(240,120,60,${0.35 + 0.4 * pulse})` : `rgba(124,224,181,${0.25 + 0.2 * pulse})`;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ce0b5';
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.fillText('MISTI SOUND', W / 2, 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = '400 66px Georgia, serif';
  ctx.fillText(t(lang, 'videoTitle', { birthday: formatBirthday(result.birthday, lang) }), W / 2, 260);
  ctx.font = '400 42px system-ui, sans-serif';
  ctx.fillStyle = '#d8eee4';
  ctx.fillText(result.placeLabel ?? formatCoords(result.point.lat, result.point.lon), W / 2, 330);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 120px system-ui, sans-serif';
  ctx.fillText(deg(warm ? result.b.value : result.a.value), W / 2, 1120);
  ctx.font = '500 44px system-ui, sans-serif';
  ctx.fillText(warm ? recentLabel(result, lang) : pastLabel(result, lang), W / 2, 1400);
  if (warm && h.beat?.year) {
    ctx.fillStyle = '#ffcf9e';
    ctx.fillText(`${h.beat.year} · ${h.beat.bpm} BPM`, W / 2, 1470);
  }
  ctx.fillStyle = '#e8f6ee';
  ctx.font = '400 38px system-ui, sans-serif';
  const co2 = warm ? layers?.co2?.recent.mean : layers?.co2?.past.mean;
  const oz = warm ? layers?.ozone?.recent.mean : layers?.ozone?.past.mean;
  ctx.fillText(`CO₂ ${co2 ? Math.round(co2) : '—'} ppm   ·   ${t(lang, 'metricOzone')} ${oz ?? '—'} DU`, W / 2, 1560);
  if (phase === 'end' && result.delta !== null) {
    ctx.fillStyle = '#ffb27a';
    ctx.font = '600 56px system-ui, sans-serif';
    ctx.fillText(t(lang, 'momentDeltaWarmer', { d: deg(Math.abs(result.delta)).replace('+', '') }), W / 2, 1700);
  }
  ctx.fillStyle = '#9fbfb2';
  ctx.font = '400 30px system-ui, sans-serif';
  ctx.fillText(t(lang, 'videoFooter'), W / 2, 1850);
  ctx.textAlign = 'start';
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
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));

  const t0 = performance.now();
  const timer = setInterval(() => {
    drawFrame(ctx, { result, layers, lang, state: store.get(), elapsed: (performance.now() - t0) / 1000 });
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
  } catch {
    // ya desconectado
  }
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}
