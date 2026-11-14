// Reproductor del relato de cumpleanos. Implementa la misma interfaz que
// DjMixer usa el controlador de historia (setChannel, setSeed, updateData,
// start({ onEnd }), stop) mas setStoryEpoch(), y toca los planes de
// story-music.js con instrumentos sintetizados por el bus global de la app
// (volumen, silencio y limiter incluidos). Nunca arranca solo.
import { planPast, planRecent } from './story-music.js';

const CUT_SECONDS = 0.03;
const START_DELAY = 0.06;

export class StoryPlayer {
  constructor({ ToneLib, getBus, onBar = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
    this.Tone = ToneLib;
    this.getBus = getBus;
    this.onBar = onBar;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.story = null;
    this.value = null;
    this.nodes = null;
    this.timers = [];
    this.playing = false;
  }

  setChannel() {}
  setSeed() {}

  updateData({ temperature }) {
    this.value = typeof temperature === 'number' ? temperature : null;
  }

  setStoryEpoch(story) {
    this.story = story;
  }

  /** Plan de lo que va a sonar (tambien sirve para pruebas y para la UI). */
  plan() {
    const { which, epoch, pastValue } = this.story ?? {};
    const series = epoch?.series;
    if (which === 'b') {
      return planRecent(series ?? [{ year: null, value: this.value }], pastValue);
    }
    return planPast(this.value);
  }

  _build() {
    const T = this.Tone;
    const out = new T.Gain(1);
    const piano = new T.PolySynth(T.FMSynth, {
      harmonicity: 1,
      modulationIndex: 1.2,
      envelope: { attack: 0.01, decay: 0.8, sustain: 0.15, release: 0.8 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
      volume: -8
    });
    const pad = new T.PolySynth(T.AMSynth, {
      harmonicity: 1.5,
      envelope: { attack: 0.8, decay: 0.4, sustain: 0.8, release: 1.6 },
      volume: -16
    });
    const tension = new T.PolySynth(T.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.3 },
      volume: -22
    });
    const heart = new T.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
      volume: -10
    });
    for (const n of [piano, pad, tension, heart]) n.connect(out);
    out.connect(this.getBus());
    this.nodes = { out, piano, pad, tension, heart };
  }

  start({ onEnd = null } = {}) {
    this.stop();
    if (!this.getBus()) return;
    const plan = this.plan();
    if (!plan) {
      onEnd?.();
      return;
    }
    this._build();
    const { piano, pad, tension, heart } = this.nodes;
    const t0 = this.Tone.now() + START_DELAY;
    for (const e of plan.events) {
      const at = t0 + e.time;
      if (e.type === 'melody') piano.triggerAttackRelease(e.note, e.duration, at, e.velocity);
      else if (e.type === 'pad') pad.triggerAttackRelease(e.notes, e.duration, at, e.velocity);
      else if (e.type === 'tension') tension.triggerAttackRelease(e.note, e.duration, at, e.velocity);
      else if (e.type === 'beat') heart.triggerAttackRelease('A1', 0.1, at, e.velocity);
    }
    this.playing = true;
    for (const bar of plan.bars ?? []) {
      this.timers.push(this.setTimer(() => this.onBar(bar), (START_DELAY + bar.time) * 1000));
    }
    this.timers.push(
      this.setTimer(() => {
        this._teardown();
        onEnd?.();
      }, (START_DELAY + plan.duration + 0.4) * 1000)
    );
  }

  _teardown() {
    for (const id of this.timers) this.clearTimer(id);
    this.timers = [];
    this.playing = false;
    if (!this.nodes) return;
    const nodes = this.nodes;
    this.nodes = null;
    nodes.out.gain.rampTo(0, CUT_SECONDS);
    this.setTimer(() => {
      for (const n of Object.values(nodes)) n.dispose();
    }, (CUT_SECONDS + 0.05) * 1000);
  }

  stop() {
    this._teardown();
  }

  dispose() {
    this._teardown();
  }
}
