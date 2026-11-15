// Prepara los datos y la imagen de la capa CO2 de Misti Sound.
//
//  - public/data/co2.json
//      * 1850-1978: NASA GISS, CO2 global medio ANUAL (nucleos de hielo
//        ajustados a media global): https://data.giss.nasa.gov/modelforce/ghgases/Fig1A.ext.txt
//      * 1979-hoy: NOAA GML, CO2 global medio MENSUAL (red de superficie):
//        https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_gl.csv
//        (la misma serie que usa NASA Climate "Vital Signs").
//    El CO2 se mezcla bien en la atmosfera: es un dato GLOBAL, igual para
//    cualquier ciudad (la interfaz lo dice).
//  - public/images/layers/co2-dyamond.jpg: NASA SVS 5196 "DYAMOND Global
//    Carbon Dioxide" (galeria Earth Information Center), dominio publico.
//
// Uso: node scripts/prepare_layers.mjs   (Node >= 20, sin dependencias)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GISS_URL = 'https://data.giss.nasa.gov/modelforce/ghgases/Fig1A.ext.txt';
const NOAA_URL = 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_gl.csv';
// Textura equirectangular (2:1) para la esfera de CO2: NASA SVS 5436 'DYAMOND Global
// Carbon Dioxide for Science On A Sphere' (fuentes de CO2 en naranja).
const SOS_URL = 'https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005436/soscomp_1-29-2025a.00200_print.jpg';
const DYAMOND_URL =
  'https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_3x3Hyperwall.00200_print.jpg';

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': 'misti-sound-data-prep' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/** Tabla de GISS: 4 bloques de columnas "Anio MixR" por fila; solo observaciones. */
export function parseGissAnnual(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.matchAll(/(?:^|\s)(1[89]\d\d|20\d\d)\s+(\d{3}\.\d{1,2})/g)) {
      const year = Number(m[1]);
      const ppm = Number(m[2]);
      if (!(year in out)) out[year] = ppm; // primera aparicion = observacion (no escenario)
    }
  }
  return out;
}

export function parseNoaaMonthly(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('year')) continue;
    const [y, m, , avg] = line.split(',');
    const v = Number(avg);
    if (Number.isFinite(v) && v > 0) out[`${y}-${String(m).padStart(2, '0')}`] = v;
  }
  return out;
}

async function main() {
  const [gissText, noaaText, dyamond, sos] = await Promise.all([get(GISS_URL), get(NOAA_URL), get(DYAMOND_URL, 'buffer'), get(SOS_URL, 'buffer')]);
  const annual = parseGissAnnual(gissText);
  const monthly = parseNoaaMonthly(noaaText);
  const annualPre1979 = Object.fromEntries(Object.entries(annual).filter(([y]) => Number(y) < 1979));
  if (!annualPre1979[1950]) throw new Error('GISS: falta 1950');
  const months = Object.keys(monthly).sort();
  const data = {
    schema_version: 1,
    variable: 'global_mean_co2',
    units: 'ppm',
    scope: 'global',
    annual_pre1979: { source: 'NASA GISS (ice core, adjusted to global mean)', url: GISS_URL, values: annualPre1979 },
    monthly_from_1979: { source: 'NOAA GML global marine surface monthly mean', url: NOAA_URL, first: months[0], last: months.at(-1), values: monthly },
    fetched_utc: new Date().toISOString()
  };
  mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'public', 'data', 'co2.json'), `${JSON.stringify(data)}\n`);
  mkdirSync(join(ROOT, 'public', 'images', 'layers'), { recursive: true });
  writeFileSync(join(ROOT, 'public', 'images', 'layers', 'co2-dyamond.jpg'), dyamond);
  writeFileSync(join(ROOT, 'public', 'images', 'layers', 'co2-sphere.jpg'), sos);
  console.log(`co2.json: 1950=${annualPre1979[1950]} ppm, mensual ${months[0]}..${months.at(-1)}; imagen DYAMOND ${dyamond.length} bytes`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
