// Funcion de Netlify: POST /api/tts { text, lang, rate } -> audio/mpeg.
// La clave se configura en Netlify > Site configuration > Environment
// variables > ELEVENLABS_API_KEY (nunca en el codigo). Ver docs/relator-elevenlabs.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleTts } from '../../server/tts-core.mjs';

// Clave: variable de entorno de Netlify, o el archivo local
// server/.elevenlabs-key (ignorado por git) que viaja dentro de la funcion
// cuando se publica con `netlify deploy` desde la PC del equipo. Nunca llega
// al navegador ni a GitHub.
let fileKey;
function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (fileKey === undefined) {
    fileKey = '';
    for (const base of [process.cwd(), process.env.LAMBDA_TASK_ROOT, '/var/task'].filter(Boolean)) {
      try {
        fileKey = readFileSync(join(base, 'server', '.elevenlabs-key'), 'utf8').trim();
        if (fileKey) break;
      } catch {
        // sin archivo en esta ruta
      }
    }
  }
  return fileKey;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const out = await handleTts(body, { apiKey: apiKey() });
  if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
  return new Response(out.audio, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400', 'X-AI-Generated': 'ElevenLabs text-to-speech (narrator voice)' }
  });
};

export const config = { path: '/api/tts' };
