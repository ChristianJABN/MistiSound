import { describe, it, expect, vi } from 'vitest';
import {
  validateBirthday,
  storyWindows,
  loadStoryResult,
  buildBirthdayStory,
  storyAnnouncement,
  reflectionMessage,
  formatBirthday
} from '../src/history/story-core.js';
import { planPast, planRecent, recentBpm, noteToMidi, midiToNote, PAST_BPM, RECENT_MAX_BPM } from '../src/history/story-music.js';
import { recentBirthdayDate, imageryForEpoch, gibsTemplateUrl, PAST_IMAGERY } from '../src/globe/dated-imagery.js';
import { createHistoryController } from '../src/history/history-controller.js';
import { createStore, createInitialState } from '../src/state/store.js';
import { GistempRepository } from '../src/data/repository.js';
import es from '../src/i18n/es.json';
import en from '../src/i18n/en.json';

const SHA = 'sha-original';
function makeDataset(period, centre) {
  return {
    dataset: 'GISTEMP v4',
    period,
    units: 'K',
    baseline_period: '1951-1980',
    smoothing_radius_km: 1200,
    grid_resolution_deg: 2,
    axes: { lat_centers: [-1, 0, 1], lon_centers: [-1, 0, 1] },
    values: [0, 0, 0, 0, centre, 0, 0, 0, 0],
    source: { original_file_sha256: SHA }
  };
}

// Enero: 1950-1959 con valores pequenos, 2021-2026 calentando. Noviembre solo hasta 2025.
const VALUES = {};
for (let y = 1950; y <= 1959; y += 1) VALUES[`${y}-01`] = (y % 2 ? 0.1 : -0.1);
Object.assign(VALUES, { '2021-01': 0.9, '2022-01': 1.0, '2023-01': 1.2, '2024-01': 1.6, '2025-01': 1.4, '2026-01': 1.8 });
VALUES['1990-01'] = 0.4;
for (let y = 1950; y <= 1959; y += 1) VALUES[`${y}-11`] = 0;
for (let y = 2021; y <= 2025; y += 1) VALUES[`${y}-11`] = 1;
VALUES['2026-08'] = 2;

function makeRepo(values = VALUES) {
  const periods = Object.keys(values).sort();
  const manifest = { files: periods.map((p) => ({ period: p, path: `gistemp/${p}.json` })) };
  const fetchImpl = vi.fn(async (url) => {
    const period = /(\d{4}-\d{2})\.json$/.exec(url)[1];
    return { ok: true, json: async () => makeDataset(period, values[period]) };
  });
  return { repo: new GistempRepository({ baseUrl: '', manifest, fetchImpl }), fetchImpl };
}

describe('cumpleanos: validacion y ventanas', () => {
  const periods = Object.keys(VALUES);
  it('dia y mes obligatorios, ano opcional', () => {
    expect(validateBirthday({ day: '', month: '1' }, periods)).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateBirthday({ day: '31', month: '2' }, periods)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(validateBirthday({ day: '29', month: '2' }, periods).ok).toBe(true);
    expect(validateBirthday({ day: '14', month: '1' }, periods)).toEqual({ ok: true, day: 14, month: 1, year: null });
    expect(validateBirthday({ day: '14', month: '1', year: '90' }, periods)).toMatchObject({ reason: 'invalidYear' });
    expect(validateBirthday({ day: '14', month: '1', year: '1990' }, periods)).toMatchObject({ ok: true, year: 1990 });
    expect(validateBirthday({ day: '14', month: '1', year: '2030' }, periods)).toMatchObject({ reason: 'afterLatest' });
  });

  it('decada de 1950 y ultimos 5 anios del mismo mes', () => {
    const jan = storyWindows(1, periods);
    expect(jan.past).toHaveLength(10);
    expect(jan.past[0]).toBe('1950-01');
    expect(jan.recent).toEqual(['2022-01', '2023-01', '2024-01', '2025-01', '2026-01']);
    // Noviembre aun no tiene 2026: la ventana reciente termina en 2025.
    expect(storyWindows(11, periods).recent).toEqual(['2021-11', '2022-11', '2023-11', '2024-11', '2025-11']);
  });
});

describe('cumpleanos: lectura atomica y relato', () => {
  it('promedia cada ventana en la misma celda y calcula la diferencia', async () => {
    const { repo } = makeRepo();
    const out = await loadStoryResult({ repository: repo, point: { lat: 0, lon: 0 }, day: 14, month: 1, year: 1990, placeLabel: 'Iquitos' });
    expect(out.ok).toBe(true);
    const r = out.result;
    expect(r.story).toBe(true);
    expect(r.a.value).toBeCloseTo(0, 5);
    expect(r.b.value).toBeCloseTo((1.0 + 1.2 + 1.6 + 1.4 + 1.8) / 5, 4);
    expect(r.delta).toBeCloseTo(1.4, 4);
    expect(r.b.series.map((s) => s.year)).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(r.a.period).toBe('1950-01');
    expect(r.b.period).toBe('2026-01');
    expect(r.birth).toEqual({ period: '1990-01', year: 1990, value: 0.4 });
  });

  it('pocos datos en una ventana => sin promedio (nunca se inventa)', async () => {
    const sparse = { ...VALUES };
    for (let y = 1950; y <= 1955; y += 1) sparse[`${y}-01`] = null;
    const { repo } = makeRepo(sparse);
    const out = await loadStoryResult({ repository: repo, point: { lat: 0, lon: 0 }, day: 1, month: 1 });
    expect(out.result.a.value).toBeNull();
    expect(out.result.delta).toBeNull();
    expect(reflectionMessage(out.result, 'es')).toBe(es.storyReflectNoData);
  });

  it('relato, anuncios y reflexion en ES y EN sin claves sin traducir', async () => {
    const { repo } = makeRepo();
    const { result } = await loadStoryResult({ repository: repo, point: { lat: 0, lon: 0 }, day: 14, month: 1, year: 1990, placeLabel: 'Iquitos' });
    for (const lang of ['es', 'en']) {
      const lines = [...buildBirthdayStory(result, lang), storyAnnouncement(result, 'a', lang), storyAnnouncement(result, 'b', lang), reflectionMessage(result, lang)];
      for (const line of lines) expect(line).not.toMatch(/\{|story[A-Z]/);
    }
    expect(formatBirthday({ day: 14, month: 1 }, 'es')).toBe('14 de enero');
    expect(formatBirthday({ day: 14, month: 1 }, 'en')).toBe('January 14');
    expect(buildBirthdayStory(result, 'es').join(' ')).toContain('más cálido que en los años 50');
  });

  it('todas las claves story* existen en ES y EN', () => {
    const k = (d) => Object.keys(d).filter((x) => x.startsWith('story')).sort();
    expect(k(es)).toEqual(k(en));
  });
});

describe('musica del relato', () => {
  it('pasado: lento y sin tension', () => {
    const p = planPast(0);
    expect(p.bpm).toBe(PAST_BPM);
    expect(p.events.some((e) => e.type === 'tension' || e.type === 'beat')).toBe(false);
    expect(planPast(null)).toBeNull();
  });

  it('presente: mas calor = mas rapido, tope de tempo y tension disonante', () => {
    expect(recentBpm(0, 0)).toBe(72);
    expect(recentBpm(1, 0)).toBeGreaterThan(recentBpm(0.5, 0));
    expect(recentBpm(10, 0)).toBe(RECENT_MAX_BPM);
    const plan = planRecent([{ year: 2022, value: 0.2 }, { year: 2023, value: 1.5 }, { year: 2024, value: null }], 0);
    expect(plan.bars).toHaveLength(3);
    expect(plan.bars[1].bpm).toBeGreaterThan(plan.bars[0].bpm);
    expect(plan.bars[0].tension).toBe(0);
    expect(plan.bars[1].tension).toBeGreaterThan(0);
    expect(plan.bars[2].silent).toBe(true);
    const tensionNotes = plan.events.filter((e) => e.type === 'tension').map((e) => e.note);
    expect(tensionNotes.every((n) => n.includes('#'))).toBe(true);
    // El compas mas calido suena mas agudo.
    const avgMidi = (bar) => {
      const notes = plan.events.filter((e) => e.type === 'melody' && e.time >= bar.time && e.time < bar.time + bar.duration);
      return notes.reduce((s, e) => s + noteToMidi(e.note), 0) / notes.length;
    };
    expect(avgMidi(plan.bars[1])).toBeGreaterThan(avgMidi(plan.bars[0]));
  });

  it('notas <-> midi', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(midiToNote(61)).toBe('C#4');
  });
});

describe('imagen satelital con fecha (GIBS)', () => {
  const today = new Date(Date.UTC(2026, 10, 14));
  it('pasado = Landsat 1985; presente = MODIS del dia del cumpleanos ya disponible', () => {
    expect(imageryForEpoch('a', { day: 14, month: 1 }, today)).toMatchObject({ layer: PAST_IMAGERY.layer, year: 1985 });
    expect(recentBirthdayDate({ day: 14, month: 1 }, today)).toBe('2026-01-14');
    // 13 de noviembre aun no tiene imagen (latencia): se usa 2025.
    expect(recentBirthdayDate({ day: 13, month: 11 }, today)).toBe('2025-11-13');
    expect(recentBirthdayDate({ day: 29, month: 2 }, today)).toBe('2026-02-28');
    expect(recentBirthdayDate({ day: null, month: 3 }, today)).toBe('2026-03-15');
  });

  it('URL WMTS de GIBS en Web Mercator', () => {
    const spec = imageryForEpoch('b', { day: 14, month: 1 }, today);
    expect(gibsTemplateUrl(spec)).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-01-14/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'
    );
  });
});

describe('controlador: relato de cumpleanos', () => {
  function harness() {
    const store = createStore({ ...createInitialState({ lang: 'es' }), activeTab: 'history', audio: { started: true, muted: false, volumeDb: -12 } });
    const { repo } = makeRepo();
    const shown = [];
    const story = [];
    const mixer = {
      setChannel: () => {},
      setSeed: () => {},
      updateData: () => {},
      setStoryEpoch: (s) => story.push(s),
      start: (o) => {
        mixer.lastStart = o;
      },
      stop: () => {}
    };
    const narrator = { speak: vi.fn(), cancel: vi.fn(), isSupported: () => true };
    const controller = createHistoryController({
      store,
      repository: repo,
      audioEngine: { isStarted: () => true },
      narrator,
      createMixer: () => mixer,
      onShowPoint: () => {},
      onShowEpoch: (p, ctx) => {
        shown.push([p, ctx?.which, Boolean(ctx?.silent)]);
        return { ok: true };
      }
    });
    return { store, controller, shown, story, narrator, mixer };
  }

  it('consultar muestra el pasado en el globo SIN sonido; ver hoy tampoco suena', async () => {
    const h = harness();
    const out = await h.controller.submitStory({ place: { lat: 0, lon: 0, label: 'Iquitos' }, day: '14', month: '1', year: '' });
    expect(out.ok).toBe(true);
    await Promise.resolve();
    expect(h.shown[0]).toEqual(['1950-01', 'a', true]);
    expect(h.store.get().history.viewing).toBe('a');
    await h.controller.viewEpoch('b');
    expect(h.shown.at(-1)).toEqual(['2026-01', 'b', true]);
    expect(h.mixer.lastStart).toBeUndefined();
  });

  it('el presente recibe la serie de 5 anios y el valor del pasado; voz mas lenta en el pasado', async () => {
    const h = harness();
    await h.controller.submitStory({ place: { lat: 0, lon: 0 }, day: '14', month: '1' });
    h.controller.setVoice(true);
    await h.controller.playAuto();
    expect(h.story[0].which).toBe('a');
    expect(h.narrator.speak.mock.calls[0][2].rate).toBeLessThan(1);
    h.mixer.lastStart.onEnd();
    expect(h.store.get().history.playing).toMatchObject({ epoch: 'b', phase: 'gap' });
  });

  it('errores de validacion no tocan el store', async () => {
    const h = harness();
    expect(await h.controller.submitStory({ place: { lat: 0, lon: 0 }, day: '', month: '1' })).toMatchObject({ reason: 'empty' });
    expect(h.store.get().history.status).toBe('idle');
  });

  it('un enlace (1950-MM, ultimo MM) se abre como relato sin dia', async () => {
    const h = harness();
    const out = await h.controller.applyShared({ point: { lat: 0, lon: 0 }, a: '1950-01', b: '2026-01' });
    expect(out.ok).toBe(true);
    const r = h.store.get().history.result;
    expect(r.story).toBe(true);
    expect(r.birthday).toEqual({ day: null, month: 1, year: null });
  });
});
