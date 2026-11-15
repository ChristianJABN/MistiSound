// Funcion de Netlify: POST /api/tts { text, lang, rate } -> audio/mpeg.
// La clave se configura en Netlify > Site configuration > Environment
// variables > ELEVENLABS_API_KEY (nunca en el codigo). Ver docs/relator-elevenlabs.md.
import { handleTts } from '../../server/tts-core.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const out = await handleTts(body, { apiKey: process.env.ELEVENLABS_API_KEY });
  if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
  return new Response(out.audio, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' }
  });
};

export const config = { path: '/api/tts' };
