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

export function createHistoryPanel({ store, controller, repository, loadCities, getGlobePoint, narrator }) {
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
    const yearOnly = formErrorKey && ['storyErrYear', 'historyErrBefore', 'historyErrAfter', 'historyErrNotAvailable'].includes(formErrorKey.key);
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
      const row = searchCities(catalog.rows, 'Iquitos').items[0];
      if (!row) throw new Error('Demo city missing from catalog');
      setPlace(cityRowToPlace(row));
      dayInput.value = '14'; monthSelect.value = '1'; yearInput.value = '';
      lastSearch = null; placeResults.replaceChildren(); setText(placeStatus, '');
      form.requestSubmit();
    } catch {
      if (token !== searchToken) return;
      lastSearch = { state: 'error' }; renderSearchResults();
    }
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
    showFormError(null);
    const label = place ? (place.name ? formatPlaceLabel(place, lang()) : null) : null;
    reflectionOpen = false;
    const outcome = await controller.submitStory({
      place: place ? { lat: place.lat, lon: place.lon, label } : null,
      day: dayInput.value,
      month: monthSelect.value,
      year: yearInput.value
    });
    if (outcome.reason === 'stale') return;
    if (outcome.ok) {
      focusResultTitle();
      return;
    }
    const keys = {
      noPlace: ['historyErrNoPlace'],
      empty: ['storyErrEmpty'],
      invalid: ['storyErrInvalid'],
      invalidYear: ['storyErrYear'],
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

  listenA.addEventListener('click', async () => {
    await controller.play('a');
  });
  listenB.addEventListener('click', async () => {
    await controller.play('b');
  });
  listenAuto.addEventListener('click', async () => {
    await controller.playAuto();
  });
  repeatBtn.addEventListener('click', async () => {
    await controller.repeat();
  });
  stopBtn.addEventListener('click', () => controller.stop());
  viewA.addEventListener('click', () => controller.viewEpoch('a'));
  viewB.addEventListener('click', () => controller.viewEpoch('b'));
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
  voiceBox.addEventListener('change', () => controller.setVoice(voiceBox.checked));
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
    if (!result) return;

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
    const baselineText = String(result.baseline ?? '').replace('-', '–');
    setText(cardAPeriod, periodA);
    setText(cardBPeriod, periodB);
    setText(cardAValue, deg(a.value));
    setText(cardBValue, deg(b.value));
    setText(
      cardDelta,
      `${t(l, 'historyCardDelta', { delta: result.delta === null ? t(l, 'historySummaryNoDelta') : deg(result.delta) })} · ${t(l, 'historyCardBaseline', { baseline: baselineText })}`
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

    setText(listenA, t(l, 'auroraListen'));
    setText(listenB, t(l, 'auroraListen'));
    listenA.setAttribute('aria-label', t(l, 'historyListenA', { period: periodA }));
    listenB.setAttribute('aria-label', t(l, 'historyListenB', { period: periodB }));
    setText(listenAuto, t(l, 'historyListenAuto'));
    setText(repeatBtn, t(l, 'historyRepeat'));
    setText(stopBtn, t(l, 'historyStop'));

    const soundOk = state.audio.started && !state.audio.muted;
    listenA.disabled = !soundOk || a.value === null;
    listenB.disabled = !soundOk || b.value === null;
    listenAuto.disabled = !soundOk || a.value === null || b.value === null;
    repeatBtn.disabled = !soundOk || !h.lastPlay;
    const speechOk = Boolean(narrator?.isSupported?.());
    speakBtn.disabled = !speechOk || state.audio.muted;
    voiceBox.checked = h.voice;

    let hint = '';
    if (!state.audio.started) hint = t(l, 'historyAudioOff');
    else if (state.audio.muted) hint = t(l, 'historyMuted');
    else if (a.value === null || b.value === null) hint = t(l, 'historyNoDataListen');
    else if (!speechOk) hint = t(l, 'historySpeechUnsupported');
    setText(audioHint, hint);

    let status = '';
    if (h.playError) status = t(l, h.playError === 'epoch' ? 'historyEpochError' : 'historyStartError');
    else if (h.playing?.phase === 'loading') status = t(l, 'historyPlayingLoading');
    else if (h.playing?.phase === 'gap') status = t(l, 'historyPlayingGap');
    else if (h.playing) {
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
    dayInput.value = '';
    monthSelect.value = String(Number(a.slice(5, 7)));
    showFormError(null);
    const outcome = await controller.applyShared({ point, a, b });
    if (!outcome.ok && outcome.reason === 'notAvailable') showFormError('historySharedBadPeriod');
    return outcome;
  }

  return { render, showShared, setPlace };
}
