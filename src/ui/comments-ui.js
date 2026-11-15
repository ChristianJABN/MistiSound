// Seccion publica de comentarios (debajo de "Tu historia"): mensajes para
// quien nace hoy y experiencias. Lee y escribe /api/comments (Netlify Blobs
// en el sitio publicado, memoria en desarrollo). El texto se pinta siempre
// con textContent (nunca HTML).
import { t } from '../i18n/index.js';

export function createComments({ store, endpoint = '/api/comments', fetchImpl = (...a) => fetch(...a) }) {
  const $ = (id) => document.getElementById(id);
  const list = $('comments-list');
  const empty = $('comments-empty');
  if (!list) return { render() {}, post: async () => ({ ok: false }) };
  let items = [];
  let filter = 'all';
  let loaded = false;
  const lang = () => store.get().lang;

  function ago(iso) {
    const diff = (Date.parse(iso) - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(lang() === 'en' ? 'en' : 'es', { numeric: 'auto' });
    for (const [unit, sec] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
    }
    return rtf.format(0, 'minute');
  }

  function draw() {
    const l = lang();
    list.replaceChildren();
    const shown = items.filter((c) => filter === 'all' || c.type === filter);
    for (const c of shown) {
      const li = document.createElement('li');
      li.className = `comment-card comment-${c.type}`;
      const head = document.createElement('p');
      head.className = 'comment-head';
      const tag = document.createElement('span');
      tag.className = 'comment-tag';
      tag.textContent = t(l, c.type === 'future' ? 'commentsTagFuture' : 'commentsTagExperience');
      const who = document.createElement('span');
      who.className = 'comment-who';
      who.textContent = [c.name || t(l, 'expAnon'), c.place, c.year ? t(l, 'commentsBorn', { year: c.year }) : null].filter(Boolean).join(' · ');
      head.append(tag, who);
      const text = document.createElement('p');
      text.className = 'comment-text';
      text.textContent = `“${c.text}”`;
      const when = document.createElement('p');
      when.className = 'comment-when';
      when.textContent = ago(c.at);
      li.append(head, text, when);
      list.append(li);
    }
    if (empty) empty.hidden = shown.length > 0 || !loaded;
    for (const b of document.querySelectorAll('.comments-filter button')) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  }

  async function load() {
    try {
      const res = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
      if (res.ok) items = (await res.json()).items ?? [];
    } catch {
      // sin conexion: se queda lo que habia
    }
    loaded = true;
    draw();
  }

  /** Publica { type, name, place, year, text }. Devuelve { ok, error? }. */
  async function post(comment) {
    try {
      const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(comment) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? 'error' };
      items = [data.comment, ...items.filter((c) => c.id !== data.comment.id)];
      draw();
      return { ok: true };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  for (const b of document.querySelectorAll('.comments-filter button')) {
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      draw();
    });
  }
  document.addEventListener('misti:reveal', load);
  document.addEventListener('misti:comments-refresh', load);
  let lastLang = null;

  return {
    post,
    load,
    render(state) {
      if (state.lang !== lastLang) {
        lastLang = state.lang;
        if (loaded) draw();
      }
    }
  };
}
