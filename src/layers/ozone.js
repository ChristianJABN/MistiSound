// Capa de ozono (brisa / viento). Columna total de ozono en unidades Dobson
// (DU) de NASA OMI (satelite Aura), servida por NASA GIBS con CORS abierto:
// capa OMI_Ozone_TOMS_Total_Column, diaria desde octubre de 2004.
//
// No existen mediciones satelitales de ozono por ciudad de 1950: el "antes"
// del ozono son los primeros anios completos de OMI (2005-2009) y la interfaz
// lo dice. Para cada anio se leen 3 dias del mes del cumpleanos (5, 15 y 25)
// y se promedian los pixeles con dato alrededor de la ciudad (las franjas sin
// pasada del satelite son transparentes y se ignoran).
//
// El color -> DU usa la tabla oficial de GIBS (cada color = un intervalo de
// 2.5 DU), no una aproximacion.
export const OZONE_LAYER = 'OMI_Ozone_TOMS_Total_Column';
export const OZONE_COLORMAP_URL = `https://gibs.earthdata.nasa.gov/colormaps/v1.3/${OZONE_LAYER}.xml`;
export const OZONE_PAST_YEARS = [2005, 2006, 2007, 2008, 2009];
export const OZONE_DAYS = [5, 15, 25];
const GIBS_4326 = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
// TileMatrixSet "2km", nivel 0: 2 tiles de 512 px que cubren 288 grados cada uno.
const TILE_DEG = 288;
const TILE_PX = 512;

/** XML de GIBS -> Map("r,g,b" -> DU, punto medio del intervalo). */
export function parseColormap(xml) {
  const map = new Map();
  for (const m of xml.matchAll(/<ColorMapEntry\s+rgb="(\d+),(\d+),(\d+)"[^>]*?value="\[([^,]+),([^)\]]+)[)\]]"/g)) {
    const lo = Number(m[4]);
    const hi = Number(m[5]);
    const v = Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : Number.isFinite(lo) ? lo : hi;
    if (Number.isFinite(v)) map.set(`${m[1]},${m[2]},${m[3]}`, v);
  }
  return map;
}

/** Tile (columna) y pixel de lat/lon en el nivel 0 del TileMatrixSet 2km. */
export function ozonePixel(lat, lon) {
  const col = lon < -180 + TILE_DEG ? 0 : 1;
  const x = Math.floor(((lon + 180 - col * TILE_DEG) / TILE_DEG) * TILE_PX);
  const y = Math.floor(((90 - lat) / TILE_DEG) * TILE_PX);
  return { col, x: Math.min(TILE_PX - 1, Math.max(0, x)), y: Math.min(TILE_PX - 1, Math.max(0, y)) };
}

export function ozoneTileUrl(date, col) {
  return `${GIBS_4326}/${OZONE_LAYER}/default/${date}/2km/0/0/${col}.png`;
}

/**
 * Color exacto de la tabla -> DU. Si el navegador altero levemente el color
 * (gestion de color), se acepta el color de tabla mas cercano a distancia <= 6.
 */
export function colorToDu(colormap, r, g, b) {
  const exact = colormap.get(`${r},${g},${b}`);
  if (exact !== undefined) return exact;
  let best = 37; // 6^2 + 1
  let value = null;
  for (const [key, v] of colormap) {
    const [cr, cg, cb] = key.split(',').map(Number);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < best) {
      best = d;
      value = v;
    }
  }
  return value;
}

/** Promedio en DU de una ventana de 5x5 pixeles (solo pixeles opacos con color de la tabla). */
export function readDu(image, x, y, colormap, radius = 2) {
  let sum = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const i = (py * image.width + px) * 4;
      if (image.data[i + 3] < 250) continue;
      const v = colorToDu(colormap, image.data[i], image.data[i + 1], image.data[i + 2]);
      if (v === null) continue;
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Promedio de un anio (3 dias del mes). `loadImage(url)` devuelve
 * { width, height, data } o lanza; `today` evita pedir dias sin publicar.
 */
async function yearValue({ year, month, lat, lon, colormap, loadImage, today }) {
  const { col, x, y } = ozonePixel(lat, lon);
  const limit = new Date(today.getTime() - 3 * 86400000);
  const vals = [];
  await Promise.all(
    OZONE_DAYS.map(async (day) => {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date > limit || date < new Date(Date.UTC(2004, 9, 1))) return;
      try {
        const img = await loadImage(ozoneTileUrl(`${year}-${pad(month)}-${pad(day)}`, col));
        const v = readDu(img, x, y, colormap);
        if (v !== null) vals.push(v);
      } catch {
        // dia sin imagen: se ignora (nunca se inventa)
      }
    })
  );
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export async function ozoneForStory({ lat, lon, month, recentYears, birthYear = null, colormap, loadImage, today = new Date() }) {
  const series = async (years) =>
    Promise.all(years.map(async (year) => ({ year, du: await yearValue({ year, month, lat, lon, colormap, loadImage, today }) })));
  // Tu anio solo tiene ozono si es 2005 o posterior (OMI empieza en oct. 2004).
  const birthYears = birthYear && birthYear >= 2005 ? [birthYear] : [];
  const [past, recent, birthSeries] = await Promise.all([series(OZONE_PAST_YEARS), series(recentYears), series(birthYears)]);
  const avg = (s) => {
    const v = s.map((p) => p.du).filter((d) => d !== null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const birthDu = birthSeries[0]?.du ?? null;
  return {
    birth: birthYear ? { year: birthYear, du: birthDu === null ? null : Math.round(birthDu), measured: birthYear >= 2005 } : null,
    past: { mean: avg(past), series: past, firstYear: OZONE_PAST_YEARS[0], lastYear: OZONE_PAST_YEARS.at(-1) },
    recent: { mean: avg(recent), series: recent },
    source: 'NASA OMI (Aura) via GIBS'
  };
}

/** Carga una imagen con CORS y devuelve sus pixeles (solo navegador). */
export function loadImagePixels(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}
