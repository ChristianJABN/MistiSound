// Capa CO2 (estrellas). Dato GLOBAL: el CO2 se mezcla en toda la atmosfera,
// asi que vale igual para cualquier ciudad. public/data/co2.json lo genera
// scripts/prepare_layers.mjs (NASA GISS anual antes de 1979, NOAA GML
// mensual global desde 1979).

export async function loadCo2(baseUrl, fetchImpl = fetch) {
  const res = await fetchImpl(`${baseUrl}data/co2.json`);
  if (!res.ok) throw new Error(`co2.json HTTP ${res.status}`);
  return res.json();
}

const mean = (xs) => {
  const v = xs.filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * CO2 para el relato: decada de 1950 (promedio anual, no hay mensual) y los
 * mismos anios del periodo reciente de temperatura, en el mes del cumpleanos.
 * Si un mes aun no esta publicado se usa el ultimo mes disponible de ese anio
 * y se marca `approx`.
 */
export function co2ForStory(data, { month, pastYears, recentYears }) {
  const annual = data.annual_pre1979.values;
  const monthly = data.monthly_from_1979.values;
  const past = pastYears.map((y) => ({ year: y, ppm: annual[y] ?? null }));
  const last = data.monthly_from_1979.last;
  const recent = recentYears.map((y) => {
    const key = `${y}-${String(month).padStart(2, '0')}`;
    if (key in monthly) return { year: y, ppm: monthly[key], approx: false };
    if (key > last && last.startsWith(String(y))) return { year: y, ppm: monthly[last], approx: true, period: last };
    return { year: y, ppm: null, approx: false };
  });
  const round = (v) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    past: { mean: round(mean(past.map((p) => p.ppm))), series: past },
    recent: { mean: round(mean(recent.map((p) => p.ppm))), series: recent },
    scope: 'global'
  };
}
