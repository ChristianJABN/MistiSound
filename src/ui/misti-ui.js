// Interfaz de Misti Sound (INTERFAZ.docx): boton A+, Guia Docente (modal con
// PDF y copiar), atajos de teclado, tarjetas de las 3 capas (CO2, ozono,
// temperatura), metricas de CO2/ozono en la comparacion y botones de
// compartir (imagen para Instagram, video para TikTok).
import { t } from '../i18n/index.js';
import { ensureAudio } from '../app/ensure-audio.js';
import { buildPdf } from './pdf-lite.js';
import { shareStoryCard } from './story-card.js';
import { recordStoryVideo, canRecordVideo } from './story-video.js';
import { ozoneTileUrl } from '../layers/ozone.js';
import { recentBirthdayDate } from '../globe/dated-imagery.js';

const APLUS_KEY = 'misti-aplus';

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // almacenamiento no disponible: la preferencia vive solo en esta visita
  }
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

async function shareOrDownload(blob, name, text) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Misti Sound', text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

export function createMistiUi({ store, audioEngine, controller, onLayoutChange = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const lang = () => store.get().lang;
  const withAudio = async (fn) => ((await ensureAudio({ audioEngine, store })) ? fn() : undefined);
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
  const announce = (text) => {
    live.textContent = '';
    setTimeout(() => (live.textContent = text), 30);
  };

  // ---------- A+ ----------
  const aplus = $('aplus-toggle');
  function setAplus(on) {
    document.documentElement.classList.toggle('a-plus', on);
    aplus?.setAttribute('aria-pressed', String(on));
    writePref(APLUS_KEY, on ? 'on' : 'off');
    onLayoutChange();
  }
  setAplus(readPref(APLUS_KEY) === 'on');
  aplus?.addEventListener('click', () => setAplus(!document.documentElement.classList.contains('a-plus')));

  // ---------- Guia Docente ----------
  const dialog = $('guide-dialog');
  const guideBtn = $('guide-open');
  const guideStatus = $('guide-status');
  function guideText() {
    const body = dialog.querySelector('.guide-body');
    const parts = [];
    for (const el of body.querySelectorAll('h2, h3, h4, p:not(#guide-status), li')) {
      if (el.closest('.guide-actions')) continue;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const tag = el.tagName;
      parts.push({ text: tag === 'LI' ? `• ${text}` : text, tag });
    }
    return parts;
  }
  guideBtn?.addEventListener('click', () => {
    guideStatus.textContent = '';
    dialog.showModal();
    guideBtn.setAttribute('aria-pressed', 'true');
    $('guide-close').focus();
  });
  dialog?.addEventListener('close', () => {
    guideBtn.setAttribute('aria-pressed', 'false');
    guideBtn.focus();
  });
  $('guide-close')?.addEventListener('click', () => dialog.close());
  $('guide-copy')?.addEventListener('click', async () => {
    const text = guideText()
      .map((p) => p.text)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      guideStatus.textContent = t(lang(), 'guideCopied');
    } catch {
      guideStatus.textContent = t(lang(), 'guideCopyFailed');
    }
  });
  $('guide-pdf')?.addEventListener('click', () => {
    const blocks = guideText().map((p) => ({
      text: p.text,
      size: p.tag === 'H2' ? 18 : p.tag === 'H3' ? 14 : p.tag === 'H4' ? 12 : 11,
      bold: /^H\d$/.test(p.tag),
      gap: /^H[23]$/.test(p.tag) ? 10 : p.tag === 'H4' ? 6 : 0
    }));
    const bytes = buildPdf(blocks, { title: t(lang(), 'guideTitle') });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = lang() === 'en' ? 'misti-sound-teacher-guide.pdf' : 'misti-sound-guia-docente.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    guideStatus.textContent = t(lang(), 'guidePdfDone');
  });

  // ---------- Atajos ----------
  const pop = $('shortcuts-pop');
  const popBtn = $('shortcuts-btn');
  const setPop = (open) => {
    pop.hidden = !open;
    popBtn.setAttribute('aria-expanded', String(open));
  };
  popBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setPop(pop.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== popBtn) setPop(false);
  });

  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      if (!pop.hidden) {
        setPop(false);
        popBtn.focus();
      }
      return; // el <dialog> se cierra solo con Esc
    }
    // Atajos de una tecla: nunca mientras se escribe, con modificadores, con
    // el modal abierto o fuera de "Tu fecha" (no rompen lectores ni el navegador).
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || dialog?.open) return;
    const s = store.get();
    if (s.activeTab !== 'history') return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'spacebar') {
      // Espacio sobre un boton/enlace ya lo activa: no se duplica.
      if (e.target.closest?.('button, a, summary, [role="button"]')) return;
      e.preventDefault();
      if (s.history.playing) {
        controller.stop();
        announce(t(lang(), 'kbPaused'));
      } else if (s.history.result) {
        await withAudio(() => (s.history.lastPlay ? controller.repeat() : controller.playAuto()));
      }
      return;
    }
    if (!s.history.result) return;
    if (key === '1') await withAudio(() => controller.play('a'));
    else if (key === '2') await withAudio(() => controller.play('b'));
    else if (key === '3') await withAudio(() => controller.playMix());
    else if (key === 'm') {
      const muted = !s.history.musicMuted;
      controller.setMusicMuted(muted);
      announce(t(lang(), muted ? 'kbMusicOff' : 'kbMusicOn'));
    } else return;
    e.preventDefault();
  });

  // ---------- Capas y mezcla ----------
  for (const btn of document.querySelectorAll('.layer-listen')) {
    btn.addEventListener('click', () => withAudio(() => controller.playLayer(btn.dataset.layer)));
  }
  $('history-mix')?.addEventListener('click', () => withAudio(() => controller.playMix()));

  // ---------- Compartir ----------
  const shareStatus = $('history-card-status');
  let shareKey = null;
  const setShare = (key) => {
    shareKey = key;
    shareStatus.textContent = key ? t(lang(), key) : '';
  };
  $('share-instagram')?.addEventListener('click', async () => {
    const result = store.get().history.result;
    if (!result?.story) return;
    try {
      const out = await shareStoryCard(result, lang());
      setShare(out === 'shared' ? 'shareDoneShared' : out === 'downloaded' ? 'shareImageDownloaded' : null);
    } catch (err) {
      console.error(err);
      setShare('storyCardError');
    }
  });
  let recording = false;
  $('share-tiktok')?.addEventListener('click', async () => {
    const s = store.get();
    if (!s.history.result?.story || recording) return;
    if (!canRecordVideo()) {
      setShare('shareVideoUnsupported');
      return;
    }
    if (s.audio.muted) {
      setShare('shareVideoMuted');
      return;
    }
    if (!(await ensureAudio({ audioEngine, store }))) return;
    recording = true;
    setShare('shareVideoRecording');
    render(store.get());
    try {
      const { blob, ext } = await recordStoryVideo({
        store,
        audioEngine,
        start: () => controller.playAuto(),
        isDone: (st) => st.history.ended || (!st.history.playing && st.history.lastPlay === 'auto')
      });
      const r = s.history.result;
      const out = await shareOrDownload(blob, `misti-sound-${r.birthday.month}${r.birthday.day ? `-${r.birthday.day}` : ''}.${ext}`, t(lang(), 'videoShareText'));
      setShare(out === 'shared' ? 'shareDoneShared' : out === 'downloaded' ? (ext === 'mp4' ? 'shareVideoDownloaded' : 'shareVideoDownloadedWebm') : null);
    } catch (err) {
      console.error('No se pudo grabar el video', err);
      setShare('shareVideoError');
    } finally {
      recording = false;
      render(store.get());
    }
  });

  // ---------- Mapa de ozono (NASA OMI via GIBS) ----------
  const ozCanvas = $('ozone-canvas');
  let ozDate = null;
  function drawOzone(date) {
    if (!ozCanvas) return;
    ozCanvas.setAttribute('aria-label', t(lang(), 'ozoneMapAlt', { date }));
    if (date === ozDate) return;
    ozDate = date;
    const ctx = ozCanvas.getContext('2d');
    ctx.clearRect(0, 0, ozCanvas.width, ozCanvas.height);
    const k = ozCanvas.width / 360; // px por grado
    // Una pasada diaria deja franjas sin dato entre orbitas: se dibujan los 2
    // dias anteriores debajo y el dia del cumpleanos encima, para rellenarlas.
    const base = new Date(`${date}T00:00:00Z`);
    const days = [2, 1, 0].map((back) => new Date(base.getTime() - back * 86400000).toISOString().slice(0, 10));
    const layers = days.map(() => [null, null]);
    const paint = () => {
      if (ozDate !== date) return;
      ctx.clearRect(0, 0, ozCanvas.width, ozCanvas.height);
      layers.forEach((imgs) => imgs.forEach((img, col) => img && ctx.drawImage(img, col * 288 * k, 0, 288 * k, 288 * k)));
    };
    days.forEach((day, d) => {
      [0, 1].forEach((col) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          layers[d][col] = img;
          paint();
        };
        img.src = ozoneTileUrl(day, col);
      });
    });
  }

  // ---------- Render ----------
  const fmtPpm = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}`);
  const fmtDu = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}`);
  function setMetric(id, value, unit) {
    const el = $(id);
    if (!el) return;
    const text = value === '—' ? '—' : `${value} ${unit}`;
    if (el.dataset.v === text) return;
    el.dataset.v = text;
    if (value === '—') el.textContent = '—';
    else el.replaceChildren(document.createTextNode(`${value} `), Object.assign(document.createElement('small'), { textContent: unit }));
  }

  function render(state) {
    const h = state.history;
    const result = h.status === 'ready' ? h.result : null;
    const story = Boolean(result?.story);
    const l = state.lang;
    const layers = h.layers?.key === result?.key ? h.layers : null;
    const data = layers?.data;
    const loading = layers?.status === 'loading';
    const dash = loading ? '…' : '—';
    setMetric('m-a-co2', data?.co2 ? fmtPpm(data.co2.past.mean) : dash, 'ppm');
    setMetric('m-b-co2', data?.co2 ? fmtPpm(data.co2.recent.mean) : dash, 'ppm');
    setMetric('m-a-oz', data?.ozone ? fmtDu(data.ozone.past.mean) : dash, 'DU');
    setMetric('m-b-oz', data?.ozone ? fmtDu(data.ozone.recent.mean) : dash, 'DU');
    const note = $('metrics-note');
    if (note) note.textContent = story ? t(l, 'metricsNote', { oz: data?.ozone ? `${data.ozone.past.firstYear}–${data.ozone.past.lastYear}` : '2005–2009' }) : '';

    for (const btn of document.querySelectorAll('.layer-listen')) {
      btn.disabled = !story || state.audio.muted;
      btn.classList.toggle('is-playing', Boolean(h.playing && h.lastPlay === `layer:${btn.dataset.layer}`));
      btn.setAttribute('aria-label', t(l, 'layerListenAria', { layer: t(l, `layerName_${btn.dataset.layer}`) }));
    }
    const mix = $('history-mix');
    if (mix) {
      mix.disabled = !story || state.audio.muted;
      mix.classList.toggle('is-playing', Boolean(h.playing && h.lastPlay === 'mix'));
    }
    for (const id of ['share-instagram', 'share-tiktok']) {
      const b = $(id);
      if (b) b.disabled = !story || recording;
    }
    if (shareKey) shareStatus.textContent = t(l, shareKey);

    const birthday = result?.story ? result.birthday : null;
    const date = birthday ? recentBirthdayDate(birthday) : recentBirthdayDate({ day: new Date().getUTCDate(), month: new Date().getUTCMonth() + 1 });
    if (date) drawOzone(date);

    const co2Img = document.querySelector('.layer-co2 img');
    if (co2Img) co2Img.alt = t(l, 'layerCo2Alt');
    aplus?.setAttribute('title', t(l, 'aplusLabel'));
  }

  return { render };
}
