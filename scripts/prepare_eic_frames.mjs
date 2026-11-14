// Prepara los frames EIC (NASA Scientific Visualization Studio) para la
// "Jukebox EIC": descarga los mapas anuales oficiales, los reduce a la mitad
// (960x540) y los guarda como estaticos en public/data/eic/frames/, junto con
// un manifiesto (public/data/eic/frames.json) que declara para cada frame:
// pagina SVS de origen, URL exacta, SHA-256 del original, que representa
// (un anio o un promedio movil), y donde esta la leyenda de color DENTRO de
// la imagen, para que el navegador convierta color -> grados C leyendo la
// propia leyenda de NASA (src/eic/frame-analysis.js).
//
// Por que se copian en vez de leerlos remotos: svs.gsfc.nasa.gov no permite
// CORS para nuestro origen (verificado: Access-Control-Allow-Origin apunta a
// otro dominio), asi que un <canvas> no podria leer sus pixeles. El contenido
// de SVS es de dominio publico (https://svs.gsfc.nasa.gov/help/), con
// credito a NASA SVS.
//
// Uso:  node scripts/prepare_eic_frames.mjs [--offline]
//   --offline  reutiliza las descargas crudas de work/raw-eic-frames/ sin red.
// Sin dependencias: solo Node >= 20 (fetch, zlib, crypto).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, downscaleBox, encodePngRgb } from './lib/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'work', 'raw-eic-frames');
const OUT_DIR = join(ROOT, 'public', 'data', 'eic', 'frames');
const MANIFEST = join(ROOT, 'public', 'data', 'eic', 'frames.json');
const SCALE = 2; // 1920x1080 -> 960x540

// Coordenadas en pixeles del ORIGINAL 1920x1080 (se escalan al escribir el
// manifiesto). Medidas sobre cada imagen descargada: ver docs/eic-jukebox.md.
//  - legend: segmento recto dentro de la barra de color; `from`/`to` son los
//    extremos de la barra y `valueFrom`/`valueTo` su valor en grados C.
//    `sampleFrom`/`sampleTo` evitan marcas de graduacion y flechas.
//  - map: rectangulo que contiene el mapa; `exclude`: zonas dentro de ese
//    rectangulo que NO son mapa (leyenda, textos).
const FRAMES = [
  {
    id: 'gistemp-2025',
    year: 2025,
    svs_id: 5603,
    page_url: 'https://svs.gsfc.nasa.gov/5603/',
    page_title: 'Global Temperature Anomalies from 1880 to 2025',
    source_url: 'https://svs.gsfc.nasa.gov/vis/a000000/a005600/a005603/Map_HD_2025.png',
    period: { kind: 'single-year', label_es: 'Año 2025', label_en: 'Year 2025' },
    representation_source: 'Caption SVS: "2025 Global Temperature Anomalies (smoothed)".',
    colormap: 'vik (azul - blanco - rojo oscuro), -4..+4 C',
    legend: { axis: 'x', fixed: 1013, from: 660, to: 1260, valueFrom: -4, valueTo: 4, sampleFrom: 663, sampleTo: 1257 },
    map: { x0: 118, y0: 112, x1: 1762, y1: 946, exclude: [] }
  },
  {
    id: 'gistemp-2024',
    year: 2024,
    svs_id: 5450,
    page_url: 'https://svs.gsfc.nasa.gov/5450/',
    page_title: 'Global Temperature Anomalies from 1880 to 2024',
    source_url: 'https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005450/2024GISTEMPMap_2K.png',
    period: {
      kind: 'rolling-24-month',
      label_es: 'Promedio móvil de 24 meses que termina en 2024 (2023-2024)',
      label_en: '24-month running average ending in 2024 (2023-2024)'
    },
    representation_source: 'Descripcion SVS: "The maps are averages over a running 24 month window. The final frame represents global temperature anomalies in 2024."',
    colormap: 'giss_navy (azul marino - blanco - amarillo - rojo), -2..+2 C',
    legend: { axis: 'y', fixed: 78, from: 785, to: 1055, valueFrom: 2, valueTo: -2, sampleFrom: 788, sampleTo: 1052 },
    map: { x0: 24, y0: 10, x1: 1900, y1: 960, exclude: [{ x0: 0, y0: 760, x1: 170, y1: 1080 }] }
  },
  {
    id: 'gistemp-2023',
    year: 2023,
    svs_id: 5207,
    page_url: 'https://svs.gsfc.nasa.gov/5207/',
    page_title: 'Global Temperature Anomalies from 1880 to 2023',
    source_url: 'https://svs.gsfc.nasa.gov/vis/a000000/a005200/a005207/2023AverageTemp_HD.png',
    period: { kind: 'single-year', label_es: 'Año 2023', label_en: 'Year 2023' },
    representation_source: 'Caption SVS: "This color-coded map in Robinson projection of the 2023 global surface temperature anomalies."',
    colormap: 'giss_navy (azul marino - blanco - amarillo - rojo), -2..+2 C (misma tabla de color que la pagina lista: giss_navy_anomaly_Vertical-both.png)',
    legend: { axis: 'y', fixed: 99, from: 864, to: 1040, valueFrom: 2, valueTo: -2, sampleFrom: 867, sampleTo: 1037 },
    map: { x0: 24, y0: 16, x1: 1900, y1: 970, exclude: [{ x0: 40, y0: 820, x1: 160, y1: 1080 }] }
  },
  {
    id: 'gistemp-2022',
    year: 2022,
    svs_id: 5060,
    page_url: 'https://svs.gsfc.nasa.gov/5060/',
    page_title: 'Global Temperature Anomalies from 1880 to 2022',
    source_url: 'https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005060/2022GISTEMP-anomaly-notitles.png',
    period: { kind: 'single-year', label_es: 'Año 2022', label_en: 'Year 2022' },
    representation_source: 'Caption SVS: "This image is the single year 2022 GISS temperature anomaly as compared with the 1951-1980 average."',
    colormap: 'giss_navy (azul marino - blanco - amarillo - rojo), -2..+2 C',
    legend: { axis: 'y', fixed: 62, from: 44, to: 254, valueFrom: 2, valueTo: -2, sampleFrom: 47, sampleTo: 251 },
    map: { x0: 0, y0: 0, x1: 1920, y1: 1080, exclude: [{ x0: 0, y0: 0, x1: 100, y1: 290 }] }
  }
];

function scaleLegend(l) {
  const s = (v) => Math.round(v / SCALE);
  return { ...l, fixed: s(l.fixed), from: s(l.from), to: s(l.to), sampleFrom: s(l.sampleFrom), sampleTo: s(l.sampleTo) };
}

function scaleRect(r) {
  const s = (v) => Math.round(v / SCALE);
  return { x0: s(r.x0), y0: s(r.y0), x1: s(r.x1), y1: s(r.y1) };
}

async function fetchRaw(frame, offline) {
  const rawPath = join(RAW_DIR, `${frame.id}.png`);
  if (offline || existsSync(rawPath)) {
    if (!existsSync(rawPath)) throw new Error(`--offline sin descarga previa: ${rawPath}`);
    return { buffer: readFileSync(rawPath), fetched_utc: null, last_modified: null };
  }
  const res = await fetch(frame.source_url, { headers: { 'User-Agent': 'earth-jukebox-data-prep' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${frame.source_url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(rawPath, buffer);
  return { buffer, fetched_utc: new Date().toISOString(), last_modified: res.headers.get('last-modified') };
}

async function main() {
  const offline = process.argv.includes('--offline');
  mkdirSync(OUT_DIR, { recursive: true });
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { frames: [] };
  const out = [];
  for (const frame of FRAMES) {
    const raw = await fetchRaw(frame, offline);
    const sha256 = createHash('sha256').update(raw.buffer).digest('hex');
    const image = decodePng(raw.buffer);
    if (image.width !== 1920 || image.height !== 1080) {
      throw new Error(`${frame.id}: se esperaba 1920x1080, llego ${image.width}x${image.height} (las coordenadas de leyenda ya no valen)`);
    }
    const small = downscaleBox(image, SCALE);
    const fileName = `${frame.id}.png`;
    writeFileSync(join(OUT_DIR, fileName), encodePngRgb(small));
    const prev = previous.frames?.find((f) => f.id === frame.id);
    out.push({
      id: frame.id,
      year: frame.year,
      dataset: 'GISTEMP v4',
      baseline_period: '1951-1980',
      period: frame.period,
      representation_source: frame.representation_source,
      colormap: frame.colormap,
      projection: 'Robinson',
      svs_id: frame.svs_id,
      page_url: frame.page_url,
      page_title: frame.page_title,
      source_url: frame.source_url,
      source_sha256: sha256,
      source_size: `${image.width}x${image.height}`,
      source_last_modified: raw.last_modified ?? prev?.source_last_modified ?? null,
      fetched_utc: raw.fetched_utc ?? prev?.fetched_utc ?? null,
      file: `data/eic/frames/${fileName}`,
      width: small.width,
      height: small.height,
      legend: scaleLegend(frame.legend),
      map: { ...scaleRect(frame.map), exclude: frame.map.exclude.map(scaleRect) },
      credit: 'NASA Scientific Visualization Studio / NASA GISS (GISTEMP v4)'
    });
    console.log(`ok ${frame.id} sha256=${sha256.slice(0, 12)} -> ${fileName} ${small.width}x${small.height}`);
  }
  const manifest = {
    schema_version: 1,
    generated_by: 'scripts/prepare_eic_frames.mjs',
    license_note: 'Contenido de NASA SVS en dominio publico salvo indicacion contraria (https://svs.gsfc.nasa.gov/help/). Credito: NASA Scientific Visualization Studio.',
    reading_note: 'Los valores en grados C que la app deriva de estos frames son una LECTURA VISUAL del color usando la leyenda de cada imagen (aprox.), no el dato numerico de GISTEMP. Cada anio usa su propia escala de color.',
    frames: out
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifiesto: ${MANIFEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
