// Imagen satelital CON FECHA para el relato de cumpleanos (NASA GIBS, gratis,
// sin login, CORS abierto). Se superpone a la capa base Blue Marble (que no
// tiene fecha) solo en la pestana "Tu historia".
//
//  - Pasado: compuesto anual Landsat WELD (~30 m). Es la imagen satelital
//    global MAS ANTIGUA en GIBS (no hay fotos globales de los anios 50): se usa
//    1985 y la interfaz lo dice asi.
//  - Presente: MODIS Terra color real (~250 m) del DIA del cumpleanos en el
//    ultimo anio disponible. Una imagen diaria puede tener nubes y franjas sin
//    pasada del satelite: es la foto real de ese dia.
// Capas y fechas verificadas en
// https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
const GIBS_3857 = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const MODIS_FIRST_DAY = '2000-02-24';
const MODIS_LATENCY_DAYS = 2;

export const PAST_IMAGERY = {
  layer: 'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',
  date: '1985-12-01',
  year: 1985,
  matrixSet: 'GoogleMapsCompatible_Level12',
  maximumLevel: 12,
  satellite: 'Landsat (WELD)',
  kind: 'annual'
};

export const RECENT_IMAGERY = {
  layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
  matrixSet: 'GoogleMapsCompatible_Level9',
  maximumLevel: 9,
  satellite: 'MODIS Terra',
  kind: 'daily'
};

const pad = (n) => String(n).padStart(2, '0');

function isoDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Fecha MODIS del cumpleanos: el anio mas reciente en que ese dia ya tiene
 * imagen (hoy menos la latencia). 29 de febrero en anio no bisiesto => 28.
 */
export function recentBirthdayDate({ day, month }, today = new Date()) {
  const d = day ?? 15;
  const limit = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - MODIS_LATENCY_DAYS));
  for (let y = limit.getUTCFullYear(); y >= 2000; y -= 1) {
    const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
    const candidate = new Date(Date.UTC(y, month - 1, Math.min(d, last)));
    const iso = isoDate(candidate);
    if (candidate <= limit && iso >= MODIS_FIRST_DAY) return iso;
  }
  return null;
}

/** Que imagen mostrar para la epoca 'a' (pasado) o 'b' (presente). */
export function imageryForEpoch(which, birthday, today = new Date()) {
  if (which === 'a') return { ...PAST_IMAGERY };
  const date = recentBirthdayDate(birthday, today);
  return date ? { ...RECENT_IMAGERY, date, year: Number(date.slice(0, 4)) } : null;
}

export function gibsTemplateUrl({ layer, date, matrixSet }) {
  return `${GIBS_3857}/${layer}/default/${date}/${matrixSet}/{z}/{y}/{x}.jpg`;
}

/** Crea la capa de Cesium (Web Mercator) para la imagen elegida. */
export function createDatedImageryLayer(Cesium, viewer, spec) {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: gibsTemplateUrl(spec),
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: spec.maximumLevel,
    credit: new Cesium.Credit(`NASA GIBS · ${spec.satellite} ${spec.date}`)
  });
  // Justo encima de la capa base (indice 1): el overlay de anomalias, si esta
  // visible, queda por encima.
  return viewer.imageryLayers.addImageryProvider(provider, 1);
}
