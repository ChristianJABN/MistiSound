// Frases de la intro de Misti Sound. Modulo PURO: arma 3 frases (apertura,
// reflexion, cierre) personalizadas con el lugar y la fecha del usuario,
// eligiendo una variacion distinta cada vez. Cada frase se devuelve como
// segmentos { text, hl } para resaltar lo personal (lugar, fecha, anios).

const POOLS = {
  es: {
    open: [
      '{date}. {place}. Aquí empieza tu historia.',
      'Volvamos a {place}, al {date}…',
      'Hace {age} años, el mundo te recibió en {place}.',
      'Era {season} en {place} cuando llegaste.',
      'Cierra los ojos. Es {date} en {place}.'
    ],
    middle: [
      'Cada rincón del planeta guarda una melodía. La tuya suena en {place}.',
      'Desde {year}, la Tierra ha cambiado de tono.',
      'En {age} años, el aire, el ozono y el calor cuentan una historia.',
      '{decade}: así empezaba a sonar tu década.',
      'El cielo que viste al nacer también tiene voz.'
    ],
    close: [
      'Escuchando el CO₂, el ozono y la temperatura de tu fecha…',
      'Sintonizando datos reales de NASA para {place}…',
      'Afinando el planeta solo para ti…'
    ],
    seasons: ['verano', 'otoño', 'invierno', 'primavera'],
    date: ({ day, monthName, year }) => `${day} de ${monthName} de ${year}`,
    decade: (d) => `Los ${d >= 2000 ? d : String(d).slice(2)}`
  },
  en: {
    open: [
      '{date}. {place}. This is where your story begins.',
      "Let's go back to {place}, on {date}…",
      '{age} years ago, the world welcomed you in {place}.',
      'It was {season} in {place} when you arrived.',
      'Close your eyes. It is {date} in {place}.'
    ],
    middle: [
      'Every corner of the planet holds a melody. Yours plays in {place}.',
      'Since {year}, Earth has changed its tune.',
      'In {age} years, air, ozone and heat tell a story.',
      '{decade}: this is how your decade began to sound.',
      'The sky you saw when you were born has a voice too.'
    ],
    close: [
      'Listening to the CO₂, ozone and temperature of your date…',
      'Tuning into real NASA data for {place}…',
      'Tuning the planet just for you…'
    ],
    seasons: ['summer', 'autumn', 'winter', 'spring'],
    date: ({ day, monthName, year }) => `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${day}, ${year}`,
    decade: (d) => `The ${d >= 2000 ? `${d}s` : `'${String(d).slice(2)}s`}`
  }
};

/** Estacion (indice en seasons: verano, otono, invierno, primavera) segun mes y hemisferio. */
export function seasonIndex(month, lat) {
  // Hemisferio norte: dic-feb invierno, mar-may primavera, jun-ago verano, sep-nov otono.
  const north = [2, 2, 3, 3, 3, 0, 0, 0, 1, 1, 1, 2][month - 1];
  if (north === undefined) return null;
  return lat < 0 ? [2, 3, 0, 1][north] : north;
}

/** Variables disponibles para las plantillas (solo las que tienen dato). */
export function introVars(lang, info = {}, now = new Date()) {
  const pool = POOLS[lang] ?? POOLS.es;
  const vars = {};
  const { place, day, month, monthName, year, lat } = info;
  if (place) vars.place = place;
  if (year) {
    vars.year = String(year);
    vars.decade = pool.decade(Math.floor(year / 10) * 10);
    const age = now.getFullYear() - year;
    if (age >= 2) vars.age = String(age);
  }
  if (day && monthName && year) vars.date = pool.date({ day, monthName, year });
  if (month && Number.isFinite(lat)) {
    const s = seasonIndex(month, lat);
    if (s !== null) vars.season = pool.seasons[s];
  }
  return vars;
}

const tokens = (tpl) => [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** Plantilla -> segmentos { text, hl }. */
export function fillTemplate(tpl, vars) {
  const out = [];
  let last = 0;
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) out.push({ text: tpl.slice(last, m.index), hl: false });
    out.push({ text: vars[m[1]], hl: true });
    last = m.index + m[0].length;
  }
  if (last < tpl.length) out.push({ text: tpl.slice(last), hl: false });
  return out;
}

/**
 * Tres frases personalizadas: apertura, reflexion y cierre. No repite la
 * misma variable "fuerte" (edad) en dos frases seguidas.
 */
export function buildIntroLines(lang, info = {}, { random = Math.random, now = new Date() } = {}) {
  const pool = POOLS[lang] ?? POOLS.es;
  const vars = introVars(lang, info, now);
  const usable = (tpl) => tokens(tpl).every((k) => vars[k]);
  const pick = (list) => (list.length ? list[Math.floor(random() * list.length) % list.length] : null);
  const open = pick(pool.open.filter(usable));
  const usedAge = open ? tokens(open).includes('age') : false;
  const middle = pick(pool.middle.filter((tpl) => usable(tpl) && !(usedAge && tokens(tpl).includes('age'))));
  const close = pick(pool.close.filter(usable));
  return [open, middle, close].filter(Boolean).map((tpl) => fillTemplate(tpl, vars));
}
