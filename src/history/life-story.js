// "Tu historia" (Misti Sound): el relato PERSONAL que acompaña a la musica.
// Modulo PURO. Convierte los datos reales en frases humanas (sin unidades
// tecnicas): una sola cifra por frase, comparada con algo que se siente.
//
// Momentos:  'idle' (antes de escuchar) · 'a' (antes de que llegaras) ·
//            'n' (el dia que naciste) · 'interlude' (silencio antes del
//            presente) · 'b' (hoy) · 'end' (cierre y pregunta).
// Cada frase es una lista de segmentos { text, hl } (hl = lo personal, se
// resalta). Las frases dicen lo que los datos dicen: si tu ciudad se enfrio o
// cambio poco, el texto lo cuenta con la misma calma, sin dramatismo.
import { fillTemplate } from '../ui/intro-lines.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

const T = {
  es: {
    idle: ['Pulsa ▶ y escucha tu vida en la Tierra.'],
    aWarm: 'Antes de que llegaras, cada {month} en {place} era más fresco.',
    aMild: 'Antes de que llegaras, {month} en {place} sonaba casi igual que hoy.',
    aCool: 'Antes de que llegaras, {month} en {place} era un poco más cálido que hoy.',
    aAir: 'El aire era más limpio y el escudo de ozono que protege la piel, más grueso.',
    aAirPlain: 'El aire era más limpio.',
    aListen: 'Escucha cómo sonaba.',
    nListen: 'Escucha el año en que naciste.',
    nFirst: 'El {date} respiraste por primera vez.',
    nFirstNoYear: 'Un {date} respiraste por primera vez.',
    nCo2: 'Ese aire ya traía {pct} más CO₂ que el de tus abuelos en los años 50.',
    interlude: ['Ahora escucha cómo suena hoy.'],
    bWarm: 'Hoy tienes {age} años, y tu ciudad tiene fiebre: cada {month} es {d} más cálido que en los años 50.',
    bMild: 'Hoy tienes {age} años. Tu ciudad se ha entibiado: cada {month} es {d} más cálido que en los años 50.',
    bCool: 'Hoy tienes {age} años. Por ahora, cada {month} en tu ciudad es {d} más fresco que en los años 50: no todo el planeta cambia igual.',
    bWarmNoAge: 'Hoy tu ciudad tiene fiebre: cada {month} es {d} más cálido que en los años 50.',
    bMildNoAge: 'Hoy tu ciudad se ha entibiado: cada {month} es {d} más cálido que en los años 50.',
    bCoolNoAge: 'Por ahora, cada {month} en tu ciudad es {d} más fresco que en los años 50: no todo el planeta cambia igual.',
    bFever: 'Si tu cuerpo subiera {d}, ya tendrías fiebre.',
    bCo2Birth: 'Desde que naciste, donde había {n} moléculas de CO₂, hoy hay {n1}.',
    bCo2Past: 'Desde los años 50, donde había {n} moléculas de CO₂, hoy hay {n1}.',
    endOzone: 'Pero hay algo más: el escudo de ozono que protege tu piel se dañó… y el mundo decidió repararlo. Hoy se está curando.',
    endLife: 'La música que acabas de oír es la de tu vida. La de quien nace hoy aún no está escrita.',
    endQuestion: '¿Qué le dirías a alguien que nace hoy?',
    deg: (d) => `${d.toFixed(1).replace('.', ',')} °C`,
    pct: (p) => `un ${p} %`,
    date: (day, month, year) => `${day} de ${month}${year ? ` de ${year}` : ''}`,
    born: 'Naciste',
    ageLabel: (n) => `${n} años`,
    today: 'Hoy',
    before: 'Años 50'
  },
  en: {
    idle: ['Press ▶ and listen to your life on Earth.'],
    aWarm: 'Before you arrived, every {month} in {place} was cooler.',
    aMild: 'Before you arrived, {month} in {place} sounded almost the same as today.',
    aCool: 'Before you arrived, {month} in {place} was a little warmer than today.',
    aAir: 'The air was cleaner, and the ozone shield that protects our skin was thicker.',
    aAirPlain: 'The air was cleaner.',
    aListen: 'Listen to how it sounded.',
    nListen: 'Listen to the year you were born.',
    nFirst: 'On {date}, you took your first breath.',
    nFirstNoYear: 'On a {date}, you took your first breath.',
    nCo2: 'That air already carried {pct} more CO₂ than your grandparents breathed in the 1950s.',
    interlude: ['Now listen to how today sounds.'],
    bWarm: 'Today you are {age}, and your city has a fever: every {month} is {d} warmer than in the 1950s.',
    bMild: 'Today you are {age}. Your city has grown warmer: every {month} is {d} warmer than in the 1950s.',
    bCool: 'Today you are {age}. For now, every {month} in your city is {d} cooler than in the 1950s: not every place changes the same way.',
    bWarmNoAge: 'Today your city has a fever: every {month} is {d} warmer than in the 1950s.',
    bMildNoAge: 'Today your city has grown warmer: every {month} is {d} warmer than in the 1950s.',
    bCoolNoAge: 'For now, every {month} in your city is {d} cooler than in the 1950s: not every place changes the same way.',
    bFever: 'If your body rose {d}, you would already have a fever.',
    bCo2Birth: 'Since you were born, where there were {n} molecules of CO₂, today there are {n1}.',
    bCo2Past: 'Since the 1950s, where there were {n} molecules of CO₂, today there are {n1}.',
    endOzone: 'But there is something more: the ozone shield that protects your skin was damaged… and the world decided to repair it. Today it is healing.',
    endLife: 'The music you just heard is the music of your life. The music of someone born today is not yet written.',
    endQuestion: 'What would you tell someone born today?',
    deg: (d) => `${d.toFixed(1)} °C`,
    pct: (p) => `${p}%`,
    date: (day, month, year) => `${month} ${day}${year ? `, ${year}` : ''}`,
    born: 'Born',
    ageLabel: (n) => `${n} years`,
    today: 'Today',
    before: '1950s'
  }
};

/** Edad cumplida en `now` (o null sin anio). */
export function ageAt({ day, month, year }, now = new Date()) {
  if (!year) return null;
  const y = now.getUTCFullYear();
  const passed = now.getUTCMonth() + 1 > month || (now.getUTCMonth() + 1 === month && now.getUTCDate() >= (day ?? 1));
  return Math.max(0, y - year - (passed ? 0 : 1));
}

/** "Donde habia n, hoy hay n+1": proporcion de aumento en numeros enteros pequenos. */
export function moleculeRatio(before, now) {
  if (!isNum(before) || !isNum(now) || now <= before) return null;
  const n = Math.round(before / (now - before));
  if (n < 1 || n > 60) return null;
  return { n, n1: n + 1 };
}

const warmth = (delta) => (!isNum(delta) ? null : delta >= 0.5 ? 'Warm' : delta >= 0 ? 'Mild' : 'Cool');

/** Variables personales comunes. */
function vars(lang, result, now) {
  const L = T[lang] ?? T.es;
  const { day, month, year } = result.birthday;
  const monthName = (MONTHS[lang] ?? MONTHS.es)[month - 1];
  const place = (result.placeLabel ?? '').split(',')[0].trim() || (lang === 'en' ? 'your city' : 'tu ciudad');
  const age = ageAt(result.birthday, now);
  return { L, monthName, place, age, date: L.date(day ?? 15, monthName, year) };
}

/** Frases de un momento: 'idle' | 'a' | 'n' | 'interlude' | 'b' | 'end'. */
export function lifeLines(moment, { result, data = null, lang = 'es', now = new Date() }) {
  const v = vars(lang, result, now);
  const L = v.L;
  const fill = (tpl, extra = {}) => fillTemplate(tpl, { month: v.monthName, place: v.place, date: v.date, age: v.age == null ? '' : String(v.age), ...extra });
  const plain = (text) => [{ text, hl: false }];
  const co2 = data?.co2;
  const oz = data?.ozone;
  const w = warmth(result.delta);
  if (moment === 'idle') return L.idle.map(plain);
  if (moment === 'interlude') return L.interlude.map(plain);
  if (moment === 'a') {
    const lines = [];
    if (w) lines.push(fill(L[`a${w}`]));
    const ozThinner = isNum(oz?.past?.mean) && isNum(oz?.recent?.mean) && oz.past.mean > oz.recent.mean;
    lines.push(plain(ozThinner ? L.aAir : L.aAirPlain));
    lines.push(plain(L.aListen));
    return lines;
  }
  if (moment === 'n') {
    const lines = [fill(result.birthday.year ? L.nFirst : L.nFirstNoYear)];
    const birth = co2?.birth?.ppm;
    const past = co2?.past?.mean;
    if (isNum(birth) && isNum(past) && birth > past) {
      lines.push(fill(L.nCo2, { pct: L.pct(Math.round(((birth - past) / past) * 100)) }));
    }
    lines.push(plain(L.nListen));
    return lines;
  }
  if (moment === 'b') {
    const lines = [];
    if (w) {
      const d = L.deg(Math.abs(result.delta));
      const key = `b${w}${v.age == null ? 'NoAge' : ''}`;
      lines.push(fill(L[key], { d }));
      if (w === 'Warm') lines.push(fill(L.bFever, { d }));
    }
    const birth = co2?.birth?.ppm;
    const ratio = moleculeRatio(isNum(birth) ? birth : co2?.past?.mean, co2?.recent?.mean);
    if (ratio) lines.push(fill(isNum(birth) ? L.bCo2Birth : L.bCo2Past, { n: String(ratio.n), n1: String(ratio.n1) }));
    // La musica de hoy suena despues de la voz: el narrador la presenta.
    lines.push(...L.interlude.map(plain));
    return lines;
  }
  if (moment === 'end') return [plain(L.endOzone), plain(L.endLife)];
  return [];
}

export function endQuestion(lang) {
  return (T[lang] ?? T.es).endQuestion;
}

/**
 * Linea de tu vida: de los anios 50 a hoy, con tu nacimiento y cada decada
 * de tu edad. `warmth` 0..1 = cuanto CO2 habia ese anio (para el color del
 * punto; el valor exacto va en `ppm`, solo para el titulo emergente).
 */
export function lifeTimeline({ result, data = null, lang = 'es', now = new Date() }) {
  const L = T[lang] ?? T.es;
  const startYear = 1955;
  const endYear = now.getUTCFullYear();
  const history = data?.co2?.history ?? [];
  const ppmAt = (y) => history.find((h) => h.year === y)?.ppm ?? (y >= endYear ? history.at(-1)?.ppm ?? null : null);
  const heat = (ppm) => (isNum(ppm) ? Math.max(0, Math.min(1, (ppm - 310) / (430 - 310))) : null);
  const pos = (y) => Math.max(0, Math.min(1, (y - startYear) / (endYear - startYear)));
  const points = [{ key: 'a', label: L.before, year: startYear, x: 0 }];
  const by = result.birthday.year;
  if (by) {
    points.push({ key: 'n', label: L.born, year: by, x: pos(by) });
    for (let age = 10; by + age < endYear - 2; age += 10) points.push({ key: `age${age}`, label: L.ageLabel(age), year: by + age, x: pos(by + age) });
  }
  points.push({ key: 'b', label: L.today, year: endYear, x: 1 });
  return points.map((p) => {
    const ppm = ppmAt(p.key === 'a' ? 1955 : p.year);
    return { ...p, ppm, warmth: heat(ppm) };
  });
}
