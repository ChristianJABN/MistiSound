// Reproductor de Misti Sound. Implementa la interfaz de mezclador que usa el
// controlador de historia (setChannel, setSeed, updateData, start({ onEnd }),
// stop) mas setStoryEpoch() y setMusicMuted(). Toca los planes de
// layer-music.js (estrellas = CO2, viento = ozono, latido/melodia =
// temperatura) por el bus global de la app (volumen, silencio y limiter).
// Nunca arranca solo.
import { planBefore, planNow, planSolo, planMix } from './layer-music.js';
import { planPast } from './story-music.js';

const CUT_SECONDS = 0.03;
const START_DELAY = 0.06;

/** Datos de cada anio reciente: temperatura + CO2 + ozono del mismo anio. */
export function storyInputs(result, layers) {
  const co2 = layers?.co2;
  const oz = layers?.ozone;
  const before = { temp: result.a.value, co2: co2?.past.mean ?? null, ozone: oz?.past.mean ?? null };
  const years = result.b.series.map((s) => ({
    year: s.year,
    temp: s.value,
    co2: co2?.recent.series.find((c) => c.year === s.year)?.ppm ?? null,
    ozone: oz?.recent.series.find((o) => o.year === s.year)?.du ?? null
  }));
  return { before, years, pastTemp: result.a.value };
}

export class StoryPlayer {
  constructor({ ToneLib, getBus, onBar = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
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
    const { before, years, pastTemp } = storyInputs(s.result, s.layers);
    if (s.mode === 'mix') return planMix(before, years, pastTemp);
    if (s.mode === 'solo') return planSolo(s.layer, before, years, pastTemp);
    if (s.which === 'b') return planNow(years, pastTemp);
    return planBefore(before);
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
    const side = { panner, piano, pad, tension, heart, stars, starDelay, windGain, windFilter, noise, noiseStarted: false };
    this.sides[key] = side;
    return side;
  }

  start({ onEnd = null } = {}) {
    this.stop();
    if (!this.getBus()) return;
    const plan = this.plan();
    if (!plan) {
      onEnd?.();
      return;
    }
    const T = this.Tone;
    this.out = new T.Gain(this.musicMuted ? 0 : 1);
    this.out.connect(this.getBus());
    this.sides = {};
    const t0 = T.now() + START_DELAY;
    for (const e of plan.events) {
      const side = this._side(e.pan ?? 0);
      const at = t0 + e.time;
      if (e.type === 'melody') side.piano.triggerAttackRelease(e.note, e.duration, at, e.velocity);
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
        const steps = Math.max(2, Math.round(e.duration / 0.5));
        g.linearRampToValueAtTime(e.level * 0.5, at + 0.3);
        for (let k = 1; k <= steps; k += 1) {
          const wave = 0.5 + 0.5 * Math.sin(k * 1.7);
          g.linearRampToValueAtTime(e.level * (1 - e.gust + e.gust * wave) * 0.5, at + (k / steps) * e.duration);
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
        for (const [k, n] of Object.entries(side)) if (k !== 'noiseStarted') n.dispose();
      }
      out.dispose();
    }, (CUT_SECONDS + 0.05) * 1000);
  }

  stop() {
    this._teardown();
  }

  dispose() {
    this._teardown();
  }
}
