// Panel "Tu historia": el relato personal que avanza con la musica.
// Lee el estado del relato (store.history.playing / ended) y muestra las
// frases de ese momento palabra por palabra (src/history/life-story.js),
// mueve la linea de tu vida y, al terminar, abre la pregunta final.
import { lifeLines, lifeTimeline, endQuestion } from '../history/life-story.js';

const COOL = [124, 198, 255];
const WARM = [255, 138, 61];
const mixColor = (w) => `rgb(${COOL.map((c, i) => Math.round(c + (WARM[i] - c) * (w ?? 0))).join(',')})`;

export function createLifeStory({ store, narrator = null, controller = null }) {
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
  let currentMoment = 'idle';
  let speakingFor = null;
  // Cuando la voz de un momento termina, el relato sigue (sin hueco): una
  // pausa corta y pasa al siguiente momento.
  narrator?.onChange?.(({ speaking }) => {
    if (speaking) {
      speakingFor = currentMoment;
      return;
    }
    const was = speakingFor;
    speakingFor = null;
    if (!['a', 'n', 'b'].includes(was) || was !== currentMoment) return;
    // Si la voz termino antes de que empiece la musica (el globo aun carga),
    // se reintenta hasta que la musica suene.
    const tryAdvance = (left) => {
      if (currentMoment !== was) return;
      if (!controller?.advanceAuto?.() && left > 0 && store.get().history.playing?.phase === 'loading') setTimeout(() => tryAdvance(left - 1), 500);
    };
    setTimeout(() => tryAdvance(10), 900);
  });

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
  const rateFor = (moment) => (moment === 'interlude' ? 0.85 : 0.9);
  const sayText = (moment, ctx) => {
    const lines = lifeLines(moment, ctx).map((segs) => segs.map((s) => s.text).join(''));
    if (moment === 'end') lines.push(endQuestion(ctx.lang));
    return lines.join(' ');
  };

  /** Momento a mostrar segun lo que suena. */
  function momentOf(h) {
    const p = h.playing;
    if (p) {
      // Silencio antes del presente: 'Ahora escucha como suena hoy'.
      if (p.phase === 'gap' && p.auto && p.epoch === 'b') return 'interlude';
      if (p.phase === 'gap') return lastMoment;
      // Mientras el globo carga la epoca, la frase y la voz ya empiezan: sin hueco.
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
    currentMoment = moment;
    if (moment !== 'interlude') lastMoment = moment;
    const key = `${result.key}|${state.lang}|${moment}|${Boolean(data)}`;
    const ctx = { result, data, lang: state.lang };
    // Descarga por adelantado la voz de todos los momentos (en fila).
    const pk = `${result.key}|${state.lang}|${Boolean(data)}`;
    if (data && pk !== preloadKey && voiceOn(state)) {
      preloadKey = pk;
      for (const m of ['a', 'n', 'interlude', 'b', 'end']) narrator.preload?.(sayText(m, ctx), state.lang, { rate: rateFor(m) });
    }
    if (key !== shownKey) {
      const changedMoment = !shownKey.includes(`|${moment}|`);
      shownKey = key;
      renderWords(lifeLines(moment, ctx));
      setProgress(moment);
      // Narra solo al cambiar de momento mientras suena el relato (no al
      // cambiar de idioma ni con el panel en reposo).
      if (moment !== 'idle' && changedMoment && (h.playing || moment === 'end') && voiceOn(state)) {
        narrator.speak(sayText(moment, ctx), state.lang, { rate: rateFor(moment) });
      }
    }
    if (closing) {
      const show = moment === 'end' || !closing.hidden;
      closing.hidden = !show;
      const q = $('future-q');
      if (q) q.textContent = endQuestion(state.lang);
    }
  }

  $('future-save')?.addEventListener('click', () => {
    const msg = $('future-msg')?.value.trim() ?? '';
    document.dispatchEvent(new CustomEvent('misti:open-experience', { detail: { comment: msg } }));
  });
  // Una consulta nueva vuelve al principio del relato.
  document.addEventListener('misti:submit', () => {
    lastMoment = 'idle';
    shownKey = '';
    if (closing) closing.hidden = true;
    const ta = $('future-msg');
    if (ta) ta.value = '';
  });

  return { render };
}
