// Tarjeta para compartir el relato de cumpleanos (Paso 4 — Reflexion y
// Comunidad). Se dibuja en un <canvas> 1080x1350 (formato vertical de redes)
// y se comparte con la Web Share API si el navegador puede compartir
// archivos; si no, se descarga como PNG. El texto alternativo de la tarjeta
// es el mismo relato en texto, para lectores de pantalla.
import { t } from '../i18n/index.js';
import { formatDegrees, formatCoords } from '../history/history-core.js';
import { formatBirthday, pastLabel, recentLabel, reflectionMessage } from '../history/story-core.js';

const W = 1080;
const H = 1350;

const deg = (v) => (v === null ? '—' : `${formatDegrees(v, { signed: true })} °C`);

/** Texto plano de la tarjeta (alt, texto al compartir). */
export function storyCardText(result, lang) {
  const place = result.placeLabel ?? formatCoords(result.point.lat, result.point.lon);
  return t(lang, 'storyCardText', {
    birthday: formatBirthday(result.birthday, lang),
    place,
    past: pastLabel(result, lang),
    x: deg(result.a.value),
    recent: recentLabel(result, lang),
    y: deg(result.b.value),
    d: result.delta === null ? '—' : deg(result.delta)
  });
}

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + lineHeight;
}

function barColor(v) {
  if (v === null) return '#4b5d55';
  if (v < 0) return '#6fa8dc';
  if (v < 0.5) return '#f3d27a';
  if (v < 1.2) return '#f19a4b';
  return '#e0503a';
}

export function drawStoryCard(canvas, result, lang) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0d2e26');
  g.addColorStop(0.6, '#0b2520');
  g.addColorStop(1, '#2a2343');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const place = result.placeLabel ?? formatCoords(result.point.lat, result.point.lon);
  ctx.fillStyle = '#baf4ce';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('MISTI SOUND · EARTH JUKEBOX', 80, 110);
  ctx.fillStyle = '#f2f7f3';
  ctx.font = '400 64px Georgia, serif';
  wrap(ctx, t(lang, 'storyCardTitle', { birthday: formatBirthday(result.birthday, lang) }), 80, 210, W - 160, 76);
  ctx.fillStyle = '#bacfc0';
  ctx.font = '400 36px system-ui, sans-serif';
  ctx.fillText(place, 80, 380);

  // Dos momentos.
  const box = (x, label, value, accent) => {
    ctx.fillStyle = '#ffffff10';
    ctx.fillRect(x, 440, 440, 260);
    ctx.fillStyle = '#bacfc0';
    ctx.font = '500 30px system-ui, sans-serif';
    ctx.fillText(label, x + 34, 500);
    ctx.fillStyle = accent;
    ctx.font = '600 92px system-ui, sans-serif';
    ctx.fillText(deg(value), x + 34, 630);
  };
  box(80, pastLabel(result, lang), result.a.value, '#9fd3f5');
  box(560, recentLabel(result, lang), result.b.value, '#f6a46b');

  // Barras: decada de 1950 (promedio) + cada uno de los ultimos 5 anios.
  const bars = [
    { label: t(lang, 'storyCardPastBar'), value: result.a.value },
    ...(result.n ? [{ label: String(result.n.firstYear), value: result.n.value }] : []),
    ...result.b.series.map((s) => ({ label: String(s.year), value: s.value }))
  ];
  const base = 1010;
  const scale = 110; // px por grado
  ctx.strokeStyle = '#ffffff40';
  ctx.beginPath();
  ctx.moveTo(80, base);
  ctx.lineTo(W - 80, base);
  ctx.stroke();
  const slot = (W - 160) / bars.length;
  bars.forEach((b, i) => {
    const x = 80 + i * slot + slot * 0.2;
    const w = slot * 0.6;
    const h = b.value === null ? 4 : Math.max(-200, Math.min(240, b.value * scale));
    ctx.fillStyle = barColor(b.value);
    ctx.fillRect(x, h >= 0 ? base - h : base, w, Math.abs(h) || 4);
    ctx.fillStyle = '#d4e8dc';
    ctx.font = '500 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, x + w / 2, base + 44);
    ctx.textAlign = 'start';
  });

  ctx.fillStyle = '#f2f7f3';
  ctx.font = '400 34px system-ui, sans-serif';
  const after = wrap(ctx, reflectionMessage(result, lang), 80, 1120, W - 160, 44);
  ctx.fillStyle = '#93ab9c';
  ctx.font = '400 24px system-ui, sans-serif';
  wrap(ctx, t(lang, 'storyCardFooter', { baseline: String(result.baseline ?? '').replace('-', '–') }), 80, Math.max(after + 10, 1270), W - 160, 32);
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Comparte (Web Share con archivo) o descarga. Devuelve 'shared' | 'downloaded' | 'cancelled'. */
export async function shareStoryCard(result, lang, { forceDownload = false } = {}) {
  const canvas = document.createElement('canvas');
  drawStoryCard(canvas, result, lang);
  const blob = await canvasBlob(canvas);
  const name = `misti-sound-${result.birthday.month}${result.birthday.day ? `-${result.birthday.day}` : ''}.png`;
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  const text = storyCardText(result, lang);
  if (!forceDownload && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Misti Sound', text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, name);
  return 'downloaded';
}
