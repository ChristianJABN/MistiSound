import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { co2ForStory } from '../src/layers/co2.js';
import { parseColormap, ozonePixel, readDu, colorToDu, ozoneForStory, ozoneTileUrl } from '../src/layers/ozone.js';
import { starRate, windStrength, planStars, planBefore, planNow, planSolo, planMix } from '../src/history/layer-music.js';
import { storyInputs } from '../src/history/story-player.js';
import { buildPdf, toWinAnsi, wrapText } from '../src/ui/pdf-lite.js';
import { parseGissAnnual, parseNoaaMonthly } from '../scripts/prepare_layers.mjs';
import es from '../src/i18n/es.json';
import en from '../src/i18n/en.json';

const CO2 = JSON.parse(readFileSync(new URL('../public/data/co2.json', import.meta.url), 'utf8'));

describe('CO2 (dato global)', () => {
  it('archivo real: 1950 = 311.3 ppm (NASA GISS) y mensual NOAA desde 1979', () => {
    expect(CO2.annual_pre1979.values['1950']).toBe(311.3);
    expect(CO2.monthly_from_1979.first).toBe('1979-01');
    expect(CO2.monthly_from_1979.values['2024-08']).toBeGreaterThan(415);
  });

  it('promedia los 50 y usa los mismos anios recientes; mes aun no publicado = ultimo dato marcado approx', () => {
    const data = {
      annual_pre1979: { values: { 1950: 311, 1951: 312 } },
      monthly_from_1979: { last: '2026-07', values: { '2025-08': 425, '2026-07': 427 } }
    };
    const r = co2ForStory(data, { month: 8, pastYears: [1950, 1951], recentYears: [2025, 2026] });
    expect(r.past.mean).toBe(311.5);
    expect(r.recent.series[0]).toEqual({ year: 2025, ppm: 425, approx: false });
    expect(r.recent.series[1]).toMatchObject({ year: 2026, ppm: 427, approx: true, period: '2026-07' });
  });

  it('parsers del script de datos', () => {
    const giss = '        1850  285.2         1900  295.7         1950  311.3         2000  369.64\n        2020  402.5     2070  464.4';
    const a = parseGissAnnual(giss);
    expect(a[1950]).toBe(311.3);
    expect(a[2020]).toBe(402.5);
    const m = parseNoaaMonthly('# x\nyear,month,decimal,average,unc\n2026,7,2026.5,426.10,0.1');
    expect(m['2026-07']).toBe(426.1);
  });
});

describe('Ozono (OMI via GIBS)', () => {
  const XML = `<ColorMap title="Ozone" units="DU"><Entries>
    <ColorMapEntry rgb="10,20,30" transparent="false" sourceValue="[250.00,252.50)" value="[250.00,252.50)" ref="1"/>
    <ColorMapEntry rgb="40,50,60" transparent="false" sourceValue="[300.00,302.50)" value="[300.00,302.50)" ref="2"/>
  </Entries></ColorMap>`;
  const cmap = parseColormap(XML);

  it('tabla oficial: color -> punto medio del intervalo de 2.5 DU', () => {
    expect(cmap.get('10,20,30')).toBe(251.25);
    expect(colorToDu(cmap, 40, 50, 60)).toBe(301.25);
    expect(colorToDu(cmap, 41, 51, 61)).toBe(301.25); // tolerancia minima de color
    expect(colorToDu(cmap, 200, 0, 0)).toBeNull();
  });

  it('lat/lon -> tile y pixel del nivel 0 (2km)', () => {
    expect(ozonePixel(90, -180)).toEqual({ col: 0, x: 0, y: 0 });
    expect(ozonePixel(-16.4, -71.5).col).toBe(0);
    expect(ozonePixel(0, 150).col).toBe(1);
    expect(ozoneTileUrl('2025-08-15', 1)).toMatch(/OMI_Ozone_TOMS_Total_Column\/default\/2025-08-15\/2km\/0\/0\/1\.png$/);
  });

  it('ignora pixeles transparentes (sin pasada) y promedia anios', async () => {
    const make = (rgba) => ({ width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4).fill(0).map((_, i) => rgba[i % 4]) });
    const transparent = make([0, 0, 0, 0]);
    expect(readDu(transparent, 100, 100, cmap)).toBeNull();
    const loadImage = async (url) => (url.includes('/2006-') ? transparent : url.includes('/2025-') ? make([40, 50, 60, 255]) : make([10, 20, 30, 255]));
    const r = await ozoneForStory({ lat: -16.4, lon: -71.5, month: 8, recentYears: [2024, 2025], colormap: cmap, loadImage, today: new Date(Date.UTC(2026, 10, 14)) });
    expect(r.past.series.find((s) => s.year === 2006).du).toBeNull();
    expect(r.past.mean).toBe(251);
    expect(r.recent.mean).toBe(Math.round((251.25 + 301.25) / 2));
  });
});

describe('Las 3 capas en sonido', () => {
  it('mas CO2 = mas estrellas; menos ozono = mas viento', () => {
    expect(starRate(420)).toBeGreaterThan(starRate(311));
    expect(planStars(420, 0, 10).length).toBeGreaterThan(planStars(311, 0, 10).length);
    expect(windStrength(250)).toBeGreaterThan(windStrength(300));
    expect(windStrength(400)).toBe(0);
    expect(starRate(null)).toBeNull();
  });

  const before = { temp: 0, co2: 311, ozone: 300 };
  const years = [2022, 2023, 2024, 2025, 2026].map((year, i) => ({ year, temp: 1 + i * 0.2, co2: 418 + i, ozone: 280 }));

  it('antes: melodia + estrellas + viento; una capa sola no mezcla otras', () => {
    const p = planBefore(before);
    const types = new Set(p.events.map((e) => e.type));
    expect(types.has('melody') && types.has('star') && types.has('wind')).toBe(true);
    const onlyCo2 = planBefore(before, { layers: ['co2'] });
    expect(new Set(onlyCo2.events.map((e) => e.type))).toEqual(new Set(['star']));
  });

  it('ahora: un compas por anio con latido; solo = antes y luego ahora; mezcla = izquierda y derecha', () => {
    const now = planNow(years, 0);
    expect(now.bars).toHaveLength(5);
    expect(now.events.some((e) => e.type === 'beat')).toBe(true);
    const solo = planSolo('ozone', before, years, 0);
    expect(solo.events.every((e) => e.type === 'wind')).toBe(true);
    expect(solo.bars[0].time).toBeGreaterThanOrEqual(solo.split);
    const mix = planMix(before, years, 0);
    expect(mix.events.some((e) => e.pan < 0)).toBe(true);
    expect(mix.events.some((e) => e.pan > 0)).toBe(true);
  });

  it('storyInputs une temperatura, CO2 y ozono por anio', () => {
    const result = { a: { value: 0 }, b: { series: [{ year: 2025, value: 1.2 }] } };
    const layers = { co2: { past: { mean: 312 }, recent: { series: [{ year: 2025, ppm: 425 }] } }, ozone: { past: { mean: 260 }, recent: { series: [{ year: 2025, du: 255 }] } } };
    expect(storyInputs(result, layers)).toEqual({ before: { temp: 0, co2: 312, ozone: 260 }, birth: null, years: [{ year: 2025, temp: 1.2, co2: 425, ozone: 255 }], pastTemp: 0 });
    const withBirth = { ...result, n: { value: 0.4 } };
    const layersBirth = { ...layers, co2: { ...layers.co2, birth: { ppm: 354 } }, ozone: { ...layers.ozone, birth: null } };
    expect(storyInputs(withBirth, layersBirth).birth).toEqual({ temp: 0.4, co2: 354, ozone: null });
  });
});

describe('PDF de la Guia Docente', () => {
  it('WinAnsi para espanol y sustitucion de simbolos', () => {
    expect(toWinAnsi('ñ¿')).toEqual([0xf1, 0xbf]);
    expect(toWinAnsi('CO₂')).toEqual([67, 79, 50]);
    expect(wrapText('a '.repeat(200), 11).length).toBeGreaterThan(1);
  });

  it('PDF valido: cabecera, tabla xref con offsets correctos y varias paginas', () => {
    const blocks = Array.from({ length: 80 }, (_, i) => ({ text: `Línea ${i} — ¿Qué es el ozono?`, bold: i % 10 === 0 }));
    const bytes = buildPdf(blocks, { title: 'Guía' });
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((off, i) => expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(Number(/\/Count (\d+)/.exec(text)[1])).toBeGreaterThan(1);
  });
});

describe('textos Misti Sound', () => {
  it('ES y EN tienen las mismas claves', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('Misti Sound v2: capas del anio de nacimiento', () => {
  it('CO2: serie anual desde 1950 y valor del anio de nacimiento (anual antes de 1979)', () => {
    const r = co2ForStory(CO2, { month: 8, pastYears: [1950], recentYears: [2025], birthYear: 1965 });
    expect(r.history[0]).toEqual({ year: 1950, ppm: 311.3 });
    expect(r.history.at(-1).year).toBeGreaterThanOrEqual(2026);
    expect(r.birth).toMatchObject({ year: 1965, annual: true });
    expect(r.birth.ppm).toBeGreaterThan(318);
    const r2 = co2ForStory(CO2, { month: 8, pastYears: [1950], recentYears: [2025], birthYear: 1995 });
    expect(r2.birth.annual).toBe(false);
    expect(r2.birth.ppm).toBeGreaterThan(355);
  });

  it('ozono del anio de nacimiento solo si es 2005 o posterior', async () => {
    const XML = '<ColorMapEntry rgb="10,20,30" transparent="false" sourceValue="[250.00,252.50)" value="[250.00,252.50)" ref="1"/>';
    const cmap = parseColormap(XML);
    const img = { width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4).map((_, i) => [10, 20, 30, 255][i % 4]) };
    const loadImage = async () => img;
    const today = new Date(Date.UTC(2026, 10, 14));
    const old = await ozoneForStory({ lat: 0, lon: 0, month: 8, recentYears: [2025], birthYear: 1995, colormap: cmap, loadImage, today });
    expect(old.birth).toEqual({ year: 1995, du: null, measured: false });
    const recent = await ozoneForStory({ lat: 0, lon: 0, month: 8, recentYears: [2025], birthYear: 2010, colormap: cmap, loadImage, today });
    expect(recent.birth).toEqual({ year: 2010, du: 251, measured: true });
  });
});
