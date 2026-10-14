/*
 * The Forecast history panel of Markets (markets.html #historyPanel): what Tibinance had published about the selected
 * world and side by a chosen date, edition by edition, and how those forecasts fared. Up to three editions can be
 * drawn over the chart (js/market-forecast-history-layer.js).
 *
 * Reads the forecast archive (data/forecast-archive/): index.json for every edition's lifecycle and publication
 * evidence, objects/<sha256>.json.gz for an edition's paths (fetched when listed), and evaluations.jsonl for accuracy
 * (absent until a target week has closed). The archive is loaded the first time the panel opens.
 *
 * "Public" always rests on evidence (js/forecast-archive.js): a Pages deployment, or, labelled as such, a push to
 * main where no deployment is recorded. Archived editions never published are listed apart, on request, and are
 * never drawn. Backtests are never mixed with published forecasts.
 */
import { fmt, esc } from './format.js';
import { SIDE_KEY, endOfDay, evaluationPoints, groupMetrics, historyEditions, horizonPoint, lifecycleLabel,
  readObject, scenarioSeries } from './forecast-archive.js?v=20261014-rebuild';
import { HISTORY_SLOTS } from './market-forecast-history-layer.js?v=20261014-rebuild';

const ARCHIVE = 'data/forecast-archive/';
const OFFER = { sell: 'Sell Offer', buy: 'Buy Offer' };
const CLASSES = [['published-website', 'Published on the website'], ['published-repository', 'Published in the repository only'],
  ['archived-unpublished', 'Archived, never published'], ['backtest', 'Backtests, never published']];
const today = () => new Date().toISOString().slice(0, 10);
const reproducible = f => (f.reproducibility?.prediction?.startsWith('complete') ? 'complete inputs, prediction reproducible' : 'partial inputs');
const signed = v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

export function historyPanel(root, { onDraw, onShow }) {
  const $ = id => root.querySelector(`#${id}`);
  const state = { index: null, evaluations: '', loading: null, failed: false, objects: new Map(), world: null, side: 'sell', end: null,
    asOf: today(), fallback: true, horizon: 4, model: '', archived: false, chosen: Array(HISTORY_SLOTS).fill(null), shown: false };
  let revision = 0, refreshVersion = 0;
  // Each chosen edition keeps its slot (colour, line, number) until it is unchosen.
  const anyChosen = () => state.chosen.some(Boolean);

  async function load() {
    state.loading ??= (async () => {
      const r = await fetch(`${ARCHIVE}index.json`);
      if (!r.ok) throw new Error(`index.json: ${r.status}`);
      state.index = await r.json();
      // The evaluations file exists once a target week has closed; the index counts its records.
      const e = state.index.chain?.evaluations ? await fetch(`${ARCHIVE}evaluations.jsonl`).catch(() => null) : null;
      state.evaluations = e?.ok ? await e.text() : '';
      const models = [...new Set(state.index.forecasts.filter(f => f.product === 'tc-world-scenarios').map(f => f.model.id))].sort();
      $('historyModel').innerHTML = '<option value="">Every model</option>' + models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
      const first = state.index.forecasts.map(f => f.evidence?.repository?.at ?? f.evidence?.website?.at).filter(Boolean).sort()[0];
      if (first) $('historyAsOf').min = first.slice(0, 10);
      $('historyAsOf').max = today();
    })().catch(error => { state.failed = true; console.warn('The forecast archive is unavailable.', error); });
    await state.loading;
  }

  // An edition's paths, fetched once (about 150 kB compressed for every world).
  async function outputs(f) {
    if (!state.objects.has(f.outputs)) {
      state.objects.set(f.outputs, fetch(`${ARCHIVE}objects/${f.outputs}.json.gz`)
        .then(r => { if (!r.ok) throw new Error(`${f.outputs}: ${r.status}`); return r.arrayBuffer(); })
        .then(readObject).catch(error => { state.objects.delete(f.outputs); throw error; }));
    }
    return state.objects.get(f.outputs);
  }

  const listing = () => historyEditions(state.index, endOfDay(state.asOf), { fallback: state.fallback, model: state.model || null });
  const seriesOf = async (f, world = state.world, side = state.side) => scenarioSeries(await outputs(f), world, SIDE_KEY[side]);

  // The chosen editions still public at the date shown, for this world and side, each in its slot.
  async function paths() {
    const listed = new Map(listing().published.map(x => [x.forecast.contentHash, x]));
    state.chosen = state.chosen.map(h => (h && listed.has(h) ? h : null));
    const out = [];
    for (const [slot, hash] of state.chosen.entries()) {
      if (!hash) continue;
      const { forecast, publication } = listed.get(hash), points = await seriesOf(forecast);
      if (points.length) out.push({ slot, hash, edition: forecast.edition, cutoff: forecast.dataCutoff, published: publication, points });
    }
    return out;
  }

  async function draw() {
    if (!state.index) return;
    const ticket = refreshVersion;
    const next = await paths();
    if (ticket === refreshVersion) onDraw(next);
  }

  async function render() {
    if (state.failed) { $('historyContext').textContent = 'The forecast archive could not be loaded.'; return; }
    if (!state.index || !state.world) return;
    const ticket = ++revision;
    const focused = document.activeElement?.dataset?.hash;
    const { published, unpublished } = listing();
    const listed = new Set(published.map(x => x.forecast.contentHash));
    state.chosen = state.chosen.map(h => listed.has(h) ? h : null);
    const offer = OFFER[state.side], h = state.horizon;
    const rows = await Promise.all(published.map(async x => ({ ...x, series: await seriesOf(x.forecast) })));
    if (ticket !== revision) return;
    const withPath = rows.filter(r => r.series.length);
    $('historyContext').textContent = !published.length
      ? `No edition of the Research offer scenario was public on ${state.asOf}.`
      : withPath.length
        ? `${published.length === 1 ? 'One edition' : `${published.length} editions`} of the Research offer scenario ${published.length === 1 ? 'was' : 'were'} public on ${state.asOf}, newest first; ${withPath.length === published.length ? 'each has' : `${withPath.length} have`} a path for ${state.world}, ${offer}. Choose up to ${HISTORY_SLOTS} to draw over the chart.`
        : `None of the ${published.length} editions public on ${state.asOf} has a path for ${state.world}: the Research covers the worlds it has captures for.`;
    const full = !state.chosen.includes(null);
    $('historyEditions').innerHTML = rows.map(({ forecast: f, publication: p, series }) => {
      const slot = state.chosen.indexOf(f.contentHash), point = horizonPoint(series, h);
      const at = point ? `${h} week${h === 1 ? '' : 's'} ahead, week of ${esc(point.target)}: <b>${fmt(Math.round(point.base))}</b>, band ${fmt(Math.round(point.low))} to ${fmt(Math.round(point.high))}`
        : series.length ? `No point ${h} weeks ahead (${series.length} weeks)` : `No path for ${esc(state.world)}`;
      return `<li class="history-edition${slot >= 0 ? ` is-drawn slot-${slot + 1}` : ''}">
        <button type="button" class="btn history-draw" data-hash="${esc(f.contentHash)}" aria-pressed="${slot >= 0}"${!series.length || (full && slot < 0) ? ' disabled' : ''}>
          <span class="history-slot" aria-hidden="true">${slot >= 0 ? slot + 1 : ''}</span>
          <span>Edition of ${esc(f.dataCutoff)}</span></button>
        <p class="history-meta">Public since ${esc(p.at.slice(0, 10))}, ${p.level === 'website' ? 'website deployment' : '<span class="history-flag">repository only: no website deployment recorded</span>'}</p>
        <p class="history-meta">${esc(f.model.id)}, ${esc(reproducible(f))}${f.superseded ? '; superseded by a later edition for the same cutoff' : ''}</p>
        <p class="history-point">${at}</p></li>`;
    }).join('');
    $('historyUnpublished').hidden = !state.archived;
    $('historyUnpublished').innerHTML = state.archived ? `<h3>Archived, never published</h3>${unpublished.length
      ? `<ul class="history-list">${unpublished.map(f => `<li><p>Edition of ${esc(f.dataCutoff)}</p><p class="history-meta">${esc(lifecycleLabel(f))}; archived ${esc(f.archivedAt.slice(0, 10))}. Not a public prediction, so never drawn.</p></li>`).join('')}</ul>`
      : `<p class="history-meta">None archived by ${esc(state.asOf)}.</p>`}` : '';
    renderAccuracy(rows);
    $('historyPaths').disabled = !anyChosen();
    $('historyPaths').setAttribute('aria-pressed', String(state.shown));
    $('historyArchived').setAttribute('aria-pressed', String(state.archived));
    if (focused) [...$('historyEditions').querySelectorAll('button')].find(b => b.dataset.hash === focused)?.focus({ preventScroll: true });
  }

  // Accuracy for this world and side, by horizon, kept apart by what each forecast was.
  function renderAccuracy(rows) {
    const side = SIDE_KEY[state.side];
    const points = state.evaluations ? evaluationPoints(state.evaluations, state.index, { asOf: endOfDay(state.asOf) }).filter(p => p.product === 'tc-world-scenarios' && p.world === state.world && p.side === side
      && (!state.model || state.index.forecasts.find(f => f.contentHash === p.forecast)?.model.id === state.model)) : [];
    if (!points.length) {
      const first = rows.map(r => r.series[0]?.week).filter(Boolean).sort()[0];
      $('historyAccuracy').innerHTML = `<p class="history-meta">No target week of these editions has closed with an observation for ${esc(state.world)} yet${first ? `; the first ends on ${esc(first)}` : ''}. Errors appear here as weeks close, from the same weekly rule the Research scores with.</p>`;
      return;
    }
    $('historyAccuracy').innerHTML = CLASSES.map(([cls, title]) => {
      const groups = groupMetrics(points.filter(p => p.class === cls), p => String(p.horizon).padStart(2, '0'));
      if (!groups.length) return '';
      return `<h4>${title}</h4><table class="history-table"><thead><tr><th>Weeks ahead</th><th class="num">Points</th><th class="num">MAPE</th><th class="num">Bias</th><th class="num">In band</th></tr></thead><tbody>${groups.map(g =>
        `<tr><td>${Number(g.key)}</td><td class="num">${fmt(g.n)}</td><td class="num">${g.mape == null ? 'N/A' : `${g.mape.toFixed(2)}%`}</td><td class="num">${g.bias == null ? 'N/A' : signed(g.bias)}</td><td class="num">${g.coverage == null ? 'N/A' : `${Math.round(100 * g.coverage)}%`}</td></tr>`).join('')}</tbody></table>`;
    }).join('');
  }

  const refresh = async () => {
    const ticket = ++refreshVersion;
    try { await render(); if (ticket === refreshVersion) await draw(); }
    catch { $('historyContext').textContent = 'Forecast paths unavailable. Change a filter to retry.'; onDraw([]); }
  };

  $('historyAsOf').value = state.asOf;
  $('historyAsOf').addEventListener('change', e => { state.asOf = e.target.value || today(); refresh(); });
  $('historyEvidence').addEventListener('change', e => { state.fallback = e.target.value === 'repository'; refresh(); });
  $('historyHorizon').addEventListener('change', e => { state.horizon = Number(e.target.value); refresh(); });
  $('historyModel').addEventListener('change', e => { state.model = e.target.value; refresh(); });
  $('historyArchived').addEventListener('click', () => { state.archived = !state.archived; refresh(); });
  $('historyPaths').addEventListener('click', () => { state.shown = !state.shown; $('historyPaths').setAttribute('aria-pressed', String(state.shown)); onShow(state.shown); });
  $('historyEditions').addEventListener('click', e => {
    const button = e.target.closest('button[data-hash]');
    const hash = button?.dataset.hash;
    if (!hash) return;
    const checked = button.getAttribute('aria-pressed') !== 'true';
    const free = state.chosen.indexOf(null);
    if (checked && free >= 0) state.chosen[free] = hash;
    else if (!checked) state.chosen = state.chosen.map(h => (h === hash ? null : h));
    // Choosing an edition shows the paths; the box beside the title hides them again without losing the choice.
    if (checked && !state.shown) { state.shown = true; $('historyPaths').setAttribute('aria-pressed', 'true'); onShow(true); }
    refresh();
  });

  return {
    // The panel opened: the archive loads the first time.
    async open() { await load(); await refresh(); },
    // The world, side or history changed on the page.
    async update({ world, side, end }) {
      Object.assign(state, { world, side, end });
      // Before the panel has ever opened nothing loads; while it loads, the world waits for it.
      if (!state.loading) { onDraw([]); return; }
      await state.loading;
      await refresh();
    },
  };
}
