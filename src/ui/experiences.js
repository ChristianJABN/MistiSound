// Ventana "Experiencias": quienes usaron Misti Sound dejan un comentario, una
// foto y/o su melodia Misti (clip de la mezcla de su fecha, grabado del bus de
// audio real). Se envia con Netlify Forms (formulario "experiencias" en
// index.html, detectado al publicar). Netlify guarda los envios en el panel
// del equipo pero NO los expone publicamente: el muro muestra
//   1) las experiencias aprobadas por el equipo en public/data/experiences.json
//   2) las propias de esta persona, guardadas en su navegador.
import { t } from '../i18n/index.js';
import { ensureAudio } from '../app/ensure-audio.js';
import { formatBirthday } from '../history/story-core.js';
import { formatDegrees, formatCoords } from '../history/history-core.js';

const LOCAL_KEY = 'misti-experiences-local';
const PHOTO_MAX = 1280;
const THUMB = 160;

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeLocal(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // sin almacenamiento: solo se ve en esta sesion
  }
}

/** Reduce una imagen a <= max px de lado (JPEG). */
export function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve({ blob: b, dataUrl: max <= THUMB ? c.toDataURL('image/jpeg', 0.7) : null }) : reject(new Error('toBlob'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('imagen'));
    img.src = url;
  });
}

function pickAudioMime() {
  const MR = globalThis.MediaRecorder;
  if (!MR?.isTypeSupported) return null;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MR.isTypeSupported(m)) ?? null;
}

export function createExperiences({ store, audioEngine, controller }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('exp-dialog');
  if (!dialog) return { render() {} };
  const form = $('exp-form');
  const status = $('exp-status');
  const recStatus = $('exp-record-status');
  const audioEl = $('exp-audio');
  const wall = $('exp-wall');
  const lang = () => store.get().lang;
  let melody = null; // { blob, ext }
  let curated = null;
  let statusKey = null;
  let recKey = null;

  const setStatus = (key) => {
    statusKey = key;
    status.textContent = key ? t(lang(), key) : '';
  };
  const setRec = (key) => {
    recKey = key;
    recStatus.textContent = key ? t(lang(), key) : '';
  };

  function open() {
    fillHidden();
    loadCurated();
    renderWall();
    dialog.showModal();
    $('exp-open')?.setAttribute('aria-pressed', 'true');
    $('exp-comment').focus();
  }
  $('exp-open')?.addEventListener('click', open);
  $('exp-open-inline')?.addEventListener('click', open);
  $('exp-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => $('exp-open')?.setAttribute('aria-pressed', 'false'));

  function summaryText(result, l) {
    if (!result?.story) return '';
    const deg = (v) => (v == null ? '—' : `${formatDegrees(v, { signed: true })} °C`);
    return `1950: ${deg(result.a.value)} · ${result.n ? `${result.n.firstYear}: ${deg(result.n.value)} · ` : ''}${result.b.firstYear}–${result.b.lastYear}: ${deg(result.b.value)} (${formatBirthday(result.birthday, l)})`;
  }
  function fillHidden() {
    const r = store.get().history.result;
    $('exp-place').value = r ? r.placeLabel ?? formatCoords(r.point.lat, r.point.lon) : '';
    $('exp-date').value = r?.birthday ? `${r.birthday.day ?? ''}/${r.birthday.month}/${r.birthday.year ?? ''}` : '';
    $('exp-summary').value = summaryText(r, lang());
  }

  // Grabar la melodia: la mezcla de los dos tiempos (~12 s) desde el bus real.
  $('exp-record')?.addEventListener('click', async () => {
    const s = store.get();
    if (!s.history.result?.story) return setRec('expNeedStory');
    const mime = pickAudioMime();
    if (!mime) return setRec('expRecordUnsupported');
    if (s.audio.muted) return setRec('shareVideoMuted');
    if (!(await ensureAudio({ audioEngine, store }))) return;
    const raw = audioEngine.Tone.getContext().rawContext;
    const dest = raw.createMediaStreamDestination();
    const bus = audioEngine.getBus();
    bus.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: mime });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    setRec('expRecording');
    rec.start(250);
    await controller.playMix();
    await new Promise((resolve) => {
      let started = false;
      const iv = setInterval(() => {
        const st = store.get().history;
        if (st.playing) started = true;
        if (started && !st.playing) {
          clearInterval(iv);
          setTimeout(resolve, 800);
        }
      }, 200);
      setTimeout(() => {
        clearInterval(iv);
        resolve();
      }, 30000);
    });
    rec.stop();
    await done;
    try {
      bus.disconnect(dest);
    } catch {
      // ya desconectado
    }
    const type = mime.split(';')[0];
    melody = { blob: new Blob(chunks, { type }), ext: type === 'audio/mp4' ? 'm4a' : 'webm' };
    audioEl.src = URL.createObjectURL(melody.blob);
    audioEl.hidden = false;
    setRec('expRecorded');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = $('exp-comment').value.trim();
    if (!comment) return setStatus('expNeedComment');
    if (!$('exp-consent').checked) return setStatus('expNeedConsent');
    fillHidden();
    setStatus('expSending');
    const fd = new FormData(form);
    let thumb = null;
    const photo = $('exp-photo').files?.[0];
    try {
      if (photo) {
        const big = await resizeImage(photo, PHOTO_MAX);
        fd.set('foto', new File([big.blob], 'foto.jpg', { type: 'image/jpeg' }));
        thumb = (await resizeImage(photo, THUMB)).dataUrl;
      } else fd.delete('foto');
    } catch {
      fd.delete('foto');
    }
    if (melody) fd.set('melodia', new File([melody.blob], `melodia-misti.${melody.ext}`, { type: melody.blob.type }));
    else fd.delete('melodia');
    let sent = false;
    try {
      const res = await fetch('/', { method: 'POST', body: fd });
      sent = res.ok;
    } catch {
      sent = false;
    }
    const entry = {
      name: $('exp-name').value.trim() || null,
      comment,
      place: $('exp-place').value,
      summary: $('exp-summary').value,
      photo: thumb,
      when: new Date().toISOString(),
      sent
    };
    writeLocal([entry, ...readLocal()]);
    renderWall();
    setStatus(sent ? 'expSent' : 'expSavedLocal');
    if (sent) {
      form.reset();
      melody = null;
      audioEl.hidden = true;
      setRec(null);
    }
  });

  async function loadCurated() {
    if (curated) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/experiences.json`);
      curated = res.ok ? (await res.json()).items ?? [] : [];
    } catch {
      curated = [];
    }
    renderWall();
  }

  function card(item, mine) {
    const li = document.createElement('li');
    li.className = `exp-card${mine ? ' is-mine' : ''}`;
    if (item.photo) {
      const img = document.createElement('img');
      img.src = item.photo;
      img.alt = t(lang(), 'expPhotoAlt', { name: item.name ?? t(lang(), 'expAnon') });
      li.append(img);
    }
    const body = document.createElement('div');
    const who = document.createElement('p');
    who.className = 'exp-who';
    who.textContent = `${item.name ?? t(lang(), 'expAnon')}${item.place ? ` · ${item.place}` : ''}`;
    const text = document.createElement('p');
    text.textContent = item.comment;
    body.append(who, text);
    if (item.summary) {
      const sum = document.createElement('p');
      sum.className = 'field-help';
      sum.textContent = item.summary;
      body.append(sum);
    }
    if (item.audio) {
      const au = document.createElement('audio');
      au.controls = true;
      au.preload = 'none';
      au.src = item.audio;
      body.append(au);
    }
    if (mine) {
      const tag = document.createElement('p');
      tag.className = 'exp-tag';
      tag.textContent = t(lang(), item.sent ? 'expMineSent' : 'expMineLocal');
      body.append(tag);
    }
    li.append(body);
    return li;
  }

  function renderWall() {
    const mine = readLocal().map((i) => card(i, true));
    const others = (curated ?? []).map((i) => card(i, false));
    wall.replaceChildren(...mine, ...others);
    if (!mine.length && !others.length) {
      const li = document.createElement('li');
      li.className = 'field-help';
      li.textContent = t(lang(), 'expEmpty');
      wall.append(li);
    }
  }

  function render() {
    if (statusKey) status.textContent = t(lang(), statusKey);
    if (recKey) recStatus.textContent = t(lang(), recKey);
    if (dialog.open) renderWall();
  }

  return { render, open };
}
