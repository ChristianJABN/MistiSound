// Controlador de "Tu historia con la Tierra": consulta atomica de las dos
// epocas y reproduccion antes/despues (o secuencia automatica opt-in) con el
// mismo mezclador, semilla, estilo, tempo, ganancia y duracion. Sin DOM: la
// pestana (ui/history-panel.js) solo pinta el estado y llama estos metodos.
//
// Cancelacion: una consulta nueva, salir de la pestana, Detener, silencio
// global, o cualquier cambio del borrador (lugar/fecha) o accion directa del
// usuario sobre globo/linea de tiempo (cancelQuery) invalidan (token)
// cualquier carga, temporizador o audio pendiente ANTES de que escriba en el
// store. Cada epoca espera a que el globo/linea de tiempo confirmen su
// periodo (onShowEpoch devuelve una promesa) antes de sonar. Sin autoplay.
import { createHistoryState } from '../state/store.js';
import { createActionCoordinator, runGuardedAction } from '../app/action-coordinator.js';
import {
  validateBirth,
  validatePlace,
  loadHistoryResult,
  epochAnnouncement,
  buildStory
} from './history-core.js';
import { validateBirthday, loadStoryResult, storyAnnouncement, buildBirthdayStory, PAST_FIRST_YEAR } from './story-core.js';

/** Texto de cada epoca: relato de cumpleanos (Misti Sound) o comparacion clasica. */
function announce(result, which, lang) {
  return result.story ? storyAnnouncement(result, which, lang) : epochAnnouncement(result, which, lang);
}

export const EPOCH_GAP_MS = 1000;
// Silencio antes del presente en el relato de cumpleanos ('Ahora escucha
// como suena hoy'): el contraste se siente mas despues de una pausa.
export const STORY_INTERLUDE_MS = 1200;

export function createHistoryController({
  store,
  repository,
  audioEngine,
  narrator,
  createMixer,
  onShowPoint,
  onShowEpoch,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
  gapMs = EPOCH_GAP_MS,
  interludeMs = STORY_INTERLUDE_MS,
  // Relato de cumpleanos: el narrador habla ANTES de la musica de cada
  // momento (devuelve una promesa que se cumple al terminar la voz).
  introduceEpoch = null
}) {
  const coordinator = createActionCoordinator();
  let playToken = 0;
  // Momento que suena ahora (para adelantar el relato cuando termina la voz).
  let musicCtx = null;
  let gapTimer = null;
  let mixer = null;

  function patch(fields) {
    store.set((s) => ({ history: { ...s.history, ...fields } }));
  }

  function latestPeriod() {
    const periods = repository.availablePeriods;
    return periods[periods.length - 1] ?? null;
  }

  function silence() {
    playToken += 1;
    if (gapTimer !== null) {
      clearTimeoutFn(gapTimer);
      gapTimer = null;
    }
    mixer?.stop();
    narrator?.cancel();
  }

  /** Corta audio/voz/temporizadores. No toca la consulta ni el resultado. */
  function stop() {
    const wasActive = store.get().history.playing !== null;
    silence();
    if (wasActive || store.get().history.playError) patch({ playing: null, ended: false, playError: null });
  }

  function ensureMixer() {
    if (!mixer) {
      mixer = createMixer();
      mixer.setChannel('rain', { enabled: false });
      mixer.setChannel('ice', { enabled: false });
    }
    return mixer;
  }

  function canSound(s) {
    if (!s.history.result || s.history.status !== 'ready') return 'noResult';
    if (!audioEngine.isStarted()) return 'audioOff';
    if (s.audio.muted) return 'muted';
    if (s.activeTab !== 'history') return 'tab';
    return null;
  }

  function abortPlay(extra = {}) {
    patch({ playing: null, ended: false, ...extra });
  }

  async function beginEpoch(which, auto, kind, { mode = null, layer = null } = {}) {
    const s0 = store.get();
    const blocked = canSound(s0);
    if (blocked) return { ok: false, reason: blocked };
    const epoch = s0.history.result[which];
    if (epoch.value === null) return { ok: false, reason: 'noData' };
    silence();
    const token = playToken;
    // Relato automatico: la voz del momento empieza YA, mientras el globo
    // carga la epoca; la musica espera a que la voz termine.
    const narrate = auto && !mode && introduceEpoch && s0.history.result?.story;
    patch({ playing: { epoch: which, auto, phase: narrate ? 'narration' : 'loading' }, lastPlay: kind, ended: false, playError: null, viewing: which });
    const narration = narrate ? Promise.resolve().then(() => introduceEpoch({ which, result: s0.history.result })).catch(() => {}) : null;

    // El globo y la linea de tiempo deben confirmar ESTA epoca antes de que
    // suene o hable nada; un fallo o una orden posterior no deja musica tardia.
    let shown = { ok: true };
    if (onShowEpoch) {
      try {
        shown = (await onShowEpoch(epoch.period, { which, epoch, result: s0.history.result })) ?? { ok: true };
      } catch {
        shown = { ok: false, reason: 'error' };
      }
    }
    if (token !== playToken) return { ok: false, reason: 'stale' };
    if (!shown.ok) {
      abortPlay({ playError: 'epoch' });
      return { ok: false, reason: 'epochError' };
    }
    const s = store.get();
    const stillBlocked = canSound(s);
    if (stillBlocked) {
      abortPlay();
      return { ok: false, reason: stillBlocked };
    }
    // Primero la voz, luego la musica (solo en el relato automatico).
    if (narration) {
      await narration;
      if (token !== playToken) return { ok: false, reason: 'stale' };
      const blockedAfter = canSound(store.get());
      if (blockedAfter) {
        abortPlay();
        return { ok: false, reason: blockedAfter };
      }
    }
    try {
      const m = ensureMixer();
      m.setSeed(s.dj.seed || 'earth-jukebox');
      m.updateData({ temperature: epoch.value, rain: null, ice: null });
      // Reproductor del relato (Misti Sound): pasado lento y estable, presente
      // con un latido por anio que se acelera. Opcional: el mezclador clasico no lo tiene.
      m.setStoryEpoch?.({ which, epoch, pastValue: s.history.result.a.value, result: s.history.result, layers: s.history.layers?.data ?? null, mode, layer });
      m.setMusicMuted?.(Boolean(s.history.musicMuted));
      patch({ playing: { epoch: which, auto, phase: 'music' } });
      // En el relato de cumpleanos la voz la pone "Tu historia" (life-ui.js).
      if (s.history.voice && !mode && !s.history.result?.story) {
        narrator?.speak(announce(s.history.result, which, s.lang), s.lang, { rate: which === 'a' ? 0.88 : which === 'n' ? 0.92 : 0.97 });
      }
      m.start({ mode: 'composition', onEnd: () => handleEnd(which, auto, token) });
      musicCtx = { which, auto, token, at: Date.now() };
    } catch (err) {
      console.error('No se pudo iniciar la escucha', err);
      silence();
      abortPlay({ playError: 'start' });
      return { ok: false, reason: 'startError' };
    }
    return { ok: true };
  }

  /**
   * Relato automatico: cuando el relator termina, no esperar a que acabe la
   * musica. La pieza se apaga suave y pasa al siguiente momento, pero cada
   * momento suena al menos `minMs` para que se oiga.
   */
  function advanceAuto({ minMs = 5000, fadeSeconds = 0.9 } = {}) {
    const ctx = musicCtx;
    const p = store.get().history.playing;
    if (!ctx || !ctx.auto || ctx.token !== playToken || !p || p.phase !== 'music' || p.epoch !== ctx.which) return false;
    const wait = Math.max(0, minMs - (Date.now() - ctx.at));
    setTimeoutFn(() => {
      const now = store.get().history.playing;
      if (ctx.token !== playToken || musicCtx !== ctx || !now || now.phase !== 'music') return;
      musicCtx = null;
      mixer?.fadeOut ? mixer.fadeOut(fadeSeconds) : mixer?.stop();
      handleEnd(ctx.which, ctx.auto, ctx.token);
    }, wait);
    return true;
  }

  function handleEnd(which, auto, token) {
    if (token !== playToken) return;
    musicCtx = null;
    const res = store.get().history.result;
    // Secuencia: 1950 -> tu anio (si hay) -> ultimos 5 anios.
    const next = auto ? (which === 'a' ? (res?.n && res.n.value !== null ? 'n' : 'b') : which === 'n' ? 'b' : null) : null;
    if (next) {
      patch({ playing: { epoch: next, auto: true, phase: 'gap' } });
      gapTimer = setTimeoutFn(() => {
        gapTimer = null;
        if (token !== playToken) return undefined;
        return beginEpoch(next, true, 'auto').then((started) => {
          const failedWithState = ['stale', 'epochError', 'startError'].includes(started.reason);
          if (!started.ok && !failedWithState) patch({ playing: null, ended: true });
          return started;
        });
      }, next === 'b' && res?.story ? Math.max(gapMs, interludeMs) : gapMs);
      return;
    }
    patch({ playing: null, ended: true });
    // El cierre del relato de cumpleanos lo narra el panel "Tu historia" (life-ui.js).
  }

  async function play(which) {
    if (!['a', 'b', 'n'].includes(which)) return { ok: false, reason: 'invalid' };
    if (which === 'n' && !store.get().history.result?.n) return { ok: false, reason: 'noData' };
    return beginEpoch(which, false, which);
  }

  /** [3] Mezclar ambos tiempos: antes (izquierda) y ahora (derecha) a la vez. */
  async function playMix() {
    const result = store.get().history.result;
    if (!result?.story) return { ok: false, reason: 'noResult' };
    return beginEpoch('b', false, 'mix', { mode: 'mix' });
  }

  /** "Oir sonido" de una tarjeta: solo esa capa, antes y luego ahora. */
  async function playLayer(layer) {
    const result = store.get().history.result;
    if (!result?.story) return { ok: false, reason: 'noResult' };
    if (!['co2', 'ozone', 'temp'].includes(layer)) return { ok: false, reason: 'invalid' };
    return beginEpoch('b', false, `layer:${layer}`, { mode: 'solo', layer });
  }

  /** Tecla M: silencia la musica pero deja la voz. */
  function setMusicMuted(muted) {
    patch({ musicMuted: Boolean(muted) });
    mixer?.setMusicMuted?.(Boolean(muted));
  }

  async function playAuto() {
    const result = store.get().history.result;
    if (!result) return { ok: false, reason: 'noResult' };
    if (result.a.value === null || result.b.value === null) return { ok: false, reason: 'noData' };
    return beginEpoch('a', true, 'auto');
  }

  async function repeat() {
    const last = store.get().history.lastPlay;
    if (last === 'auto') return playAuto();
    if (last === 'mix') return playMix();
    if (typeof last === 'string' && last.startsWith('layer:')) return playLayer(last.slice(6));
    if (last === 'a' || last === 'b') return play(last);
    return { ok: false, reason: 'nothing' };
  }

  function setVoice(enabled) {
    patch({ voice: Boolean(enabled) });
    if (!enabled) narrator?.cancel();
  }

  /** Lee el relato completo con voz: accion explicita (opt-in), respeta mute. */
  function speakStory() {
    const s = store.get();
    const result = s.history.result;
    if (!result) return { ok: false, reason: 'noResult' };
    if (s.audio.muted) return { ok: false, reason: 'muted' };
    if (!narrator?.isSupported()) return { ok: false, reason: 'unsupported' };
    silence();
    patch({ playing: null, ended: false });
    const lines = result.story ? buildBirthdayStory(result, s.lang) : buildStory(result, s.lang, { latestPeriod: latestPeriod() });
    narrator.speak(lines.join(' '), s.lang, { rate: 0.92 });
    return { ok: true };
  }

  async function run({ point, placeLabel, periodA, periodB, loader }) {
    silence();
    patch({ status: 'loading', error: null, result: null, playing: null, lastPlay: null, ended: false, playError: null });
    const outcome = await runGuardedAction(coordinator, {
      run: loader ?? (() => loadHistoryResult({ repository, point, periodA, periodB, placeLabel })),
      onSuccess: ({ result }) => {
        patch({ status: 'ready', error: null, result });
        onShowPoint?.(result.point.lat, result.point.lon);
      }
    });
    if (outcome.applied) return { ok: true, result: outcome.result.result };
    if (outcome.reason === 'stale') return { ok: false, reason: 'stale' };
    patch({ status: 'error', error: outcome.reason, result: null });
    return { ok: false, reason: outcome.reason };
  }

  /** Formulario: lugar elegido + mes/ano de nacimiento. Devuelve el error de validacion o la promesa de la consulta. */
  function submit({ place, year, month }) {
    const placeCheck = validatePlace(place);
    if (!placeCheck.ok) return Promise.resolve({ ok: false, reason: 'noPlace', field: 'place' });
    const birth = validateBirth({ year, month }, repository.availablePeriods);
    if (!birth.ok) return Promise.resolve({ ...birth, field: 'birth' });
    return run({
      point: { lat: place.lat, lon: place.lon },
      placeLabel: place.label ?? null,
      periodA: birth.period,
      periodB: latestPeriod()
    });
  }

  /**
   * Relato de cumpleanos (Misti Sound): lugar + dia/mes (ano opcional).
   * Compara la decada de 1950 con los ultimos 5 anios del mismo mes. Sin audio:
   * al terminar la consulta el globo muestra el pasado (viewEpoch('a')).
   */
  async function submitStory({ place, day, month, year, requireYear = false }) {
    const placeCheck = validatePlace(place);
    if (!placeCheck.ok) return { ok: false, reason: 'noPlace', field: 'place' };
    if (requireYear && String(year ?? '').trim() === '') return { ok: false, reason: 'emptyYear', field: 'birth' };
    const birthday = validateBirthday({ day, month, year }, repository.availablePeriods);
    if (!birthday.ok) return { ...birthday, field: 'birth' };
    return runStory({ point: { lat: place.lat, lon: place.lon }, placeLabel: place.label ?? null, ...birthday });
  }

  async function runStory({ point, placeLabel, day, month, year }) {
    const out = await run({
      point,
      placeLabel,
      loader: () => loadStoryResult({ repository, point, day, month, year, placeLabel })
    });
    if (out.ok) viewEpoch('a');
    return out;
  }

  /**
   * Muestra una epoca en el globo y la linea de tiempo SIN sonido (botones
   * "Ver en el globo"). Ignora el resultado si llega tarde.
   */
  async function viewEpoch(which) {
    const s = store.get();
    const result = s.history.result;
    if (!result || s.history.status !== 'ready' || !['a', 'b', 'n'].includes(which) || !result[which]) return { ok: false, reason: 'noResult' };
    patch({ viewing: which });
    if (!onShowEpoch) return { ok: true };
    try {
      return (await onShowEpoch(result[which].period, { which, epoch: result[which], result, silent: true })) ?? { ok: true };
    } catch {
      return { ok: false, reason: 'epochError' };
    }
  }

  /** Enlace compartido: punto y dos periodos. Sin audio. */
  function applyShared({ point, a, b }) {
    const placeCheck = validatePlace(point);
    if (!placeCheck.ok) return Promise.resolve({ ok: false, reason: 'noPlace', field: 'place' });
    if (!repository.hasPeriod(a) || !repository.hasPeriod(b)) {
      return Promise.resolve({ ok: false, reason: 'notAvailable', field: 'birth' });
    }
    // Un relato de cumpleanos se comparte como (1950-MM, ultimo MM): el enlace
    // nunca lleva el dia exacto ni el nombre del lugar.
    if (a === `${PAST_FIRST_YEAR}-${b.slice(5, 7)}` && a.slice(5, 7) === b.slice(5, 7)) {
      return runStory({ point: { lat: point.lat, lon: point.lon }, placeLabel: null, day: null, month: Number(a.slice(5, 7)), year: null });
    }
    return run({ point: { lat: point.lat, lon: point.lon }, placeLabel: null, periodA: a, periodB: b });
  }

  /**
   * Invalida consulta en vuelo, audio y resultado (conserva el borrador del
   * formulario, que vive en el panel). Sin efecto si no hay nada activo: asi
   * un clic en el globo en reposo no corta otras narraciones.
   */
  function cancelQuery() {
    const h = store.get().history;
    if (h.status === 'idle' && !h.playing && !h.playError) return;
    coordinator.startAction();
    silence();
    patch({ status: 'idle', error: null, result: null, playing: null, lastPlay: null, ended: false, playError: null });
  }

  /** "Borrar mi historia": quita resultado y deja el estado inicial. */
  function clear() {
    coordinator.startAction();
    silence();
    store.set((s) => ({ history: { ...createHistoryState(), voice: s.history.voice } }));
  }

  /** Llamar desde el render del store: aplica las reglas de salida de pestana y silencio. */
  let wasOnHistory = true;
  function enforce(state) {
    const h = state.history;
    const onHistory = state.activeTab === 'history';
    if (wasOnHistory && !onHistory) narrator?.cancel();
    wasOnHistory = onHistory;
    if (!onHistory) {
      if (h.status === 'loading') cancelQuery();
      else if (h.playing) stop();
      return;
    }
    if (h.playing && state.audio.muted) stop();
  }

  return { submit, submitStory, viewEpoch, playMix, playLayer, setMusicMuted, applyShared, play, playAuto, repeat, stop, speakStory, setVoice, cancelQuery, clear, enforce, advanceAuto };
}
