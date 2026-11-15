// Panel "Tu historia": el relato personal que avanza con la musica.
// Lee el estado del relato (store.history.playing / ended) y muestra las
// frases de ese momento palabra por palabra (src/history/life-story.js),
// mueve la linea de tu vida y, al terminar, abre la pregunta final.
import { lifeLines, lifeTimeline, endQuestion } from '../history/life-story.js';
import { t } from '../i18n/index.js';

const COOL = [124, 198, 255];
const WARM = [255, 138, 61];
const mixColor = (w) => `rgb(${COOL.map((c, i) => Math.round(c + (WARM[i] - c) * (w ?? 0))).join(',')})`;

export function createLifeStory({ store, narrator = null, postComment = null }) {
  const $ = (id) => document.getElementById(id);
  const textEl = $('life-text');
  const timeline = $('life-timeline');
  const closing = $('life-closing');
  if (!textEl || !timeline) return { render() {} };
  const line = timeline.querySelector('.life-line');
  const progress = timeline.querySelector('.life-progress');
  let shownKey = '';
  let timelineKey = '';
  let lastMoment = 'idle';
  let points = [];
  let preloadKey = '';
  // El relator lee "Tu historia" (igual que la intro): respeta el silencio y
  // la preferencia guardada de apagar la voz.
  const voiceOn = (state) => {
    if (!narrator || state.audio?.muted) return false;
    try {
      if (localStorage.getItem('misti-intro-voice') === 'off') return false;
    } catch {
      /* sin almacenamiento */
    }
    return narrator.isSupported?.() ?? true;
  };
  const sayText = (moment, ctx) => {
    const lines = lifeLines(moment, ctx).map((segs) => segs.map((s) => s.text).join(''));
    if (moment === 'end') lines.push(endQuestion(ctx.lang));
    return lines.join(' ');
  };

  /** Momento a mostrar segun lo que suena. */
  function momentOf(h) {
    const p = h.playing;
    if (p) {
      if (p.phase === 'gap') return lastMoment;
      // Carga del globo, voz del narrador y luego la musica: la misma frase.
      return p.epoch;
    }
    if (h.ended && h.lastPlay === 'auto') return 'end';
    return lastMoment;
  }

  function renderWords(lines) {
    textEl.replaceChildren();
    let i = 0;
    lines.forEach((segs, li) => {
      const p = document.createElement('p');
      p.className = 'life-sentence';
      for (const seg of segs) {
        for (const part of seg.text.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            p.append(part);
            continue;
          }
          const w = document.createElement('span');
          w.className = seg.hl ? 'life-word life-hl' : 'life-word';
          // Cada frase empieza cuando la anterior termino de aparecer.
          w.style.setProperty('--d', `${li * 1.4 + i * 0.09}s`);
          w.textContent = part;
          p.append(w);
          i += 1;
        }
      }
      textEl.append(p);
    });
  }

  function renderTimeline(state, result, data) {
    const key = `${result.key}|${state.lang}|${Boolean(data?.co2)}`;
    if (key === timelineKey) return;
    timelineKey = key;
    points = lifeTimeline({ result, data, lang: state.lang });
    for (const el of line.querySelectorAll('.life-point')) el.remove();
    for (const p of points) {
      const el = document.createElement('div');
      el.className = 'life-point';
      el.dataset.key = p.key;
      el.style.left = `${p.x * 100}%`;
      el.style.setProperty('--c', mixColor(p.warmth));
      if (p.ppm) el.title = `CO₂ ${Math.round(p.ppm)} ppm (${p.year})`;
      const label = document.createElement('span');
      label.textContent = p.label;
      el.append(label);
      line.append(el);
    }
  }

  function setProgress(moment) {
    const birth = points.find((p) => p.key === 'n');
    const x = { idle: 0, a: 0.04, n: birth?.x ?? 0.5, interlude: birth?.x ?? 0.5, b: 1, end: 1 }[moment] ?? 0;
    progress.style.width = `${x * 100}%`;
    for (const el of line.querySelectorAll('.life-point')) {
      const k = el.dataset.key;
      el.classList.toggle('is-active', k === moment || (moment === 'end' && k === 'b'));
      const px = points.find((p) => p.key === k)?.x ?? 0;
      el.classList.toggle('is-past', px <= x + 1e-6);
    }
  }

  function render(state) {
    const h = state.history;
    const result = h.status === 'ready' && h.result?.story ? h.result : null;
    if (!result) {
      shownKey = '';
      if (closing) closing.hidden = true;
      return;
    }
    const data = h.layers?.key === result.key ? h.layers?.data : null;
    renderTimeline(state, result, data);
    const moment = momentOf(h);
    lastMoment = moment;
    const key = `${result.key}|${state.lang}|${moment}|${Boolean(data)}`;
    const ctx = { result, data, lang: state.lang };
    // Descarga por adelantado la voz de todos los momentos (en fila).
    // Solo con los datos completos: el texto precargado debe ser igual al narrado.
    const layersReady = h.layers?.key === result.key && h.layers?.status !== 'loading';
    const pk = `${result.key}|${state.lang}|${layersReady}`;
    if (data && layersReady && pk !== preloadKey && voiceOn(state)) {
      preloadKey = pk;
      for (const m of ['a', 'n', 'b', 'end']) narrator.preload?.(sayText(m, ctx), state.lang, { rate: 0.9 });
    }
    if (key !== shownKey) {
      const changedMoment = !shownKey.includes(`|${moment}|`);
      shownKey = key;
      renderWords(lifeLines(moment, ctx));
      setProgress(moment);
      // Los momentos con musica los narra narrate() (antes de su musica);
      // aqui solo el cierre.
      if (moment === 'end' && changedMoment && voiceOn(state)) narrator.speak(sayText(moment, ctx), state.lang, { rate: 0.9 });
    }
    if (closing) {
      const show = moment === 'end' || !closing.hidden;
      closing.hidden = !show;
      const q = $('future-q');
      if (q) q.textContent = endQuestion(state.lang);
      const nm = $('future-name');
      if (nm) nm.placeholder = t(state.lang, 'futureNamePlaceholder');
    }
  }

  // Mensaje para quien nace hoy: se publica en la seccion de comentarios.
  $('future-save')?.addEventListener('click', async () => {
    const st = store.get();
    const status = $('future-status');
    const say = (key) => {
      if (status) status.textContent = t(st.lang, key);
    };
    const text = $('future-msg')?.value.trim() ?? '';
    if (!text) return say('futureNeedText');
    const result = st.history.result;
    const btn = $('future-save');
    btn.disabled = true;
    const out = (await postComment?.({
      type: 'future',
      name: $('future-name')?.value.trim() || null,
      place: (result?.placeLabel ?? '').split(',')[0].trim() || null,
      year: result?.birthday?.year ?? null,
      text
    })) ?? { ok: false, error: 'other' };
    btn.disabled = false;
    if (out.ok) {
      $('future-msg').value = '';
      say('futureSaved');
      $('comments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else say(['blocked', 'links', 'rate'].includes(out.error) ? `futureErr_${out.error}` : 'futureErr_other');
  });
  // Una consulta nueva vuelve al principio del relato.
  document.addEventListener('misti:submit', () => {
    lastMoment = 'idle';
    shownKey = '';
    if (closing) closing.hidden = true;
    const ta = $('future-msg');
    if (ta) ta.value = '';
  });

  /**
   * Primero la voz, luego la musica: el controlador llama a esto antes de la
   * musica de cada momento del relato. Se cumple cuando el narrador termina
   * (o tras un tiempo de lectura si no hay voz) para que no se superpongan.
   */
  function narrate({ which }) {
    const st = store.get();
    const result = st.history.result;
    const data = st.history.layers?.key === result?.key ? st.history.layers?.data : null;
    const text = result ? sayText(which, { result, data, lang: st.lang }) : '';
    const readMs = Math.min(9000, 2000 + text.split(/\s+/).length * 300);
    return new Promise((resolve) => {
      let done = false;
      let started = false;
      let off = null;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        off?.();
        clearTimeout(timer);
        setTimeout(resolve, 500); // un respiro antes de la musica
      };
      if (!text || !voiceOn(st)) {
        timer = setTimeout(finish, readMs);
        return;
      }
      off = narrator.onChange?.(({ speaking }) => {
        if (speaking) started = true;
        else if (started) finish();
      }) ?? null;
      const ok = narrator.speak(text, st.lang, { rate: 0.9 });
      // Sin voz disponible: tiempo para leer. Tope de seguridad: 30 s.
      timer = setTimeout(finish, ok === false ? readMs : 30000);
    });
  }

  return { render, narrate };
}
