# Relator con ElevenLabs

Al pulsar **Hear my date / Escuchar mi fecha**, el relator lee la intro, cada
momento (1950, tu año y los últimos 5 años) y la reflexión final con voces de
ElevenLabs:

| Idioma | Voz | ID |
|---|---|---|
| Inglés | George · Warm, Captivating Storyteller | `JBFqnCBsd6RMkjVDRZzb` |
| Español | Luisa · latinoamericana, narración | `ByzPpv6d6pT90CCpgb7k` |

Se usa el modelo `eleven_multilingual_v2`. El pasado se lee más pausado
(0,88) y el presente a ritmo natural (0,97).

## Seguridad: la clave nunca va al navegador

```
navegador ──POST /api/tts {text, lang, rate}──▶ función de Netlify ──▶ ElevenLabs
          ◀──────────── audio/mpeg ────────────
```

- La clave vive solo en el servidor, en la variable de entorno
  `ELEVENLABS_API_KEY`.
- Código:
  - `netlify/functions/tts.mjs`: la función en producción.
  - `vite.config.js`: el mismo servicio en desarrollo.
  - `server/tts-core.mjs`: la lógica que comparten ambos.
- Límites para proteger los créditos:
  - solo se aceptan los idiomas `es` y `en`;
  - cada texto tiene como máximo 420 caracteres;
  - la voz y el modelo se fijan en el servidor;
  - los audios repetidos salen de caché.
- **Respaldo:** si la función no responde (sin clave, sin créditos o sin red),
  la app pasa a la mejor voz del navegador durante esa visita, sin demoras.

## Configuración

**Local:** copia `.env.example` como `.env`, pega la clave y ejecuta
`npm run dev`. El archivo `.env` está en `.gitignore`.

**Netlify (producción):**

1. Ve a *Site configuration → Environment variables → Add a variable*.
2. Crea `ELEVENLABS_API_KEY` con tu clave, para todos los contextos.
3. Opcional: `ELEVENLABS_VOICE_EN` / `ELEVENLABS_VOICE_ES` para cambiar las
   voces.
4. Vuelve a publicar el sitio. La función queda en `/api/tts`.

## Importante

- **Regenera la clave** en ElevenLabs (*Profile → API Keys*) si se compartió
  por chat o por mensajes. Luego actualiza `.env` y Netlify.
- Cada relato completo usa unos 600–900 caracteres de tu cuota de
  ElevenLabs. Revisa tu plan antes de una demo con mucho público.
