import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodePng, encodePngRgb, downscaleBox } from '../scripts/lib/png.mjs';
import {
  analyzeFrame,
  buildLegendLut,
  createColorClassifier,
  columnLongitude
} from '../src/eic/frame-analysis.js';
import { planFrameSong, frameValueToNote, FRAME_PITCH_RANGE, MAX_PULSES } from '../src/eic/frame-sonification.js';
import { describeFrame, regionKeyForLongitude, formatLongitude } from '../src/eic/frame-describe.js';
import { PENTATONIC_SCALE } from '../src/config/sonification.js';
import es from '../src/i18n/es.json';
import en from '../src/i18n/en.json';

// Imagen sintetica: leyenda horizontal azul(-2) -> blanco(0) -> rojo(+2) en
// la fila 2, y un "mapa" debajo cuyo color se controla por columna.
function legendColor(v) {
  const u = (v + 2) / 4; // 0..1
  if (u < 0.5) {
    const k = u / 0.5;
    return [Math.round(20 + 220 * k), Math.round(60 + 180 * k), 240];
  }
  const k = (u - 0.5) / 0.5;
  return [240, Math.round(240 - 220 * k), Math.round(240 - 230 * k)];
}

function syntheticFrame(columnValues, { height = 40, colWidth = 10 } = {}) {
  const width = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  const set = (x, y, [r, g, b]) => {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) set(x, y, [0, 0, 0]);
  for (let x = 10; x <= 110; x += 1) for (let y = 1; y <= 3; y += 1) set(x, y, legendColor(-2 + ((x - 10) / 100) * 4));
  columnValues.forEach((v, c) => {
    for (let x = c * colWidth; x < (c + 1) * colWidth; x += 1) {
      for (let y = 10; y < height; y += 1) set(x, y, v === null ? [0, 0, 0] : legendColor(v));
    }
  });
  const frame = {
    id: 'synthetic',
    width,
    height,
    legend: { axis: 'x', fixed: 2, from: 10, to: 110, valueFrom: -2, valueTo: 2, sampleFrom: 11, sampleTo: 109 },
    map: { x0: 0, y0: 10, x1: columnValues.length * colWidth, y1: height, exclude: [] },
    period: { label_es: 'Año de prueba', label_en: 'Test year' }
  };
  return { image: { width, height, data }, frame };
}

describe('png minimo', () => {
  it('codifica y decodifica sin perder pixeles', () => {
    const { image } = syntheticFrame([0, 1, -1]);
    const back = decodePng(encodePngRgb(image));
    expect(back.width).toBe(image.width);
    expect(back.height).toBe(image.height);
    expect(Array.from(back.data)).toEqual(Array.from(image.data));
  });

  it('reduce por promedio de caja', () => {
    const img = { width: 2, height: 2, data: new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255]) };
    const small = downscaleBox(img, 2);
    expect(small.width).toBe(1);
    expect(Array.from(small.data)).toEqual([100, 100, 100, 255]);
  });
});

describe('lectura del color con la leyenda de la imagen', () => {
  it('la tabla de leyenda va de -2 a +2 en orden', () => {
    const { image, frame } = syntheticFrame([0]);
    const lut = buildLegendLut(image, frame.legend);
    expect(lut[0].value).toBeCloseTo(-1.96, 1);
    expect(lut.at(-1).value).toBeCloseTo(1.96, 1);
  });

  it('recupera el valor de cada columna (aprox.) y tolera sombra', () => {
    const { image, frame } = syntheticFrame([-1.5, 0, 0.5, 1.5]);
    const a = analyzeFrame(image, frame, { columns: 4, stride: 1 });
    const means = a.columns.map((c) => c.mean);
    expect(means[0]).toBeCloseTo(-1.5, 0);
    expect(means[1]).toBeCloseTo(0, 0);
    expect(means[2]).toBeCloseTo(0.5, 0);
    expect(means[3]).toBeCloseTo(1.5, 0);
    expect(a.hottestColumn).toBe(3);
    expect(a.coolestColumn).toBe(0);

    const classify = createColorClassifier(buildLegendLut(image, frame.legend));
    const [r, g, b] = legendColor(1.5);
    expect(classify(Math.round(r * 0.75), Math.round(g * 0.75), Math.round(b * 0.75))).toBeCloseTo(1.5, 0);
  });

  it('negro y grises lejanos no se leen como dato', () => {
    const { image, frame } = syntheticFrame([0]);
    const classify = createColorClassifier(buildLegendLut(image, frame.legend));
    expect(classify(0, 200, 0)).toBeNull();
    expect(classify(60, 60, 60)).toBeNull();
  });

  it('el fondo negro no cuenta como zona sin lectura', () => {
    const { image, frame } = syntheticFrame([1, null]);
    const a = analyzeFrame(image, frame, { columns: 2, stride: 1 });
    expect(a.columns[1].count).toBe(0);
    expect(a.columns[1].coverage).toBe(0);
    expect(a.overall.coverage).toBe(1);
  });

  it('longitud del centro de cada franja', () => {
    expect(columnLongitude(0, 24)).toBeCloseTo(-172.5);
    expect(columnLongitude(23, 24)).toBeCloseTo(172.5);
  });
});

describe('regla musical de la jukebox', () => {
  it('escala fija y monotona: mas calido nunca suena mas grave', () => {
    let prev = -1;
    for (let v = -3; v <= 4; v += 0.1) {
      const { step } = frameValueToNote(v);
      expect(step).toBeGreaterThanOrEqual(prev);
      prev = step;
    }
    expect(frameValueToNote(FRAME_PITCH_RANGE.min).note).toBe(PENTATONIC_SCALE[0]);
    expect(frameValueToNote(FRAME_PITCH_RANGE.max).note).toBe(PENTATONIC_SCALE.at(-1));
    expect(frameValueToNote(5).saturated).toBe(true);
    expect(frameValueToNote(null)).toBeNull();
  });

  it('franja sin lectura = silencio; mas zona calida = mas pulsos; azul = pad', () => {
    const analysis = {
      columns: [
        { mean: null, coverage: 0, warmShare: 0, coolShare: 0 },
        { mean: 1.5, coverage: 1, warmShare: 1, coolShare: 0 },
        { mean: 0.2, coverage: 1, warmShare: 0.25, coolShare: 0.4 }
      ]
    };
    const plan = planFrameSong(analysis);
    expect(plan.columns[0].silent).toBe(true);
    expect(plan.columns[0].melody).toBeNull();
    expect(plan.columns[1].pulses).toHaveLength(MAX_PULSES);
    expect(plan.columns[1].pad).toBeNull();
    expect(plan.columns[2].pulses).toHaveLength(1);
    expect(plan.columns[2].pad.level).toBeGreaterThan(0.5);
    expect(plan.duration).toBeCloseTo(1.5);
  });
});

describe('descripcion para pantalla y voz', () => {
  it('describe en ES y EN sin claves sin traducir', () => {
    const { image, frame } = syntheticFrame([-1.5, 0, 0.5, 1.5]);
    const a = analyzeFrame(image, frame, { columns: 4, stride: 1 });
    for (const lang of ['es', 'en']) {
      const lines = describeFrame(a, frame, lang);
      expect(lines.length).toBeGreaterThanOrEqual(4);
      for (const line of lines) {
        expect(line).not.toMatch(/\{|eic[A-Z]/);
      }
    }
  });

  it('regiones y longitudes', () => {
    expect(regionKeyForLongitude(-150)).toBe('eicRegionPacific');
    expect(regionKeyForLongitude(-75)).toBe('eicRegionAmericas');
    expect(regionKeyForLongitude(20)).toBe('eicRegionEuropeAfrica');
    expect(regionKeyForLongitude(100)).toBe('eicRegionAsia');
    expect(formatLongitude(-77, 'es')).toBe('75° O');
    expect(formatLongitude(-77, 'en')).toBe('75° W');
  });

  it('todas las claves eic nuevas existen en ES y EN', () => {
    const esKeys = Object.keys(es).filter((k) => k.startsWith('eic') || k === 'tabJukebox');
    const enKeys = Object.keys(en).filter((k) => k.startsWith('eic') || k === 'tabJukebox');
    expect(esKeys.sort()).toEqual(enKeys.sort());
  });
});

describe('frames reales publicados (public/data/eic)', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/data/eic/frames.json', import.meta.url), 'utf8'));

  it('cada frame declara fuente SVS, periodo y leyenda', () => {
    expect(manifest.frames.length).toBeGreaterThanOrEqual(4);
    for (const f of manifest.frames) {
      expect(f.page_url).toMatch(/^https:\/\/svs\.gsfc\.nasa\.gov\/\d+\/$/);
      expect(f.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.period.label_es).toBeTruthy();
      expect(f.period.label_en).toBeTruthy();
      expect(f.legend.valueFrom).not.toBe(f.legend.valueTo);
    }
    const f2024 = manifest.frames.find((f) => f.year === 2024);
    expect(f2024.period.kind).toBe('rolling-24-month');
  });

  it('cada frame se lee (>90 % del mapa) y los anios mas recientes no salen mas frios que 2022', () => {
    const means = {};
    for (const f of manifest.frames) {
      const image = decodePng(readFileSync(new URL(`../public/${f.file}`, import.meta.url)));
      expect(image.width).toBe(f.width);
      const a = analyzeFrame(image, f);
      expect(a.overall.coverage).toBeGreaterThan(0.9);
      means[f.year] = a.overall.mean;
    }
    // GISTEMP: 2022 fue mas fresco (La Niña) que 2023-2025.
    for (const y of [2023, 2024, 2025]) expect(means[y]).toBeGreaterThan(means[2022]);
  });
});
