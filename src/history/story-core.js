// "Tu cumpleaños en la Tierra" (Storytelling de Misti Sound). Logica PURA:
// valida el cumpleanos (dia/mes, ano opcional), elige las ventanas de tiempo y
// lee de forma atomica la misma celda GISTEMP en todos los meses usados.
//
// Ventanas (mismo MES del cumpleanos; GISTEMP es mensual, no hay dato diario):
//  - Pasado: decada de 1950 (1950-1959). Se promedia para no depender de un
//    solo mes ruidoso; el globo muestra ese mes de 1950.
//  - Reciente: los ultimos 5 anios disponibles para ese mes (p. ej. 2022-2026
//    si el mes ya tiene dato en 2026). Cada anio suena por separado.
//  - Ano de nacimiento (opcional): un dato mas en el relato, sin cambiar la
//    comparacion principal.
// Solo anomalias mensuales respecto a 1951-1980: nunca temperatura absoluta.
import { findNearestCell } from '../data/grid.js';
import { formatPeriod } from '../data/repository.js';
import { computeDelta, formatDegrees, formatCoords } from './history-core.js';
import { t } from '../i18n/index.js';

export const PAST_FIRST_YEAR = 1950;
export const PAST_YEARS = 10;
export const RECENT_YEARS = 5;
export const MIN_PAST_VALUES = 6;
export const MIN_RECENT_VALUES = 3;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Dia (1..31) y mes (1..12) obligatorios; ano opcional dentro de la fuente. */
export function validateBirthday({ day, month, year }, availablePeriods) {
  const dayText = String(day ?? '').trim();
  const monthText = String(month ?? '').trim();
  const yearText = String(year ?? '').trim();
  if (dayText === '' || monthText === '') return { ok: false, reason: 'empty' };
  if (!/^\d{1,2}$/.test(dayText) || !/^\d{1,2}$/.test(monthText)) return { ok: false, reason: 'invalid' };
  const d = Number(dayText);
  const m = Number(monthText);
  if (m < 1 || m > 12 || d < 1 || d > DAYS_IN_MONTH[m - 1]) return { ok: false, reason: 'invalid' };
  const periods = [...availablePeriods].sort();
  if (periods.length === 0) return { ok: false, reason: 'noSource' };
  let y = null;
  if (yearText !== '') {
    if (!/^\d{4}$/.test(yearText)) return { ok: false, reason: 'invalidYear' };
    y = Number(yearText);
    const period = formatPeriod(y, m);
    if (period < periods[0]) return { ok: false, reason: 'beforeSource', min: periods[0] };
    if (period > periods[periods.length - 1]) return { ok: false, reason: 'afterLatest', max: periods[periods.length - 1] };
    if (!periods.includes(period)) return { ok: false, reason: 'notAvailable' };
  }
  return { ok: true, day: d, month: m, year: y };
}

/** Periodos (AAAA-MM) de cada ventana para el mes dado, segun lo disponible. */
export function storyWindows(month, availablePeriods) {
  const set = new Set(availablePeriods);
  const past = [];
  for (let y = PAST_FIRST_YEAR; y < PAST_FIRST_YEAR + PAST_YEARS; y += 1) {
    const p = formatPeriod(y, month);
    if (set.has(p)) past.push(p);
  }
  const sameMonth = [...set].filter((p) => Number(p.slice(5, 7)) === month).sort();
  const recent = sameMonth.slice(-RECENT_YEARS);
  return { past, recent };
}

function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * Lee todas las epocas en un unico resultado atomico (misma celda, misma
 * fuente). Compatible con el resultado clasico: `a` = pasado, `b` = reciente.
 */
export async function loadStoryResult({ repository, point, day, month, year = null, placeLabel = null }) {
  const windows = storyWindows(month, repository.availablePeriods);
  if (windows.past.length === 0 || windows.recent.length === 0) return { ok: false, reason: 'notAvailable' };
  const birthPeriod = year ? formatPeriod(year, month) : null;
  const unique = [...new Set([...windows.past, ...windows.recent, ...(birthPeriod ? [birthPeriod] : [])])];
  let datasets;
  try {
    const loaded = await Promise.all(unique.map((p) => repository.fetchPeriod(p)));
    datasets = new Map(unique.map((p, i) => [p, loaded[i]]));
  } catch (err) {
    return { ok: false, reason: 'error', error: err };
  }
  const cells = new Map();
  let ref = null;
  let refDs = null;
  try {
    for (const p of unique) {
      const ds = datasets.get(p);
      const cell = findNearestCell(point.lat, point.lon, ds);
      if (!ref) {
        ref = cell;
        refDs = ds;
      } else if (cell.latIdx !== ref.latIdx || cell.lonIdx !== ref.lonIdx) {
        return { ok: false, reason: 'gridMismatch' };
      }
      const sha = ds.source?.original_file_sha256 ?? null;
      if (sha !== (refDs.source?.original_file_sha256 ?? null) || ds.baseline_period !== refDs.baseline_period || ds.units !== refDs.units) {
        return { ok: false, reason: 'sourceMismatch' };
      }
      cells.set(p, typeof cell.value === 'number' ? cell.value : null);
    }
  } catch (err) {
    return { ok: false, reason: 'error', error: err };
  }

  const series = (periods) => periods.map((p) => ({ period: p, year: Number(p.slice(0, 4)), value: cells.get(p) }));
  const pastSeries = series(windows.past);
  const recentSeries = series(windows.recent);
  const pastValues = pastSeries.filter((s) => s.value !== null);
  const recentValues = recentSeries.filter((s) => s.value !== null);
  const pastMean = pastValues.length >= MIN_PAST_VALUES ? mean(pastSeries.map((s) => s.value)) : null;
  const recentMean = recentValues.length >= MIN_RECENT_VALUES ? mean(recentSeries.map((s) => s.value)) : null;
  const round = (v) => (v === null ? null : Number(v.toFixed(4)));

  return {
    ok: true,
    result: {
      story: true,
      key: `story:${point.lat}:${point.lon}:${month}:${day ?? ''}:${year ?? ''}`,
      point: { lat: point.lat, lon: point.lon },
      placeLabel,
      birthday: { day: day ?? null, month, year: year ?? null },
      cell: { latIdx: ref.latIdx, lonIdx: ref.lonIdx, latCenter: ref.latCenter, lonCenter: ref.lonCenter },
      a: {
        kind: 'past',
        period: windows.past[0],
        value: round(pastMean),
        firstYear: pastSeries[0].year,
        lastYear: pastSeries[pastSeries.length - 1].year,
        series: pastSeries
      },
      b: {
        kind: 'recent',
        period: windows.recent[windows.recent.length - 1],
        value: round(recentMean),
        firstYear: recentSeries[0].year,
        lastYear: recentSeries[recentSeries.length - 1].year,
        series: recentSeries
      },
      birth: birthPeriod ? { period: birthPeriod, year, value: cells.get(birthPeriod) } : null,
      delta: computeDelta(round(pastMean), round(recentMean)),
      baseline: refDs.baseline_period,
      units: refDs.units,
      smoothingKm: refDs.smoothing_radius_km,
      gridDeg: refDs.grid_resolution_deg,
      dataset: refDs.dataset ?? null,
      sourceSha: refDs.source?.original_file_sha256 ?? null
    }
  };
}

// ---------- Textos (pantalla, voz y tarjeta) ----------

export function monthName(month, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en' : 'es', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2001, month - 1, 1))
  );
}

/** "14 de noviembre" / "November 14" (o solo el mes si no hay dia). */
export function formatBirthday({ day, month }, lang) {
  const name = monthName(month, lang);
  if (!day) return name;
  return lang === 'en' ? `${name.charAt(0).toUpperCase()}${name.slice(1)} ${day}` : `${day} de ${name}`;
}

const deg = (v) => (v === null ? null : `${formatDegrees(v, { signed: true })} °C`);

function place(result) {
  return result.placeLabel ?? formatCoords(result.point.lat, result.point.lon);
}

export function pastLabel(result, lang) {
  return t(lang, 'storyPastLabel', { first: result.a.firstYear, last: result.a.lastYear });
}

/** Version en minuscula para usar dentro de una frase. */
export function pastInline(result, lang) {
  return t(lang, 'storyPastInline', { first: result.a.firstYear, last: result.a.lastYear });
}

export function recentInline(result, lang) {
  return t(lang, 'storyRecentInline', { first: result.b.firstYear, last: result.b.lastYear });
}

export function recentLabel(result, lang) {
  return t(lang, 'storyRecentLabel', { first: result.b.firstYear, last: result.b.lastYear });
}

/** Relato completo en orden: conexion, pasado, presente, (nacimiento), cierre. */
export function buildBirthdayStory(result, lang) {
  const month = monthName(result.birthday.month, lang);
  const lines = [
    t(lang, 'storyIntro', { birthday: formatBirthday(result.birthday, lang), place: place(result), month })
  ];
  lines.push(
    result.a.value === null
      ? t(lang, 'storyPastMissing', { month, label: pastInline(result, lang) })
      : t(lang, 'storyPastLine', { month, label: pastInline(result, lang), x: deg(result.a.value) })
  );
  lines.push(
    result.b.value === null
      ? t(lang, 'storyRecentMissing', { month, label: recentInline(result, lang) })
      : t(lang, 'storyRecentLine', { month, label: recentInline(result, lang), y: deg(result.b.value) })
  );
  if (result.delta !== null) {
    lines.push(t(lang, result.delta >= 0 ? 'storyDeltaWarmer' : 'storyDeltaCooler', { d: deg(Math.abs(result.delta)).replace('+', '') }));
  }
  if (result.birth) {
    lines.push(
      result.birth.value === null
        ? t(lang, 'storyBirthMissing', { year: result.birth.year })
        : t(lang, 'storyBirthLine', { year: result.birth.year, month, z: deg(result.birth.value) })
    );
  }
  lines.push(t(lang, 'storyCaveat', { km: result.smoothingKm, deg: result.gridDeg }));
  return lines;
}

/** Lo que la voz dice al empezar cada parte (serena en el pasado, urgente en el presente). */
export function storyAnnouncement(result, which, lang) {
  const month = monthName(result.birthday.month, lang);
  if (which === 'a') {
    if (result.a.value === null) return t(lang, 'storyPastMissing', { month, label: pastInline(result, lang) });
    return t(lang, 'storyAnnouncePast', { month, place: place(result), label: pastInline(result, lang), x: deg(result.a.value) });
  }
  if (result.b.value === null) return t(lang, 'storyRecentMissing', { month, label: recentInline(result, lang) });
  const key = result.delta !== null && result.delta >= 0 ? 'storyAnnounceRecentWarmer' : 'storyAnnounceRecent';
  return t(lang, key, {
    month,
    label: recentInline(result, lang),
    y: deg(result.b.value),
    d: result.delta === null ? '' : deg(Math.abs(result.delta)).replace('+', '')
  });
}

/** Mensaje de reflexion final (Paso 4). */
export function reflectionMessage(result, lang) {
  if (result.delta === null) return t(lang, 'storyReflectNoData');
  const key = result.delta >= 0.5 ? 'storyReflectWarm' : result.delta >= 0 ? 'storyReflectMild' : 'storyReflectCool';
  return t(lang, key, {
    birthday: formatBirthday(result.birthday, lang),
    place: place(result),
    d: deg(Math.abs(result.delta)).replace('+', '')
  });
}

/** Preguntas para debatir en clase (docentes). */
export function classroomQuestions(lang) {
  return [t(lang, 'storyClassQ1'), t(lang, 'storyClassQ2'), t(lang, 'storyClassQ3')];
}
