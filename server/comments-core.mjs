// Comentarios publicos de Misti Sound: mensajes "para quien nace hoy" y
// experiencias. Logica del SERVIDOR sin dependencias: la usan la funcion de
// Netlify (netlify/functions/comments.mjs, guarda en Netlify Blobs) y el
// servidor de desarrollo (vite.config.js, guarda en memoria).
//
// Se publican al instante con filtros:
//  - nombre <= 40, lugar <= 60, mensaje 3..500 caracteres; sin enlaces;
//  - filtro basico de groserias (es/en): se rechaza el mensaje;
//  - limite por persona: 3 mensajes cada 10 minutos (IP con hash, nunca la IP);
//  - se guardan los ultimos 300.
import { createHash, randomUUID } from 'node:crypto';

export const LIMITS = { name: 40, place: 60, textMin: 3, textMax: 500, keep: 300, list: 100, perWindow: 3, windowMs: 10 * 60 * 1000 };
export const TYPES = ['future', 'experience'];

const BAD_WORDS = [
  'puta', 'puto', 'mierda', 'carajo', 'cojudo', 'concha', 'conchatumadre', 'ctm', 'csm', 'huevon', 'huevón', 'maricon', 'maricón', 'pendejo', 'chucha', 'verga', 'pinga', 'cabron', 'cabrón', 'joder', 'gilipollas', 'imbecil', 'imbécil', 'idiota', 'estupido', 'estúpido', 'zorra', 'perra',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'whore', 'slut', 'nigger', 'faggot', 'retard'
];
const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const BAD_RE = new RegExp(`(^|[^a-z])(${BAD_WORDS.map((w) => normalize(w)).join('|')})([^a-z]|$)`, 'i');

/** Limpia texto: sin caracteres de control, espacios compactados. */
export function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function hasProfanity(text) {
  return BAD_RE.test(normalize(text));
}

/** Valida el cuerpo { type, name, place, year, text }. */
export function validateComment(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'body' };
  const type = TYPES.includes(body.type) ? body.type : null;
  if (!type) return { ok: false, status: 400, error: 'type' };
  const text = clean(body.text, LIMITS.textMax);
  if (text.length < LIMITS.textMin) return { ok: false, status: 400, error: 'text' };
  const name = clean(body.name, LIMITS.name);
  const place = clean(body.place, LIMITS.place);
  if (/https?:\/\/|www\.|\.(com|net|org|ru|xyz)\b/i.test(`${text} ${name} ${place}`)) return { ok: false, status: 400, error: 'links' };
  if (hasProfanity(`${text} ${name} ${place}`)) return { ok: false, status: 400, error: 'blocked' };
  const y = Number(body.year);
  const year = Number.isInteger(y) && y >= 1880 && y <= 2100 ? y : null;
  return { ok: true, comment: { type, name: name || null, place: place || null, year, text } };
}

export const hashIp = (ip, salt = 'misti') => createHash('sha256').update(`${salt}|${ip ?? ''}`).digest('hex').slice(0, 16);

/** Vista publica (sin el hash de la IP). */
const publicView = ({ who, ...c }) => c;

/**
 * Servicio sobre un almacen { load(): Promise<array>, save(array): Promise }.
 * `now` y `ip` se inyectan para poder probarlo.
 */
export function createCommentsService(store, { now = () => Date.now() } = {}) {
  async function list() {
    const all = (await store.load()) ?? [];
    return all.slice(0, LIMITS.list).map(publicView);
  }
  async function add(body, { ip = null } = {}) {
    const v = validateComment(body);
    if (!v.ok) return v;
    const all = (await store.load()) ?? [];
    const who = hashIp(ip);
    const t = now();
    const recent = all.filter((c) => c.who === who && t - Date.parse(c.at) < LIMITS.windowMs).length;
    if (recent >= LIMITS.perWindow) return { ok: false, status: 429, error: 'rate' };
    const comment = { id: randomUUID(), at: new Date(t).toISOString(), ...v.comment, who };
    await store.save([comment, ...all].slice(0, LIMITS.keep));
    return { ok: true, comment: publicView(comment) };
  }
  async function remove(id) {
    const all = (await store.load()) ?? [];
    const next = all.filter((c) => c.id !== id);
    if (next.length === all.length) return { ok: false, status: 404, error: 'not_found' };
    await store.save(next);
    return { ok: true };
  }
  return { list, add, remove };
}

/** Almacen en memoria (desarrollo y tests). */
export function memoryStore(initial = []) {
  let data = [...initial];
  return { load: async () => data, save: async (next) => void (data = next) };
}
