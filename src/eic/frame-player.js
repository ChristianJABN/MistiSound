// Reproductor de la Jukebox EIC: toca el plan de src/eic/frame-sonification.js
// con tres instrumentos sintetizados (piano FM, pulso suave, pad grave) que
// salen por el bus global del AudioEngine (volumen, mute y limiter de la app).
// Nunca suena solo: play() solo se llama desde un clic.
//
// Los eventos se agendan con tiempos absolutos de Tone al empezar; stop()
// baja la ganancia en 30 ms y destruye los instrumentos (asi se cancelan las
// notas ya agendadas). Cada play() crea instrumentos nuevos.
const CUT_SECONDS = 0.03;
const START_DELAY = 0.08;

export class EicFramePlayer {
  // Envoltorios: setTimeout/clearTimeout del navegador lanzan "Illegal
  // invocation" si se llaman como metodo de otro objeto.
  constructor({ ToneLib, getBus, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
    this.Tone = ToneLib;
    this.getBus = getBus;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.nodes = null;
    this.timers = [];
    this.playing = false;
  }

  isPlaying() {
    return this.playing;
  }

  _build() {
    const T = this.Tone;
    const out = new T.Gain(1);
    const piano = new T.FMSynth({
      harmonicity: 1,
      modulationIndex: 1.4,
      envelope: { attack: 0.005, decay: 0.7, sustain: 0.1, release: 0.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
      volume: -6
    });
    const pulse = new T.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
      volume: -12
    });
    const pad = new T.PolySynth(T.FMSynth, {
      harmonicity: 2,
      modulationIndex: 0.6,
      envelope: { attack: 0.2, decay: 0.2, sustain: 0.8, release: 0.8 },
      volume: -14
    });
    piano.connect(out);
    pulse.connect(out);
    pad.connect(out);
    out.connect(this.getBus());
    this.nodes = { out, piano, pulse, pad };
  }

  /**
   * Reproduce el plan. onColumn(index) se llama al empezar cada franja (para
   * el cursor visual y el anuncio); onEnd() al terminar o al detener.
   */
  play(plan, { onColumn = () => {}, onEnd = () => {} } = {}) {
    this.stop({ silent: true });
    const bus = this.getBus();
    if (!bus) return false;
    this._build();
    const { piano, pulse, pad } = this.nodes;
    const t0 = this.Tone.now() + START_DELAY;
    for (const col of plan.columns) {
      if (col.melody) piano.triggerAttackRelease(col.melody.note, col.melody.duration, t0 + col.time, col.melody.velocity);
      for (const p of col.pulses) pulse.triggerAttackRelease('C2', 0.08, t0 + p, 0.5);
      if (col.pad) pad.triggerAttackRelease(col.pad.notes, col.pad.duration, t0 + col.time, 0.25 + 0.5 * col.pad.level);
    }
    this.playing = true;
    this.onEnd = onEnd;
    for (const col of plan.columns) {
      this.timers.push(this.setTimer(() => onColumn(col.index), (START_DELAY + col.time) * 1000));
    }
    this.timers.push(this.setTimer(() => this._finish(), (START_DELAY + plan.duration + 0.6) * 1000));
    return true;
  }

  _finish() {
    const cb = this.onEnd;
    this._teardown();
    cb?.();
  }

  _teardown() {
    for (const id of this.timers) this.clearTimer(id);
    this.timers = [];
    this.playing = false;
    this.onEnd = null;
    if (this.nodes) {
      const nodes = this.nodes;
      this.nodes = null;
      nodes.out.gain.rampTo(0, CUT_SECONDS);
      // Se destruyen despues de la rampa para no producir un click.
      this.setTimer(() => {
        nodes.piano.dispose();
        nodes.pulse.dispose();
        nodes.pad.dispose();
        nodes.out.dispose();
      }, (CUT_SECONDS + 0.05) * 1000);
    }
  }

  stop({ silent = false } = {}) {
    if (!this.playing && !this.nodes) return;
    const cb = this.onEnd;
    this._teardown();
    if (!silent) cb?.();
  }
}
