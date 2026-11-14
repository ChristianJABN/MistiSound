// Analisis visual de un frame EIC (mapa anual GISTEMP de NASA SVS). Modulo
// PURO: recibe pixeles RGBA ({ width, height, data }) — en el navegador vienen
// de un <canvas>, en Node/pruebas de scripts/lib/png.mjs — y la descripcion
// del frame de public/data/eic/frames.json.
//
// Metodo (vision por computador simple y explicable):
//  1. Se lee la LEYENDA de color de la propia imagen (barra de NASA) y se arma
//     una tabla color -> grados C. Cada anio trae su propia escala (2025:
//     -4..+4 C; 2022-2024: -2..+2 C), por eso no se usa una paleta fija.
//  2. Cada pixel del mapa se asigna al color de leyenda mas cercano (distancia
//     RGB). Pixeles lejos de toda la leyenda (fondo negro, costas, textos,
//     relieve muy sombreado) quedan "sin lectura" y no cuentan.
//  3. El mapa se corta en columnas de oeste a este (el tiempo de la pieza) y
//     en tres franjas de latitud. Por columna: mediana en C y fraccion de
//     pixeles calidos / frios.
// Es una LECTURA VISUAL aproximada del color, no el dato numerico GISTEMP: la
// interfaz y la narracion lo dicen siempre asi.

export const WARM_THRESHOLD_C = 1.0; // "muy calido": >= +1 C sobre 1951-1980
export const COOL_THRESHOLD_C = -0.2; // "frio": por debajo de lo normal
export const DEFAULT_COLUMNS = 24;
export const DEFAULT_MAX_COLOR_DISTANCE = 42;
const LEGEND_SAMPLES = 96;

function pixel(image, x, y) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

/**
 * Tabla [{ r, g, b, value }] muestreada a lo largo de la barra de leyenda.
 * Promedia 3 pixeles perpendiculares a la barra para suavizar el borde.
 */
export function buildLegendLut(image, legend, { samples = LEGEND_SAMPLES } = {}) {
  const { axis, fixed, from, to, valueFrom, valueTo, sampleFrom, sampleTo } = legend;
  const lut = [];
  for (let k = 0; k < samples; k += 1) {
    const pos = Math.round(sampleFrom + ((sampleTo - sampleFrom) * k) / (samples - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    for (let d = -1; d <= 1; d += 1) {
      const [pr, pg, pb] = axis === 'x' ? pixel(image, pos, fixed + d) : pixel(image, fixed + d, pos);
      r += pr;
      g += pg;
      b += pb;
    }
    const value = valueFrom + ((pos - from) / (to - from)) * (valueTo - valueFrom);
    lut.push({ r: r / 3, g: g / 3, b: b / 3, value });
  }
  return lut;
}

// Los mapas de SVS llevan iluminacion/relieve que OSCURECE el color de la
// leyenda (multiplica el RGB por un factor). Se compara el pixel con
// k * color_de_leyenda, con k en este rango: tolera sombra pero no convierte
// un gris o un negro en "blanco = 0 C".
export const SHADE_RANGE = { min: 0.62, max: 1.08 };

/** Clasificador color -> C (o null) con cache por color cuantizado. */
export function createColorClassifier(lut, { maxDistance = DEFAULT_MAX_COLOR_DISTANCE } = {}) {
  const maxSq = maxDistance * maxDistance;
  const cache = new Map();
  return function classify(r, g, b) {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = Infinity;
    let value = null;
    for (const e of lut) {
      const ll = e.r * e.r + e.g * e.g + e.b * e.b || 1;
      const k = Math.min(SHADE_RANGE.max, Math.max(SHADE_RANGE.min, (r * e.r + g * e.g + b * e.b) / ll));
      const dr = r - k * e.r;
      const dg = g - k * e.g;
      const db = b - k * e.b;
      const d = dr * dr + dg * dg + db * db;
      if (d < best) {
        best = d;
        value = e.value;
      }
    }
    const result = best <= maxSq ? value : null;
    cache.set(key, result);
    return result;
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inRect(x, y, r) {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

function summarize(values, total) {
  let warm = 0;
  let cool = 0;
  let sum = 0;
  for (const v of values) {
    sum += v;
    if (v >= WARM_THRESHOLD_C) warm += 1;
    if (v < COOL_THRESHOLD_C) cool += 1;
  }
  const n = values.length;
  return {
    count: n,
    coverage: total > 0 ? n / total : 0,
    median: median(values),
    mean: n ? sum / n : null,
    warmShare: n ? warm / n : 0,
    coolShare: n ? cool / n : 0
  };
}

/** Longitud aproximada del centro de una franja (proyeccion Robinson, sobre el ecuador). */
export function columnLongitude(index, columns) {
  return -180 + (360 * (index + 0.5)) / columns;
}

/**
 * Analiza el frame. Devuelve columnas (oeste -> este), franjas de latitud
 * (norte / tropicos / sur) y un resumen global, todo en grados C leidos del
 * color. `stride` salta pixeles para que sea rapido en el navegador.
 */
export function analyzeFrame(image, frame, { columns = DEFAULT_COLUMNS, stride = 2, maxDistance } = {}) {
  const lut = buildLegendLut(image, frame.legend);
  const classify = createColorClassifier(lut, { maxDistance });
  const { x0, y0, x1, y1, exclude = [] } = frame.map;
  const legendMax = Math.max(frame.legend.valueFrom, frame.legend.valueTo);
  const legendMin = Math.min(frame.legend.valueFrom, frame.legend.valueTo);
  const satEps = (legendMax - legendMin) * 0.02;

  const colValues = Array.from({ length: columns }, () => []);
  const colTotals = new Array(columns).fill(0);
  const bandValues = [[], [], []];
  const bandTotals = [0, 0, 0];
  const all = [];
  let total = 0;
  let saturatedHigh = 0;
  const width = x1 - x0;
  const height = y1 - y0;

  for (let y = y0; y < y1; y += stride) {
    const band = Math.min(2, Math.floor(((y - y0) / height) * 3));
    for (let x = x0; x < x1; x += stride) {
      if (exclude.some((r) => inRect(x, y, r))) continue;
      const [r, g, b] = pixel(image, x, y);
      // Fondo negro fuera de la elipse del mapa: ni siquiera cuenta como "sin lectura".
      if (r + g + b < 24) continue;
      const col = Math.min(columns - 1, Math.floor(((x - x0) / width) * columns));
      colTotals[col] += 1;
      bandTotals[band] += 1;
      total += 1;
      const v = classify(r, g, b);
      if (v === null) continue;
      colValues[col].push(v);
      bandValues[band].push(v);
      all.push(v);
      if (v >= legendMax - satEps) saturatedHigh += 1;
    }
  }

  const cols = colValues.map((vals, i) => ({
    index: i,
    longitude: columnLongitude(i, columns),
    ...summarize(vals, colTotals[i])
  }));
  const [north, tropics, south] = bandValues.map((vals, i) => summarize(vals, bandTotals[i]));
  const overall = summarize(all, total);
  overall.saturatedHighShare = all.length ? saturatedHigh / all.length : 0;

  const readable = cols.filter((c) => c.median !== null && c.coverage >= 0.15);
  const hottest = readable.reduce((a, c) => (a === null || c.median > a.median ? c : a), null);
  const coolest = readable.reduce((a, c) => (a === null || c.median < a.median ? c : a), null);

  return {
    frameId: frame.id,
    legendRange: { min: legendMin, max: legendMax },
    columns: cols,
    bands: { north, tropics, south },
    overall,
    hottestColumn: hottest ? hottest.index : null,
    coolestColumn: coolest ? coolest.index : null
  };
}
