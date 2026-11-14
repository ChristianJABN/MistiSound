// Descripcion en texto (y para voz) de lo que la Jukebox EIC "ve" en un frame
// y de como lo convierte en sonido. Pura salvo i18n: misma frase en pantalla
// (aria-live) y en la narracion opt-in, para personas ciegas o con baja vision.
import { t } from '../i18n/index.js';
import { WARM_THRESHOLD_C } from './frame-analysis.js';
import { COLUMN_SECONDS } from './frame-sonification.js';

/** Region amplia por la que pasa una franja vertical del mapa (aprox.). */
export function regionKeyForLongitude(lon) {
  if (lon < -110) return 'eicRegionPacific';
  if (lon < -30) return 'eicRegionAmericas';
  if (lon < 60) return 'eicRegionEuropeAfrica';
  if (lon < 150) return 'eicRegionAsia';
  return 'eicRegionOceania';
}

export function formatSigned(value, lang, digits = 1) {
  const abs = Math.abs(value).toLocaleString(lang === 'en' ? 'en-US' : 'es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  return `${value < 0 ? '−' : '+'}${abs}`;
}

export function formatLongitude(lon, lang) {
  const deg = Math.round(Math.abs(lon) / 5) * 5;
  if (deg === 0) return '0°';
  const side = lon < 0 ? t(lang, 'eicWest') : t(lang, 'eicEast');
  return `${deg}° ${side}`;
}

const pct = (share) => Math.round(share * 100);

/** Frases (en orden) que describen el frame analizado. */
export function describeFrame(analysis, frame, lang) {
  const { overall, bands, columns } = analysis;
  const period = lang === 'en' ? frame.period.label_en : frame.period.label_es;
  const lines = [t(lang, 'eicFrameIntro', { period })];
  if (overall.count === 0) {
    lines.push(t(lang, 'eicFrameUnreadable'));
    return lines;
  }
  lines.push(
    t(lang, 'eicFrameShares', {
      warm: pct(overall.warmShare),
      threshold: formatSigned(WARM_THRESHOLD_C, lang, 0),
      cool: pct(overall.coolShare)
    })
  );
  const band = (b) => (b.mean === null ? '—' : formatSigned(b.mean, lang));
  lines.push(t(lang, 'eicFrameBands', { north: band(bands.north), tropics: band(bands.tropics), south: band(bands.south) }));
  if (analysis.hottestColumn !== null && analysis.coolestColumn !== null) {
    const hot = columns[analysis.hottestColumn];
    const cold = columns[analysis.coolestColumn];
    lines.push(
      t(lang, 'eicFrameExtremes', {
        hotRegion: t(lang, regionKeyForLongitude(hot.longitude)),
        hotLon: formatLongitude(hot.longitude, lang),
        coldRegion: t(lang, regionKeyForLongitude(cold.longitude)),
        coldLon: formatLongitude(cold.longitude, lang)
      })
    );
  }
  if (overall.saturatedHighShare >= 0.05) {
    lines.push(
      t(lang, 'eicFrameSaturated', {
        share: pct(overall.saturatedHighShare),
        max: formatSigned(analysis.legendRange.max, lang, 0)
      })
    );
  }
  return lines;
}

/** Como suena (constante para todos los frames: es la regla musical). */
export function describeSoundRule(columnCount, lang) {
  return t(lang, 'eicSoundRule', { seconds: Math.round(columnCount * COLUMN_SECONDS) });
}

/** Anuncio corto para la franja que esta sonando (lector de pantalla, opcional). */
export function describeColumn(column, lang) {
  const where = `${t(lang, regionKeyForLongitude(column.longitude))} (${formatLongitude(column.longitude, lang)})`;
  if (column.mean === null) return t(lang, 'eicColumnSilent', { where });
  return t(lang, 'eicColumnValue', { where, value: formatSigned(column.mean, lang) });
}
