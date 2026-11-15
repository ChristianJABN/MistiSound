import { describe, it, expect } from 'vitest';
import { planPastAmbient, planRecentAmbient, ambientBpm, warmthLevel, CHORDS, PROGRESSIONS, AMBIENT_MAX_BPM } from '../src/history/story-music-ambient.js';
import { PENTATONIC_SCALE } from '../src/config/sonification.js';

const series = [
  { year: 2022, value: 0.2 },
  { year: 2023, value: 0.8 },
  { year: 2024, value: null },
  { year: 2025, value: 1.9 },
  { year: 2026, value: 3.5 }
];

describe('piano ambiental', () => {
  it('warmth picks the progression', () => {
    expect(warmthLevel(0.1)).toBe('cool');
    expect(warmthLevel(0.6)).toBe('warm');
    expect(warmthLevel(1.4)).toBe('hot');
    expect(warmthLevel(null)).toBe('cool');
  });

  it('tempo stays calm and capped', () => {
    expect(ambientBpm(0, 0)).toBe(64);
    expect(ambientBpm(1, 0)).toBe(78);
    expect(ambientBpm(9, 0)).toBe(AMBIENT_MAX_BPM);
  });

  it('past: chords + pentatonic melody, null without data', () => {
    const p = planPastAmbient(0.1);
    expect(p.duration).toBeCloseTo(12, 6);
    expect(p.events.some((e) => e.type === 'chord')).toBe(true);
    for (const e of p.events.filter((x) => x.type === 'melody')) expect(PENTATONIC_SCALE).toContain(e.note);
    expect(planPastAmbient(null)).toBeNull();
  });

  it('recent: one bar per year, silent bar without data, no clashing tension events', () => {
    const r = planRecentAmbient(series, 0);
    expect(r.bars.map((b) => b.year)).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(r.bars[2].silent).toBe(true);
    expect(r.events.some((e) => e.type === 'tension')).toBe(false);
    const allowed = new Set(Object.values(CHORDS).flat());
    for (const e of r.events.filter((x) => x.type === 'chord')) expect(allowed.has(e.note)).toBe(true);
  });

  it('hotter years use the suspended progression, more notes and a soft pulse', () => {
    const r = planRecentAmbient(series, 0);
    const inBar = (b, type) => r.events.filter((e) => e.type === type && e.time >= b.time && e.time < b.time + b.duration);
    const cool = r.bars[0];
    const hot = r.bars[4];
    expect(inBar(hot, 'melody').length).toBeGreaterThan(inBar(cool, 'melody').length);
    expect(inBar(cool, 'pulse')).toHaveLength(0);
    expect(inBar(hot, 'pulse')).toHaveLength(2);
    const hotChord = inBar(hot, 'chord').map((e) => e.note);
    expect(hotChord).toEqual(CHORDS[PROGRESSIONS.hot[4 % 4]]);
  });
});
