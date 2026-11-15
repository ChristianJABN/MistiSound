// Funcion de Netlify: comentarios publicos (mensajes para quien nace hoy y
// experiencias), guardados en Netlify Blobs.
//   GET    /api/comments            -> { items: [...] } (los ultimos 100)
//   POST   /api/comments  { type, name, place, year, text } -> { comment }
//   DELETE /api/comments?id=...     (cabecera x-admin-key) -> borra uno
// La clave de administracion vive en server/.comments-admin-key (ignorado
// por git; viaja con `netlify deploy` desde la PC del equipo) o en la
// variable COMMENTS_ADMIN_KEY.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { createCommentsService } from '../../server/comments-core.mjs';

const KEY = 'all';

function blobStore() {
  const store = getStore({ name: 'misti-comments', consistency: 'strong' });
  return {
    load: async () => (await store.get(KEY, { type: 'json' })) ?? [],
    save: (list) => store.setJSON(KEY, list)
  };
}

let adminKey;
function getAdminKey() {
  if (process.env.COMMENTS_ADMIN_KEY) return process.env.COMMENTS_ADMIN_KEY;
  if (adminKey === undefined) {
    adminKey = '';
    for (const base of [process.cwd(), process.env.LAMBDA_TASK_ROOT, '/var/task'].filter(Boolean)) {
      try {
        adminKey = readFileSync(join(base, 'server', '.comments-admin-key'), 'utf8').trim();
        if (adminKey) break;
      } catch {
        // sin archivo en esta ruta
      }
    }
  }
  return adminKey;
}

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export default async (req, context) => {
  const svc = createCommentsService(blobStore());
  try {
    if (req.method === 'GET') return json({ items: await svc.list() });
    if (req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: 'body' }, 400);
      }
      const out = await svc.add(body, { ip: context?.ip ?? req.headers.get('x-nf-client-connection-ip') });
      return out.ok ? json({ comment: out.comment }, 201) : json({ error: out.error }, out.status);
    }
    if (req.method === 'DELETE') {
      const key = getAdminKey();
      if (!key || req.headers.get('x-admin-key') !== key) return json({ error: 'forbidden' }, 403);
      const id = new URL(req.url).searchParams.get('id');
      const out = await svc.remove(id);
      return out.ok ? json({ ok: true }) : json({ error: out.error }, out.status);
    }
    return json({ error: 'method' }, 405);
  } catch {
    return json({ error: 'storage' }, 503);
  }
};

export const config = { path: '/api/comments' };
