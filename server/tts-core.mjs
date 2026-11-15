// Relator de Misti Sound con ElevenLabs, del lado del SERVIDOR. La clave
// (ELEVENLABS_API_KEY) vive solo en variables de entorno: nunca llega al
// navegador ni al repositorio. Este modulo lo usan la funcion de Netlify
// (netlify/functions/tts.mjs) y el servidor de desarrollo (vite.config.js).
//
// Limites para que nadie gaste los creditos con textos arbitrarios:
// solo 'es' / 'en', texto corto, voz y modelo fijos del lado del servidor.

export const MAX_CHARS = 420;
export const VOICES = {
  // Brian · Deep, Resonant and Comforting (premade, voz grave de narrador)
  en: 'nPczCjzI2devNBz1zQrb',
  // Diego · latinoamericano, narracion (voz de narrador masculina)
  es: 'J3JSkWXJwqClE1dIxQM9'
};
export const MODEL_ID = 'eleven_multilingual_v2';

/** Valida el cuerpo { text, lang, rate }. Devuelve { ok, text, lang, speed } o { ok:false, status, error }. */
export function validateTtsRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'body' };
  const lang = body.lang === 'es' ? 'es' : body.lang === 'en' ? 'en' : null;
  if (!lang) return { ok: false, status: 400, error: 'lang' };
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return { ok: false, status: 400, error: 'text' };
  if (text.length > MAX_CHARS) return { ok: false, status: 413, error: 'too_long' };
  const rate = Number(body.rate);
  // ElevenLabs acepta speed 0.7..1.2: el relato usa 0.88 (pasado) .. 1.
  const speed = Number.isFinite(rate) ? Math.min(1.15, Math.max(0.8, rate)) : 1;
  return { ok: true, text, lang, speed };
}

/** Pide el audio a ElevenLabs. Devuelve { ok, audio: ArrayBuffer } o { ok:false, status, error }. */
export async function synthesize({ text, lang, speed = 1 }, { apiKey, voices = VOICES, fetchImpl = fetch } = {}) {
  if (!apiKey) return { ok: false, status: 503, error: 'no_key' };
  const voiceId = (lang === 'es' ? process.env.ELEVENLABS_VOICE_ES : process.env.ELEVENLABS_VOICE_EN) || voices[lang];
  // Un fallo de red (sin conexion, demora) NUNCA debe lanzar: se responde
  // 504 y el navegador reintenta. Antes tumbaba el servidor de desarrollo.
  let res;
  try {
    res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      // Voz serena y estable, con algo de expresividad para que suene humana.
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true, speed }
    }),
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined
    });
    if (!res.ok) return { ok: false, status: res.status === 401 ? 502 : res.status, error: `elevenlabs_${res.status}` };
    return { ok: true, audio: await res.arrayBuffer() };
  } catch {
    return { ok: false, status: 504, error: 'network' };
  }
}

/** Cache en memoria (el mismo texto no se paga dos veces mientras viva la instancia). */
const cache = new Map();
const CACHE_MAX = 200;

export async function handleTts(body, opts) {
  const v = validateTtsRequest(body);
  if (!v.ok) return v;
  const key = `${v.lang}|${v.speed}|${v.text}`;
  if (cache.has(key)) return { ok: true, audio: cache.get(key), cached: true };
  const out = await synthesize(v, opts);
  if (out.ok) {
    cache.set(key, out.audio);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  return out;
}
