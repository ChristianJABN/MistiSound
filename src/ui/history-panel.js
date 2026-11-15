// Pestana "Tu historia": formulario (lugar + mes/ano de nacimiento) y
// resultado. Capa fina de DOM sobre history-controller.js: solo lee el
// store, pinta con textContent (nunca innerHTML con datos) y delega.
import { t } from '../i18n/index.js';
import {
  searchCities,
  cityRowToPlace,
  formatPlaceLabel,
  formatCoords,
  formatMonthYear,
  formatDegrees,
  buildStory,
  epochAnnouncement,
  MIN_QUERY_LENGTH
} from '../history/history-core.js';
import {
  buildBirthdayStory,
  storyAnnouncement,
  pastLabel,
  recentLabel,
  reflectionMessage,
  classroomQuestions,
  formatBirthday
} from '../history/story-core.js';
import { shareStoryCard, storyCardText } from './story-card.js';
import { ensureAudio } from '../app/ensure-audio.js';

const VOICE_PREF = 'misti-voice';
function readVoicePref() {
  try {
    return localStorage.getItem(VOICE_PREF);
  } catch {
    return null;
  }
}
function writeVoicePref(v) {
  try {
    localStorage.setItem(VOICE_PREF, v);
  } catch {
    // sin almacenamiento: vale solo en esta visita
  }
}

export function createHistoryPanel({ store, controller, repository, loadCities, getGlobePoint, narrator, audioEngine }) {
  const withAudio = async (fn) => {
    if (audioEngine && !(await ensureAudio({ audioEngine, store }))) return undefined;
    return fn();
  };
  const $ = (id) => document.getElementById(id);
  const form = $('history-form');
  const queryInput = $('history-place-q');
  const searchBtn = $('history-place-search');
  const placeStatus = $('history-place-status');
  const placeResults = $('history-place-results');
  const useGlobeBtn = $('history-use-globe');
  const placeChosen = $('history-place-chosen');
  const monthSelect = $('history-month');
  const yearInput = $('history-year');
  const birthNote = $('history-birth-note');
  const formError = $('history-form-error');
  const latestNote = $('history-latest-note');
  const loadStatus = $('history-load-status');
  const resultSection = $('history-result');
  const resultTitle = $('history-result-title');
  const storyEl = $('history-story');
  const dataEl = $('history-data');
  const summaryEl = $('history-summary');
  const cardAPeriod = $('history-card-a-period');
  const cardAValue = $('history-card-a-value');
  const cardBPeriod = $('history-card-b-period');
  const cardBValue = $('history-card-b-value');
  const cardDelta = $('history-card-delta');
  const listenA = $('history-listen-a');
  const listenB = $('history-listen-b');
  const listenAuto = $('history-listen-auto');
  const repeatBtn = $('history-repeat');
  const stopBtn = $('history-stop');
  const voiceBox = $('history-voice');
  const speakBtn = $('history-speak');
  const playStatus = $('history-play-status');
  const audioHint = $('history-audio-hint');
  const missingEl = $('history-missing');
  const clearBtn = $('history-clear');
  const dayInput = $('history-day');
  const viewA = $('history-view-a');
  const viewB = $('history-view-b');
  const viewN = $('history-view-n');
  const listenN = $('history-listen-n');
  const imageryEl = $('history-imagery');
  const yearsEl = $('history-years');
  const showReflectionBtn = $('history-show-reflection');
  const reflection = $('history-reflection');
  const reflectionTitle = $('history-reflection-title');
  const reflectionText = $('history-reflection-text');
  const cardShare = $('history-card-share');
  const cardDownload = $('history-card-download');
  const cardStatus = $('history-card-status');
  const classList = $('history-class-questions');

  let place = null;
  let reflectionOpen = false;
  let reflectionKey = null;
  let cardStatusKey = null;
  let formErrorKey = null;
  let searchToken = 0;
  let lastSearch = null;
  let monthsLang = null;
  const sigs = new Map();

  const periods = repository.availablePeriods;
  const firstPeriod = periods[0] ?? null;
  const lastPeriod = periods[periods.length - 1] ?? null;

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function lang() {
    return store.get().lang;
  }

  function showFormError(key, params = {}) {
    formErrorKey = key ? { key, params } : null;
    renderFormError();
  }

  function renderFormError() {
    const text = formErrorKey ? t(lang(), formErrorKey.key, formErrorKey.params) : '';
    setText(formError, text);
    const invalid = Boolean(formErrorKey);
    const dateInvalid = invalid && formErrorKey.key !== 'historyErrNoPlace';
    const yearOnly = formErrorKey && ['storyErrYear', 'storyErrYearEmpty', 'historyErrBefore', 'historyErrAfter', 'historyErrNotAvailable'].includes(formErrorKey.key);
    yearInput.setAttribute('aria-invalid', String(dateInvalid && yearOnly));
    dayInput.setAttribute('aria-invalid', String(dateInvalid && !yearOnly));
  }

  function setPlace(next) {
    controller.cancelQuery();
    place = next;
    if (place?.name) queryInput.value = formatPlaceLabel(place, lang());
    renderPlace();
  }

  function renderPlace() {
    if (!place) {
      setText(placeChosen, t(lang(), 'historyPlaceNone'));
      return;
    }
    const label = place.name ? formatPlaceLabel(place, lang()) : formatCoords(place.lat, place.lon);
    setText(placeChosen, t(lang(), 'historyPlaceChosen', { label, coords: formatCoords(place.lat, place.lon) }));
  }

  function renderSearchResults() {
    const l = lang();
    placeResults.replaceChildren();
    if (!lastSearch) return;
    if (lastSearch.state === 'loading') {
      setText(placeStatus, t(l, 'historyCatalogLoading'));
      return;
    }
    if (lastSearch.state === 'error') {
      setText(placeStatus, t(l, 'historyCatalogError'));
      return;
    }
    if (lastSearch.state === 'short') {
      setText(placeStatus, t(l, 'historySearchShort'));
      return;
    }
    const { items, total, q } = lastSearch;
    if (total === 0) {
      setText(placeStatus, t(l, 'historySearchNone', { q }));
      return;
    }
    setText(
      placeStatus,
      total === 1
        ? t(l, 'historySearchOne')
        : total > items.length
        ? t(l, 'historySearchCount', { total, shown: items.length })
        : t(l, 'historySearchCountAll', { total })
    );
    for (const row of items) {
      const candidate = cityRowToPlace(row);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary-btn';
      btn.textContent = `${formatPlaceLabel(candidate, l)} · ${formatCoords(candidate.lat, candidate.lon)}`;
      btn.addEventListener('click', () => {
        setPlace({ ...candidate });
        lastSearch = null;
        placeResults.replaceChildren();
        setText(placeStatus, '');
        showFormError(null);
        dayInput.focus();
      });
      li.appendChild(btn);
      placeResults.appendChild(li);
    }
  }

  async function runSearch() {
    searchToken += 1;
    const token = searchToken;
    const q = queryInput.value;
    if (q.trim().length < MIN_QUERY_LENGTH) {
      lastSearch = { state: 'short' };
      renderSearchResults();
      return;
    }
    lastSearch = { state: 'loading' };
    renderSearchResults();
    let catalog;
    try {
      catalog = await loadCities();
    } catch (err) {
      console.error('No se pudo cargar el catalogo de ciudades', err);
      if (token !== searchToken) return;
      lastSearch = { state: 'error' };
      renderSearchResults();
      return;
    }
    if (token !== searchToken) return;
    const { items, total } = searchCities(catalog.rows, q);
    lastSearch = { state: 'done', items, total, q: q.trim() };
    renderSearchResults();
  }

  searchBtn.addEventListener('click', runSearch);
  $('history-demo')?.addEventListener('click', async () => {
    const token = ++searchToken;
    lastSearch = { state: 'loading' };
    renderSearchResults();
    try {
      const catalog = await loadCities();
      if (token !== searchToken || store.get().activeTab !== 'history') return;
      const row = searchCities(catalog.rows, 'Arequipa').items[0];
      if (!row) throw new Error('Demo city missing from catalog');
      setPlace(cityRowToPlace(row));
      dayInput.value = '15'; monthSelect.value = '8'; yearInput.value = '1995';
      lastSearch = null; placeResults.replaceChildren(); setText(placeStatus, '');
      form.requestSubmit();
    } catch {
      if (token !== searchToken) return;
      lastSearch = { state: 'error' }; renderSearchResults();
    }
  });
  let liveTimer = null;
  queryInput.addEventListener('input', () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(runSearch, 250);
  });
  $('history-locate')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showFormError('locateUnsupported');
      return;
    }
    setText(placeStatus, t(lang(), 'locateSearching'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const catalog = await loadCities();
          let best = null;
          let bestD = Infinity;
          for (const row of catalog.rows) {
            const d = (row[3] - lat) ** 2 + ((row[4] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
            if (d < bestD) {
              bestD = d;
              best = row;
            }
          }
          setPlace(best ? cityRowToPlace(best) : { lat, lon });
        } catch {
          setPlace({ lat, lon });
        }
        setText(placeStatus, '');
        showFormError(null);
      },
      () => {
        setText(placeStatus, '');
        showFormError('locateDenied');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
  queryInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      runSearch();
    }
  });

  useGlobeBtn.addEventListener('click', () => {
    const point = getGlobePoint();
    if (!point) {
      showFormError('historyErrNoPlace');
      return;
    }
    setPlace({ lat: point.lat, lon: point.lon });
    showFormError(null);
  });

  for (const el of [dayInput, yearInput, monthSelect]) {
    el.addEventListener('input', () => {
      controller.cancelQuery();
      showFormError(null);
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (audioEngine) ensureAudio({ audioEngine, store });
    showFormError(null);
    const label = place ? (place.name ? formatPlaceLabel(place, lang()) : null) : null;
    reflectionOpen = false;
    // Con todos los campos completos empieza la intro (ver src/ui/flow.js); la
    // validacion fina (fecha real, datos disponibles) la hace el controlador.
    if (place && dayInput.value && monthSelect.value && yearInput.value) {
      const detail = {
        place: place.name || label || null,
        lat: place.lat,
        day: Number(dayInput.value),
        month: Number(monthSelect.value),
        monthName: monthSelect.selectedOptions?.[0]?.textContent?.trim().toLowerCase() || '',
        year: Number(yearInput.value)
      };
      // "Escuchar mi fecha" = relato con voz de relator, salvo que la persona
      // la haya apagado antes en "Opciones de escucha".
      if (readVoicePref() !== 'off' && narrator?.isSupported?.()) controller.setVoice(true);
      document.dispatchEvent(new CustomEvent('misti:submit', { detail }));
    }
    const outcome = await controller.submitStory({
      place: place ? { lat: place.lat, lon: place.lon, label } : null,
      day: dayInput.value,
      month: monthSelect.value,
      year: yearInput.value,
      requireYear: true
    });
    if (outcome.reason === 'stale') return;
    if (outcome.ok) {
      focusResultTitle();
      // "Escuchar mi fecha": el clic fue el gesto que activo el audio; el relato
      // empieza cuando se revela el tablero (al terminar la intro).
      if (audioEngine && !store.get().audio.muted) {
        const play = () => withAudio(() => controller.playAuto());
        if (document.documentElement.dataset.stage === 'intro') document.addEventListener('misti:reveal', play, { once: true });
        else await play();
      }
      return;
    }
    const keys = {
      noPlace: ['historyErrNoPlace'],
      empty: ['storyErrEmpty'],
      invalid: ['storyErrInvalid'],
      invalidYear: ['storyErrYear'],
      emptyYear: ['storyErrYearEmpty'],
      beforeSource: ['historyErrBefore', { min: formatMonthYear(outcome.min ?? firstPeriod, lang()) }],
      afterLatest: ['historyErrAfter', { max: formatMonthYear(outcome.max ?? lastPeriod, lang()) }],
      notAvailable: ['historyErrNotAvailable'],
      noSource: ['historyErrNoSource']
    };
    if (keys[outcome.reason]) {
      showFormError(...keys[outcome.reason]);
      if (outcome.reason === 'noPlace') queryInput.focus();
      else if (['empty', 'invalid'].includes(outcome.reason)) dayInput.focus();
      else yearInput.focus();
    }
  });

  function focusResultTitle() {
    if (resultSection.hidden) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    resultTitle.focus({ preventScroll: true });
    if (window.matchMedia?.('(max-width: 960px)').matches) {
      resultTitle.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  listenA.addEventListener('click', () => withAudio(() => controller.play('a')));
  listenB.addEventListener('click', () => withAudio(() => controller.play('b')));
  listenN?.addEventListener('click', () => withAudio(() => controller.play('n')));
  listenAuto.addEventListener('click', () => withAudio(() => controller.playAuto()));
  repeatBtn.addEventListener('click', () => withAudio(() => controller.repeat()));
  stopBtn.addEventListener('click', () => controller.stop());
  viewA.addEventListener('click', () => controller.viewEpoch('a'));
  viewB.addEventListener('click', () => controller.viewEpoch('b'));
  viewN?.addEventListener('click', () => controller.viewEpoch('n'));
  showReflectionBtn.addEventListener('click', () => {
    reflectionOpen = true;
    render(store.get());
    reflectionTitle.focus();
  });
  async function handleCard(forceDownload) {
    const result = store.get().history.result;
    if (!result?.story) return;
    try {
      const outcome = await shareStoryCard(result, lang(), { forceDownload });
      cardStatusKey = outcome === 'shared' ? 'storyCardShared' : outcome === 'downloaded' ? 'storyCardDownloaded' : null;
    } catch (err) {
      console.error('No se pudo crear la tarjeta', err);
      cardStatusKey = 'storyCardError';
    }
    setText(cardStatus, cardStatusKey ? t(lang(), cardStatusKey) : '');
  }
  cardShare.addEventListener('click', () => handleCard(false));
  cardDownload.addEventListener('click', () => handleCard(true));
  voiceBox.addEventListener('change', () => {
    writeVoicePref(voiceBox.checked ? 'on' : 'off');
    controller.setVoice(voiceBox.checked);
  });
  speakBtn.addEventListener('click', () => controller.speakStory());
  clearBtn.addEventListener('click', () => {
    controller.clear();
    place = null;
    lastSearch = null;
    queryInput.value = '';
    yearInput.value = '';
    dayInput.value = '';
    monthSelect.value = '';
    reflectionOpen = false;
    placeResults.replaceChildren();
    setText(placeStatus, '');
    showFormError(null);
    renderPlace();
    queryInput.focus();
  });

  function renderMonths() {
    const l = lang();
    if (monthsLang === l) return;
    if (dayInput.tagName === 'SELECT' && dayInput.options.length === 0) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '—';
      dayInput.appendChild(blank);
      for (let d = 1; d <= 31; d += 1) {
        const opt = document.createElement('option');
        opt.value = String(d);
        opt.textContent = String(d);
        dayInput.appendChild(opt);
      }
    }
    if (yearInput.tagName === 'SELECT' && yearInput.options.length === 0 && firstPeriod && lastPeriod) {
      const blankY = document.createElement('option');
      blankY.value = '';
      blankY.textContent = '—';
      yearInput.appendChild(blankY);
      for (let y = Number(lastPeriod.slice(0, 4)); y >= Number(firstPeriod.slice(0, 4)); y -= 1) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        yearInput.appendChild(opt);
      }
    }
    const previous = monthSelect.value;
    monthSelect.replaceChildren();
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '—';
    monthSelect.appendChild(blank);
    for (let m = 1; m <= 12; m += 1) {
      const opt = document.createElement('option');
      opt.value = String(m);
      const name = formatMonthYear(`2001-${String(m).padStart(2, '0')}`, l).replace(/\s*(de\s)?2001$/, '');
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      monthSelect.appendChild(opt);
    }
    monthSelect.value = previous;
    monthsLang = l;
  }

  function renderResult(state) {
    const l = state.lang;
    const h = state.history;
    const result = h.status === 'ready' ? h.result : null;
    resultSection.hidden = !result;
    if (!result) {
      for (const el of [cardAValue, cardBValue]) setText(el, '—');
      setText(cardAPeriod, t(l, 'momentBeforeTag', { first: 1950 }));
      setText(cardBPeriod, t(l, 'momentAfterTag', { first: '…', last: '…' }));
      setText($('moment-a-title'), t(l, 'momentBeforeTitle', { first: 1950 }));
      setText($('moment-b-title'), t(l, 'momentAfterTitle', { first: '…', last: '…' }));
      setText(cardDelta, '');
      setText($('history-card-n-value'), '—');
      setText($('history-card-n-period'), t(l, 'momentBirthTag', { year: yearInput.value || '…' }));
      setText($('moment-n-title'), t(l, 'momentBirthTitle', { year: yearInput.value || '…' }));
      listenA.disabled = true;
      listenB.disabled = true;
      if (listenN) listenN.disabled = true;
      return;
    }

    const { a, b } = result;
    const story = Boolean(result.story);
    const periodA = story ? pastLabel(result, l) : formatMonthYear(a.period, l);
    const periodB = story ? recentLabel(result, l) : formatMonthYear(b.period, l);
    const placeText = result.placeLabel ?? formatCoords(result.point.lat, result.point.lon);
    setText(
      resultTitle,
      story
        ? t(l, 'storyResultTitle', { birthday: formatBirthday(result.birthday, l), place: placeText })
        : t(l, 'historyResultTitle', { place: placeText })
    );

    const noDataWord = t(l, 'historyNoData');
    const deg = (v) => (v === null ? noDataWord : `${formatDegrees(v, { signed: true })} °C`);
    setText(
      summaryEl,
      t(l, 'historySummaryLine', {
        periodA,
        periodB,
        a: deg(a.value),
        b: deg(b.value),
        delta: result.delta === null ? t(l, 'historySummaryNoDelta') : deg(result.delta),
        baseline: String(result.baseline ?? '').replace('-', '–')
      })
    );

    // Tarjetas Antes/Despues: solo presentacion visual de los mismos valores
    // del resumen (aria-hidden en index.html: no se anuncian dos veces).
    setText(cardAPeriod, story ? t(l, 'momentBeforeTag', { first: a.firstYear }) : periodA);
    setText(cardBPeriod, story ? t(l, 'momentAfterTag', { first: b.firstYear, last: b.lastYear }) : periodB);
    // "≈" = estimado (celdas vecinas) o proyectado; el titulo lo explica.
    const approx = (v, est) => (v !== null && est ? `≈ ${deg(v)}` : deg(v));
    setText(cardAValue, approx(a.value, a.estimated));
    setText(cardBValue, approx(b.value, b.estimated));
    cardAValue.title = a.estimated ? t(l, 'estNeighbors') : '';
    cardBValue.title = b.estimated ? t(l, 'estNeighbors') : '';
    setText($('moment-a-title'), story ? t(l, 'momentBeforeTitle', { first: a.firstYear }) : periodA);
    setText($('moment-b-title'), story ? t(l, 'momentAfterTitle', { first: b.firstYear, last: b.lastYear }) : periodB);
    setText($('m-b-text'), t(l, result.delta !== null && result.delta < 0 ? 'momentAfterTextCool' : 'momentAfterText'));
    const n = result.n;
    const birthRow = document.querySelector('.moment-birth');
    if (birthRow) birthRow.hidden = !n;
    if (n) {
      setText($('history-card-n-period'), t(l, 'momentBirthTag', { year: n.firstYear }));
      setText($('moment-n-title'), t(l, 'momentBirthTitle', { year: n.firstYear }));
      const nv = $('history-card-n-value');
      setText(nv, n.value !== null && n.estimate ? `≈ ${deg(n.value)}` : deg(n.value));
      nv.title = n.estimate === 'projection' ? t(l, 'estProjection') : n.estimate ? t(l, 'estNeighbors') : '';
    }
    if (listenN) {
      listenN.disabled = state.audio.muted || !n || n.value === null;
      listenN.setAttribute('aria-label', t(l, 'listenBirthAria', { year: n?.firstYear ?? '' }));
    }
    if (viewN) {
      viewN.hidden = !n;
      setText(viewN, n ? t(l, 'storyViewBirth', { year: n.firstYear }) : '');
      viewN.setAttribute('aria-pressed', String(h.viewing === 'n'));
    }
    setText(
      cardDelta,
      result.delta === null
        ? ''
        : t(l, result.delta >= 0 ? 'momentDeltaWarmer' : 'momentDeltaCooler', { d: deg(Math.abs(result.delta)).replace('+', '') })
    );

    const storyLines = story ? buildBirthdayStory(result, l) : buildStory(result, l, { latestPeriod: lastPeriod });
    const storySig = `${l}|${storyLines.join('|')}`;
    if (sigs.get('story') !== storySig) {
      sigs.set('story', storySig);
      storyEl.replaceChildren();
      for (const line of storyLines) {
        const p = document.createElement('p');
        p.textContent = line;
        storyEl.appendChild(p);
      }
    }

    const noData = t(l, 'historyNoData');
    const rows = [
      [
        t(l, 'historyDataPlace'),
        `${result.placeLabel ? `${result.placeLabel} · ` : ''}${formatCoords(result.point.lat, result.point.lon)}`
      ],
      [t(l, 'historyDataCell'), formatCoords(result.cell.latCenter, result.cell.lonCenter)],
      [t(l, 'historyDataA', { period: periodA }), a.value === null ? noData : `${formatDegrees(a.value, { signed: true })} °C`],
      [t(l, 'historyDataB', { period: periodB }), b.value === null ? noData : `${formatDegrees(b.value, { signed: true })} °C`],
      [
        t(l, 'historyDataDelta'),
        result.delta === null ? noData : `${formatDegrees(result.delta, { signed: true })} °C`
      ],
      ...(story
        ? [...a.series, ...b.series].map((s) => [
            formatMonthYear(s.period, l),
            s.value === null ? noData : `${formatDegrees(s.value, { signed: true })} °C`
          ])
        : []),
      [
        t(l, 'historyDataSource'),
        t(l, 'historyDataSourceValue', {
          dataset: result.dataset ?? 'GISTEMP',
          baseline: String(result.baseline ?? '').replace('-', '–')
        })
      ]
    ];
    const dataSig = `${l}|${JSON.stringify(rows)}`;
    if (sigs.get('data') !== dataSig) {
      sigs.set('data', dataSig);
      dataEl.replaceChildren();
      for (const [term, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dataEl.append(dt, dd);
      }
    }

    listenA.setAttribute('aria-label', t(l, 'historyListenA', { period: periodA }));
    listenB.setAttribute('aria-label', t(l, 'historyListenB', { period: periodB }));
    listenAuto.setAttribute('aria-label', t(l, 'historyListenAuto'));
    setText(repeatBtn, t(l, 'historyRepeat'));
    setText(stopBtn, t(l, 'historyStop'));

    // El primer clic activa el audio (ensureAudio): solo el silencio global bloquea.
    const soundOk = !state.audio.muted;
    listenA.disabled = !soundOk || a.value === null;
    listenB.disabled = !soundOk || b.value === null;
    listenAuto.disabled = !soundOk || a.value === null || b.value === null;
    repeatBtn.disabled = !soundOk || !h.lastPlay;
    const speechOk = Boolean(narrator?.isSupported?.());
    speakBtn.disabled = !speechOk || state.audio.muted;
    voiceBox.checked = h.voice;

    let hint = '';
    if (state.audio.muted) hint = t(l, 'historyMuted');
    else if (a.value === null || b.value === null) hint = t(l, 'historyNoDataListen');
    else if (!speechOk) hint = t(l, 'historySpeechUnsupported');
    setText(audioHint, hint);

    let status = '';
    if (h.playError) status = t(l, h.playError === 'epoch' ? 'historyEpochError' : 'historyStartError');
    else if (h.playing?.phase === 'loading') status = t(l, 'historyPlayingLoading');
    else if (h.playing?.phase === 'gap') status = t(l, 'historyPlayingGap');
    else if (h.playing && h.lastPlay === 'mix') status = t(l, 'mixPlaying');
    else if (h.playing && String(h.lastPlay).startsWith('layer:')) {
      const layerId = h.lastPlay.slice(6);
      status = layerId === 'ozone' ? t(l, 'layerPlayingOzone') : t(l, 'layerPlaying', { layer: t(l, `layerName_${layerId}`) });
    } else if (h.playing) {
      const announce = story ? storyAnnouncement(result, h.playing.epoch, l) : epochAnnouncement(result, h.playing.epoch, l);
      status = t(l, 'historyPlayingNow', { announce });
    } else if (h.ended) status = t(l, story ? 'storyEnded' : 'historyEnded');
    setText(playStatus, status);

    setText(missingEl, t(l, 'historyMissing'));
    renderStoryExtras(state, result);
  }

  /** Ver cada epoca en el globo, los 5 anios con su latido y la reflexion final. */
  function renderStoryExtras(state, result) {
    const l = state.lang;
    const h = state.history;
    const story = Boolean(result.story);
    viewA.hidden = !story;
    viewB.hidden = !story;
    yearsEl.hidden = !story;
    showReflectionBtn.hidden = !story;
    if (!story) {
      setText(imageryEl, '');
      reflection.hidden = true;
      return;
    }
    setText(viewA, t(l, 'storyViewPast', { label: pastLabel(result, l) }));
    setText(viewB, t(l, 'storyViewRecent', { label: recentLabel(result, l) }));
    viewA.setAttribute('aria-pressed', String(h.viewing === 'a'));
    viewB.setAttribute('aria-pressed', String(h.viewing === 'b'));

    let imageryText = '';
    if (h.viewing) {
      const tempKey = h.viewing === 'a' ? 'storyGlobeTempPast' : 'storyGlobeTempRecent';
      const tempPeriod = formatMonthYear(result[h.viewing].period, l);
      imageryText = t(l, tempKey, { period: tempPeriod });
      if (h.imagery) {
        const imgKey = h.imagery.kind === 'annual' ? 'storyImageryPast' : 'storyImageryRecent';
        imageryText += ` ${t(l, imgKey, { satellite: h.imagery.satellite, year: h.imagery.year, date: h.imagery.date })}`;
      }
      imageryText += ` ${t(l, 'storyZoomHint')}`;
    }
    setText(imageryEl, imageryText);

    yearsEl.setAttribute('aria-label', t(l, 'storyYearsLabel'));
    const playingYear = h.playing?.epoch === 'b' && h.playing.phase === 'music' ? h.beat?.year : null;
    const yearsSig = `${l}|${playingYear}|${h.beat?.bpm}|${JSON.stringify(result.b.series)}`;
    if (sigs.get('years') !== yearsSig) {
      sigs.set('years', yearsSig);
      yearsEl.replaceChildren(
        ...result.b.series.map((s) => {
          const li = document.createElement('li');
          if (s.year === playingYear) li.className = 'is-playing';
          const value = document.createElement('b');
          value.textContent = s.value === null ? t(l, 'historyNoData') : `${formatDegrees(s.value, { signed: true })} °C`;
          li.append(String(s.year), value);
          if (s.year === playingYear && h.beat?.bpm) li.append(t(l, 'storyBpm', { bpm: h.beat.bpm }));
          return li;
        })
      );
    }

    const open = reflectionOpen || h.ended;
    reflection.hidden = !open;
    showReflectionBtn.hidden = open;
    if (open) {
      const key = `${l}|${result.key}`;
      if (reflectionKey !== key) {
        reflectionKey = key;
        setText(reflectionText, reflectionMessage(result, l));
        classList.replaceChildren(
          ...classroomQuestions(l).map((q) => {
            const li = document.createElement('li');
            li.textContent = q;
            return li;
          })
        );
        cardShare.setAttribute('aria-description', storyCardText(result, l));
      }
      setText(cardStatus, cardStatusKey ? t(l, cardStatusKey) : '');
    }
  }

  function render(state) {
    const l = state.lang;
    renderMonths();
    if (firstPeriod) setText(birthNote, t(l, 'historyBirthNote', { min: formatMonthYear(firstPeriod, l) }));
    if (lastPeriod) setText(latestNote, t(l, 'historyLatestNote', { period: formatMonthYear(lastPeriod, l) }));
    renderPlace();
    renderFormError();
    if (lastSearch && lastSearch.state !== 'done') renderSearchResults();

    const h = state.history;
    let loadMessage = '';
    if (h.status === 'loading') loadMessage = t(l, 'historyLoading');
    else if (h.status === 'error') {
      loadMessage = t(
        l,
        h.error === 'gridMismatch' ? 'historyGridMismatch' : h.error === 'sourceMismatch' ? 'historySourceMismatch' : 'historyLoadError'
      );
    }
    setText(loadStatus, loadMessage);
    renderResult(state);
  }

  /** Enlace compartido: rellena el formulario con los dos periodos y consulta (sin audio). */
  async function showShared({ point, a, b }) {
    setPlace({ lat: point.lat, lon: point.lon });
    // Relato compartido (1950-MM, ultimo MM): sin dia ni ano (privacidad).
    const isStory = a.startsWith('1950-') && a.slice(5, 7) === b.slice(5, 7);
    yearInput.value = isStory ? '' : a.slice(0, 4);
    if (yearInput.tagName === 'SELECT' && yearInput.value !== (isStory ? '' : a.slice(0, 4))) yearInput.value = '';
    dayInput.value = '';
    monthSelect.value = String(Number(a.slice(5, 7)));
    showFormError(null);
    const outcome = await controller.applyShared({ point, a, b });
    if (!outcome.ok && outcome.reason === 'notAvailable') showFormError('historySharedBadPeriod');
    return outcome;
  }

  return { render, showShared, setPlace };
}
