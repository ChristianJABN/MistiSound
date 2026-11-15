// Cuando "Tu fecha" tiene un resultado, carga las otras dos capas para la
// misma ciudad y el mismo mes: CO2 (global, archivo local) y ozono (OMI via
// GIBS). Escribe en store.history.layers = { key, status, data }. Una
// consulta nueva invalida la anterior (por `key`); un fallo de una capa no
// bloquea la otra ni la temperatura.
import { loadCo2, co2ForStory } from './co2.js';
import { ozoneForStory, parseColormap, loadImagePixels, OZONE_COLORMAP_URL } from './ozone.js';

export function createLayersLoader({ store, baseUrl, fetchImpl = (...a) => fetch(...a), loadImage = loadImagePixels, today = () => new Date() }) {
  let co2Promise = null;
  let colormapPromise = null;
  let currentKey = null;

  const getCo2 = () => (co2Promise ??= loadCo2(baseUrl, fetchImpl).catch((e) => ((co2Promise = null), Promise.reject(e))));
  const getColormap = () =>
    (colormapPromise ??= fetchImpl(OZONE_COLORMAP_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`colormap HTTP ${r.status}`);
        return r.text();
      })
      .then(parseColormap)
      .catch((e) => ((colormapPromise = null), Promise.reject(e))));

  function patch(layers) {
    store.set((s) => ({ history: { ...s.history, layers } }));
  }

  async function load(result) {
    const key = result.key;
    currentKey = key;
    patch({ key, status: 'loading', data: { co2: null, ozone: null } });
    const month = result.birthday.month;
    const pastYears = result.a.series.map((s) => s.year);
    const recentYears = result.b.series.map((s) => s.year);
    const [co2, ozone] = await Promise.allSettled([
      getCo2().then((data) => co2ForStory(data, { month, pastYears, recentYears, birthYear: result.birthday.year })),
      getColormap().then((colormap) =>
        ozoneForStory({ lat: result.point.lat, lon: result.point.lon, month, recentYears, birthYear: result.birthday.year, colormap, loadImage, today: today() })
      )
    ]);
    if (currentKey !== key) return;
    const data = {
      co2: co2.status === 'fulfilled' ? co2.value : null,
      ozone: ozone.status === 'fulfilled' ? ozone.value : null
    };
    if (co2.status === 'rejected') console.error('Capa CO2', co2.reason);
    if (ozone.status === 'rejected') console.error('Capa ozono', ozone.reason);
    patch({ key, status: data.co2 || data.ozone ? 'ready' : 'error', data });
  }

  /** Llamar en cada cambio del store. */
  function sync(state) {
    const result = state.history.status === 'ready' ? state.history.result : null;
    if (!result?.story) {
      currentKey = null;
      if (state.history.layers) patch(null);
      return;
    }
    if (currentKey !== result.key) load(result);
  }

  return { sync };
}
