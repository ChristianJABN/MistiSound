// Estimaciones y proyecciones de Misti Sound. Modulo PURO.
//
// Cuando no hay medicion para una fecha se ESTIMA (pasado) o se PROYECTA
// (despues del ultimo dato publicado), y el valor sale marcado para que la
// interfaz lo diga ("≈ … estimado"). Nunca se presenta como medicion.
//
// Ozono antes de 2005 (OMI empieza en oct. 2004):
//   estimado(anio) = OMI_2005-2009 × (1 − D·g(anio)) / (1 − D)
//   D = deficit actual frente al promedio 1964–1980 segun la latitud
//   (WMO/UNEP, Scientific Assessment of Ozone Depletion 2022, cap. 3:
//   ~1 % tropicos, ~4 % latitudes medias norte, ~5 % latitudes medias sur).
//   g(anio) = cuanto del deficit ya existia: 0 hasta 1979 (antes del
//   adelgazamiento), sube lineal hasta 1 en 1995 y se mantiene.
//   En la Antartida de septiembre a noviembre (agujero de ozono) no hay
//   estimacion fiable: se devuelve null.
// Temperatura sin dato en la celda: promedio de las celdas vecinas con dato
//   (hasta 3 celdas = ~6° de distancia).
// Temperatura despues del ultimo mes publicado: tendencia lineal entre el
//   promedio de los anios 50 y el de los ultimos 5 anios.
// CO2 despues del ultimo mes publicado: el mismo mes del anio anterior + el
//   crecimiento anual medio de los ultimos 3 anios en ese mes.

export const OZONE_ESTIMATE_SOURCE = 'WMO/UNEP Scientific Assessment of Ozone Depletion 2022';
const OZONE_DEPLETION_START = 1979;
const OZONE_DEPLETION_FULL = 1995;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Deficit de ozono (fraccion) frente a 1964–1980 segun latitud y mes; null = sin estimacion fiable. */
export function ozoneDeficit(lat, month) {
  if (!isNum(lat)) return null;
  const a = Math.abs(lat);
  if (lat <= -60) return month >= 9 && month <= 11 ? null : 0.06;
  if (lat >= 60) return 0.05;
  const mid = lat < 0 ? 0.05 : 0.04;
  if (a <= 20) return 0.01;
  if (a >= 35) return mid;
  return lerp(0.01, mid, (a - 20) / 15);
}

/** Fraccion del deficit actual que ya existia en `year` (0 antes de 1979, 1 desde 1995). */
export function depletionShape(year) {
  if (year <= OZONE_DEPLETION_START) return 0;
  if (year >= OZONE_DEPLETION_FULL) return 1;
  return (year - OZONE_DEPLETION_START) / (OZONE_DEPLETION_FULL - OZONE_DEPLETION_START);
}

/** Ozono estimado (DU) para un anio sin medicion, a partir del promedio OMI 2005–2009 del lugar. */
export function estimateOzone(omiBase, { lat, month, year }) {
  if (!isNum(omiBase)) return null;
  const d = ozoneDeficit(lat, month);
  if (d === null) return null;
  return Math.round((omiBase * (1 - d * depletionShape(year))) / (1 - d));
}

/**
 * Valor de una celda o, si no tiene dato, el promedio de sus vecinas con
 * dato en el primer anillo que tenga alguna (radio 1..maxRing).
 * Devuelve { value, estimated } o { value: null }.
 */
export function cellOrNeighbors(ds, latIdx, lonIdx, maxRing = 3) {
  const nLat = ds.axes.lat_centers.length;
  const nLon = ds.axes.lon_centers.length;
  const at = (i, j) => ds.values[i * nLon + (((j % nLon) + nLon) % nLon)];
  const own = at(latIdx, lonIdx);
  if (isNum(own)) return { value: own, estimated: false };
  for (let r = 1; r <= maxRing; r += 1) {
    const vals = [];
    for (let di = -r; di <= r; di += 1) {
      for (let dj = -r; dj <= r; dj += 1) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = latIdx + di;
        if (i < 0 || i >= nLat) continue;
        const v = at(i, lonIdx + dj);
        if (isNum(v)) vals.push(v);
      }
    }
    if (vals.length) return { value: vals.reduce((a, b) => a + b, 0) / vals.length, estimated: true, ring: r };
  }
  return { value: null, estimated: false };
}

/** Proyeccion lineal de la anomalia: recta entre el centro de cada ventana. */
export function projectTemperature({ pastMean, pastCenter, recentMean, recentCenter }, year) {
  if (!isNum(pastMean) || !isNum(recentMean) || recentCenter === pastCenter) return null;
  const slope = (recentMean - pastMean) / (recentCenter - pastCenter);
  return recentMean + slope * (year - recentCenter);
}

/** CO2 proyectado para un mes despues del ultimo publicado. `monthly` = { 'AAAA-MM': ppm }. */
export function projectCo2(monthly, year, month) {
  const key = (y) => `${y}-${String(month).padStart(2, '0')}`;
  let base = null;
  let baseYear = null;
  for (let y = year - 1; y >= year - 4; y -= 1) {
    if (isNum(monthly[key(y)])) {
      base = monthly[key(y)];
      baseYear = y;
      break;
    }
  }
  if (base === null) return null;
  const growth = [];
  for (let y = baseYear; y > baseYear - 3; y -= 1) {
    if (isNum(monthly[key(y)]) && isNum(monthly[key(y - 1)])) growth.push(monthly[key(y)] - monthly[key(y - 1)]);
  }
  const g = growth.length ? growth.reduce((a, b) => a + b, 0) / growth.length : 2.4;
  return Math.round((base + g * (year - baseYear)) * 10) / 10;
}
