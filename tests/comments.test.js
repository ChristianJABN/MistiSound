import { describe, it, expect } from 'vitest';
import { validateComment, createCommentsService, memoryStore, hasProfanity, LIMITS } from '../server/comments-core.mjs';

describe('comentarios: validacion y filtros', () => {
  it('accepts a clean message and trims fields', () => {
    const v = validateComment({ type: 'future', name: '  Ana  ', place: 'Arequipa', year: 1995, text: ' Cuida el  aire que respiras. ' });
    expect(v).toMatchObject({ ok: true, comment: { type: 'future', name: 'Ana', place: 'Arequipa', year: 1995, text: 'Cuida el aire que respiras.' } });
  });

  it('rejects bad type, too short, links and profanity', () => {
    expect(validateComment({ type: 'spam', text: 'hola mundo' }).error).toBe('type');
    expect(validateComment({ type: 'future', text: 'ok' }).error).toBe('text');
    expect(validateComment({ type: 'future', text: 'mira https://x.com' }).error).toBe('links');
    expect(validateComment({ type: 'future', text: 'eres un Imbécil' }).error).toBe('blocked');
    expect(hasProfanity('computadora')).toBe(false); // "puta" dentro de otra palabra no cuenta
  });

  it('caps text length', () => {
    const v = validateComment({ type: 'experience', text: 'a'.repeat(900) });
    expect(v.comment.text.length).toBe(LIMITS.textMax);
  });
});

describe('comentarios: servicio', () => {
  it('newest first, without the ip hash', async () => {
    let t = Date.parse('2026-11-15T12:00:00Z');
    const svc = createCommentsService(memoryStore(), { now: () => (t += 1000) });
    await svc.add({ type: 'future', text: 'primero' }, { ip: '1.1.1.1' });
    await svc.add({ type: 'experience', text: 'segundo' }, { ip: '2.2.2.2' });
    const list = await svc.list();
    expect(list.map((c) => c.text)).toEqual(['segundo', 'primero']);
    expect(list[0]).not.toHaveProperty('who');
  });

  it('rate limit: 3 per person every 10 minutes', async () => {
    let t = Date.parse('2026-11-15T12:00:00Z');
    const svc = createCommentsService(memoryStore(), { now: () => t });
    for (let i = 0; i < 3; i += 1) expect((await svc.add({ type: 'future', text: `mensaje ${i}` }, { ip: '9.9.9.9' })).ok).toBe(true);
    expect(await svc.add({ type: 'future', text: 'otro más' }, { ip: '9.9.9.9' })).toMatchObject({ ok: false, status: 429 });
    expect((await svc.add({ type: 'future', text: 'otra persona' }, { ip: '8.8.8.8' })).ok).toBe(true);
    t += 11 * 60 * 1000;
    expect((await svc.add({ type: 'future', text: 'ya puede' }, { ip: '9.9.9.9' })).ok).toBe(true);
  });

  it('remove by id', async () => {
    const svc = createCommentsService(memoryStore());
    const { comment } = await svc.add({ type: 'future', text: 'borrar esto' }, { ip: 'x' });
    expect((await svc.remove(comment.id)).ok).toBe(true);
    expect(await svc.list()).toEqual([]);
    expect((await svc.remove('nope')).status).toBe(404);
  });
});
