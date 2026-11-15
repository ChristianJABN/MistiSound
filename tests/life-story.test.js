import { describe, it, expect } from 'vitest';
import { lifeLines, lifeTimeline, ageAt, moleculeRatio, endQuestion } from '../src/history/life-story.js';

const now = new Date('2026-11-15T12:00:00Z');
const result = { placeLabel: 'Arequipa, Perú', birthday: { day: 15, month: 8, year: 1995 }, delta: 1.54 };
const data = {
  co2: { past: { mean: 314 }, birth: { ppm: 358 }, recent: { mean: 424 }, history: [{ year: 1955, ppm: 313.7 }, { year: 1995, ppm: 360.8 }, { year: 2005, ppm: 379.8 }, { year: 2015, ppm: 401 }, { year: 2025, ppm: 425.6 }] },
  ozone: { past: { mean: 256 }, recent: { mean: 247 } }
};
const text = (segs) => segs.map((s) => s.text).join('');
const all = (lines) => lines.map(text).join(' ');

describe('tu historia: frases personales', () => {
  it('age and molecule ratio', () => {
    expect(ageAt({ day: 15, month: 8, year: 1995 }, now)).toBe(31);
    expect(ageAt({ day: 20, month: 12, year: 1995 }, now)).toBe(30);
    expect(moleculeRatio(358, 424)).toEqual({ n: 5, n1: 6 });
    expect(moleculeRatio(424, 358)).toBeNull();
  });

  it('before: cooler past, thicker ozone, place highlighted', () => {
    const lines = lifeLines('a', { result, data, lang: 'es', now });
    expect(all(lines)).toBe('Antes de que llegaras, cada agosto en Arequipa era más fresco. El aire era más limpio y el escudo de ozono que protege la piel, más grueso. Escucha cómo sonaba.');
    expect(lines[0].filter((s) => s.hl).map((s) => s.text)).toEqual(['agosto', 'Arequipa']);
  });

  it('birth: first breath and CO2 percent', () => {
    expect(all(lifeLines('n', { result, data, lang: 'es', now }))).toBe('El 15 de agosto de 1995 respiraste por primera vez. Ese aire ya traía un 14 % más CO₂ que el de tus abuelos en los años 50. Escucha el año en que naciste.');
  });

  it('now: age, fever and molecules, no technical units', () => {
    const s = all(lifeLines('b', { result, data, lang: 'es', now }));
    expect(s).toContain('Hoy tienes 31 años, y tu ciudad tiene fiebre: cada agosto es 1,5 °C más cálido');
    expect(s).toContain('Si tu cuerpo subiera 1,5 °C, ya tendrías fiebre.');
    expect(s).toContain('donde había 5 moléculas de CO₂, hoy hay 6');
    expect(s).not.toMatch(/ppm|DU|anomal/);
  });

  it('cooler city is told calmly, without fever', () => {
    const s = all(lifeLines('b', { result: { ...result, delta: -0.3 }, data, lang: 'es', now }));
    expect(s).toContain('más fresco que en los años 50');
    expect(s).not.toContain('fiebre');
  });

  it('english, no year, no data', () => {
    const r = { placeLabel: 'Madrid, Spain', birthday: { day: 5, month: 5, year: null }, delta: 0.2 };
    expect(all(lifeLines('b', { result: r, data: null, lang: 'en', now }))).toBe('Today your city has grown warmer: every May is 0.2 °C warmer than in the 1950s. Now listen to how today sounds.');
    expect(all(lifeLines('n', { result: r, lang: 'en', now }))).toBe('On a May 5, you took your first breath. Listen to the year you were born.');
    expect(endQuestion('en')).toBe('What would you tell someone born today?');
    expect(all(lifeLines('end', { result: r, lang: 'es', now }))).toContain('Hoy se está curando.');
  });

  it('every line is fully filled', () => {
    for (const lang of ['es', 'en']) for (const m of ['idle', 'a', 'n', 'interlude', 'b', 'end']) {
      for (const l of lifeLines(m, { result, data, lang, now })) expect(text(l)).not.toMatch(/\{|\}|undefined|null/);
    }
  });
});

describe('linea de tu vida', () => {
  it('1950s, birth, each decade and today, warming with CO2', () => {
    const pts = lifeTimeline({ result, data, lang: 'es', now });
    expect(pts.map((p) => p.label)).toEqual(['Años 50', 'Naciste', '10 años', '20 años', 'Hoy']);
    expect(pts[0].x).toBe(0);
    expect(pts.at(-1).x).toBe(1);
    expect(pts.at(-1).warmth).toBeGreaterThan(pts[0].warmth);
  });
});
