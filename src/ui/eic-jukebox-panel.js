// Pestana "Jukebox EIC": eliges un mapa oficial del Earth Information Center
// (NASA SVS), la app lee sus colores con la leyenda de la propia imagen y lo
// toca de oeste a este mientras un cursor recorre el mapa. Todo lo que suena
// tambien se describe en texto (aria-live) y, si la persona lo pide, en voz.
// Frames y metodo: scripts/prepare_eic_frames.mjs, docs/eic-jukebox.md.
import { t } from '../i18n/index.js';
import { analyzeFrame } from '../eic/frame-analysis.js';
import { planFrameSong } from '../eic/frame-sonification.js';
import { describeFrame, describeSoundRule, describeColumn } from '../eic/frame-describe.js';
import { EicFramePlayer } from '../eic/frame-player.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'i18n') node.setAttribute('data-i18n', v);
    else if (k === 'className') node.className = v;
    else if (k === 'htmlFor') node.htmlFor = v;
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function loadPixels(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ data, width, height });
    };
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

export function createEicJukeboxPanel({ store, audioEngine, narrator }) {
  const root = document.getElementById('jukebox-panel');
  if (!root) return { render: () => {}, stop: () => {} };

  const base = import.meta.env.BASE_URL;
  const player = new EicFramePlayer({ ToneLib: audioEngine.Tone, getBus: () => audioEngine.getBus() });

  const frameGroup = el('div', { className: 'eic-frame-picker', role: 'group', id: 'eic-frame-picker' });
  const image = el('img', { id: 'eic-jukebox-img', alt: '', width: 960, height: 540, decoding: 'async' });
  const cursor = el('div', { className: 'eic-cursor', 'aria-hidden': 'true', hidden: true });
  const stage = el('div', { className: 'eic-stage' }, [image, cursor]);
  const caption = el('figcaption', { id: 'eic-jukebox-caption' });
  const figure = el('figure', { className: 'eic-figure' }, [stage, caption]);

  const playBtn = el('button', { type: 'button', className: 'action-btn', id: 'eic-play-btn', i18n: 'eicPlayFrame' });
  const stopBtn = el('button', { type: 'button', className: 'secondary-btn', id: 'eic-stop-btn', i18n: 'eicStopFrame', disabled: true });
  const speakBtn = el('button', { type: 'button', className: 'secondary-btn', id: 'eic-speak-btn', i18n: 'eicSpeakFrame' });
  const followInput = el('input', { type: 'checkbox', id: 'eic-follow' });
  const followLabel = el('label', { htmlFor: 'eic-follow', i18n: 'eicFollowLabel' });
  const actions = el('div', { className: 'eic-actions' }, [playBtn, stopBtn, speakBtn]);
  const follow = el('div', { className: 'checkbox-row' }, [followInput, followLabel]);

  const status = el('p', { id: 'eic-jukebox-status', role: 'status' });
  const descTitle = el('h3', { i18n: 'eicWhatItSees' });
  const descList = el('ul', { id: 'eic-jukebox-description', className: 'eic-description' });
  const ruleEl = el('p', { id: 'eic-sound-rule' });
  const live = el('p', { className: 'sr-only', 'aria-live': 'polite', id: 'eic-column-live' });

  const methodNote = el('p', { i18n: 'eicMethodNote' });
  const sourceLink = el('a', { id: 'eic-jukebox-source', target: '_blank', rel: 'noopener' });
  const creditEl = el('p', { className: 'eic-credit' });
  const method = el('details', { className: 'eic-method' }, [
    el('summary', { i18n: 'eicMethodTitle' }),
    ruleEl,
    methodNote,
    creditEl,
    sourceLink
  ]);

  root.replaceChildren(
    el('h2', { i18n: 'eicJukeboxTitle' }),
    el('p', { i18n: 'eicJukeboxIntro' }),
    el('p', { className: 'eic-picker-label', id: 'eic-picker-label', i18n: 'eicPickFrame' }),
    frameGroup,
    figure,
    actions,
    follow,
    status,
    descTitle,
    descList,
    method,
    live
  );
  frameGroup.setAttribute('aria-labelledby', 'eic-picker-label');

  let frames = [];
  let selectedId = null;
  let generation = 0;
  const analyses = new Map();
  let statusKey = null;
  let statusVars = {};

  const frameById = (id) => frames.find((f) => f.id === id) ?? null;
  const lang = () => store.get().lang;

  function setStatus(key, vars = {}) {
    statusKey = key;
    statusVars = vars;
    status.textContent = key ? t(lang(), key, vars) : '';
  }

  function renderPicker() {
    frameGroup.replaceChildren(
      ...frames.map((f) => {
        const b = el('button', { type: 'button', className: 'eic-frame-btn', 'aria-pressed': String(f.id === selectedId) });
        b.textContent = String(f.year);
        b.title = lang() === 'en' ? f.period.label_en : f.period.label_es;
        b.addEventListener('click', () => select(f.id));
        return b;
      })
    );
  }

  function renderTexts() {
    const frame = frameById(selectedId);
    if (!frame) return;
    const l = lang();
    const period = l === 'en' ? frame.period.label_en : frame.period.label_es;
    image.alt = t(l, 'eicJukeboxAlt', { period });
    caption.textContent = t(l, 'eicJukeboxCaption', { period, svs: frame.svs_id });
    creditEl.textContent = t(l, 'eicJukeboxCredit', { credit: frame.credit });
    sourceLink.textContent = t(l, 'eicJukeboxSource', { title: frame.page_title });
    sourceLink.href = frame.page_url;
    const analysis = analyses.get(frame.id);
    descList.replaceChildren(...(analysis ? describeFrame(analysis, frame, l) : []).map((line) => el('li', {}, [line])));
    ruleEl.textContent = analysis ? describeSoundRule(analysis.columns.length, l) : '';
    if (statusKey) status.textContent = t(l, statusKey, statusVars);
    for (const [i, b] of [...frameGroup.children].entries()) {
      b.title = l === 'en' ? frames[i].period.label_en : frames[i].period.label_es;
    }
  }

  function updateButtons() {
    const ready = analyses.has(selectedId);
    playBtn.disabled = !ready || player.isPlaying();
    stopBtn.disabled = !player.isPlaying();
    speakBtn.disabled = !ready || !narrator?.isSupported?.();
  }

  async function select(id) {
    const frame = frameById(id);
    if (!frame) return;
    stop();
    selectedId = id;
    const myGen = ++generation;
    renderPicker();
    image.src = `${base}${frame.file}`;
    renderTexts();
    updateButtons();
    if (!analyses.has(id)) {
      setStatus('eicAnalyzing');
      try {
        const pixels = await loadPixels(`${base}${frame.file}`);
        const analysis = analyzeFrame(pixels, frame);
        analyses.set(id, analysis);
      } catch (err) {
        console.error(err);
        if (myGen === generation) setStatus('eicFrameLoadError');
        return;
      }
      if (myGen !== generation) return;
    }
    setStatus('eicReady');
    renderTexts();
    updateButtons();
  }

  function moveCursor(index, total) {
    const frame = frameById(selectedId);
    if (!frame) return;
    const { x0, x1 } = frame.map;
    const left = ((x0 + ((x1 - x0) * index) / total) / frame.width) * 100;
    cursor.style.left = `${left}%`;
    cursor.style.width = `${((x1 - x0) / total / frame.width) * 100}%`;
    cursor.hidden = false;
  }

  async function play() {
    const frame = frameById(selectedId);
    const analysis = analyses.get(selectedId);
    if (!frame || !analysis) return;
    if (!audioEngine.isStarted()) {
      try {
        await audioEngine.start();
        store.set((s) => ({ audio: { ...s.audio, started: true } }));
      } catch {
        setStatus('eicAudioError');
        return;
      }
    }
    narrator?.cancel();
    const plan = planFrameSong(analysis);
    const total = plan.columns.length;
    const ok = player.play(plan, {
      onColumn: (i) => {
        moveCursor(i, total);
        if (followInput.checked) live.textContent = describeColumn(analysis.columns[i], lang());
      },
      onEnd: () => {
        cursor.hidden = true;
        setStatus('eicFinished');
        updateButtons();
      }
    });
    if (!ok) {
      setStatus('eicAudioError');
      return;
    }
    setStatus(store.get().audio.muted ? 'eicPlayingMuted' : 'eicPlaying', { seconds: Math.round(plan.duration) });
    updateButtons();
  }

  function stop() {
    if (!player.isPlaying()) return;
    player.stop({ silent: true });
    cursor.hidden = true;
    setStatus('eicStopped');
    updateButtons();
  }

  function speak() {
    const frame = frameById(selectedId);
    const analysis = analyses.get(selectedId);
    if (!frame || !analysis) return;
    const l = lang();
    const text = [...describeFrame(analysis, frame, l), describeSoundRule(analysis.columns.length, l)].join(' ');
    narrator.speak(text, l);
  }

  playBtn.addEventListener('click', play);
  stopBtn.addEventListener('click', stop);
  speakBtn.addEventListener('click', speak);

  async function loadManifest() {
    try {
      const res = await fetch(`${base}data/eic/frames.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      frames = Array.isArray(json.frames) ? [...json.frames].sort((a, b) => a.year - b.year) : [];
    } catch (err) {
      console.error('No se pudo cargar data/eic/frames.json', err);
      setStatus('eicFrameLoadError');
      return;
    }
    renderPicker();
    // El frame se descarga y analiza recien al abrir la pestana (no en el arranque).
    if (store.get().activeTab === 'jukebox' && frames.length) select(frames[frames.length - 1].id);
  }

  let lastTab = null;
  function render(state) {
    if (state.activeTab !== lastTab) {
      if (lastTab === 'jukebox') stop();
      if (state.activeTab === 'jukebox' && selectedId === null && frames.length) select(frames[frames.length - 1].id);
      lastTab = state.activeTab;
    }
    renderTexts();
    updateButtons();
  }

  loadManifest();
  return { render, stop };
}
