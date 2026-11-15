// Narracion propia por voz (SpeechSynthesis), OPT-IN: solo habla cuando el
// usuario pulsa "Escuchar historia" explicitamente. Nunca arranca sola, para
// no competir con un lector de pantalla que el usuario ya pueda tener
// activo. Si la API no esta disponible, isSupported() devuelve false y la
// UI debe seguir funcionando solo con el texto (ver ui/peru-panel.js y
// ui/accessible-panel.js: nunca dependen de esto para mostrar informacion).

/**
 * Puntaje de una voz para el relator de Misti Sound: se prefieren las voces
 * neuronales ("Natural", "Neural", "Online" en Edge; "Google" en Chrome;
 * "Premium"/"Enhanced"/Siri en Apple), que suenan humanas y armoniosas, y
 * despues el acento latinoamericano (es-PE > es-419/MX/US > es-ES).
 */
const NARRATOR_VOICES = /(andrew|brian|guy|christopher|davis|eric|roger|steffan|daniel|arthur|jorge|alex|alvaro|álvaro|gerardo|tomas|tomás|lorenzo|mateo|diego|juan|carlos)/i;

export function scoreVoice(v, lang) {
  const l = (v.lang ?? '').toLowerCase().replace('_', '-');
  if (!l.startsWith(lang === 'en' ? 'en' : 'es')) return -1;
  const name = v.name ?? '';
  let s = 0;
  if (/natural|neural/i.test(name)) s += 60;
  if (/online/i.test(name)) s += 20;
  if (/google/i.test(name)) s += 35;
  if (/premium|enhanced|siri/i.test(name)) s += 30;
  if (v.localService === false) s += 8;
  // Timbre de narrador: voces graves y pausadas conocidas (Edge/Windows,
  // Chrome, Apple). Pesa menos que "neural": una voz robotica grave no gana
  // a una natural.
  if (NARRATOR_VOICES.test(name)) s += 25;
  if (lang === 'en') {
    if (l === 'en-us') s += 6;
  } else if (l === 'es-pe') s += 14;
  else if (['es-419', 'es-mx', 'es-us', 'es-co', 'es-cl', 'es-ar'].includes(l)) s += 9;
  else if (l === 'es-es') s += 3;
  return s;
}

export function pickBestVoice(voices, lang) {
  let best = null;
  let bestScore = -1;
  for (const v of voices ?? []) {
    const sc = scoreVoice(v, lang);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return bestScore >= 0 ? best : null;
}

function pickVoice(synth, lang) {
  return pickBestVoice(synth.getVoices(), lang);
}

// Convierte dB (rango de AUDIO_SAFETY, siempre <= 0) a ganancia lineal
// 0..1 para SpeechSynthesisUtterance.volume (que no acepta dB). -Infinity
// (mute real) se mapea a 0 exacto, nunca a un residuo audible.
function dbToLinearVolume(db) {
  if (db === -Infinity || typeof db !== 'number' || !Number.isFinite(db)) return 0;
  // La voz va por encima de la musica (que se atenua mientras habla): el
  // control de volumen la sube o baja, pero sin que llegue a susurrar.
  return Math.min(1, Math.max(0, 0.6 + 0.4 * ((Math.max(-40, Math.min(0, db)) + 40) / 40)));
}

/**
 * Relator de ElevenLabs via /api/tts (funcion del servidor: la clave nunca
 * esta en el navegador). Cachea cada audio por texto+idioma+ritmo y se
 * desactiva para la visita al primer fallo (sitio sin la funcion, sin clave
 * o sin creditos), volviendo a la voz del navegador sin demoras.
 */
export function createCloudVoice({ endpoint = '/api/tts', fetchImpl = (...a) => fetch(...a), timeoutMs = 6000 } = {}) {
  const cache = new Map();
  let disabled = false;
  function key(text, lang, rate) {
    return `${lang}|${Math.round((Number(rate) || 1) * 100)}|${text}`;
  }
  /** Promesa con la URL del audio (object URL) o null si no hay voz en la nube. */
  function load(text, lang, rate = 1) {
    if (disabled || !text) return Promise.resolve(null);
    const k = key(text, lang, rate);
    if (!cache.has(k)) {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
      const p = fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang, rate }),
        signal: ctrl?.signal
      })
        .then(async (res) => {
          if (!res.ok || !(res.headers.get('content-type') || '').includes('audio')) throw new Error(`tts ${res.status}`);
          return URL.createObjectURL(await res.blob());
        })
        .catch(() => {
          disabled = true;
          cache.delete(k);
          return null;
        })
        .finally(() => clearTimeout(timer));
      cache.set(k, p);
    }
    return cache.get(k);
  }
  return { load, preload: load, isDisabled: () => disabled };
}

export function createNarrator({ audioEngine, cloud = null } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let current = null;
  let token = 0;
  let audioEl = null;
  const listeners = new Set();

  if (synth && typeof synth.addEventListener === 'function') {
    // Las voces se cargan de forma asincrona en varios navegadores; no se
    // bloquea nada esperandolas, solo se vuelve a intentar elegir voz
    // cuando el evento llega.
    synth.addEventListener('voiceschanged', () => {});
  }

  function isSupported() {
    return Boolean(synth) || Boolean(cloud && !cloud.isDisabled());
  }

  function isSpeaking() {
    return current !== null;
  }

  function notify(state) {
    for (const fn of listeners) fn(state);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function endCurrent() {
    current = null;
    audioEngine?.setDucked(false);
    notify({ speaking: false });
  }

  /** Cancela cualquier narracion en curso. Restaura el volumen de musica
   * (deja de "duckear") sin tocar el mute del usuario. */
  function cancel() {
    token += 1;
    const wasSpeaking = current !== null;
    if (audioEl) {
      audioEl.pause();
      audioEl = null;
    }
    synth?.cancel();
    if (wasSpeaking) endCurrent();
  }

  /** Reproduce un audio de ElevenLabs con el mismo volumen, silencio y atenuacion de musica. */
  function playCloud(url, lang, myToken) {
    if (myToken !== token) return;
    const el = new Audio(url);
    el.volume = audioEngine?.isMuted() ? 0 : dbToLinearVolume(audioEngine?.volumeDb);
    const marker = { el };
    current = marker;
    audioEl = el;
    el.onplay = () => {
      if (current !== marker) return;
      audioEngine?.setDucked(true);
      notify({ speaking: true, lang });
    };
    el.onended = () => {
      if (current === marker) endCurrent();
    };
    el.onerror = () => {
      if (current === marker) endCurrent();
    };
    el.play().catch(() => {
      if (current === marker) endCurrent();
    });
  }

  /** Adelanta la descarga del audio (p. ej. las frases de la intro). */
  function preload(text, lang, { rate = 1 } = {}) {
    cloud?.preload(text, lang, rate);
  }

  /**
   * Habla `text` en `lang` ('es' | 'en'). Cancela cualquier narracion
   * anterior primero (nunca se superponen dos utterances). Reduce la
   * musica mientras habla y la restaura al terminar o si se cancela.
   * Devuelve false si la API no esta disponible (la UI debe mostrar el
   * texto igual, de forma no condicionada a esto).
   */
  function speak(text, lang, { rate = 1 } = {}) {
    if (!text) return false;
    if (cloud && !cloud.isDisabled()) {
      cancel();
      const myToken = token;
      cloud.load(text, lang, rate).then((url) => {
        if (myToken !== token) return; // otra frase o un cancel llegaron antes
        if (url) playCloud(url, lang, myToken);
        else speakBrowser(text, lang, { rate });
      });
      return true;
    }
    return speakBrowser(text, lang, { rate });
  }

  function speakBrowser(text, lang, { rate = 1 } = {}) {
    if (!synth || !text) return false;
    cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'en' ? 'en-US' : 'es-PE';
    // Ritmo de la voz: mas lento y sereno en el pasado del relato, algo mas
    // rapido en el presente (ver story-core.js). Acotado a un rango comodo.
    utterance.rate = Math.min(1.3, Math.max(0.7, Number(rate) || 1));
    // Un poco mas grave: suena mas a narrador de documental.
    utterance.pitch = 0.9;
    const voice = pickVoice(synth, lang);
    if (voice) utterance.voice = voice;
    // La voz sigue el volumen maestro y el mute (ganancia lineal 0..1
    // derivada de audioEngine.volumeDb); muteado => volumen 0 explicito,
    // nunca el volumen por defecto de SpeechSynthesis (1).
    utterance.volume = audioEngine?.isMuted() ? 0 : dbToLinearVolume(audioEngine?.volumeDb);

    utterance.onstart = () => {
      // Un onstart tardio de una utterance ya cancelada (reemplazada por
      // otra llamada a speak()/cancel() antes de que el navegador dispare
      // este evento) NUNCA debe duckear la musica ni notificar "hablando":
      // solo la utterance VIGENTE (current === esta misma) puede hacerlo.
      if (current !== utterance) return;
      audioEngine?.setDucked(true);
      notify({ speaking: true, lang });
    };
    utterance.onend = () => {
      if (current === utterance) endCurrent();
    };
    utterance.onerror = () => {
      if (current === utterance) endCurrent();
    };

    current = utterance;
    synth.speak(utterance);
    return true;
  }

  return { isSupported, isSpeaking, speak, preload, cancel, onChange };
}
