// Las 3 capas de Misti Sound sonando juntas. Modulo PURO (sin Tone): combina
// la musica de temperatura de story-music.js con dos capas nuevas.
//
//  - CO2 = estrellas: destellos agudos y breves. Mas CO2 = mas estrellas por
//    segundo ("muchas estrellas rapidas = sube el CO2").
//      tasa = 0.6 + 7.4 * u   estrellas/s,  u = (ppm - 280) / (430 - 280)
//    280 ppm ~ era preindustrial; 430 ppm ~ hoy.
//  - Ozono = brisa / viento: ruido rosa filtrado. Menos ozono = viento mas
//    fuerte y brillante ("brisa suave = capa sana").
//      w = (330 - DU) / 90 (acotado 0..1): volumen, brillo y rafagas crecen con w.
//  - Temperatura = latido + melodia (story-music.js): lento y estable en los
//    anios 50; un compas por anio que se acelera en el presente.
//
// Modos: 'a' (antes), 'b' (ahora, un compas por anio), 'solo' (una capa:
// antes y luego ahora) y 'mix' (antes a la izquierda y ahora a la derecha,
// al mismo tiempo).
import { planPast, planRecent, noteToMidi, midiToNote } from './story-music.js';
import { hash01 } from '../audio/composition.js';

export const LAYERS = ['co2', 'ozone', 'temp'];
export const CO2_RANGE = { min: 280, max: 430 };
export const OZONE_HEALTHY_DU = 330;
export const OZONE_SPAN_DU = 90;
const STAR_NOTES = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7'];
const SOLO_PAST_SECONDS = 6;
const MIX_PAN = 0.65;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function starRate(ppm) {
  if (!isNum(ppm)) return null;
  return 0.6 + 7.4 * clamp01((ppm - CO2_RANGE.min) / (CO2_RANGE.max - CO2_RANGE.min));
}

export function windStrength(du) {
  if (!isNum(du)) return null;
  return clamp01((OZONE_HEALTHY_DU - du) / OZONE_SPAN_DU);
}

/** Estrellas deterministas (misma fecha = mismas estrellas). */
export function planStars(ppm, start, duration, seed = 'stars') {
  const rate = starRate(ppm);
  if (rate === null || duration <= 0) return [];
  const count = Math.max(1, Math.round(rate * duration));
  const out = [];
  for (let k = 0; k < count; k += 1) {
    const jitter = hash01(seed, 'star-t', k);
    const note = STAR_NOTES[Math.floor(hash01(seed, 'star-n', k) * STAR_NOTES.length)];
    out.push({ type: 'star', time: start + ((k + jitter) / count) * duration, note, duration: 0.12, velocity: 0.25 + 0.3 * hash01(seed, 'star-v', k) });
  }
  return out;
}

export function planWind(du, start, duration) {
  const w = windStrength(du);
  if (w === null || duration <= 0) return [];
  return [{ type: 'wind', time: start, duration, level: 0.12 + 0.88 * w, cutoff: 350 + 1800 * w, gust: 0.08 + 0.7 * w }];
}

function pick(layers, name) {
  return !layers || layers.includes(name);
}

const shift = (events, dt, pan = 0) => events.map((e) => ({ ...e, time: e.time + dt, pan }));

// Estilo musical de la temperatura: { planPast, planRecent }. Por defecto el
// clasico (story-music.js); el piano ambiental vive en story-music-ambient.js.
const CLASSIC = { planPast, planRecent };

/**
 * Antes. `values` = { temp, co2, ozone } (promedios del pasado). Sin la capa
 * de temperatura dura SOLO_PAST_SECONDS.
 */
export function planBefore(values, { layers = LAYERS, seed = 'before', music = CLASSIC } = {}) {
  const melody = pick(layers, 'temp') ? music.planPast(values.temp) : null;
  const duration = melody ? melody.duration : SOLO_PAST_SECONDS;
  const events = [...(melody?.events ?? [])];
  if (pick(layers, 'co2')) events.push(...planStars(values.co2, 0, duration, `${seed}-co2`));
  if (pick(layers, 'ozone')) events.push(...planWind(values.ozone, 0, duration));
  return { duration, events, bars: [] };
}

/**
 * Ahora: un compas por anio. `years` = [{ year, temp, co2, ozone }],
 * `pastTemp` = promedio de los anios 50 (para el tempo y la tension).
 */
export function planNow(years, pastTemp, { layers = LAYERS, seed = 'now', music = CLASSIC } = {}) {
  const temp = music.planRecent(years.map((y) => ({ year: y.year, value: pick(layers, 'temp') ? y.temp : null })), pastTemp);
  const events = pick(layers, 'temp') ? [...temp.events] : [];
  temp.bars.forEach((bar, i) => {
    const y = years[i];
    if (pick(layers, 'co2')) events.push(...planStars(y.co2, bar.time, bar.duration, `${seed}-co2-${y.year}`));
    if (pick(layers, 'ozone')) events.push(...planWind(y.ozone, bar.time, bar.duration));
  });
  return { duration: temp.duration, events, bars: temp.bars };
}

/** Una capa sola: primero antes, luego ahora (con un respiro de 0.6 s). */
export function planSolo(layer, before, years, pastTemp, { music = CLASSIC } = {}) {
  const a = planBefore(before, { layers: [layer], music });
  const gap = 0.6;
  const b = planNow(years, pastTemp, { layers: [layer], music });
  return {
    duration: a.duration + gap + b.duration,
    events: [...a.events, ...shift(b.events, a.duration + gap)],
    bars: b.bars.map((bar) => ({ ...bar, time: bar.time + a.duration + gap })),
    split: a.duration + gap
  };
}

/** Mezclar ambos tiempos: antes a la izquierda, ahora a la derecha, a la vez. */
export function planMix(before, years, pastTemp, { music = CLASSIC } = {}) {
  const a = planBefore(before, { music });
  const b = planNow(years, pastTemp, { music });
  return {
    duration: Math.max(a.duration, b.duration),
    events: [...shift(a.events, 0, -MIX_PAN), ...shift(b.events, 0, MIX_PAN)],
    bars: b.bars
  };
}

export { noteToMidi, midiToNote };
