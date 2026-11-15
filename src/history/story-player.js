// Reproductor de Misti Sound. Implementa la interfaz de mezclador que usa el
// controlador de historia (setChannel, setSeed, updateData, start({ onEnd }),
// stop) mas setStoryEpoch() y setMusicMuted(). Toca los planes de
// layer-music.js (estrellas = CO2, viento = ozono, latido/melodia =
// temperatura) por el bus global de la app (volumen, silencio y limiter).
// Nunca arranca solo.
import { planBefore, planNow, planSolo, planMix } from './layer-music.js';
import { planPast } from './story-music.js';
import { planPastAmbient, planRecentAmbient } from './story-music-ambient.js';
import { getMusicStyle } from './music-style.js';

const AMBIENT = { planPast: planPastAmbient, planRecent: planRecentAmbient };

// Piano real (Salamander Grand Piano, Alexander Holm, CC-BY 3.0), alojado en
// public/audio/salamander. Se carga una sola vez y se comparte.
const PIANO_NOTES = ['A1', 'C2', 'D#2', 'F#2', 'A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5', 'C6', 'D#6', 'F#6', 'A6', 'C7'];
let pianoBuffers = null;

/** Empieza a cargar las muestras del piano (sin esperar). */
export function preloadPiano(T, baseUrl = '/audio/salamander/') {
  if (pianoBuffers || !T?.ToneAudioBuffers) return pianoBuffers;
  const urls = Object.fromEntries(PIANO_NOTES.map((n) => [n, `${n.replace('#', 's')}.mp3`]));
  pianoBuffers = new T.ToneAudioBuffers({ urls, baseUrl });
  return pianoBuffers;
}

const CUT_SECONDS = 0.03;
const START_DELAY = 0.06;

/** Datos de cada anio reciente: temperatura + CO2 + ozono del mismo anio. */
export function storyInputs(result, layers) {
  const co2 = layers?.co2;
  const oz = layers?.ozone;
  const before = { temp: result.a.value, co2: co2?.past.mean ?? null, ozone: oz?.past.mean ?? null };
  const birth = result.n ? { temp: result.n.value, co2: co2?.birth?.ppm ?? null, ozone: oz?.birth?.du ?? null } : null;
  const years = result.b.series.map((s) => ({
    year: s.year,
    temp: s.value,
    co2: co2?.recent.series.find((c) => c.year === s.year)?.ppm ?? null,
    ozone: oz?.recent.series.find((o) => o.year === s.year)?.du ?? null
  }));
  return { before, birth, years, pastTemp: result.a.value };
}

export class StoryPlayer {
  constructor({ ToneLib, getBus, onBar = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), pianoBaseUrl = '/audio/salamander/', getStyle = getMusicStyle }) {
    this.pianoBaseUrl = pianoBaseUrl;
    this.getStyle = getStyle;
    this.verb = null;
    this.Tone = ToneLib;
    this.getBus = getBus;
    this.onBar = onBar;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.story = null;
    this.value = null;
    this.sides = null;
    this.out = null;
    this.timers = [];
    this.playing = false;
    this.musicMuted = false;
  }

  setChannel() {}
  setSeed() {}

  updateData({ temperature }) {
    this.value = typeof temperature === 'number' ? temperature : null;
  }

  /** { which, mode?: 'solo'|'mix', layer?, result, layers } */
  setStoryEpoch(story) {
    this.story = story;
  }

  /** "Silenciar musica (solo voz)": corta la musica sin tocar la narracion. */
  setMusicMuted(muted) {
    this.musicMuted = Boolean(muted);
    this.out?.gain.rampTo(this.musicMuted ? 0 : 1, 0.05);
  }

  plan() {
    const s = this.story;
    if (!s?.result?.story) {
      // Resultado clasico (enlace antiguo): solo la melodia de temperatura.
      return planPast(this.value);
    }
    const { before, birth, years, pastTemp } = storyInputs(s.result, s.layers);
    const music = this.ambient ? AMBIENT : undefined;
    if (s.which === 'n' && !s.mode) return birth ? planBefore(birth, { seed: 'birth', music }) : null;
    if (s.mode === 'mix') return planMix(before, years, pastTemp, { music });
    if (s.mode === 'solo') return planSolo(s.layer, before, years, pastTemp, { music });
    if (s.which === 'b') return planNow(years, pastTemp, { music });
    return planBefore(before, { music });
  }

  _side(pan) {
    const T = this.Tone;
    const key = pan < 0 ? 'l' : pan > 0 ? 'r' : 'c';
    if (this.sides[key]) return this.sides[key];
    const panner = new T.Panner(pan);
    panner.connect(this.out);
    const piano = new T.PolySynth(T.FMSynth, {
      harmonicity: 1,
      modulationIndex: 1.2,
      envelope: { attack: 0.01, decay: 0.8, sustain: 0.15, release: 0.8 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
      volume: -8
    });
    const pad = new T.PolySynth(T.AMSynth, { harmonicity: 1.5, envelope: { attack: 0.8, decay: 0.4, sustain: 0.8, release: 1.6 }, volume: -16 });
    const tension = new T.PolySynth(T.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.3 }, volume: -22 });
    const heart = new T.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 }, volume: -10 });
    const stars = new T.PolySynth(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.4 }, volume: -18 });
    const starDelay = new T.FeedbackDelay({ delayTime: 0.23, feedback: 0.35, wet: 0.35 });
    const windGain = new T.Gain(0);
    const windFilter = new T.Filter({ type: 'bandpass', frequency: 600, Q: 0.7 });
    const noise = new T.Noise('pink');
    noise.chain(windFilter, windGain, panner);
    stars.chain(starDelay, panner);
    for (const n of [piano, pad, tension, heart]) n.connect(panner);
    // Piano real para el estilo ambiental (si las muestras ya cargaron).
    let keys = null;
    if (this.ambient && pianoBuffers?.loaded) {
      const urls = Object.fromEntries(PIANO_NOTES.map((n) => [n, pianoBuffers.get(n)]));
      keys = new T.Sampler({ urls, release: 2.8, volume: 6 });
      keys.connect(panner);
    }
    if (this.ambient) {
      pad.set({ envelope: { attack: 1.6, release: 3 } });
      // Niveles medidos (render offline): piano ~-24 dB, viento ~16 dB por debajo.
      pad.volume.value = 2;
      stars.volume.value = -3;
    }
    const side = { panner, piano, pad, tension, heart, stars, starDelay, windGain, windFilter, noise, keys, noiseStarted: false };
    this.sides[key] = side;
    return side;
  }

  start({ onEnd = null, afterWait = false } = {}) {
    this.stop();
    if (!this.getBus()) return;
    this.ambient = this.getStyle() === 'ambient';
    if (this.ambient) preloadPiano(this.Tone, this.pianoBaseUrl);
    // Si el piano aun carga, espera (maximo 4 s) para no sonar con el sintetizador.
    if (this.ambient && pianoBuffers && !pianoBuffers.loaded && !afterWait && this.Tone.loaded) {
      const token = {};
      this.waitToken = token;
      Promise.race([this.Tone.loaded(), new Promise((r) => this.setTimer(r, 4000))]).then(() => {
        if (this.waitToken === token) this.start({ onEnd, afterWait: true });
      });
      return;
    }
    const plan = this.plan();
    if (!plan) {
      onEnd?.();
      return;
    }
    const T = this.Tone;
    this.out = new T.Gain(this.musicMuted ? 0 : 1);
    if (this.ambient && T.Reverb) {
      // Sala grande y suave: la reverberacion es lo que da el aire "ambiental".
      if (!this.verb) {
        this.verb = new T.Reverb({ decay: 6, preDelay: 0.03, wet: 0.38 });
        this.verb.connect(this.getBus());
      }
      this.out.connect(this.verb);
    } else {
      this.out.connect(this.getBus());
    }
    this.sides = {};
    const t0 = T.now() + START_DELAY;
    for (const e of plan.events) {
      const side = this._side(e.pan ?? 0);
      const at = t0 + e.time;
      const keys = side.keys ?? side.piano;
      // Las muestras reales son suaves: en el estilo ambiental la velocidad se
      // lleva a un rango audible (0.35..1) sin perder las diferencias.
      const vel = this.ambient ? Math.min(1, 0.35 + e.velocity * 1.4) : e.velocity;
      if (e.type === 'melody') keys.triggerAttackRelease(e.note, e.duration, at, vel);
      else if (e.type === 'chord') keys.triggerAttackRelease(e.note, e.duration, at, vel);
      else if (e.type === 'pulse') keys.triggerAttackRelease(e.note, e.duration, at, vel);
      else if (e.type === 'pad') side.pad.triggerAttackRelease(e.notes, e.duration, at, e.velocity);
      else if (e.type === 'tension') side.tension.triggerAttackRelease(e.note, e.duration, at, e.velocity);
      else if (e.type === 'beat') side.heart.triggerAttackRelease('A1', 0.1, at, e.velocity);
      else if (e.type === 'star') side.stars.triggerAttackRelease(e.note, e.duration, at, e.velocity);
      else if (e.type === 'wind') {
        if (!side.noiseStarted) {
          side.noise.start(t0);
          side.noiseStarted = true;
        }
        // Rafagas: el volumen sube y baja dentro del tramo segun `gust`.
        const g = side.windGain.gain;
        // En el estilo ambiental el viento acompana, no tapa al piano.
        const windScale = this.ambient ? 0.6 : 1;
        const steps = Math.max(2, Math.round(e.duration / 0.5));
        g.linearRampToValueAtTime(e.level * 0.5 * windScale, at + 0.3);
        for (let k = 1; k <= steps; k += 1) {
          const wave = 0.5 + 0.5 * Math.sin(k * 1.7);
          g.linearRampToValueAtTime(e.level * (1 - e.gust + e.gust * wave) * 0.5 * windScale, at + (k / steps) * e.duration);
        }
        side.windFilter.frequency.linearRampToValueAtTime(e.cutoff, at + 0.5);
      }
    }
    // El viento se apaga al final de la pieza.
    for (const side of Object.values(this.sides)) {
      if (side.noiseStarted) side.windGain.gain.linearRampToValueAtTime(0, t0 + plan.duration + 0.3);
    }
    this.playing = true;
    for (const bar of plan.bars ?? []) {
      this.timers.push(this.setTimer(() => this.onBar(bar), (START_DELAY + bar.time) * 1000));
    }
    this.timers.push(
      this.setTimer(() => {
        this._teardown();
        onEnd?.();
      }, (START_DELAY + plan.duration + 0.5) * 1000)
    );
  }

  _teardown() {
    for (const id of this.timers) this.clearTimer(id);
    this.timers = [];
    this.playing = false;
    if (!this.out) return;
    const out = this.out;
    const sides = this.sides;
    this.out = null;
    this.sides = null;
    out.gain.rampTo(0, CUT_SECONDS);
    this.setTimer(() => {
      for (const side of Object.values(sides)) {
        if (side.noiseStarted) side.noise.stop();
        for (const [k, n] of Object.entries(side)) if (k !== 'noiseStarted' && n) n.dispose();
      }
      out.dispose();
    }, (CUT_SECONDS + 0.05) * 1000);
  }

  stop() {
    this.waitToken = null;
    this._teardown();
  }

  dispose() {
    this._teardown();
    this.verb?.dispose();
    this.verb = null;
  }
}
