// Musica del relato de cumpleanos (Misti Sound). Modulo PURO: devuelve eventos
// con tiempo relativo; story-player.js los toca con Tone.
//
// Paso 2 — La memoria del pasado (calma): 56 BPM, 3 compases. Arpegio lento de
// negras sobre un acorde mayor sostenido; volumen suave y estable. La altura
// sale de la anomalia de la decada de 1950.
//
// Paso 3 — El latido de los ultimos 5 anios (urgencia): un compas por anio.
//  - Tempo: 72 BPM + 20 BPM por cada grado sobre el pasado (tope 132).
//  - Altura: la anomalia de ese anio (mas calido = mas agudo).
//  - Tension: si ese anio supera al pasado en >= 0.5 C, una nota a un
//    semitono de la melodia (choque disonante) cuyo volumen crece con la
//    diferencia.
//  - Latido: dos golpes graves por pulso ("pum-pum"), como un corazon.
// La escala de alturas es la misma de la Jukebox EIC (-2..+3 C, pentatonica
// de Do), asi que un mismo valor suena igual en toda la app.
import { PENTATONIC_SCALE } from '../config/sonification.js';
import { frameValueToNote } from '../eic/frame-sonification.js';

export const PAST_BPM = 56;
export const PAST_BARS = 3;
export const RECENT_BASE_BPM = 72;
export const RECENT_BPM_PER_DEGREE = 20;
export const RECENT_MAX_BPM = 132;
export const TENSION_THRESHOLD = 0.5;

const NOTE_RE = /^([A-G])(#?)(\d)$/;
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteToMidi(note) {
  const m = NOTE_RE.exec(note);
  if (!m) throw new Error(`Nota invalida ${note}`);
  return 12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + (m[2] ? 1 : 0);
}

export function midiToNote(midi) {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Paso pentatonico (0..19) desde el valor, o null sin dato. */
function stepFor(value) {
  const mapped = frameValueToNote(value);
  return mapped ? mapped.step : null;
}

const scaleAt = (step) => PENTATONIC_SCALE[Math.max(0, Math.min(PENTATONIC_SCALE.length - 1, step))];

export function recentBpm(value, pastValue) {
  const base = typeof pastValue === 'number' ? pastValue : 0;
  const diff = Math.max(0, value - base);
  return Math.min(RECENT_MAX_BPM, Math.round(RECENT_BASE_BPM + RECENT_BPM_PER_DEGREE * diff));
}

/** Pasado: { bpm, duration, events } o null sin dato. */
export function planPast(value) {
  const step = stepFor(value);
  if (step === null) return null;
  const beat = 60 / PAST_BPM;
  const bar = 4 * beat;
  const events = [];
  // Arpegio de grados (0, 2, 3, 2) de la pentatonica = C E G E: mayor, estable.
  const pattern = [0, 2, 3, 2];
  for (let b = 0; b < PAST_BARS; b += 1) {
    const t0 = b * bar;
    const root = Math.max(0, step - 2);
    events.push({ type: 'pad', time: t0, notes: [scaleAt(root - 5), scaleAt(root - 3), scaleAt(root - 2)], duration: bar * 0.98, velocity: 0.32 });
    pattern.forEach((deg, i) => {
      events.push({ type: 'melody', time: t0 + i * 2 * beat * 0.5, note: scaleAt(root + deg), duration: beat * 1.6, velocity: 0.42 });
    });
  }
  // Reposo final en la tonica.
  events.push({ type: 'melody', time: PAST_BARS * bar, note: scaleAt(Math.max(0, step - 2)), duration: bar, velocity: 0.38 });
  return { bpm: PAST_BPM, duration: PAST_BARS * bar + bar, events };
}

/**
 * Presente: un compas por anio. `series` = [{ year, value }]. Anios sin dato
 * dejan un compas en silencio (no se inventa).
 */
export function planRecent(series, pastValue) {
  const events = [];
  const bars = [];
  let t = 0;
  for (const { year, value } of series) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      const bar = (4 * 60) / RECENT_BASE_BPM;
      bars.push({ year, time: t, bpm: null, duration: bar, silent: true });
      t += bar;
      continue;
    }
    const bpm = recentBpm(value, pastValue);
    const beat = 60 / bpm;
    const bar = 4 * beat;
    const step = stepFor(value);
    const diff = typeof pastValue === 'number' ? value - pastValue : 0;
    const tension = diff >= TENSION_THRESHOLD ? Math.min(1, (diff - TENSION_THRESHOLD) / 1.5 + 0.3) : 0;
    // Motivo ascendente de corcheas: mas urgente que el arpegio del pasado.
    const motif = [0, 1, 2, 3, 2, 3, 4, 3];
    motif.forEach((deg, i) => {
      events.push({ type: 'melody', time: t + i * beat * 0.5, note: scaleAt(step - 2 + deg), duration: beat * 0.45, velocity: 0.5 + 0.25 * Math.min(1, Math.max(0, diff) / 2) });
    });
    if (tension > 0) {
      const clash = midiToNote(noteToMidi(scaleAt(step + 2)) + 1);
      for (const k of [1, 3]) events.push({ type: 'tension', time: t + k * beat, note: clash, duration: beat * 0.9, velocity: 0.25 + 0.35 * tension });
    }
    for (let k = 0; k < 4; k += 1) {
      events.push({ type: 'beat', time: t + k * beat, velocity: 0.7 });
      events.push({ type: 'beat', time: t + k * beat + beat * 0.28, velocity: 0.45 });
    }
    bars.push({ year, time: t, bpm, duration: bar, tension, silent: false });
    t += bar;
  }
  return { duration: t, events, bars };
}
