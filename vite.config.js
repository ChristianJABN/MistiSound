import { defineConfig, loadEnv } from 'vite';
import { handleTts } from './server/tts-core.mjs';
import { createCommentsService, memoryStore } from './server/comments-core.mjs';

// En desarrollo, /api/tts responde igual que la funcion de Netlify
// (netlify/functions/tts.mjs), leyendo ELEVENLABS_API_KEY de .env (ignorado
// por git). La clave nunca se incluye en el bundle del navegador.
function ttsDevServer() {
  return {
    name: 'misti-tts-dev',
    configureServer(server) {
      // Comentarios en desarrollo: en memoria (en Netlify van a Netlify Blobs).
      const comments = createCommentsService(memoryStore());
      server.middlewares.use('/api/comments', (req, res) => {
        const send = (status, data) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        if (req.method === 'GET') return void comments.list().then((items) => send(200, { items }));
        if (req.method !== 'POST') return send(405, { error: 'method' });
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', async () => {
          let body = null;
          try {
            body = JSON.parse(raw);
          } catch {
            // lo rechaza la validacion
          }
          const out = await comments.add(body, { ip: req.socket.remoteAddress });
          if (out.ok) send(201, { comment: out.comment });
          else send(out.status, { error: out.error });
        });
      });
      const env = loadEnv(server.config.mode, server.config.root, '');
      server.middlewares.use('/api/tts', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', async () => {
          let body = null;
          try {
            body = JSON.parse(raw);
          } catch {
            // cuerpo invalido: lo rechaza la validacion
          }
          let out;
          try {
            out = await handleTts(body, { apiKey: env.ELEVENLABS_API_KEY });
          } catch {
            out = { ok: false, status: 500, error: 'tts' };
          }
          if (!out.ok) {
            res.statusCode = out.status;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: out.error }));
          }
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('X-AI-Generated', 'ElevenLabs text-to-speech (narrator voice)');
          res.end(Buffer.from(out.audio));
        });
      });
    }
  };
}

// CesiumJS necesita sus assets estaticos (Workers, ThirdParty, Assets,
// Widgets): se copian a public/cesium/ ANTES de vite/vite build via
// scripts/prepare-cesium-assets.mjs (hooks "predev"/"prebuild" en
// package.json), y de ahi Vite los sirve/copia como cualquier otro archivo
// de public/ sin necesidad de un plugin dedicado. Antes se usaba
// vite-plugin-static-copy, pero su dependencia chokidar->braces tenia 3
// avisos "high" en `npm audit` (GHSA-vfj7-8cjw-p6xm); como estos archivos no
// cambian durante el desarrollo, no hace falta un plugin con watcher.
export default defineConfig({
  base: './',
  plugins: [ttsDevServer()],
  server: {
    fs: {
      allow: ['..']
    }
  },
  build: {
    // Vite 8 usa Rolldown (no Rollup) como bundler de produccion:
    // `rollupOptions.output.manualChunks` (la API clasica de Rollup) no
    // separa nada aqui porque Rolldown expone su propia API de chunking,
    // `advancedChunks` (ver aviso del propio build: "Use
    // build.rolldownOptions.output.codeSplitting"). Cesium (~1MB+
    // minificado) es, por lejos, la dependencia mas pesada del bundle:
    // separarlo en su propio chunk no cambia ningun comportamiento (mismo
    // codigo, misma carga final), solo permite que el navegador lo cachee
    // independientemente del resto de la app (que cambia mas seguido) en
    // despliegues posteriores. No es un downgrade ni toca dependencias.
    rolldownOptions: {
      output: {
        codeSplitting: {
          // No se ancla a "node_modules/cesium/" exacto: Vite puede
          // pre-empaquetar la dependencia a traves de su cache de
          // optimizeDeps antes de que Rolldown la vea, cambiando la ruta
          // intermedia del id (verificado: un test anclado a esa ruta
          // exacta no separaba nada; "cesium" sin anclar si). El unico
          // archivo propio que tambien matchea por nombre es
          // src/bootstrap-cesium.js, que es deseable que viaje en este
          // mismo chunk de todas formas (es la inicializacion de Cesium).
          groups: [{ name: 'cesium', test: /cesium/i }]
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
