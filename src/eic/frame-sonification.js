// Regla musical de la Jukebox EIC. Modulo PURO (sin Tone): convierte el
// analisis visual de un frame (src/eic/frame-analysis.js) en una lista de
// eventos con tiempo relativo; src/eic/frame-player.js solo los reproduce.
//
// Lectura del mapa de OESTE a ESTE, una franja por medio segundo:
//  - Melodia (piano): el promedio en C de la franja elige la nota de la escala
//    pentatonica de Do. Escala FIJA para todos los frames (-2 .. +3 C, un
//    escalon cada 0.25 C): el mismo color suena igual en cualquier anio y un
//    mapa mas calido suena mas agudo. Fuera de rango satura (se avisa).
//  - Pulso (percusion suave): fraccion de la franja >= +1 C => 0..4 golpes por
//    franja. Mas rojo intenso = mas ritmo.
//  - Pad grave: fraccion de la franja bajo lo normal (azules) => volumen de un
//    acorde grave. Sin azul = sin pad.
//  - Franja sin lectura (cobertura < 15 %): silencio, nunca se inventa una nota.
import { PENTATONIC_SCALE } from '../config/sonification.js';

export const FRAME_PITCH_RANGE = { min: -2, max: 3 };
export const COLUMN_SECONDS = 0.5;
export const MAX_PULSES = 4;
export const MIN_COVERAGE = 0.15;
const COOL_CHORD = ['C3', 'G3', 'E4'];

/** Grados C -> { note, step, saturated } en la escala fija de la jukebox. */
export function frameValueToNote(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const { min, max } = FRAME_PITCH_RANGE;
  const saturated = value < min || value > max;
  const clamped = Math.min(max, Math.max(min, value));
  const step = Math.round(((clamped - min) / (max - min)) * (PENTATONIC_SCALE.length - 1));
  return { note: PENTATONIC_SCALE[step], step, saturated };
}

/**
 * Plan completo: { columnSeconds, duration, columns: [{ index, time, melody,
 * pulses: [time...], pad }] }. Todos los tiempos en segundos desde el inicio.
 */
export function planFrameSong(analysis, { columnSeconds = COLUMN_SECONDS } = {}) {
  const columns = analysis.columns.map((col, i) => {
    const time = i * columnSeconds;
    const readable = col.mean !== null && col.coverage >= MIN_COVERAGE;
    if (!readable) return { index: i, time, melody: null, pulses: [], pad: null, silent: true };
    const mapped = frameValueToNote(col.mean);
    const intensity = Math.min(1, Math.abs(col.mean) / 2);
    const pulseCount = Math.round(col.warmShare * MAX_PULSES);
    const pulses = Array.from({ length: pulseCount }, (_, k) => time + (k * columnSeconds) / MAX_PULSES);
    const padLevel = Math.min(1, col.coolShare * 3);
    return {
      index: i,
      time,
      melody: { ...mapped, velocity: 0.45 + 0.4 * intensity, duration: columnSeconds * 0.9 },
      pulses,
      pad: padLevel > 0.05 ? { notes: COOL_CHORD, level: padLevel, duration: columnSeconds } : null,
      silent: false
    };
  });
  return { columnSeconds, duration: columns.length * columnSeconds, columns };
}
