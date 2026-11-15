import { describe, it, expect, vi } from 'vitest';
import { validateTtsRequest, handleTts, synthesize, MAX_CHARS, VOICES } from '../server/tts-core.mjs';
import { createCloudVoice } from '../src/accessibility/narration.js';

describe('relator ElevenLabs: servidor', () => {
  it('solo acepta es/en, texto no vacio y corto; acota el ritmo', () => {
    expect(validateTtsRequest({ text: 'Hola', lang: 'fr' })).toMatchObject({ ok: false, error: 'lang' });
    expect(validateTtsRequest({ text: '   ', lang: 'es' })).toMatchObject({ ok: false, error: 'text' });
    expect(validateTtsRequest({ text: 'a'.repeat(MAX_CHARS + 1), lang: 'en' })).toMatchObject({ ok: false, status: 413 });
    expect(validateTtsRequest({ text: ' Hola   mundo ', lang: 'es', rate: 0.5 })).toEqual({ ok: true, text: 'Hola mundo', lang: 'es', speed: 0.8 });
  });

  it('sin clave responde 503 y nunca llama a ElevenLabs', async () => {
    const fetchImpl = vi.fn();
    expect(await synthesize({ text: 'Hi', lang: 'en' }, { apiKey: '', fetchImpl })).toMatchObject({ ok: false, status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('usa la voz del idioma, el modelo multilingue y cachea el mismo texto', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const a = await handleTts({ text: 'Close your eyes.', lang: 'en', rate: 0.9 }, { apiKey: 'k', fetchImpl });
    const b = await handleTts({ text: 'Close your eyes.', lang: 'en', rate: 0.9 }, { apiKey: 'k', fetchImpl });
    expect(a.ok && b.ok).toBe(true);
    expect(b.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain(VOICES.en);
    expect(init.headers['xi-api-key']).toBe('k');
    expect(JSON.parse(init.body)).toMatchObject({ model_id: 'eleven_multilingual_v2', voice_settings: { speed: 0.9 } });
  });
});

describe('relator ElevenLabs: red', () => {
  it('un fallo de red no lanza (antes tumbaba el servidor): responde 504', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const out = await handleTts({ text: 'Hola', lang: 'es' }, { apiKey: 'k', fetchImpl });
    expect(out).toMatchObject({ ok: false, status: 504, error: 'network' });
  });
});

describe('relator ElevenLabs: navegador', () => {
  it('un fallo desactiva la nube para la visita (vuelve a la voz del navegador)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, headers: { get: () => 'application/json' } }));
    const cloud = createCloudVoice({ fetchImpl });
    expect(await cloud.load('Hola', 'es')).toBeNull();
    expect(cloud.isDisabled()).toBe(true);
    expect(await cloud.load('Otra', 'es')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un 429 (limite de peticiones) se reintenta y NO apaga la nube', async () => {
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n === 1 ? { ok: false, status: 429, headers: { get: () => 'application/json' } } : { ok: true, headers: { get: () => 'audio/mpeg' }, blob: async () => new Blob(['x']) }));
    const cloud = createCloudVoice({ fetchImpl, sleep: async () => {} });
    expect(await cloud.load('Hola', 'es')).toBeTruthy();
    expect(cloud.isDisabled()).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('pide como maximo 2 frases a la vez (fila)', async () => {
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { ok: true, headers: { get: () => 'audio/mpeg' }, blob: async () => new Blob(['x']) };
    });
    const cloud = createCloudVoice({ fetchImpl });
    await Promise.all(['a', 'b', 'c', 'd'].map((t) => cloud.load(t, 'es')));
    expect(peak).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('la misma frase se descarga una sola vez (precarga + reproduccion)', async () => {
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    const fetchImpl = vi.fn(async () => ({ ok: true, headers: { get: () => 'audio/mpeg' }, blob: async () => new Blob(['x']) }));
    const cloud = createCloudVoice({ fetchImpl });
    cloud.preload('Hello', 'en', 0.9);
    const url = await cloud.load('Hello', 'en', 0.9);
    expect(url).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
