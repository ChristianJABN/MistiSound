import { describe, it, expect } from 'vitest';
import { buildIntroLines, introVars, seasonIndex, fillTemplate } from '../src/ui/intro-lines.js';

const info = { place: 'Arequipa', lat: -16.4, day: 15, month: 8, monthName: 'agosto', year: 1995 };
const now = new Date('2026-11-15T12:00:00Z');
const text = (segs) => segs.map((s) => s.text).join('');

describe('intro-lines', () => {
  it('season flips by hemisphere', () => {
    expect(seasonIndex(8, 40)).toBe(0); // agosto norte: verano
    expect(seasonIndex(8, -16)).toBe(2); // agosto sur: invierno
    expect(seasonIndex(1, 10)).toBe(2);
  });

  it('builds personal vars', () => {
    const v = introVars('es', info, now);
    expect(v).toMatchObject({ place: 'Arequipa', year: '1995', age: '31', date: '15 de agosto de 1995', season: 'invierno', decade: 'Los 90' });
    expect(introVars('en', { ...info, monthName: 'August' }, now).date).toBe('August 15, 1995');
  });

  it('returns three filled lines with no leftover placeholders, for every variation', () => {
    for (let k = 0; k < 40; k += 1) {
      let n = k;
      const random = () => ((n = (n * 7 + 3) % 97) / 97);
      for (const lang of ['es', 'en']) {
        const lines = buildIntroLines(lang, info, { random, now });
        expect(lines).toHaveLength(3);
        for (const l of lines) expect(text(l)).not.toMatch(/\{|\}|undefined/);
      }
    }
  });

  it('marks personal values as highlighted', () => {
    const segs = fillTemplate('Era {season} en {place}.', { season: 'invierno', place: 'Arequipa' });
    expect(segs.filter((s) => s.hl).map((s) => s.text)).toEqual(['invierno', 'Arequipa']);
  });

  it('works without place or year (only generic lines)', () => {
    const lines = buildIntroLines('es', {}, { random: () => 0, now });
    expect(lines.length).toBeGreaterThan(0);
    expect(text(lines.at(-1))).toBe('Escuchando el CO₂, el ozono y la temperatura de tu fecha…');
  });
});
