// Musica "piano ambiental" del relato (Misti Sound). Modulo PURO: devuelve
// eventos con tiempo relativo, igual que story-music.js (el estilo clasico),
// para que story-player.js los toque con un piano real y reverberacion.
//
// Idea: el clima no rompe la armonia, la COLOREA.
//  - Acordes de 4 notas que se sostienen (maj7, m7, sus): siempre consonantes.
//  - Cuanto mas calido que en los anios 50, mas "anhelo" en la progresion:
//      fresco  (< +0.3 °C)  I – IV – vi – IV        (abierta, en paz)
//      calido  (+0.3..+1)   vi – IV – I – V          (melancolica)
//      caliente(>= +1 °C)   IV#11 – bVII – vi – Vsus (suspendida, sin reposo)
//  - Melodia pentatonica escasa (3 a 6 notas por compas, con rubato): su
//    registro sale de la anomalia de ese anio (mas calido = mas agudo) y,
//    con mas calor, hay mas notas.
//  - Tempo tranquilo: 60 BPM en el pasado; 64 + 14 BPM por grado en el
//    presente (tope 92), en vez de llegar a 132.
//  - Pulso: una nota grave muy suave en los tiempos 1 y 3 cuando el anio es
//    mas calido que el pasado: un latido musical, no un bombo.
import { PENTATONIC_SCALE } from '../config/sonification.js';
import { frameValueToNote } from '../eic/frame-sonification.js';
import { hash01 } from '../audio/composition.js';

export const AMBIENT_PAST_BPM = 60;
export const AMBIENT_BASE_BPM = 64;
export const AMBIENT_BPM_PER_DEGREE = 14;
export const AMBIENT_MAX_BPM = 92;

export const CHORDS = {
  I: ['C3', 'G3', 'B3', 'E4'],
  IV: ['F2', 'C3', 'A3', 'E4'],
  vi: ['A2', 'E3', 'G3', 'C4'],
  V: ['G2', 'D3', 'A3', 'C4'],
  IVs: ['F2', 'C3', 'B3', 'E4'],
  bVII: ['A#2', 'F3', 'A3', 'D4'],
  Vsus: ['G2', 'D3', 'F3', 'C4']
};
export const PROGRESSIONS = {
  cool: ['I', 'IV', 'vi', 'IV'],
  warm: ['vi', 'IV', 'I', 'V'],
  hot: ['IVs', 'bVII', 'vi', 'Vsus']
};

const scaleAt = (i) => PENTATONIC_SCALE[Math.max(0, Math.min(PENTATONIC_SCALE.length - 1, i))];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Centro del registro de la melodia (indice en la pentatonica, C4..A5). */
function center(value) {
  const m = frameValueToNote(value);
  return m ? Math.max(5, Math.min(14, m.step)) : null;
}

export function warmthLevel(diff) {
  if (!isNum(diff) || diff < 0.3) return 'cool';
  return diff < 1 ? 'warm' : 'hot';
}

export function ambientBpm(value, pastValue) {
  const diff = Math.max(0, value - (isNum(pastValue) ? pastValue : 0));
  return Math.min(AMBIENT_MAX_BPM, Math.round(AMBIENT_BASE_BPM + AMBIENT_BPM_PER_DEGREE * diff));
}

/** Acorde arpegiado (notas apenas desfasadas, como una mano que "rueda" el acorde). */
function chordEvents(name, time, duration, velocity) {
  return CHORDS[name].map((note, i) => ({ type: 'chord', time: time + i * 0.035, note, duration, velocity: velocity * (i === 0 ? 0.9 : 0.75) }));
}

/** Pasado (anios 50): dos compases en paz y un reposo en la tonica. */
export function planPastAmbient(value) {
  const c = center(value);
  if (c === null) return null;
  const beat = 60 / AMBIENT_PAST_BPM;
  const bar = 4 * beat;
  const events = [];
  ['I', 'IV'].forEach((name, b) => {
    const t0 = b * bar;
    events.push(...chordEvents(name, t0, bar * 1.1, 0.34));
    events.push({ type: 'pad', time: t0, notes: CHORDS[name].slice(1), duration: bar, velocity: 0.16 });
    [0, 2, 4, 2].forEach((deg, i) => {
      const rub = (hash01('amb-past', b, i) - 0.5) * 0.12 * beat;
      events.push({ type: 'melody', time: t0 + (i * 0.9 + 0.5) * beat + rub, note: scaleAt(c + deg - 2), duration: beat * 2.2, velocity: 0.36 });
    });
  });
  const tEnd = 2 * bar;
  events.push(...chordEvents('I', tEnd, bar * 1.6, 0.3));
  events.push({ type: 'melody', time: tEnd + 0.4 * beat, note: scaleAt(c - 2), duration: bar * 1.4, velocity: 0.3 });
  return { bpm: AMBIENT_PAST_BPM, duration: 3 * bar, events };
}

/** Presente: un compas por anio (sin dato = compas en silencio, nunca se inventa). */
export function planRecentAmbient(series, pastValue) {
  const events = [];
  const bars = [];
  let t = 0;
  series.forEach(({ year, value }, idx) => {
    if (!isNum(value)) {
      const bar = (4 * 60) / AMBIENT_BASE_BPM;
      bars.push({ year, time: t, bpm: null, duration: bar, silent: true });
      t += bar;
      return;
    }
    const diff = isNum(pastValue) ? value - pastValue : 0;
    const level = warmthLevel(diff);
    const bpm = ambientBpm(value, pastValue);
    const beat = 60 / bpm;
    const bar = 4 * beat;
    const name = PROGRESSIONS[level][idx % 4];
    const heat = Math.min(1, Math.max(0, diff) / 2);
    events.push(...chordEvents(name, t, bar * 1.15, 0.32 + 0.1 * heat));
    events.push({ type: 'pad', time: t, notes: CHORDS[name].slice(1), duration: bar, velocity: 0.14 + 0.08 * heat });
    const c = center(value);
    const count = 3 + Math.min(3, Math.round(Math.max(0, diff) * 2));
    for (let k = 0; k < count; k += 1) {
      // Contorno que sube y vuelve, con un desvio determinista por anio.
      const deg = Math.round(Math.sin((k / Math.max(1, count - 1)) * Math.PI) * 3) + (hash01(`amb-${year}`, k) > 0.7 ? 1 : 0);
      const rub = (hash01(`amb-${year}`, 'r', k) - 0.5) * 0.15 * beat;
      events.push({
        type: 'melody',
        time: t + ((k + 0.5) / count) * bar + rub,
        note: scaleAt(c - 1 + deg),
        duration: beat * 1.8,
        velocity: 0.34 + 0.16 * heat
      });
    }
    if (diff > 0.2) {
      const root = CHORDS[name][0];
      for (const k of [0, 2]) events.push({ type: 'pulse', time: t + k * beat, note: root, duration: beat * 0.9, velocity: 0.16 + 0.22 * heat });
    }
    bars.push({ year, time: t, bpm, duration: bar, tension: heat, silent: false });
    t += bar;
  });
  return { duration: t, events, bars };
}
