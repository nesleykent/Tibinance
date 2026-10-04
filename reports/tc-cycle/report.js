/*
 * Renders the latest reproducible research and its dated Market observations. No build step: every displayed number comes from the published JSON.
 * One script serves both editions of the report: index.html (English) and pt-br.html (Brazilian Portuguese). The page's
 * lang attribute chooses the prose and the number and date conventions; data, models, exhibits and table labels are shared.
 */
'use strict';

// ---------------------------------------------------------------- language and formatting
const LANG = document.documentElement.lang.toLowerCase().startsWith('pt') ? 'pt' : 'en';
// Every language-dependent string is written once per edition, side by side, so the two can never drift apart in content.
// The Portuguese edition keeps financial, statistical, Tibia and game terms in English (see the glossary in README.md).
const t = (en, pt) => LANG === 'pt' ? pt : en;
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat(t('en-GB', 'pt-BR'), {minimumFractionDigits: d, maximumFractionDigits: d}));
const ok = v => v != null && Number.isFinite(v);
// No glyph that resembles a dash is ever printed: negative numbers use the hyphen-minus, and a missing value reads N/A.
const MISSING = 'N/A';
// Signs follow the rounded value, so -0.004 prints as 0.00 and not as -0.00.
const round = (v, d) => Number(v.toFixed(d)) || 0;
const sign = (v, d) => round(v, d) > 0 ? '+' : round(v, d) < 0 ? '-' : '';
const fmt = (v, d = 0) => ok(v) ? nf(d).format(round(v, d)) : MISSING;
const sgn = (v, d = 1) => ok(v) ? `${sign(v, d)}${fmt(Math.abs(v), d)}%` : MISSING;
const pctU = (v, d = 1) => ok(v) ? `${fmt(v, d)}%` : MISSING;
// Percentage points are a financial unit, so both editions write "pp".
const pp = (v, d = 1) => ok(v) ? `${sign(v, d)}${fmt(Math.abs(v), d)} pp` : MISSING;
const price = v => fmt(v);
const marketGroup = v => v.replace(/; BattlEye (Yellow|Green)/g, (_, colour) => ` (${colour[0]}BE)`);
const priceUnit = t('Prices in gold pieces (gp) per TC', 'Prices em gold pieces (gp) por TC');
const prob = v => ok(v) ? `${fmt(v * 100, 0)}%` : MISSING;
// Tables, tooltips and captions are structured in English in both editions: months, periods and categorical values included.
const MONTHS_LONG_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_EN = MONTHS_LONG_EN.map(m => m.slice(0, 3));
const MONTHS_LONG = t(MONTHS_LONG_EN,
  ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']);
// Chart axes and point labels follow the edition, abbreviated.
const MONTHS_AXIS = t(MONTHS_EN, ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']);
const isoDay = iso => +iso.slice(8, 10), isoMonth = iso => +iso.slice(5, 7) - 1, isoYear = iso => iso.slice(0, 4);
// Time spans in milliseconds, for date arithmetic on ISO dates read as UTC midnight.
const DAY = 864e5, WEEK = 7 * DAY, YEAR = 365.25 * DAY;
const dmy = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${isoYear(iso)}`;
// Running text: "27 September 2026" | "27/09/2026"; "27 September" | "27/09"; "September 2026" | "setembro de 2026".
const longDate = iso => iso ? t(`${isoDay(iso)} ${MONTHS_LONG[isoMonth(iso)]} ${isoYear(iso)}`, dmy(iso)) : MISSING;
const dayMonth = iso => iso ? t(`${isoDay(iso)} ${MONTHS_LONG[isoMonth(iso)]}`, dmy(iso).slice(0, 5)) : MISSING;
const monthYear = iso => t(`${MONTHS_LONG[isoMonth(iso)]} ${isoYear(iso)}`, `${MONTHS_LONG[isoMonth(iso)]} de ${isoYear(iso)}`);
// Exhibits: "27 Sep 2026" | "27/09/2026"; "27 Sep" | "27/09"; "Sep 2026" | "set. 2026" on chart axes.
const cellDate = iso => iso ? t(`${isoDay(iso)} ${MONTHS_EN[isoMonth(iso)]} ${isoYear(iso)}`, dmy(iso)) : MISSING;
const shortDate = iso => iso ? t(`${isoDay(iso)} ${MONTHS_EN[isoMonth(iso)]}`, dmy(iso).slice(0, 5)) : MISSING;
const monthAxis = iso => `${MONTHS_AXIS[isoMonth(iso)]} ${isoYear(iso)}`;
const monthYearEn = iso => `${MONTHS_EN[isoMonth(iso)]} ${isoYear(iso)}`;
const SIDES = {ask: 'Sell Offers', bid: 'Buy Offers'};
const SIDE_KEYS = Object.keys(SIDES);
const list = a => a.length > 1 ? `${a.slice(0, -1).join(', ')}${t(' and ', ' e ')}${a.at(-1)}` : a.join('');
const esc = s => cleanText(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const cls = v => ok(v) ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : 'dim';
// Formulas are written in LaTeX and typeset by KaTeX (loaded before this script); without it the source stays readable.
const tex = (source, display = false) => window.katex
  ? katex.renderToString(source, {displayMode: display, throwOnError: false, output: 'htmlAndMathml'})
  : `<code>${source.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]))}</code>`;
const math = source => `<div class="math">${tex(source, true)}</div>`;
// The evidential status of an exhibit or a headline figure, one of four and written in English like the exhibit titles:
// a quote or a count as recorded; a model scored against later observations; a model's output not yet scored; and a
// comparison or rule without enough history to validate it.
const EVIDENCE = {observed: 'Observed', backtested: 'Backtested', model: 'Model-implied', exploratory: 'Exploratory'};
// A word space follows the label, so it reads apart from the text it qualifies.
const evidenceTag = kind => `<span class="evidence evidence-${kind}">${EVIDENCE[kind]}</span> `;
// A headline figure: its capital label, the figure, then its evidential status and context.
const kpi = (label, value, evidence, note) => `<div class="kpi" role="listitem"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${evidenceTag(evidence)}${note}</div></div>`;


// Presentation vocabulary never changes source-data identifiers or model inputs.
const UI_LABELS = {
  "Mundo": "World",
  "Mundos": "Worlds",
  "Mundo / leitura": "World / Reading",
  "Mundos (dias)": "Worlds (Days)",
  "Semente": "Seed",
  "Lado do Market": "Market Side",
  "Tipo": "Type",
  "Captura": "Capture",
  "Capturas": "Captures",
  "Comparação": "Comparison",
  "Última leitura": "Latest Reading",
  "Quoted spread": "Quoted Spread",
  "Histórico de": "History for",
  "Execução": "Execution",
  "Agenda": "Calendar",
  "Método": "Method",
  "Aceitando": "Taking Offers",
  "Alta": "High",
  "Alta de referência": "Reference Rise",
  "Alta em": "Positive Δ Share",
  "Altas observadas": "Observed Rises",
  "Amount no melhor preço": "Amount at Best Price",
  "Amount total": "Total Amount",
  "Amplitude": "Range",
  "Ano": "Year",
  "Anos": "Years",
  "Baixa": "Low",
  "Brier; ano anterior": "Brier: Previous Year",
  "Brier; frequência histórica": "Brier: Historical Frequency",
  "Brier; modelo": "Brier: Model",
  "Central": "Base",
  "Cenário central": "Base Scenario",
  "Ciclo": "Cycle",
  "Com ganho em TC": "Positive TC Δ",
  "Combinações": "Combinations",
  "Condição": "Condition",
  "Conjunto": "Ensemble",
  "Constante": "Constant",
  "Correlação semanal": "Weekly Correlation",
  "Criando, após taxas": "Making Offers, Net",
  "Criando, bruto": "Making Offers, Gross",
  "Cruzados": "Crossed Offers",
  "Data": "Date",
  "De": "From",
  "Defasagem (semanas)": "Lag (Weeks)",
  "Dentro de 50%": "Within 50%",
  "Dentro de 80%": "Within 80%",
  "Desde 2023; ≥+3%": "Since 2023, ≥+3%",
  "Desde 2024; ≥+3%": "Since 2024, ≥+3%",
  "Desvio": "Deviation",
  "Desvio do mundo": "World SD",
  "Desvio-padrão semanal": "Weekly Standard Deviation",
  "Dia": "Day",
  "Dias": "Days",
  "Dias a menos de 2% do máximo": "Days Within 2% of Peak",
  "Dias com cotação por semana": "Quote Days per Week",
  "Dias de ofertas": "Offer Days",
  "Dias dentro de ±2%": "Days Within ±2%",
  "Dias pareados": "Matched Days",
  "Dias recompra": "Repurchase Days",
  "Dias venda": "Sale Days",
  "Dias; Buy Offers": "Buy Offer Days",
  "Dias; Sell Offers": "Sell Offer Days",
  "Direção": "Direction",
  "Episódios": "Episodes",
  "Erro da mediana": "Median Error",
  "Estresse": "Stress",
  "Estresse de alta": "Heuristic Band High",
  "Estresse de baixa": "Heuristic Band Low",
  "Evento": "Event",
  "Excesso vs placebo": "Excess vs Placebo",
  "Fim": "End",
  "Fim exclusivo": "Exclusive End",
  "Fim implícito": "Implied End",
  "Ganho P10 / P50 / P90": "TC Δ P10 / P50 / P90",
  "Grupo": "Group",
  "Harmônico": "Harmonic",
  "Histórico": "History",
  "IC inferior": "Lower CI",
  "IC superior": "Upper CI",
  "Início": "Start",
  "Janela": "Window",
  "Janelas sem sobreposição": "Nonoverlapping Windows",
  "Junho": "June",
  "Leituras": "Readings",
  "Leituras ≥ captura": "Readings ≥ Capture",
  "Maior mudança de patamar": "Largest Level Δ",
  "Marco": "Milestone",
  "Mediana": "Median",
  "Mediana 180 dias": "180-Day Median",
  "Mediana histórica": "Historical Median",
  "Mediana seguinte": "Forward Median",
  "Mediana sem deslocar dia": "Same-Day Median",
  "Mediana semanal": "Weekly Median",
  "Mediana; desde 2023": "Median Since 2023",
  "Mediana; desde 2024": "Median Since 2024",
  "Mesmos meses, outros anos": "Same Months, Other Years",
  "Máxima": "Maximum",
  "Máximo diário": "Daily Maximum",
  "Máximo mediano": "Median Peak",
  "Mês": "Month",
  "Mês de venda": "Sale Month",
  "Mínima": "Minimum",
  "Mínimo": "Minimum",
  "Mínimo mediano": "Median Minimum",
  "Nível": "Level",
  "Nível implícito": "Implied Level",
  "Ocorrências": "Occurrences",
  "Ofertas; desde 2023": "Offers Since 2023",
  "Ofertas; desde 2024": "Offers Since 2024",
  "Origens": "Origins",
  "P(alta) média": "Mean P(Rise)",
  "P50; desde 2024": "P50 Since 2024",
  "Pacote; médias diárias": "Package: Daily Averages",
  "Pacote; ≥+3%": "Package: ≥+3%",
  "Para": "To",
  "Pares": "Pairs",
  "Partida": "Starting Value",
  "Período": "Period",
  "Preço": "Price",
  "Primeira oferta": "First Offer",
  "Razão": "Ratio",
  "Recorte": "Scope",
  "Round-trip execution cost": "Round-Trip Execution Cost",
  "Sazonal": "Seasonal Naive",
  "Sem ciclo anual": "Without Annual Cycle",
  "Sem quadro de ofertas": "Missing Order Book",
  "Sem sazonalidade": "Seasonally Adjusted",
  "Semana": "Week",
  "Semana máxima": "Peak Week",
  "Semana mínima": "Trough Week",
  "Semanas": "Weeks",
  "Teste": "Test",
  "Treino": "Training Sample",
  "Trimestre": "Quarter",
  "Um ponto por semana": "One Point per Week",
  "Variação": "Δ",
  "Variação TC": "TC Δ",
  "Variação diária mediana": "Median Daily Δ",
  "Variação mediana": "Median Δ",
  "Wide spread >20%": "Wide Spread >20%",
  "p (dentro da semana)": "p (Within Week)",
  "p (episódios espaçados)": "p (Spaced Episodes)",
  "p (livre)": "p (Unrestricted)",
  "q ajustado": "Adjusted q",
  "Última oferta": "Latest Offer",
  "Último dia": "Last Day",
  "Buy Offers; Amount total": "Buy Offers: Total Amount",
  "Buy Offers; central": "Buy Offers: Base",
  "Buy Offers; melhor Amount": "Buy Offers: Best Amount",
  "Buy Offers; venda": "Buy Offers: Sale",
  "Sell Offers; Amount total": "Sell Offers: Total Amount",
  "Sell Offers; central": "Sell Offers: Base",
  "Sell Offers; melhor Amount": "Sell Offers: Best Amount",
  "Sell Offers; recompra": "Sell Offers: Repurchase",
  "Sell Offers; baixa": "Sell Offers: Low",
  "Sell Offers; alta": "Sell Offers: High",
  "26 semanas": "26 Weeks",
  "8 semanas": "8 Weeks",
  // categorical values printed in table cells
  "alta": "Rise",
  "queda": "Decline",
  "alta (em curso)": "Rise (Ongoing)",
  "aceitando": "Taking Offers",
  "criando ofertas": "Making Offers",
  "Demais mundos": "Other Worlds",
  "Âncora": "Anchor",
  "Confiança": "Confidence",
  "Limitada": "Limited",
  "Moderada": "Moderate",
  "Testes": "Tests",
  "Estresse local": "Local Stress",
  "13 semanas": "13 Weeks",
  "dispersão do prêmio": "Premium Dispersion",
  "valor fixo de 10%": "Fixed 10%",
  "Sem oferta válida até o corte": "No Valid Offer by the Cutoff",
  "todas as semanas": "All Weeks",
  "após alta forte (20% maiores altas em 4 semanas)": "After a Strong Rise (Top 20% of 4-Week Rises)",
  "após queda forte (20% maiores quedas em 4 semanas)": "After a Strong Decline (Top 20% of 4-Week Declines)",
  "Cenário de ofertas": "Offer Scenario",
  "Condicional: cotação defasada": "Conditional: Stale Quote",
  "Suspenso: fusão anunciada": "Suspended: Announced Merger",
  "Condicional: pontas cruzadas": "Conditional: Crossed Sides",
  "Agenda fornecida; sujeita a revisão": "Provided Schedule, Subject to Revision",
  "seg": "Mon", "ter": "Tue", "qua": "Wed", "qui": "Thu", "sex": "Fri", "sáb": "Sat", "dom": "Sun"
};
// Short table labels keep narrow numeric columns proportional to their values.
// The complete label remains available in a tooltip and to assistive technology.
const TABLE_LABELS = {
  'Round-Trip Execution Cost': 'Cost',
  'Amount at Best Price': 'Best Amount',
  'Weekly Standard Deviation': 'Weekly SD',
  'Days Within 2% of Peak': 'Days Near Peak',
  'Quote Days per Week': 'Days / Week',
  'Nonoverlapping Windows': 'Windows',
  'Maker Minus Taker': 'Maker vs Taker',
  'Same Months, Other Years': 'Other Years',
  'Peak: Median (P10 to P90)': 'Peak / P10 / P90',
  'Median Peak Week (Sunday)': 'Peak Week',
  'Median Trough Week (Sunday)': 'Trough Week',
  'March to September 2027 Minimum: Median (P10 to P90)': '2027 Low / P10 / P90',
  'Peak Week: Through October / November to December / January to February': 'Peak: Oct / Dec / Feb',
  'Brier: Historical Frequency': 'Brier: History',
  'Brier: Previous Year': 'Brier: Prior Year',
  'One Point per Week': 'Weekly Point',
  'Without Annual Cycle': 'No Annual Cycle',
  'Missing Order Book': 'Missing Book',
  'Buy Offers: Total Amount': 'Buy Amount',
  'Sell Offers: Total Amount': 'Sell Amount',
  'Buy Offers: Best Amount': 'Best Buy Amount',
  'Sell Offers: Best Amount': 'Best Sell Amount',
  'Buy Offers: Repurchase': 'Buy: Repurchase',
  'Sell Offers: Repurchase': 'Sell: Repurchase',
  'Buy Offers: Sale': 'Buy: Sale'
};
function tableLabel(column) {
  const full = uiLabel(column.label);
  const short = column.short || TABLE_LABELS[full] || full;
  const description = full === 'Round-Trip Execution Cost'
    ? `${short}: ${full}, 1 minus Buy Offers divided by Sell Offers`
    : short === full ? full : `${short}: ${full}`;
  return {short, description};
}
// Typography shared by prose, chart labels and table text. Terminology is written at the source in each edition
// (the Portuguese edition keeps financial, statistical, Tibia and game terms in English), so nothing here translates:
// it only settles ranges, separators and missing values, and never changes data keys, model identifiers or links.
// Data strings from the pipeline may still carry dash-like glyphs (cycles such as 2025 to 2026 are written with one): a range reads "to" / "a", a spaced dash
// becomes a comma, a lone dash a missing value, and a typographic minus the hyphen-minus. No dash-like glyph is ever printed.
function cleanText(value) {
  return String(value).replace(/(\S)[‒–](\S)/g, `$1${t(' to ', ' a ')}$2`).replace(/\s+[‒–—―]\s+/g, ', ').replace(/[‒–—―]/g, MISSING).replace(/−/g, '-');
}
// Exhibits abbreviate BattlEye colours (YBE, GBE) to keep columns narrow; running text spells them out.
const abbreviateBattlEye = text => text.replace(/\b(Yellow|Green) BattlEye\b/g, (_, colour) => `${colour[0]}BE`);
function uiLabel(value) {
  return abbreviateBattlEye(cleanText(UI_LABELS[value] || value));
}
// A text cell is a label too: known values and "n de m dias" windows print in English.
const tableValue = v => typeof v === 'string' ? uiLabel(v.replace(/^(\d+) de (\d+) dias$/, '$1 of $2 Days')) : v;
function normalizeReport(scope = document) {
  scope.querySelectorAll?.('.drawer .scroll').forEach(scroll => {
    if (scroll.previousElementSibling?.matches('[data-export-table]')) return;
    scroll.insertAdjacentHTML('beforebegin', exportButton(true));
  });
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    // Typeset formulas and the endnotes keep their own typography.
    if (node.parentElement?.closest('script, style, code, .katex, .endnotes')) continue;
    const clean = cleanText(node.nodeValue);
    if (clean !== node.nodeValue) node.nodeValue = clean;
  }
}
function selectLinkedWorld(hash) {
  if (!hash.startsWith('#dossier-')) return;
  const dossier = document.getElementById(hash.slice(1));
  if (dossier?.dataset.world) set('world', dossier.dataset.world);
}
document.addEventListener('click', e => {
  const copy = e.target.closest('[data-copy-link]');
  if (copy) {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${copy.dataset.copyLink}`).then(() => {
      copy.dataset.copied = ''; setTimeout(() => delete copy.dataset.copied, 1500);
    });
    return;
  }
  const link = e.target.closest('a[href^="#dossier-"]');
  if (link) selectLinkedWorld(link.getAttribute('href'));
  const sort = e.target.closest('[data-table-sort]');
  const range = e.target.closest('[data-table-range]');
  if (sort || range) {
    const button = sort || range, id = button.dataset.target, model = tableModels.get(id);
    if (!model) return;
    if (sort) {
      const index = Number(sort.dataset.tableSort);
      model.direction = model.sort === index ? -model.direction : 1; model.sort = index;
    } else model.range = range.dataset.tableRange;
    syncTable(id);
  }
  const bound = e.target.closest('[data-state-key]');
  if (bound) set(bound.dataset.stateKey, bound.dataset.stateValue);
  const chartRange = e.target.closest('[data-chart-range]');
  if (chartRange) {
    const id = chartRange.dataset.target, range = chartRange.dataset.chartRange;
    chartRanges.set(id, range); charts.get(id)?.(document.getElementById(id));
    document.querySelector(`[data-chart-range="${range}"][data-target="${id}"]`)?.focus();
    normalizeReport();
  }
});
// Every picker names the state key it sets, so one handler serves all of them, header included.
document.addEventListener('change', e => { const key = e.target.dataset?.picker; if (key) set(key, e.target.value); });

// ---------------------------------------------------------------- state shared by every interactive block
const state = {world: '', side: 'ask', comparison: 'Previous', inflationMonth: '', premiumPeriod: '8', sample: 'main', tornado: 'jun28BelowStart', transferH: '13'};
const listeners = [];
// A block renders into placeholders (its hosts) on one page of the report. It runs while one of them is shown:
// when its page is shown, and again when a state key it depends on changes. A block without hosts serves every page.
const shown = l => !l.hosts.length || l.hosts.some(id => document.getElementById(id));
const on = (fn, deps = ['side', 'world'], hosts = []) => { const l = {fn, deps, hosts}; listeners.push(l); if (shown(l)) fn(); };
// Segments bound to a state key show the one selection: every key within `scope`, or one key.
const syncSegments = (scope, key) => scope.querySelectorAll(key ? `[data-state-key="${key}"]` : '[data-state-key]')
  .forEach(b => b.setAttribute('aria-pressed', String(state[b.dataset.stateKey] === b.dataset.stateValue)));
function set(key, value) {
  if (state[key] === value) return;
  // Re-rendering replaces a card's controls and drawers: keep the reader's focus and the drawers they opened.
  const a = document.activeElement, host = a?.closest('[id^="card-"]')?.id;
  const focusKey = a?.dataset?.stateKey ? `[data-state-key="${a.dataset.stateKey}"][data-state-value="${a.dataset.stateValue}"]` : a?.dataset?.picker ? `[data-picker="${a.dataset.picker}"]` : '';
  const open = [...document.querySelectorAll('details.drawer[open]')].map(d => d.closest('[id^="card-"]')?.id).filter(Boolean);
  state[key] = value;
  listeners.filter(l => l.deps.includes(key) && shown(l)).forEach(l => l.fn());
  // Controls that were not re-rendered with their block still show the one selection.
  syncSegments(document, key);
  normalizeReport();
  pruneTables();
  updateTableOverflow();
  open.forEach(id => { const d = document.querySelector(`#${id} details.drawer`); if (d) d.open = true; });
  if (host && focusKey) document.querySelector(`#${host} ${focusKey}`)?.focus();
}

// ---------------------------------------------------------------- tables
// A table's body is rebuilt from its model, in place, whenever its rows, range or order change.
function redrawTable(id) {
  const table = document.getElementById(id);
  table.tBodies[0].innerHTML = tableBody(tableModels.get(id));
  normalizeReport(table); updateTableOverflow();
  return table;
}
// A table a block rendered is gone once replaced; a table written in a page's own markup keeps its model.
const pruneTables = () => tableModels.forEach((model, id) => { if (!model.keep && !document.getElementById(id)) tableModels.delete(id); });
// A table shows its model: the rows in its window and order, its header's sort state and its range control.
function syncTable(id) {
  const model = tableModels.get(id), table = redrawTable(id);
  table.querySelectorAll('[data-table-sort]').forEach(b => {
    const active = Number(b.dataset.tableSort) === model.sort;
    b.closest('th').setAttribute('aria-sort', active ? (model.direction === 1 ? 'ascending' : 'descending') : 'none');
    b.querySelector('.sort-arrow').textContent = active ? (model.direction === 1 ? '↑' : '↓') : '↕';
  });
  document.querySelectorAll(`[data-table-range][data-target="${id}"]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tableRange === model.range)));
}
function updateTableOverflow() {
  document.querySelectorAll('.scroll').forEach(el => {
    const overflow = el.scrollWidth > el.clientWidth + 1;
    el.dataset.overflow = String(overflow);
    if (overflow) el.setAttribute('aria-description', t('Scroll horizontally to see every column.', 'Role horizontalmente para ver todas as colunas.'));
    else el.removeAttribute('aria-description');
  });
}
// The accessible name a table region carries until its card names it after the card title.
const TABLE_REGION = t('Data table', 'Tabela de dados');
// A range between two values in running text and exhibits.
const RANGE = t(' to ', ' a ');
let tableId = 0;
const tableModels = new Map();
const ranges = [['7D', 7], ['30D', 30], ['90D', 90], ['1Y', 365], ['All', 0]];
// The Market monitor's Δ compares each latest capture with the previous one, or with the last capture a period earlier.
const COMPARISONS = [['Previous', 0], ['1D', 1], ['7D', 7], ['30D', 30]];
const chartRanges = new Map();
const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
// The one builder for every segmented control. Each label is repeated in data-label so the
// stylesheet can reserve its strong-weight width: choosing a segment never resizes the control.
function segmented({label, title = '', items}) {
  return `<div class="seg" role="group" aria-label="${label}"${title ? ` title="${title}"` : ''}>${items.map(({text, attrs, pressed}) => `<button type="button" ${attrs} aria-pressed="${pressed}" data-label="${esc(text)}">${text}</button>`).join('')}</div>`;
}
// A chart's or table's own trailing window; a window shared across blocks is a stateControl instead.
function rangeControl(kind, id, active = 'All') {
  return segmented({label: 'Time Range', title: `Time Range, ending at the latest ${kind === 'chart' ? 'point' : 'row'}`,
    items: ranges.map(([label]) => ({text: label, attrs: `data-${kind}-range="${label}" data-target="${id}"`, pressed: label === active}))});
}
function inRange(rows, key, range) {
  const days = ranges.find(([label]) => label === range)?.[1];
  if (!days) return rows;
  const latest = Math.max(...rows.map(r => Date.parse(r[key])).filter(Number.isFinite));
  return rows.filter(r => Date.parse(r[key]) >= latest - days * DAY);
}
// sortable: false for a table whose rows are different measures, where a column has no single order.
function table({columns, rows, caption, groups, className = '', empty = t('No observations.', 'Sem observações.'), sortable = true}) {
  const id = `data-table-${++tableId}`;
  const dateKey = new Set(rows.map(r => r.world).filter(Boolean)).size <= 1 && ['date', 'capturedAt', 'start'].find(key => rows.some(r => isoDate(r[key])));
  const model = {columns, rows, empty, dateKey, range: 'All', sort: -1, direction: 1};
  tableModels.set(id, model);
  const classes = c => [c.num ? 'n' : '', c.wrap ? 'wrap' : '', c.groupStart ? 'group-start' : ''].filter(Boolean).join(' ');
  const header = (c, i, rowspan = '') => {
    const {short, description} = tableLabel(c);
    if (!sortable) return `<th scope="col" ${rowspan} class="${classes(c)}"><span class="col-head" title="${esc(description)}">${esc(short)}</span></th>`;
    return `<th scope="col" ${rowspan} class="${classes(c)}" aria-sort="none"><button type="button" class="sort-button" data-table-sort="${i}" data-target="${id}" title="${esc(description)}" aria-label="${esc(description)}">${esc(short)}<span class="sort-arrow" aria-hidden="true">↕</span></button></th>`;
  };
  let offset = 0;
  const grouped = groups ? `<tr>${groups.map(g => {
    const start = offset; offset += g.span;
    return g.rowspan ? header(columns[start], start, `rowspan="${g.rowspan}"`) : `<th scope="colgroup" colspan="${g.span}" class="group-title${g.start ? ' group-start' : ''}">${esc(uiLabel(g.label))}</th>`;
  }).join('')}</tr>` : '';
  const head = columns.map((c, i) => groups && c.rowspan ? '' : header(c, i)).join('');
  return `${dateKey ? `<div class="table-tools">${rangeControl('table', id)}</div>` : ''}<div class="scroll" tabindex="0" role="region" aria-label="${TABLE_REGION}"><table id="${id}" class="data${className ? ' ' + className : ''}">${caption ? `<caption>${caption}</caption>` : ''}${groups ? groups.map(g => `<colgroup span="${g.span}"></colgroup>`).join('') : ''}<thead>${grouped}<tr>${head}</tr></thead><tbody>${tableBody(model)}</tbody></table></div>`;
}
const cellHtml = (c, r) => c.render ? c.render(r[c.key], r) : esc(tableValue(r[c.key] ?? MISSING));
const scratch = document.createElement('template');
// A column sorts by what its cells show: the raw number or ISO date when the cell displays one,
// otherwise the displayed text. A cell that shows no value sorts last in either direction.
function sortKey(c, r) {
  if (c.sortValue) { const v = c.sortValue(r); return ok(v) || typeof v === 'string' ? v : null; }
  scratch.innerHTML = cellHtml(c, r);
  const text = cleanText(scratch.content.textContent).trim(), v = r[c.key];
  if (!text || text === MISSING) return null;
  if (ok(v) || (typeof v === 'string' && /^\d{4}-\d{2}/.test(v))) return v;
  if (c.num && /^[+-]?\d[\d.,]*\s*(%|pp|×)?$/.test(text)) return parseNumber(text);
  return text;
}
// Displayed numbers are parsed back in the edition's own convention: 1,234.5 in English, 1.234,5 in Portuguese.
const parseNumber = text => Number(text.replaceAll(t(',', '.'), '').replace(t('.', ','), '.').replace(/[^\d.+-]/g, ''));
const compareKeys = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b
  : typeof a === 'number' ? -1 : typeof b === 'number' ? 1 : String(a).localeCompare(String(b), 'en', {numeric: true});
function tableBody(model) {
  const {columns, dateKey, range, sort, direction, empty} = model;
  let rows = dateKey ? inRange(model.rows, dateKey, range) : model.rows.slice();
  if (sort >= 0) {
    const c = columns[sort], keys = new Map(rows.map(r => [r, sortKey(c, r)]));
    rows = rows.slice().sort((a, b) => {
      const av = keys.get(a), bv = keys.get(b);
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return direction * compareKeys(av, bv);
    });
  }
  return rows.length ? rows.map(r => `<tr>${columns.map((c, i) => {
    const v = cellHtml(c, r);
    const k = [c.num ? 'n' : '', c.wrap ? 'wrap' : '', c.groupStart ? 'group-start' : '', c.cls ? c.cls(r[c.key], r) : ''].filter(Boolean).join(' ');
    const tag = i === 0 && !c.num ? 'th' : 'td';
    return `<${tag}${tag === 'th' ? ' scope="row"' : ''}${k ? ` class="${k}"` : ''}>${v}</${tag}>`;
  }).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${empty}</td></tr>`;
}

// Column builders, one per kind of number: a count or level, a signed change (coloured by direction), a
// percentage and a probability. Each formatter already prints N/A for a missing value.
const num = (key, label, d = 0, extra = {}) => ({key, label, num: true, render: v => fmt(v, d), ...extra});
const signed = (key, label, d = 1) => ({key, label, num: true, render: v => sgn(v, d), cls: v => cls(v)});
const percent = (key, label, d = 1, extra = {}) => ({key, label, num: true, render: v => pctU(v, d), ...extra});
const probability = (key, label, extra = {}) => ({key, label, num: true, render: v => prob(v), ...extra});

let uid = 0;
// A table's own range control opens its markup; the card lifts it into the header's control stack.
const TABLE_TOOLS = /^<div class="table-tools">([\s\S]*?)<\/div>(?=<div class="scroll")/;
/**
 * Every exhibit has one anatomy: title and subtitle (scope and unit) on the left; every control
 * that acts on the exhibit stacked on the right; the chart or table; its legend; then its note.
 * A line chart adds its range control to the same stack (see lineChart).
 */
function card({id, title, evidence, sub = '', controls = '', body = '', note = '', drawer = ''}) {
  // Every table in the card is named by the card title.
  const tid = `t${++uid}`, named = html => html.replace(/<table id="([^"]+)" class="(data[^"]*)">/g, `<table id="$1" class="$2" aria-labelledby="${tid}">`).replaceAll(`aria-label="${TABLE_REGION}"`, `aria-labelledby="${tid}"`);
  const tools = body.match(TABLE_TOOLS);
  if (tools) { controls += tools[1]; body = body.slice(tools[0].length); }
  return `<figure class="card" data-export-figure${id ? ` id="${id}"` : ''}><div class="card-head"><div class="card-lead"><h3 class="card-title" id="${tid}">${uiLabel(title)}${exportButton()}</h3>${sub || evidence ? `<p class="card-sub">${evidence ? evidenceTag(evidence) : ''}${sub}</p>` : ''}</div><div class="card-controls" data-export-ui>${controls}</div></div><div class="card-body">${named(body)}</div>${note ? `<p class="card-note">${note}</p>` : ''}${drawer ? `<details class="drawer"><summary>Chart Data</summary>${named(drawer)}</details>` : ''}</figure>`;
}
// The chapters in reading order: the analytical spine of the report, one stage of the inference per chapter. Anchors
// are stable link targets (older editions used the same ids); each chapter's number is its position here. English
// titles use Chicago headline capitalisation; Portuguese titles use the sentence case Chicago prescribes for other languages.
const CHAPTERS = [
  ['sumario', t('Introduction', 'Introdução')],
  ['s13', t('Data and Variable Construction', 'Dados e construção das variáveis')],
  ['s01', t('Empirical Structure of the Market', 'Estrutura empírica do Market')],
  ['s03', t('Temporal Dynamics and Cycles', 'Dinâmica temporal e cycles')],
  ['modeling', t('Modelling Strategy', 'Estratégia de modelagem')],
  ['s06', t('Out-of-Sample Validation', 'Validação out of sample')],
  ['s02', t('Prospective Scenarios', 'Scenarios prospectivos')],
  ['downside', t('Will the Price Fall?', 'O price vai cair?')],
  ['s08', t('Economic and Execution Implications', 'Implicações econômicas e de execution')],
  ['decisions', t('Buying or Selling TC: Decision Scenarios', 'Comprar ou vender TC: scenarios de decisão')],
  ['s05', t('Heterogeneity across Worlds', 'Heterogeneidade entre worlds')],
  ['robustness', t('Robustness and Complementary Analyses', 'Robustness e análises complementares')],
  ['discussion', t('Discussion', 'Discussão')],
  ['falsification', t('What Would Falsify This Thesis?', 'O que refutaria esta tese?')],
  ['conclusion', t('Conclusion', 'Conclusão')]
];
// The endnotes close the report without a number: they are not a stage of the inference. Nor is the executive summary
// that opens it, which states the answers before the chapters derive them.
const SOURCES_TITLE = t('Notes', 'Notas'), EXECUTIVE_TITLE = t('Executive Summary', 'Sumário executivo');
const chapterIndex = id => CHAPTERS.findIndex(([key]) => key === id);
// The index lists the unnumbered summary, the chapters and the unnumbered notes: [id, number, title].
const contents = () => [['executive', '', EXECUTIVE_TITLE], ...CHAPTERS.map(([id, title]) => [id, chapterNum(id), title]), ['sources', '', SOURCES_TITLE]];
const chapterNum = id => String(chapterIndex(id) + 1).padStart(2, '0');
const chapterTitle = id => CHAPTERS[chapterIndex(id)][1];
// Chicago lowercases "section" in running text; `cap` is for the start of a sentence.
const chapterRef = (id, cap = false) => `<a href="#${id}">${cap ? t('Section', 'Seção') : t('section', 'seção')} ${chapterNum(id)}</a>`;
// A span of consecutive chapters: "sections 04 to 08".
const chapterSpan = (first, last, cap = false) => `${cap ? t('Sections', 'Seções') : t('sections', 'seções')} <a href="#${first}">${chapterNum(first)}</a>${t(' to ', ' a ')}<a href="#${last}">${chapterNum(last)}</a>`;
const chaptersRef = (ids, cap = false) => `${cap ? t('Sections', 'Seções') : t('sections', 'seções')} ${list(ids.map(id => `<a href="#${id}">${chapterNum(id)}</a>`))}`;
// Every numbered chapter opens with the same heading: its number and title set as one line.
const sectionHeading = id => `<h2 class="section-heading"><span class="num">${chapterNum(id)}</span><span class="section-title">${chapterTitle(id)}<button type="button" class="icon-button" data-copy-link="${id}" aria-label="${t('Copy link to this section', 'Copiar link desta seção')}" title="${t('Copy link', 'Copiar link')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg></button></span></h2>`;
// The one builder for every segmented control bound to shared state: `key` is the state it sets, and each
// option is a [value, label] pair.
const stateControl = ({label, key, options, title}) => segmented({label, title,
  items: options.map(([value, text]) => ({text, attrs: `data-state-key="${key}" data-state-value="${value}"`, pressed: state[key] === value}))});
// An exhibit that shows one side of the Market names it last, in parentheses, whatever else its title says.
const sided = (title, side) => `${title} (${SIDES[side]})`;
const sideControl = () => stateControl({label: 'Market Side', key: 'side', options: Object.entries(SIDES)});
// The one builder for every picker: `key` is the state it sets (see the change handler above).
const pickerControl = ({label, key, value = state[key], options}) => `<select class="picker" data-picker="${key}" aria-label="${esc(label)}">${options.map(o => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;

// ---------------------------------------------------------------- SVG charts
const ms = iso => Date.parse(iso + 'T00:00:00Z');
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n + 2) || 10 * mag;  // 3 to 7 gridlines
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function timeTicks(x0, x1) {
  const years = (x1 - x0) / YEAR, out = [];
  const d = new Date(x0); d.setUTCDate(1);
  const stepM = years > 2.5 ? 12 : years > 1.2 ? 6 : years > .6 ? 3 : 1;
  d.setUTCMonth(Math.ceil(d.getUTCMonth() / stepM) * stepM);
  if (stepM === 12) d.setUTCMonth(0), d.setUTCFullYear(d.getUTCFullYear() + (d.getTime() < x0 ? 1 : 0));
  for (; d.getTime() <= x1; d.setUTCMonth(d.getUTCMonth() + stepM)) {
    if (d.getTime() < x0) continue;
    const iso = d.toISOString().slice(0, 10);
    out.push({x: d.getTime(), label: stepM === 12 ? iso.slice(0, 4) : monthAxis(iso)});
  }
  return out;
}
// Chart geometry comes from the stylesheet's tokens (report.css :root), resolved to pixels once,
// so every chart shares one plot frame, mark size and label offsets with the CSS and the legends.
let geometry;
function G() {
  if (geometry) return geometry;
  const probe = document.createElement('div');
  probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
  document.body.append(probe);
  const px = name => { probe.style.width = `var(--${name})`; return probe.getBoundingClientRect().width; };
  geometry = {height: px('chart-height'), minWidth: px('chart-min-width'), compact: px('chart-compact'),
    plot: {t: px('plot-top'), r: px('plot-right'), b: px('plot-bottom'), l: px('plot-left')}, categoryLeft: px('plot-left-category'),
    stroke: px('stroke-data'), row: px('chart-row'), barMax: px('bar-max'), mark: px('mark-size') / 2, point: px('point-size') / 2, gap: px('rule'),
    label: px('label-offset'), tick: px('tick-gap'), tickSpacing: px('tick-spacing'), edge: px('edge-clearance'), labelEdge: px('label-clearance'), tip: px('tip-offset')};
  probe.remove();
  return geometry;
}
const chartWidth = host => Math.max(G().minWidth, host.clientWidth);
// Axis text: value labels centre on their gridline; category labels hang below the plot.
const yText = (x, y, text, cls = '') => `<text${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" text-anchor="end" dominant-baseline="central">${text}</text>`;
const xText = (x, H, m, text) => `<text x="${x}" y="${H - m.b + G().tick}" text-anchor="middle" dominant-baseline="hanging">${text}</text>`;
// A key pairs a swatch of the mark with its label; legends and tooltips draw the same key.
const swatch = (c, band) => { const k = (c || '').match(/c-(\w+)/)?.[1] || 'ink'; return band ? `band-${k}` : k; };
const seriesSwatch = s => [s.dash ? 'dashed' : '', swatch(s.cls), s.thin ? 'thin' : ''].filter(Boolean).join(' ');
const markSwatch = (kind, c) => `${kind === 'capture' ? 'ring' : 'dot'} ${swatch(c)}`;
const legendKey = (sw, label) => `<span><i class="sw ${sw}"></i>${label}</span>`;
// A legend is read off the marks it explains, labelled as their tooltips label them: one key per distinct
// swatch, in drawing order, naming every mark that shares it. It sits under the plot, centred on the plot
// area (not the SVG, whose axis labels would pull it off-centre): `category` for charts whose rows carry names.
function legendBelow(keys, category = false) {
  const labels = new Map();
  keys.forEach(([sw, label]) => { if (label && !labels.get(sw)?.includes(label)) labels.set(sw, [...(labels.get(sw) || []), label]); });
  return labels.size ? `<div class="legend${category ? ' category' : ''}">${[...labels].map(([sw, l]) => legendKey(sw, list(l))).join('')}</div>` : '';
}
// Tooltips are small reports: a heading (entity or date), then one key/value row per measure.
const tipReport = (head, rows) => `<div class="tip-head">${head}</div><div class="tip-rows">${rows.map(([key, label, value]) => `${legendKey(key, label)}<span class="tip-v">${value}</span>`).join('')}</div>`;
// The two sides of the Market as chart series, in the one order and colours every chart uses.
const sideSeries = (points, extra = {}) => SIDE_KEYS.map(s => ({label: SIDES[s], cls: `c-${s}`, ...extra, ...points(s)}));
function placeTip(host, tip, e, anchorX) {
  const hb = host.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  const x = anchorX ?? e.clientX - hb.left, y = e.clientY - hb.top;
  const o = G().tip;
  tip.style.left = `${x + o + tw > hb.width ? Math.max(0, x - tw - o) : x + o}px`;
  tip.style.top = `${y - th - o < 0 ? y + o : y - th - o}px`;
}
// Bars and rows carry their report in data-tip; hovering one highlights it and recedes the rest.
function markTips(host) {
  const svg = host.querySelector('svg'), tip = host.querySelector('.tip');
  svg.addEventListener('pointermove', e => {
    const mark = e.target.closest('[data-tip]');
    if (!mark) { tip.hidden = true; return; }
    tip.innerHTML = mark.dataset.tip; tip.hidden = false; placeTip(host, tip, e);
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}
// Every chart is one SVG drawn at its host's width, its legend under the plot, and a tooltip layer.
const plotHtml = (W, H, aria, svg, keys, category = false) => `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria || '')}">${svg}</svg>${legendBelow(keys, category)}<div class="tip" hidden></div>`;
// Gridlines at each value tick: across the plot for a vertical value axis, down it for a horizontal one.
const gridY = (ticks, Y, m, W) => `<g class="grid">${ticks.map(v => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>`;
const gridX = (ticks, X, m, H) => `<g class="grid">${ticks.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/>`).join('')}</g>`;
// A horizontal value axis spaces its labels like the date axis: as many ticks as fit one tick spacing apart.
const xTicks = (x0, x1, width) => niceTicks(x0, x1, Math.max(2, Math.floor(width / G().tickSpacing))).filter(v => v >= x0 && v <= x1);
// A value axis extends a fixed share of its span beyond the data, so no mark touches the frame.
const DOMAIN_PAD = .08;
const domainPad = (lo, hi) => (hi - lo || Math.abs(hi) * .05 || 1) * DOMAIN_PAD;
// An axis label keeps its tick's precision: whole ticks print no decimals, fractional ticks one.
const tickDigits = v => Number.isInteger(v) ? 0 : 1;
const yLabel = v => Math.abs(v) >= 1000 ? `${fmt(v / 1000, v % 1000 ? 1 : 0)}${t('k', ' mil')}` : fmt(v, tickDigits(v));

/**
 * Marks share one language in every chart: kind 'point' (a turning point or event on the series)
 * is a small filled dot; kind 'capture' (a spot reading: latest capture, starting value, anchor)
 * is a ring. A mark with `of: i` is an observation of series i, so it joins that series: the
 * gap rule below bridges it to the series' last weekly point, and the tooltip reads it.
 *
 * Line chart on a date axis. A line is solid only across observed stretches. A stretch with no
 * observations between two valid points (nulls, or a step longer than the series' own spacing)
 * stays a gap, bridged by a dotted line; nothing is interpolated. A point with no observed
 * neighbour is also drawn as a dot so sparse worlds stay visible.
 */
// A step counts as missing data once it exceeds the series' median spacing by half again.
const GAP_STEP = 1.5;
function observedRuns(points, xValue = ms) {
  const obs = []; let missing = false;
  points.forEach(([x, y]) => { if (!ok(y)) { missing = obs.length > 0; return; } obs.push({x: xValue(x), y, missing}); missing = false; });
  const steps = obs.slice(1).map((p, i) => p.x - obs[i].x).sort((a, b) => a - b), typical = steps[steps.length >> 1];
  const runs = [];
  obs.forEach((p, i) => { if (!i || p.missing || p.x - obs[i - 1].x > typical * GAP_STEP) runs.push([]); runs.at(-1).push(p); });
  return runs;
}
function lineChart(host, cfg) {
  const xValue = cfg.numericX ? Number : ms;
  const range = chartRanges.get(host.id) || 'All';
  const days = ranges.find(([label]) => label === range)?.[1];
  if (days && !cfg.numericX) {
    const dates = [...(cfg.series || []), ...(cfg.bands || [])].flatMap(s => s.points.map(p => xValue(p[0])));
    const cutoff = Math.max(...dates) - days * DAY;
    cfg = {...cfg,
      series: (cfg.series || []).map(s => ({...s, points: s.points.filter(p => xValue(p[0]) >= cutoff)})),
      bands: (cfg.bands || []).map(s => ({...s, points: s.points.filter(p => xValue(p[0]) >= cutoff)})),
      markers: (cfg.markers || []).filter(m => xValue(m.x) >= cutoff),
      vlines: (cfg.vlines || []).filter(m => xValue(m.x) >= cutoff)};
  }
  cfg = {...cfg, series: (cfg.series || []).map((s, i) => {
    const readings = (cfg.markers || []).filter(k => k.of === i).map(k => [k.x, k.y]);
    return readings.length ? {...s, points: [...s.points, ...readings].sort((a, b) => xValue(a[0]) - xValue(b[0]))} : s;
  })};
  // The range control joins the card's control stack, under the controls the card already has.
  const stack = host.closest('.card')?.querySelector(':scope > .card-head > .card-controls');
  let tools = stack?.querySelector(':scope > .chart-tools');
  if (stack && !tools) { tools = document.createElement('div'); tools.className = 'chart-tools'; stack.append(tools); }
  // A forecast or a numeric axis has no trailing window to choose, so it carries no range control.
  if (tools) tools.innerHTML = cfg.numericX || cfg.fixedRange ? '' : rangeControl('chart', host.id, range);
  const g = G(), W = chartWidth(host), H = g.height, m = g.plot;
  const xs = [], ys = [];
  (cfg.series || []).forEach(s => s.points.forEach(([x, y]) => { xs.push(xValue(x)); if (ok(y)) ys.push(y); }));
  (cfg.bands || []).forEach(b => b.points.forEach(([x, lo, hi]) => { xs.push(xValue(x)); if (ok(lo)) ys.push(lo); if (ok(hi)) ys.push(hi); }));
  cfg.markers = (cfg.markers || []).filter(k => ok(k.y));
  cfg.markers.forEach(k => { xs.push(xValue(k.x)); ys.push(k.y); });
  if (!ys.length) { host.innerHTML = `<p class="dim">${t('No data for this range.', 'Sem dados para este recorte.')}</p>`; return; }
  // A single date opens a week on either side (seven days on a numeric day axis).
  const week = cfg.numericX ? 7 : WEEK;
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= week; x1 += week; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = domainPad(y0, y1); y0 -= pad; y1 += pad;
  if (cfg.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  // A probability or another bounded quantity keeps its whole scale, so charts of it compare at a glance.
  if (cfg.domain) [y0, y1] = cfg.domain;
  if (cfg.xDomain) [x0, x1] = cfg.xDomain;
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const yt = niceTicks(y0, y1).filter(v => v >= y0 && v <= y1);
  const fy = cfg.yFmt || yLabel;
  let svg = gridY(yt, Y, m, W);
  svg += yt.map(v => yText(m.l - g.tick, Y(v), fy(v))).join('');
  // Keep full date labels legible on narrow plots, thinning ticks, never data.
  let previousLabel = -Infinity;
  svg += (cfg.numericX ? xTicks(x0, x1, W - m.l - m.r).map(x => ({x, label: cfg.xFmt ? cfg.xFmt(x) : `${fmt(x)} d`})) : timeTicks(x0, x1)).map(t => ({...t, px: Math.max(m.l + g.edge, Math.min(W - m.r - g.edge, X(t.x)))})).filter(t => {
    if (t.px - previousLabel < g.tickSpacing) return false;
    previousLabel = t.px; return true;
  }).map(t => xText(t.px, H, m, t.label)).join('');
  svg += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
  if (cfg.zero && y0 < 0 && y1 > 0) svg += `<line class="zero" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  (cfg.vlines || []).forEach(v => { svg += `<line class="rule" x1="${X(xValue(v.x))}" x2="${X(xValue(v.x))}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(xValue(v.x)) + g.label}" y="${m.t + g.label}" dominant-baseline="hanging">${v.label}</text>`; });
  (cfg.bands || []).forEach(b => {
    let seg = [];
    const flush = () => { if (seg.length > 1) svg += `<path class="band ${b.cls}" d="M${seg.map(p => `${X(p[0])},${Y(p[2])}`).join('L')}L${seg.slice().reverse().map(p => `${X(p[0])},${Y(p[1])}`).join('L')}Z"/>`; seg = []; };
    b.points.forEach(([x, lo, hi]) => ok(lo) && ok(hi) ? seg.push([xValue(x), lo, hi]) : flush()); flush();
  });
  let gapped = false;
  (cfg.series || []).forEach(s => {
    const runs = observedRuns(s.points, xValue), at = p => `${X(p.x)},${Y(p.y)}`;
    const bridges = runs.slice(1).map((run, i) => `M${at(runs[i].at(-1))}L${at(run[0])}`).join('');
    if (bridges) { gapped = true; svg += `<path class="line gap ${s.cls}${s.thin ? ' thin' : ''}" d="${bridges}"/>`; }
    svg += `<path class="line ${s.cls}${s.dash ? ' dash' : ''}${s.thin ? ' thin' : ''}" d="${runs.map(run => `M${run.map(at).join('L')}`).join('')}"/>`;
    runs.forEach(run => run.forEach(p => { if (run.length === 1 || s.dots) svg += `<circle class="pt ${s.cls}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${g.point}"/>`; }));
  });
  (cfg.markers || []).forEach(k => {
    const cx = X(xValue(k.x)), cy = Y(k.y), up = k.pos !== 'below';
    // Labels near either edge are anchored inwards so they are never clipped.
    const anchor = cx > W - m.r - g.labelEdge ? 'end' : cx < m.l + g.labelEdge ? 'start' : 'middle', tx = anchor === 'end' ? cx + g.label : anchor === 'start' ? cx - g.label : cx;
    const ty = up ? cy - g.mark - g.label : cy + g.mark + g.label;
    svg += `<g class="mk"><circle class="${k.kind === 'capture' ? 'hollow' : 'pt'} ${k.cls || 'c-ink'}" cx="${cx}" cy="${cy}" r="${g.mark}"/>${k.label ? `<text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="${up ? 'auto' : 'hanging'}">${k.label}</text>` : ''}</g>`;
  });
  svg += `<line class="rule xhair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><rect class="hover" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/>`;
  const keys = [...(cfg.series || []).map(s => [seriesSwatch(s), s.label]), ...(cfg.bands || []).map(b => [swatch(b.cls, true), b.label]),
    ...cfg.markers.map(k => [markSwatch(k.kind, k.cls), k.key]), ...(gapped ? [['dotted', t('No observations', 'Sem observações')]] : [])];
  host.innerHTML = plotHtml(W, H, cfg.aria, svg, keys);

  // Crosshair tooltip: every series and band at the nearest date that has data.
  const dates = [...new Set([...(cfg.series || []).flatMap(s => s.points.filter(p => ok(p[1])).map(p => p[0])), ...(cfg.bands || []).flatMap(b => b.points.filter(p => ok(p[1])).map(p => p[0]))])].sort();
  const svgEl = host.querySelector('svg'), tip = host.querySelector('.tip'), rule = svgEl.querySelector('.xhair');
  const fv = cfg.tipFmt || (v => fmt(v));
  svgEl.querySelector('.hover').addEventListener('pointermove', e => {
    const box = svgEl.getBoundingClientRect(), sx = (e.clientX - box.left) * W / box.width;
    const target = x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0);
    let best = dates[0]; for (const d of dates) if (Math.abs(xValue(d) - target) < Math.abs(xValue(best) - target)) best = d;
    const rows = [];
    // Series dated on different weekdays (Sunday weeks, Wednesday scenarios) meet at the nearest point within half a week.
    const near = pts => pts.filter(q => ok(q[1])).find(q => Math.abs(xValue(q[0]) - xValue(best)) <= (cfg.numericX ? 0 : WEEK / 2));
    (cfg.series || []).forEach(s => { const p = near(s.points); if (p) rows.push([seriesSwatch(s), s.label, fv(p[1])]); });
    (cfg.bands || []).forEach(b => { const p = near(b.points); if (p) rows.push([swatch(b.cls, true), b.label, `${fv(p[1])}${RANGE}${fv(p[2])}`]); });
    if (!rows.length) return;
    const px = X(xValue(best)), hb = host.getBoundingClientRect();
    rule.setAttribute('x1', px); rule.setAttribute('x2', px); rule.setAttribute('visibility', 'visible');
    tip.innerHTML = tipReport(cfg.tipHead ? cfg.tipHead(best) : cfg.numericX ? t(`Server age: ${fmt(+best)} days`, `Server age: ${fmt(+best)} dias`) : cellDate(best), rows); tip.hidden = false;
    placeTip(host, tip, e, box.left - hb.left + px * box.width / W);
  });
  svgEl.querySelector('.hover').addEventListener('pointerleave', () => { tip.hidden = true; rule.setAttribute('visibility', 'hidden'); });
}

/** Grouped bars with optional interval whiskers; a <title> on each bar carries its value. */
function barChart(host, cfg) {
  const g = G(), W = chartWidth(host), H = g.height, m = g.plot;
  const vals = cfg.series.flatMap(s => [...s.values, ...(s.lo || []), ...(s.hi || [])]).filter(ok);
  let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals); const pad = domainPad(y0, y1); y0 -= y0 < 0 ? pad : 0; y1 += pad;
  const n = cfg.categories.length, band = (W - m.l - m.r) / n, bw = Math.min(g.barMax, band * .8 / cfg.series.length);
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const yt = niceTicks(y0, y1).filter(v => v >= y0 && v <= y1), fy = cfg.yFmt || (v => fmt(v, 1));
  let svg = gridY(yt, Y, m, W);
  svg += yt.map(v => yText(m.l - g.tick, Y(v), fy(v))).join('');
  svg += `<line class="zero" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  cfg.categories.forEach((c, i) => {
    const cx = m.l + band * (i + .5);
    if (band >= g.edge || i % 2 === 0) svg += xText(cx, H, m, c);
    cfg.series.forEach((s, j) => {
      const v = s.values[i]; if (!ok(v)) return;
      const x = cx - bw * cfg.series.length / 2 + bw * j;
      const tf = cfg.tipFmt || fy, ci = s.lo && ok(s.lo[i]);
      const report = tipReport(c, [[swatch(s.cls), s.label, tf(v)], ...(ci ? [['whisker', cfg.ciLabel, `${tf(s.lo[i])}${RANGE}${tf(s.hi[i])}`]] : [])]);
      svg += `<g class="mark" data-tip="${esc(report)}"><rect class="${s.cls}" x="${x + g.gap}" y="${Math.min(Y(v), Y(0))}" width="${bw - 2 * g.gap}" height="${Math.max(g.gap, Math.abs(Y(v) - Y(0)))}"/>`;
      if (ci) svg += `<line class="c-ink whisker" x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${Y(s.lo[i])}" y2="${Y(s.hi[i])}"/>`;
      svg += '</g>';
    });
  });
  const keys = [...cfg.series.map(s => [swatch(s.cls), s.label]), ...(cfg.series.some(s => s.lo) ? [['whisker', cfg.ciLabel]] : [])];
  host.innerHTML = plotHtml(W, H, cfg.aria, svg, keys);
  markTips(host);
}

// Calendar-week windows preserve the research's median log-premium convention.
const PREMIUM_PERIODS = [1, 4, 8, 13, 26, 52, 0].map(weeks => ({weeks, value: String(weeks), label: weeks ? `${weeks}W` : 'All'}));
function premiumWindow(series, benchmark, side, weeks, cutoff) {
  const paired = series.filter(r => r.date <= cutoff && ok(r[side]) && r[side] > 0 && ok(benchmark.get(r.date)?.[side]) && benchmark.get(r.date)[side] > 0)
    .map(r => ({date: r.date, value: Math.log(r[side] / benchmark.get(r.date)[side])})).sort((a, b) => a.date.localeCompare(b.date));
  const end = paired.at(-1)?.date;
  const selected = weeks ? paired.filter(r => Date.parse(r.date) > Date.parse(end) - weeks * WEEK) : paired;
  const values = selected.map(r => r.value).sort((a, b) => a - b), k = values.length >> 1;
  const middle = values.length ? (values.length % 2 ? values[k] : (values[k - 1] + values[k]) / 2) : null;
  return {premiumPct: middle === null ? null : Math.expm1(middle) * 100, weeks: values.length, first: selected[0]?.date, last: selected.at(-1)?.date};
}

/** One series color and fixed endpoint opacities across every reference window. */
function dumbbell(host, cfg) {
  const historicalKey = `dot historical ${swatch(cfg.cls)}`, recentKey = `dot ${swatch(cfg.cls)}`;
  const g = G(), rows = cfg.rows, W = chartWidth(host), rowH = g.row, m = {...g.plot, l: g.categoryLeft};
  const H = m.t + m.b + rowH * rows.length;
  const vals = rows.flatMap(r => [r.a, r.b]).filter(ok);
  let x0 = Math.min(0, ...vals), x1 = Math.max(0, ...vals); const pad = domainPad(x0, x1); x0 -= pad; x1 += pad;
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
  const xt = xTicks(x0, x1, W - m.l - m.r);
  let svg = gridX(xt, X, m, H);
  svg += xt.map(v => xText(X(v), H, m, pctU(v, tickDigits(v)))).join('');
  svg += `<line class="zero" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H - m.b}"/>`;
  rows.forEach((r, i) => {
    const y = m.t + rowH * (i + .5);
    const report = tipReport(esc(r.label), [[historicalKey, cfg.aLabel, sgn(r.a)], [recentKey, cfg.bLabel, sgn(r.b)], ...(r.details || [])]);
    svg += `<g class="mark" data-tip="${esc(report)}"><rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}"/>`;
    svg += yText(m.l - g.tick, y, esc(r.label), 'cat');
    if (ok(r.a) && ok(r.b)) {
      const a = X(r.a), b = X(r.b), gradientId = `${host.id}-recency-${i}`;
      // Paint the union of both dots and the connector once. Overlapping subpaths share
      // one winding direction, so transparency cannot accumulate beneath either dot.
      const dot = x => `M${x - g.mark},${y}a${g.mark},${g.mark} 0 1 1 ${2 * g.mark},0a${g.mark},${g.mark} 0 1 1 ${-2 * g.mark},0Z`;
      const left = Math.min(a, b), right = Math.max(a, b);
      const connector = a === b ? '' : `M${left},${y - g.stroke / 2}H${right}V${y + g.stroke / 2}H${left}Z`;
      if (a !== b) svg += `<defs><linearGradient class="premium-gradient" id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${a}" x2="${b}" y1="${y}" y2="${y}"><stop offset="0" class="historical ${cfg.cls}"/><stop offset="1" class="${cfg.cls}"/></linearGradient></defs>`;
      svg += `<path class="premium-shape${a === b ? ` ${cfg.cls}` : ''}"${a !== b ? ` fill="url(#${gradientId})"` : ''} d="${dot(a)}${connector}${a !== b ? dot(b) : ''}"/>`;
    } else {
      if (ok(r.a)) svg += `<circle class="pt historical ${cfg.cls}" cx="${X(r.a)}" cy="${y}" r="${g.mark}"/>`;
      if (ok(r.b)) svg += `<circle class="pt recent ${cfg.cls}" cx="${X(r.b)}" cy="${y}" r="${g.mark}"/>`;
    }
    svg += '</g>';
  });
  host.innerHTML = plotHtml(W, H, cfg.aria, svg, [[historicalKey, cfg.aLabel], [recentKey, cfg.bLabel]], true);
  markTips(host);
}

/** A tornado: how far one quantity moves across the alternatives of each source of variation. One row per source,
 *  sorted by width; a bar from the lowest to the highest value; a guide at the base value. Rows carry their report. */
function rangeChart(host, cfg) {
  const g = G(), rows = cfg.rows, W = chartWidth(host), rowH = g.row, m = {...g.plot, l: g.categoryLeft};
  const H = m.t + m.b + rowH * rows.length, [x0, x1] = cfg.domain;
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
  const xt = xTicks(x0, x1, W - m.l - m.r);
  let svg = gridX(xt, X, m, H);
  svg += xt.map(v => xText(X(v), H, m, cfg.xFmt(v))).join('');
  rows.forEach((r, i) => {
    const y = m.t + rowH * (i + .5);
    svg += `<g class="mark" data-tip="${esc(r.tip)}"><rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}"/>${yText(m.l - g.tick, y, esc(r.label), 'cat')}`;
    svg += `<rect class="${cfg.cls}" x="${X(r.lo)}" y="${y - g.mark}" width="${Math.max(g.gap, X(r.hi) - X(r.lo))}" height="${2 * g.mark}"/></g>`;
  });
  svg += `<line class="rule" x1="${X(cfg.base)}" x2="${X(cfg.base)}" y1="${m.t}" y2="${H - m.b}"/>`;
  host.innerHTML = plotHtml(W, H, cfg.aria, svg, [[swatch(cfg.cls), cfg.label], ['guide', cfg.baseLabel]], true);
  markTips(host);
}

// Charts are drawn at their container's width; redraw them when it changes. Keyed by
// element id, so re-rendering a block after a control change replaces its entry.
const charts = new Map();
function chart(id, draw) {
  const host = document.getElementById(id); if (!host) return;
  charts.set(id, draw); draw(host); normalizeReport(host);
}
let resizeTimer, lastWidth = 0;
const ro = new ResizeObserver(entries => {
  const w = Math.round(entries[0].contentRect.width); if (w === lastWidth) return; lastWidth = w;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { charts.forEach((draw, id) => { const h = document.getElementById(id); if (h) { draw(h); normalizeReport(h); } }); updateTableOverflow(); }, 120);
});

// ---------------------------------------------------------------- market monitor
// market-update.json is the raw capture export: one row per capture, any world.
// Every world in it is shown; research worlds without a capture fall back to the
// last API offer from results.json. Keep the last capture of each calendar day
// and compare against the previous different day (timestamps carry no timezone).
// Δ between two readings of a world, per side, in %; null without an earlier reading.
const readingDelta = (now, prior) => ({sell: prior ? (now.sell / prior.sell - 1) * 100 : null, buy: prior ? (now.buy / prior.buy - 1) * 100 : null});
function marketMonitor(captures, research) {
  captures = captures.filter(c => c.viewType !== 'statistics');
  const day = iso => iso.slice(0, 10);
  const pick = c => ({capturedAt: c.capturedAt, sell: c.sell, buy: c.buy, sellTopAmount: c.sellTopAmount, buyTopAmount: c.buyTopAmount,
    sellVolume: c.sellVolume, buyVolume: c.buyVolume, goldDemand: c.goldDemand, goldSupply: c.goldSupply, hash: c.hash, statistics30d: c.statistics30d ?? null, captureTimeZone: c.captureTimeZone ?? null, statisticsReferenceDate: c.statisticsReferenceDate ?? null});
  const seen = new Set(), byWorld = new Map();
  for (const c of captures) {
    if (c.viewType === 'statistics') continue; // distinct rolling summaries cannot become live quotes
    if (seen.has(c.hash)) continue; // repeated export rows
    seen.add(c.hash);
    if (!byWorld.has(c.world)) byWorld.set(c.world, []);
    byWorld.get(c.world).push(c);
  }
  const asOf = seen.size ? captures.reduce((a, c) => day(c.capturedAt) > a ? day(c.capturedAt) : a, '') : research.reduce((a, w) => w.date > a ? w.date : a, '');
  const days = (a, b) => Math.round((Date.parse(day(b)) - Date.parse(day(a))) / DAY);
  const names = [...new Set([...research.map(w => w.world), ...byWorld.keys()])].sort((a, b) => a.localeCompare(b));
  const base = Object.fromEntries(research.map(w => [w.world, w]));
  const worlds = names.map(world => {
    const rows = (byWorld.get(world) || []).slice().sort((a, b) => a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0);
    const r = base[world];
    let series = [], latest, prior = null, source = 'Market capture';
    if (rows.length) {
      const daily = new Map(rows.map(c => [day(c.capturedAt), c]));
      series = [...daily.keys()].sort().map(d => pick(daily.get(d)));
      latest = series.at(-1); prior = series.at(-2) || null;
    } else {
      latest = {capturedAt: r.date, sell: r.ask, buy: r.bid, sellTopAmount: null, buyTopAmount: null, sellVolume: null, buyVolume: null, goldDemand: null, goldSupply: null, hash: null};
      source = 'TibiaMarket API';
    }
    const last = rows.at(-1);
    return {world, type: last?.type ?? r?.type, battleye: last?.battleye ?? r?.battleye, source, latest, prior,
      deltaPct: readingDelta(latest, prior),
      elapsedDays: prior ? days(prior.capturedAt, latest.capturedAt) : null, ageDays: days(latest.capturedAt, asOf), stale: days(latest.capturedAt, asOf) > 0,
      captureCount: rows.length, dailyCaptures: series};
  });
  return {asOf, captureCount: seen.size, worlds};
}

// Only errors raised while fetching or decoding files are data-loading failures.
class ReportDataError extends Error {}
async function loadReportData(file) {
  let response;
  try {
    response = await fetch(file, {cache: 'no-cache'});
  } catch (err) {
    throw new ReportDataError(`${file}: ${err.message}`);
  }
  if (!response.ok) throw new ReportDataError(`${file}: HTTP ${response.status}`);
  try {
    return await response.json();
  } catch (err) {
    throw new ReportDataError(`${file}: invalid or incomplete JSON (${err.message})`);
  }
}

// The prospective forecast ledger is JSON Lines: one frozen forecast or scored week per line, in the order recorded.
async function loadLedger(file) {
  let response;
  try {
    response = await fetch(file, {cache: 'no-cache'});
  } catch (err) {
    throw new ReportDataError(`${file}: ${err.message}`);
  }
  // Before the first frozen forecast there is no ledger: an empty record, not a failure.
  if (response.status === 404) return [];
  if (!response.ok) throw new ReportDataError(`${file}: HTTP ${response.status}`);
  try {
    return (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (err) {
    throw new ReportDataError(`${file}: invalid line (${err.message})`);
  }
}

// ---------------------------------------------------------------- report
async function main() {
  // Always revalidate: a page updated on the server must never pair new code with a cached older data file.
  const [R, C, U, I, L, ME, X, LG] = await Promise.all([...['results.json', 'complement.json', 'market-update.json', 'inflation.json', 'lifecycle.json', 'mergers.json', 'robustness.json'].map(loadReportData), loadLedger('forecast-ledger.jsonl')]);
  const root = document.getElementById('report');

  // ---- shorthand over the data files
  const worlds = R.worlds, W = Object.fromEntries(worlds.map(w => [w.world, w]));
  const {statisticsObservations} = await import('../../js/statistics.js');
  const M = marketMonitor(U, worlds), updates = M.worlds, UW = Object.fromEntries(updates.map(w => [w.world, w]));
  // Type and BattlEye are properties of the world, not of the research cutoff: a world with no capture
  // by the cutoff still has them from any later Market capture, so every label reads from here.
  const worldKind = name => { const u = UW[name]; return u?.type ? `${u.type} (${u.battleye} BattlEye)` : ''; };
  // Worlds of the file the research does not model: listed with the reason, never dropped silently.
  const unmodelled = Object.fromEntries((R.unmodelled || []).map(x => [x.world, x.reason]));
  const extraWorlds = updates.filter(w => !W[w.world]);
  const outsideResearch = name => unmodelled[name]
    ? t(`${name}: ${uiLabel(unmodelled[name]).toLowerCase()}, so it has no scenarios or dossier.`, `${name}: ${({'Sem oferta válida até o corte': 'sem offer válida até o cutoff'})[unmodelled[name]] || unmodelled[name].toLowerCase()}, por isso não tem scenarios nem dossiê.`)
    : t(`${name}: outside the research, so it has no scenarios, history or dossier.`, `${name}: fora da pesquisa, por isso não tem scenarios, histórico nem dossiê.`);
  // Every world picker is this one control over the one selection, listing the analysed universe
  // (market-update.json) in one order. `all` adds the no-selection option where the page can show every
  // world at once; `value` is the world a card shows when it falls back from an empty selection.
  const worldControl = ({all = false, value = state.world} = {}) => pickerControl({label: 'World', key: 'world', value,
    options: [...(all ? [{value: '', label: 'All Worlds'}] : []), ...updates.map(w => ({value: w.world, label: w.world}))]});
  const marketRows = updates.map(w => ({
    ...w, date: w.latest.capturedAt.slice(0, 10), priorDate: w.prior?.capturedAt.slice(0, 10),
    sell: w.latest.sell, buy: w.latest.buy,
    sellTopAmount: w.latest.sellTopAmount, sellVolume: w.latest.sellVolume, buyTopAmount: w.latest.buyTopAmount, buyVolume: w.latest.buyVolume,
    spreadPct: (w.latest.sell - w.latest.buy) / ((w.latest.sell + w.latest.buy) / 2) * 100,
    executionCostPct: (1 - w.latest.buy / w.latest.sell) * 100,
  }));
  // A dated value older than its reference carries its age, in days.
  const staleTag = r => r.stale ? `<span class="stale">${r.ageDays}d</span>` : '';
  const change = value => ok(value) ? `<span class="${cls(value)}">${sgn(value, Math.abs(value) < .005 && value !== 0 ? 3 : 2)}</span>` : `<span class="dim">${MISSING}</span>`;
  const antica = W[R.benchmark];
  const capturedWorlds = updates.filter(w => w.captureCount);
  const freshWorlds = capturedWorlds.filter(w => w.latest.capturedAt.startsWith(M.asOf));
  const missingCaptures = updates.filter(w => !w.captureCount);
  const olderReadings = updates.filter(w => w.stale);
  const fallbackNote = missingCaptures.map(w => t(`${w.world}: latest API offer on ${cellDate(w.latest.capturedAt)}, no recent capture.`, `${w.world}: última offer da API em ${cellDate(w.latest.capturedAt)}, sem captura recente.`)).join(' ');
  const fc = (side, date) => R.forecast.find(x => x.side === side && x.date === date);
  const horizonWeeks = new Set(R.forecast.map(x => x.date)).size;
  const scenarioDates = R.forecast.filter(x => x.side === 'ask').map(x => x.date);
  const closestScenario = target => scenarioDates.reduce((a, b) => Math.abs(ms(b) - ms(target)) < Math.abs(ms(a) - ms(target)) ? b : a);
  const MILESTONES = ['2026-11-25', '2027-03-31', '2027-06-30', '2027-09-22'].map(closestScenario);
  const nov = fc('ask', MILESTONES[0]), june = fc('ask', MILESTONES[2]);
  const bt = R.backtest;
  const summaries = [13, 26, 52].flatMap(h => SIDE_KEYS.map(s => {
    const rows = bt.filter(x => x.horizon === h && x.side === s), g = m => rows.find(x => x.model === m)?.mape;
    return {horizon: h, side: s, n: rows[0]?.n, constant: g('Constante'), seasonal: g('Sazonal 52 semanas'), harmonic: g('Harmônico'), ensemble: g('Conjunto')};
  }));
  // Rolling-origin validation (weekly origins): the ensemble is the combination of all three components.
  const V = R.validation, ENSEMBLE = 'C+S+H';
  const rollMetric = (side, h, model) => V.metrics.find(x => x.side === side && x.horizon === h && x.model === model);
  const rollSkill = (side, h, model = ENSEMBLE, reference = 'Constante') => V.skill.concat(V.ablation).find(x => x.side === side && x.horizon === h && x.model === model && x.reference === reference);
  const r13 = {horizon: 13, n: rollMetric('ask', 13, ENSEMBLE).n, windows: rollMetric('ask', 13, ENSEMBLE).windows, ensemble: rollMetric('ask', 13, ENSEMBLE).mape, constant: rollMetric('ask', 13, 'Constante').mape};
  // Exhibit names of the models and of the combinations of their components.
  const MODEL_NAMES = {'Constante': 'Constant', 'Sazonal 52 semanas': 'Seasonal Naive', 'Harmônico': 'Harmonic', 'C+S+H': 'Ensemble (C+S+H)', 'C+S': 'Constant + Seasonal', 'C+H': 'Constant + Harmonic', 'S+H': 'Seasonal + Harmonic'};
  const modelName = id => MODEL_NAMES[id] || id;
  // Validation verdicts the text states are read from the backtests, never assumed.
  const sum = (h, s = 'ask') => summaries.find(x => x.horizon === h && x.side === s);
  const ensembleWins = summaries.filter(x => ok(x.ensemble) && ok(x.constant) && x.ensemble < x.constant);
  const e13 = sum(13), e52 = sum(52);
  const strongest = R.eventStudy.filter(x => x.q < .05);
  const pred = R.predecessor[0];
  const median = a => { const s = a.filter(ok).slice().sort((x, y) => x - y), k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : null; };
  const yy = iso => t(cellDate(iso), `${shortDate(iso)}/${iso.slice(2, 4)}`);
  // Counts up to ten are written out in running text; `fem` gives the Portuguese feminine forms (duas origins, duas quedas).
  const nw = (n, fem = false) => t(['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
    fem ? ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'] : ['nenhum', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'])[n] ?? fmt(n);
  // The universe's special cases, all read from the data: worlds anchored on an API offer (no capture by the
  // cutoff), announced mergers, predecessors and premium level shifts.
  const bench = R.benchmark, noCapture = worlds.filter(w => w.source !== 'Captura'), mergers = worlds.filter(w => w.mergerDate);
  const mergerFor = world => ME.find(e => e.participants.includes(world));
  const mergerDateLabel = event => event?.confirmedDate ? t('confirmed date', 'data confirmada') : t('first possible date', 'primeira data possível');
  const relevantMergers = ME.filter(e => e.participants.some(w => W[w]));
  // Only the chapters cite the announcement; interactive blocks that repeat the facts carry no note, so note numbers never
  // depend on which world is selected.
  const mergerFacts = (event, cited = false) => t(
    `According to the announcement of ${longDate(event.announcedOn)}, ${list(event.participants)} will be merged into ${event.successor};${cited ? note(mergerKey(event)) : ''} ${event.confirmedDate ? `the operation is confirmed for ${longDate(event.confirmedDate)}` : `the merger's effective date remained undetermined at the research cutoff, and it cannot take place before ${longDate(event.notBefore)}`}.`,
    `Conforme o anúncio de ${longDate(event.announcedOn)}, ${list(event.participants)} serão reunidos em ${event.successor};${cited ? note(mergerKey(event)) : ''} ${event.confirmedDate ? `a operação está confirmada para ${longDate(event.confirmedDate)}` : `a data efetiva da merger permanecia indefinida no cutoff da pesquisa, e ela não pode ocorrer antes de ${longDate(event.notBefore)}`}.`);
  // Section 02 states only the measurement decision a merger imposes; section 09 analyses it.
  const mergerBoundary = event => { const modelled = event.participants.filter(w => W[w]), others = event.participants.filter(w => !W[w]);
    return t(`${list(modelled)}, which the announcement of ${longDate(event.announcedOn)} assigns${others.length ? `, with ${list(others)},` : ''} to a merger into ${event.successor} ${event.confirmedDate ? `on ${longDate(event.confirmedDate)}` : `no earlier than ${longDate(event.notBefore)}`},${note(mergerKey(event))} ${modelled.length > 1 ? 'are' : 'is'} modelled only within ${modelled.length > 1 ? 'their' : 'its'} pre-merger regime, and ${chapterRef('s05')} examines what that boundary implies.`,
      `${list(modelled)}, que o anúncio de ${longDate(event.announcedOn)} destina${others.length ? `, com ${list(others)},` : ''} a uma merger em ${event.successor} ${event.confirmedDate ? `em ${longDate(event.confirmedDate)}` : `não antes de ${longDate(event.notBefore)}`},${note(mergerKey(event))} ${modelled.length > 1 ? 'são modelados' : 'é modelado'} apenas no regime anterior à merger, e a ${chapterRef('s05')} examina o que esse limite implica.`); };
  const mergerScope = event => { const missing = event.participants.filter(w => !W[w]); return missing.length
    ? t(`Because the data contain no quotes for ${list(missing)}, the comparison of participants is incomplete, which limits any assessment of the successor's Market.`, `Como os dados não contêm quotes de ${list(missing)}, a comparação dos participantes é incompleta, o que limita qualquer avaliação do Market do successor.`)
    : t('The coverage of the participants allows their pre-merger conditions to be compared, although it does not determine the successor\'s equilibrium.', 'A coverage dos participantes permite comparar suas condições anteriores à merger, embora não determine o equilíbrio do successor.'); };
  const predOf = Object.create(null);
  for (const predecessor of R.predecessor) {
    const successor = predecessor.successor;
    if (!predOf[successor]) predOf[successor] = [];
    predOf[successor].push(predecessor);
  }
  const breaks = C.crossWorld.breaks, ungrouped = C.crossWorld.ungrouped;
  const anchorList = ws => list(ws.map(w => `${w.world} (${dayMonth(w.date)})`));
  const firstScenario = (world, side = 'ask') => R.worldForecast.find(x => x.world === world && x.side === side);
  // A stale anchor is checked against the latest Market reading: a reading outside the first week's band means the
  // scenario no longer describes the world, whatever its construction.
  // Each side follows the same side of the benchmark from the anchor's date, so the local gap between the sides takes
  // the benchmark's gap change since then; where that exceeds the local gap, the central sides cross (flagged weeks).
  const crossedText = w => t(
    `The Buy Offers scenario reaches or exceeds Sell Offers in ${w.crossedWeeks} of the ${horizonWeeks} weeks of the base scenario. This happens because each side follows ${bench} from ${longDate(w.benchmarkRefDate)}, when its gap was ${pctU(w.benchmarkRefCostPct, 2)}, against ${pctU(W[bench].costPct, 2)} at the capture of ${longDate(W[bench].date)}; since that narrowing exceeds the local gap of ${pctU(w.costPct, 2)}, the weeks are flagged, because the two paths do not form a possible order book.`,
    `O scenario de Buy Offers alcança ou supera Sell Offers em ${w.crossedWeeks} das ${horizonWeeks} semanas do base scenario. Isso ocorre porque cada lado acompanha ${bench} desde ${longDate(w.benchmarkRefDate)}, quando seu gap era ${pctU(w.benchmarkRefCostPct, 2)}, ante ${pctU(W[bench].costPct, 2)} na captura de ${longDate(W[bench].date)}; como esse estreitamento excede o gap local de ${pctU(w.costPct, 2)}, as semanas são sinalizadas, pois os dois paths não formam um order book possível.`);
  const outsideBand = worlds.filter(w => w.stale && UW[w.world]?.captureCount).map(w => {
    const f = firstScenario(w.world), q = UW[w.world].latest;
    return f && ok(f.low) && (q.sell < f.low || q.sell > f.high) ? {world: w.world, f, q} : null;
  }).filter(Boolean);

  // ---- sources: Chicago notes. A citation is a superscript number after the punctuation that closes the cited
  // sentence or clause; the notes at the end give a full note the first time a source is cited and a shortened
  // note afterwards. note() only marks the keys: both editions evaluate every string (t() takes both), so numbers
  // are assigned once, in reading order over the whole report's markup, before any page is shown (numberNotes). Merger announcements come
  // from mergers.json, so a new announcement is cited with the data that states it.
  const mergerKey = event => `merger-${event.successor.toLowerCase()}`;
  // Chicago dates and URLs: "October 6, 2025"; a URL is printed in full and escaped for markup.
  const chicagoDate = iso => `${MONTHS_LONG_EN[isoMonth(iso)]} ${isoDay(iso)}, ${isoYear(iso)}`;
  const markup = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const link = url => `<a href="${markup(url)}">${markup(url)}</a>`;
  const news = id => `https://www.tibia.com/news/?subtopic=newsarchive&id=${id}`;
  // A news item with a headline is quoted; an untitled news ticker is described in plain text (Chicago 14.87).
  const tibiaNews = (id, date, title, shortTitle, quoted = true) => ({
    full: `CipSoft, ${quoted ? `“${title},”` : `${title},`} <em>Tibia</em>, ${chicagoDate(date)}, ${link(news(id))}`,
    short: `CipSoft, ${quoted ? `“${shortTitle},”` : `${shortTitle},`} ${chicagoDate(date)}`});
  const SOURCES = {
    api: {full: `TibiaMarket, API documentation (Swagger UI), version 0.1.0, accessed September 24, 2026, ${link('https://api.tibiamarket.top/docs')}`,
      short: 'TibiaMarket, API documentation'},
    archive: {full: `nesleykent, <em>tibia-warzones-schedule</em>, GitHub repository, accessed September 24, 2026, ${link('https://github.com/nesleykent/tibia-warzones-schedule')}`,
      short: 'nesleykent, <em>tibia-warzones-schedule</em>'},
    package: {full: `Tibinance, README and reproduction package for this report, reports/tc-cycle, GitHub repository, accessed September 27, 2026, ${link('https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle')}`,
      short: 'Tibinance, reproduction package'},
    manual: {full: `CipSoft, “The Market,” in <em>Tibia Manual</em>, sec. 4.3.3, accessed September 27, 2026, ${link('https://www.tibia.com/gameguides/?section=controls_trading&subtopic=manual')}`,
      short: 'CipSoft, “The Market”'},
    tracker: {full: `TibiaMarket, <em>Tibia Market Tracker</em>, accessed September 24, 2026, ${link('https://tibiamarket.top/')}`,
      short: 'TibiaMarket, <em>Tibia Market Tracker</em>'},
    terribraAnnounced: tibiaNews(8513, '2025-10-06', 'Game World Merge Announcement', 'Game World Merge Announcement'),
    terribraDate: tibiaNews(8514, '2025-11-03', 'news ticker on the date of the game world merges', 'news ticker on the date of the merges', false),
    terribraDone: tibiaNews(8515, '2025-11-06', 'news ticker on the completion of the game world merges', 'news ticker on the completion of the merges', false),
    floribraLaunch: tibiaNews(8767, '2026-05-20', 'news ticker on the launch of the game worlds Maligna, Junera, and Floribra', 'news ticker on the launch of Floribra', false),
    luzibraLaunch: tibiaNews(8385, '2025-05-21', 'news ticker on the launch of the game worlds Sonira, Kalimera, and Luzibra', 'news ticker on the launch of Luzibra', false),
    luzibraTransfers: tibiaNews(8866, '2026-06-30', 'Fixes and Changes', 'Fixes and Changes'),
    luzibraPremium: tibiaNews(8475, '2025-07-30', 'news ticker on the removal of the Premium restriction for Kalimera, Luzibra, and Sonira', 'news ticker on the removal of the Premium restriction', false),
    ...Object.fromEntries(ME.map(event => [mergerKey(event), {
      full: `CipSoft, “${event.sourceTitle},” <em>Tibia</em>, ${chicagoDate(event.announcedOn)}, ${link(event.source)}`,
      short: `CipSoft, “${event.sourceTitle},” ${chicagoDate(event.announcedOn)}`}])),
    mann1947: {full: `H. B. Mann and D. R. Whitney, “On a Test of Whether One of Two Random Variables Is Stochastically Larger than the Other,” <em>Annals of Mathematical Statistics</em> 18, no. 1 (1947): 50-60, ${link('https://doi.org/10.1214/aoms/1177730491')}`,
      short: 'Mann and Whitney, “Test of Whether One of Two Random Variables Is Stochastically Larger”'},
    hyndman2021: {full: `Rob J. Hyndman and George Athanasopoulos, <em>Forecasting: Principles and Practice</em>, 3rd ed. (Melbourne: OTexts, 2021), ${link('https://otexts.com/fpp3/')}`,
      short: 'Hyndman and Athanasopoulos, <em>Forecasting</em>'},
    seabold2010: {full: `Skipper Seabold and Josef Perktold, “Statsmodels: Econometric and Statistical Modeling with Python,” in <em>Proceedings of the 9th Python in Science Conference</em>, ed. Stéfan van der Walt and Jarrod Millman (2010), 92-96, ${link('https://doi.org/10.25080/Majora-92bf1922-011')}`,
      short: 'Seabold and Perktold, “Statsmodels”'},
    hyndman2006: {full: `Rob J. Hyndman and Anne B. Koehler, “Another Look at Measures of Forecast Accuracy,” <em>International Journal of Forecasting</em> 22, no. 4 (2006): 679-688, ${link('https://doi.org/10.1016/j.ijforecast.2006.03.001')}`,
      short: 'Hyndman and Koehler, “Another Look at Measures of Forecast Accuracy”'},
    kunsch1989: {full: `Hans R. Künsch, “The Jackknife and the Bootstrap for General Stationary Observations,” <em>Annals of Statistics</em> 17, no. 3 (1989): 1217-1241, ${link('https://doi.org/10.1214/aos/1176347265')}`,
      short: 'Künsch, “Jackknife and the Bootstrap”'},
    politis1992: {full: 'Dimitris N. Politis and Joseph P. Romano, “A Circular Block-Resampling Procedure for Stationary Data,” in <em>Exploring the Limits of Bootstrap</em>, ed. Raoul LePage and Lynne Billard (New York: Wiley, 1992), 263-270',
      short: 'Politis and Romano, “Circular Block-Resampling Procedure”'},
    neweywest1987: {full: `Whitney K. Newey and Kenneth D. West, “A Simple, Positive Semi-definite, Heteroskedasticity and Autocorrelation Consistent Covariance Matrix,” <em>Econometrica</em> 55, no. 3 (1987): 703-708, ${link('https://doi.org/10.2307/1913610')}`,
      short: 'Newey and West, “Simple, Positive Semi-definite Covariance Matrix”'},
    diebold1995: {full: `Francis X. Diebold and Roberto S. Mariano, “Comparing Predictive Accuracy,” <em>Journal of Business &amp; Economic Statistics</em> 13, no. 3 (1995): 253-263, ${link('https://doi.org/10.1080/07350015.1995.10524599')}`,
      short: 'Diebold and Mariano, “Comparing Predictive Accuracy”'},
    murphy1973: {full: `Allan H. Murphy, “A New Vector Partition of the Probability Score,” <em>Journal of Applied Meteorology</em> 12, no. 4 (1973): 595-600, ${link('https://doi.org/10.1175/1520-0450(1973)012<0595:ANVPOT>2.0.CO;2')}`,
      short: 'Murphy, “New Vector Partition of the Probability Score”'},
    cox1958: {full: `D. R. Cox, “Two Further Applications of a Model for Binary Regression,” <em>Biometrika</em> 45, no. 3/4 (1958): 562-565, ${link('https://doi.org/10.1093/biomet/45.3-4.562')}`,
      short: 'Cox, “Two Further Applications”'},
    brier1950: {full: `Glenn W. Brier, “Verification of Forecasts Expressed in Terms of Probability,” <em>Monthly Weather Review</em> 78, no. 1 (1950): 1-3, ${link('https://doi.org/10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2')}`,
      short: 'Brier, “Verification of Forecasts”'},
    holm1979: {full: 'Sture Holm, “A Simple Sequentially Rejective Multiple Test Procedure,” <em>Scandinavian Journal of Statistics</em> 6, no. 2 (1979): 65-70',
      short: 'Holm, “Sequentially Rejective Multiple Test Procedure”'},
    benjamini1995: {full: `Yoav Benjamini and Yosef Hochberg, “Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing,” <em>Journal of the Royal Statistical Society: Series B (Methodological)</em> 57, no. 1 (1995): 289-300, ${link('https://doi.org/10.1111/j.2517-6161.1995.tb02031.x')}`,
      short: 'Benjamini and Hochberg, “Controlling the False Discovery Rate”'},
  };
  // Several sources cited at one point share one note, separated by semicolons (Chicago 14.57).
  const note = (...keys) => `<sup class="note" data-sources="${keys.join(' ')}"></sup>`;
  // Takes the report's markup in reading order and returns it with every note numbered and the endnotes listed, so
  // a note's number never depends on which page is shown.
  function numberNotes(parts) {
    const cited = new Set(), notes = [];
    return parts.map(html => html.replace(/<sup class="note" data-sources="([^"]+)"><\/sup>/g, (_, sources) => {
      const n = notes.length + 1;
      const text = sources.split(' ').map(key => { const first = !cited.has(key); cited.add(key); return first ? SOURCES[key].full : SOURCES[key].short; }).join('; ');
      // A note ends with a period, inside a closing quotation mark as Chicago prescribes (6.9).
      notes.push(`<li id="note-${n}">${text.endsWith('”') ? `${text.slice(0, -1)}.”` : `${text}.`}</li>`);
      return `<sup class="note" data-sources="${sources}"><a href="#note-${n}" id="note-ref-${n}">${n}</a></sup>`;
    })).map(html => html.replace('<ol class="endnotes" id="endnotes"></ol>', `<ol class="endnotes" id="endnotes">${notes.join('')}</ol>`));
  }

  // complement
  const SW = C.swings.sides, P = C.probabilistic, PK = P.package;
  // The reported seed is the first of the simulation's seeds; the number of paths per seed is read from its runs.
  const SEED = P.spec.seeds[0];
  const run = (side, sample, seed = SEED) => P.sides[side][sample].runs.find(r => r.seed === seed);
  const m23 = run('ask', 'main'), m24 = run('ask', 'since2024'), PATHS = m23.paths;
  // The specification states the parameter draws and the paths per draw whose product is PATHS.
  const DRAWS = P.spec.draws, PER_DRAW = P.spec.pathsPerDraw;
  const cal = (side, h) => P.calibration.find(c => c.side === side && c.horizon === h);
  const pkgSeedSpread = Math.max(...['p_peak_gt3', 'p_peak_after_oct31', 'p_jun27_below', 'p_trough_above_2026'].map(k => PK.stabilityRange[k][1] - PK.stabilityRange[k][0]));
  const anchorRows = P.anchorSensitivity;
  const rt = (sample, mode) => P.roundtrip.find(r => r.sample === sample && r.mode === mode);
  const fitAsk = P.fit.find(f => f.side === 'ask' && f.sample === 'main');
  const cur = SW.ask.current, legsAsk = SW.ask.legs;
  // Dates the text cites are read from the data: the research cutoff, the captures that close it and the
  // trough the current leg starts from. The two probability targets are fixed by the research design.
  const cutoffDay = dayMonth(R.asOf);
  const firstCapture = cur.captureDates[0], lastCapture = cur.captureDates.at(-1);
  const sameCaptureMonth = firstCapture.slice(0, 7) === lastCapture.slice(0, 7);
  const sameCaptureYear = isoYear(firstCapture) === isoYear(lastCapture);
  const captureWindow = sameCaptureMonth
    ? `${t(String(isoDay(firstCapture)), firstCapture.slice(8, 10))}${RANGE}${shortDate(lastCapture)}`
    : `${sameCaptureYear ? shortDate(firstCapture) : longDate(firstCapture)}${RANGE}${sameCaptureYear ? shortDate(lastCapture) : longDate(lastCapture)}`;
  const captureBetween = sameCaptureYear
    ? t(`${sameCaptureMonth ? isoDay(firstCapture) : dayMonth(firstCapture)} and ${dayMonth(lastCapture)}`, `${dayMonth(firstCapture)} e ${dayMonth(lastCapture)}`)
    : t(`${longDate(firstCapture)} and ${longDate(lastCapture)}`, `${longDate(firstCapture)} e ${longDate(lastCapture)}`);
  const peakBy = '2027-02-28', rebuyWeek = '2027-06-28';
  const ups = legsAsk.filter(l => l.direction === 'alta' && !l.censored && !l.short), declines = SW.ask.declines;
  const grp = (g, side) => C.crossWorld.groups.find(x => x.group === g && x.side === side);
  // The group with the largest recent Sell Offers premium is the one the text describes, against every other group.
  const Y = C.crossWorld.groups.filter(g => g.side === 'ask').reduce((a, b) => b.recentMedianPct > a.recentMedianPct ? b : a).group;
  const yA = grp(Y, 'ask'), yB = grp(Y, 'bid');
  const others = C.crossWorld.groups.filter(g => g.side === 'ask' && g.group !== Y);
  // A group in running text: "Optional PvP worlds with Yellow BattlEye" / "worlds Optional PvP com Yellow BattlEye".
  const groupWorldsPhrase = g => { const [type, be] = g.split('; BattlEye '); return be ? t(`${type} worlds with ${be} BattlEye`, `worlds ${type} com ${be} BattlEye`) : t(`${type} worlds`, `worlds ${type}`); };
  // "declined" / "risen" only when both later readings moved the same way; otherwise the neutral "moved".
  const moved = (from, ...to) => to.every(v => v < from) ? 'down' : to.every(v => v > from) ? 'up' : 'mixed';
  const cwOf = (world, side) => C.crossWorld.worlds.find(x => x.world === world && x.side === side);
  const breakRows = breaks.map(w => cwOf(w, 'ask'));
  const makerAntica = C.roundtripMaker.find(x => x.world === bench && x.cycle.startsWith('2025') && x.sellMonth === 11);
  const makerDiffAntica = C.roundtripMaker.filter(x => x.world === bench).map(x => x.makerNetPct - x.acceptPct);
  const makerOthers = C.roundtripMaker.filter(x => x.world !== bench && ok(x.makerNetPct) && ok(x.acceptPct));
  const makerOthersWins = makerOthers.filter(x => x.makerNetPct > x.acceptPct).length;
  const wd = (scope, side) => C.weekday.tests.find(x => x.scope === scope && x.side === side);
  const volY = (side, y) => C.volatility.byYear.find(x => x.side === side && x.year === y);
  const yoy = (side, month) => C.context.yoy.find(x => x.side === side && x.month === month);
  // Simulated weeks end on Sunday while scenario weeks count from the cutoff, so a date reads the nearest simulated week.
  const fanAt = (side, sample, date) => P.fan.filter(f => f.side === side && f.sample === sample).reduce((a, b) => Math.abs(ms(b.date) - ms(date)) < Math.abs(ms(a.date) - ms(date)) ? b : a);
  // Gaps between probabilities are taken from the rounded percentages the tables show.
  const pc = v => Math.round(v * 100);
  const yearAgo = C.context.captureVsYearAgo.find(x => x.side === 'ask'), lastVsPeak = (cur.lastWeeklyLevel / cur.previousPeak - 1) * 100;
  const fit24 = P.fit.find(f => f.side === 'ask' && f.sample === 'since2024');
  // The last week with a premium in any world of the group closes its "last eight weeks".
  const groupLast = yA.worlds.map(w => cwOf(w, 'ask').last).sort().at(-1);
  // Execution example: the widest immediate round-trip cost among the worlds captured at the cutoff.
  const widest = worlds.filter(w => w.source === 'Captura' && w.world !== bench).reduce((a, b) => b.costPct > a.costPct ? b : a);

  // ---- market structure at the latest readings (section 03): levels, spreads and depth across the monitor
  const priced = marketRows.filter(r => ok(r.sell) && ok(r.buy));
  const bySell = priced.slice().sort((a, b) => a.sell - b.sell), cheapest = bySell[0], dearest = bySell.at(-1);
  const bySpread = priced.slice().sort((a, b) => a.spreadPct - b.spreadPct), widestSpread = bySpread.at(-1);
  const medianSpread = median(priced.map(r => r.spreadPct));
  const anticaRow = marketRows.find(r => r.world === bench);
  const depthRows = priced.filter(r => ok(r.sellTopAmount) && ok(r.sellVolume) && r.sellVolume > 0);
  const thinnest = depthRows.slice().sort((a, b) => a.sellTopAmount - b.sellTopAmount)[0];
  const anticaTopShare = anticaRow && ok(anticaRow.sellTopAmount) && anticaRow.sellVolume ? anticaRow.sellTopAmount / anticaRow.sellVolume * 100 : null;
  const medianTopShare = median(depthRows.map(r => r.sellTopAmount / r.sellVolume * 100));
  // Seasonal calendar of the benchmark: the month with the largest and the most negative median change.
  const seasonAsk = R.seasonality.filter(x => x.side === 'ask' && ok(x.medianPct));
  const seasonHigh = seasonAsk.reduce((a, b) => b.medianPct > a.medianPct ? b : a, seasonAsk[0]), seasonLow = seasonAsk.reduce((a, b) => b.medianPct < a.medianPct ? b : a, seasonAsk[0]);
  const monthName = m => MONTHS_LONG[m - 1];

  // Preserve qualified estimates; sparse observations remain explicit and marked per metric.
  const inflationObserved = row => ({...row, ...row.observed,
    limited: Object.keys(row.observed || {}).filter(key => ok(row.observed[key]) && !ok(row[key]))});
  const inflationColumn = column => ({...column, render: (value, row) => {
    const text = column.render ? column.render(value, row) : esc(value);
    return row.limited?.includes(column.key) ? `<span title="${t('Limited sample: one or both reference periods have low coverage', 'Sample limitada: um ou ambos os períodos de referência têm coverage baixa')}">${text}*</span>` : text;
  }});
  const inflationYears = [...new Set(I.annual.map(r => r.year))].sort((a, b) => a - b);
  const inflationLastYear = inflationYears.at(-1);
  const inflationSamples = [...new Set(I.models.map(m => m.since))].sort();
  const inflationPartial = I.monthly.find(r => r.world === bench && r.side === 'ask' && r.status === 'Partial month');
  const recentAttribution = model => model.attribution.slice().sort((a, b) => b.start.localeCompare(a.start))[0];
  const inflationRecent = recentAttribution(I.models.find(m => m.side === 'ask' && m.since === inflationSamples[0]));
  const inflationStatus = r => r.eligible ? 'Eligible' : r.days ? (r.status === 'Partial month' ? 'Partial month' : 'Low coverage') : 'No observations';
  const inflationPeriod = row => `${MONTHS_EN[0]} to ${MONTHS_EN[row.endMonth - 1]}${row.endMonth < 12 ? ' (YTD)' : ''}`;
  // The benchmark's trend in each sample, for the chapters that interpret it.
  const trendModels = inflationSamples.map(since => I.models.find(m => m.side === 'ask' && m.since === since));
  const trendLo = Math.min(...trendModels.map(m => m.annualTrendPct)), trendHi = Math.max(...trendModels.map(m => m.annualTrendPct));
  const inflationAsk = I.monthly.find(r => r.world === bench && r.side === 'ask' && r.date === I.comparisonMonth);

  const sens = C.swings.sensitivity.filter(s => s.side === 'ask');
  const stable = sens.filter(s => ups.every(u => s.peaks.includes(u.end)) && declines.every(d => s.troughs.includes(d.end))).map(s => s.threshold * 100);
  // Turning points found at the 5% rule that a stricter rule no longer confirms.
  const at5 = sens.find(s => s.threshold === 0.05), above5 = sens.filter(s => s.threshold > 0.05)[0];
  const lostAbove5 = above5 ? SW.ask.pivots.filter(p => !(p.type === 'P' ? above5.peaks : above5.troughs).includes(p.date) && p.date !== SW.ask.pivots[0].date) : [];
  const retr = SW.ask.retracements;
  const cmp = SW.ask.currentVsPastRises;
  const implied = cmp.map(c => c.impliedEnd).sort();
  const peakDays = ups.map(u => u.dailyPeakDate).filter(Boolean), troughWeeks = declines.map(d => d.end);
  // The calendar months a set of dates falls in, as a phrase: "in October or November" / "em outubro ou novembro".
  const monthSpan = dates => { const m = [...new Set(dates.map(d => isoMonth(d)))].sort((a, b) => a - b).map(i => MONTHS_LONG[i]); return `${t('in', 'em')} ${m.length > 1 ? `${m.slice(0, -1).join(', ')}${t(' or ', ' ou ')}${m.at(-1)}` : m[0]}`; };
  const longestUp = Math.max(...ups.map(u => u.weeks)), shortestUp = Math.min(...ups.map(u => u.weeks));
  const c80 = P.calibration.map(c => c.cov80), c50 = P.calibration.map(c => c.cov50);
  const c13 = cal('ask', 13), c52 = cal('ask', 52), c13b = cal('bid', 13);
  // The simulation is read at the same weeks as the ensemble, so every comparison in section 07 is like for like.
  const f23n = fanAt('ask', 'main', MILESTONES[0]), f23j = fanAt('ask', 'main', MILESTONES[2]), f24j = fanAt('ask', 'since2024', MILESTONES[2]);
  const seasonalBeatsModel = c13.brier > c13.brierSeasonal && c13b.brier > c13b.brierSeasonal;
  const makerByCycle = [...new Set(C.roundtripMaker.map(x => x.cycle))].map(c => {
    const rows = C.roundtripMaker.filter(x => x.cycle === c && x.world !== bench);
    return {cycle: c, worlds: new Set(rows.map(r => r.world)).size, n: rows.length, accept: median(rows.map(r => r.acceptPct)), gross: median(rows.map(r => r.makerGrossPct)), net: median(rows.map(r => r.makerNetPct)), diff: median(rows.map(r => r.makerNetPct - r.acceptPct))};
  }).filter(c => c.n);
  // The benchmark's historical round trips for a November sale, by cycle: what the seasonal pattern delivered.
  const novTrips = R.roundtrips.filter(x => x.world === bench && x.sellMonth === 11).sort((a, b) => a.cycle.localeCompare(b.cycle));
  const wide = w => ok(w.recentMedianPct) && w.nowPct > 1.5 * w.recentMedianPct;
  const histWide = C.spread.worlds.filter(w => W[w.world].source !== 'Captura' && wide(w));
  const cov = C.weekday.coverage, sparse = cov.filter(c => c.medianDaysPerWeek <= 2);
  const wideNow = C.spread.worlds.filter(w => W[w.world].source === 'Captura' && wide(w)).sort((a, b) => b.nowPct / b.recentMedianPct - a.nowPct / a.recentMedianPct);
  const anticaSpread = C.spread.worlds.find(w => w.world === bench);
  const OTHERS = 'Demais mundos', wA = wd(bench, 'ask'), wAb = wd(bench, 'bid'), wB = wd(OTHERS, 'ask'), wBb = wd(OTHERS, 'bid');
  // Weekday tests that survive the joint Holm correction, and the pool's largest contributor.
  const wdSig = C.weekday.tests.filter(x => x.pHolm < .05);
  const pIs = p => p < 0.005 ? `p < ${fmt(0.01, 2)}` : `p = ${fmt(p, 2)}`, pv = p => p < 0.005 ? `< ${fmt(0.01, 2)}` : fmt(p, p >= .04 && p <= .06 ? 3 : 2);
  const WEEKDAY = {seg: t('Monday', 'segunda-feira'), ter: t('Tuesday', 'terça-feira'), qua: t('Wednesday', 'quarta-feira'), qui: t('Thursday', 'quinta-feira'), sex: t('Friday', 'sexta-feira'), 'sáb': t('Saturday', 'sábado'), dom: t('Sunday', 'domingo')};
  const topContributor = Object.entries(wB.contributors).sort((a, b) => b[1] - a[1])[0];
  const mo = C.momentum.ask, mob = C.momentum.bid, acf = mo.acf, strongUp = mo.conditional[0], allW = mo.conditional[2];
  const acfAboveBand = acf.filter(a => Math.abs(a.rDeseasonalised) > mo.band);
  const v25 = volY('ask', 2025), v26 = volY('ask', 2026);
  const volAsk = C.volatility.worlds.filter(x => x.side === 'ask' && !breaks.includes(x.world) && ok(x.ratio)), ratios = volAsk.map(x => x.ratio);
  const topRatio = volAsk.reduce((a, b) => b.ratio > a.ratio ? b : a), fewDays = volAsk.filter(x => x.medianDaysPerWeek <= 2);
  const volShort = C.volatility.worlds.filter(x => x.side === 'ask' && !ok(x.ratio)).map(x => x.world);
  const dailyQuoted = volAsk.filter(x => x.medianDaysPerWeek >= 5 && x !== topRatio);
  const epi = strongUpRanges => { const season = strongUpRanges.filter(([a]) => +a.slice(5, 7) >= 7 && +a.slice(5, 7) <= 10).length; return [season, strongUpRanges.length - season]; };
  // Persistence verdict: declustered strong-rise episodes tested against every other week, per side.
  const pS = strongUp.declusteredP, pB = mob.conditional[0].declusteredP;
  const persistence = pS < .05 && pB < .05 ? 'both' : pS < .05 || pB < .05 ? 'one' : 'none';
  const tradeAntica = side => R.tradeComparison.find(x => x.world === bench && x.side === side);
  // The offers-versus-averages verdict for the benchmark: close, different, or not measurable.
  const benchGaps = SIDE_KEYS.map(sd => tradeAntica(sd)?.medianGapPct), gapVerdict = !benchGaps.every(ok) ? 'unknown' : Math.max(...benchGaps.map(Math.abs)) < 1 ? 'close' : 'differ';
  const rt23 = rt('main', 'aceitando'), rt24 = rt('since2024', 'aceitando');
  const odds = p => Math.abs(p - .5) < .1 ? 'even' : p > .5 ? 'favourable' : 'unfavourable';
  // The daily readings around each premium break: the last one still near the old level and the first near the new one.
  // Stated only when those two readings themselves show the step (at least the 15% that defines a break).
  const breakStep = r => {
    const d = r.breakDaily || [], i = d.findIndex(x => Math.abs(x.premiumPct - r.recentPremiumPct) < Math.abs(x.premiumPct - r.preBreak8Pct));
    if (i < 1 || Math.abs(d[i].premiumPct - d[i - 1].premiumPct) < 15) return '';
    return t(`, when the daily premium moved from ${sgn(d[i - 1].premiumPct)} on ${dayMonth(d[i - 1].date)} to ${sgn(d[i].premiumPct)} on ${dayMonth(d[i].date)}`,
      `, quando o premium diário passou de ${sgn(d[i - 1].premiumPct)} em ${dayMonth(d[i - 1].date)} para ${sgn(d[i].premiumPct)} em ${dayMonth(d[i].date)}`);
  };
  // The component (trend, seasonal, residual) that carries most of the benchmark's recent monthly rise, in log points.
  // A component is named only when it holds more than half of the change in every estimation sample; otherwise the
  // text says the split depends on the sample.
  const majority = row => [['trend', row.trendLogPoints], ['seasonal', row.seasonalLogPoints], ['residual', row.residualLogPoints]]
    .find(([, v]) => v / row.totalLogPoints > .5)?.[0] || null;
  const leadComponent = rows => { const leads = rows.map(majority); return leads.every(x => x && x === leads[0]) ? leads[0] : null; };
  const capFirst = s => s[0].toUpperCase() + s.slice(1);
  const inflationRecentAlt = trendModels[1]?.attribution.find(r => r.start === inflationRecent.start);
  const recentLead = inflationRecentAlt ? leadComponent([inflationRecent, inflationRecentAlt]) : null;

  // ---- will the price fall? One set of numbers for the executive summary and the downside chapter. Every probability is a
  // share of the seed-11 paths, for Sell Offers unless a side is named; "Since 2023" is the model validated in section 06.
  const DS = P.downside, d23 = DS.ask.main, d24 = DS.ask.since2024;
  const fallAt = (d, x) => d.thresholds.find(v => v.fallPct === x);
  const tornado = metric => P.tornado.find(x => x.metric === metric), factor = (metric, name) => tornado(metric).factors.find(x => x.factor === name);
  // In pp, from the rounded percentages the tables show.
  const spanPp = f => pc(f.high) - pc(f.low);
  const novWeek = P.spec.packageWeeks.nov30, junWeek = P.spec.packageWeeks.jun28;
  // The simulation labels a week by the Sunday that ends it; the text names it by the Monday that starts it.
  const weekStart = iso => new Date(ms(iso) - 6 * DAY).toISOString().slice(0, 10);
  const firstAtLeast = (d, key, p) => d.curve.find(x => ok(x[key]) && x[key] >= p)?.date;
  const curveMax = (d, key) => d.curve.filter(x => ok(x[key])).reduce((a, b) => b[key] > a[key] ? b : a);
  const breakEven = (target, mode) => P.breakEven.find(b => b.targetPct === target && b.mode === mode);
  const beTaker = breakEven(0, 'aceitando'), beMaker = breakEven(0, 'criando ofertas');
  const calPooled = side => P.calibrationDiagnostics.find(c => c.side === side && c.horizon === 0);
  const skill13 = rollSkill('ask', 13), skill26 = rollSkill('ask', 26), skill52 = rollSkill('ask', 52);
  const windowGap = Math.max(...['peakAbove3', 'jun28BelowStart', 'jun28BelowNov30', 'fromPeakGt10'].map(k => spanPp(factor(k, 'window'))));
  const seedGap = Math.max(...['peakAbove3', 'jun28BelowStart', 'jun28BelowNov30', 'fromPeakGt10'].map(k => spanPp(factor(k, 'seed'))));
  const peakAnchor = factor('peakAbove3', 'anchor'), peakSpec = factor('peakAbove3', 'spec'), junSpec = factor('jun28BelowStart', 'spec');
  const lowestAnchor = P.anchorSensitivity.reduce((a, b) => b.anchor < a.anchor ? b : a);
  // The share of paths whose peak falls in November or December, from the probability table of section 07.
  const peakNovDec = m23.peakMonthShare.novDez;
  const pooled = calPooled('ask');
  const cd13 = P.calibrationDiagnostics.find(c => c.side === 'ask' && c.horizon === 13), cd52 = P.calibrationDiagnostics.find(c => c.side === 'ask' && c.horizon === 52);
  const naive13 = rollSkill('ask', 13, ENSEMBLE, 'Sazonal 52 semanas'), naive26 = rollSkill('ask', 26, ENSEMBLE, 'Sazonal 52 semanas');
  const quarterSkill13 = (1 - e13.ensemble / e13.constant) * 100;
  const abl = (side, h, model) => V.ablation.find(x => x.side === side && x.horizon === h && x.model === model);
  const bestCombo = (side, h) => V.ablation.filter(x => x.side === side && x.horizon === h).reduce((a, b) => b.mape < a.mape ? b : a);
  const best13 = bestCombo('ask', 13), best26 = bestCombo('ask', 26), best52 = bestCombo('ask', 52);
  const specGap = Math.max(...['peakAbove3', 'jun28BelowStart', 'jun28BelowNov30', 'fromPeakGt10'].map(k => spanPp(factor(k, 'spec'))));
  const mk23 = rt('main', 'criando ofertas'), mk24 = rt('since2024', 'criando ofertas');
  const bestRebuy = P.rebuyCurve.filter(x => x.sample === 'main').reduce((a, b) => b.taker > a.taker ? b : a);
  // The spread above which a maker's threshold lies above today's Buy Offers: 1 - (1 - f) / (1 + f).
  const makerSpreadEdge = (1 - (1 - C.fee.rate) / (1 + C.fee.rate)) * 100, wideEnough = worlds.filter(w => w.costPct > makerSpreadEdge);
  const peakGain23 = (m23.peakLevel[1] / antica.ask - 1) * 100;
  const peakAnchorRow = P.anchorSensitivity.reduce((a, b) => b.pPeakAbove3OfReference < a.pPeakAbove3OfReference ? b : a);
  const preNov23 = Math.max(...d23.curve.filter(x => x.date <= novWeek).map(x => x.belowStart));
  const half23 = firstAtLeast(d23, 'belowStart', .5), max23 = curveMax(d23, 'belowStart');
  // Calibration-in-the-large of the probability of a fall: too low, too high or close to the frequency observed.
  const calBias = (c, lang) => {
    const close = Math.abs(c.meanP - c.freq) < .03, low = c.meanP < c.freq;
    return lang === 'en' ? (close ? `close to the frequency observed, ${prob(c.meanP)} against ${prob(c.freq)}` : `too ${low ? 'low' : 'high'} on average, ${prob(c.meanP)} against ${prob(c.freq)} of falls observed`)
      : (close ? `próxima da frequência observada, ${prob(c.meanP)} ante ${prob(c.freq)}` : `${low ? 'baixa' : 'alta'} demais em média, ${prob(c.meanP)} ante ${prob(c.freq)} de quedas observadas`);
  };

  // ---- buy or sell? (the decisions chapter) A gold holder buying TC and a TC holder selling them, each against acting today.
  // Plans come from complement.json (the seed-11 paths of every probability above); scenario levels from the ensemble and the
  // simulation in the same weeks; past cycles from the benchmark's weekly medians. Taking today's quote is the reference throughout.
  const DC = P.decisions, decNov = DC.weeks.nov, decJun = DC.weeks.jun;
  const planOf = (actor, sample, name) => DC[actor][sample].find(x => x.plan === name);
  const by23 = name => planOf('buyer', 'main', name), by24 = name => planOf('buyer', 'since2024', name);
  const se23 = name => planOf('seller', 'main', name), se24 = name => planOf('seller', 'since2024', name);
  const mb23 = run('bid', 'main');
  // Exhibit units: the TC that 10 million gp buy and the gp that 100 TC fetch, an order below the fee cap, so the fee stays at 2%.
  const tcFor = p => 1e7 / p, goldFor = p => 100 * p;
  const novBid = fc('bid', MILESTONES[0]), juneBid = fc('bid', MILESTONES[2]);
  // Making an offer at today's best quote of its own side: the buyer pays the best Buy Offer plus the fee, the seller keeps the best
  // Sell Offer less the fee. Making saves the spread and pays the fee, so it is the cheaper order for a buyer only when the round-trip
  // execution cost exceeds 1 - 1/(1 + f), and for a seller only when it exceeds f.
  const fee = C.fee.rate, makeBuy = antica.bid * (1 + fee), makeSell = antica.ask * (1 - fee);
  const buyEdge = (1 - 1 / (1 + fee)) * 100, sellEdge = fee * 100;
  // Waiting and then making an offer breaks even when the Buy Offer plus the fee equals today's Sell Offers (buyer) or the Sell
  // Offer less the fee equals today's Buy Offers (seller).
  const buyMakeAtMost = antica.ask / (1 + fee), sellMakeAtLeast = antica.bid / (1 - fee);
  // The chance that acting in each week beats acting today: below today's Sell Offers for the buyer, above today's Buy Offers for the seller.
  const waitCurve = sample => DS.ask[sample].curve.map(x => ({date: x.date, buyer: x.belowStart, seller: 1 - DS.bid[sample].curve.find(y => y.date === x.date).belowStart}));
  const wc23 = waitCurve('main');
  const buyerBest = wc23.reduce((a, b) => b.buyer > a.buyer ? b : a), sellerBest = wc23.reduce((a, b) => b.seller > a.seller ? b : a);
  const sellerHalf = wc23.find(x => x.date > sellerBest.date && x.seller < .5)?.date;
  const q10 = p => p.quantiles[0], q50 = p => p.quantiles[2], q90 = p => p.quantiles[4];
  // Changes in running text are magnitudes with a direction: "3.6% more TC", "3.0% less gold".
  const moreTc = v => t(`${pctU(Math.abs(v))} ${v >= 0 ? 'more' : 'fewer'} TC`, `${pctU(Math.abs(v))} ${v >= 0 ? 'mais' : 'menos'} TC`);
  const moreGold = v => t(`${pctU(Math.abs(v))} ${v >= 0 ? 'more' : 'less'} gold`, `${pctU(Math.abs(v))} ${v >= 0 ? 'mais' : 'menos'} gold`);
  const buyStaged = by23('staged'), sellStaged = se23('staged');
  // Changes that share a direction share one unit: "26.0%, 16.8% and 0.9% more TC"; mixed directions keep it on each item.
  const listChanges = (values, unit) => values.every(v => v >= 0) || values.every(v => v < 0)
    ? unit(values[0]).replace(pctU(Math.abs(values[0])), list(values.map(v => pctU(Math.abs(v))))) : list(values.map(unit));
  // The worlds whose round-trip cost does not exceed the fee: there, taking an offer is the cheaper order on at least one side.
  const takeOnly = worlds.filter(w => w.costPct <= sellEdge);
  // Whether spreading purchases over the simulated low's weeks narrows the worst tenth of outcomes against one purchase in June, in pp.
  const stagedPp = q10(buyStaged) - q10(by23('jun'));
  const stagedClause = Math.abs(stagedPp) < 1 ? ['does not narrow the loss in the worst tenth of paths', 'não estreita a perda no pior décimo dos paths']
    : [`${stagedPp > 0 ? 'narrows' : 'widens'} the loss in the worst tenth of paths from ${pctU(Math.abs(q10(by23('jun'))))} to ${pctU(Math.abs(q10(buyStaged)))}`,
      `${stagedPp > 0 ? 'estreita' : 'amplia'} a perda no pior décimo dos paths de ${pctU(Math.abs(q10(by23('jun'))))} para ${pctU(Math.abs(q10(buyStaged)))}`];
  // The same decisions in every completed past cycle, on the benchmark's weekly medians: from the week holding the capture's date
  // k years earlier to the weeks holding the Mondays of the decision weeks, to the peak up to 28 February and to the low from
  // 1 March to 26 September, the windows of the simulation. Weeks are labelled by the Sunday that ends them.
  const benchWeekly = R.history.filter(x => x.world === bench);
  const weekHolding = iso => new Date(ms(iso) + (7 - new Date(ms(iso)).getUTCDay()) % 7 * DAY).toISOString().slice(0, 10);
  const yearsBack = (iso, k) => `${+isoYear(iso) - k}${iso.slice(4)}`;
  const weeklyAt = (week, side) => benchWeekly.find(x => x.date === week && ok(x[side]))?.[side];
  const pastCycles = Array.from({length: 10}, (_, i) => i + 1).map(k => {
    const ref = weekHolding(yearsBack(antica.date, k)), y1 = +isoYear(ref) + 1, a0 = weeklyAt(ref, 'ask'), b0 = weeklyAt(ref, 'bid');
    const nov = weekHolding(yearsBack(weekStart(decNov), k)), jun = weekHolding(yearsBack(weekStart(decJun), k));
    const upTo = benchWeekly.filter(x => x.date >= ref && x.date <= `${y1}-02-28` && ok(x.bid)), low = benchWeekly.filter(x => x.date >= `${y1}-03-01` && x.date <= `${y1}-09-26` && ok(x.ask));
    if (!ok(a0) || !ok(b0) || `${y1}-09-26` > R.asOf || !upTo.length || !low.length) return null;
    const peakRow = upTo.reduce((a, b) => b.bid > a.bid ? b : a), lowRow = low.reduce((a, b) => b.ask < a.ask ? b : a);
    const buy = p => ok(p) ? (a0 / p - 1) * 100 : null, sell = p => ok(p) ? (p / b0 - 1) * 100 : null;
    return {cycle: `${isoYear(ref)}${RANGE}${y1}`, ref, ask: a0, bid: b0, nov, jun, peakDate: peakRow.date, lowDate: lowRow.date,
      buyNov: buy(weeklyAt(nov, 'ask')), buyJun: buy(weeklyAt(jun, 'ask')), buyLow: buy(lowRow.ask),
      sellNov: sell(weeklyAt(nov, 'bid')), sellJun: sell(weeklyAt(jun, 'bid')), sellPeak: sell(peakRow.bid)};
  }).filter(Boolean).reverse();
  // Chronological order: whether each player's gain from waiting has narrowed or widened from cycle to cycle.
  const steadily = (xs, dir) => xs.length > 1 && xs.every(ok) && xs.every((v, i) => !i || dir * (v - xs[i - 1]) > 0);
  const buyerShrinks = steadily(pastCycles.map(c => c.buyJun), -1), sellerGrows = steadily(pastCycles.map(c => c.sellNov), 1);

  // ---- robustness of the method (robustness.json, complement.json, forecast-ledger.jsonl). The published method is the
  // baseline; each alternative is read here once, and every chapter that states a result under it reads the same figures.
  // Cleaning floor: every floor reran the whole pipeline; a conclusion "changes" when a statement's test flips.
  const FR = X.filter.rows, frBase = FR.find(r => r.baseline), frAlt = FR.filter(r => !r.baseline);
  const floorName = f => f === null ? t('no floor', 'nenhum piso') : fmt(f, 2);
  const floorFlips = frAlt.flatMap(r => r.verdicts.filter(v => v.changed).map(v => ({floor: r.floor, statement: v.statement})));
  // Figures a floor leaves without support: numeric in the baseline, missing under the floor.
  const floorLost = r => Object.keys(frBase.headlines).filter(k => typeof frBase.headlines[k] === 'number' && r.headlines[k] == null);
  const noFloor = FR.find(r => r.floor === null), strictest = FR.reduce((a, b) => (b.floor ?? 0) > (a.floor ?? 0) ? b : a);
  const floorMaxPp = Math.max(...frAlt.map(r => r.maxProbPp)), floorMaxMape = Math.max(...frAlt.map(r => r.maxMapePp)), floorMaxLevel = Math.max(...frAlt.map(r => r.maxLevelPct));
  const floorDays = r => Object.values(r.changedDays).reduce((a, s) => a + (s.ask || 0), 0), floorWorlds = r => Object.keys(r.changedDays);
  const floorMild = frAlt.filter(r => r.floor !== null && r.floor < frBase.floor);
  const sameHeadlines = r => Object.keys(frBase.headlines).every(k => JSON.stringify(r.headlines[k]) === JSON.stringify(frBase.headlines[k]));
  // A lost figure in words: the young-world scenarios are named, anything else is counted.
  const lostPhrase = keys => { const fl = [...new Set(keys.filter(k => k.startsWith('floribra.')).map(k => k.split('.')[2]))];
    return fl.length ? t(`${target}'s exploratory ${list(fl)}-week age-analogy scenario`, `o scenario exploratório de ${list(fl)} semanas da analogia de idade de ${target}`) : t(`${nw(keys.length)} figures`, `${nw(keys.length)} números`); };
  const excludedPhrase = r => list(Object.entries(r.excludedByWorld).sort((a, b) => b[1] - a[1]).map(([w, n]) => t(`${nw(n)} in ${w}`, `${nw(n)} em ${w}`)));
  // Evidence per horizon: weekly origins, effective independent size of the loss difference and non-overlapping windows.
  const IND = X.independence, ind = (side, h) => IND.find(x => x.side === side && x.horizon === h);
  const i13 = ind('ask', 13), i26 = ind('ask', 26), i52 = ind('ask', 52);
  // The registered challenger C+S against the published C+S+H, on the published resamples.
  const csLower = IND.filter(x => x.diffPp < 0), csSig = IND.filter(x => ok(x.diffHigh) && x.diffHigh < 0), csSigWorse = IND.filter(x => ok(x.diffLow) && x.diffLow > 0);
  const challengerAt = (side, date) => X.challenger.find(x => x.side === side && x.date === date);
  const csNov = challengerAt('ask', MILESTONES[0])['C+S'], csJun = challengerAt('ask', MILESTONES[2])['C+S'];
  // The prospective ledger: frozen forecasts and the weeks scored so far.
  const LF = LG.filter(r => r.type === 'forecast'), LO = LG.filter(r => r.type === 'outcome'), frozen = LF.at(-1);
  const frozenHere = frozen && frozen.cutoff === R.asOf;
  const maturity = h => frozen ? frozen.weekEnding[h - 1] : null;
  // Transfer: the one-to-one rule against a slope (and a slope with drift) estimated for each world before each origin.
  const TB = X.transfer.rolling.filter(x => x.n), TBci = TB.filter(x => ok(x.skill_slopeLow));
  const slopeWins = TBci.filter(x => x.skill_slopeLow > 0), slopeLoses = TBci.filter(x => x.skill_slopeHigh < 0), slopePoint = TB.filter(x => x.skill_slope > 0);
  const driftWins = TBci.filter(x => x.skill_driftLow > 0), driftLoses = TBci.filter(x => x.skill_driftHigh < 0);
  const TBnow = X.transfer.current.filter(x => ok(x.beta)), betaMedian = median(TBnow.map(x => x.beta));
  const betaOne = TBnow.filter(x => x.betaLow <= 1 && x.betaHigh >= 1), betaBelow = TBnow.filter(x => x.betaHigh < 1), betaAbove = TBnow.filter(x => x.betaLow > 1);
  // Anchors: the latest capture against the median of the captures of the 24 and 72 hours up to it.
  const AW = X.anchor.worlds, anchorAt = k => X.anchor.benchmark.find(x => x.anchor === k), a72 = anchorAt('72h'), a24 = anchorAt('24h');
  const alone = AW.filter(x => x.n24 === 1), alone72 = AW.filter(x => x.n72 === 1);
  const devs72 = AW.flatMap(x => SIDE_KEYS.map(s => Math.abs(x[`${s}Dev72`]))).filter(ok);
  const devOverCost = AW.flatMap(x => SIDE_KEYS.filter(s => Math.abs(x[`${s}Dev72`]) > x.costPct).map(s => ({world: x.world, side: s, dev: x[`${s}Dev72`], cost: x.costPct})));
  const devOverBand = AW.filter(x => ok(x.bandPct) && SIDE_KEYS.some(s => Math.abs(x[`${s}Dev72`]) > x.bandPct));
  const worstDev = AW.flatMap(x => SIDE_KEYS.map(s => ({world: x.world, side: s, dev: x[`${s}Dev72`], band: x.bandPct}))).filter(x => ok(x.dev)).reduce((a, b) => Math.abs(b.dev) > Math.abs(a.dev) ? b : a);
  const AA = P.anchorAlternatives, aa = k => AA.find(x => x.anchor === k), AA_KEYS = ['pPeakAbove3', 'pJunBelowToday', 'pJunBelowNov', 'fromPeakGt10', 'takerGain', 'buyerNov', 'sellerNov', 'sellerJun'];
  const aaMaxPp = Math.max(...AA.flatMap(x => AA_KEYS.map(k => Math.abs(x[k] - aa('latest')[k]) * 100)));
  const aaFlips = AA.flatMap(x => AA_KEYS.filter(k => (x[k] > .5) !== (aa('latest')[k] > .5)));
  // Depth: executable Amount at the best price and upper bounds on the slippage of 100 and 1,000 TC.
  const DW = X.depth.worlds, dAn = DW.find(x => x.world === bench), dr = q => P.depthRoundtrip.find(x => x.tc === q);
  const beyond = q => DW.filter(x => !ok(x[`cost${q}`])), slipped = q => DW.filter(x => ok(x[`cost${q}`]) && x[`cost${q}`] - x.costPct > .005);
  const worstSlip = DW.filter(x => ok(x.cost1000)).reduce((a, b) => b.cost1000 - b.costPct > a.cost1000 - a.costPct ? b : a);
  const anticaBook = X.depth.benchmark, bidCovers1000 = anticaBook.filter(x => x.bidTop >= 1000).length, askCovers1000 = anticaBook.filter(x => x.askTop >= 1000).length;

  // ---- the report, in the order of the inference: each chapter resolves one stage and prepares the next
  const para = (en, pt) => `<p>${t(en, pt)}</p>`;
  // The calendar for the year ahead leaves out short recurring events; its title spans the events it lists.
  const calendar = R.calendar.filter(x => !['Full Moon', 'Last Creep Standing', "Valentine's Day"].includes(x.event));
  const allModelled = worlds.length === updates.length;
  const target = L.ageAnalogy.target, donor = L.ageAnalogy.donor, births = L.ageAnalogy.birthDates;
  const preds = pred ? L.terribra.predecessors : [];
  // Relative value across worlds (section 09), computed before the template that states it.
  const cwRows = side => C.crossWorld.worlds.filter(x => x.side === side);
  const gq = (side, g) => C.crossWorld.groupsByQuarter.filter(x => x.side === side && x.group === g);
  // The other Optional PvP group (the one the text does not lead with) and its quarters.
  const green = C.crossWorld.groups.find(g => g.side === 'ask' && g.group !== Y && g.group.startsWith('Optional PvP'))?.group;
  const greenQ = gq('ask', green), yellowQ = gq('ask', Y);
  const corr = cwRows('ask').filter(x => ok(x.corrWeekly) && !breaks.includes(x.world)).map(x => x.corrWeekly);
  const lag0 = C.crossWorld.leadLag.find(x => x.side === 'ask' && x.lag === 0);
  // Day-to-day change of the same-day capture premium, across worlds and sides: how noisy one capture is.
  const capSteps = C.crossWorld.worlds.flatMap(x => (x.currentPairs || []).slice().sort((a, b) => a.date < b.date ? -1 : 1).map(p => p.premiumPct).flatMap((v, k, a) => k ? [Math.abs(v - a[k - 1])] : []));
  const y24 = yellowQ.filter(q => q.quarter.startsWith('2024')), y24v = y24.map(q => q.medianPremiumPct), y24m = [...new Set(y24.flatMap(q => q.members))];
  const green25 = greenQ.find(q => q.quarter === '2025-T2'), g25 = (green25?.members || []).map(w => cwOf(w, 'ask'));
  const offLag = Math.max(...C.crossWorld.leadLag.filter(x => x.lag !== 0).map(x => x.r));
  const nextGroup = Math.max(...others.map(g => g.recentMedianPct));
  const trend = moved(yA.recentMedianPct, yA.last8MedianPct, yA.currentMedianPct);
  const histPremium = cwRows('ask').filter(x => x.currentBasis !== 'capturas no mesmo dia');
  const noPair = histPremium.filter(x => !ok(x.currentPremiumPct)).map(x => x.world), histPaired = histPremium.filter(x => ok(x.currentPremiumPct)).map(x => x.world);
  const groupWorlds = n => t(`${n === 1 ? 'the only' : `the ${nw(n)}`} ${groupWorldsPhrase(Y).replace(' worlds', n === 1 ? ' world' : ' worlds')} in the panel`, `${n === 1 ? 'o único' : `os ${nw(n)}`} ${groupWorldsPhrase(Y).replace('worlds', n === 1 ? 'world' : 'worlds')} do painel`);
  const g25Phrase = t(`${g25.length === 1 ? 'the only' : `the ${nw(g25.length)}`} ${groupWorldsPhrase(green || '').replace(' worlds', g25.length === 1 ? ' world' : ' worlds')} with history`, `${g25.length === 1 ? 'o único' : `os ${nw(g25.length)}`} ${groupWorldsPhrase(green || '').replace('worlds', g25.length === 1 ? 'world' : 'worlds')} com histórico`);
  // The transferability matrix: the rolling transfer test, Sell Offers at 13 weeks, beside the stability of each premium.
  const TR = (world, side, h = 13) => R.transferRolling.find(x => x.world === world && x.side === side && x.horizon === h);
  const verdictOf = x => !x || !ok(x.skillLow) ? 'Too Few Origins' : x.skillLow > 0 ? 'Beats Constant' : x.skill <= 0 ? 'Does Not Beat Constant' : 'Inconclusive';
  const trAsk = worlds.filter(w => w.world !== bench).map(w => ({world: w.world, x: TR(w.world, 'ask'), stress: w.askLocalStress})).filter(r => r.x && ok(r.x.skillLow));
  const trBeats = trAsk.filter(r => r.x.skillLow > 0), trNot = trAsk.filter(r => r.x.skill <= 0);
  // Spearman's rank correlation; ties get the mean of their ranks.
  const ranks = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = Array(a.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  const spearman = (a, b) => { const ra = ranks(a), rb = ranks(b), m = (a.length + 1) / 2; let num = 0, da = 0, db = 0; ra.forEach((v, i) => { num += (v - m) * (rb[i] - m); da += (v - m) ** 2; db += (rb[i] - m) ** 2; }); return num / Math.sqrt(da * db); };
  const trRho = trAsk.length > 2 ? spearman(trAsk.map(r => r.stress), trAsk.map(r => r.x.skill)) : null;
  const trStressBeats = median(trBeats.map(r => r.stress * 100)), trStressOthers = median(trAsk.filter(r => !trBeats.includes(r)).map(r => r.stress * 100));
  const trLeadGroup = yA.worlds.filter(w => trAsk.some(r => r.world === w)), trLeadBeats = trLeadGroup.filter(w => trBeats.some(r => r.world === w));
  // Coverage of the two worlds of the server-age analogy since their launch.
  const ageCoverage = L.coverage.filter(r => [target, donor].includes(r.world));
  // Several independent clauses in one sentence, joined with a separator and a final connector.
  const joinClauses = (items, sep, last) => items.length > 1 ? `${items.slice(0, -1).join(sep)}${last}${items.at(-1)}` : items.join('');
  const shellHead = `
  <header class="hero">
    <p class="eyebrow">Tibinance Research <span class="eyebrow-sep">/</span> ${t('Market Research', 'Pesquisa de mercado')} <span class="eyebrow-sep">/</span> <time datetime="${M.asOf}">${longDate(M.asOf)}</time></p>
    <h1>Tibia Coins: Price Dynamics, Predictability and Execution</h1>
    <p class="deck">${t('How trend, seasonality, cycles, differences across worlds and execution frictions shape the price of Tibia Coins in gold, how far competing models predict it out of sample, and what the validated evidence implies for prospective scenarios and executable strategies.',
      'Como trend, seasonality, cycles, diferenças entre worlds e fricções de execution moldam o price de Tibia Coins em gold, até que ponto modelos concorrentes o preveem out of sample e o que a evidência validada implica para scenarios prospectivos e strategies executáveis.')}</p>
    <p class="meta">${t(`Captures to ${longDate(M.asOf)}, with the research cutoff on ${longDate(R.asOf)}. Sources: the <a href="https://api.tibiamarket.top/docs">TibiaMarket public API</a> and ${M.captureCount} Market captures. <a href="https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle">Methodology, data and reproduction</a>.`,
      `Capturas até ${longDate(M.asOf)}, com cutoff da pesquisa em ${longDate(R.asOf)}. Fontes: a <a href="https://api.tibiamarket.top/docs">API pública do TibiaMarket</a> e ${M.captureCount} capturas do Market. <a href="https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle">Método, dados e reprodução</a>.`)}</p>
  </header>
  <div class="kpis" role="list" aria-label="${t('Research at a glance', 'Resumo da pesquisa')}">
    ${kpi(`${bench} Spot`, fmt(antica.ask), 'observed', `Sell Offer, ${cellDate(antica.date)}`)}
    ${kpi('Rise from Trough', sgn(cur.changePct), 'observed', t(`Trough week of ${cellDate(cur.start)} to the capture of ${cellDate(cur.end)}; ${sgn(cur.toLastWeeklyPct)} on weekly medians`, `Da semana do trough, ${cellDate(cur.start)}, à captura de ${cellDate(cur.end)}; ${sgn(cur.toLastWeeklyPct)} em weekly medians`))}
    ${kpi(`${monthYearEn(nov.date)} Ensemble Scenario`, fmt(nov.base), 'model', t(`Heuristic stress band ${fmt(nov.low)}${RANGE}${fmt(nov.high)}, not a calibrated probability interval`, `Heuristic stress band de ${fmt(nov.low)}${RANGE}${fmt(nov.high)}, não um intervalo de probabilidade calibrado`))}
    ${kpi(`${r13.horizon}-Week OOS Error`, pctU(r13.ensemble), 'backtested', t(`Ensemble MAPE, Sell Offers, against ${pctU(r13.constant)} for Constant over ${r13.n} weekly origins`, `Ensemble MAPE, Sell Offers, ante ${pctU(r13.constant)} do Constant em ${r13.n} origins semanais`))}
    ${kpi('Execution Cost', pctU(anticaSpread.nowPct), 'observed', t(`${bench} round trip, ${cellDate(anticaSpread.nowDate)}: the fall a taker rebuy must exceed`, `Round trip em ${bench}, ${cellDate(anticaSpread.nowDate)}: a queda que uma recompra taker precisa superar`))}
  </div>
  <div class="report-layout">
  <nav class="toc" aria-label="${t('Sections', 'Seções')}">
    <p class="toc-title">${t('In This Report', 'Neste relatório')}</p>
    <label class="toc-mobile" for="section-select">${t('Sections', 'Seções')} <select id="section-select">${contents().map(([id, num, title]) => `<option value="${id}">${num ? `${num} ` : ''}${title}</option>`).join('')}</select></label>
    <ol>${contents().map(([id, num, title]) => `<li><a href="#${id}"><span class="toc-num" aria-hidden="true">${num}</span>${title}</a></li>`).join('')}</ol>
    <a class="toc-top" href="#report">${t('Back to Top', 'Voltar ao topo')} <span aria-hidden="true">↑</span></a>
  </nav>
  <div class="report-body">
`;
  // The pages the index lists, in reading order: the executive summary, each chapter and the notes. The reader
  // sees one at a time (see show()); the others wait as markup.
  const pages = {
  executive: `
  <section class="block" id="executive">
    <h2>${EXECUTIVE_TITLE}</h2>
    <dl class="answers">
      <dt>${t('Where are we now?', 'Onde estamos?')}</dt>
      <dd>${evidenceTag('observed')}${t(`${bench}'s Sell Offers stood at <strong>${price(antica.ask)} gp/TC</strong> at the capture of ${longDate(antica.date)}, ${pctU(cur.changePct)} above the trough week of ${longDate(cur.start)} (${pctU(cur.toLastWeeklyPct)} on weekly medians, which smooth the latest capture), ${pctU(Math.abs(cur.aboveAllPreviousPeaksPct))} ${cur.aboveAllPreviousPeaksPct > 0 ? 'above every earlier peak' : 'below the highest earlier peak'} and ${pctU(Math.abs(yearAgo.pct))} ${yearAgo.pct >= 0 ? 'above' : 'below'} the same week a year earlier. Crossing the spread costs ${pctU(anticaSpread.nowPct)}.`,
        `As Sell Offers de ${bench} estavam em <strong>${price(antica.ask)} gp/TC</strong> na captura de ${longDate(antica.date)}, ${pctU(cur.changePct)} acima da semana do trough de ${longDate(cur.start)} (${pctU(cur.toLastWeeklyPct)} em weekly medians, que suavizam a captura mais recente), ${pctU(Math.abs(cur.aboveAllPreviousPeaksPct))} ${cur.aboveAllPreviousPeaksPct > 0 ? 'acima de todos os peaks anteriores' : 'abaixo do maior peak anterior'} e ${pctU(Math.abs(yearAgo.pct))} ${yearAgo.pct >= 0 ? 'acima' : 'abaixo'} da mesma semana do ano anterior. Atravessar o spread custa ${pctU(anticaSpread.nowPct)}.`)}</dd>
      <dt>${t('Is the price likely to rise further?', 'O price deve subir mais?')}</dt>
      <dd>${evidenceTag('model')}${t(`${m23.prob.peakAbove3 >= .5 ? (peakGain23 < cur.changePct ? 'Probably, but by less than it has already risen.' : 'Probably.') : 'Not clearly.'} In ${prob(m23.prob.peakAbove3)} of the simulated paths trained since 2023, and ${prob(m24.prob.peakAbove3)} of those trained since 2024, the peak before ${longDate(peakBy)} is at least 3% above today's price; the median peak is ${price(m23.peakLevel[1])} gp/TC (${sgn(peakGain23)}), and the ensemble scenario for ${monthYear(MILESTONES[0])} is ${price(nov.base)}. The probability is conditional on the specification and on the capture that starts the paths: starting from the capture of ${longDate(peakAnchorRow.capture)} (${price(peakAnchorRow.anchor)}) moves it to ${prob(peakAnchorRow.pPeakAbove3OfReference)}, and the alternative specifications give ${prob(peakSpec.low)} to ${prob(peakSpec.high)}.`,
        `${m23.prob.peakAbove3 >= .5 ? (peakGain23 < cur.changePct ? 'Provavelmente, mas menos do que já subiu.' : 'Provavelmente.') : 'Não claramente.'} Em ${prob(m23.prob.peakAbove3)} dos paths simulados com treino desde 2023, e em ${prob(m24.prob.peakAbove3)} dos treinados desde 2024, o peak até ${longDate(peakBy)} fica pelo menos 3% acima do price de hoje; o peak mediano é ${price(m23.peakLevel[1])} gp/TC (${sgn(peakGain23)}), e o ensemble scenario para ${monthYear(MILESTONES[0])} é ${price(nov.base)}. A probabilidade é condicional à especificação e à captura que inicia os paths: partir da captura de ${longDate(peakAnchorRow.capture)} (${price(peakAnchorRow.anchor)}) a leva a ${prob(peakAnchorRow.pPeakAbove3OfReference)}, e as especificações alternativas dão de ${prob(peakSpec.low)} a ${prob(peakSpec.high)}.`)}</dd>
      <dt>${t('Is it likely to fall afterwards?', 'Deve cair depois?')}</dt>
      <dd>${evidenceTag('model')}${t(`Falling from the peak is the most likely outcome; falling below today's price is a separate${m23.prob.jun28BelowStart < m23.prob.jun28BelowNov30 ? ' and less likely' : ''} event. ${prob(fallAt(d23, 10).fromPeak)} of paths fall more than 10% from their own peak (${prob(fallAt(d24, 10).fromPeak)} since 2024), and the week of ${longDate(rebuyWeek)} ends below the week of ${longDate(weekStart(novWeek))} in ${prob(m23.prob.jun28BelowNov30)} (${prob(m24.prob.jun28BelowNov30)}). The same week ends below today's price in ${prob(m23.prob.jun28BelowStart)} (${prob(m24.prob.jun28BelowStart)}), because most paths rise before they fall.`,
        `Cair a partir do peak é o desfecho mais provável; cair abaixo do price de hoje é outro evento${m23.prob.jun28BelowStart < m23.prob.jun28BelowNov30 ? ', menos provável' : ''}. ${prob(fallAt(d23, 10).fromPeak)} dos paths caem mais de 10% a partir do próprio peak (${prob(fallAt(d24, 10).fromPeak)} desde 2024), e a semana de ${longDate(rebuyWeek)} termina abaixo da semana de ${longDate(weekStart(novWeek))} em ${prob(m23.prob.jun28BelowNov30)} (${prob(m24.prob.jun28BelowNov30)}). A mesma semana termina abaixo do price de hoje em ${prob(m23.prob.jun28BelowStart)} (${prob(m24.prob.jun28BelowStart)}), porque a maioria dos paths sobe antes de cair.`)}</dd>
      <dt>${t('When could it fall?', 'Quando pode cair?')}</dt>
      <dd>${evidenceTag('model')}${t(`The peak comes in November or December in ${prob(peakNovDec)} of paths, and the lowest week after it has a median of ${longDate(weekStart(d23.lowDate[1]))} (P10 ${longDate(weekStart(d23.lowDate[0]))}, P90 ${longDate(weekStart(d23.lowDate[2]))}); trained since 2024, ${longDate(weekStart(d24.lowDate[1]))}. The chance of trading below today's price stays at or below ${prob(preNov23)} until the end of November, ${half23 ? `first reaches one half in the week of ${longDate(weekStart(half23))}` : 'never reaches one half'} and is highest, ${prob(max23.belowStart)}, in the week of ${longDate(weekStart(max23.date))}.`,
        `O peak ocorre em novembro ou dezembro em ${prob(peakNovDec)} dos paths, e a semana mais baixa depois dele tem median em ${longDate(weekStart(d23.lowDate[1]))} (P10 ${longDate(weekStart(d23.lowDate[0]))}, P90 ${longDate(weekStart(d23.lowDate[2]))}); com treino desde 2024, ${longDate(weekStart(d24.lowDate[1]))}. A chance de negociar abaixo do price de hoje fica em no máximo ${prob(preNov23)} até o fim de novembro, ${half23 ? `alcança metade pela primeira vez na semana de ${longDate(weekStart(half23))}` : 'nunca alcança metade'} e chega ao máximo, ${prob(max23.belowStart)}, na semana de ${longDate(weekStart(max23.date))}.`)}</dd>
      <dt>${t('How large could the fall be?', 'Qual pode ser o tamanho da queda?')}</dt>
      <dd>${evidenceTag('model')}${t(`From each path's own peak to its lowest later week, the median fall is ${pctU(-d23.fromPeak[2])}, and 80% of paths fall between ${pctU(-d23.fromPeak[4])} and ${pctU(-d23.fromPeak[0])}; falls larger than 5%, 10% and 15% occur in ${prob(fallAt(d23, 5).fromPeak)}, ${prob(fallAt(d23, 10).fromPeak)} and ${prob(fallAt(d23, 15).fromPeak)} of paths, against a median fall of ${pctU(-d24.fromPeak[2])} since 2024. From today's price, the week of ${longDate(rebuyWeek)} is a median ${pctU(Math.abs(d23.junVsStart[2]))} ${d23.junVsStart[2] < 0 ? 'lower' : 'higher'} (P10 ${sgn(d23.junVsStart[0])}, P90 ${sgn(d23.junVsStart[4])}).`,
        `Do próprio peak de cada path até sua semana mais baixa posterior, a queda mediana é de ${pctU(-d23.fromPeak[2])}, e 80% dos paths caem entre ${pctU(-d23.fromPeak[4])} e ${pctU(-d23.fromPeak[0])}; quedas maiores do que 5%, 10% e 15% ocorrem em ${prob(fallAt(d23, 5).fromPeak)}, ${prob(fallAt(d23, 10).fromPeak)} e ${prob(fallAt(d23, 15).fromPeak)} dos paths, ante queda mediana de ${pctU(-d24.fromPeak[2])} desde 2024. A partir do price de hoje, a semana de ${longDate(rebuyWeek)} fica, na median, ${pctU(Math.abs(d23.junVsStart[2]))} ${d23.junVsStart[2] < 0 ? 'abaixo' : 'acima'} (P10 ${sgn(d23.junVsStart[0])}, P90 ${sgn(d23.junVsStart[4])}).`)}</dd>
      <dt>${t('How confident are we?', 'Qual é o grau de confiança?')}</dt>
      <dd>${evidenceTag('backtested')}${t(`Moderately for one or two quarters, weakly for a year. Over ${r13.n} weekly origins, whose overlap leaves the information of about ${fmt(i13.nEff, 0)} independent observations, the ensemble's 13-week error was ${pctU(r13.ensemble)} against ${pctU(r13.constant)} for Constant, a ${pctU(skill13.skill, 0)} reduction whose 95% block-bootstrap interval runs from ${pctU(skill13.skillLow, 0)} to ${pctU(skill13.skillHigh, 0)}; at 52 weeks the origins span ${nw(skill52.windows)} independent ${skill52.windows === 1 ? 'window' : 'windows'}, so the ${pctU(skill52.skill, 0)} reduction cannot be bounded. The simulated probability of a fall has been ${calBias(pooled, 'en')} across ${pooled.n} fortnightly forecasts, and it moves far more with the training window (up to ${windowGap} pp) and the specification than with the seed (at most ${seedGap} pp). ${floorFlips.length || aaFlips.length ? 'Some conclusions change under alternative cleaning floors or anchors, as the robustness chapter states.' : 'No conclusion reverses under alternative cleaning floors or anchors.'} From this edition every forecast is frozen in an append-only ledger, where the published ensemble and its C+S challenger will be scored on outcomes unknown when they were made.`,
        `Moderado para um ou dois trimestres, fraco para um ano. Em ${r13.n} origins semanais, cuja sobreposição deixa a informação de cerca de ${fmt(i13.nEff, 0)} observações independentes, o erro do ensemble em 13 semanas foi ${pctU(r13.ensemble)}, ante ${pctU(r13.constant)} do Constant, uma redução de ${pctU(skill13.skill, 0)} cujo intervalo de block bootstrap de 95% vai de ${pctU(skill13.skillLow, 0)} a ${pctU(skill13.skillHigh, 0)}; em 52 semanas as origins cobrem ${nw(skill52.windows, true)} ${skill52.windows === 1 ? 'janela independente' : 'janelas independentes'}, de modo que a redução de ${pctU(skill52.skill, 0)} não pode ser delimitada. A probabilidade simulada de queda tem sido ${calBias(pooled, 'pt')} em ${pooled.n} forecasts quinzenais, e ela varia muito mais com a training window (até ${windowGap} pp) e com a especificação do que com a seed (no máximo ${seedGap} pp). ${floorFlips.length || aaFlips.length ? 'Algumas conclusões mudam sob pisos de limpeza ou anchors alternativos, como indica o capítulo de robustness.' : 'Nenhuma conclusão se inverte sob pisos de limpeza ou anchors alternativos.'} A partir desta edição, cada forecast fica congelado em um ledger que só aceita acréscimos, onde o ensemble publicado e seu challenger C+S serão avaliados em resultados desconhecidos quando foram feitos.`)}</dd>
      <dt>${t('Buy TC now or wait?', 'Comprar TC agora ou esperar?')}</dt>
      <dd>${evidenceTag('model')}${t(`${by23('jun').pBetter > .5 && by23('nov').pBetter < .5 ? 'Waiting for the mid-year decline has the better odds; buying into the late-year rise has the worse.' : 'Neither choice has clearly better odds.'} Buying at the Sell Offers in the week of ${longDate(weekStart(decNov))} instead of today yields fewer TC in ${prob(1 - by23('nov').pBetter)} of the simulated paths (a median of ${moreTc(q50(by23('nov')))}); buying in the week of ${longDate(weekStart(decJun))} yields more in ${prob(by23('jun').pBetter)} (${prob(by24('jun').pBetter)} trained since 2024), a median of ${moreTc(q50(by23('jun')))}, or ${fmt(tcFor(antica.ask) * (1 + q50(by23('jun')) / 100), 1)} instead of ${fmt(tcFor(antica.ask), 1)} TC for 10 million gp. When waiting pays it adds a median ${pctU(by23('jun').gainIfBetter)}, and when it fails it costs ${pctU(Math.abs(by23('jun').lossIfWorse))}; buying half now and half then halves both, and spreading purchases over the weeks of the simulated low ${stagedClause[0]}.`,
        `${by23('jun').pBetter > .5 && by23('nov').pBetter < .5 ? 'Esperar a queda de meio de ano tem as melhores chances; comprar durante a alta de fim de ano, as piores.' : 'Nenhuma das escolhas tem chances claramente melhores.'} Comprar às Sell Offers na semana de ${longDate(weekStart(decNov))} em vez de hoje rende menos TC em ${prob(1 - by23('nov').pBetter)} dos paths simulados (median de ${moreTc(q50(by23('nov')))}); comprar na semana de ${longDate(weekStart(decJun))} rende mais em ${prob(by23('jun').pBetter)} (${prob(by24('jun').pBetter)} com treino desde 2024), uma median de ${moreTc(q50(by23('jun')))}, ou ${fmt(tcFor(antica.ask) * (1 + q50(by23('jun')) / 100), 1)} em vez de ${fmt(tcFor(antica.ask), 1)} TC por 10 milhões de gp. Quando esperar compensa, acrescenta uma median de ${pctU(by23('jun').gainIfBetter)}, e quando falha custa ${pctU(Math.abs(by23('jun').lossIfWorse))}; comprar metade agora e metade depois reduz ambos à metade, e distribuir as compras pelas semanas do mínimo simulado ${stagedClause[1]}.`)}</dd>
      <dt>${t('Sell TC now or wait?', 'Vender TC agora ou esperar?')}</dt>
      <dd>${evidenceTag('model')}${t(`${se23('nov').pBetter > .5 && se23('jun').pBetter < .5 ? 'Selling into the late-year rise has the better odds; waiting past it has the worse.' : 'Neither choice has clearly better odds.'} Selling at the Buy Offers in the week of ${longDate(weekStart(decNov))} instead of today yields more gold in ${prob(se23('nov').pBetter)} of the simulated paths (${prob(se24('nov').pBetter)} trained since 2024), a median of ${moreGold(q50(se23('nov')))}, or ${price(goldFor(antica.bid) * (1 + q50(se23('nov')) / 100))} instead of ${price(goldFor(antica.bid))} gp for 100 TC; when it fails it costs a median ${pctU(Math.abs(se23('nov').lossIfWorse))}. Selling in the week of ${longDate(weekStart(decJun))} yields less gold than today in ${prob(1 - se23('jun').pBetter)} of paths. ${antica.costPct < sellEdge ? `At ${bench}'s ${pctU(antica.costPct)} spread, taking the Buy Offers pays more than posting a Sell Offer, whose 2% fee exceeds the spread it saves.` : `At ${bench}'s ${pctU(antica.costPct)} spread, a filled Sell Offer pays more than taking the Buy Offers, because the spread it saves exceeds the 2% fee.`}`,
        `${se23('nov').pBetter > .5 && se23('jun').pBetter < .5 ? 'Vender durante a alta de fim de ano tem as melhores chances; esperar além dela, as piores.' : 'Nenhuma das escolhas tem chances claramente melhores.'} Vender às Buy Offers na semana de ${longDate(weekStart(decNov))} em vez de hoje rende mais gold em ${prob(se23('nov').pBetter)} dos paths simulados (${prob(se24('nov').pBetter)} com treino desde 2024), uma median de ${moreGold(q50(se23('nov')))}, ou ${price(goldFor(antica.bid) * (1 + q50(se23('nov')) / 100))} em vez de ${price(goldFor(antica.bid))} gp por 100 TC; quando falha, custa uma median de ${pctU(Math.abs(se23('nov').lossIfWorse))}. Vender na semana de ${longDate(weekStart(decJun))} rende menos gold do que hoje em ${prob(1 - se23('jun').pBetter)} dos paths. ${antica.costPct < sellEdge ? `Com o spread de ${pctU(antica.costPct)} de ${bench}, aceitar as Buy Offers rende mais do que publicar uma Sell Offer, cuja fee de 2% supera o spread que ela economiza.` : `Com o spread de ${pctU(antica.costPct)} de ${bench}, uma Sell Offer executada rende mais do que aceitar as Buy Offers, porque o spread que ela economiza supera a fee de 2%.`}`)}</dd>
      <dt>${t('Is selling and rebuying worth it after costs?', 'Vender e recomprar compensa após os custos?')}</dt>
      <dd>${evidenceTag('observed')}${evidenceTag('model')}${t(`${rt23.quantiles[2] < 5 ? 'Only modestly.' : 'Possibly.'} A player who sells at today's Buy Offers (${price(antica.bid)}) and repurchases at the Sell Offers gains TC only if they fall more than ${pctU(Math.abs(beTaker.vsSellPct))}, below ${price(beTaker.rebuyAtMost)}; making offers requires Buy Offers at or below ${price(beMaker.rebuyAtMost)}, ${pctU(Math.abs(beMaker.vsSellPct))} below today's Sell Offers, with 2% paid on each offer and both filled. Repurchasing in the week of ${longDate(rebuyWeek)}, the taker ends with more TC in ${prob(rt23.pGain)} of paths (${prob(rt24.pGain)} since 2024), for a median of ${sgn(rt23.quantiles[2])} (${sgn(rt24.quantiles[2])}), and loses more than 10% of the TC in ${prob(rt23.pLossGt10)} (${prob(rt24.pLossGt10)}). For 1,000 TC, the Amount at the best Buy Offer ${dAn.bidTop < 1000 ? `(${fmt(dAn.bidTop)} TC) cannot absorb the sale, which lowers the break-even to ${price(dr(1000).breakEven)} and the chance of a gain to at least ${prob(dr(1000).main.pGain)}` : `covers the sale, so the figures hold for 1,000 TC`}.`,
        `${rt23.quantiles[2] < 5 ? 'Apenas modestamente.' : 'Possivelmente.'} Quem vende às Buy Offers de hoje (${price(antica.bid)}) e recompra às Sell Offers só ganha TC se elas caírem mais de ${pctU(Math.abs(beTaker.vsSellPct))}, abaixo de ${price(beTaker.rebuyAtMost)}; como maker, é preciso recomprar com Buy Offers de no máximo ${price(beMaker.rebuyAtMost)}, ${pctU(Math.abs(beMaker.vsSellPct))} abaixo das Sell Offers de hoje, pagando 2% em cada offer e com ambas executadas. Recomprando na semana de ${longDate(rebuyWeek)}, o taker termina com mais TC em ${prob(rt23.pGain)} dos paths (${prob(rt24.pGain)} desde 2024), com median de ${sgn(rt23.quantiles[2])} (${sgn(rt24.quantiles[2])}), e perde mais de 10% das TC em ${prob(rt23.pLossGt10)} (${prob(rt24.pLossGt10)}). Para 1.000 TC, o Amount na melhor Buy Offer ${dAn.bidTop < 1000 ? `(${fmt(dAn.bidTop)} TC) não absorve a venda, o que reduz o break-even para ${price(dr(1000).breakEven)} e a chance de gain para pelo menos ${prob(dr(1000).main.pGain)}` : `cobre a venda, de modo que os números valem para 1.000 TC`}.`)}</dd>
    </dl>
    <details class="drawer"><summary>Evidence Status</summary>
    <ul class="evidence-key">
      <li>${evidenceTag('observed')}${t('quotes, captures and historical outcomes as recorded', 'quotes, capturas e resultados históricos tal como registrados')}</li>
      <li>${evidenceTag('backtested')}${t('a model scored against prices observed after each forecast origin', 'um modelo avaliado contra prices observados após cada forecast origin')}</li>
      <li>${evidenceTag('model')}${t('a model\'s output that no later observation has scored yet', 'saída de um modelo que nenhuma observação posterior avaliou ainda')}</li>
      <li>${evidenceTag('exploratory')}${t('a rule or comparison without enough history to validate it', 'regra ou comparação sem histórico suficiente para validá-la')}</li>
    </ul>
    </details>
  </section>`,
  sumario: `
  <section class="block" id="sumario">
    ${sectionHeading('sumario')}
    <div class="prose narrative-grid">
    ${para(`Tibia Coins (TC) are Tibia's premium currency. Unlike gold, they are acquired outside the game's own economy, yet they can be exchanged for gold on the Market of each world, where players post Sell Offers and Buy Offers. The price of TC in gold is therefore an exchange rate between two economies, and because every world runs a separate Market, the same asset trades simultaneously at different prices. This report studies the dynamics of that price: not its level on any given day, but the way the level moves through time and differs across worlds.`,
      `Tibia Coins (TC) são a moeda premium de Tibia. Ao contrário do gold, são adquiridas fora da economia do próprio jogo, mas podem ser trocadas por gold no Market de cada world, onde os jogadores publicam Sell Offers e Buy Offers. O price de TC em gold é, portanto, uma exchange rate entre duas economias e, como cada world mantém um Market próprio, o mesmo ativo é negociado simultaneamente a prices diferentes. Este relatório estuda a dinâmica desse price: não seu nível em um dia específico, mas a forma como ele se move ao longo do tempo e difere entre worlds.`)}
    ${para(`Several distinct forces can move that price, and an observed movement does not reveal which of them is at work. A rise may reflect a persistent trend, the structural component of TC inflation; the recurrent seasonality that has preceded each late-year peak; the upswing of a cycle whose amplitude need not match the previous one; a change in one world's value relative to the others; or merely a wider gap between the best Sell Offer and the best Buy Offer, which is an execution friction rather than a change in value. The analytical problem is therefore to distinguish trend, seasonality, cycles, heterogeneity across worlds and execution frictions before any statement about future prices is made, because a prospective estimate can be no more credible than the decomposition and the out-of-sample evidence on which it rests.`,
      `Diversas forças distintas podem mover esse price, e um movimento observado não revela qual delas está em ação. Uma alta pode refletir uma trend persistente, o componente estrutural da TC inflation; a seasonality recorrente que antecedeu cada peak de fim de ano; a fase ascendente de um cycle cuja amplitude não precisa repetir a do anterior; uma mudança no valor de um world em relação aos demais; ou apenas um gap maior entre a melhor Sell Offer e a melhor Buy Offer, que é uma fricção de execution, e não uma mudança de valor. O problema analítico consiste, portanto, em distinguir trend, seasonality, cycles, heterogeneidade entre worlds e fricções de execution antes de qualquer afirmação sobre prices futuros, pois uma estimativa prospectiva não pode ser mais confiável do que a decomposition e a evidência out of sample em que se apoia.`)}
    ${para(`The research question follows directly from that problem: to what extent can the temporal and cross-sectional dynamics of TC prices in gold be characterised and predicted out of sample, and what do those predictions imply for a player who must trade through the Market's frictions? The report answers it in a single sequence. We characterise the temporal and cross-sectional dynamics of Tibia Coin prices in gold, evaluate the predictive capacity of competing models through out-of-sample validation and, conditional on that evidence, construct prospective scenarios and examine their implications under real execution frictions.`,
      `A pergunta de pesquisa decorre diretamente desse problema: em que medida a dinâmica temporal e cross-sectional dos prices de TC em gold pode ser caracterizada e prevista out of sample, e o que esses forecasts implicam para um jogador que precisa negociar através das fricções do Market? O relatório responde a ela em uma única sequência. Caracterizamos a dinâmica temporal e cross-sectional dos prices de Tibia Coins em gold, avaliamos a capacidade preditiva de modelos concorrentes por meio de validação out of sample e, condicionados a essa evidência, construímos scenarios prospectivos e examinamos suas implicações sob fricções reais de execution.`)}
    ${para(`The contribution is threefold. First, the report measures the Market on both of its sides and across ${worlds.length} worlds from quoted offers rather than from daily averages of undocumented weighting, so that trend, season, cycle, relative value and spread are identified on the prices at which a player can actually trade. Second, it submits competing forecasting models to out-of-sample tests before any of them is used prospectively, so that each scenario carries only the credibility its record supports. Third, it converts the resulting distributions into outcomes in TC net of spreads and fees, which shows how much of a correct view of the cycle survives execution. The sections follow that sequence, from measurement and description through validation and scenarios to execution, the decisions of buyers and sellers, heterogeneity across worlds and robustness, and each keeps observed quotes, model estimates and their economic interpretation apart, so that the discussion and conclusion can separate what the data document from what they only suggest.`,
      `A contribuição é tripla. Primeiro, o relatório mede o Market em seus dois lados e em ${worlds.length} worlds a partir de quoted prices, e não de daily averages cuja ponderação não é documentada, de modo que trend, seasonality, cycle, relative value e spread são identificados nos prices a que um jogador pode de fato negociar. Segundo, submete modelos concorrentes a testes out of sample antes que qualquer um deles seja usado prospectivamente, de modo que cada scenario carrega apenas a credibilidade que seu histórico sustenta. Terceiro, converte as distributions resultantes em resultados em TC líquidos de spreads e fees, o que mostra quanto de uma leitura correta do cycle sobrevive à execution. As seções seguem essa sequência, da mensuração e da descrição, passando pela validação e pelos scenarios, até a execution, as decisões de compradores e vendedores, a heterogeneidade entre worlds e a robustness, e cada uma mantém separados os quoted prices, as estimativas dos modelos e sua interpretação econômica, de modo que a discussão e a conclusão possam separar o que os dados documentam do que apenas sugerem.`)}
    </div>
  </section>`,
  s13: `
  <section class="block" id="s13">
    ${sectionHeading('s13')}
    <div class="prose narrative-grid">
    ${para(`Every result in this report is conditional on what was measured, so the rules that define the sample, the variables and their transformations precede any evidence. The analysis measures quoted prices rather than transactions and draws them from two sources. The public TibiaMarket API supplies the history of the best Sell Offer and Buy Offer for TC on each world,${note('api')} while ${M.captureCount} Market captures, screenshots of the in-game Market read into the same two prices together with their Amounts and the depth of each side, supply the most recent observations. Together they cover ${updates.length} monitored worlds, ${allModelled ? 'every one of which is modelled' : `${worlds.length} of which are modelled`}, over a period that runs from the first valid ${bench} quote on ${longDate(antica.first)} to the research cutoff of ${longDate(R.asOf)}.${extraWorlds.length ? ` ${extraWorlds.map(w => outsideResearch(w.world)).join(' ')}` : ''}`,
      `Todos os resultados deste relatório dependem do que foi medido; por isso, as regras que definem a sample, as variáveis e suas transformações precedem qualquer evidência. A análise mede quoted prices, e não transações, e os obtém de duas fontes. A API pública do TibiaMarket fornece o histórico da melhor Sell Offer e da melhor Buy Offer de TC em cada world,${note('api')} enquanto ${M.captureCount} capturas do Market, screenshots do Market do jogo dos quais se extraem os mesmos dois prices, com seus Amounts e a depth de cada lado, fornecem as observações mais recentes. Em conjunto, as fontes cobrem ${updates.length} worlds monitorados, ${allModelled ? 'todos modelados' : `dos quais ${worlds.length} são modelados`}, em um período que vai da primeira quote válida de ${bench}, em ${longDate(antica.first)}, ao cutoff da pesquisa, em ${longDate(R.asOf)}.${extraWorlds.length ? ` ${extraWorlds.map(w => outsideResearch(w.world)).join(' ')}` : ''}`)}
    ${para(`The cutoff is the latest valid offer date in the files, capped at the day of execution rather than set by the download date, so that every result describes the same information set.${R.predecessor.length ? ` The histories of ${list(preds)}, the predecessors of Terribra, are read as well, bringing the documented series to ${R.quality.length + (R.unmodelled || []).length}.` : ''} An archival copy of the public history is reconciled with the API for each of the ${worlds.length} modelled worlds, while predecessor series are checked against the API alone,${note('archive')} and the reproduction package preserves inputs, hashes, transformations and results, so that each methodological choice below can be inspected and reversed.${note('package')} The research is conducted independently by Tibinance, with no affiliation to CipSoft or TibiaMarket.`,
      `O cutoff corresponde à última data de offer válida nos arquivos, limitada ao dia da execução e não definida pela data do download, de modo que todos os resultados descrevem o mesmo conjunto de informações.${R.predecessor.length ? ` Os históricos de ${list(preds)}, predecessors de Terribra, também são lidos, o que eleva a ${R.quality.length + (R.unmodelled || []).length} as séries documentadas.` : ''} Uma cópia de arquivo do histórico público é conciliada com a API para cada um dos ${worlds.length} worlds modelados, enquanto as séries dos predecessors são verificadas apenas contra a API,${note('archive')} e o pacote de reprodução preserva entradas, hashes, transformações e resultados, para que cada escolha metodológica descrita a seguir possa ser examinada e revertida.${note('package')} A pesquisa é conduzida de forma independente pela Tibinance, sem afiliação à CipSoft ou ao TibiaMarket.`)}
    </div>
    <h3>${t('Market Variables and Measurement', 'Variáveis de Market e mensuração')}</h3>
    <div class="prose narrative-grid">
    ${para(`On the Market, a Sell Offer is posted by a player who wants to sell TC and a Buy Offer by a player who wants to buy them; accepting a Sell Offer therefore means buying TC at the lowest asking price, and accepting a Buy Offer means selling TC at the highest bid.${note('manual')} Because the two sides are two different prices of the same asset, they are never merged: every level, return, model and scenario in the report is computed for Sell Offers and Buy Offers separately. For each side, the variable is the best Piece Price in gold per TC; its Amount is the number of TC offered at that price, and market depth is the sum of the Amounts visible on that side, which measures quoted liquidity rather than executed trades or traded volume.`,
      `No Market, uma Sell Offer é publicada por um jogador que quer vender TC, e uma Buy Offer, por um jogador que quer comprá-las; aceitar uma Sell Offer significa, portanto, comprar TC ao menor price pedido, e aceitar uma Buy Offer significa vender TC ao maior bid.${note('manual')} Como os dois lados são dois prices diferentes do mesmo ativo, eles nunca são combinados: cada price level, return, modelo e scenario do relatório é calculado separadamente para Sell Offers e Buy Offers. Em cada lado, a variável é o melhor Piece Price em gold por TC; seu Amount é o número de TC oferecidas a esse price, e a market depth é a soma dos Amounts visíveis naquele lado, que mede a liquidity cotada, e não executed trades ou traded volume.`)}
    ${para(`Two derived quantities describe the distance between the sides. Writing ${tex('P^{S}_t')} and ${tex('P^{B}_t')} for the best Sell Offer and the best Buy Offer on day ${tex('t')}, the quoted spread ${tex('s_t')} measures the gap relative to the mid-price, whereas the round-trip execution cost ${tex('c_t')} measures the share of value lost by buying at the best Sell Offer and selling at once at the best Buy Offer:`,
      `Duas medidas derivadas descrevem a distância entre os lados. Sendo ${tex('P^{S}_t')} e ${tex('P^{B}_t')} a melhor Sell Offer e a melhor Buy Offer no dia ${tex('t')}, o quoted spread ${tex('s_t')} mede o gap em relação ao mid-price, enquanto o round-trip execution cost ${tex('c_t')} mede a parcela de valor perdida ao comprar na melhor Sell Offer e vender imediatamente na melhor Buy Offer:`)}
    ${math(String.raw`s_t = \frac{P^{S}_t - P^{B}_t}{\tfrac{1}{2}\left(P^{S}_t + P^{B}_t\right)}, \qquad c_t = 1 - \frac{P^{B}_t}{P^{S}_t}`)}
    ${para(`Because their denominators differ, the two measures are close but not interchangeable, and both presume that the Amount at the best price covers the intended trade. Captures are snapshots taken at different moments: although ${freshWorlds.length} worlds have a reading on ${dayMonth(M.asOf)}, no two readings are simultaneous${olderReadings.length ? `, and ${olderReadings.length === 1 ? 'the latest reading' : 'the latest readings'} of ${list(olderReadings.map(w => `${w.world} (${longDate(w.latest.capturedAt)})`))} ${olderReadings.length === 1 ? 'precedes' : 'precede'} that date` : ''}. ${fallbackNote ? `${fallbackNote} ` : ''}Every comparison of level or depth across worlds therefore carries the date of its reading.`,
      `Como seus denominadores diferem, as duas medidas são próximas, mas não intercambiáveis, e ambas pressupõem que o Amount no best price cubra o trade pretendido. As capturas são snapshots feitos em momentos distintos: embora ${freshWorlds.length} worlds tenham leitura em ${dayMonth(M.asOf)}, nenhuma leitura é simultânea a outra${olderReadings.length ? `, e ${olderReadings.length === 1 ? 'a leitura mais recente' : 'as leituras mais recentes'} de ${list(olderReadings.map(w => `${w.world} (${longDate(w.latest.capturedAt)})`))} ${olderReadings.length === 1 ? 'é anterior' : 'são anteriores'} a essa data` : ''}. ${fallbackNote ? `${fallbackNote} ` : ''}Toda comparação de price level ou de depth entre worlds carrega, portanto, a data de sua leitura.`)}
    </div>
    <h3>${t('Cleaning and Aggregation Rules', 'Regras de limpeza e agregação')}</h3>
    <div class="prose narrative-grid">
    ${para(`The API timestamps each offer in UTC, and each timestamp is converted to the server day that begins at 10:00 in Europe/Berlin; captures carry the calendar date on which they were supplied, without a stated time zone, so no intraday alignment between the two sources is assumed. Observations are excluded when the order book is empty, a price is not positive, the sides are crossed or the best Buy Offer falls below 80% of the best Sell Offer. The last rule removes implausible quotes, such as Buy Offers of 1 gp, although it may also remove genuine episodes of a very wide spread, which is why the raw inputs remain available for inspection. In this edition the floor removes ${nw(frBase.excluded)} API records, ${excludedPhrase(frBase)}, and rerunning the whole pipeline with floors of ${list(frAlt.filter(r => r.floor !== null).map(r => fmt(r.floor, 2)))} and with no floor ${floorFlips.length ? `reverses ${nw(floorFlips.length)} stated ${floorFlips.length === 1 ? 'conclusion' : 'conclusions'}` : 'reverses none of the conclusions this report states'}, as ${chapterRef('robustness')} shows.`,
      `A API registra cada offer com um timestamp em UTC, convertido para o server day que começa às 10h em Europe/Berlin; as capturas trazem a data de calendário em que foram fornecidas, sem fuso horário declarado, de modo que nenhum alinhamento intradiário entre as duas fontes é presumido. Excluem-se as observações em que o order book está vazio, um price não é positivo, os lados estão cruzados ou a melhor Buy Offer fica abaixo de 80% da melhor Sell Offer. A última regra elimina quotes implausíveis, como Buy Offers de 1 gp, embora também possa eliminar episódios genuínos de spread muito amplo, razão pela qual os dados brutos permanecem disponíveis para verificação. Nesta edição, o piso remove ${nw(frBase.excluded)} registros da API, ${excludedPhrase(frBase)}, e refazer todo o pipeline com pisos de ${list(frAlt.filter(r => r.floor !== null).map(r => fmt(r.floor, 2)))} e sem piso ${floorFlips.length ? `reverte ${nw(floorFlips.length, true)} ${floorFlips.length === 1 ? 'conclusão' : 'conclusões'} do relatório` : 'não reverte nenhuma das conclusões do relatório'}, como mostra a ${chapterRef('robustness')}.`)}
    ${para(`For each server day, the daily series takes the median of valid API offers and falls back on the median of captures only when the API has no valid offer that day, so that every day carries equal weight and none is counted twice; in this edition, captures add ${fmt(R.dataPolicy.captureDaysAdded)} world-days. Weekly medians are labelled by the Sunday that closes the week, and weeks closing after the cutoff never enter a training sample, whereas the anchor of every scenario is the most recent valid quote, with the latest capture taking precedence when dates coincide. Because one capture can be thin, the median of each world's captures in the 24 and 72 hours up to its latest one is kept as an alternative anchor, whose effect on the scenarios and probabilities ${chaptersRef(['downside', 'robustness'])} measure. No gap is interpolated, no centred filter consults future observations and no price level is chained across worlds; applied to ${bench}, these rules yield ${fmt(antica.days)} valid days, whose coverage and exclusions appear, with those of every other series, in the table below. Volatility, autocorrelation, forward returns and lead-lag co-movement across worlds use instead the last valid quote of each week, because a weekly median smooths consecutive observations and would manufacture persistence.`,
      `Para cada server day, a série diária usa a median das offers válidas da API e recorre à median das capturas apenas quando a API não tem offer válida naquele dia, de modo que cada dia recebe o mesmo peso e nenhum é contado duas vezes; nesta edição, as capturas acrescentam ${fmt(R.dataPolicy.captureDaysAdded)} combinações world-dia. As weekly medians recebem a data do domingo que encerra a semana, e semanas encerradas após o cutoff nunca entram em uma training sample, enquanto a anchor de cada scenario é a quote válida mais recente, com precedência para a última captura quando as datas coincidem. Como uma captura isolada pode ser rasa, a median das capturas de cada world nas 24 e 72 horas até a mais recente é mantida como anchor alternativa, cujo efeito sobre os scenarios e as probabilidades as ${chaptersRef(['downside', 'robustness'])} medem. Nenhuma lacuna é interpolada, nenhum filtro centrado consulta observações futuras e nenhum price level é encadeado entre worlds; aplicadas a ${bench}, essas regras produzem ${fmt(antica.days)} dias válidos, cuja coverage e exclusões aparecem, com as de todas as demais séries, na tabela abaixo. Volatility, autocorrelation, forward returns e co-movement com lags entre worlds usam, em vez disso, a última quote válida de cada semana, pois uma weekly median suaviza observações consecutivas e fabricaria persistence.`)}
    ${para(`TibiaMarket also publishes daily averages, day_average_sell and day_average_buy, which the provider describes as covering the preceding 24 hours.${note('tracker')} Because neither their weighting nor the underlying records are documented, they cannot be treated as prices of executed trades: they never enter the models, scenarios or probabilities, and they appear only in ${chapterRef('robustness')}, where they test whether the conclusions depend on measuring the market through offers. The reference specification received with the research package, which estimated probabilities on a daily-average index of 71 worlds extended to 2023 with offer mid-prices, is retained there for the same purpose, and its documentation supplies the historical dates of in-game events.`,
      `O TibiaMarket também publica daily averages, day_average_sell e day_average_buy, que o provedor descreve como cobrindo as 24 horas anteriores.${note('tracker')} Como nem sua ponderação nem os registros subjacentes são documentados, elas não podem ser tratadas como prices de executed trades: nunca entram nos modelos, scenarios ou probabilities e aparecem apenas na ${chapterRef('robustness')}, onde testam se as conclusões dependem de medir o Market por meio de offers. A especificação de referência recebida com o pacote de pesquisa, que estimava probabilities sobre um índice de daily averages de 71 worlds estendido a 2023 com mid-prices de offers, é mantida ali com o mesmo propósito, e sua documentação fornece as datas históricas dos eventos do jogo.`)}
    </div>
    <h3>${t('Mergers, Predecessor Worlds and Young Worlds', 'Mergers, predecessor worlds e worlds recentes')}</h3>
    <div class="prose narrative-grid">
    ${para(`Mergers, predecessor worlds and young worlds determine what a world's history may legitimately contain, and therefore which comparisons the later sections can make. ${pred ? `Terribra opened on ${longDate(L.terribra.mergeDate)} as the merger of ${list(preds)};${note('terribraAnnounced', 'terribraDate', 'terribraDone')} the histories of its predecessors are therefore kept as separate series and never concatenated with the successor's prices, and they enter only a dedicated test, in ${chapterRef('s05')}, of whether their movements carry information about Terribra. ` : ''}${relevantMergers.map(event => mergerBoundary(event)).join(' ')}`,
      `Mergers, predecessor worlds e worlds recentes determinam o que o histórico de um world pode legitimamente conter e, portanto, quais comparações os capítulos seguintes podem fazer. ${pred ? `Terribra abriu em ${longDate(L.terribra.mergeDate)} como merger de ${list(preds)};${note('terribraAnnounced', 'terribraDate', 'terribraDone')} por isso, os históricos de seus predecessors são mantidos como séries separadas e nunca encadeados aos prices do successor, entrando apenas em um teste específico, na ${chapterRef('s05')}, sobre se seus movimentos contêm informação a respeito de Terribra. ` : ''}${relevantMergers.map(event => mergerBoundary(event)).join(' ')}`)}
    ${para(`${target} and ${donor}, launched on ${longDate(births[target])} and ${longDate(births[donor])} respectively,${note('floribraLaunch', 'luzibraLaunch')} are compared at the same server age, because ${target}'s history ${(W[target]?.testN || 0) < 10 ? `is too short for the benchmark transfer, the rule of ${chapterRef('modeling')} that applies the proportional movement of ${bench} to each world's own anchor, to be tested reliably` : 'is short relative to the benchmark'} and ${donor} offers the closest earlier trajectory in the same region and PvP type; the comparison never projects ${donor} through its own merger and stops before ${donor}'s transfer block was lifted on ${longDate(L.ageAnalogy.transferOpened)}.${note('luzibraTransfers')} Finally, whenever a world's premium over ${bench} shifts by at least 15% between two eight-week windows, only the new regime is taken to describe that world, which is then excluded from cross-world aggregates${breaks.length ? `; ${list(breaks)} meet this rule` : ''}. Short histories remain in the universe, but each analysis applies its own minimum and names the worlds that fall short, and a world's confidence is recorded as limited when a merger has been announced, its anchor is stale or fewer than ten transfer tests exist.`,
      `${target} e ${donor}, lançados em ${longDate(births[target])} e ${longDate(births[donor])}, respectivamente,${note('floribraLaunch', 'luzibraLaunch')} são comparados na mesma server age, porque o histórico de ${target} ${(W[target]?.testN || 0) < 10 ? `é curto demais para que a transferência do benchmark, a regra da ${chapterRef('modeling')} que aplica o movimento proporcional de ${bench} à anchor de cada world, seja testada de forma confiável` : 'é curto em relação ao do benchmark'} e ${donor} oferece a trajetória anterior mais próxima, na mesma região e no mesmo tipo de PvP; a comparação nunca projeta ${donor} através de sua própria merger e termina antes da liberação de transfers de ${donor}, em ${longDate(L.ageAnalogy.transferOpened)}.${note('luzibraTransfers')} Por fim, sempre que o premium de um world sobre ${bench} muda pelo menos 15% entre duas janelas de oito semanas, apenas o novo regime passa a descrever esse world, que é então excluído dos agregados entre worlds${breaks.length ? `; ${list(breaks)} atendem a essa regra` : ''}. Históricos curtos permanecem no universo, mas cada análise aplica seu próprio mínimo e identifica os worlds que não o atingem, e a confiança de um world é registrada como limitada quando há merger anunciada, anchor defasada ou menos de dez testes de transferência.`)}
    </div>
    ${card({evidence: 'observed', title: 'Model Coverage and Exclusions', sub: t(`${R.quality.length + (R.unmodelled || []).length} documented series: ${worlds.length} modelled worlds${R.predecessor.length ? ` and ${list(R.predecessor.map(p => p.world))} as predecessors` : ''}. Monitor: ${updates.length} worlds.`, `${R.quality.length + (R.unmodelled || []).length} séries documentadas: ${worlds.length} worlds modelados${R.predecessor.length ? ` e ${list(R.predecessor.map(p => p.world))} como predecessors` : ''}. Monitor: ${updates.length} worlds.`),
      body: table({columns: [{key: 'world', label: 'Mundo'}, num('days', 'Dias de ofertas'), num('weeks', 'Semanas'), num('missingBook', 'Sem quadro de ofertas'), num('crossed', 'Cruzados'), num('wideSpread', 'Wide spread >20%'), {key: 'first', label: 'Primeira oferta', render: cellDate}, {key: 'last', label: 'Última oferta', render: cellDate},
      {key: 'anchor', label: 'Âncora', groupStart: true, render: (v, r) => v ? `${cellDate(v)}${staleTag(r)}` : MISSING}, num('testN', 'Testes'), {key: 'stress', label: 'Estresse local'}, {key: 'confidence', label: 'Confiança'}],
      rows: [...R.quality.map(q => { const w = W[q.world]; return {...q, anchor: w?.date, stale: w?.stale, ageDays: w?.ageDays, testN: w?.testN, stress: w?.askLocalStressBasis ?? (R.predecessor.some(p => p.world === q.world) ? 'Predecessor' : undefined), confidence: w?.confidence ?? unmodelled[q.world]}; }),
        ...(R.unmodelled || []).map(x => ({...x, confidence: x.reason}))],
      caption: t(`Anchor: most recent valid quote from the API or the captures, with its age in days at ${cutoffDay} where it is older. Tests compare the benchmark transfer at quarterly origins. Local stress: 80th percentile of 13-week premium changes, or premium dispersion with fewer than five pairs. An announced merger, a stale anchor or fewer than 10 tests limit confidence.`,
        `Anchor: quote válida mais recente da API ou das capturas, com sua defasagem em dias em ${cutoffDay} quando é anterior. Os testes comparam a transferência do benchmark em origins trimestrais. Local stress: 80º percentile das mudanças de premium em 13 semanas, ou dispersão do premium com menos de cinco pares. Merger anunciada, anchor defasada ou menos de 10 testes limitam a confiança.`)})})}
    <h3 id="inflation-method" data-report-anchor>${t('TC Inflation: Definition and Method', 'TC inflation: definição e método')}</h3>
    <div class="prose narrative-grid">
    ${para(`TC inflation is the change in the price of TC in gold. Because it follows a single asset through quoted prices, it is not a general price index of Tibia's economy and does not measure the purchasing power of gold across items. For each world and side, the monthly price ${tex('P_m')} is the median of the daily medians of the best Piece Price in month ${tex('m')}, so that every server day carries equal weight and no volume weighting is implied, and monthly and 12-month inflation are defined as`,
      `TC inflation é a variação do price de TC em gold. Como acompanha um único ativo por meio de quoted prices, ela não é um general price index da economia de Tibia nem mede o poder de compra do gold sobre todos os itens. Para cada world e lado, o price mensal ${tex('P_m')} é a median das daily medians do melhor Piece Price no mês ${tex('m')}, de modo que cada server day recebe o mesmo peso e nenhuma ponderação por volume é presumida, e a inflation mensal e a inflation em 12 meses são definidas como`)}
    ${math(String.raw`\pi^{(1)}_m = 100\left(\frac{P_m}{P_{m-1}} - 1\right), \qquad \pi^{(12)}_m = 100\left(\frac{P_m}{P_{m-12}} - 1\right)`)}
    ${para(`where the 12-month rate equals the product of the twelve monthly factors whenever all of them exist. A month qualifies for the reported rates and for the trend decomposition only when it is closed, contains at least 15 valid days and covers at least 60% of the calendar. Rates between available medians of closed months that fall short of this rule are still reported, as limited-sample rates, because they describe the quotes collected even if they may not represent the whole month; months in progress have no rate, and gaps are never interpolated. Annual comparisons follow the same discipline: the year-end level is the median of the final month, the annual rate compares December with the previous December (or, in a partial year, the latest closed month with December), and annual means require every month of the period and compare the same months across years.`,
      `em que a rate em 12 meses equivale ao produto dos doze fatores mensais sempre que todos existem. Um mês se qualifica para as rates reportadas e para a decomposition da trend apenas quando está encerrado, reúne pelo menos 15 dias válidos e cobre ao menos 60% do calendário. Rates entre medians disponíveis de meses encerrados que não atendem a essa regra continuam a ser reportadas, como rates de sample limitada, porque descrevem as quotes coletadas, ainda que possam não representar o mês inteiro; meses em andamento não têm rate, e lacunas nunca são interpoladas. As comparações anuais seguem a mesma disciplina: o nível de fim de ano é a median do mês final, a rate anual compara dezembro com o dezembro anterior (ou, em um ano parcial, o último mês encerrado com dezembro), e as means anuais exigem todos os meses do período e comparam os mesmos meses entre anos.`)}
    ${para(`The monthly base combines API offers and captures up to ${longDate(I.asOf)}, and ${monthYear(I.comparisonMonth)} is ${bench}'s latest consolidated month${inflationPartial ? `; ${monthYear(inflationPartial.date)} already has ${inflationPartial.days} valid days but remains partial, and additional captures cannot turn a month in progress into a closed observation` : ''}. With the sample, the variables and the definition of TC inflation fixed, the next section can describe the Market that this measurement reveals.`,
      `A base mensal combina offers da API e capturas até ${longDate(I.asOf)}, e ${monthYear(I.comparisonMonth)} é o último mês consolidado de ${bench}${inflationPartial ? `; ${monthYear(inflationPartial.date)} já reúne ${inflationPartial.days} dias válidos, mas continua parcial, de modo que capturas adicionais não podem transformar um mês em andamento em observação encerrada` : ''}. Com a sample, as variáveis e a definição de TC inflation fixadas, a seção seguinte pode descrever o Market que essa mensuração revela.`)}
    </div>
  </section>`,
  s01: `
  <section class="block" id="s01">
    ${sectionHeading('s01')}
    <div class="prose narrative-grid">
    ${para(`With the measurement fixed, the first empirical task is to describe the market as it stood at the cutoff, before any claim about its dynamics is made. Price levels, spreads and depth are read from the latest capture of each world; because these captures are snapshots taken at different moments, each reading keeps its own date.`,
      `Com a mensuração definida, a primeira tarefa empírica é descrever o Market como estava no cutoff, antes de qualquer afirmação sobre sua dinâmica. Price levels, spreads e depth são lidos da captura mais recente de cada world; como essas capturas são snapshots feitos em momentos distintos, cada leitura mantém sua própria data.`)}
    </div>
  <div id="market-statistics"></div>
  <section class="market-panel" aria-label="${t('Market Monitor', 'Monitor do Market')}">
    ${card({id: 'market-prices', evidence: 'observed', title: 'Observed Prices by World', sub: t(`${updates.length} worlds, ${M.captureCount} captures to ${cellDate(M.asOf)}. ${priceUnit}.`, `${updates.length} worlds, ${M.captureCount} capturas até ${cellDate(M.asOf)}. ${priceUnit}.`),
      controls: stateControl({label: 'Δ Comparison', key: 'comparison', options: COMPARISONS.map(([text]) => [text, text])}),
      body: table({columns: [
      {key: 'world', label: 'Mundo', render: (v, r) => `${W[v] ? `<a href="#dossier-${v.toLowerCase()}">${esc(v)}</a>` : esc(v)}<small class="market-mobile-date">${shortDate(r.date)}${r.priorDate ? `; vs ${shortDate(r.priorDate)}` : `; ${r.ageDays} ${t(r.ageDays === 1 ? 'day' : 'days', r.ageDays === 1 ? 'dia' : 'dias')}`}</small>`},
      num('sell', 'Sell Offers', 0, {groupStart: true}), {key: 'sell', label: 'Δ', num: true, sortValue: r => r.deltaPct.sell, render: (v, r) => change(r.deltaPct.sell)},
      num('buy', 'Buy Offers', 0, {groupStart: true}), {key: 'buy', label: 'Δ', num: true, sortValue: r => r.deltaPct.buy, render: (v, r) => change(r.deltaPct.buy)},
      {key: 'date', label: 'Última leitura', groupStart: true, render: (v, r) => `${shortDate(v)}${staleTag(r)}`},
      {key: 'priorDate', label: 'Comparação', render: v => v ? shortDate(v) : MISSING},
      percent('spreadPct', 'Quoted spread', 2, {groupStart: true})
    ], rows: marketRows, caption: t(`Δ compares captures; for fixed periods it uses the latest capture up to the reference date. Because readings are spot observations, Δ is not a continuous daily return. N/A: no comparable capture. Time zone not stated.${fallbackNote ? ` ${fallbackNote}` : ''}${extraWorlds.length ? ` ${extraWorlds.map(w => outsideResearch(w.world)).join(' ')}` : ''}`,
      `Δ compara capturas; em períodos fixos, usa a última captura até a data de referência. Como são leituras pontuais, Δ não é um return diário contínuo. N/A: sem captura comparável. Fuso horário não informado.${fallbackNote ? ` ${fallbackNote}` : ''}${extraWorlds.length ? ` ${extraWorlds.map(w => outsideResearch(w.world)).join(' ')}` : ''}`)})})}
    ${card({id: 'market-depth', evidence: 'observed', title: 'Market Depth', sub: t(`Latest reading per world to ${cellDate(M.asOf)}. ${priceUnit}; Amount in TC.`, `Leitura mais recente por world até ${cellDate(M.asOf)}. ${priceUnit}; Amount em TC.`), body: table({className: 'depth-table', groups: [
      {label: 'Mundo / leitura', span: 1, rowspan: 2},
      {label: 'Sell Offers', span: 3, start: true},
      {label: 'Buy Offers', span: 3, start: true},
      {label: 'Round-trip execution cost', span: 1, rowspan: 2, start: true, num: true, derived: true}
    ], columns: [
      {key: 'world', label: 'Mundo', rowspan: true, render: (v, r) => `<span class="world-reading"><span class="world-name">${esc(v)}</span><time class="dim" datetime="${r.date}">${cellDate(r.date)}</time></span>`},
      num('sell', 'Preço', 0, {groupStart: true}),
      num('sellTopAmount', 'Amount no melhor preço'),
      num('sellVolume', 'Amount total'),
      num('buy', 'Preço', 0, {groupStart: true}),
      num('buyTopAmount', 'Amount no melhor preço'),
      num('buyVolume', 'Amount total'),
      percent('executionCostPct', 'Round-trip execution cost', 2, {groupStart: true, rowspan: true})
    ], rows: marketRows, caption: t(`Round-trip execution cost: ${tex(String.raw`c_t = 1 - P^{B}_t / P^{S}_t`)}. Even where Amount is shown, execution at the best price is not guaranteed.${missingCaptures.length ? ` ${missingCaptures.map(w => w.world).join(', ')}: Amounts unknown, because no recent capture exists.` : ''}`,
      `Round-trip execution cost: ${tex(String.raw`c_t = 1 - P^{B}_t / P^{S}_t`)}. Mesmo quando há Amount, a execution no best price não é garantida.${missingCaptures.length ? ` ${missingCaptures.map(w => w.world).join(', ')}: Amounts desconhecidos, pois falta captura recente.` : ''}`)})})}
  </section>
    <div class="prose narrative-grid">
    ${para(`Three regularities emerge from these readings, and each shapes the analysis that follows. First, price levels differ materially across worlds: at the latest readings, Sell Offers range from ${price(cheapest.sell)} gp/TC in ${cheapest.world} to ${price(dearest.sell)} in ${dearest.world}, with ${bench} at ${price(anticaRow.sell)}, so the natural object of cross-world comparison is relative value rather than a single market price. Second, spreads also differ: the quoted spread is ${pctU(anticaRow.spreadPct, 2)} in ${bench}, ${pctU(medianSpread, 2)} in the median world and ${pctU(widestSpread.spreadPct, 2)} in ${widestSpread.world}, which means that the same movement in value translates into different executable outcomes. Third, quoted depth lies mostly away from the best price: in ${bench}, ${pctU(anticaTopShare, 0)} of the Amount on the Sell Offers side stands at the best price, against a median of ${pctU(medianTopShare, 0)} across worlds, ${thinnest ? `and in ${thinnest.world} the best Sell Offer carries only ${fmt(thinnest.sellTopAmount)} TC, so any larger execution would move along the order book` : 'so a larger execution would move along the order book'}. The first regularity motivates the benchmark approach of ${chapterRef('s05')}, while the second and third return as the frictions of ${chapterRef('s08')}.`,
      `Três regularidades emergem dessas leituras, e cada uma molda a análise seguinte. Primeiro, os price levels diferem materialmente entre worlds: nas leituras mais recentes, Sell Offers vão de ${price(cheapest.sell)} gp/TC em ${cheapest.world} a ${price(dearest.sell)} em ${dearest.world}, com ${bench} em ${price(anticaRow.sell)}, de modo que o objeto natural da comparação entre worlds é o relative value, e não um único price de Market. Segundo, os spreads também diferem: o quoted spread é ${pctU(anticaRow.spreadPct, 2)} em ${bench}, ${pctU(medianSpread, 2)} na median dos worlds e ${pctU(widestSpread.spreadPct, 2)} em ${widestSpread.world}, o que significa que o mesmo movimento de valor se traduz em resultados executáveis diferentes. Terceiro, a depth cotada está majoritariamente fora do best price: em ${bench}, ${pctU(anticaTopShare, 0)} do Amount do lado de Sell Offers está no best price, ante uma median de ${pctU(medianTopShare, 0)} entre worlds, ${thinnest ? `e em ${thinnest.world} a melhor Sell Offer tem apenas ${fmt(thinnest.sellTopAmount)} TC, de modo que qualquer execution maior percorreria o order book` : 'de modo que uma execution maior percorreria o order book'}. A primeira regularidade motiva a abordagem de benchmark da ${chapterRef('s05')}, enquanto a segunda e a terceira retornam como as fricções da ${chapterRef('s08')}.`)}
    </div>

    <h3 id="s14" data-report-anchor>${t('TC Inflation, Trend and Seasonality', 'TC inflation, trend e seasonality')}</h3>
    <div class="prose narrative-grid">
    ${para(`Levels and spreads describe a cross-section at one moment; TC inflation describes how the level itself has moved. We measure it first in ${bench}, the world with the longest continuous history, and then compare every world in a common reference month, so that the benchmark's inflation can be read against the dispersion of inflation across the Market.`,
      `Price levels e spreads descrevem um corte transversal em um único momento; a TC inflation descreve como o próprio price level se moveu. Medimos a inflation primeiro em ${bench}, o world com o histórico contínuo mais longo, e depois comparamos todos os worlds em um mês de referência comum, para que a inflation do benchmark possa ser lida diante da dispersão da inflation no Market.`)}
    </div>
    <div class="prose narrative-grid" id="inflation-reading"></div>
    <div class="evidence-stack">
      <div id="card-inflation-prices"></div><div id="card-inflation-rates"></div>
      <div id="card-inflation-annual"></div><div id="card-inflation-monthly"></div>
    </div>
    <div class="prose narrative-grid">
    ${para(`To separate the trend from the season, we estimate by ordinary least squares, on eligible months only,`,
      `Para separar a trend da seasonality, estimamos por ordinary least squares, apenas com meses elegíveis,`)}
    ${math(String.raw`\ln P_m = \alpha + \beta\, t_m + \gamma_{k(m)} + \varepsilon_m, \qquad \sum_{k=1}^{12} \gamma_k = 0`)}
    ${para(`where ${tex('t_m')} is measured in years and ${tex(String.raw`\gamma_{k(m)}`)} is the effect of the calendar month of ${tex('m')}, so that the annual trend is ${tex(String.raw`100\,(e^{\beta} - 1)`)}. The samples starting in ${list(inflationSamples.map(monthYear))} require at least 24 eligible months with two occurrences of each calendar month; because this still spans few cycles, the difference between samples measures sensitivity rather than a confidence interval. The contributions of trend, season and residual are expressed in log points, the unit in which they add up exactly (up to rounding), so they should not be added to simple percentage changes, and the trend share can be negative or exceed 100% when components offset one another. Seasonality cancels by construction when the same month is compared across years, whereas the residual gathers shocks, level shifts and model error rather than any additional seasonality or structural inflation.`,
      `em que ${tex('t_m')} é medido em anos e ${tex(String.raw`\gamma_{k(m)}`)} é o efeito do mês de calendário de ${tex('m')}, de modo que a trend anual é ${tex(String.raw`100\,(e^{\beta} - 1)`)}. As samples iniciadas em ${list(inflationSamples.map(monthYear))} exigem pelo menos 24 meses elegíveis, com duas ocorrências de cada mês de calendário; como isso ainda abrange poucos cycles, a diferença entre samples mede sensibilidade, e não um confidence interval. As contribuições de trend, seasonality e residual são expressas em log points, unidade na qual se somam exatamente (a menos do arredondamento); por isso, não devem ser somadas a variações percentuais simples, e a parcela da trend pode ser negativa ou superar 100% quando os componentes se compensam. A seasonality se anula por construção quando o mesmo mês é comparado entre anos, enquanto o residual reúne choques, level shifts e erro do modelo, e não seasonality adicional ou inflation estrutural.`)}
    </div>
    <div class="prose narrative-grid" id="inflation-decomposition"></div>
    <div class="evidence-stack">
      <div id="card-inflation-trend"></div><div id="card-inflation-attribution"></div><div id="card-inflation-worlds"></div>
    </div>
    <div class="prose narrative-grid">
    ${(() => {
      const others = I.monthly.filter(r => r.side === 'ask' && r.date === I.comparisonMonth && r.world !== bench);
      const eligible = others.filter(r => ok(r.yoyPct)), limited = others.filter(r => !ok(r.yoyPct) && ok(r.observed?.yoyPct)).map(r => ({world: r.world, v: r.observed.yoyPct}));
      const values = [...eligible.map(r => r.yoyPct), ...limited.map(r => r.v)], own = inflationAsk.yoyPct;
      if (!values.length || !ok(own)) return '';
      const belowCount = values.filter(v => v < own).length;

      const lo = limited.reduce((a, b) => b.v < a.v ? b : a, limited[0]), hi = limited.reduce((a, b) => b.v > a.v ? b : a, limited[0]);
      return para(`Across the Market, the Sell Offers comparison for ${monthYear(I.comparisonMonth)} qualifies under the coverage rule in ${eligible.length ? `${eligible.length === 1 ? 'one other world' : `${nw(eligible.length)} other worlds`}, ${list(eligible.map(r => `${r.world} (${sgn(r.yoyPct, 1)})`))}` : 'no other world'}${limited.length ? `, while the ${nw(limited.length)} ${limited.length === 1 ? 'world that allows' : 'worlds that allow'} only a limited-sample comparison ${limited.length === 1 ? 'ranges' : 'range'} from ${sgn(lo.v, 1)} in ${lo.world} to ${sgn(hi.v, 1)} in ${hi.world}` : ''}; ${bench}'s ${sgn(own, 1)} therefore exceeds ${belowCount} of the ${values.length} other worlds with an available comparison.`,
        `No conjunto do Market, a comparação de Sell Offers para ${monthYear(I.comparisonMonth)} se qualifica pela regra de coverage em ${eligible.length ? `${eligible.length === 1 ? 'um outro world' : `${nw(eligible.length)} outros worlds`}, ${list(eligible.map(r => `${r.world} (${sgn(r.yoyPct, 1)})`))}` : 'nenhum outro world'}${limited.length ? `, enquanto ${limited.length === 1 ? 'o único world que permite' : `os ${nw(limited.length)} worlds que permitem`} apenas uma comparação com sample limitada ${limited.length === 1 ? 'vai' : 'vão'} de ${sgn(lo.v, 1)} em ${lo.world} a ${sgn(hi.v, 1)} em ${hi.world}` : ''}; os ${sgn(own, 1)} de ${bench} superam, portanto, ${belowCount} dos ${values.length} outros worlds com comparação disponível.`);
    })()}
    </div>

    <h3 id="s07" data-report-anchor>${t('Historical Seasonality', 'Seasonality histórica')}</h3>
    <div class="prose narrative-grid">
    ${para(`Seasonality can also be read directly from prices, without any model. The weekly extremes of each calendar year and the median change within each calendar month show when ${bench}'s offers tend to rise and fall${seasonAsk.length ? `: across the years observed, the median change in Sell Offers is largest in ${monthName(seasonHigh.month)} (${sgn(seasonHigh.medianPct)}) and most negative in ${monthName(seasonLow.month)} (${sgn(seasonLow.medianPct)})` : ''}. Because ${R.asOf.slice(0, 4)} is incomplete and a maximum identified in retrospect is not a real-time signal, these exhibits describe the calendar rather than forecast it; they also use calendar years, whereas ${chapterRef('s03')} dates cycles from trough to peak and from peak to trough.`,
      `A seasonality também pode ser lida diretamente nos prices, sem qualquer modelo. Os extremos semanais de cada ano civil e a median da variação dentro de cada mês mostram quando as offers de ${bench} tendem a subir e cair${seasonAsk.length ? `: nos anos observados, a median da variação das Sell Offers é maior em ${monthName(seasonHigh.month)} (${sgn(seasonHigh.medianPct)}) e mais negativa em ${monthName(seasonLow.month)} (${sgn(seasonLow.medianPct)})` : ''}. Como ${R.asOf.slice(0, 4)} está incompleto e um máximo identificado retrospectivamente não é um sinal em tempo real, esses exhibits descrevem o calendário, sem prevê-lo; eles também usam anos civis, enquanto a ${chapterRef('s03')} data os cycles de trough a peak e de peak a trough.`)}
    </div>
    <div class="grid2">
    ${card({evidence: 'observed', title: `${bench}: Observed Weekly Extremes`, sub: priceUnit, body: table({columns: [{key: 'year', label: 'Ano', render: v => String(v)}, {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, {key: 'lowDate', label: 'Semana mínima', render: cellDate}, num('low', 'Mínima'), {key: 'highDate', label: 'Semana máxima', render: cellDate}, num('high', 'Máxima'), {key: 'complete', label: 'Período', render: v => v ? 'Full Year' : 'Partial'}], rows: R.cycles})})}
    <div id="card-season"></div>
    </div>
    <div class="prose narrative-grid">
    ${para(`The market thus presents two dimensions that any model must respect: the price level drifts across years, and movements within the year follow a recognisable calendar. Because the decomposition is estimated on the full sample and assumes a fixed seasonal pattern, it describes the past rather than predicting the future. Whether that pattern recurs with a stable amplitude, and whether weekly movements retain any memory once it is removed, are the questions to which ${chapterRef('s03')} turns.`,
      `O Market apresenta, portanto, duas dimensões que qualquer modelo deve respeitar: o price level se desloca entre anos, e os movimentos dentro do ano seguem um calendário reconhecível. Como a decomposition é estimada com a sample completa e pressupõe um padrão seasonal fixo, ela descreve o passado, sem prever o futuro. Se esse padrão se repete com amplitude estável, e se os movimentos semanais conservam alguma memória depois de removido, são as questões de que trata a ${chapterRef('s03')}.`)}
    </div>
  </section>`,
  s03: `
  <section class="block" id="s03">
    ${sectionHeading('s03')}
    <div class="prose narrative-grid">
    ${para(`The descriptive evidence raises a sharper question: is the current rise consistent with the cycles observed so far, or does it depart from them? We answer it in two steps. Turning points date the cycles and measure their timing, magnitude and duration; volatility, autocorrelation and forward returns then measure how persistent weekly movements are once the calendar is taken into account.`,
      `A evidência descritiva levanta uma pergunta mais precisa: a alta atual é compatível com os cycles observados até aqui ou se afasta deles? Respondemos em duas etapas. Os turning points datam os cycles e medem seu timing, sua magnitude e sua duração; em seguida, volatility, autocorrelation e forward returns medem quão persistentes são os movimentos semanais depois de considerado o calendário.`)}
    ${para(`A turning point is confirmed only when the weekly medians of ${bench}'s Sell Offers reverse by at least ${tex(String.raw`\theta = 5\%`)} from the running extreme, that is, when`,
      `Um turning point só é confirmado quando as weekly medians das Sell Offers de ${bench} revertem pelo menos ${tex(String.raw`\theta = 5\%`)} a partir do extremo corrente, isto é, quando`)}
    ${math(String.raw`\frac{P_t}{P_{\text{peak}}} \le 1 - \theta \quad \text{(peak confirmed)}, \qquad \frac{P_t}{P_{\text{trough}}} \ge 1 + \theta \quad \text{(trough confirmed)},`)}
    ${para(`and a leg shorter than ${C.swings.minLegWeeks} weeks is treated as a counter-move within a phase rather than as a cycle. The rule is backward-looking by construction, since a peak is known only after prices have fallen ${pctU(5, 0)} from it, so turning points delimit historical phases rather than signal them in real time, and weekly medians, not isolated captures, define them. The series begins on ${longDate(SW.ask.pivots[0].date)}, which censors the first rise, ending in ${monthYear(legsAsk[0].end)}, and the latest leg remains provisional; between them lie ${nw(ups.length)} complete ${ups.length === 1 ? 'cycle' : 'cycles'}, too few to estimate a periodicity but enough to compare timing, magnitude and duration.`,
      `e uma leg com menos de ${C.swings.minLegWeeks} semanas é tratada como um contramovimento dentro de uma fase, e não como cycle. A regra olha para trás por construção, pois um peak só é conhecido depois que os prices caem ${pctU(5, 0)} a partir dele; assim, os turning points delimitam fases históricas, sem sinalizá-las em tempo real, e são definidos por weekly medians, não por capturas isoladas. A série começa em ${longDate(SW.ask.pivots[0].date)}, o que censura a primeira alta, encerrada em ${monthYear(legsAsk[0].end)}, e a leg mais recente permanece provisória; entre elas há ${ups.length === 1 ? 'um cycle completo, pouco para estimar uma periodicidade, mas suficiente' : `${nw(ups.length)} cycles completos, poucos para estimar uma periodicidade, mas suficientes`} para comparar timing, magnitude e duração.`)}
    ${para(`Timing is the most regular feature. Measured on daily data, the peaks of the complete rises fell on ${list(peakDays.map(longDate))}, and the troughs that closed the subsequent declines fell in the weeks of ${list(troughWeeks.map(longDate))}: in every complete cycle, the market peaked ${monthSpan(peakDays)} and bottomed ${monthSpan(troughWeeks)}. The dating of these cycles is unchanged for reversal thresholds from ${fmt(Math.min(...stable))}% to ${fmt(Math.max(...stable))}%${lostAbove5.length ? `, whereas that of early 2023 is not: above 5%, ${list(lostAbove5.map(p => `the ${p.type === 'P' ? 'peak' : 'trough'} of ${monthYear(p.date)}`))} ${lostAbove5.length > 1 ? 'disappear' : 'disappears'}, so that the ${pctU(Math.abs(ups[0].changePct))} rise of late 2023 and the decline that followed it, which gave back ${fmt(retr[0].retracePct / 100, 1)} times that rise, lose their common basis of comparison` : ''}.`,
      `O timing é o traço mais regular. Medidos em dados diários, os peaks das altas completas ocorreram em ${list(peakDays.map(longDate))}, e os troughs que encerraram as quedas seguintes ocorreram nas semanas de ${list(troughWeeks.map(longDate))}: em todos os cycles completos, o Market atingiu o peak ${monthSpan(peakDays)} e o trough ${monthSpan(troughWeeks)}. A datação desses cycles não se altera para thresholds de reversal de ${fmt(Math.min(...stable))}% a ${fmt(Math.max(...stable))}%${lostAbove5.length ? `, ao passo que a do início de 2023 se altera: acima de 5%, ${lostAbove5.length > 1 ? 'desaparecem' : 'desaparece'} ${list(lostAbove5.map(p => `o ${p.type === 'P' ? 'peak' : 'trough'} de ${monthYear(p.date)}`))}, de modo que a alta de ${pctU(Math.abs(ups[0].changePct))} do fim de 2023 e a queda que se seguiu, que devolveu ${fmt(retr[0].retracePct / 100, 1)} vezes essa alta, perdem sua base comum de comparação` : ''}.`)}
    ${para(`Magnitude, by contrast, has changed. Peak-to-trough declines narrowed from ${sgn(declines[0].changePct)} to ${sgn(declines.at(-1).changePct)} as troughs rose from ${price(declines[0].endLevel)} to ${price(declines.at(-1).endLevel)} gp/TC, while the peaks of complete rises stayed between ${price(Math.min(...ups.map(u => u.endLevel)))} and ${price(Math.max(...ups.map(u => u.endLevel)))} gp/TC. If this damping persists, a model that repeats a constant seasonal amplitude will overstate the next decline, although ${declines.length === 1 ? 'one decline cannot' : `${nw(declines.length)} declines cannot`} establish the damping as a regularity.`,
      `A magnitude, ao contrário, mudou. As quedas de peak a trough diminuíram de ${sgn(declines[0].changePct)} para ${sgn(declines.at(-1).changePct)} à medida que os troughs subiram de ${price(declines[0].endLevel)} para ${price(declines.at(-1).endLevel)} gp/TC, enquanto os peaks das altas completas permaneceram entre ${price(Math.min(...ups.map(u => u.endLevel)))} e ${price(Math.max(...ups.map(u => u.endLevel)))} gp/TC. Se esse amortecimento persistir, um modelo que repete uma amplitude seasonal constante superestimará a próxima queda, embora ${declines.length === 1 ? 'uma queda não permita' : `${nw(declines.length, true)} quedas não permitam`} estabelecer o amortecimento como regularidade.`)}
    ${para(`Against this history, the current rise is ${lastVsPeak > 0 ? 'exceptional in level' : 'within the historical range in level'}${cur.weeks > longestUp ? ' and already longer than any previous rise' : cur.weeks < shortestUp ? ` and still shorter than any complete rise, at ${cur.weeks} weeks against ${shortestUp} to ${longestUp}` : `${lastVsPeak > 0 ? ' but not yet in length' : ' and in length'}, since its ${cur.weeks} weeks fall within the ${shortestUp} to ${longestUp} weeks of the complete rises`}. Since the trough of ${longDate(cur.start)} at ${price(cur.startLevel)} gp/TC, Sell Offers have ${cur.changePct >= 0 ? 'risen' : 'fallen'} ${pctU(Math.abs(cur.toLastWeeklyPct))} to the weekly median of ${longDate(cur.lastWeekly)} and ${pctU(Math.abs(cur.changePct))} to the capture of ${longDate(cur.end)}, which places the latest weekly median ${pctU(Math.abs(lastVsPeak))} ${lastVsPeak >= 0 ? 'above' : 'below'} the highest previous peak (${price(cur.previousPeak)} gp/TC, in the week of ${longDate(cur.previousPeakWeek)}) and the capture ${pctU(Math.abs(yearAgo.pct))} ${yearAgo.pct >= 0 ? 'above' : 'below'} the median of the same week in ${isoYear(yearAgo.yearAgoWeek)}. If the current rise lasted as long as each complete rise before it, it would end between ${longDate(implied[0])} and ${longDate(implied.at(-1))}; this range is a retrospective benchmark of duration, not a sell signal.`,
      `Diante desse histórico, a alta atual ${lastVsPeak > 0 ? 'é excepcional em nível' : 'fica dentro da faixa histórica em nível'}${cur.weeks > longestUp ? ' e já é mais longa do que qualquer alta anterior' : cur.weeks < shortestUp ? `, e ainda mais curta do que qualquer alta completa, com ${cur.weeks} semanas, ante ${shortestUp} a ${longestUp}` : `${lastVsPeak > 0 ? ', mas ainda não em duração' : ' e em duração'}, pois suas ${cur.weeks} semanas estão dentro das ${shortestUp} a ${longestUp} semanas das altas completas`}. Desde o trough de ${longDate(cur.start)}, a ${price(cur.startLevel)} gp/TC, as Sell Offers ${cur.changePct >= 0 ? 'subiram' : 'caíram'} ${pctU(Math.abs(cur.toLastWeeklyPct))} até a weekly median de ${longDate(cur.lastWeekly)} e ${pctU(Math.abs(cur.changePct))} até a captura de ${longDate(cur.end)}, o que coloca a última weekly median ${pctU(Math.abs(lastVsPeak))} ${lastVsPeak >= 0 ? 'acima' : 'abaixo'} do maior peak anterior (${price(cur.previousPeak)} gp/TC, na semana de ${longDate(cur.previousPeakWeek)}) e a captura ${pctU(Math.abs(yearAgo.pct))} ${yearAgo.pct >= 0 ? 'acima' : 'abaixo'} da median da mesma semana de ${isoYear(yearAgo.yearAgoWeek)}. Se a alta atual durasse tanto quanto cada alta completa anterior, terminaria entre ${longDate(implied[0])} e ${longDate(implied.at(-1))}; esse intervalo é uma referência retrospectiva de duração, e não um sinal de venda.`)}
    </div>
    <div id="card-pivots"></div>
    ${card({evidence: 'observed', title: sided(`${bench}: Confirmed Legs`, 'ask'), sub: t(`${priceUnit}. Weekly medians; minimum reversal of 5%`, `${priceUnit}. Weekly medians; reversal mínima de 5%`), body: table({columns: [
      {key: 'start', label: 'Início', render: cellDate}, {key: 'end', label: 'Fim', render: cellDate}, {key: 'direction', label: 'Direção', render: (v, r) => esc(tableValue(v)) + (r.censored ? ' ¹' : '')},
      num('startLevel', 'De'), num('endLevel', 'Para'), signed('changePct', 'Variação'), num('weeks', 'Semanas'), {key: 'dailyPeakDate', label: 'Máximo diário', render: v => v ? cellDate(v) : ''}, {key: 'plateauDays', label: 'Dias a menos de 2% do máximo', num: true, render: (v, r) => v ? `${fmt(v)} (${shortDate(r.plateauStart)}${RANGE}${shortDate(r.plateauEnd)})` : ''}],
      rows: [...legsAsk, {...cur, direction: 'alta (em curso)'}],
      caption: t('¹ Censored: the leg starts at the first observation.', '¹ Censurada: a leg começa na primeira observação.')})})}
    <div>
      ${card({evidence: 'exploratory', title: 'Current Rise Benchmarks', sub: t(`If the rise that began on ${cellDate(cur.start)} repeated each complete rise`, `Se a alta iniciada em ${cellDate(cur.start)} repetisse cada alta completa`), body: table({columns: [
        {key: 'start', label: 'Alta de referência', render: (v, r) => `${yy(v)}${RANGE}${yy(r.end)}`}, signed('changePct', 'Variação'), num('weeks', 'Semanas'),
        {key: 'impliedEnd', label: 'Fim implícito', render: cellDate}, num('impliedLevel', 'Nível implícito')], rows: cmp,
        caption: t(`Implied level = trough of ${cellDate(cur.start)} (${fmt(cur.startLevel)}) × (1 + change of the reference rise).`, `Nível implícito = trough de ${cellDate(cur.start)} (${fmt(cur.startLevel)}) × (1 + variação da alta de referência).`)})})}
    </div>

    <h3 id="s09" data-report-anchor>${t('Volatility, Autocorrelation and Forward Returns', 'Volatility, autocorrelation e forward returns')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Turning points describe the shape of the cycle; volatility and autocorrelation describe the texture of the weekly movements within it, and together they indicate whether the process has any memory beyond the calendar. To avoid the smoothing that weekly medians introduce, these measures use the last valid quote of each week. The standard deviation of weekly changes in ${bench}'s Sell Offers ${v26.weeklyStdPct < v25.weeklyStdPct ? 'fell' : 'rose'} from ${pctU(v25.weeklyStdPct, 2)} in 2025 to ${pctU(v26.weeklyStdPct, 2)} in 2026, a moderate change that describes the dispersion of returns rather than their predictability, and the 2026 figure ends at the cutoff.`,
      `Os turning points descrevem a forma do cycle; volatility e autocorrelation descrevem a textura dos movimentos semanais dentro dele e, em conjunto, indicam se o processo tem alguma memória além do calendário. Para evitar a suavização introduzida pelas weekly medians, essas medidas usam a última quote de cada semana. O standard deviation das variações semanais das Sell Offers de ${bench} ${v26.weeklyStdPct < v25.weeklyStdPct ? 'caiu' : 'subiu'} de ${pctU(v25.weeklyStdPct, 2)} em 2025 para ${pctU(v26.weeklyStdPct, 2)} em 2026, uma mudança moderada que descreve a dispersão dos returns, e não sua previsibilidade, e o valor de 2026 termina no cutoff.`)}
    </div>
    <div class="evidence-stack"><div id="card-vol-year"></div></div>
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The autocorrelation of weekly log changes at lag ${tex('k')}, ${tex(String.raw`\rho_k = \operatorname{corr}(\Delta \ln P_t,\, \Delta \ln P_{t-k})`)}, is ${fmt(acf[0].rWeeklyMedian, 2)} at the first lag in Sell Offers and ${fmt(mob.acf[0].rWeeklyMedian, 2)} in Buy Offers when computed on weekly medians, but much of it is manufactured by the median itself and by the annual cycle. Once one point per week is used and the annual cycle is removed, ${acfAboveBand.length ? `${nw(acfAboveBand.length)} of the first four lags in Sell Offers exceed${acfAboveBand.length === 1 ? 's' : ''}` : 'none of the first four lags in Sell Offers exceeds'} the white-noise reference band of ±${fmt(mo.band, 2)} (1.96/√n), which is distinct from the simulated range for a random walk observed with quote noise.`,
      `A autocorrelation das variações semanais em log no lag ${tex('k')}, ${tex(String.raw`\rho_k = \operatorname{corr}(\Delta \ln P_t,\, \Delta \ln P_{t-k})`)}, é ${fmt(acf[0].rWeeklyMedian, 2)} no primeiro lag em Sell Offers e ${fmt(mob.acf[0].rWeeklyMedian, 2)} em Buy Offers quando calculada sobre weekly medians, mas boa parte dela é produzida pela própria median e pelo cycle anual. Quando se usa um ponto por semana e se remove o cycle anual, ${acfAboveBand.length ? `${nw(acfAboveBand.length)} dos quatro primeiros lags em Sell Offers ${acfAboveBand.length === 1 ? 'excede' : 'excedem'}` : 'nenhum dos quatro primeiros lags em Sell Offers excede'} a noise band de referência de ±${fmt(mo.band, 2)} (1,96/√n), calculada sob white noise e distinta do intervalo simulado para um random walk observado com ruído de quote.`)}
    ${para(`Forward returns lead to the same conclusion. In the ${fmt(strongUp.n)} weeks that followed the strongest 20% of four-week rises, the median change over the next four weeks was ${sgn(strongUp.medianFwdPct)}, against ${sgn(allW.medianFwdPct)} across all weeks; yet ${epi(strongUp.episodeRanges)[0]} of the ${strongUp.episodes} episodes began between July and October, when seasonal rises are common, and once the expected seasonal move is subtracted the median falls to ${sgn(strongUp.seasonAdjMedianFwdPct)}. Comparing de-clustered episodes, at least 21 days apart, with all other weeks in a Mann-Whitney test gives p = ${fmt(pS, 2)} in Sell Offers and ${fmt(pB, 2)} in Buy Offers,${note('mann1947')} so the evidence of persistence beyond seasonality is ${persistence === 'both' ? 'present on both sides, though it rests on few episodes' : persistence === 'one' ? `mixed, significant on one side only and resting on few episodes` : 'absent'}. At the cutoff, ${bench}'s Sell Offers had moved ${sgn(mo.anchorPast4Pct)} over the four weeks since the week of ${longDate(mo.anchorRefWeek)}, ${mo.anchorPast4Pct > mo.thresholdUpPct ? 'above' : 'below'} the ${sgn(mo.thresholdUpPct)} threshold that defines the strongest 20% of four-week rises; the current moment ${mo.anchorPast4Pct > mo.thresholdUpPct ? 'therefore belongs to the strong-rise episodes whose excess forward return was largely seasonal' : 'therefore lies outside the strong-rise episodes'}.`,
      `Os forward returns levam à mesma conclusão. Nas ${fmt(strongUp.n)} semanas que se seguiram aos 20% mais fortes das altas de quatro semanas, a median da variação nas quatro semanas seguintes foi ${sgn(strongUp.medianFwdPct)}, ante ${sgn(allW.medianFwdPct)} no conjunto das semanas; contudo, ${epi(strongUp.episodeRanges)[0]} dos ${strongUp.episodes} episódios começaram entre julho e outubro, quando a seasonality costuma produzir altas, e, subtraído o movimento seasonal esperado, a median cai para ${sgn(strongUp.seasonAdjMedianFwdPct)}. A comparação de episódios espaçados, com pelo menos 21 dias entre si, com as demais semanas, em um teste de Mann-Whitney, resulta em p = ${fmt(pS, 2)} em Sell Offers e ${fmt(pB, 2)} em Buy Offers,${note('mann1947')} de modo que a evidência de persistence além da seasonality é ${persistence === 'both' ? 'presente nos dois lados, embora apoiada em poucos episódios' : persistence === 'one' ? 'mista, significativa em apenas um lado e apoiada em poucos episódios' : 'inexistente'}. No cutoff, as Sell Offers de ${bench} haviam variado ${sgn(mo.anchorPast4Pct)} nas quatro semanas desde a semana de ${longDate(mo.anchorRefWeek)}, ${mo.anchorPast4Pct > mo.thresholdUpPct ? 'acima' : 'abaixo'} do threshold de ${sgn(mo.thresholdUpPct)} que define os 20% mais fortes das altas de quatro semanas; o momento atual ${mo.anchorPast4Pct > mo.thresholdUpPct ? 'pertence, portanto, aos episódios de alta forte cujo excesso de forward return foi em grande parte seasonal' : 'está, portanto, fora dos episódios de alta forte'}.`)}
    </div>
    <div class="evidence-stack"><div id="card-acf"></div></div>
    </div>
    <div id="card-cond"></div>
    <div class="prose narrative-grid">
    ${para(`Taken together, the temporal evidence describes a process with three properties that a model must reproduce: a level that drifts ${trendLo > 0 ? 'upward' : trendHi < 0 ? 'downward' : 'without a clear direction'} across years, an annual cycle whose timing is stable but whose amplitude has narrowed, and weekly movements that ${persistence === 'both' ? 'retain some persistence beyond the calendar, on few episodes' : 'show little persistence once the calendar is removed'}. The recent rise departs from history in level but not in timing, which is precisely the combination a model with a drifting level and a seasonal component would be expected to capture. The same evidence also sets a discipline for the modelling that follows: because persistence ${persistence === 'both' ? 'weakens' : 'largely disappears'} after seasonal adjustment, additional dynamic structure should be retained only if it improves forecasts out of sample.`,
      `Em conjunto, a evidência temporal descreve um processo com três propriedades que um modelo deve reproduzir: um price level que se desloca ${trendLo > 0 ? 'para cima' : trendHi < 0 ? 'para baixo' : 'sem direção clara'} entre anos, um cycle anual cujo timing é estável, mas cuja amplitude se estreitou, e movimentos semanais ${persistence === 'both' ? 'que conservam alguma persistence além do calendário, em poucos episódios' : 'com pouca persistence depois de removido o calendário'}. A alta recente se afasta do histórico em nível, mas não em timing, que é exatamente a combinação que um modelo com price level em deslocamento e componente seasonal deveria capturar. A mesma evidência impõe uma disciplina à modelagem seguinte: como a persistence ${persistence === 'both' ? 'se enfraquece' : 'desaparece em grande parte'} após o ajuste seasonal, estrutura dinâmica adicional só deve ser mantida se melhorar os forecasts out of sample.`)}
    </div>
  </section>`,
  modeling: `
  <section class="block" id="modeling">
    ${sectionHeading('modeling')}
    <div class="prose narrative-grid">
    ${para(`Each property established in ${chapterRef('s03')} suggests a different forecasting hypothesis, and the modelling strategy consists in stating these hypotheses as competing specifications that can be tested against one another, rather than in selecting the most elaborate one in advance. Every specification is fitted to the logarithm of ${bench}'s weekly medians, separately for Sell Offers and Buy Offers, and uses only the information available at each forecast origin ${tex('T')}; forecasts for horizon ${tex('h')} are anchored on the latest valid quote ${tex('P_T')}.`,
      `Cada propriedade estabelecida na ${chapterRef('s03')} sugere uma hipótese de forecast diferente, e a estratégia de modelagem consiste em formular essas hipóteses como especificações concorrentes, que podem ser testadas umas contra as outras, em vez de escolher de antemão a mais elaborada. Cada especificação é ajustada ao logaritmo das weekly medians de ${bench}, separadamente para Sell Offers e Buy Offers, e usa apenas a informação disponível em cada forecast origin ${tex('T')}; os forecasts para o horizon ${tex('h')} partem da quote válida mais recente, ${tex('P_T')}, como anchor.`)}
    ${para(`The Constant model, ${tex(String.raw`\hat P_{T+h} = P_T`)}, embodies the finding that weekly changes show little persistence: if the price behaves like a random walk, the latest quote is the best available forecast, and any richer specification must beat it to justify its complexity. The Seasonal Naive model repeats the change observed 52 weeks earlier,`,
      `O modelo Constant, ${tex(String.raw`\hat P_{T+h} = P_T`)}, traduz o resultado de que as variações semanais têm pouca persistence: se o price se comporta como um random walk, a quote mais recente é o melhor forecast disponível, e qualquer especificação mais rica precisa superá-la para justificar sua complexidade. O modelo Seasonal Naive repete a variação observada 52 semanas antes,`)}
    ${math(String.raw`\ln \hat P_{T+h} = \ln P_T + \left(\ln P_{T+h-52} - \ln P_{T-52}\right),`)}
    ${para(`where each lagged value is the nearest observation within ten days inside the training sample. It follows from the stable timing of peaks and troughs, and its weakness follows from the same evidence, since it transmits last year's amplitude unchanged although amplitudes have narrowed. The Harmonic model estimates, by least squares on up to 130 weeks before the origin, a linear trend and two pairs of annual harmonics, with ${tex('t')} measured in years:`,
      `em que cada valor no lag de 52 semanas é a observação mais próxima, em até dez dias, dentro da training sample. Ele decorre do timing estável de peaks e troughs, e sua fragilidade decorre da mesma evidência, pois transmite sem alteração a amplitude do ano anterior, embora as amplitudes tenham se estreitado. O modelo Harmonic estima, por least squares em até 130 semanas antes da origin, uma trend linear e dois pares de harmonics anuais, com ${tex('t')} medido em anos:`)}
    ${math(String.raw`\ln P_t = \beta_0 + \beta_1 t + \sum_{k=1}^{2}\left[a_k \sin(2\pi k t) + b_k \cos(2\pi k t)\right] + \varepsilon_t, \qquad \ln \hat P_{T+h} = \ln P_T + \left(x_{T+h} - x_T\right)^{\prime}\hat\beta .`)}
    ${para(`It reflects both the drift of the level and a smooth annual cycle whose shape is estimated rather than copied. The base scenario combines the three forecasts as a geometric mean with equal weights, fixed before any evaluation, ${tex(String.raw`\hat P^{E}_{T+h} = \exp\big(\tfrac{1}{K}\sum_{k} \ln \hat P^{(k)}_{T+h}\big)`)}, and surrounds it with a heuristic stress band ${tex(String.raw`\hat P^{E}_{T+h}\, e^{\pm \sigma_h}`)}, where`,
      `Ele reflete tanto o deslocamento do price level quanto um cycle anual suave, cuja forma é estimada em vez de copiada. O base scenario combina os três forecasts em uma geometric mean com pesos iguais, fixados antes de qualquer avaliação, ${tex(String.raw`\hat P^{E}_{T+h} = \exp\big(\tfrac{1}{K}\sum_{k} \ln \hat P^{(k)}_{T+h}\big)`)}, e o envolve em uma heuristic stress band ${tex(String.raw`\hat P^{E}_{T+h}\, e^{\pm \sigma_h}`)}, em que`)}
    ${math(String.raw`\sigma_h = \max\left\{ q_{0.8}\big(|e_{h'}|\big),\; \max_k \left|\ln \frac{\hat P^{(k)}_{T+h}}{\hat P^{E}_{T+h}}\right| \right\}`)}
    ${para(`and ${tex(String.raw`q_{0.8}(|e_{h'}|)`)} is the 80th percentile of the ensemble's absolute log errors at the tested horizon ${tex("h'")} nearest to ${tex('h')}. The band therefore combines historical error with disagreement between the models; it is a construction rule, not a calibrated quantile, and it does not represent the uncertainty of a merger.`,
      `e ${tex(String.raw`q_{0.8}(|e_{h'}|)`)} é o 80º percentile dos erros absolutos em log do ensemble no horizon testado ${tex("h'")} mais próximo de ${tex('h')}. A band combina, portanto, o erro histórico com a divergência entre os modelos; é uma regra de construção, e não um quantile calibrado, e não representa a incerteza de uma merger.`)}
    ${para(`Validation later finds that the simpler combination of Constant and Seasonal Naive (C+S) ${csLower.length === IND.length ? 'has scored a lower error than the full ensemble at every tested horizon on both sides' : `has scored a lower error than the full ensemble in ${nw(csLower.length)} of ${nw(IND.length)} combinations of horizon and side`}, but adopting the specification that scored best on the same history would turn the backtest into a selection step. C+S+H therefore remains the published ensemble, and C+S is kept beside it as a registered challenger. From this edition, both are frozen at every research cutoff, together with the simulated distribution and the world transfers, in an append-only forecast ledger that records the data cutoff, the anchor and the SHA-256 of every program and input; once a target week closes, its realized weekly median and the error of every model are appended, and no line is ever rewritten. The comparison between the two specifications thus accumulates evidence that no later choice can revise.`,
      `A validação mostra depois que a combinação mais simples de Constant e Seasonal Naive (C+S) ${csLower.length === IND.length ? 'teve erro menor do que o ensemble completo em todos os horizons testados, nos dois lados' : `teve erro menor do que o ensemble completo em ${nw(csLower.length, true)} das ${nw(IND.length, true)} combinações de horizon e lado`}, mas adotar a especificação que pontuou melhor no mesmo histórico transformaria o backtest em uma etapa de seleção. O C+S+H continua, por isso, como o ensemble publicado, e o C+S é mantido ao lado dele como challenger registrado. A partir desta edição, ambos são congelados em cada cutoff da pesquisa, com a distribution simulada e as transferências para os worlds, em um forecast ledger que só aceita acréscimos e registra o cutoff dos dados, a anchor e o SHA-256 de cada programa e entrada; quando uma semana-alvo se encerra, a weekly median realizada e o erro de cada modelo são acrescentados, e nenhuma linha é reescrita. A comparação entre as duas especificações acumula, assim, evidência que nenhuma escolha posterior pode revisar.`)}
    ${para(`Because an equal-weight ensemble yields a path but not a distribution, a fourth specification adds stochastic dynamics to the harmonic structure. The ARIMA with harmonic components is a regression with ARIMA(1,1,0) errors,${note('hyndman2021')}`,
      `Como um ensemble de pesos iguais produz um path, mas não uma distribution, uma quarta especificação acrescenta dinâmica estocástica à estrutura harmonic. O ARIMA with harmonic components é uma regression com erros ARIMA(1,1,0),${note('hyndman2021')}`)}
    ${math(String.raw`\ln P_t = \beta_1 t + \sum_{k=1}^{2}\left[a_k \sin(2\pi k t) + b_k \cos(2\pi k t)\right] + u_t, \qquad (1 - \phi L)(1 - L)\, u_t = \varepsilon_t ,`)}
    ${para(`estimated by maximum likelihood with statsmodels on ${bench}'s weekly offers anchored on the capture of ${cutoffDay}.${note('seabold2010')} The simulation draws ${fmt(DRAWS)} parameter vectors from the estimated distribution and ${fmt(PER_DRAW)} paths for each, or ${fmt(PATHS)} paths per seed, under ${nw(P.spec.seeds.length)} seeds (${list(P.spec.seeds.map(String))}) that fix both the parameter draws and the shocks, for two training samples: one starting in the first valid week of 2023 and one starting on ${longDate('2024-01-15')}, as in the research package. The autoregressive term is not justified by the autocorrelation evidence, which is weak; it is there to carry parameter and shock uncertainty into model-implied probabilities, and whether it earns that role is a question for validation.`,
      `estimada por maximum likelihood com statsmodels sobre as offers semanais de ${bench}, com anchor na captura de ${cutoffDay}.${note('seabold2010')} A simulation sorteia ${fmt(DRAWS)} vetores de parâmetros da distribution estimada e ${fmt(PER_DRAW)} paths para cada um, ou ${fmt(PATHS)} paths por seed, sob ${nw(P.spec.seeds.length, true)} seeds (${list(P.spec.seeds.map(String))}) que fixam tanto os parameter draws quanto os choques, para duas training samples: uma iniciada na primeira semana válida de 2023 e outra iniciada em ${longDate('2024-01-15')}, como no pacote de pesquisa. O termo autorregressivo não é justificado pela evidência de autocorrelation, que é fraca; ele está ali para levar a incerteza de parâmetros e de choques às model-implied probabilities, e se ele merece esse papel é uma questão para a validação.`)}
    ${para(`Other worlds are not modelled independently. The scenario of world ${tex('w')} applies to its own anchor the proportional movement of the same side of ${bench} since the local reference date,`,
      `Os demais worlds não são modelados de forma independente. O scenario do world ${tex('w')} aplica à sua própria anchor o movimento proporcional do mesmo lado de ${bench} desde a data de referência local,`)}
    ${math(String.raw`\hat P^{w}_{T+h} = P^{w}_{\mathrm{ref}} \cdot \frac{\hat P^{A}_{T+h}}{P^{A}_{\mathrm{ref}}},`)}
    ${para(`and widens the band by the 80th percentile of absolute 13-week changes in the world's log premium over ${bench}, or by the dispersion of that premium when fewer than five such changes exist. The transfer therefore assumes stable relative value and estimates no independent seasonality for any world; a merger, a stale anchor or a level shift can invalidate it even when the benchmark is well described, which is why ${chapterRef('s05')} examines the assumption directly, including whether a slope estimated for each world improves on the one-to-one response the rule implies.`,
      `e alarga a band pelo 80º percentile das variações absolutas em 13 semanas do log premium do world sobre ${bench}, ou pela dispersão desse premium quando há menos de cinco dessas variações. A transferência pressupõe, portanto, relative value estável e não estima seasonality independente para nenhum world; uma merger, uma anchor defasada ou um level shift podem invalidá-la mesmo quando o benchmark está bem descrito, razão pela qual a ${chapterRef('s05')} examina essa hipótese diretamente, inclusive se uma inclinação estimada para cada world melhora a resposta de um para um que a regra implica.`)}
    ${para(`Two boundaries keep the modelling separate from what surrounds it. The monthly decomposition of ${chapterRef('s01')} is estimated on the full sample and never serves as an out-of-sample observation, since at each forecast origin the models see only the training sample available at that date; and fees and execution assumptions are applied only after prices have been estimated, in ${chapterRef('s08')}, so that no trading rule influences the estimation of the price process.`,
      `Duas fronteiras mantêm a modelagem separada do que a cerca. A decomposition mensal da ${chapterRef('s01')} é estimada com a sample completa e nunca serve de observação out of sample, pois, em cada forecast origin, os modelos veem apenas a training sample disponível naquela data; e fees e hipóteses de execution só são aplicadas depois da estimação dos prices, na ${chapterRef('s08')}, para que nenhuma regra de trading influencie a estimação do processo de price.`)}
    </div>
  </section>`,
  s06: `
  <section class="block" id="s06">
    ${sectionHeading('s06')}
    <div class="prose narrative-grid">
    ${para(`Validation must establish how much credibility each specification deserves before any of them is used to describe the future. Three properties are tested separately, because success on one does not imply success on the others: the accuracy of point forecasts, the coverage of forecast intervals and the calibration of probabilities.`,
      `A validação precisa estabelecer quanta credibilidade cada especificação merece antes que qualquer uma seja usada para descrever o futuro. Três propriedades são testadas separadamente, porque o sucesso em uma não implica sucesso nas demais: a acurácia dos point forecasts, a coverage dos intervalos de forecast e a calibration das probabilidades.`)}
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Point accuracy was first measured at quarterly forecast origins, at each of which every model is re-estimated on the data available at that date and scored against weekly medians actually observed ${tex('h')} weeks later, using the mean absolute percentage error`,
      `A acurácia pontual foi medida primeiro em forecast origins trimestrais, em cada uma das quais todos os modelos são reestimados com os dados disponíveis naquela data e comparados às weekly medians efetivamente observadas ${tex('h')} semanas depois, por meio do mean absolute percentage error`)}
    ${math(String.raw`\mathrm{MAPE}_h = \frac{100}{N_h}\sum_{i=1}^{N_h}\left|\frac{\hat P_{i,h}}{P_{i,h}} - 1\right| .`)}
    ${para(`In ${bench}'s Sell Offers, the ensemble records a MAPE of ${fmt(e13.ensemble, 2)}% at 13 weeks, against ${fmt(e13.constant, 2)}% for Constant, an observed reduction of ${pctU(quarterSkill13, 1)}, and across both sides and the 13-, 26- and 52-week horizons it ${ensembleWins.length === summaries.length ? 'beats Constant in every combination' : `beats Constant in ${ensembleWins.length} of ${summaries.length} combinations`}. Quarterly origins are few, however: ${nw(e13.n)} inform the 13-week comparison and ${nw(e52.n)} the 52-week one, too few to separate a persistent advantage from a favourable sample.`,
      `Nas Sell Offers de ${bench}, o ensemble registra MAPE de ${fmt(e13.ensemble, 2)}% em 13 semanas, ante ${fmt(e13.constant, 2)}% do Constant, uma redução observada de ${pctU(quarterSkill13, 1)}, e, considerando os dois lados e os horizons de 13, 26 e 52 semanas, ${ensembleWins.length === summaries.length ? 'supera o Constant em todas as combinações' : `supera o Constant em ${ensembleWins.length} de ${summaries.length} combinações`}. As origins trimestrais, porém, são poucas: ${nw(e13.n, true)} informam a comparação em 13 semanas e ${nw(e52.n, true)}, a de 52 semanas, poucas demais para separar uma vantagem persistente de uma sample favorável.`)}
    </div>
    <div class="evidence-stack">${card({evidence: 'backtested', title: `${bench}: Out-of-Sample Mean Error`, sub: t('Mean absolute percentage error (MAPE) at quarterly origins, %', 'Mean absolute percentage error (MAPE) em origins trimestrais, %'), body: table({columns: [num('horizon', 'Semanas'), {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, num('n', 'Origens'), num('constant', 'Constante', 2), num('seasonal', 'Sazonal', 2), num('harmonic', 'Harmônico', 2), num('ensemble', 'Conjunto', 2)], rows: summaries})})}</div>
    </div>
    <h3 id="rolling-validation" data-report-anchor>${t('Rolling Origins at Fixed Horizons', 'Origins móveis em horizons fixos')}</h3>
    <div class="prose narrative-grid">
    ${para(`Rolling origins supply more test points without changing the horizon. Every week in which ${bench} is quoted, once two years of history are available, becomes an origin; each model is re-estimated there and scored at exactly 13, 26 and 52 weeks, on the targets where all three components exist, so every model and every combination faces the same observations. Besides the MAPE, the evaluation reports the mean absolute error in gp, the symmetric MAPE, which weighs over- and under-prediction alike,${note('hyndman2006')} and the mean absolute log error, whose signed mean is the bias:`,
      `As origins móveis fornecem mais pontos de teste sem mudar o horizon. Cada semana em que ${bench} tem quote, depois de dois anos de histórico, torna-se uma origin; cada modelo é reestimado ali e avaliado em exatamente 13, 26 e 52 semanas, nos alvos em que os três componentes existem, de modo que todos os modelos e todas as combinações enfrentam as mesmas observações. Além do MAPE, a avaliação informa o mean absolute error em gp, o MAPE simétrico, que pesa igualmente erros para cima e para baixo,${note('hyndman2006')} e o mean absolute log error, cuja média com sinal é o bias:`)}
    ${math(String.raw`\mathrm{MAE}_h = \frac{1}{N_h}\sum_{i}\left|\hat P_{i,h} - P_{i,h}\right|, \qquad \mathrm{sMAPE}_h = \frac{100}{N_h}\sum_{i}\frac{2\left|\hat P_{i,h} - P_{i,h}\right|}{\hat P_{i,h} + P_{i,h}}, \qquad \mathrm{LE}_h = \frac{100}{N_h}\sum_{i}\left|\ln\frac{P_{i,h}}{\hat P_{i,h}}\right| .`)}
    ${para(`Forecast skill is the reduction in error against a benchmark, ${tex(String.raw`S_h = 1 - \mathrm{MAPE}^{\text{model}}_h / \mathrm{MAPE}^{\text{bench}}_h`)}, with Constant as the primary benchmark and the Seasonal Naive model as the secondary one. Consecutive origins share most of their target window, so the ${r13.n} origins at 13 weeks hold only ${nw(r13.windows)} non-overlapping windows. The uncertainty of each skill is therefore estimated with a circular block bootstrap that resamples runs of ${tex('h')} consecutive origins, preserving their overlap, in ${fmt(2000)} replicates that draw the same origins for the model and its benchmark;${note('kunsch1989', 'politis1992')} where fewer than two such blocks fit, as at 52 weeks, no interval is reported.`,
      `O forecast skill é a redução do erro ante um benchmark, ${tex(String.raw`S_h = 1 - \mathrm{MAPE}^{\text{model}}_h / \mathrm{MAPE}^{\text{bench}}_h`)}, com o Constant como benchmark principal e o modelo Seasonal Naive como secundário. Origins consecutivas compartilham quase toda a janela-alvo, de modo que as ${r13.n} origins de 13 semanas contêm apenas ${nw(r13.windows, true)} janelas sem sobreposição. A incerteza de cada skill é, por isso, estimada com um circular block bootstrap que reamostra sequências de ${tex('h')} origins consecutivas, preservando sua sobreposição, em ${fmt(2000)} réplicas que sorteiam as mesmas origins para o modelo e seu benchmark;${note('kunsch1989', 'politis1992')} onde não cabem dois desses blocos, como em 52 semanas, nenhum intervalo é informado.`)}
    </div>
    <div id="card-rolling"></div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Between the count of origins and the count of windows lies the number of effectively independent observations. For the difference ${tex('d_i')} between the absolute percentage errors of a model and of Constant at origin ${tex('i')}, whose overlap spans ${tex('h - 1')} origins, it is${note('neweywest1987', 'diebold1995')}`,
      `Entre a contagem de origins e a de janelas está o número de observações efetivamente independentes. Para a diferença ${tex('d_i')} entre os erros percentuais absolutos de um modelo e do Constant na origin ${tex('i')}, cuja sobreposição abrange ${tex('h - 1')} origins, ele é${note('neweywest1987', 'diebold1995')}`)}
    ${math(String.raw`n_{\text{eff}} = \frac{n\,\hat\gamma_0}{\hat\gamma_0 + 2\sum_{k=1}^{h-1}\left(1 - \frac{k}{h}\right)\hat\gamma_k},`)}
    ${para(`where ${tex(String.raw`\hat\gamma_k`)} is the autocovariance of ${tex('d_i')} at lag ${tex('k')}. In ${bench}'s Sell Offers, the ${fmt(i13.n)} weekly origins at 13 weeks carry the information of about ${fmt(i13.nEff, 0)} independent observations in ${nw(i13.windows)} non-overlapping windows, and the ${fmt(i26.n)} at 26 weeks about ${fmt(i26.nEff, 0)} in ${nw(i26.windows)}. At 52 weeks fewer than two blocks of ${tex('h')} origins exist, so the long-run variance cannot be estimated, and the ${fmt(i52.n)} origins amount to ${nw(i52.windows)} ${i52.windows === 1 ? 'window' : 'windows'}: whatever the 52-week backtest shows rests on a single year's movement. Every interval that follows should be read against these counts rather than against the number of origins.`,
      `em que ${tex(String.raw`\hat\gamma_k`)} é a autocovariância de ${tex('d_i')} na defasagem ${tex('k')}. Nas Sell Offers de ${bench}, as ${fmt(i13.n)} origins semanais de 13 semanas contêm a informação de cerca de ${fmt(i13.nEff, 0)} observações independentes em ${nw(i13.windows, true)} janelas sem sobreposição, e as ${fmt(i26.n)} de 26 semanas, cerca de ${fmt(i26.nEff, 0)} em ${nw(i26.windows, true)}. Em 52 semanas não há dois blocos de ${tex('h')} origins, de modo que a variância de longo prazo não pode ser estimada, e as ${fmt(i52.n)} origins equivalem a ${nw(i52.windows, true)} ${i52.windows === 1 ? 'janela' : 'janelas'}: o que quer que o backtest de 52 semanas mostre se apoia no movimento de um único ano. Cada intervalo a seguir deve ser lido contra essas contagens, e não contra o número de origins.`)}
    </div>
    <div class="evidence-stack"><div id="card-evidence"></div></div>
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Over ${r13.n} weekly origins, the ensemble's 13-week MAPE in Sell Offers is ${pctU(r13.ensemble, 2)} against ${pctU(r13.constant, 2)} for Constant, a skill of ${pctU(skill13.skill, 0)} with a 95% interval from ${pctU(skill13.skillLow, 0)} to ${pctU(skill13.skillHigh, 0)}; at 26 weeks the skill is ${pctU(skill26.skill, 0)} (${pctU(skill26.skillLow, 0)} to ${pctU(skill26.skillHigh, 0)}), and at 52 weeks, where ${fmt(skill52.n)} origins span ${nw(skill52.windows)} independent ${skill52.windows === 1 ? 'window' : 'windows'}, it is ${pctU(skill52.skill, 0)} without an interval. Against the Seasonal Naive model the skill is ${pctU(naive13.skill, 0)} at 13 weeks, an interval of ${pctU(naive13.skillLow, 0)} to ${pctU(naive13.skillHigh, 0)} that ${naive13.skillLow > 0 ? 'excludes' : 'includes'} zero, and ${pctU(naive26.skill, 0)} at 26 weeks (${pctU(naive26.skillLow, 0)} to ${pctU(naive26.skillHigh, 0)}). The quarterly reduction of ${pctU(quarterSkill13, 0)} thus ${skill13.skill < quarterSkill13 ? 'shrinks' : 'holds'} to ${pctU(skill13.skill, 0)} with more origins, and ${skill13.skillLow > 0 ? (skill13.skillLow < 10 ? `its lower bound stays above zero only narrowly at 13 weeks: the ensemble's advantage over Constant is probable rather than proven` : 'its interval stays clear of zero at 13 weeks') : 'its interval includes zero at 13 weeks, so the advantage over Constant is not established'}.`,
      `Em ${r13.n} origins semanais, o MAPE do ensemble em 13 semanas nas Sell Offers é ${pctU(r13.ensemble, 2)}, ante ${pctU(r13.constant, 2)} do Constant, um skill de ${pctU(skill13.skill, 0)} com intervalo de 95% de ${pctU(skill13.skillLow, 0)} a ${pctU(skill13.skillHigh, 0)}; em 26 semanas o skill é ${pctU(skill26.skill, 0)} (${pctU(skill26.skillLow, 0)} a ${pctU(skill26.skillHigh, 0)}), e em 52 semanas, em que ${fmt(skill52.n)} origins cobrem ${nw(skill52.windows, true)} ${skill52.windows === 1 ? 'janela independente' : 'janelas independentes'}, é ${pctU(skill52.skill, 0)}, sem intervalo. Ante o modelo Seasonal Naive, o skill é ${pctU(naive13.skill, 0)} em 13 semanas, com intervalo de ${pctU(naive13.skillLow, 0)} a ${pctU(naive13.skillHigh, 0)} que ${naive13.skillLow > 0 ? 'exclui' : 'inclui'} zero, e ${pctU(naive26.skill, 0)} em 26 semanas (${pctU(naive26.skillLow, 0)} a ${pctU(naive26.skillHigh, 0)}). A redução trimestral de ${pctU(quarterSkill13, 0)} ${skill13.skill < quarterSkill13 ? 'recua' : 'se mantém'}, portanto, em ${pctU(skill13.skill, 0)} com mais origins, e ${skill13.skillLow > 0 ? (skill13.skillLow < 10 ? 'seu limite inferior fica acima de zero por pouco em 13 semanas: a vantagem do ensemble sobre o Constant é provável, não demonstrada' : 'seu intervalo fica longe de zero em 13 semanas') : 'seu intervalo inclui zero em 13 semanas, de modo que a vantagem sobre o Constant não está estabelecida'}.`)}
    </div>
    <div class="evidence-stack"><div id="card-skill"></div></div>
    </div>
    <h3>${t('Where the Ensemble\'s Gain Comes From', 'De onde vem o ganho do ensemble')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The ablation scores every combination of the three components on the same origins. Because Constant forecasts no change, adding it to a combination shrinks the others' predicted change toward zero: Constant with Seasonal halves last year's change, and the full ensemble applies two thirds of the mean of the Seasonal and Harmonic changes. In ${bench}'s Sell Offers, the lowest 13-week error belongs to ${modelName(best13.model)} (${pctU(best13.mape, 2)}), against ${pctU(r13.ensemble, 2)} for the full ensemble, ${pctU(abl('ask', 13, 'S+H').mape, 2)} for Seasonal and Harmonic without Constant and ${pctU(rollMetric('ask', 13, 'Sazonal 52 semanas').mape, 2)} for the Seasonal Naive model alone; at 26 weeks the lowest is ${modelName(best26.model)} (${pctU(best26.mape, 2)}), and at 52 weeks ${modelName(best52.model)} (${pctU(best52.mape, 2)}). The gain at one or two quarters therefore comes mainly from combining the seasonal signal with a no-change forecast, that is, from shrinking last year's movement, rather than from diversification across three distinct models, and the Harmonic component adds little there. The skill intervals of these combinations overlap, and the ensemble keeps the weights fixed before evaluation, because choosing the best combination after seeing these results would overstate its out-of-sample performance.`,
      `A ablação avalia todas as combinações dos três componentes nas mesmas origins. Como o Constant não prevê variação, somá-lo a uma combinação encolhe em direção a zero a variação prevista pelos demais: Constant com Seasonal reduz à metade a variação do ano anterior, e o ensemble completo aplica dois terços da média das variações Seasonal e Harmonic. Nas Sell Offers de ${bench}, o menor erro em 13 semanas pertence a ${modelName(best13.model)} (${pctU(best13.mape, 2)}), ante ${pctU(r13.ensemble, 2)} do ensemble completo, ${pctU(abl('ask', 13, 'S+H').mape, 2)} de Seasonal com Harmonic sem Constant e ${pctU(rollMetric('ask', 13, 'Sazonal 52 semanas').mape, 2)} do modelo Seasonal Naive isolado; em 26 semanas o menor é ${modelName(best26.model)} (${pctU(best26.mape, 2)}), e em 52 semanas, ${modelName(best52.model)} (${pctU(best52.mape, 2)}). O ganho em um ou dois trimestres vem, portanto, sobretudo de combinar o sinal seasonal com um forecast sem variação, isto é, de encolher o movimento do ano anterior, e não da diversificação entre três modelos distintos, e o componente Harmonic pouco acrescenta nesses horizons. Os intervalos de skill dessas combinações se sobrepõem, e o ensemble mantém os pesos fixados antes da avaliação, porque escolher a melhor combinação depois de ver estes resultados superestimaria seu desempenho out of sample.`)}
    </div>
    <div class="evidence-stack"><div id="card-ablation"></div></div>
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The ablation also bears on which ensemble to publish. Paired on the same resampled origins, C+S has the lower MAPE in ${nw(csLower.length)} of the ${nw(IND.length)} combinations of horizon and side${csLower.length ? `, by ${fmt(Math.min(...csLower.map(x => -x.diffPp)), 2)} to ${fmt(Math.max(...csLower.map(x => -x.diffPp)), 2)} pp` : ''}, but the 95% interval of the difference lies wholly below zero only ${csSig.length ? `in ${list(csSig.map(x => `${SIDES[x.side]} at ${x.horizon} weeks`))}` : 'in no combination'}${csSigWorse.length ? `, wholly above it in ${list(csSigWorse.map(x => `${SIDES[x.side]} at ${x.horizon} weeks`))}` : ''}, and at 52 weeks no interval exists. A consistent but small advantage, largely within sampling error and measured on the same history that suggested it, does not justify replacing the ensemble fixed before evaluation; it is instead the first comparison the prospective ledger will settle.`,
      `A ablação também informa qual ensemble publicar. Pareado nas mesmas origins reamostradas, o C+S tem MAPE menor em ${nw(csLower.length, true)} das ${nw(IND.length, true)} combinações de horizon e lado${csLower.length ? `, por ${fmt(Math.min(...csLower.map(x => -x.diffPp)), 2)} a ${fmt(Math.max(...csLower.map(x => -x.diffPp)), 2)} pp` : ''}, mas o intervalo de 95% da diferença fica inteiramente abaixo de zero apenas ${csSig.length ? `em ${list(csSig.map(x => `${SIDES[x.side]} em ${x.horizon} semanas`))}` : 'em nenhuma combinação'}${csSigWorse.length ? `, inteiramente acima em ${list(csSigWorse.map(x => `${SIDES[x.side]} em ${x.horizon} semanas`))}` : ''}, e em 52 semanas não há intervalo. Uma vantagem consistente, mas pequena, em grande parte dentro do erro amostral e medida no mesmo histórico que a sugeriu, não justifica substituir o ensemble fixado antes da avaliação; é, em vez disso, a primeira comparação que o forecast ledger prospectivo vai decidir.`)}
    </div>
    <div class="evidence-stack"><div id="card-challenger"></div></div>
    </div>
    <h3>${t('Interval Coverage and Probabilistic Calibration', 'Interval coverage e calibration probabilística')}</h3>
    <div class="prose narrative-grid">
    ${para(`The ARIMA with harmonic components is evaluated in fortnightly backtests with origins from ${longDate(c13.firstOrigin)} to ${longDate(cal('ask', 4).lastOrigin)}, each re-estimated on the data then available. Across both sides and all horizons, its central 80% interval contained between ${pctU(Math.min(...c80) * 100, 0)} and ${pctU(Math.max(...c80) * 100, 0)} of the observed values, and its central 50% interval between ${pctU(Math.min(...c50) * 100, 0)} and ${pctU(Math.max(...c50) * 100, 0)}, so observed coverage is ${c80.every(v => v >= .8) && c50.every(v => v >= .5) ? 'at or above nominal at every tested horizon, a sign of conservative intervals' : 'below nominal in some tests'}, although at 52 weeks the ${c52.n} origins span a single season. Directional probabilities are scored with the Brier score,${note('brier1950')}`,
      `O ARIMA with harmonic components é avaliado em backtests quinzenais com origins de ${longDate(c13.firstOrigin)} a ${longDate(cal('ask', 4).lastOrigin)}, cada uma reestimada com os dados então disponíveis. Considerando os dois lados e todos os horizons, seu intervalo central de 80% conteve entre ${pctU(Math.min(...c80) * 100, 0)} e ${pctU(Math.max(...c80) * 100, 0)} dos valores observados, e o de 50%, entre ${pctU(Math.min(...c50) * 100, 0)} e ${pctU(Math.max(...c50) * 100, 0)}, de modo que a coverage observada ${c80.every(v => v >= .8) && c50.every(v => v >= .5) ? 'atinge ou supera a nominal em todos os horizons testados, sinal de intervalos conservadores' : 'fica abaixo da nominal em alguns testes'}, embora em 52 semanas as ${c52.n} origins abranjam uma única temporada. As probabilities direcionais são avaliadas pelo Brier score,${note('brier1950')}`)}
    ${math(String.raw`\mathrm{BS} = \frac{1}{N}\sum_{i=1}^{N}\left(p_i - o_i\right)^2 ,`)}
    ${para(`where ${tex('p_i')} is the model's probability of a rise and ${tex('o_i')} equals one when a rise occurred and zero otherwise. At 13 weeks the model scores ${fmt(c13.brier, 2)} in Sell Offers and ${fmt(c13b.brier, 2)} in Buy Offers, ${seasonalBeatsModel ? 'worse than' : 'against'} the ${fmt(c13.brierSeasonal, 2)} and ${fmt(c13b.brierSeasonal, 2)} of a rule that repeats the direction of the same window a year earlier. Because only the model trained since 2023 has this backtest, its probabilities can rank scenarios but cannot be read as demonstrated frequencies of success.`,
      `em que ${tex('p_i')} é a probability de alta atribuída pelo modelo e ${tex('o_i')} vale um quando houve alta e zero caso contrário. Em 13 semanas, o modelo obtém ${fmt(c13.brier, 2)} em Sell Offers e ${fmt(c13b.brier, 2)} em Buy Offers, ${seasonalBeatsModel ? 'pior do que' : 'ante'} os ${fmt(c13.brierSeasonal, 2)} e ${fmt(c13b.brierSeasonal, 2)} de uma regra que repete a direção da mesma janela um ano antes. Como apenas o modelo treinado desde 2023 dispõe desse backtest, suas probabilities podem ordenar scenarios, mas não podem ser lidas como frequências de sucesso demonstradas.`)}
    </div>
    <div id="card-calib"></div>
    <div class="prose narrative-grid">
    ${para(`Because the question this report answers is a probability, the calibration of the probability of a fall, one minus the probability of a rise, is examined directly. The Brier score decomposes into reliability, resolution and uncertainty,${note('murphy1973')} and a logistic regression of the outcome on the forecast's log-odds gives the calibration intercept ${tex('a')} and slope ${tex('b')}, which equal 0 and 1 for calibrated forecasts:${note('cox1958')}`,
      `Como a pergunta que este relatório responde é uma probabilidade, a calibration da probabilidade de queda, um menos a probabilidade de alta, é examinada diretamente. O Brier score se decompõe em reliability, resolution e uncertainty,${note('murphy1973')} e uma regressão logística do resultado sobre o log-odds do forecast fornece o intercepto ${tex('a')} e a inclinação ${tex('b')} de calibration, iguais a 0 e 1 para forecasts calibrados:${note('cox1958')}`)}
    ${math(String.raw`\mathrm{BS} = \underbrace{\sum_{k}\tfrac{n_k}{N}\left(\bar p_k - \bar o_k\right)^2}_{\text{reliability}} - \underbrace{\sum_{k}\tfrac{n_k}{N}\left(\bar o_k - \bar o\right)^2}_{\text{resolution}} + \underbrace{\bar o\left(1 - \bar o\right)}_{\text{uncertainty}}, \qquad \operatorname{logit}\Pr(o_i = 1) = a + b\,\operatorname{logit} p_i .`)}
    ${para(`Pooled across the four horizons, the ${pooled.n} fortnightly forecasts of a fall in Sell Offers averaged ${prob(pooled.meanP)}, while falls occurred in ${prob(pooled.freq)} of cases; the Brier score of ${fmt(pooled.brier, 3)} beats the ${fmt(pooled.uncertainty, 3)} of always forecasting the observed frequency because resolution (${fmt(pooled.resolution, 3)}) exceeds the reliability penalty (${fmt(pooled.reliability, 3)})${ok(pooled.slope) ? `, and the calibration line has intercept ${fmt(pooled.intercept, 2)} and slope ${fmt(pooled.slope, 2)}` : ''}. At 13 weeks the forecasts rank outcomes but sit ${cd13.meanP < cd13.freq ? 'too low' : 'too high'}, averaging ${prob(cd13.meanP)} against ${prob(cd13.freq)} of falls observed${ok(cd13.slope) ? `, with slope ${fmt(cd13.slope, 2)} and intercept ${fmt(cd13.intercept, 2)}` : ''}. At 52 weeks the ${cd52.n} forecasts cover a single season, so their calibration cannot be assessed. ${pooled.meanP < pooled.freq ? `The limitation carries into ${chapterRef('downside')}: if the bias of the backtest persisted, the model would understate the probability of a fall.` : `The limitation carries into ${chapterRef('downside')}: if the bias of the backtest persisted, the model would overstate the probability of a fall.`}`,
      `Somando os quatro horizons, os ${pooled.n} forecasts quinzenais de queda em Sell Offers tiveram média de ${prob(pooled.meanP)}, enquanto quedas ocorreram em ${prob(pooled.freq)} dos casos; o Brier score de ${fmt(pooled.brier, 3)} supera os ${fmt(pooled.uncertainty, 3)} de sempre prever a frequência observada porque a resolution (${fmt(pooled.resolution, 3)}) excede a penalidade de reliability (${fmt(pooled.reliability, 3)})${ok(pooled.slope) ? `, e a linha de calibration tem intercepto ${fmt(pooled.intercept, 2)} e inclinação ${fmt(pooled.slope, 2)}` : ''}. Em 13 semanas os forecasts ordenam os resultados, mas ficam ${cd13.meanP < cd13.freq ? 'baixos demais' : 'altos demais'}, com média de ${prob(cd13.meanP)} ante ${prob(cd13.freq)} de quedas observadas${ok(cd13.slope) ? `, inclinação ${fmt(cd13.slope, 2)} e intercepto ${fmt(cd13.intercept, 2)}` : ''}. Em 52 semanas os ${cd52.n} forecasts cobrem uma única temporada, de modo que sua calibration não pode ser avaliada. ${pooled.meanP < pooled.freq ? `A limitação se estende à ${chapterRef('downside')}: se o viés do backtest persistisse, o modelo subestimaria a probabilidade de queda.` : `A limitação se estende à ${chapterRef('downside')}: se o viés do backtest persistisse, o modelo superestimaria a probabilidade de queda.`}`)}
    </div>
    <div class="grid2"><div id="card-reliability"></div><div id="card-calib-stats"></div></div>
    ${frozen ? `<h3 id="prospective-record" data-report-anchor>${t('The Prospective Record', 'O registro prospectivo')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Every figure above is a backtest, scored on a history that was already known when the specifications were chosen. From the cutoff of ${longDate(LF[0].cutoff)}, the ledger described in ${chapterRef('modeling')} freezes each edition's forecasts before their targets exist: ${fmt(frozen.targets.length)} weekly targets for each of Constant, Seasonal Naive, Harmonic, C+S and C+S+H on both sides, the P10 to P90 of the simulated paths under both training windows, and the 13- and 26-week scenarios of ${fmt(new Set(frozen.worlds.map(w => w.world)).size)} worlds under the proportional, slope and drift transfer rules. The first target week closes on ${longDate(maturity(1))}, the first 13-week target on ${longDate(maturity(13))}, the first 26-week target on ${longDate(maturity(26))} and the first 52-week target on ${longDate(maturity(52))}; ${LO.length ? `${fmt(LO.length)} target ${LO.length === 1 ? 'week has' : 'weeks have'} been scored so far` : 'none has closed yet'}. Because the ledger only appends, and validation checks that every committed line is unchanged, the record it accumulates is prospective in the strict sense: no forecast in it can be revised once its outcome is known.`,
      `Todos os números acima são backtests, avaliados em um histórico já conhecido quando as especificações foram escolhidas. A partir do cutoff de ${longDate(LF[0].cutoff)}, o ledger descrito na ${chapterRef('modeling')} congela os forecasts de cada edição antes que seus alvos existam: ${fmt(frozen.targets.length)} alvos semanais para cada um de Constant, Seasonal Naive, Harmonic, C+S e C+S+H nos dois lados, o P10 a P90 dos paths simulados nas duas training windows e os scenarios de 13 e 26 semanas de ${fmt(new Set(frozen.worlds.map(w => w.world)).size)} worlds pelas regras de transferência proporcional, com inclinação e com drift. A primeira semana-alvo se encerra em ${longDate(maturity(1))}, o primeiro alvo de 13 semanas em ${longDate(maturity(13))}, o primeiro de 26 semanas em ${longDate(maturity(26))} e o primeiro de 52 semanas em ${longDate(maturity(52))}; ${LO.length ? `${fmt(LO.length)} ${LO.length === 1 ? 'semana-alvo foi avaliada' : 'semanas-alvo foram avaliadas'} até aqui` : 'nenhuma se encerrou ainda'}. Como o ledger só aceita acréscimos, e a validação confere que cada linha já registrada permanece inalterada, o registro que ele acumula é prospectivo em sentido estrito: nenhum forecast nele pode ser revisto depois que seu resultado é conhecido.`)}
    </div>
    <div class="evidence-stack"><div id="card-ledger"></div></div>
    </div>` : ''}
    <div class="prose narrative-grid">
    ${para(`The historical evidence therefore supports a qualified use of the models. Over many more origins than the quarterly test offered, the ensemble improves on Constant at 13 and 26 weeks${skill13.skillLow > 0 && skill26.skillLow > 0 ? ', with intervals that exclude zero' : ''}, mainly by shrinking the seasonal signal, whereas at the annual horizon the origins cover ${nw(skill52.windows)} independent ${skill52.windows === 1 ? 'window' : 'windows'} and cannot rank the specifications. The ARIMA with harmonic components ${c80.every(v => v >= .8) && c50.every(v => v >= .5) ? 'has conservative intervals' : 'has intervals below nominal coverage in some tests'} and probabilities of a fall that rank outcomes but ${pooled.meanP < pooled.freq ? 'have run too low' : 'have run too high'}; its results trained since 2024 remain a sensitivity analysis because no probabilistic backtest exists for them. None of this evidence is yet prospective; the ledger is where the published ensemble and its challenger will be scored on outcomes unknown when they were made. ${chapterRef('s02', true)} and ${chapterRef('downside')} use its probabilities with that calibration in view.`,
      `A evidência histórica sustenta, portanto, um uso qualificado dos modelos. Em muito mais origins do que o teste trimestral oferecia, o ensemble supera o Constant em 13 e 26 semanas${skill13.skillLow > 0 && skill26.skillLow > 0 ? ', com intervalos que excluem zero' : ''}, sobretudo por encolher o sinal seasonal, enquanto no horizon anual as origins cobrem ${nw(skill52.windows, true)} ${skill52.windows === 1 ? 'janela independente' : 'janelas independentes'} e não permitem ordenar as especificações. O ARIMA with harmonic components ${c80.every(v => v >= .8) && c50.every(v => v >= .5) ? 'tem intervalos conservadores' : 'tem intervalos abaixo da coverage nominal em alguns testes'} e probabilidades de queda que ordenam os resultados, mas ${pooled.meanP < pooled.freq ? 'têm ficado baixas demais' : 'têm ficado altas demais'}; seus resultados com treino desde 2024 permanecem uma análise de sensibilidade, pois não há backtest probabilístico para eles. Nenhuma dessa evidência é ainda prospectiva; é no ledger que o ensemble publicado e seu challenger serão avaliados em resultados desconhecidos quando os forecasts foram feitos. A ${chapterRef('s02')} e a ${chapterRef('downside')} usam essas probabilidades com essa calibration em vista.`)}
    </div>
  </section>`,
  s02: `
  <section class="block" id="s02">
    ${sectionHeading('s02')}
    <div class="prose narrative-grid">
    ${para(`Only after validation do we turn to the future, and three kinds of statement are kept apart: a forecast, a specification's estimate for a horizon that later observations can score, as in ${chapterRef('s06')}; a scenario, which places that forecast inside stated assumptions, here the anchor of ${cutoffDay}, weights fixed before evaluation and a heuristic stress band; and a simulation, whose many paths yield model-implied ranges and probabilities. None of them converts a historical regularity into a date for the next reversal.`,
      `Só depois da validação nos voltamos ao futuro, e três tipos de afirmação ficam separados: o forecast, estimativa de uma especificação para um horizon que observações posteriores podem avaliar, como na ${chapterRef('s06')}; o scenario, que insere esse forecast em hipóteses declaradas, aqui a anchor de ${cutoffDay}, pesos fixados antes da avaliação e uma heuristic stress band; e a simulation, cujos muitos paths fornecem intervalos e probabilidades model-implied. Nenhum deles converte uma regularidade histórica em uma data para a próxima reversal.`)}
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Anchored on the capture of ${cutoffDay} and applied to each side separately, the ensemble scenario for ${bench}'s Sell Offers is <strong>${price(nov.base)} gp/TC</strong> in ${monthYear(MILESTONES[0])} and <strong>${price(june.base)}</strong> in ${monthYear(MILESTONES[2])}, with heuristic stress bands from ${price(nov.low)} to ${price(nov.high)} and from ${price(june.low)} to ${price(june.high)}. The bands combine historical error with disagreement between the models, so <strong>they are neither P10 and P90 nor calibrated probability intervals</strong>.`,
      `Com anchor na captura de ${cutoffDay} e aplicado a cada lado separadamente, o ensemble scenario para as Sell Offers de ${bench} é <strong>${price(nov.base)} gp/TC</strong> em ${monthYear(MILESTONES[0])} e <strong>${price(june.base)}</strong> em ${monthYear(MILESTONES[2])}, com heuristic stress bands de ${price(nov.low)} a ${price(nov.high)} e de ${price(june.low)} a ${price(june.high)}. As bands combinam o erro histórico com a divergência entre os modelos, de modo que <strong>não são P10 e P90 nem intervalos de probabilidade calibrados</strong>.`)}
    ${para(`Two alternatives bound this central path. The registered challenger C+S, which omits the Harmonic component, gives ${price(csNov)} in ${monthYear(MILESTONES[0])} and ${price(csJun)} in ${monthYear(MILESTONES[2])}, so the two specifications disagree most about the ${Math.abs(csJun / june.base - 1) > Math.abs(csNov / nov.base - 1) ? `mid-year level, ${pctU(Math.abs(csJun / june.base - 1) * 100)} apart in ${monthYear(MILESTONES[2])}` : `late-year level, ${pctU(Math.abs(csNov / nov.base - 1) * 100)} apart in ${monthYear(MILESTONES[0])}`}. Anchoring instead on the median of ${bench}'s captures in the 72 hours up to the latest one, ${price(a72.ask)} rather than ${price(antica.ask)}, moves the ensemble to ${price(a72.askNov)} and ${price(a72.askJun)}, ${pctU(Math.abs(a72.askJun / june.base - 1) * 100)} ${a72.askJun < june.base ? 'lower' : 'higher'}, ${a72.askJun >= june.low && a72.askJun <= june.high ? 'well inside the stress band' : 'outside the stress band'}.`,
      `Duas alternativas delimitam esse path central. O challenger registrado C+S, que omite o componente Harmonic, dá ${price(csNov)} em ${monthYear(MILESTONES[0])} e ${price(csJun)} em ${monthYear(MILESTONES[2])}, de modo que as duas especificações divergem mais sobre o ${Math.abs(csJun / june.base - 1) > Math.abs(csNov / nov.base - 1) ? `nível de meio de ano, ${pctU(Math.abs(csJun / june.base - 1) * 100)} de distância em ${monthYear(MILESTONES[2])}` : `nível de fim de ano, ${pctU(Math.abs(csNov / nov.base - 1) * 100)} de distância em ${monthYear(MILESTONES[0])}`}. Ancorar, em vez disso, na median das capturas de ${bench} nas 72 horas até a mais recente, ${price(a72.ask)} em vez de ${price(antica.ask)}, leva o ensemble a ${price(a72.askNov)} e ${price(a72.askJun)}, ${pctU(Math.abs(a72.askJun / june.base - 1) * 100)} ${a72.askJun < june.base ? 'abaixo' : 'acima'}, ${a72.askJun >= june.low && a72.askJun <= june.high ? 'bem dentro da stress band' : 'fora da stress band'}.`)}
    </div>
    <div class="evidence-stack"><div id="card-model"></div></div>
    </div>
    <h3 id="s04" data-report-anchor>${t('Simulated Distributions and Peak Timing', 'Distributions simuladas e timing do peak')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The simulation of the ARIMA with harmonic components supplies the distribution the ensemble lacks. Trained since 2023, its median stays close to the scenario, ${price(f23n.p50)} against ${price(nov.base)} in ${monthYear(MILESTONES[0])} and ${price(f23j.p50)} against ${price(june.base)} in ${monthYear(MILESTONES[2])}, but its June P10 to P90 range, ${price(f23j.p10)} to ${price(f23j.p90)}, is ${f23j.p90 - f23j.p10 > june.high - june.low ? 'far wider than' : 'narrower than'} the stress band: the two construct uncertainty differently. Trained since 2024, the June median ${f24j.p50 < june.low ? 'falls below the band' : 'moves'} to ${price(f24j.p50)}, the window sensitivity that ${chapterRef('downside')} measures.`,
      `A simulation do ARIMA with harmonic components fornece a distribution que falta ao ensemble. Com treino desde 2023, sua median fica próxima do scenario, ${price(f23n.p50)} ante ${price(nov.base)} em ${monthYear(MILESTONES[0])} e ${price(f23j.p50)} ante ${price(june.base)} em ${monthYear(MILESTONES[2])}, mas seu intervalo de P10 a P90 para junho, de ${price(f23j.p10)} a ${price(f23j.p90)}, é ${f23j.p90 - f23j.p10 > june.high - june.low ? 'muito mais amplo do que' : 'mais estreito do que'} a stress band: os dois constroem a incerteza de modos distintos. Com treino desde 2024, a median de junho ${f24j.p50 < june.low ? 'cai abaixo da band' : 'passa'} para ${price(f24j.p50)}, a sensibilidade à janela que a ${chapterRef('downside')} mede.`)}
    ${para(`Peak timing is uncertain too. Taking each path's maximum up to ${longDate(peakBy)}, the peak comes in weeks starting up to October in ${prob(1 - m23.peakMonthShare.novDez - m23.peakMonthShare.janFev)} of paths, in November or December in ${prob(m23.peakMonthShare.novDez)} and in January or February in ${prob(m23.peakMonthShare.janFev)}, and ${prob(m23.peakOnEdge)} of paths peak in the first or last week of the window, where no turning point is identified. The probabilities read off these paths, and how far they move, are the subject of ${chapterRef('downside')}.`,
      `O timing do peak também é incerto. Tomando o máximo de cada path até ${longDate(peakBy)}, o peak ocorre em semanas iniciadas até outubro em ${prob(1 - m23.peakMonthShare.novDez - m23.peakMonthShare.janFev)} dos paths, em novembro ou dezembro em ${prob(m23.peakMonthShare.novDez)} e em janeiro ou fevereiro em ${prob(m23.peakMonthShare.janFev)}, e ${prob(m23.peakOnEdge)} dos paths atingem o máximo na primeira ou na última semana da janela, onde nenhum turning point é identificado. As probabilidades lidas nesses paths, e quanto elas variam, são o tema da ${chapterRef('downside')}.`)}
    </div>
    <div class="evidence-stack"><div id="card-fan"></div></div>
    </div>
    <div id="card-prob"></div>
    <div class="prose narrative-grid">
    ${para(`${capFirst(monthYear(MILESTONES[0]))} and ${monthYear(MILESTONES[2])} serve as comparison horizons rather than predicted turning points; scenarios for other worlds, truncated where a merger has been announced, follow the transfer rule of ${chapterRef('modeling')} and are examined in ${chapterRef('s05')}.`,
      `${capFirst(monthYear(MILESTONES[0]))} e ${monthYear(MILESTONES[2])} funcionam como horizons de comparação, e não como turning points previstos; os scenarios de outros worlds, interrompidos onde há merger anunciada, seguem a regra de transferência da ${chapterRef('modeling')} e são examinados na ${chapterRef('s05')}.`)}
    </div>
  </section>`,
  downside: `
  <section class="block" id="downside">
    ${sectionHeading('downside')}
    <div class="prose narrative-grid">
    ${para(`Whether the price will fall is two questions, and the answer must keep them apart. A fall after the peak is measured on each path from its own maximum, whereas a fall below today's price compares a future week with the capture of ${cutoffDay}; a path can fall far from its peak and still end above today's price, because the peak itself lies above it. Writing ${tex('P_0')} for today's price, ${tex(String.raw`\tau`)} for the week of each path's maximum up to ${longDate(peakBy)} and ${tex(String.raw`P_{\text{Nov}}`)} for its level in the week of ${longDate(weekStart(novWeek))}, the chapter reads three quantities off the ${fmt(PATHS)} simulated paths of ${chapterRef('s02')}:`,
      `Saber se o price vai cair envolve duas perguntas, e a resposta precisa separá-las. Uma queda depois do peak é medida em cada path a partir do próprio máximo, enquanto uma queda abaixo do price de hoje compara uma semana futura com a captura de ${cutoffDay}; um path pode cair muito a partir do peak e ainda terminar acima do price de hoje, porque o próprio peak está acima dele. Sendo ${tex('P_0')} o price de hoje, ${tex(String.raw`\tau`)} a semana do máximo de cada path até ${longDate(peakBy)} e ${tex(String.raw`P_{\text{Nov}}`)} seu nível na semana de ${longDate(weekStart(novWeek))}, o capítulo lê três quantidades nos ${fmt(PATHS)} paths simulados da ${chapterRef('s02')}:`)}
    ${math(String.raw`\Pr\left(P_t < P_0\right), \qquad \Pr\left(P_t < P_{\text{Nov}}\right), \qquad D = \min_{s \ge \tau} \frac{P_s}{P_\tau} - 1 .`)}
    ${para(`All three are model-implied. They inherit the specification of ${chapterRef('modeling')} and the calibration assessed in ${chapterRef('s06')}, where the simulated probability of a fall proved ${calBias(pooled, 'en')}, and they move with the training window, the specification and the starting capture, as the last part of this chapter measures.`,
      `As três são model-implied. Herdam a especificação da ${chapterRef('modeling')} e a calibration avaliada na ${chapterRef('s06')}, onde a probabilidade simulada de queda se mostrou ${calBias(pooled, 'pt')}, e variam com a training window, a especificação e a captura inicial, como a última parte deste capítulo mede.`)}
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Until the end of November the chance of trading below today's price stays at or below ${prob(preNov23)}, because most paths are still rising. It ${half23 ? `first reaches one half in the week of ${longDate(weekStart(half23))}` : 'never reaches one half'} and is highest, ${prob(max23.belowStart)}, in the week of ${longDate(weekStart(max23.date))}, before the next season's rise lowers it to ${prob(d23.curve.at(-1).belowStart)} by the end of the horizon. The chance of trading below the path's own level of late November is higher at every week, ${prob(m23.prob.jun28BelowNov30)} against ${prob(m23.prob.jun28BelowStart)} in the week of ${longDate(rebuyWeek)}, and the gap between the two curves reflects the rise most paths make before late November. Trained since 2024, the two probabilities for that week rise to ${prob(m24.prob.jun28BelowNov30)} and ${prob(m24.prob.jun28BelowStart)}.`,
      `Até o fim de novembro, a chance de negociar abaixo do price de hoje fica em no máximo ${prob(preNov23)}, porque a maioria dos paths ainda está subindo. Ela ${half23 ? `alcança metade pela primeira vez na semana de ${longDate(weekStart(half23))}` : 'nunca alcança metade'} e chega ao máximo, ${prob(max23.belowStart)}, na semana de ${longDate(weekStart(max23.date))}, antes que a alta da temporada seguinte a reduza a ${prob(d23.curve.at(-1).belowStart)} no fim do horizon. A chance de negociar abaixo do próprio nível do path no fim de novembro é maior em todas as semanas, ${prob(m23.prob.jun28BelowNov30)} ante ${prob(m23.prob.jun28BelowStart)} na semana de ${longDate(rebuyWeek)}, e a distância entre as duas curvas reflete a alta que a maioria dos paths faz antes do fim de novembro. Com treino desde 2024, as duas probabilidades dessa semana sobem para ${prob(m24.prob.jun28BelowNov30)} e ${prob(m24.prob.jun28BelowStart)}.`)}
    </div>
    <div class="evidence-stack"><div id="card-downside-curve"></div></div>
    </div>
    <h3>${t('How Large Could the Fall Be?', 'Qual pode ser o tamanho da queda?')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The size of the fall depends on its reference. From each path's own peak to its lowest later week, the median fall is ${pctU(-d23.fromPeak[2])} with training since 2023 and ${pctU(-d24.fromPeak[2])} since 2024, and falls larger than 5%, 10% and 15% occur in ${prob(fallAt(d23, 5).fromPeak)}, ${prob(fallAt(d23, 10).fromPeak)} and ${prob(fallAt(d23, 15).fromPeak)} of the paths trained since 2023. From the week of ${longDate(weekStart(novWeek))} to the week of ${longDate(rebuyWeek)} the median change is ${sgn(d23.junVsNov[2])}, and from today's price to the week of ${longDate(rebuyWeek)} it is ${sgn(d23.junVsStart[2])}, with P10 and P90 of ${sgn(d23.junVsStart[0])} and ${sgn(d23.junVsStart[4])}. The ${nw(declines.length)} complete declines observed so far measured ${list(declines.map(d => pctU(Math.abs(d.changePct))))}; a median fall of ${pctU(-d23.fromPeak[2])} would ${Math.abs(d23.fromPeak[2]) > Math.abs(declines.at(-1).changePct) ? 'exceed' : 'stay within'} the last of them, ${Math.abs(d23.fromPeak[2]) > Math.abs(declines.at(-1).changePct) ? 'so the model does not reproduce the narrowing of the declines' : 'in line with their narrowing'}.`,
      `O tamanho da queda depende da referência. Do próprio peak de cada path até sua semana mais baixa posterior, a queda mediana é de ${pctU(-d23.fromPeak[2])} com treino desde 2023 e de ${pctU(-d24.fromPeak[2])} desde 2024, e quedas maiores do que 5%, 10% e 15% ocorrem em ${prob(fallAt(d23, 5).fromPeak)}, ${prob(fallAt(d23, 10).fromPeak)} e ${prob(fallAt(d23, 15).fromPeak)} dos paths treinados desde 2023. Da semana de ${longDate(weekStart(novWeek))} à semana de ${longDate(rebuyWeek)}, a median da variação é ${sgn(d23.junVsNov[2])}, e do price de hoje à semana de ${longDate(rebuyWeek)} é ${sgn(d23.junVsStart[2])}, com P10 e P90 de ${sgn(d23.junVsStart[0])} e ${sgn(d23.junVsStart[4])}. As ${nw(declines.length, true)} quedas completas observadas até aqui mediram ${list(declines.map(d => pctU(Math.abs(d.changePct))))}; uma queda mediana de ${pctU(-d23.fromPeak[2])} ${Math.abs(d23.fromPeak[2]) > Math.abs(declines.at(-1).changePct) ? 'superaria' : 'ficaria dentro d'}a última delas, ${Math.abs(d23.fromPeak[2]) > Math.abs(declines.at(-1).changePct) ? 'de modo que o modelo não reproduz o estreitamento das quedas' : 'em linha com seu estreitamento'}.`)}
    </div>
    <div class="evidence-stack"><div id="card-downside-size"></div></div>
    </div>
    <h3>${t('Training Since 2023 versus Since 2024', 'Treino desde 2023 versus desde 2024')}</h3>
    <div class="prose narrative-grid">
    ${para(`The answer depends materially on the training window, so both are stated. With training since 2023, the week of ${longDate(rebuyWeek)} ends below today's price in ${prob(m23.prob.jun28BelowStart)} of paths and below the week of ${longDate(weekStart(novWeek))} in ${prob(m23.prob.jun28BelowNov30)}; since 2024, in ${prob(m24.prob.jun28BelowStart)} and ${prob(m24.prob.jun28BelowNov30)}. Starting the sample in January 2024 drops the first half of 2023, whose ${pctU(Math.abs(legsAsk[0].changePct), 0)} rise in what is usually a declining season flattened the fitted cycle, so the 2024 fit carries a deeper annual trough and ${fit24.driftPerYear < fitAsk.driftPerYear ? 'a lower' : 'a higher'} drift, ${sgn(Math.expm1(fit24.driftPerYear) * 100)} a year against ${sgn(Math.expm1(fitAsk.driftPerYear) * 100)}. Only the model trained since 2023 has a probabilistic backtest, and a deeper cycle runs against the narrowing of the observed declines, so the 2023 figures are the reference and the 2024 figures a sensitivity bound rather than an equally validated alternative.`,
      `A resposta depende materialmente da training window, e por isso as duas são apresentadas. Com treino desde 2023, a semana de ${longDate(rebuyWeek)} termina abaixo do price de hoje em ${prob(m23.prob.jun28BelowStart)} dos paths e abaixo da semana de ${longDate(weekStart(novWeek))} em ${prob(m23.prob.jun28BelowNov30)}; desde 2024, em ${prob(m24.prob.jun28BelowStart)} e ${prob(m24.prob.jun28BelowNov30)}. Iniciar a sample em janeiro de 2024 exclui o primeiro semestre de 2023, cuja alta de ${pctU(Math.abs(legsAsk[0].changePct), 0)} numa temporada normalmente de queda achatou o cycle estimado, de modo que o ajuste de 2024 traz um trough anual mais profundo e ${fit24.driftPerYear < fitAsk.driftPerYear ? 'um drift menor' : 'um drift maior'}, ${sgn(Math.expm1(fit24.driftPerYear) * 100)} ao ano ante ${sgn(Math.expm1(fitAsk.driftPerYear) * 100)}. Apenas o modelo treinado desde 2023 tem backtest probabilístico, e um cycle mais profundo contraria o estreitamento das quedas observadas, de modo que os números de 2023 são a referência e os de 2024, um limite de sensibilidade, não uma alternativa igualmente validada.`)}
    </div>
    <div id="card-downside-table"></div>
    <h3 id="sensitivity" data-report-anchor>${t('How Robust Are These Probabilities?', 'Quão robustas são essas probabilidades?')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Four sources of variation move the probabilities, and they differ by an order of magnitude. The seed moves them by at most ${seedGap} pp, which is simulation noise. The training window moves them by up to ${windowGap} pp; the specification, with moving-average errors, a second autoregressive lag, one annual harmonic instead of two or no drift, by up to ${specGap} pp; and the capture that starts the paths, among the ${nw(P.anchorSensitivity.length)} captures from ${captureWindow}, by up to ${spanPp(peakAnchor)} pp for a peak at least 3% above today's price. That probability, ${prob(m23.prob.peakAbove3)} from the capture of ${cutoffDay}, is therefore conditional on the specification and on the starting capture, not an unconditional probability. Probabilities that compare a path with itself, a fall from its peak or June against November, barely move with the capture, because a different start shifts the whole path. A single capture can also be thin, so the paths were restarted from the median of ${bench}'s captures in the 24 and 72 hours up to the latest one, with every threshold kept at today's executable prices: across the probabilities of this chapter and the economics of ${chaptersRef(['s08', 'decisions'])}, the change is at most ${fmt(aaMaxPp, 1)} pp and ${aaFlips.length ? `moves ${nw(new Set(aaFlips).size)} across one half` : 'reverses no answer'}. The 72-hour median, ${price(aa('72h').ask)}, lowers the chance of a peak at least 3% above today from ${prob(aa('latest').pPeakAbove3)} to ${prob(aa('72h').pPeakAbove3)}, because it starts the paths lower while the threshold stays where a player can trade.`,
      `Quatro fontes de variação movem as probabilidades, e elas diferem em uma ordem de grandeza. A seed as move no máximo ${seedGap} pp, o que é ruído de simulação. A training window as move até ${windowGap} pp; a especificação, com erros de média móvel, uma segunda defasagem autorregressiva, um harmônico anual em vez de dois ou sem drift, até ${specGap} pp; e a captura que inicia os paths, entre as ${nw(P.anchorSensitivity.length, true)} capturas de ${captureWindow}, até ${spanPp(peakAnchor)} pp para um peak pelo menos 3% acima do price de hoje. Essa probabilidade, ${prob(m23.prob.peakAbove3)} a partir da captura de ${cutoffDay}, é portanto condicional à especificação e à captura inicial, e não uma probabilidade incondicional. Probabilidades que comparam um path com ele mesmo, uma queda a partir do peak ou junho ante novembro, quase não se movem com a captura, porque outro ponto de partida desloca o path inteiro. Uma captura isolada também pode ser rasa, por isso os paths foram reiniciados a partir da median das capturas de ${bench} nas 24 e 72 horas até a mais recente, com cada threshold mantido nos prices executáveis de hoje: nas probabilidades deste capítulo e na economia das ${chaptersRef(['s08', 'decisions'])}, a mudança é de no máximo ${fmt(aaMaxPp, 1)} pp e ${aaFlips.length ? `leva ${nw(new Set(aaFlips).size, true)} a cruzar metade` : 'não reverte nenhuma resposta'}. A median de 72 horas, ${price(aa('72h').ask)}, reduz a chance de um peak pelo menos 3% acima de hoje de ${prob(aa('latest').pPeakAbove3)} para ${prob(aa('72h').pPeakAbove3)}, porque inicia os paths mais abaixo enquanto o threshold fica onde um jogador pode negociar.`)}
    </div>
    <div class="evidence-stack"><div id="card-tornado"></div></div>
    </div>
    <div id="card-anchor"></div>
    <div class="prose narrative-grid">
    ${para(`Will the price fall, then? Under the model validated in ${chapterRef('s06')}, a fall of more than 10% from the coming peak is ${fallAt(d23, 10).fromPeak >= .6 ? 'likely' : fallAt(d23, 10).fromPeak >= .4 ? 'about as likely as not' : 'unlikely'}, whereas a fall below today's price by the end of June is ${odds(m23.prob.jun28BelowStart) === 'even' ? 'close to even odds' : odds(m23.prob.jun28BelowStart) === 'favourable' ? 'more likely than not' : 'less likely than not'}; the difference between the two is the rise still expected before the peak. ${chapterRef('s08', true)} asks whether either fall is large enough to pay for the spread and the fee.`,
      `O price vai cair, então? Sob o modelo validado na ${chapterRef('s06')}, uma queda de mais de 10% a partir do próximo peak é ${fallAt(d23, 10).fromPeak >= .6 ? 'provável' : fallAt(d23, 10).fromPeak >= .4 ? 'tão provável quanto improvável' : 'improvável'}, enquanto uma queda abaixo do price de hoje até o fim de junho ${odds(m23.prob.jun28BelowStart) === 'even' ? 'tem chances próximas de metade' : odds(m23.prob.jun28BelowStart) === 'favourable' ? 'é mais provável do que não' : 'é menos provável do que não'}; a diferença entre as duas é a alta ainda esperada antes do peak. A ${chapterRef('s08')} pergunta se alguma das quedas é grande o bastante para pagar o spread e a fee.`)}
    </div>
  </section>`,
  s08: `
  <section class="block" id="s08">
    ${sectionHeading('s08')}
    <div class="prose narrative-grid">
    ${para(`Given the estimated process, what do market frictions do to an executable strategy? The preceding sections describe quotes, whereas a player's outcome depends on the side at which each leg is executed, on fees and on the Amount available at the best price. We therefore take the price process as given and examine the simplest strategy its seasonal pattern suggests for a player who already holds TC: sell them for gold near the late-year peak and buy them back near the mid-year trough, measuring success in TC rather than in gold.`,
      `Dado o processo estimado, o que as fricções de Market fazem com uma strategy executável? As seções anteriores descrevem quotes, ao passo que o resultado de um jogador depende do lado em que cada leg é executada, das fees e do Amount disponível no best price. Tomamos, por isso, o processo de price como dado e examinamos a strategy mais simples que seu padrão seasonal sugere para um jogador que já tem TC: vendê-las por gold perto do peak de fim de ano e recomprá-las perto do trough de meio de ano, medindo o sucesso em TC, e não em gold.`)}
    ${para(`Taking existing offers (taker execution), the player sells at the best Buy Offer and repurchases at the best Sell Offer; making offers instead (maker execution), the player sells with a Sell Offer and repurchases with a Buy Offer, paying the Create Offer fee ${tex('f')} on each placement. The gain in TC is therefore`,
      `Aceitando offers existentes (taker), o jogador vende na melhor Buy Offer e recompra na melhor Sell Offer; criando offers (maker), vende com uma Sell Offer e recompra com uma Buy Offer, pagando a fee ${tex('f')} de Create Offer em cada publicação. O gain em TC é, portanto,`)}
    ${math(String.raw`g^{\text{taker}} = \frac{P^{B}_{\text{sell}}}{P^{S}_{\text{rebuy}}} - 1, \qquad g^{\text{maker}} = \frac{(1 - f)\,P^{S}_{\text{sell}}}{(1 + f)\,P^{B}_{\text{rebuy}}} - 1, \qquad f = 2\%,`)}
    ${para(`where the fee amounts to 2% of the offer's price, with a minimum of 20 gp and a maximum of ${fmt(1000000)} gp, for offers that remain valid for 30 days.${note('manual')} The cap binds only above about ${fmt(C.fee.capBindsAboveTc)} TC at ${price(antica.ask)} gp/TC, and accepting an existing offer carries no fee. A created offer executes only if a counterparty accepts it, so it creates the possibility of a gain, not a passive profit.`,
      `em que a fee corresponde a 2% do price da offer, com mínimo de 20 gp e máximo de ${fmt(1000000)} gp, para offers válidas por 30 dias.${note('manual')} O teto só se aplica acima de cerca de ${fmt(C.fee.capBindsAboveTc)} TC a ${price(antica.ask)} gp/TC, e aceitar uma offer existente não tem fee. Uma offer criada só é executada se uma counterparty a aceitar, de modo que cria a possibilidade de um gain, e não um profit passivo.`)}
    </div>
    <h3 id="break-even" data-report-anchor>${t('How Far Must the Price Fall?', 'Quanto o price precisa cair?')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Both formulas imply a break-even: the highest repurchase quote at which the round trip returns at least a target gain ${tex('g')} in TC,`,
      `As duas fórmulas implicam um break-even: a maior quote de recompra com a qual o round trip devolve pelo menos um gain-alvo ${tex('g')} em TC,`)}
    ${math(String.raw`\bar P^{S}_{\text{rebuy}} = \frac{P^{B}_{\text{sell}}}{1 + g} \quad \text{(taker)}, \qquad \bar P^{B}_{\text{rebuy}} = \frac{(1 - f)\,P^{S}_{\text{sell}}}{(1 + f)(1 + g)} \quad \text{(maker)} .`)}
    ${para(`Selling at the capture of ${cutoffDay}, a taker receives ${price(antica.bid)} gp/TC and ends with more TC only if the Sell Offers fall below that level, ${pctU(Math.abs(beTaker.vsSellPct))} under today's ${price(antica.ask)}: a taker's break-even fall is the round-trip execution cost itself, and a gain of 5% or 10% in TC requires a fall of ${pctU(Math.abs(breakEven(5, 'aceitando').vsSellPct))} or ${pctU(Math.abs(breakEven(10, 'aceitando').vsSellPct))}. A maker who sells with a Sell Offer at today's price keeps ${price(antica.ask * (1 - C.fee.rate))} after the fee and must repurchase with Buy Offers at or below ${price(beMaker.rebuyAtMost)}, ${pctU(Math.abs(beMaker.vsSamePct))} under today's Buy Offers and ${pctU(Math.abs(beMaker.vsSellPct))} under today's Sell Offers. ${Math.abs(beMaker.vsSamePct) > Math.abs(beTaker.vsSellPct) ? `The maker thus needs the larger fall in the quote it repurchases, because two fees of 2% cost more than the ${pctU(antica.costPct)} spread the maker saves in ${bench}` : `The maker thus needs the smaller fall in the quote it repurchases, because the spread the maker saves in ${bench} exceeds its two fees of 2%`}; the maker's threshold rises above today's Buy Offers once the spread exceeds ${pctU(makerSpreadEdge)}, which ${nw(wideEnough.length)} of the ${worlds.length} worlds showed at their latest reading. These thresholds follow from today's quotes and the fee schedule alone; ${chapterRef('downside')} gives the probability of a fall, and the last part of this section the probability of clearing them.`,
      `Vendendo na captura de ${cutoffDay}, um taker recebe ${price(antica.bid)} gp/TC e só termina com mais TC se as Sell Offers caírem abaixo desse nível, ${pctU(Math.abs(beTaker.vsSellPct))} sob os ${price(antica.ask)} de hoje: a queda de break-even do taker é o próprio round-trip execution cost, e um gain de 5% ou 10% em TC exige queda de ${pctU(Math.abs(breakEven(5, 'aceitando').vsSellPct))} ou ${pctU(Math.abs(breakEven(10, 'aceitando').vsSellPct))}. Um maker que vende com uma Sell Offer ao price de hoje fica com ${price(antica.ask * (1 - C.fee.rate))} após a fee e precisa recomprar com Buy Offers de no máximo ${price(beMaker.rebuyAtMost)}, ${pctU(Math.abs(beMaker.vsSamePct))} abaixo das Buy Offers de hoje e ${pctU(Math.abs(beMaker.vsSellPct))} abaixo das Sell Offers de hoje. ${Math.abs(beMaker.vsSamePct) > Math.abs(beTaker.vsSellPct) ? `O maker precisa, assim, da queda maior na quote que recompra, porque duas fees de 2% custam mais do que o spread de ${pctU(antica.costPct)} que o maker economiza em ${bench}` : `O maker precisa, assim, da queda menor na quote que recompra, porque o spread que o maker economiza em ${bench} supera suas duas fees de 2%`}; o threshold do maker sobe acima das Buy Offers de hoje quando o spread passa de ${pctU(makerSpreadEdge)}, o que ${nw(wideEnough.length)} dos ${worlds.length} worlds mostravam na leitura mais recente. Esses thresholds decorrem apenas das quotes de hoje e da tabela de fees; a ${chapterRef('downside')} dá a probabilidade de uma queda, e a última parte desta seção, a probabilidade de superá-los.`)}
    </div>
    <div class="evidence-stack"><div id="card-breakeven"></div></div>
    </div>
    <h3>${t('The Cost of Crossing the Spread', 'O cost de atravessar o spread')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The first friction is the cost of crossing the spread at entry. At the cutoff, ${widest.world} had the highest round-trip execution cost among the captured worlds, ${pctU(widest.costPct, 1)}, with Sell Offers at ${price(widest.ask)} and Buy Offers at ${price(widest.bid)} gp/TC, against ${pctU(antica.costPct, 1)} in ${bench}. Measured against the preceding 180 days, ${wideNow.length > 1 ? `${wideNow.length} captured worlds showed a cost more than 1.5 times their own median` : wideNow.length ? 'one captured world showed a cost more than 1.5 times its own median' : 'no captured world showed a cost more than 1.5 times its own median'}, and ${bench}'s ${pctU(antica.costPct, 2)} stood ${antica.costPct < anticaSpread.recentMedianPct ? 'below' : 'above'} its median of ${pctU(anticaSpread.recentMedianPct, 2)}.${histWide.length ? ` ${list(histWide.map(w => w.world))} also exceed${histWide.length > 1 ? '' : 's'} the historical reference, although the price comes from the API because no capture existed at the cutoff.` : ''} Because the starting cost differs across worlds, the same fall in price produces different TC returns.`,
      `A primeira fricção é o cost de atravessar o spread na entrada. No cutoff, ${widest.world} tinha o maior round-trip execution cost entre os worlds capturados, ${pctU(widest.costPct, 1)}, com Sell Offers a ${price(widest.ask)} e Buy Offers a ${price(widest.bid)} gp/TC, ante ${pctU(antica.costPct, 1)} em ${bench}. Em relação aos 180 dias anteriores, ${wideNow.length > 1 ? `${wideNow.length} worlds capturados apresentavam cost superior a 1,5 vez sua própria median` : wideNow.length ? 'um world capturado apresentava cost superior a 1,5 vez sua própria median' : 'nenhum world capturado apresentava cost superior a 1,5 vez sua própria median'}, e os ${pctU(antica.costPct, 2)} de ${bench} estavam ${antica.costPct < anticaSpread.recentMedianPct ? 'abaixo' : 'acima'} de sua median de ${pctU(anticaSpread.recentMedianPct, 2)}.${histWide.length ? ` ${list(histWide.map(w => w.world))} também ${histWide.length > 1 ? 'excedem' : 'excede'} a referência histórica, embora o price venha da API, pois não havia captura no cutoff.` : ''} Como o cost inicial difere entre worlds, a mesma queda de price produz returns em TC diferentes.`)}
    </div>
    <div class="evidence-stack"><div id="card-spread"></div></div>
    </div>
    <h3>${t('Historical Round Trips: Taking and Making Offers', 'Round trips históricos: taker e maker')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Historical round trips show what the seasonal pattern has delivered net of the spread. Comparing the median Buy Offers of the sale month with the median Sell Offers from May to July of the following year avoids choosing the best day in hindsight, although it ignores market impact and assumes that sufficient Amount was available. In ${bench}, a November sale followed by a May-to-July repurchase, taking offers, yielded ${list(novTrips.map(x => `${x.tcGainPct >= 0 ? 'a gain' : 'a loss'} of ${pctU(Math.abs(x.tcGainPct))} in TC in the ${cleanText(x.cycle)} cycle`))}${novTrips.length > 1 && novTrips.every((x, i) => !i || x.tcGainPct < novTrips[i - 1].tcGainPct) ? `: the gain has narrowed in step with the damping of the declines documented in ${chapterRef('s03')}` : ''}.`,
      `Os round trips históricos mostram o que o padrão seasonal entregou, líquido do spread. Comparar a median das Buy Offers do mês de venda com a median das Sell Offers de maio a julho do ano seguinte evita escolher o melhor dia em retrospecto, embora ignore o market impact e presuma Amount suficiente. Em ${bench}, uma venda em novembro seguida de recompra entre maio e julho, como taker, resultou em ${list(novTrips.map(x => `${x.tcGainPct >= 0 ? 'um gain' : 'uma loss'} de ${pctU(Math.abs(x.tcGainPct))} em TC no cycle ${cleanText(x.cycle)}`))}${novTrips.length > 1 && novTrips.every((x, i) => !i || x.tcGainPct < novTrips[i - 1].tcGainPct) ? `: o gain diminuiu no mesmo ritmo do amortecimento das quedas documentado na ${chapterRef('s03')}` : ''}.`)}
    ${para(`Making offers changes the comparison, but not uniformly. In ${bench}, where the spread is narrow, the 2% fee on each side ${median(makerDiffAntica) <= 0 ? 'outweighs the better prices more often than not' : 'absorbs most of the better prices'}: across the ${makerDiffAntica.length} combinations of cycle and sale month, making offers differed from taking them by between ${pp(Math.min(...makerDiffAntica))} and ${pp(Math.max(...makerDiffAntica))}${makerAntica ? `, and for a November sale in the ${cleanText(makerAntica.cycle)} cycle it returned ${sgn(makerAntica.makerNetPct)} against ${sgn(makerAntica.acceptPct)}` : ''}. In other worlds, where spreads are wider, making offers beat taking them in ${makerOthersWins} of ${makerOthers.length} combinations across ${new Set(makerOthers.map(x => x.world)).size} worlds, by a median of ${pp(median(makerOthers.map(x => x.makerNetPct - x.acceptPct)))}. That advantage presupposes that both offers fill, which a posted offer does not guarantee, and most monthly medians rest on few readings.${(() => { const none = worlds.filter(w => w.world !== bench && !C.roundtripMaker.some(x => x.world === w.world)).map(w => w.world); return none.length ? ` ${list(none)} ${none.length > 1 ? 'have' : 'has'} no cycle that meets the minimum of three days with offers in each window.` : ''; })()}`,
      `Criar offers muda a comparação, mas não de forma uniforme. Em ${bench}, onde o spread é estreito, a fee de 2% em cada lado ${median(makerDiffAntica) <= 0 ? 'supera, na maior parte das vezes, os prices melhores' : 'absorve a maior parte dos prices melhores'}: nas ${makerDiffAntica.length} combinações de cycle e mês de venda, atuar como maker diferiu de atuar como taker entre ${pp(Math.min(...makerDiffAntica))} e ${pp(Math.max(...makerDiffAntica))}${makerAntica ? `, e, para uma venda em novembro no cycle ${cleanText(makerAntica.cycle)}, rendeu ${sgn(makerAntica.makerNetPct)} ante ${sgn(makerAntica.acceptPct)}` : ''}. Nos demais worlds, onde os spreads são mais amplos, atuar como maker superou atuar como taker em ${makerOthersWins} de ${makerOthers.length} combinações em ${new Set(makerOthers.map(x => x.world)).size} worlds, por uma median de ${pp(median(makerOthers.map(x => x.makerNetPct - x.acceptPct)))}. Essa vantagem pressupõe que as duas offers sejam executadas, o que uma offer publicada não garante, e a maioria das monthly medians se apoia em poucas leituras.${(() => { const none = worlds.filter(w => w.world !== bench && !C.roundtripMaker.some(x => x.world === w.world)).map(w => w.world); return none.length ? ` ${list(none)} não ${none.length > 1 ? 'têm' : 'tem'} cycle que atenda ao mínimo de três dias com offers em cada janela.` : ''; })()}`)}
    </div>
    <div class="evidence-stack"><div id="card-roundtrip"></div><div id="card-maker"></div><div id="card-maker-all"></div></div>
    </div>
    <h3 id="profitable-rebuy" data-report-anchor>${t('Probability of a Profitable Rebuy', 'Probabilidade de uma recompra lucrativa')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Applying the simulated paths to the same round trip turns those thresholds into probabilities, and shows that a falling price is not the same as a profitable trade. Selling at today's Buy Offers and repurchasing at the simulated Sell Offers in the week of ${longDate(rebuyWeek)}, the taker ends with more TC in ${prob(rt23.pGain)} of the paths trained since 2023, although ${prob(m23.prob.jun28BelowStart)} end that week below today's price: the difference is the paths whose fall does not clear the spread. The median gain is ${sgn(rt23.quantiles[2])}, the central half of outcomes runs from ${sgn(rt23.quantiles[1])} to ${sgn(rt23.quantiles[3])}, and ${prob(rt23.pLossGt10)} of the paths lose more than 10% of the TC against ${prob(rt23.pGainGt10)} that gain more than 10%. Trained since 2024, the taker gains in ${prob(rt24.pGain)} of the paths, for a median of ${sgn(rt24.quantiles[2])}; making offers, with both filled, gains in ${prob(mk23.pGain)} and ${prob(mk24.pGain)}. Across repurchase weeks the chance of a taker gain is highest, ${prob(bestRebuy.taker)}, in the week of ${longDate(weekStart(bestRebuy.date))}, a timing no player can know in advance.`,
      `Aplicar os paths simulados ao mesmo round trip transforma esses thresholds em probabilidades e mostra que um price em queda não é o mesmo que uma operação lucrativa. Vendendo às Buy Offers de hoje e recomprando às Sell Offers simuladas na semana de ${longDate(rebuyWeek)}, o taker termina com mais TC em ${prob(rt23.pGain)} dos paths treinados desde 2023, embora ${prob(m23.prob.jun28BelowStart)} terminem essa semana abaixo do price de hoje: a diferença são os paths cuja queda não supera o spread. A median do gain é ${sgn(rt23.quantiles[2])}, a metade central dos resultados vai de ${sgn(rt23.quantiles[1])} a ${sgn(rt23.quantiles[3])}, e ${prob(rt23.pLossGt10)} dos paths perdem mais de 10% das TC, ante ${prob(rt23.pGainGt10)} que ganham mais de 10%. Com treino desde 2024, o taker ganha em ${prob(rt24.pGain)} dos paths, com median de ${sgn(rt24.quantiles[2])}; como maker, com as duas offers executadas, ganha em ${prob(mk23.pGain)} e ${prob(mk24.pGain)}. Entre as semanas de recompra, a chance de gain do taker é máxima, ${prob(bestRebuy.taker)}, na semana de ${longDate(weekStart(bestRebuy.date))}, um timing que nenhum jogador conhece de antemão.`)}
    </div>
    <div class="evidence-stack"><div id="card-rebuy-curve"></div></div>
    </div>
    <div id="card-rebuy-dist"></div>
    <h3 id="depth-slippage" data-report-anchor>${t('Depth and Slippage', 'Depth e slippage')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The best quotes are executable only up to the Amount offered at them. Each capture records, for each side, the best price ${tex('P')}, the Amount ${tex('a')} at that price, the visible Amount ${tex('V')} and its value in gold ${tex('G')}, but not every level of the book. The rest of the book is sorted away from the best price and averages ${tex(String.raw`\bar P_r = (G - aP)/(V - a)`)}, so its first units can average no worse than that, which bounds the average-price slippage of an order for ${tex('q')} TC:`,
      `As melhores quotes só são executáveis até o Amount oferecido nelas. Cada captura registra, para cada lado, o best price ${tex('P')}, o Amount ${tex('a')} nesse price, o Amount visível ${tex('V')} e seu valor em gold ${tex('G')}, mas não cada nível do book. O restante do book está ordenado para longe do best price e tem média ${tex(String.raw`\bar P_r = (G - aP)/(V - a)`)}, de modo que suas primeiras unidades não podem ter média pior do que essa, o que limita o slippage do price médio de uma ordem de ${tex('q')} TC:`)}
    ${math(String.raw`s(q) \le \frac{\max(q - a,\, 0)}{q}\left|\frac{\bar P_r}{P} - 1\right|, \qquad q \le V .`)}
    ${para(`Two order sizes are measured: 100 TC, the unit of ${chapterRef('decisions')}, and 1,000 TC, the largest round order below the fee cap at today's price. At the capture of ${cutoffDay}, ${bench}'s best Sell Offer carried ${fmt(dAn.askTop)} TC and its best Buy Offer ${fmt(dAn.bidTop)}, so ${dAn.cost100 - dAn.costPct < .005 ? '100 TC trade at the best prices on both sides' : `100 TC already reach worse prices, at a cost of up to ${pctU(dAn.cost100, 2)}`}, while a sale of 1,000 TC ${dAn.bidSlip1000 > 0 ? `reaches lower Buy Offers and may lose up to ${pctU(dAn.bidSlip1000, 2)}` : 'still trades at the best Buy Offer'}: the round-trip execution cost of 1,000 TC is at most ${pctU(dAn.cost1000, 2)}, against ${pctU(dAn.costPct, 2)} at the best quotes. The best price covered 1,000 TC on the Buy Offers side in ${nw(bidCovers1000)} of ${bench}'s ${nw(anticaBook.length)} captures and on the Sell Offers side in ${nw(askCovers1000)}, so depth changes from one capture to the next. For 1,000 TC, charging today's bounds on the sale and on the repurchase lowers the taker's break-even to ${price(dr(1000).breakEven)} and the chance of a gain by the week of ${longDate(rebuyWeek)} to at least ${prob(dr(1000).main.pGain)}, against ${prob(rt23.pGain)} at the best quotes. Across worlds the bound matters more: in ${nw(slipped(1000).length)} of the ${nw(DW.length)} worlds with a recorded book, 1,000 TC would cost more than the best quotes suggest, most in ${worstSlip.world}, from ${pctU(worstSlip.costPct)} to at most ${pctU(worstSlip.cost1000)}${beyond(1000).length ? `, and in ${list(beyond(1000).map(x => x.world))} the visible book holds fewer than 1,000 TC on one side` : ''}.`,
      `Dois tamanhos de ordem são medidos: 100 TC, a unidade da ${chapterRef('decisions')}, e 1.000 TC, a maior ordem redonda abaixo do teto da fee ao price de hoje. Na captura de ${cutoffDay}, a melhor Sell Offer de ${bench} tinha ${fmt(dAn.askTop)} TC e a melhor Buy Offer, ${fmt(dAn.bidTop)}, de modo que ${dAn.cost100 - dAn.costPct < .005 ? '100 TC são negociadas nos best prices dos dois lados' : `100 TC já alcançam prices piores, a um cost de até ${pctU(dAn.cost100, 2)}`}, enquanto uma venda de 1.000 TC ${dAn.bidSlip1000 > 0 ? `alcança Buy Offers mais baixas e pode perder até ${pctU(dAn.bidSlip1000, 2)}` : 'ainda é executada na melhor Buy Offer'}: o round-trip execution cost de 1.000 TC é de no máximo ${pctU(dAn.cost1000, 2)}, ante ${pctU(dAn.costPct, 2)} nas melhores quotes. O best price cobriu 1.000 TC do lado das Buy Offers em ${nw(bidCovers1000, true)} das ${nw(anticaBook.length, true)} capturas de ${bench} e do lado das Sell Offers em ${nw(askCovers1000, true)}, de modo que a depth muda de uma captura para outra. Para 1.000 TC, aplicar os limites de hoje à venda e à recompra reduz o break-even do taker para ${price(dr(1000).breakEven)} e a chance de gain até a semana de ${longDate(rebuyWeek)} para pelo menos ${prob(dr(1000).main.pGain)}, ante ${prob(rt23.pGain)} nas melhores quotes. Entre worlds, o limite pesa mais: em ${nw(slipped(1000).length)} dos ${nw(DW.length)} worlds com book registrado, 1.000 TC custariam mais do que as melhores quotes sugerem, sobretudo em ${worstSlip.world}, de ${pctU(worstSlip.costPct)} para no máximo ${pctU(worstSlip.cost1000)}${beyond(1000).length ? `, e em ${list(beyond(1000).map(x => x.world))} o book visível tem menos de 1.000 TC em um dos lados` : ''}.`)}
    </div>
    <div class="evidence-stack"><div id="card-depth"></div></div>
    </div>
    <div class="prose narrative-grid">
    ${para(`Frictions therefore decide whether a correct view of the cycle becomes a gain in TC. In ${bench}, a taker needs a fall of ${pctU(Math.abs(beTaker.vsSellPct))} only to break even, and under the model trained since 2023, the only one with a probabilistic backtest, a repurchase in late June has ${odds(rt23.pGain) === 'even' ? 'roughly even odds' : `${odds(rt23.pGain)} odds`} of clearing it, for a median gain of ${sgn(rt23.quantiles[2])} against a ${prob(rt23.pLossGt10)} chance of losing more than 10% of the TC; the fee ${median(makerDiffAntica) <= 0 ? 'removes the advantage' : 'removes most of the advantage'} of making offers there, while in worlds with wider spreads making offers helps only if both offers fill. Depth adds a third friction for orders the best quotes cannot absorb, small for 100 TC in ${bench} and larger in thin worlds. None of these figures is a demonstrated expectation of profit. ${chapterRef('decisions', true)} applies the same frictions to the simpler choice of buying or selling once, and they recur, amplified by thinner depth, in the worlds of ${chapterRef('s05')}.`,
      `As fricções decidem, portanto, se uma leitura correta do cycle se converte em gain em TC. Em ${bench}, um taker precisa de uma queda de ${pctU(Math.abs(beTaker.vsSellPct))} apenas para empatar, e, sob o modelo treinado desde 2023, o único com backtest probabilístico, uma recompra no fim de junho tem ${odds(rt23.pGain) === 'even' ? 'chances aproximadamente iguais' : odds(rt23.pGain) === 'favourable' ? 'chances favoráveis' : 'chances desfavoráveis'} de superá-la, com median de gain de ${sgn(rt23.quantiles[2])} ante uma chance de ${prob(rt23.pLossGt10)} de perder mais de 10% das TC; a fee ${median(makerDiffAntica) <= 0 ? 'elimina a vantagem' : 'elimina a maior parte da vantagem'} de atuar como maker ali, enquanto, em worlds com spreads mais amplos, atuar como maker só ajuda se as duas offers forem executadas. A depth acrescenta uma terceira fricção para ordens que as melhores quotes não absorvem, pequena para 100 TC em ${bench} e maior em worlds rasos. Nenhum desses números constitui uma expectativa demonstrada de profit. A ${chapterRef('decisions')} aplica as mesmas fricções à escolha mais simples de comprar ou vender uma única vez, e elas reaparecem, ampliadas por uma depth menor, nos worlds da ${chapterRef('s05')}.`)}
    </div>
  </section>`,
  decisions: `
  <section class="block" id="decisions">
    ${sectionHeading('decisions')}
    <div class="prose narrative-grid">
    ${para(`The preceding chapters describe the price; a player has to decide when to trade at it, and two players face different decisions. A gold holder who wants TC compares buying today with buying later and succeeds by obtaining more TC for the same gold; a TC holder who wants gold compares selling today with selling later and succeeds by obtaining more gold for the same TC. ${chapterRef('s08', true)} examined a third decision, selling to buy back, which crosses the spread twice; each decision here trades once, against one side of the Market. Taking offers, the buyer pays the best Sell Offer and the seller receives the best Buy Offer; making offers, the buyer posts a Buy Offer and the seller a Sell Offer, each paying the fee. Against taking today's quote, a plan that acts in week ${tex('t')}, or in equal tranches over weeks ${tex('t_1')} to ${tex('t_n')}, returns`,
      `Os capítulos anteriores descrevem o price; um jogador precisa decidir quando negociar a ele, e dois jogadores enfrentam decisões diferentes. Quem tem gold e quer TC compara comprar hoje com comprar depois e tem sucesso se obtiver mais TC pelo mesmo gold; quem tem TC e quer gold compara vender hoje com vender depois e tem sucesso se obtiver mais gold pelas mesmas TC. A ${chapterRef('s08')} examinou uma terceira decisão, vender para recomprar, que atravessa o spread duas vezes; cada decisão aqui negocia uma única vez, contra um único lado do Market. Como taker, o comprador paga a melhor Sell Offer e o vendedor recebe a melhor Buy Offer; como maker, o comprador publica uma Buy Offer e o vendedor, uma Sell Offer, cada um pagando a fee. Em relação a aceitar a quote de hoje, um plano que age na semana ${tex('t')}, ou em parcelas iguais nas semanas ${tex('t_1')} a ${tex('t_n')}, resulta em`)}
    ${math(String.raw`R^{\text{buy}}_t = \frac{P^{S}_0}{P^{S}_t}, \qquad R^{\text{sell}}_t = \frac{P^{B}_t}{P^{B}_0}, \qquad \bar R^{\text{buy}} = \frac{1}{n}\sum_{k=1}^{n} \frac{P^{S}_0}{P^{S}_{t_k}}, \qquad \bar R^{\text{sell}} = \frac{1}{n}\sum_{k=1}^{n} \frac{P^{B}_{t_k}}{P^{B}_0},`)}
    ${para(`where a value above one means more TC for the buyer, or more gold for the seller, than acting today, and a staged plan spends the same gold, or sells the same number of TC, in each week. No date is chosen as a target. The plans act in the week of ${longDate(weekStart(decNov))}, which holds the ensemble scenario for ${monthYear(MILESTONES[0])}; in the week of ${longDate(weekStart(decJun))}, which holds the scenario for ${monthYear(MILESTONES[2])}; across the weeks between the P10 and the P90 of the simulated date of the turning point the player waits for; and, as bounds that only hindsight reaches, at each path's own peak or low. The outcomes are read off the ${fmt(PATHS)} paths of ${chapterRef('downside')}, so they are model-implied and inherit its calibration and its dependence on the training window.`,
      `em que um valor acima de um significa mais TC para o comprador, ou mais gold para o vendedor, do que agir hoje, e um plano escalonado gasta o mesmo gold, ou vende o mesmo número de TC, em cada semana. Nenhuma data é escolhida como alvo. Os planos agem na semana de ${longDate(weekStart(decNov))}, que contém o ensemble scenario para ${monthYear(MILESTONES[0])}; na semana de ${longDate(weekStart(decJun))}, que contém o scenario para ${monthYear(MILESTONES[2])}; nas semanas entre o P10 e o P90 da data simulada do turning point que o jogador espera; e, como limites que só a retrospectiva alcança, no próprio peak ou no próprio mínimo de cada path. Os resultados são lidos nos ${fmt(PATHS)} paths da ${chapterRef('downside')}, de modo que são model-implied e herdam sua calibration e sua dependência da training window.`)}
    </div>
    <h3>${t('Taking or Making an Offer Today', 'Aceitar ou criar uma offer hoje')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The order type matters before the timing does. At the capture of ${cutoffDay}, a gold holder who takes ${bench}'s best Sell Offer pays ${price(antica.ask)} gp per TC, whereas one who posts a Buy Offer at the best Buy Offer pays ${price(antica.bid)} plus the 2% fee, ${price(makeBuy)} in all, ${pctU(Math.abs(makeBuy / antica.ask - 1) * 100, 2)} ${makeBuy > antica.ask ? 'more' : 'less'}, and only once a seller accepts it.${note('manual')} A TC holder who takes the best Buy Offer receives ${price(antica.bid)}, whereas one who posts a Sell Offer at the best Sell Offer keeps ${price(makeSell)} after the fee, ${pctU(Math.abs(makeSell / antica.bid - 1) * 100, 2)} ${makeSell < antica.bid ? 'less' : 'more'}. Making an offer is the cheaper order for a buyer only when the round-trip execution cost exceeds ${pctU(buyEdge, 2)}, and for a seller only when it exceeds ${pctU(sellEdge, 2)}; ${bench}'s ${pctU(antica.costPct, 2)} ${antica.costPct < buyEdge ? 'lies below both, so there the choice is one of timing rather than of order type' : antica.costPct > sellEdge ? 'exceeds both, so there a filled offer is the cheaper order on either side' : 'lies between them'}. At their latest readings, ${takeOnly.length === worlds.length ? 'no world had a cost above these thresholds' : `only ${list(takeOnly.map(w => w.world))} had a cost below these thresholds; in the other ${nw(worlds.length - takeOnly.length)} ${worlds.length - takeOnly.length === 1 ? 'world' : 'worlds'} a filled offer would have been the cheaper order for buyer and seller alike`}. ${tcFor(antica.ask) <= dAn.askTop && 100 <= dAn.bidTop ? `Both units of this chapter fit within ${bench}'s best prices today: the ${fmt(tcFor(antica.ask), 0)} TC that 10 million gp buy are within the ${fmt(dAn.askTop)} TC at the best Sell Offer, and 100 TC within the ${fmt(dAn.bidTop)} at the best Buy Offer` : `At ${bench}'s best prices today, ${fmt(dAn.askTop)} TC are offered for sale and ${fmt(dAn.bidTop)} TC are bid for`}; larger orders reach worse prices, as ${chapterRef('s08')} measures.`,
      `O tipo de ordem importa antes do timing. Na captura de ${cutoffDay}, quem tem gold e aceita a melhor Sell Offer de ${bench} paga ${price(antica.ask)} gp por TC, enquanto quem publica uma Buy Offer na melhor Buy Offer paga ${price(antica.bid)} mais a fee de 2%, ${price(makeBuy)} no total, ${pctU(Math.abs(makeBuy / antica.ask - 1) * 100, 2)} ${makeBuy > antica.ask ? 'a mais' : 'a menos'}, e só quando um vendedor a aceita.${note('manual')} Quem tem TC e aceita a melhor Buy Offer recebe ${price(antica.bid)}, enquanto quem publica uma Sell Offer na melhor Sell Offer fica com ${price(makeSell)} após a fee, ${pctU(Math.abs(makeSell / antica.bid - 1) * 100, 2)} ${makeSell < antica.bid ? 'a menos' : 'a mais'}. Criar uma offer é a ordem mais barata para o comprador apenas quando o round-trip execution cost supera ${pctU(buyEdge, 2)}, e para o vendedor apenas quando supera ${pctU(sellEdge, 2)}; os ${pctU(antica.costPct, 2)} de ${bench} ${antica.costPct < buyEdge ? 'ficam abaixo dos dois, de modo que ali a escolha é de timing, e não de tipo de ordem' : antica.costPct > sellEdge ? 'superam os dois, de modo que ali uma offer executada é a ordem mais barata para os dois lados' : 'ficam entre os dois'}. Nas leituras mais recentes, ${takeOnly.length === worlds.length ? 'nenhum world tinha cost acima desses thresholds' : `apenas ${list(takeOnly.map(w => w.world))} ${takeOnly.length === 1 ? 'tinha' : 'tinham'} cost abaixo desses thresholds; nos outros ${nw(worlds.length - takeOnly.length)} ${worlds.length - takeOnly.length === 1 ? 'world' : 'worlds'}, uma offer executada teria sido a ordem mais barata para comprador e vendedor`}. ${tcFor(antica.ask) <= dAn.askTop && 100 <= dAn.bidTop ? `As duas unidades deste capítulo cabem nos best prices de ${bench} hoje: as ${fmt(tcFor(antica.ask), 0)} TC que 10 milhões de gp compram estão dentro das ${fmt(dAn.askTop)} TC na melhor Sell Offer, e 100 TC dentro das ${fmt(dAn.bidTop)} na melhor Buy Offer` : `Nos best prices de ${bench} hoje, há ${fmt(dAn.askTop)} TC à venda e ${fmt(dAn.bidTop)} TC procuradas`}; ordens maiores alcançam prices piores, como mede a ${chapterRef('s08')}.`)}
    </div>
    <div class="evidence-stack"><div id="card-decision-today"></div></div>
    </div>
    <h3>${t('What Gold Buys and TC Fetch in Each Scenario', 'O que o gold compra e as TC rendem em cada scenario')}</h3>
    <div class="prose narrative-grid">
    ${para(`Translated into quantities, the model's scenarios for ${bench} read as follows. Today, 10 million gp buy ${fmt(tcFor(antica.ask), 1)} TC at the Sell Offers, and 100 TC fetch ${price(goldFor(antica.bid))} gp at the Buy Offers. At the ensemble scenario for the week of ${longDate(weekStart(decNov))}, ${price(nov.base)} gp/TC, the same gold would buy ${fmt(tcFor(nov.base), 1)} TC, ${moreTc((antica.ask / nov.base - 1) * 100)}, and at the scenario for the week of ${longDate(weekStart(decJun))}, ${price(june.base)}, ${fmt(tcFor(june.base), 1)} TC, ${moreTc((antica.ask / june.base - 1) * 100)}. At the median simulated peak, ${price(m23.peakLevel[1])}, it would buy ${fmt(tcFor(m23.peakLevel[1]), 1)} TC, and at the median March-to-September low, ${price(m23.troughLevel[1])}, ${fmt(tcFor(m23.troughLevel[1]), 1)} TC. For a TC holder the Buy Offers are the relevant side: 100 TC would fetch ${price(goldFor(novBid.base))} gp at the November scenario, ${price(goldFor(juneBid.base))} at the June scenario, ${price(goldFor(mb23.peakLevel[1]))} at the median simulated peak and ${price(goldFor(mb23.troughLevel[1]))} at the median low. Each level is the centre of a distribution: the stress band for November alone spans ${fmt(tcFor(nov.high), 1)} to ${fmt(tcFor(nov.low), 1)} TC for the same gold, and the exhibits that follow turn that width into odds.`,
      `Traduzidos em quantidades, os scenarios do modelo para ${bench} são os seguintes. Hoje, 10 milhões de gp compram ${fmt(tcFor(antica.ask), 1)} TC às Sell Offers, e 100 TC rendem ${price(goldFor(antica.bid))} gp às Buy Offers. No ensemble scenario para a semana de ${longDate(weekStart(decNov))}, ${price(nov.base)} gp/TC, o mesmo gold compraria ${fmt(tcFor(nov.base), 1)} TC, ${moreTc((antica.ask / nov.base - 1) * 100)}, e no scenario para a semana de ${longDate(weekStart(decJun))}, ${price(june.base)}, ${fmt(tcFor(june.base), 1)} TC, ${moreTc((antica.ask / june.base - 1) * 100)}. No peak simulado mediano, ${price(m23.peakLevel[1])}, compraria ${fmt(tcFor(m23.peakLevel[1]), 1)} TC, e no mínimo mediano de março a setembro, ${price(m23.troughLevel[1])}, ${fmt(tcFor(m23.troughLevel[1]), 1)} TC. Para quem tem TC, o lado relevante são as Buy Offers: 100 TC renderiam ${price(goldFor(novBid.base))} gp no scenario de novembro, ${price(goldFor(juneBid.base))} no scenario de junho, ${price(goldFor(mb23.peakLevel[1]))} no peak simulado mediano e ${price(goldFor(mb23.troughLevel[1]))} no mínimo mediano. Cada nível é o centro de uma distribution: só a stress band de novembro vai de ${fmt(tcFor(nov.high), 1)} a ${fmt(tcFor(nov.low), 1)} TC pelo mesmo gold, e os exhibits a seguir convertem essa amplitude em chances.`)}
    </div>
    <div id="card-decision-levels"></div>
    <h3>${t('When Does Waiting Pay?', 'Quando esperar compensa?')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Timing decides which of the two players the season favours. Waiting to buy has the worse odds until the new year: until the end of November the Sell Offers trade below today's price in at most ${prob(preNov23)} of the paths trained since 2023, so a gold holder who buys in the week of ${longDate(weekStart(decNov))} rather than today obtains fewer TC in ${prob(1 - by23('nov').pBetter)} of them. The chance that waiting yields more TC ${half23 ? `first reaches one half in the week of ${longDate(weekStart(half23))}` : 'never reaches one half'} and is highest, ${prob(buyerBest.buyer)}, in the week of ${longDate(weekStart(buyerBest.date))}. Waiting to sell has the better odds first: a TC holder who sells at the Buy Offers in the week of ${longDate(weekStart(decNov))} rather than today obtains more gold in ${prob(se23('nov').pBetter)} of the paths, the chance is highest, ${prob(sellerBest.seller)}, in the week of ${longDate(weekStart(sellerBest.date))}, and it ${sellerHalf ? `falls below one half in the week of ${longDate(weekStart(sellerHalf))}` : 'stays above one half'}. Trained since 2024, the model deepens the season on both sides: buying in the week of ${longDate(weekStart(decJun))} beats buying today in ${prob(by24('jun').pBetter)} of the paths, and selling in the week of ${longDate(weekStart(decNov))} beats selling today in ${prob(se24('nov').pBetter)}.`,
      `O timing decide qual dos dois jogadores a seasonality favorece. Esperar para comprar tem as piores chances até o ano novo: até o fim de novembro, as Sell Offers ficam abaixo do price de hoje em no máximo ${prob(preNov23)} dos paths treinados desde 2023, de modo que quem tem gold e compra na semana de ${longDate(weekStart(decNov))}, e não hoje, obtém menos TC em ${prob(1 - by23('nov').pBetter)} deles. A chance de que esperar renda mais TC ${half23 ? `alcança metade pela primeira vez na semana de ${longDate(weekStart(half23))}` : 'nunca alcança metade'} e chega ao máximo, ${prob(buyerBest.buyer)}, na semana de ${longDate(weekStart(buyerBest.date))}. Esperar para vender tem as melhores chances primeiro: quem tem TC e vende às Buy Offers na semana de ${longDate(weekStart(decNov))}, e não hoje, obtém mais gold em ${prob(se23('nov').pBetter)} dos paths, a chance chega ao máximo, ${prob(sellerBest.seller)}, na semana de ${longDate(weekStart(sellerBest.date))}, e ${sellerHalf ? `cai abaixo de metade na semana de ${longDate(weekStart(sellerHalf))}` : 'permanece acima de metade'}. Com treino desde 2024, o modelo aprofunda a seasonality nos dois lados: comprar na semana de ${longDate(weekStart(decJun))} supera comprar hoje em ${prob(by24('jun').pBetter)} dos paths, e vender na semana de ${longDate(weekStart(decNov))} supera vender hoje em ${prob(se24('nov').pBetter)}.`)}
    </div>
    <div class="evidence-stack"><div id="card-decision-curve"></div></div>
    </div>
    <h3 id="buy-or-wait" data-report-anchor>${t('A Gold Holder: Buy Now or Wait?', 'Quem tem gold: comprar agora ou esperar?')}</h3>
    <div class="prose narrative-grid">
    ${para(`For a gold holder, the benefit of waiting for the decline has to be weighed against the rise the model still expects first. Buying in the week of ${longDate(weekStart(decJun))} instead of today yields more TC in ${prob(by23('jun').pBetter)} of the paths, a median of ${moreTc(q50(by23('jun')))}, or ${fmt(tcFor(antica.ask) * (1 + q50(by23('jun')) / 100), 1)} instead of ${fmt(tcFor(antica.ask), 1)} TC for 10 million gp. The outcome is not symmetric: when waiting pays, it adds a median ${pctU(by23('jun').gainIfBetter)} to the TC obtained, and when it fails it removes a median ${pctU(Math.abs(by23('jun').lossIfWorse))}; one path in ten ends with at least ${moreTc(q10(by23('jun')))} than buying today, and one in ten with at least ${moreTc(q90(by23('jun')))}. Buying in the week of ${longDate(weekStart(decNov))} instead yields a median of ${moreTc(q50(by23('nov')))}, and buying at each path's own peak, the worst week a buyer could pick, ${moreTc(q50(by23('peak')))}. Buying at each path's March-to-September low would yield a median of ${moreTc(q50(by23('low')))}, but only hindsight identifies that week, and in ${prob(1 - by23('low').pBetter)} of the paths the Sell Offers never trade below today's price in that window at all. Trained since 2024, waiting until the June week pays in ${prob(by24('jun').pBetter)} of the paths, for a median of ${moreTc(q50(by24('jun')))}, so the case for waiting depends on the training window more than on any other modelling choice.`,
      `Para quem tem gold, o benefício de esperar a queda precisa ser pesado contra a alta que o modelo ainda espera antes dela. Comprar na semana de ${longDate(weekStart(decJun))} em vez de hoje rende mais TC em ${prob(by23('jun').pBetter)} dos paths, uma median de ${moreTc(q50(by23('jun')))}, ou ${fmt(tcFor(antica.ask) * (1 + q50(by23('jun')) / 100), 1)} em vez de ${fmt(tcFor(antica.ask), 1)} TC por 10 milhões de gp. O resultado não é simétrico: quando esperar compensa, acrescenta uma median de ${pctU(by23('jun').gainIfBetter)} às TC obtidas, e quando falha, retira uma median de ${pctU(Math.abs(by23('jun').lossIfWorse))}; um path em cada dez termina com pelo menos ${moreTc(q10(by23('jun')))} do que comprar hoje, e um em cada dez com pelo menos ${moreTc(q90(by23('jun')))}. Comprar na semana de ${longDate(weekStart(decNov))} rende uma median de ${moreTc(q50(by23('nov')))}, e comprar no próprio peak de cada path, a pior semana que um comprador poderia escolher, ${moreTc(q50(by23('peak')))}. Comprar no próprio mínimo de março a setembro de cada path renderia uma median de ${moreTc(q50(by23('low')))}, mas só a retrospectiva identifica essa semana, e em ${prob(1 - by23('low').pBetter)} dos paths as Sell Offers nunca ficam abaixo do price de hoje nessa janela. Com treino desde 2024, esperar até a semana de junho compensa em ${prob(by24('jun').pBetter)} dos paths, com median de ${moreTc(q50(by24('jun')))}, de modo que o argumento para esperar depende da training window mais do que de qualquer outra escolha de modelagem.`)}
    ${para(`Every plan breaks even at a quote fixed by today's Market. Waiting and then taking the Sell Offers gains TC only below today's ${price(antica.ask)}; waiting and then posting a Buy Offer gains only if the best Buy Offer is at or below ${price(buyMakeAtMost)}, ${pctU(Math.abs(buyMakeAtMost / antica.bid - 1) * 100, 2)} ${buyMakeAtMost < antica.bid ? 'below' : 'above'} today's Buy Offers, because the fee is paid on top of the price. ${antica.costPct < buyEdge ? `With ${bench}'s spread narrower than the fee, posting a Buy Offer in the June week yields more TC than buying today in ${prob(by23('junMake').pBetter)} of the paths, against ${prob(by23('jun').pBetter)} for taking the Sell Offers that week, and the offer must still fill.` : `With ${bench}'s spread wider than the fee, posting a Buy Offer in the June week yields more TC than buying today in ${prob(by23('junMake').pBetter)} of the paths, against ${prob(by23('jun').pBetter)} for taking the Sell Offers that week, provided the offer fills.`}`,
      `Todo plano tem um break-even numa quote fixada pelo Market de hoje. Esperar e depois aceitar as Sell Offers só rende mais TC abaixo dos ${price(antica.ask)} de hoje; esperar e depois publicar uma Buy Offer só rende mais se a melhor Buy Offer estiver em no máximo ${price(buyMakeAtMost)}, ${pctU(Math.abs(buyMakeAtMost / antica.bid - 1) * 100, 2)} ${buyMakeAtMost < antica.bid ? 'abaixo' : 'acima'} das Buy Offers de hoje, porque a fee é paga além do price. ${antica.costPct < buyEdge ? `Com o spread de ${bench} mais estreito do que a fee, publicar uma Buy Offer na semana de junho rende mais TC do que comprar hoje em ${prob(by23('junMake').pBetter)} dos paths, ante ${prob(by23('jun').pBetter)} para aceitar as Sell Offers nessa semana, e a offer ainda precisa ser executada.` : `Com o spread de ${bench} mais amplo do que a fee, publicar uma Buy Offer na semana de junho rende mais TC do que comprar hoje em ${prob(by23('junMake').pBetter)} dos paths, ante ${prob(by23('jun').pBetter)} para aceitar as Sell Offers nessa semana, desde que a offer seja executada.`}`)}
    </div>
    <div id="card-decision-buyer"></div>
    <h3 id="sell-or-wait" data-report-anchor>${t('A TC Holder: Sell Now or Wait?', 'Quem tem TC: vender agora ou esperar?')}</h3>
    <div class="prose narrative-grid">
    ${para(`For a TC holder the same paths point the other way in time. Selling at the Buy Offers in the week of ${longDate(weekStart(decNov))} instead of today yields more gold in ${prob(se23('nov').pBetter)} of the paths, a median of ${moreGold(q50(se23('nov')))}, or ${price(goldFor(antica.bid) * (1 + q50(se23('nov')) / 100))} instead of ${price(goldFor(antica.bid))} gp for 100 TC; when waiting pays, it adds a median ${pctU(se23('nov').gainIfBetter)} to the gold received, when it fails it removes ${pctU(Math.abs(se23('nov').lossIfWorse))}, and one path in ten ends with at least ${moreGold(q10(se23('nov')))} than selling today. Selling at each path's own peak would yield a median of ${moreGold(q50(se23('peak')))}, again in a week only hindsight identifies. Waiting past the peak reverses the odds: a sale in the week of ${longDate(weekStart(decJun))} yields less gold than today in ${prob(1 - se23('jun').pBetter)} of the paths, a median of ${moreGold(q50(se23('jun')))}, and a sale at each path's March-to-September low, ${moreGold(q50(se23('low')))}. Waiting and then taking the Buy Offers gains gold only above today's ${price(antica.bid)}, and waiting and then posting a Sell Offer only if the best Sell Offer is at or above ${price(sellMakeAtLeast)}, ${pctU(Math.abs(sellMakeAtLeast / antica.ask - 1) * 100, 2)} ${sellMakeAtLeast > antica.ask ? 'above' : 'below'} today's Sell Offers; posting one in the November week yields more gold than selling today in ${prob(se23('novMake').pBetter)} of the paths, against ${prob(se23('nov').pBetter)} for taking. Trained since 2024, a sale in the November week yields more gold in ${prob(se24('nov').pBetter)} of the paths, a median of ${moreGold(q50(se24('nov')))}.`,
      `Para quem tem TC, os mesmos paths apontam para o outro lado no tempo. Vender às Buy Offers na semana de ${longDate(weekStart(decNov))} em vez de hoje rende mais gold em ${prob(se23('nov').pBetter)} dos paths, uma median de ${moreGold(q50(se23('nov')))}, ou ${price(goldFor(antica.bid) * (1 + q50(se23('nov')) / 100))} em vez de ${price(goldFor(antica.bid))} gp por 100 TC; quando esperar compensa, acrescenta uma median de ${pctU(se23('nov').gainIfBetter)} ao gold recebido, quando falha retira ${pctU(Math.abs(se23('nov').lossIfWorse))}, e um path em cada dez termina com pelo menos ${moreGold(q10(se23('nov')))} do que vender hoje. Vender no próprio peak de cada path renderia uma median de ${moreGold(q50(se23('peak')))}, de novo numa semana que só a retrospectiva identifica. Esperar além do peak inverte as chances: uma venda na semana de ${longDate(weekStart(decJun))} rende menos gold do que hoje em ${prob(1 - se23('jun').pBetter)} dos paths, uma median de ${moreGold(q50(se23('jun')))}, e uma venda no próprio mínimo de março a setembro de cada path, ${moreGold(q50(se23('low')))}. Esperar e depois aceitar as Buy Offers só rende mais gold acima dos ${price(antica.bid)} de hoje, e esperar e depois publicar uma Sell Offer só rende mais se a melhor Sell Offer estiver em pelo menos ${price(sellMakeAtLeast)}, ${pctU(Math.abs(sellMakeAtLeast / antica.ask - 1) * 100, 2)} ${sellMakeAtLeast > antica.ask ? 'acima' : 'abaixo'} das Sell Offers de hoje; publicá-la na semana de novembro rende mais gold do que vender hoje em ${prob(se23('novMake').pBetter)} dos paths, ante ${prob(se23('nov').pBetter)} como taker. Com treino desde 2024, uma venda na semana de novembro rende mais gold em ${prob(se24('nov').pBetter)} dos paths, uma median de ${moreGold(q50(se24('nov')))}.`)}
    </div>
    <div id="card-decision-seller"></div>
    <h3>${t('Staged Buying and Selling', 'Compra e venda escalonadas')}</h3>
    <div class="prose narrative-grid">
    ${para(`Splitting the trade spreads its timing without diversifying the risk that matters most. Buying half today and half in the week of ${longDate(weekStart(decJun))} halves both sides of the outcome: the chance of ending with more TC stays at ${prob(by23('half').pBetter)}, the median falls to ${moreTc(q50(by23('half')))} and the worst tenth of paths ends with at least ${moreTc(q10(by23('half')))} instead of ${moreTc(q10(by23('jun')))}. Spreading the gold evenly over the ${nw(buyStaged.weeks)} weeks from ${longDate(weekStart(buyStaged.window[0]))} to ${longDate(weekStart(buyStaged.window[1]))}, between the P10 and the P90 of the simulated date of the low, yields more TC in ${prob(buyStaged.pBetter)} of the paths and a median of ${moreTc(q50(buyStaged))}, while its worst tenth of paths ends with at least ${moreTc(q10(buyStaged))}, against ${moreTc(q10(by23('jun')))} for a single purchase in the June week. In the model each path departs from the seasonal curve by a random walk, so by the time the window opens most of the dispersion between paths has already accumulated; averaging across its weeks removes little of it and adds weeks far from the typical low. The same holds for a TC holder: selling half today and half in the week of ${longDate(weekStart(decNov))} yields a median of ${moreGold(q50(se23('half')))}, with the worst tenth of paths at ${moreGold(q10(se23('half')))} or worse, and equal weekly sales over the ${nw(sellStaged.weeks)} weeks from ${longDate(weekStart(sellStaged.window[0]))} to ${longDate(weekStart(sellStaged.window[1]))}, the simulated peak window, a median of ${moreGold(q50(sellStaged))}, with the worst tenth at ${moreGold(q10(sellStaged))} or worse. Staging therefore trades half the timing risk for half the expected benefit; it does not remove the risk.`,
      `Dividir a operação distribui seu timing sem diversificar o risco que mais importa. Comprar metade hoje e metade na semana de ${longDate(weekStart(decJun))} reduz à metade os dois lados do resultado: a chance de terminar com mais TC continua em ${prob(by23('half').pBetter)}, a median cai para ${moreTc(q50(by23('half')))} e o pior décimo dos paths termina com pelo menos ${moreTc(q10(by23('half')))}, em vez de ${moreTc(q10(by23('jun')))}. Distribuir o gold igualmente pelas ${nw(buyStaged.weeks, true)} semanas de ${longDate(weekStart(buyStaged.window[0]))} a ${longDate(weekStart(buyStaged.window[1]))}, entre o P10 e o P90 da data simulada do mínimo, rende mais TC em ${prob(buyStaged.pBetter)} dos paths e uma median de ${moreTc(q50(buyStaged))}, enquanto seu pior décimo de paths termina com pelo menos ${moreTc(q10(buyStaged))}, ante ${moreTc(q10(by23('jun')))} para uma única compra na semana de junho. No modelo, cada path se afasta da curva seasonal por um random walk, de modo que, quando a janela se abre, a maior parte da dispersão entre paths já se acumulou; tirar a média de suas semanas remove pouco dela e acrescenta semanas distantes do mínimo típico. O mesmo vale para quem tem TC: vender metade hoje e metade na semana de ${longDate(weekStart(decNov))} rende uma median de ${moreGold(q50(se23('half')))}, com o pior décimo dos paths em ${moreGold(q10(se23('half')))} ou pior, e vendas semanais iguais nas ${nw(sellStaged.weeks, true)} semanas de ${longDate(weekStart(sellStaged.window[0]))} a ${longDate(weekStart(sellStaged.window[1]))}, a janela simulada do peak, uma median de ${moreGold(q50(sellStaged))}, com o pior décimo em ${moreGold(q10(sellStaged))} ou pior. Escalonar troca, portanto, metade do risco de timing por metade do benefício esperado; não elimina o risco.`)}
    </div>
    <h3>${t('The Same Decisions in Past Cycles', 'As mesmas decisões em cycles anteriores')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${pastCycles.length ? para(`The completed cycles show what the same decisions delivered on ${bench}'s weekly medians, from the week holding ${dayMonth(antica.date)} to the corresponding weeks that followed. A gold holder who waited until the week holding ${dayMonth(weekStart(decJun))} of the following year obtained ${listChanges(pastCycles.map(c => c.buyJun), moreTc)} in the ${list(pastCycles.map(c => c.cycle))} ${pastCycles.length === 1 ? 'cycle' : 'cycles'}, and one who bought in the November week instead obtained ${listChanges(pastCycles.map(c => c.buyNov), moreTc)}. A TC holder who waited until the November week obtained ${listChanges(pastCycles.map(c => c.sellNov), moreGold)}, and one who waited until the following June, ${listChanges(pastCycles.map(c => c.sellJun), moreGold)}. ${buyerShrinks ? `The buyer's advantage from waiting has shrunk with each cycle, as the declines narrowed while the trend continued${sellerGrows ? ', whereas the seller\'s has grown' : ''}. ` : sellerGrows ? 'The seller\'s advantage from waiting has grown with each cycle. ' : ''}${capFirst(nw(pastCycles.length))} ${pastCycles.length === 1 ? 'cycle is an observation' : 'cycles are observations'} rather than probabilities; set against them, the model's medians are ${moreTc(q50(by23('jun')))} for the buyer in June and ${moreGold(q50(se23('nov')))} for the seller in November.`,
      `Os cycles completos mostram o que as mesmas decisões entregaram nas weekly medians de ${bench}, da semana que contém ${dayMonth(antica.date)} às semanas correspondentes seguintes. Quem tinha gold e esperou até a semana que contém ${dayMonth(weekStart(decJun))} do ano seguinte obteve ${listChanges(pastCycles.map(c => c.buyJun), moreTc)} ${pastCycles.length === 1 ? 'no cycle' : 'nos cycles'} ${list(pastCycles.map(c => c.cycle))}, e quem comprou na semana de novembro obteve ${listChanges(pastCycles.map(c => c.buyNov), moreTc)}. Quem tinha TC e esperou até a semana de novembro obteve ${listChanges(pastCycles.map(c => c.sellNov), moreGold)}, e quem esperou até o junho seguinte, ${listChanges(pastCycles.map(c => c.sellJun), moreGold)}. ${buyerShrinks ? `A vantagem de esperar para comprar diminuiu a cada cycle, à medida que as quedas se estreitaram e a trend continuou${sellerGrows ? ', ao passo que a de esperar para vender aumentou' : ''}. ` : sellerGrows ? 'A vantagem de esperar para vender aumentou a cada cycle. ' : ''}${capFirst(nw(pastCycles.length))} ${pastCycles.length === 1 ? 'cycle é uma observação' : 'cycles são observações'}, e não probabilidades; diante deles, as medians do modelo são ${moreTc(q50(by23('jun')))} para o comprador em junho e ${moreGold(q50(se23('nov')))} para o vendedor em novembro.`) : ''}
    </div>
    <div class="evidence-stack"><div id="card-decision-history"></div></div>
    </div>
    <div class="prose narrative-grid">
    ${para(`${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? `Taken together, the scenarios separate the two decisions in time rather than in direction. Under the model validated in ${chapterRef('s06')}, a TC holder has better odds selling into the late-year rise than today, and a gold holder has better odds buying in the mid-year decline than today; in each case, however,` : `Under the model validated in ${chapterRef('s06')}, selling in the November week beats selling today in ${prob(se23('nov').pBetter)} of the paths and buying in the June week beats buying today in ${prob(by23('jun').pBetter)}; in each case`} the median advantage is a few per cent against a range of outcomes several times wider, the odds move materially with the training window${antica.costPct < buyEdge ? `, taking offers is cheaper than making them at ${bench}'s spread` : ''}${buyerShrinks ? ', and the observed cycles show the buyer\'s advantage shrinking' : ''}. The figures therefore price the trade-off of waiting; they do not show an advantage large or certain enough to make acting today a mistake. How far ${bench}'s path carries over to other worlds is the subject of ${chapterRef('s05')}.`,
      `${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? `Em conjunto, os scenarios separam as duas decisões no tempo, e não na direção. Sob o modelo validado na ${chapterRef('s06')}, quem tem TC tem melhores chances vendendo durante a alta de fim de ano do que hoje, e quem tem gold tem melhores chances comprando na queda de meio de ano do que hoje; em cada caso, porém,` : `Sob o modelo validado na ${chapterRef('s06')}, vender na semana de novembro supera vender hoje em ${prob(se23('nov').pBetter)} dos paths, e comprar na semana de junho supera comprar hoje em ${prob(by23('jun').pBetter)}; em cada caso,`} a vantagem mediana é de poucos por cento diante de uma faixa de resultados várias vezes mais ampla, as chances variam materialmente com a training window${antica.costPct < buyEdge ? `, aceitar offers é mais barato do que criá-las com o spread de ${bench}` : ''}${buyerShrinks ? ' e os cycles observados mostram a vantagem do comprador diminuindo' : ''}. Os números precificam, portanto, o trade-off de esperar; não mostram uma vantagem grande ou certa o bastante para tornar um erro agir hoje. Até que ponto o path de ${bench} se transfere para outros worlds é o tema da ${chapterRef('s05')}.`)}
    </div>
  </section>`,
  s05: `
  <section class="block" id="s05">
    ${sectionHeading('s05')}
    <div class="prose narrative-grid">
    ${para(`${chapterSpan('s03', 'decisions', true)} rest on a single benchmark. Whether their conclusions extend to the other ${worlds.length - 1} worlds depends on how stable each world's relative value is, how closely its price moves with ${bench}, how volatile it is and whether a merger or a level shift has broken its history. This section extends the analysis cross-sectionally, with ${bench} as the reference throughout. Because observation frequency, PvP type, BattlEye and Market composition differ across worlds, the associations it reports describe heterogeneity without isolating the causal effect of any of these characteristics.`,
      `${chapterSpan('s03', 'decisions', true)} se apoiam em um único benchmark. Se suas conclusões se estendem aos outros ${worlds.length - 1} worlds depende de quão estável é o relative value de cada world, de quão de perto seu price acompanha ${bench}, de quão volátil ele é e de uma merger ou level shift ter rompido seu histórico. Esta seção estende a análise de forma cross-sectional, com ${bench} como referência em todo o percurso. Como frequência de observação, tipo de PvP, BattlEye e composição do Market diferem entre worlds, as associações aqui relatadas descrevem heterogeneidade sem isolar o efeito causal de nenhuma dessas características.`)}
    </div>
    <h3>${t('Relative Value across Worlds', 'Relative value entre worlds')}</h3>
    <div class="prose narrative-grid">
    ${para(`The relative premium of world ${tex('w')} compares the same side and the same week with ${bench},`,
      `O relative premium do world ${tex('w')} compara o mesmo lado e a mesma semana com ${bench},`)}
    ${math(String.raw`\pi^{w}_t = \frac{P^{w}_t}{P^{A}_t} - 1,`)}
    ${para(`computed on weekly medians whenever both worlds have a quote and, at the cutoff, as the median of capture pairs between ${captureBetween}, each capture paired with ${bench} on the same day${histPaired.length ? `; without a capture, ${list(histPaired)} ${histPaired.length > 1 ? 'use' : 'uses'} the last historical offer paired with ${bench} on the same date` : ''}${noPair.length ? `, and ${list(noPair)} ${noPair.length > 1 ? 'have' : 'has'} no comparison because ${bench} has no quote on that date` : ''}. A single capture is a noisy measure of relative value, since between captures on different days the premium moves by ${fmt(capSteps.reduce((a, b) => a + b, 0) / capSteps.length, 1)} pp on average and by up to ${fmt(Math.max(...capSteps), 0)} pp. Weekly correlations with the benchmark use changes in weekly medians, whose smoothing can inflate dependence; the lead-lag analysis instead uses the last valid quote of each week.`,
      `calculado sobre weekly medians sempre que os dois worlds têm quote e, no cutoff, como a median dos pares de capturas entre ${captureBetween}, cada captura pareada com ${bench} no mesmo dia${histPaired.length ? `; sem captura, ${list(histPaired)} ${histPaired.length > 1 ? 'usam' : 'usa'} a última offer histórica pareada com ${bench} na mesma data` : ''}${noPair.length ? `, e ${list(noPair)} ${noPair.length > 1 ? 'ficam' : 'fica'} sem comparação porque ${bench} não tem quote nessa data` : ''}. Uma captura isolada é uma medida ruidosa do relative value, pois, entre capturas de dias diferentes, o premium muda em média ${fmt(capSteps.reduce((a, b) => a + b, 0) / capSteps.length, 1)} pp e até ${fmt(Math.max(...capSteps), 0)} pp. As correlations semanais com o benchmark usam variações das weekly medians, cuja suavização pode inflar a dependência; a análise de lags usa, em vez disso, a última quote válida de cada semana.`)}
    </div>
    <div class="analysis-row"><div class="prose" id="relative-prose"></div><div class="evidence-stack"><div id="card-premium-chart"></div><div id="card-groups"></div></div></div>
    <div id="card-premium-table"></div>
    <div id="card-groups-quarter"></div>
    <div class="prose narrative-grid">${para(`These differences matter because the scenarios of every world other than ${bench} rest on the transfer rule of ${chapterRef('modeling')}, which assumes that relative value is stable. The transferability matrix tests that assumption world by world: it sets the out-of-sample record of the transferred path, scored against the world's own Constant at every week in which the world is quoted, beside the properties that should govern it, namely the stability of the premium over ${bench}, the correlation of weekly changes, the length of the paired history and the world's type. At 13 weeks the transfer beats Constant with an interval above zero in ${nw(trBeats.length)} of the ${nw(trAsk.length)} worlds with enough origins, and its point estimate fails to beat Constant in ${nw(trNot.length)}. The ranking follows the premium: the rank correlation between premium instability and skill is ${fmt(trRho, 2)}, and the median instability is ${pctU(trStressBeats, 1)} where the transfer wins against ${pctU(trStressOthers, 1)} elsewhere.${trLeadGroup.length ? ` ${trLeadBeats.length ? `Only ${nw(trLeadBeats.length)} of the ${nw(trLeadGroup.length)}` : `None of the ${nw(trLeadGroup.length)}`} ${groupWorldsPhrase(Y)} tested ${trLeadBeats.length === 1 ? 'clears' : 'clear'} that bar${trend === 'down' ? ', and their premium has been compressing' : ''}: where relative value drifts, transferring ${bench}'s path adds noise rather than information.` : ''}`,
      `Essas diferenças importam porque os scenarios de todos os worlds diferentes de ${bench} se apoiam na regra de transferência da ${chapterRef('modeling')}, que pressupõe relative value estável. A matriz de transferabilidade testa esse pressuposto world a world: coloca o histórico out of sample do path transferido, avaliado ante o Constant do próprio world em cada semana em que o world tem quote, ao lado das propriedades que deveriam governá-lo, isto é, a estabilidade do premium sobre ${bench}, a correlação das variações semanais, a extensão do histórico pareado e o tipo do world. Em 13 semanas, a transferência supera o Constant com intervalo acima de zero em ${nw(trBeats.length)} dos ${nw(trAsk.length)} worlds com origins suficientes, e sua estimativa pontual não supera o Constant em ${nw(trNot.length)}. A ordenação acompanha o premium: a correlação de postos entre a instabilidade do premium e o skill é ${fmt(trRho, 2)}, e a instabilidade mediana é ${pctU(trStressBeats, 1)} onde a transferência vence, ante ${pctU(trStressOthers, 1)} nos demais.${trLeadGroup.length ? ` ${trLeadBeats.length ? `Apenas ${nw(trLeadBeats.length)} dos ${nw(trLeadGroup.length)}` : `Nenhum dos ${nw(trLeadGroup.length)}`} ${groupWorldsPhrase(Y)} testados ${trLeadBeats.length === 1 ? 'supera' : 'superam'} esse patamar${trend === 'down' ? ', e seu premium vem se comprimindo' : ''}: onde o relative value se desloca, transferir o path de ${bench} acrescenta ruído, e não informação.` : ''}`)}</div>
    <div id="card-transfer"></div>
    <h3 id="transfer-slope" data-report-anchor>${t('One-to-One Response or an Estimated Slope?', 'Resposta de um para um ou inclinação estimada?')}</h3>
    <div class="prose narrative-grid">
    ${para(`The proportional rule implies that each world responds one-for-one to ${bench}'s movement. An estimated relationship relaxes that assumption: for world ${tex('w')}, a slope ${tex(String.raw`\beta_w`)}, and optionally a drift ${tex(String.raw`\alpha_w`)}, are fitted to the world's own ${tex('h')}-week log changes on ${bench}'s over every span completed before the origin, with at least ${fmt(X.transfer.minPairs)} spans, and applied to ${bench}'s forecast change ${tex(String.raw`\hat g^{A}_{T,h}`)}:`,
      `A regra proporcional implica que cada world responde de um para um ao movimento de ${bench}. Uma relação estimada relaxa essa hipótese: para o world ${tex('w')}, uma inclinação ${tex(String.raw`\beta_w`)} e, opcionalmente, um drift ${tex(String.raw`\alpha_w`)} são ajustados às variações logarítmicas de ${tex('h')} semanas do próprio world sobre as de ${bench}, em todos os intervalos concluídos antes da origin, com pelo menos ${fmt(X.transfer.minPairs)} intervalos, e aplicados à variação prevista para ${bench}, ${tex(String.raw`\hat g^{A}_{T,h}`)}:`)}
    ${math(String.raw`\Delta_h \ln P^{w}_t = \alpha_w + \beta_w\, \Delta_h \ln P^{A}_t + \varepsilon_t, \qquad \hat P^{w}_{T+h} = P^{w}_T\, e^{\hat\beta_w \hat g^{A}_{T,h}} \;\text{(slope)}, \qquad \hat P^{w}_{T+h} = P^{w}_T\, e^{\hat\alpha_w + \hat\beta_w \hat g^{A}_{T,h}} \;\text{(drift)} .`)}
    ${para(`Scored at every origin of the rolling transfer test, on the ${fmt(TB.length)} combinations of world, side and horizon with enough spans, the slope rule has the lower error in ${fmt(slopePoint.length)}, but where two blocks of origins allow an interval it beats the one-to-one rule with an interval above zero in ${nw(slopeWins.length)} of ${fmt(TBci.length)} combinations and loses with one below zero in ${nw(slopeLoses.length)}; adding a drift ${driftWins.length ? `wins in ${nw(driftWins.length)}` : 'never wins'} and loses in ${nw(driftLoses.length)}. The estimated slopes centre on one: over the full history their median is ${fmt(betaMedian, 2)}, and ${fmt(betaOne.length)} of the ${fmt(TBnow.length)} slopes have a 95% interval containing one, ${fmt(betaBelow.length)} an interval wholly below it and ${fmt(betaAbove.length)} one wholly above. Out of sample, the one-to-one response is therefore ${slopeWins.length < slopeLoses.length || slopeWins.length <= 1 ? 'supported' : 'not clearly supported'}: the worlds whose slope differs from one do not differ stably enough for an estimated slope to forecast better, and a drift term adds estimation noise. Both alternative rules are nevertheless frozen for every world in the forecast ledger, so the prospective record can still overturn this verdict.`,
      `Avaliada em cada origin do teste móvel de transferência, nas ${fmt(TB.length)} combinações de world, lado e horizon com intervalos suficientes, a regra com inclinação tem o erro menor em ${fmt(slopePoint.length)}, mas, onde dois blocos de origins permitem um intervalo, supera a regra de um para um com intervalo acima de zero em ${nw(slopeWins.length, true)} de ${fmt(TBci.length)} combinações e perde com intervalo abaixo de zero em ${nw(slopeLoses.length, true)}; acrescentar um drift ${driftWins.length ? `vence em ${nw(driftWins.length, true)}` : 'nunca vence'} e perde em ${nw(driftLoses.length, true)}. As inclinações estimadas se concentram em um: no histórico completo, sua median é ${fmt(betaMedian, 2)}, e ${fmt(betaOne.length)} das ${fmt(TBnow.length)} inclinações têm intervalo de 95% que contém um, ${fmt(betaBelow.length)} têm intervalo inteiramente abaixo e ${fmt(betaAbove.length)}, inteiramente acima. Out of sample, a resposta de um para um é, portanto, ${slopeWins.length < slopeLoses.length || slopeWins.length <= 1 ? 'sustentada' : 'pouco sustentada'}: os worlds cuja inclinação difere de um não diferem de forma estável o bastante para que uma inclinação estimada preveja melhor, e um termo de drift acrescenta ruído de estimação. As duas regras alternativas ficam, ainda assim, congeladas para cada world no forecast ledger, de modo que o registro prospectivo ainda pode reverter esse veredito.`)}
    </div>
    <div id="card-transfer-slope"></div>
    <h3>${t('Relative Volatility and Sampling', 'Relative volatility e amostragem')}</h3>
    <div class="prose narrative-grid">
    ${para(`Volatility also differs across worlds, although sampling limits the comparison. Measured over the same weeks as ${bench}, the volatility of Sell Offers in other worlds ranges from ${fmt(Math.min(...ratios), 1)} to ${fmt(Math.max(...ratios), 1)} times that of ${bench}, but ${fewDays.length} of the ${volAsk.length} worlds are quoted on only one or two days a week, against daily quotes in ${bench}, so part of the difference reflects sampling rather than risk. Sparse quoting does not explain the whole ranking, however: ${topRatio.world}, with ${fmt(topRatio.medianDaysPerWeek)} quoted days a week, has the highest ratio (${fmt(topRatio.ratio, 1)}×)${dailyQuoted.length ? `, while ${list(dailyQuoted.map(x => `${x.world}, quoted almost daily, records ${fmt(x.ratio, 1)}×`))}` : ''}. ${breaks.length ? `${list(breaks)} ${breaks.length > 1 ? 'are' : 'is'} excluded from the range because of a level shift in the premium${breaks.length > 1 ? '' : ` in ${monthYear(cwOf(breaks[0], 'ask').breakWeek)}`}.` : ''}${volShort.length ? ` ${list(volShort)} ${volShort.length > 1 ? 'fall' : 'falls'} outside it for lack of the 10 paired weeks required.` : ''}`,
      `A volatility também difere entre worlds, embora a amostragem limite a comparação. Medida nas mesmas semanas de ${bench}, a volatility das Sell Offers nos demais worlds vai de ${fmt(Math.min(...ratios), 1)} a ${fmt(Math.max(...ratios), 1)} vezes a de ${bench}, mas ${fewDays.length} dos ${volAsk.length} worlds têm quote em apenas um ou dois dias por semana, ante quotes diárias em ${bench}, de modo que parte da diferença reflete amostragem, e não risco. Quotes esparsas, porém, não explicam toda a ordenação: ${topRatio.world}, com ${fmt(topRatio.medianDaysPerWeek)} dias cotados por semana, tem a maior razão (${fmt(topRatio.ratio, 1)}×)${dailyQuoted.length ? `, enquanto ${list(dailyQuoted.map(x => `${x.world}, com quotes quase diárias, registra ${fmt(x.ratio, 1)}×`))}` : ''}. ${breaks.length ? `${list(breaks)} ${breaks.length > 1 ? 'são excluídos' : 'é excluído'} do intervalo por causa de um level shift do premium${breaks.length > 1 ? '' : ` em ${monthYear(cwOf(breaks[0], 'ask').breakWeek)}`}.` : ''}${volShort.length ? ` ${list(volShort)} ${volShort.length > 1 ? 'ficam' : 'fica'} de fora por falta das 10 semanas pareadas exigidas.` : ''}`)}
    </div>
    <div id="card-vol-world"></div>
    <h3 id="announced-mergers" data-report-anchor>${t('Level Shifts and Mergers', 'Level shifts e mergers')}</h3>
    <div class="prose narrative-grid">
    ${breakRows.length ? para(`${breakRows.length > 1 ? `${capFirst(nw(breakRows.length))} worlds show` : 'One world shows'} a level shift in ${breakRows.length > 1 ? 'their' : 'its'} Sell Offers premium over ${bench}: ${joinClauses(breakRows.map(r => `${r.world}, whose premium moved from ${sgn(r.preBreak8Pct)} in the eight weeks to ${dayMonth(r.preBreak8End)} to ${sgn(r.recentPremiumPct)} from the week of ${dayMonth(r.breakWeek)}${breakStep(r)}`), '; ', '; and ')}. ${(() => { const young = breakRows.filter(r => !W[r.world].mergerDate), merging = breakRows.filter(r => W[r.world].mergerDate);
        return `${young.length ? `${young.length > 1 ? 'The shifts' : 'The shift'} of ${list(young.map(r => r.world))} ${young.length > 1 ? 'come' : 'comes'} early in short histories, so the new ${young.length > 1 ? 'regimes' : 'regime'} of ${list(young.map(r => `${nw(r.segmentWeeks)} weeks`))} cannot yet establish ${young.length > 1 ? 'their' : 'its'} stability. ` : ''}${merging.map(r => `${r.world}'s shift ${r.world === donor && Math.abs(ms(r.breakWeek) - ms(L.ageAnalogy.transferOpened)) <= 2 * WEEK ? `coincides with the lifting of its transfer block on ${longDate(L.ageAnalogy.transferOpened)} and ` : ''}preceded the merger announcement by about ${Math.round((Date.parse(mergerFor(r.world).announcedOn) - Date.parse(r.breakWeek)) / 6048e5)} weeks, although the sample cannot establish what caused it. `).join('')}`; })()}Because each break ends the comparability of the earlier regime, ${list(breaks)} ${breaks.length > 1 ? 'are' : 'is'} compared only at the new level and ${breaks.length > 1 ? 'stay' : 'stays'} outside the premium chart and the group aggregates, although the stress band of ${breaks.length > 1 ? 'their scenarios' : 'its scenario'} still incorporates the shift.`,
      `${breakRows.length > 1 ? `${capFirst(nw(breakRows.length))} worlds apresentam` : 'Um world apresenta'} level shift no premium de Sell Offers sobre ${bench}: ${joinClauses(breakRows.map(r => `${r.world}, cujo premium passou de ${sgn(r.preBreak8Pct)} nas oito semanas até ${dayMonth(r.preBreak8End)} para ${sgn(r.recentPremiumPct)} a partir da semana de ${dayMonth(r.breakWeek)}${breakStep(r)}`), '; ', '; e ')}. ${(() => { const young = breakRows.filter(r => !W[r.world].mergerDate), merging = breakRows.filter(r => W[r.world].mergerDate);
        return `${young.length ? `${young.length > 1 ? 'Os shifts' : 'O shift'} de ${list(young.map(r => r.world))} ${young.length > 1 ? 'ocorrem' : 'ocorre'} cedo em históricos curtos, de modo que ${young.length > 1 ? 'os novos regimes' : 'o novo regime'}, de ${list(young.map(r => `${nw(r.segmentWeeks, true)} semanas`))}, ainda não ${young.length > 1 ? 'demonstram sua' : 'demonstra sua'} estabilidade. ` : ''}${merging.map(r => `O shift de ${r.world} ${r.world === donor && Math.abs(ms(r.breakWeek) - ms(L.ageAnalogy.transferOpened)) <= 2 * WEEK ? `coincide com a liberação de seus transfers, em ${longDate(L.ageAnalogy.transferOpened)}, e ` : ''}antecedeu o anúncio da merger em cerca de ${Math.round((Date.parse(mergerFor(r.world).announcedOn) - Date.parse(r.breakWeek)) / 6048e5)} semanas, embora a sample não permita estabelecer sua causa. `).join('')}`; })()}Como cada ruptura encerra a comparabilidade do regime anterior, ${list(breaks)} ${breaks.length > 1 ? 'são comparados' : 'é comparado'} apenas no novo nível e ${breaks.length > 1 ? 'ficam' : 'fica'} fora do gráfico de premium e dos agregados por grupo, embora a stress band ${breaks.length > 1 ? 'de seus scenarios' : 'de seu scenario'} ainda incorpore o shift.`) : ''}
    ${relevantMergers.map(event => para(`${mergerFacts(event, true)} Because a merger can change both the supply of and the demand for TC, the validity of the individual scenarios is confined to the pre-merger regime, whose price relationships do not determine ${event.successor}'s equilibrium; the analytical horizon therefore ends before ${longDate(event.confirmedDate || event.notBefore)}${event.confirmedDate ? ', the date confirmed for the operation' : ', the first possible date, adopted as a conservative limit while the effective date remains undetermined'}. ${mergerScope(event)}`,
      `${mergerFacts(event, true)} Como uma merger pode alterar tanto a oferta quanto a demanda por TC, a validade dos scenarios individuais se restringe ao regime anterior à merger, cujas relações de price não determinam o equilíbrio de ${event.successor}; o horizon analítico termina, portanto, antes de ${longDate(event.confirmedDate || event.notBefore)}${event.confirmedDate ? ', data confirmada para a operação' : ', a primeira data possível, adotada como limite conservador enquanto a data efetiva permanece indefinida'}. ${mergerScope(event)}`)).join('')}
    </div>
    <h3 id="server-age" data-report-anchor>${t('Predecessor and Server-Age Information for Young Worlds', 'Informação de predecessors e de server age para worlds recentes')}</h3>
    <div class="prose narrative-grid">
    ${para(`Young and merged worlds pose the hardest test of the transfer rule, because their histories are short and, in a merged world, begin only at the merger. Two exploratory rules ask whether information from outside a world's own history improves on the benchmark control, ${tex(String.raw`\hat P^{\text{Bench}}_{T+h} = P_T\, e^{\,r^{A}_h}`)}, where ${tex('r^{A}_h')} is the median log return of ${bench} over ${tex('h')} weeks in the previous 104 weeks, with at least ten pairs. For ${L.terribra.world}, the Predecessor rule adds to that control an equal-weight combination of the median change in ${L.terribra.world}'s own log premium, ${tex(String.raw`\tilde r^{\,\text{loc}}_h`)}, and the mean of the medians of the predecessors eligible before the merger, ${tex(String.raw`\bar r^{\,\text{pred}}_h`)}:`,
      `Worlds recentes e resultantes de merger impõem o teste mais difícil à regra de transferência, pois seus históricos são curtos e, em um world resultante de merger, começam apenas na merger. Duas regras exploratórias verificam se informação externa ao histórico do próprio world melhora o controle do benchmark, ${tex(String.raw`\hat P^{\text{Bench}}_{T+h} = P_T\, e^{\,r^{A}_h}`)}, em que ${tex('r^{A}_h')} é a median dos log returns de ${bench} em ${tex('h')} semanas nas 104 semanas anteriores, com pelo menos dez pares. Para ${L.terribra.world}, a regra Predecessor acrescenta a esse controle uma combinação de pesos iguais entre a median da variação do log premium do próprio ${L.terribra.world}, ${tex(String.raw`\tilde r^{\,\text{loc}}_h`)}, e a mean das medians dos predecessors elegíveis antes da merger, ${tex(String.raw`\bar r^{\,\text{pred}}_h`)}:`)}
    ${math(String.raw`\hat P^{\text{Pred}}_{T+h} = P_T \exp\!\left(r^{A}_h + \tfrac{1}{2}\,\tilde r^{\,\text{loc}}_h + \tfrac{1}{2}\,\bar r^{\,\text{pred}}_h\right).`)}
    ${para(`Each predecessor needs three returns at the horizon and contributes only changes within its own series, so its price levels never become quotes of the new world, and the comparison with the Local rule, which uses ${L.terribra.world}'s median alone, combines predecessor information with a halving of the local term, so it does not isolate the predecessors' incremental contribution. For ${target}, the server-age analogy aligns ${donor}'s history with ${target}'s by days since each world's official launch: Age Raw applies to ${target}'s last offer the ratio of ${donor}'s prices at the corresponding ages, whereas Age Relative applies to the benchmark control the change in ${donor}'s log premium between those ages, which removes part of the common calendar movement. Endpoints consult only data available at each weekly origin, with a tolerance of three days (seven for the age donor), and the main age comparison ends before ${donor}'s transfer opening on ${longDate(L.ageAnalogy.transferOpened)}, while a pre-merger variant admits the later regime.`,
      `Cada predecessor precisa de três returns no horizon e contribui apenas com variações dentro da própria série, de modo que seus price levels nunca se tornam quotes do novo world, e a comparação com a regra Local, que usa apenas a median de ${L.terribra.world}, combina informação dos predecessors com a redução à metade do termo local, sem isolar a contribuição incremental dos predecessors. Para ${target}, a analogia de server age alinha o histórico de ${donor} ao de ${target} pelos dias desde o launch oficial de cada world: Age Raw aplica à última offer de ${target} a razão entre os prices de ${donor} nas idades correspondentes, enquanto Age Relative aplica ao controle do benchmark a variação do log premium de ${donor} entre essas idades, o que remove parte do movimento comum de calendário. Os endpoints consultam apenas dados disponíveis em cada origin semanal, com tolerância de três dias (sete para o donor por server age), e a comparação principal por server age termina antes da abertura de transfers de ${donor}, em ${longDate(L.ageAnalogy.transferOpened)}, enquanto uma variante pre-merger admite o regime posterior.`)}
    </div>
    ${pred ? `<div class="predecessor-note"><div class="prose prose--spaced">${para(`The predecessors describe the markets that preceded ${L.terribra.world}, but their quotes are not observations of the successor: ${R.predecessor.map(p => `${p.world} has ${p.days} valid days between ${longDate(p.first)} and ${longDate(p.last)}`).join(', while ')}. They are therefore kept as separate series, and the matched backtest below evaluates their predictive content by comparing the rule that uses them with its alternatives on the same targets.`,
      `Os predecessors descrevem os Markets que antecederam ${L.terribra.world}, mas suas quotes não são observações do successor: ${R.predecessor.map(p => `${p.world} tem ${p.days} dias válidos entre ${longDate(p.first)} e ${longDate(p.last)}`).join(', enquanto ')}. Por isso, permanecem como séries separadas, e o backtest pareado abaixo avalia seu conteúdo preditivo comparando a regra que as utiliza com suas alternativas nos mesmos alvos.`)}</div>
    <div id="card-predecessor"></div></div>` : ''}
    <div class="analysis-row"><div class="prose">
    ${para(`Aligning the two worlds by server age shifts ${donor}'s calendar onto ${target}'s, so that prices in gold can be compared at the same stage since launch, before ${donor}'s transfer opening, without normalising the worlds to a common level. ${ageCoverage.length === 2 ? `Neither period since launch is fully observed, because ${list(ageCoverage.map(r => `${r.world}'s first valid offer came at ${r.firstAgeDays} days of age`))}. ` : ''}The pair is relevant because it shares region and PvP type, but launch cohort, calendar, population, free-account access (${donor}'s Premium restriction was removed on ${longDate('2025-07-29')})${note('luzibraPremium')} and transfers remain confounded with age, so the analogy is a hypothesis about a trajectory, whose usefulness depends on the backtests and on the distance between regimes, not a claim that ${donor} is ${target}'s future.`,
      `Alinhar os dois worlds pela server age desloca o calendário de ${donor} para o de ${target}, de modo que os prices em gold podem ser comparados no mesmo estágio desde o launch, antes da abertura de transfers de ${donor}, sem normalizar os worlds a um nível comum. ${ageCoverage.length === 2 ? `Nenhum dos períodos desde o launch é integralmente observado, pois ${list(ageCoverage.map(r => `a primeira offer válida de ${r.world} ocorreu aos ${r.firstAgeDays} dias de idade`))}. ` : ''}O par é relevante porque compartilha região e tipo de PvP, mas launch cohort, calendário, população, acesso de free accounts (a restrição Premium de ${donor} foi removida em ${longDate('2025-07-29')})${note('luzibraPremium')} e transfers continuam confundidos com a idade, de modo que a analogia é uma hipótese sobre uma trajetória, cuja utilidade depende dos backtests e da distância entre regimes, e não uma afirmação de que ${donor} é o futuro de ${target}.`)}
    </div><div id="card-age-curve"></div></div>
    <div class="prose narrative-grid" id="lifecycle-validation" data-report-anchor>
    <p>${t('The matched backtests compare the candidates on the same observed targets for each side and horizon, so a lower MAPE indicates a smaller error on that paired set; because the origins overlap, their number overstates the independent evidence.', 'Os backtests pareados comparam os candidatos nos mesmos alvos observados para cada lado e horizon, de modo que um MAPE menor indica erro menor nesse conjunto pareado; como as origins se sobrepõem, seu número superestima a evidência independente.')} <span id="lifecycle-findings"></span></p>
    </div>
    <div class="analysis-row"><div id="card-precursor-test"></div><div id="card-age-test"></div></div>
    <div class="prose narrative-grid" id="lifecycle-scenarios" data-report-anchor>
    ${para(`Applied to the latest observation, the two rules yield exploratory forecasts in gp/TC. They carry two limits: the age analogy has no eligible backtest yet, and the values are neither confidence bands nor executable order books. For ${target}, the pre-merger variant uses only the part of ${donor}'s history already observed, even when ${target}'s horizon extends beyond the ${mergerDateLabel(mergerFor(donor))} of ${donor}'s merger.`,
      `Aplicadas à última observação, as duas regras produzem forecasts exploratórios em gp/TC. Eles têm dois limites: a analogia de server age ainda não tem backtest elegível, e os valores não são confidence bands nem order books executáveis. Para ${target}, a variante pre-merger usa apenas a parte do histórico de ${donor} já observada, mesmo quando o horizon de ${target} ultrapassa a ${mergerDateLabel(mergerFor(donor))} da merger de ${donor}.`)}
    </div>
    <div class="analysis-row"><div id="card-precursor-scenario"></div><div id="card-age-scenario"></div></div>
    <div class="prose narrative-grid">
    ${para(`Neither exercise identifies a causal effect, and neither rule has been validated across several mergers or cohorts.`,
      `Nenhum dos exercícios identifica um efeito causal, e nenhuma das regras foi validada em vários mergers ou cohorts.`)}
    </div>
    <h3>${t('World-Level Scenarios', 'Scenarios por world')}</h3>
    <div class="section-intro">
    <div class="prose">
    ${para(`The world-level scenarios apply the transfer rule of ${chapterRef('modeling')} from anchors fixed at the cutoff of ${longDate(R.asOf)}, and the matrix above states where it has worked. ${(() => { const nt = worlds.filter(w => !w.testN).map(w => w.world), d = worlds.filter(w => w.askLocalStressBasis !== '13 semanas').map(w => w.world); return `${nt.length ? `${list(nt)} ${nt.length > 1 ? 'have' : 'has'} no quarterly test origin with an own quote, so the transfer has no backtest there. ` : ''}${d.length ? `With fewer than five pairs of 13-week premium changes, the local stress of ${list(d)} uses the dispersion of the premium. ` : ''}`; })()}${noCapture.length ? `Without a capture by ${cutoffDay}, ${list(noCapture.map(w => w.world))} ${noCapture.length > 1 ? 'are' : 'is'} anchored on the last valid API offer, which makes the scenario conditional. ` : ''}${worlds.filter(w => w.crossedWeeks).length ? `In ${list(worlds.filter(w => w.crossedWeeks).map(w => `${w.world} (${w.crossedWeeks} weeks)`))}, the base Buy Offers scenario reaches the Sell Offers scenario, so those weeks do not describe a possible order book. ` : ''}Confidence remains limited wherever a merger has been announced, the anchor is stale or fewer than ten tests exist.`,
      `Os scenarios por world aplicam a regra de transferência da ${chapterRef('modeling')} a partir de anchors fixadas no cutoff de ${longDate(R.asOf)}, e a matriz acima indica onde ela funcionou. ${(() => { const nt = worlds.filter(w => !w.testN).map(w => w.world), d = worlds.filter(w => w.askLocalStressBasis !== '13 semanas').map(w => w.world); return `${nt.length ? `${list(nt)} não ${nt.length > 1 ? 'têm' : 'tem'} origin trimestral de teste com quote própria, de modo que a transferência fica sem backtest. ` : ''}${d.length ? `Com menos de cinco pares de variação do premium em 13 semanas, o local stress de ${list(d)} usa a dispersão do premium. ` : ''}`; })()}${noCapture.length ? `Sem captura até ${cutoffDay}, ${list(noCapture.map(w => w.world))} ${noCapture.length > 1 ? 'são ancorados' : 'é ancorado'} na última offer válida da API, o que torna o scenario condicional. ` : ''}${worlds.filter(w => w.crossedWeeks).length ? `Em ${list(worlds.filter(w => w.crossedWeeks).map(w => `${w.world} (${w.crossedWeeks} semanas)`))}, o base scenario de Buy Offers alcança o de Sell Offers, de modo que essas semanas não descrevem um order book possível. ` : ''}A confiança permanece limitada sempre que há merger anunciada, anchor defasada ou menos de dez testes.`)}
    </div>
    <div class="controls">
      ${worldControl({all: true})}
    </div>
    </div>
    <div id="card-world-daily"></div>
    <div class="grid2"><div id="card-world-history"></div><div id="card-world-projection"></div></div>
    <div class="analysis-row"><div id="card-scenario-table"></div><div class="prose" id="selected-context"></div></div>
    <h3 id="individual-title" hidden>${t('Individual Analysis', 'Análise individual')}</h3>
    <div class="dossiers" id="dossiers"></div>
    <div class="prose narrative-grid">
    ${para(`The cross-sectional evidence therefore qualifies the temporal argument without overturning it. The other worlds move with ${bench} ${lag0.r > offLag ? 'mainly within the same week' : 'without a single dominant lag'}, but relative value is neither uniform nor stable: premiums differ by group${trend === 'down' ? ', have compressed in the group with the highest premium' : ''}${breaks.length ? `, break abruptly in ${list(breaks)}` : ''} and lose their meaning at a merger. ${chapterRef('robustness', true)} asks whether these conclusions, and the temporal findings beneath them, survive alternative measurements and specifications.`,
      `A evidência cross-sectional qualifica, portanto, o argumento temporal sem derrubá-lo. Os demais worlds se movem com ${bench} ${lag0.r > offLag ? 'principalmente na mesma semana' : 'sem um lag dominante'}, mas o relative value não é uniforme nem estável: os premiums diferem por grupo${trend === 'down' ? ', comprimiram-se no grupo de maior premium' : ''}${breaks.length ? `, sofrem rupturas abruptas em ${list(breaks)}` : ''} e perdem sentido em uma merger. A ${chapterRef('robustness')} verifica se essas conclusões, e os resultados temporais em que se apoiam, resistem a medições e especificações alternativas.`)}
    </div>
  </section>`,
  robustness: `
  <section class="block" id="robustness">
    ${sectionHeading('robustness')}
    <div class="prose narrative-grid">
    ${para(`The principal findings could be artefacts of how the market was measured, aggregated or dated. This section tests them against alternative specifications, an alternative price measure and calendar effects, without adjusting the scenarios, because detecting a difference is not the same as gaining predictive capacity.`,
      `Os principais resultados poderiam ser artefatos da forma como o Market foi medido, agregado ou datado. Esta seção os testa contra especificações alternativas, uma medida alternativa de price e efeitos de calendário, sem ajustar os scenarios, porque detectar uma diferença não equivale a ganhar capacidade preditiva.`)}
    </div>
    <h3>${t('Alternative Specifications and Reproducibility', 'Especificações alternativas e reprodutibilidade')}</h3>
    <div class="prose narrative-grid">
    ${para(`Alternative specifications test the findings that matter most. Reversal thresholds from 3% to 10% leave the dating of the later cycles unchanged from ${fmt(Math.min(...stable))}% to ${fmt(Math.max(...stable))}%, as ${chapterRef('s03')} showed, and the training window, the seed, the specification and the starting capture of the probabilistic model are compared in ${chapterRef('downside')}. Comparing weekly medians with one point per week tests whether persistence is an artefact of aggregation, and ${acf[0].r < acf[0].rWeeklyMedian ? 'at the first lag it largely is' : 'at the first lag it is not'}: the first-order autocorrelation of ${fmt(acf[0].rWeeklyMedian, 2)} in weekly medians becomes ${fmt(acf[0].r, 2)} with one point per week and ${fmt(acf[0].rDeseasonalised, 2)} once the annual cycle is removed.`,
      `Especificações alternativas testam os resultados mais importantes. Thresholds de reversal de 3% a 10% mantêm a datação dos cycles posteriores de ${fmt(Math.min(...stable))}% a ${fmt(Math.max(...stable))}%, como a ${chapterRef('s03')} mostrou, e a training window, a seed, a especificação e a captura inicial do modelo probabilístico são comparadas na ${chapterRef('downside')}. Comparar weekly medians com um ponto por semana testa se a persistence é um artefato da agregação, e ${acf[0].r < acf[0].rWeeklyMedian ? 'no primeiro lag, em grande parte, o é' : 'no primeiro lag, não o é'}: a autocorrelation de primeira ordem de ${fmt(acf[0].rWeeklyMedian, 2)} nas weekly medians passa a ${fmt(acf[0].r, 2)} com um ponto por semana e a ${fmt(acf[0].rDeseasonalised, 2)} após a remoção do cycle anual.`)}
    ${para(`The reference specification received with the research package estimated probabilities on an index of <em>daily averages</em> of 71 worlds, which its documentation does not allow to be classified as prices of executed trades, combining a linear trend, two annual harmonics and ARIMA(1,1,0) errors over ${fmt(PK.model.n_paths)} paths with parameter uncertainty. Its own repetition with ${nw(PK.stability.length)} seeds (${PK.stability.map(s => s.seed).join(', ')}) moves the estimates by up to ${fmt(pkgSeedSpread * 100, 1)} pp and the median peak by ${fmt(PK.stabilityRange.peak_p50[1] - PK.stabilityRange.peak_p50[0])} gp, which indicates little simulation noise but <strong>validates neither the specification nor its calibration</strong>. Its published forecast cannot be reproduced byte for byte, because its seed fixes only the parameter draws while the shocks use an unseeded generator: with seed 11, the median peak is ${fmt(PK.seed11VsPublished.peakP50[0])} against ${fmt(PK.seed11VsPublished.peakP50[1])} in the published file, although the probabilities agree to two decimal places. By contrast, <code>complement.json</code> is reproduced byte for byte from the frozen inputs, with the cleaning, server day and weekly series of the main analysis and fixed seeds for every draw.`,
      `A especificação de referência recebida com o pacote de pesquisa estimava probabilities sobre um índice de <em>daily averages</em> de 71 worlds, cuja documentação não permite classificá-las como prices de executed trades, combinando trend linear, dois harmonics anuais e erros ARIMA(1,1,0) em ${fmt(PK.model.n_paths)} paths, com incerteza de parâmetros. Sua própria repetição com ${nw(PK.stability.length, true)} seeds (${PK.stability.map(s => s.seed).join(', ')}) move as estimativas em até ${fmt(pkgSeedSpread * 100, 1)} pp e a median do peak em ${fmt(PK.stabilityRange.peak_p50[1] - PK.stabilityRange.peak_p50[0])} gp, o que indica pouco ruído de simulation, mas <strong>não valida a especificação nem sua calibration</strong>. Seu forecast publicado não pode ser reproduzido byte a byte, porque sua seed fixa apenas os parameter draws, enquanto os choques usam um gerador sem seed: com a seed 11, a median do peak é ${fmt(PK.seed11VsPublished.peakP50[0])}, ante ${fmt(PK.seed11VsPublished.peakP50[1])} no arquivo publicado, embora as probabilities coincidam em duas casas decimais. Em contraste, <code>complement.json</code> é reproduzido byte a byte a partir das entradas congeladas, com a limpeza, o server day e as séries semanais da análise principal e seeds fixas para todos os sorteios.`)}
    </div>
    <div id="card-seeds"></div>
    <h3 id="cleaning-floor" data-report-anchor>${t('The Buy/Sell Floor', 'O piso Buy/Sell')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The cleaning rule of ${chapterRef('s13')} drops every book whose best Buy Offer is below 80% of its best Sell Offer. To test whether a conclusion depends on that floor, the whole pipeline, from the daily series to the probabilities, round trips, inflation and the analyses of young worlds, was rerun with floors of ${list(frAlt.filter(r => r.floor !== null).map(r => fmt(r.floor, 2)))} and with no floor. In this edition the rule removes ${nw(frBase.excluded)} API records, ${excludedPhrase(frBase)}. Without a floor, every excluded record re-enters, including the ${bench} quotes whose Buy Offers stood near 1 gp, and changes ${nw(floorDays(noFloor))} daily ${floorDays(noFloor) === 1 ? 'value' : 'values'} per side, ${list(Object.entries(noFloor.changedDays).map(([w, x]) => t(`${nw(x.ask)} in ${w}`, `${nw(x.ask)} em ${w}`)))}, which moves the probabilities by at most ${fmt(noFloor.maxProbPp, 1)} pp and the out-of-sample errors by at most ${fmt(noFloor.maxMapePp, 3)} pp. ${floorMild.length ? `${capFirst(t('floors of', 'pisos de'))} ${list(floorMild.map(r => fmt(r.floor, 2)))} readmit ${floorDays(floorMild[0]) === 1 ? 'one daily value' : `${nw(floorDays(floorMild[0]))} daily values`} in ${list(floorWorlds(floorMild[0]))} and ${floorMild.every(sameHeadlines) ? 'leave every reported figure unchanged' : 'change a few reported figures slightly'}, and ` : ''}a floor of ${fmt(strictest.floor, 2)} removes ${nw(strictest.excluded - frBase.excluded)} more records in ${nw(floorWorlds(strictest).length)} worlds${floorLost(strictest).length ? `, leaving ${lostPhrase(floorLost(strictest))} without a supporting quote` : ''}. ${floorFlips.length ? `${capFirst(nw(floorFlips.length))} stated ${floorFlips.length === 1 ? 'conclusion reverses' : 'conclusions reverse'}: ${list(floorFlips.map(f => `${f.statement} (${floorName(f.floor)})`))}.` : 'No conclusion the report states reverses under any floor: the rule removes recording errors, not the evidence the conclusions rest on.'}`,
      `A regra de limpeza da ${chapterRef('s13')} descarta todo book cuja melhor Buy Offer fique abaixo de 80% da melhor Sell Offer. Para testar se alguma conclusão depende desse piso, todo o pipeline, da série diária às probabilidades, round trips, inflation e análises dos worlds recentes, foi refeito com pisos de ${list(frAlt.filter(r => r.floor !== null).map(r => fmt(r.floor, 2)))} e sem piso. Nesta edição, a regra remove ${nw(frBase.excluded)} registros da API, ${excludedPhrase(frBase)}. Sem piso, todos os registros excluídos voltam, inclusive as quotes de ${bench} cujas Buy Offers estavam perto de 1 gp, e alteram ${nw(floorDays(noFloor))} ${floorDays(noFloor) === 1 ? 'valor diário' : 'valores diários'} por lado, ${list(Object.entries(noFloor.changedDays).map(([w, x]) => t(`${nw(x.ask)} in ${w}`, `${nw(x.ask)} em ${w}`)))}, o que move as probabilidades em no máximo ${fmt(noFloor.maxProbPp, 1)} pp e os erros out of sample em no máximo ${fmt(noFloor.maxMapePp, 3)} pp. ${floorMild.length ? `Pisos de ${list(floorMild.map(r => fmt(r.floor, 2)))} readmitem ${floorDays(floorMild[0]) === 1 ? 'um valor diário' : `${nw(floorDays(floorMild[0]))} valores diários`} em ${list(floorWorlds(floorMild[0]))} e ${floorMild.every(sameHeadlines) ? 'deixam inalterados todos os números do relatório' : 'alteram ligeiramente alguns números do relatório'}, e ` : ''}um piso de ${fmt(strictest.floor, 2)} remove ${nw(strictest.excluded - frBase.excluded)} registros a mais em ${nw(floorWorlds(strictest).length)} worlds${floorLost(strictest).length ? `, deixando ${lostPhrase(floorLost(strictest))} sem quote de apoio` : ''}. ${floorFlips.length ? `${capFirst(nw(floorFlips.length, true))} ${floorFlips.length === 1 ? 'conclusão se inverte' : 'conclusões se invertem'}: ${list(floorFlips.map(f => `${f.statement} (${floorName(f.floor)})`))}.` : 'Nenhuma conclusão do relatório se inverte sob qualquer piso: a regra remove erros de registro, e não a evidência em que as conclusões se apoiam.'}`)}
    </div>
    <div class="evidence-stack"><div id="card-filter"></div></div>
    </div>
    <h3 id="anchor-window" data-report-anchor>${t('One Capture or a Window of Captures', 'Uma captura ou uma janela de capturas')}</h3>
    <div class="prose narrative-grid">
    ${para(`The anchor rule carries the same kind of exposure, because every scenario starts from the latest capture, which may be one reading of a thin book. Comparing it, world by world, with the median of the same world's captures in the 24 and 72 hours up to it shows how far one quote moves a scenario. ${alone.length ? `${list(alone.map(x => x.world))} ${alone.length === 1 ? 'has' : 'have'} no other capture within 24 hours${alone72.length ? `, ${alone72.length === alone.length ? 'nor' : 'and ' + list(alone72.map(x => x.world)) + ' none'} within 72` : ''}` : 'Every world has at least two captures within 24 hours'}; across worlds and sides, the latest capture differs from the 72-hour median by a median of ${pctU(median(devs72), 1)} and at most ${pctU(Math.abs(worstDev.dev), 1)}, in ${worstDev.world}'s ${SIDES[worstDev.side]}. Because a world's scenario scales with its own anchor, the whole path moves in the same proportion; the move exceeds the world's round-trip execution cost only ${devOverCost.length ? `in ${list(devOverCost.map(x => `${x.world} (${SIDES[x.side]}, ${sgn(x.dev)} against a cost of ${pctU(x.cost)})`))}` : 'in no world'}, and ${devOverBand.length ? `exceeds the half-width of the 13-week stress band in ${list(devOverBand.map(x => x.world))}` : 'never exceeds the half-width of the world\'s 13-week stress band'}. For ${bench}, the probabilities and economics restarted from the two medians, in ${chapterRef('downside')}, change by at most ${fmt(aaMaxPp, 1)} pp. Isolated quotes therefore move the scenarios less than the uncertainty already stated around them${devOverCost.length ? `, although in ${list([...new Set(devOverCost.map(x => x.world))])} the choice of anchor matters more than crossing the spread` : ''}.`,
      `A regra da anchor tem o mesmo tipo de exposição, porque todo scenario parte da captura mais recente, que pode ser uma única leitura de um book raso. Compará-la, world a world, com a median das capturas do mesmo world nas 24 e 72 horas até ela mostra quanto uma quote move um scenario. ${alone.length ? `${list(alone.map(x => x.world))} não ${alone.length === 1 ? 'tem' : 'têm'} outra captura em 24 horas${alone72.length ? `, ${alone72.length === alone.length ? 'nem' : 'e ' + list(alone72.map(x => x.world)) + ' nenhuma'} em 72` : ''}` : 'Todo world tem pelo menos duas capturas em 24 horas'}; entre worlds e lados, a captura mais recente difere da median de 72 horas por uma median de ${pctU(median(devs72), 1)} e no máximo ${pctU(Math.abs(worstDev.dev), 1)}, nas ${SIDES[worstDev.side]} de ${worstDev.world}. Como o scenario de um world escala com sua própria anchor, o path inteiro se move na mesma proporção; o movimento supera o round-trip execution cost do world apenas ${devOverCost.length ? `em ${list(devOverCost.map(x => `${x.world} (${SIDES[x.side]}, ${sgn(x.dev)} ante um cost de ${pctU(x.cost)})`))}` : 'em nenhum world'}, e ${devOverBand.length ? `supera a meia largura da stress band de 13 semanas em ${list(devOverBand.map(x => x.world))}` : 'nunca supera a meia largura da stress band de 13 semanas do world'}. Para ${bench}, as probabilidades e a economia reiniciadas a partir das duas medians, na ${chapterRef('downside')}, mudam no máximo ${fmt(aaMaxPp, 1)} pp. Quotes isoladas movem, portanto, os scenarios menos do que a incerteza já declarada em torno deles${devOverCost.length ? `, embora em ${list([...new Set(devOverCost.map(x => x.world))])} a escolha da anchor pese mais do que atravessar o spread` : ''}.`)}
    </div>
    <div id="card-anchors"></div>
    <div class="prose narrative-grid">
    ${para(`Two choices remain untested in full: the daily-average diagnostic below depends on a temporal alignment that the provider has not confirmed, and sparse series limit local comparisons, so the conclusions that use them remain conditional on the documented rules.`,
      `Duas escolhas permanecem sem teste completo: o diagnóstico de daily averages abaixo depende de um alinhamento temporal que o provedor não confirmou, e séries esparsas limitam comparações locais, de modo que as conclusões que as usam permanecem condicionadas às regras documentadas.`)}
    </div>
    <h3 id="s10" data-report-anchor>${t('Offers versus Daily Averages', 'Offers versus daily averages')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The alternative price measure replaces offers with the provider's daily averages. For each world, side and day on which both exist, the gap`,
      `A medida alternativa de price substitui as offers pelas daily averages do provedor. Para cada world, lado e dia em que ambas existem, o gap`)}
    ${math(String.raw`\delta_t = \frac{\bar P^{\,\text{day}}_t}{P^{\,\text{offer}}_t} - 1`)}
    ${para(`is negative when the daily average lies below the comparable offer. Following the convention of the reference documentation, averages are assigned to the server day before collection without changing the date of the offers; because that alignment awaits confirmation, an additional same-day pairing tests the sensitivity to the shift, and the pairing covers up to 12 months ending on ${cutoffDay}, depending on each world's history. ${gapVerdict === 'unknown' ? `In ${bench}, offers and daily averages have too few paired days to be compared` : `In ${bench}, the median gap over ${fmt(tradeAntica('ask')?.n)} paired days is ${sgn(tradeAntica('ask')?.medianGapPct, 2)} for Sell Offers and ${sgn(tradeAntica('bid')?.medianGapPct, 2)} for Buy Offers, ${gapVerdict === 'close' ? 'so for the benchmark the two measures differ by less than one per cent' : gapVerdict === 'differ' ? 'so for the benchmark the two measures differ materially' : 'so the benchmark lacks the paired days needed to compare the two measures'}`}. Because a quote summarises an instant whereas an average covers a period, such gaps demonstrate neither error nor capturable profit nor execution at the best price, which is why daily averages never feed the models of offers.`,
      `é negativo quando a daily average fica abaixo da offer comparável. Seguindo a convenção da documentação de referência, as averages são atribuídas ao server day anterior à coleta sem alterar a data das offers; como esse alinhamento aguarda confirmação, um pareamento adicional no mesmo dia testa a sensibilidade ao deslocamento, e o pareamento cobre até 12 meses encerrados em ${cutoffDay}, conforme o histórico de cada world. ${gapVerdict === 'unknown' ? `Em ${bench}, offers e daily averages têm poucos dias pareados para serem comparadas` : `Em ${bench}, a median do gap em ${fmt(tradeAntica('ask')?.n)} dias pareados é ${sgn(tradeAntica('ask')?.medianGapPct, 2)} para Sell Offers e ${sgn(tradeAntica('bid')?.medianGapPct, 2)} para Buy Offers, ${gapVerdict === 'close' ? 'de modo que, no benchmark, as duas medidas diferem em menos de um por cento' : gapVerdict === 'differ' ? 'de modo que, no benchmark, as duas medidas diferem materialmente' : 'de modo que faltam ao benchmark os dias pareados necessários para comparar as duas medidas'}`}. Como uma quote resume um instante, enquanto uma average cobre um período, esses gaps não demonstram erro, profit capturável nem execution no best price, razão pela qual as daily averages nunca alimentam os modelos de offers.`)}
    </div>
    <div class="evidence-stack">${card({evidence: 'observed', title: 'World Comparison: Median Daily Average vs Offer Gap', sub: t('Median gap, %', 'Median do gap, %'), body: table({columns: [{key: 'world', label: 'Mundo'}, num('askN', 'Dias; Sell Offers'), percent('askGap', 'Sell Offers', 2), num('bidN', 'Dias; Buy Offers'), percent('bidGap', 'Buy Offers', 2)],
      rows: worlds.map(w => { const a = R.tradeComparison.find(x => x.world === w.world && x.side === 'ask'), b = R.tradeComparison.find(x => x.world === w.world && x.side === 'bid'); return {world: w.world, askN: a?.n, askGap: a?.medianGapPct, bidN: b?.n, bidGap: b?.medianGapPct}; })})})}
    </div>
    </div>
    <div id="card-trade"></div>
    <h3 id="s11" data-report-anchor>${t('Calendar Effects: Weekdays, Events and Placebos', 'Efeitos de calendário: dias da semana, eventos e placebos')}</h3>
    <div class="analysis-row">
    <div class="prose">
    ${para(`Weekday effects are estimated as the deviation of each day's offers from the median of the seven days around it, tested by block permutation within each week and corrected jointly across the four tests with a Holm correction;${note('holm1979')} because the window uses days on both sides, it describes history and is not a real-time signal. In ${bench}, the range across weekdays is ${pctU(wA.rangePct, 2)} in Sell Offers and ${pctU(wAb.rangePct, 2)} in Buy Offers, with corrected p-values of ${list(C.weekday.tests.filter(x => x.scope === bench).map(x => pv(x.pHolm)))}. In the other worlds, ${sparse.length} of ${cov.length} are quoted on a median of one or two days a week; when three quoted days are required in each window, ${Object.keys(wB.contributors).length} worlds contribute, of which ${topContributor[0]} supplies ${fmt(topContributor[1] / wB.n * 100, 0)}% of the days, and the tests give ${pIs(wB.pBlock)} in Sell Offers and ${pIs(wBb.pBlock)} in Buy Offers (${pv(wB.pHolm)} and ${pv(wBb.pHolm)} after correction). ${wdSig.length ? `${capFirst(list(wdSig.map(x => `the ${SIDES[x.side]} test in ${x.scope === bench ? bench : 'the other worlds'}`)))} survive${wdSig.length > 1 ? '' : 's'} the correction, with a range of ${list(wdSig.map(x => pctU(x.rangePct, 2)))} (highest on ${list(wdSig.map(x => WEEKDAY[x.high]))}, lowest on ${list(wdSig.map(x => WEEKDAY[x.low]))}); the pattern is detectable but does not demonstrate an execution advantage.` : 'No test is significant after correction.'} Even the largest range, ${pctU(Math.max(...C.weekday.tests.map(x => x.rangePct)), 2)}, is worth about ${fmt(Math.max(...C.weekday.tests.map(x => x.rangePct)) / 100 * antica.bid)} gp/TC, below the quoted spread and the 2% Create Offer fee, so the weekly calendar does not justify choosing the day of execution.`,
      `Os weekday effects são estimados como o desvio das offers de cada dia em relação à median dos sete dias ao redor, testados por block permutation dentro de cada semana e corrigidos conjuntamente nos quatro testes por uma Holm correction;${note('holm1979')} como a janela usa dias dos dois lados, ela descreve o histórico e não é um sinal em tempo real. Em ${bench}, a amplitude entre dias da semana é ${pctU(wA.rangePct, 2)} em Sell Offers e ${pctU(wAb.rangePct, 2)} em Buy Offers, com p-values corrigidos de ${list(C.weekday.tests.filter(x => x.scope === bench).map(x => pv(x.pHolm)))}. Nos demais worlds, ${sparse.length} de ${cov.length} têm quote em uma median de um ou dois dias por semana; quando se exigem três dias cotados em cada janela, ${Object.keys(wB.contributors).length} worlds contribuem, dos quais ${topContributor[0]} responde por ${fmt(topContributor[1] / wB.n * 100, 0)}% dos dias, e os testes resultam em ${pIs(wB.pBlock)} em Sell Offers e ${pIs(wBb.pBlock)} em Buy Offers (${pv(wB.pHolm)} e ${pv(wBb.pHolm)} após a correção). ${wdSig.length ? `${capFirst(list(wdSig.map(x => `o teste de ${SIDES[x.side]} ${x.scope === bench ? `em ${bench}` : 'nos demais worlds'}`)))} ${wdSig.length > 1 ? 'resistem' : 'resiste'} à correção, com amplitude de ${list(wdSig.map(x => pctU(x.rangePct, 2)))} (maior ${list(wdSig.map(x => `${/^(sábado|domingo)$/.test(WEEKDAY[x.high]) ? 'no' : 'na'} ${WEEKDAY[x.high]}`))}, menor ${list(wdSig.map(x => `${/^(sábado|domingo)$/.test(WEEKDAY[x.low]) ? 'no' : 'na'} ${WEEKDAY[x.low]}`))}); o padrão é detectável, mas não demonstra vantagem de execution.` : 'Nenhum teste é significativo após a correção.'} Mesmo a maior amplitude, ${pctU(Math.max(...C.weekday.tests.map(x => x.rangePct)), 2)}, equivale a cerca de ${fmt(Math.max(...C.weekday.tests.map(x => x.rangePct)) / 100 * antica.bid)} gp/TC, abaixo do quoted spread e da fee de 2% de Create Offer, de modo que o calendário semanal não justifica escolher o dia de execution.`)}
    </div>
    <div class="evidence-stack"><div id="card-weekday"></div></div>
    </div>
    <div class="analysis-row">
    <div class="prose">
    ${para(`The event study compares, in ${bench}'s offers, the median of the seven days after the start of each event with that of the seven days before, provided each window contains at least three observations. To separate the observed change from the usual movement of the period, each result is compared with ${fmt(2000)} draws of placebo dates from the same month and year, using the historical dates of the reference documentation and a joint false-discovery-rate correction across both sides.${note('benjamini1995')} ${strongest.length ? `Although ${strongest.length === 1 ? 'one result has' : `${nw(strongest.length)} results have`} q below 0.05, ${new Set(strongest.map(x => x.event)).size === 1 ? `${strongest.length > 1 ? 'all ' : ''}for the ${strongest[0].event}` : `concentrated in ${list([...new Set(strongest.map(x => x.event))])}`}, the scarcity of occurrences and the overlap of windows prevent inferring an execution rule.` : 'After the joint correction, no test has q below 5%.'} The results guide the periods worth watching but do not isolate the cause of any movement, which is why future prices receive no event adjustment.`,
      `O event study compara, nas offers de ${bench}, a median dos sete dias após o início de cada evento com a dos sete dias anteriores, desde que cada janela contenha pelo menos três observações. Para separar a variação observada do movimento usual do período, cada resultado é comparado a ${fmt(2000)} sorteios de datas placebo do mesmo mês e ano, usando as datas históricas da documentação de referência e uma correção conjunta de false discovery rate nos dois lados.${note('benjamini1995')} ${strongest.length ? `Embora ${strongest.length === 1 ? 'um resultado tenha' : `${nw(strongest.length)} resultados tenham`} q abaixo de 0,05, ${new Set(strongest.map(x => x.event)).size === 1 ? `${strongest.length > 1 ? 'todos ' : ''}no ${strongest[0].event}` : `concentrados em ${list([...new Set(strongest.map(x => x.event))])}`}, a escassez de ocorrências e a sobreposição de janelas impedem inferir uma regra de execution.` : 'Após a correção conjunta, nenhum teste tem q abaixo de 5%.'} Os resultados orientam os períodos que merecem acompanhamento, mas não isolam a causa de nenhum movimento, razão pela qual os prices futuros não recebem ajuste por evento.`)}
    </div>
    <div class="evidence-stack"><div id="card-events"></div></div>
    </div>
    <div class="analysis-row" id="s12" data-report-anchor>
    <div class="prose">
    ${para(`The calendar for the year ahead lists the remaining events of the schedule updated on ${longDate(R.calendarUpdated.slice(0, 10))}, favouring long events and those relevant to the cycle; experience, loot and update events are omitted because the schedule does not date them, and the schedule may still change. Because the event study finds no effect large enough to trade on, these dates mark periods worth watching rather than adjustments to the scenarios.`,
      `O calendário do próximo ano lista os eventos remanescentes da agenda atualizada em ${longDate(R.calendarUpdated.slice(0, 10))}, privilegiando eventos longos ou relevantes para o cycle; eventos de experiência, loot e updates ficam de fora porque a agenda não os data, e a agenda ainda pode mudar. Como o event study não encontra efeito grande o bastante para justificar um trade, essas datas marcam períodos a acompanhar, e não ajustes aos scenarios.`)}
    </div>
    <div class="evidence-stack">${card({evidence: 'observed', title: `Event Calendar: ${monthYearEn(calendar[0].start)} to ${monthYearEn(calendar.at(-1).start)}`, body: table({columns: [{key: 'start', label: 'Início', render: cellDate}, {key: 'endExclusive', label: 'Fim exclusivo', render: cellDate}, {key: 'event', label: 'Evento'}], rows: calendar})})}</div>
    </div>
    <div class="prose narrative-grid">
    ${para(`None of these checks overturns the principal findings, but each bounds them. The dating of the later cycles is robust to the reversal threshold; the apparent persistence of weekly movements is ${acf[0].r < acf[0].rWeeklyMedian ? 'largely a product of aggregation and the annual cycle' : 'not a product of aggregation'}; offers and daily averages ${gapVerdict === 'close' ? 'are close in the benchmark' : gapVerdict === 'differ' ? 'differ in the benchmark' : 'cannot be compared in the benchmark'}, although the choice of price measure must still be stated; and neither weekdays nor events provide a signal larger than the cost of trading on it. The cleaning floor and the anchor, finally, ${floorFlips.length || aaFlips.length ? 'reverse some conclusions, as stated above' : 'reverse none of the conclusions'}.`,
      `Nenhuma dessas verificações derruba os principais resultados, mas cada uma os delimita. A datação dos cycles posteriores é robusta ao threshold de reversal; a aparente persistence dos movimentos semanais ${acf[0].r < acf[0].rWeeklyMedian ? 'é em grande parte produto da agregação e do cycle anual' : 'não é produto da agregação'}; offers e daily averages ${gapVerdict === 'close' ? 'são próximas no benchmark' : gapVerdict === 'differ' ? 'diferem no benchmark' : 'não podem ser comparadas no benchmark'}, embora a escolha da medida de price ainda precise ser declarada; e nem os dias da semana nem os eventos fornecem um sinal maior do que o cost de negociar com base nele. O piso de limpeza e a anchor, por fim, ${floorFlips.length || aaFlips.length ? 'invertem algumas conclusões, como indicado acima' : 'não invertem nenhuma das conclusões'}.`)}
    </div>
  </section>`,
  discussion: `
  <section class="block" id="discussion">
    ${sectionHeading('discussion')}
    <div class="prose narrative-grid">
    ${para(`The evidence documents TC inflation in the benchmark but does not identify its source. Observationally, ${bench}'s price in gold has drifted ${trendLo > 0 ? 'upward' : trendHi < 0 ? 'downward' : 'without a stable direction'} over the sample, with an estimated trend of ${sgn(trendLo, 2)} to ${sgn(trendHi, 2)} a year in the monthly decomposition and a drift of ${sgn(Math.expm1(Math.min(fitAsk.driftPerYear, fit24.driftPerYear)) * 100)} to ${sgn(Math.expm1(Math.max(fitAsk.driftPerYear, fit24.driftPerYear)) * 100)} a year in the weekly stochastic model, depending on the estimation window, and with 12-month inflation of ${sgn(inflationAsk.yoyPct, 2)} in ${monthYear(inflationAsk.date)}. The economic interpretation most consistent with ${trendLo > 0 ? 'such a drift' : 'this pattern'} is that gold enters circulation faster than it leaves it, so that an asset acquired outside the gold economy appreciates in gold; the data, however, measure neither gold creation nor the demand for TC, and the sensitivity of both estimates to the estimation window forbids reading either as a permanent structural rate.`,
      `A evidência documenta TC inflation no benchmark, mas não identifica sua origem. Observacionalmente, o price de ${bench} em gold se deslocou ${trendLo > 0 ? 'para cima' : trendHi < 0 ? 'para baixo' : 'sem direção estável'} ao longo da sample, com trend estimada de ${sgn(trendLo, 2)} a ${sgn(trendHi, 2)} ao ano na decomposition mensal e drift de ${sgn(Math.expm1(Math.min(fitAsk.driftPerYear, fit24.driftPerYear)) * 100)} a ${sgn(Math.expm1(Math.max(fitAsk.driftPerYear, fit24.driftPerYear)) * 100)} ao ano no modelo estocástico semanal, conforme a estimation window, e com inflation em 12 meses de ${sgn(inflationAsk.yoyPct, 2)} em ${monthYear(inflationAsk.date)}. A interpretação econômica mais compatível com ${trendLo > 0 ? 'esse deslocamento' : 'esse padrão'} é que o gold entra em circulação mais rapidamente do que sai, de modo que um ativo adquirido fora da economia do gold se valoriza em gold; os dados, porém, não medem nem a criação de gold nem a demanda por TC, e a sensibilidade das duas estimativas à estimation window impede lê-las como uma rate estrutural permanente.`)}
    ${para(`Seasonality is the most robust regularity in the data, and persistence the least. The timing of peaks and troughs has held across every complete cycle and every reversal threshold from ${fmt(Math.min(...stable))}% to ${fmt(Math.max(...stable))}%, whereas weekly movements lose most of their autocorrelation once the calendar and the smoothing of medians are removed. The recent rise fits this pattern in timing and departs from it in level: ${recentLead ? `the decomposition attributes its short-run path mainly to the ${{trend: 'trend', seasonal: 'seasonal component', residual: 'residual'}[recentLead]} in both estimation samples` : 'the decomposition assigns little of its short-run path to the trend and divides the rest between season and residual in proportions that depend on the sample'}, while its level ${lastVsPeak > 0 ? 'exceeds every earlier peak' : 'remains within the range of earlier peaks'}. A plausible economic reading is that the annual cycle reflects the game's calendar of player activity and events; the event study, however, isolates no causal event effect, so that reading remains an interpretation rather than a finding.`,
      `A seasonality é a regularidade mais robusta dos dados, e a persistence, a menos robusta. O timing de peaks e troughs se manteve em todos os cycles completos e em todos os thresholds de reversal de ${fmt(Math.min(...stable))}% a ${fmt(Math.max(...stable))}%, enquanto os movimentos semanais perdem a maior parte de sua autocorrelation depois de removidos o calendário e a suavização das medians. A alta recente se ajusta a esse padrão em timing e se afasta dele em nível: ${recentLead ? `a decomposition atribui seu path de curto prazo principalmente ${{trend: 'à trend', seasonal: 'ao componente seasonal', residual: 'ao residual'}[recentLead]} nas duas samples de estimação` : 'a decomposition atribui pouco de seu path de curto prazo à trend e divide o restante entre seasonality e residual em proporções que dependem da sample'}, enquanto seu nível ${lastVsPeak > 0 ? 'supera todos os peaks anteriores' : 'permanece dentro da faixa dos peaks anteriores'}. Uma leitura econômica plausível é que o cycle anual reflete o calendário de atividade dos jogadores e de eventos do jogo; o event study, porém, não isola nenhum efeito causal de evento, de modo que essa leitura permanece uma interpretação, e não um resultado.`)}
    ${para(`The evidence for predictability thins with the horizon. Over ${r13.n} weekly origins, which carry the information of about ${fmt(i13.nEff, 0)} independent observations, the ensemble cuts the 13-week error of a constant forecast by ${pctU(skill13.skill, 0)} (${pctU(skill13.skillLow, 0)} to ${pctU(skill13.skillHigh, 0)}), mostly by shrinking last year's seasonal movement toward no change, which suggests that season carries usable information over one or two quarters; at the annual horizon the origins cover a single independent window, and the stochastic model's probabilities of a fall rank outcomes but have run ${pooled.meanP < pooled.freq ? 'too low' : 'too high'}. The scenarios should therefore be read with a credibility that declines with the horizon: a base path for the coming months and, for mid-2027, a range whose width, more than its centre, is the finding. Nor does the backtest settle which ensemble to trust: the simpler C+S ${csLower.length === IND.length ? 'has scored lower errors than the published C+S+H in every cell' : `has scored lower errors in ${nw(csLower.length)} of ${nw(IND.length)} cells`}, by margins mostly within sampling error, a difference that the prospective ledger, rather than a choice made in hindsight, will decide.`,
      `A evidência de previsibilidade rareia com o horizon. Em ${r13.n} origins semanais, que contêm a informação de cerca de ${fmt(i13.nEff, 0)} observações independentes, o ensemble reduz em ${pctU(skill13.skill, 0)} (${pctU(skill13.skillLow, 0)} a ${pctU(skill13.skillHigh, 0)}) o erro de 13 semanas de um forecast constante, sobretudo por encolher em direção a zero o movimento seasonal do ano anterior, o que sugere que a seasonality contém informação utilizável ao longo de um ou dois trimestres; no horizon anual, as origins cobrem uma única janela independente, e as probabilidades de queda do modelo estocástico ordenam os resultados, mas têm ficado ${pooled.meanP < pooled.freq ? 'baixas demais' : 'altas demais'}. Os scenarios devem, portanto, ser lidos com uma credibilidade que diminui com o horizon: um path base para os próximos meses e, para meados de 2027, um intervalo cuja amplitude, mais do que seu centro, é o resultado. O backtest tampouco decide em qual ensemble confiar: o C+S, mais simples, ${csLower.length === IND.length ? 'teve erros menores do que o C+S+H publicado em todas as células' : `teve erros menores em ${nw(csLower.length, true)} de ${nw(IND.length, true)} células`}, por margens em grande parte dentro do erro amostral, uma diferença que o ledger prospectivo, e não uma escolha feita em retrospecto, vai decidir.`)}
    ${para(`Heterogeneity limits how far the benchmark's dynamics generalise. Relative premiums differ by group and have shifted over time, correlations with ${bench} are ${Math.max(...corr) < .8 ? 'moderate' : 'uneven'} and concentrated in the same week, and volatility relative to ${bench} varies widely, only partly because of sparse quoting; mergers and level shifts break the relative-value assumption on which the transfer rule rests. Out of sample, transferring ${bench}'s path beats a constant forecast with an interval above zero in ${nw(trBeats.length)} of the ${nw(trAsk.length)} worlds with enough origins, and the worlds where it wins have the steadiest premiums, so a world-level scenario is only as reliable as the stability of that world's premium. ${slopeWins.length <= slopeLoses.length ? 'Estimating a slope for each world instead of assuming a one-to-one response does not improve those scenarios out of sample.' : 'Estimating a slope for each world improves some of those scenarios out of sample.'}`,
      `A heterogeneidade limita o alcance da generalização da dinâmica do benchmark. Os relative premiums diferem por grupo e se deslocaram ao longo do tempo, as correlations com ${bench} são ${Math.max(...corr) < .8 ? 'moderadas' : 'desiguais'} e concentradas na mesma semana, e a volatility relativa a ${bench} varia bastante, só em parte por causa de quotes esparsas; mergers e level shifts rompem a hipótese de relative value em que se apoia a regra de transferência. Out of sample, transferir o path de ${bench} supera um forecast constante com intervalo acima de zero em ${nw(trBeats.length)} dos ${nw(trAsk.length)} worlds com origins suficientes, e os worlds em que vence têm os premiums mais estáveis, de modo que um scenario por world só é tão confiável quanto a estabilidade do premium desse world. ${slopeWins.length <= slopeLoses.length ? 'Estimar uma inclinação para cada world, em vez de supor uma resposta de um para um, não melhora esses scenarios out of sample.' : 'Estimar uma inclinação para cada world melhora alguns desses scenarios out of sample.'}`)}
    ${para(`That result points to the natural extension of the research. Instead of treating ${bench} as the reference by default, a hierarchical or panel model would estimate all worlds jointly and separate a common TC market factor from world-specific premiums, world-specific departures from the common seasonality and idiosyncratic movements. Partial pooling would let sparse or young worlds borrow strength from the panel, and the model would estimate, rather than assume, how far each world follows the common factor, which is exactly what the transferability matrix now measures after the fact. The extension requires a joint re-estimation of every world and a new validation design, so it is left for a future edition; the present conclusions rest on the benchmark and on the transfer tests reported here.`,
      `Esse resultado aponta a extensão natural da pesquisa. Em vez de tratar ${bench} como referência por padrão, um modelo hierárquico ou de painel estimaria todos os worlds em conjunto e separaria um fator comum do mercado de TC dos premiums específicos de cada world, dos desvios de cada world em relação à seasonality comum e dos movimentos idiossincráticos. O partial pooling permitiria que worlds esparsos ou recentes tomassem força do painel, e o modelo estimaria, em vez de pressupor, quanto cada world acompanha o fator comum, que é exatamente o que a matriz de transferabilidade hoje mede depois do fato. A extensão exige reestimar todos os worlds em conjunto e um novo desenho de validação, e por isso fica para uma edição futura; as conclusões atuais se apoiam no benchmark e nos testes de transferência aqui apresentados.`)}
    ${para(`Execution costs, finally, translate these properties into outcomes. The fall after the coming peak is likely and sizeable, but a fall below today's price is ${odds(m23.prob.jun28BelowStart) === 'even' ? 'close to even odds' : odds(m23.prob.jun28BelowStart) === 'favourable' ? 'only moderately likely' : 'less likely than not'}, and a taker must clear the ${pctU(antica.costPct)} spread before any of it becomes TC; ${novTrips.length > 1 && novTrips.every((x, i) => !i || x.tcGainPct < novTrips[i - 1].tcGainPct) ? 'the damping of the cycle has already shrunk the historical gain, and ' : ''}the fee ${median(makerDiffAntica) <= 0 ? 'removes the benefit' : 'absorbs most of the benefit'} of making offers in ${bench}. The data thus support a narrow economic claim: seasonal timing has mattered for holders of TC, but frictions erode its value, and no figure in this report demonstrates an expected profit.`,
      `Os costs de execution, por fim, traduzem essas propriedades em resultados. A queda depois do próximo peak é provável e expressiva, mas uma queda abaixo do price de hoje ${odds(m23.prob.jun28BelowStart) === 'even' ? 'tem chances próximas de metade' : odds(m23.prob.jun28BelowStart) === 'favourable' ? 'é apenas moderadamente provável' : 'é menos provável do que não'}, e um taker precisa superar o spread de ${pctU(antica.costPct)} antes que qualquer parte dela se converta em TC; ${novTrips.length > 1 && novTrips.every((x, i) => !i || x.tcGainPct < novTrips[i - 1].tcGainPct) ? 'o amortecimento do cycle já reduziu o gain histórico, e ' : ''}a fee ${median(makerDiffAntica) <= 0 ? 'elimina o benefício' : 'absorve a maior parte do benefício'} de atuar como maker em ${bench}. Os dados sustentam, assim, uma afirmação econômica restrita: o timing seasonal importou para quem tem TC, mas as fricções corroem seu valor, e nenhum número deste relatório demonstra um profit esperado.`)}
    ${para(`Throughout, what the data record, what the models were scored on and what they merely imply have been kept apart, so that the report can serve as evidence on Market conditions without turning association into causation or a simulated result into observed success.`,
      `Ao longo do relatório, o que os dados registram, aquilo em que os modelos foram avaliados e o que eles apenas implicam foram mantidos separados, para que o relatório sirva de evidência sobre as condições do Market sem converter associação em causalidade nem um resultado simulado em sucesso observado.`)}
    </div>
  </section>`,
  falsification: `
  <section class="block" id="falsification">
    ${sectionHeading('falsification')}
    <div class="prose narrative-grid">
    ${para(`Each element of the interpretation can fail in a specific and observable way, and the observations that would overturn it are stated here so that later data can be checked against them rather than read in its light. The most exposed element is the size of the next fall: the ${nw(declines.length)} complete declines narrowed from ${pctU(Math.abs(declines[0].changePct))} to ${pctU(Math.abs(declines.at(-1).changePct))}, while the validated model's median fall from the coming peak, ${pctU(-d23.fromPeak[2])}, ${Math.abs(d23.fromPeak[2]) > Math.abs(declines.at(-1).changePct) ? 'already exceeds the last of them. A fall no larger than the last decline would confirm the damping and show that the model overstates the fall; a larger one would break the damping pattern' : 'stays within the last of them. A larger fall would break the damping pattern and show that the model understates it'}.`,
      `Cada elemento da interpretação pode falhar de um modo específico e observável, e as observações que o derrubariam ficam registradas aqui para que os dados futuros sejam confrontados com elas, e não lidos à sua luz. O elemento mais exposto é o tamanho da próxima queda: as ${nw(declines.length, true)} quedas completas se estreitaram de ${pctU(Math.abs(declines[0].changePct))} para ${pctU(Math.abs(declines.at(-1).changePct))}, enquanto a queda mediana a partir do próximo peak no modelo validado, ${pctU(-d23.fromPeak[2])}, ${Math.abs(d23.fromPeak[2]) > Math.abs(declines.at(-1).changePct) ? 'já supera a última delas. Uma queda não maior do que a última confirmaria o amortecimento e mostraria que o modelo superestima a queda; uma maior romperia o padrão de amortecimento' : 'fica dentro da última delas. Uma queda maior romperia o padrão de amortecimento e mostraria que o modelo a subestima'}.`)}
    </div>
    <div id="card-falsification"></div>
  </section>`,
  conclusion: `
  <section class="block" id="conclusion">
    ${sectionHeading('conclusion')}
    <div class="prose narrative-grid">
    ${para(`The research question asked to what extent the temporal and cross-sectional dynamics of Tibia Coin prices in gold can be characterised and predicted out of sample, and what those predictions imply under real execution frictions. The dynamics can be characterised with confidence: the price drifts ${trendLo > 0 ? 'upward' : trendHi < 0 ? 'downward' : 'without a stable direction'} across years, follows an annual cycle whose timing has been stable and whose declines have narrowed, ${persistence === 'both' ? 'retains only a little persistence beyond that calendar' : 'shows little persistence beyond that calendar'} and differs across worlds in level, spread and stability of relative value. It can be predicted only in part: the ensemble beats a constant forecast at one or two quarters, the annual horizon remains untested in any independent sense, and the benchmark's path transfers only where relative value is stable. On the question a holder of TC asks, the validated model expects a further rise into the late-year peak (${prob(m23.prob.peakAbove3)} for a peak at least 3% above today) and a fall from it (${prob(fallAt(d23, 10).fromPeak)} for more than 10%), but puts a fall below today's price by late June at ${prob(m23.prob.jun28BelowStart)} with training since 2023 and ${prob(m24.prob.jun28BelowStart)} since 2024, figures conditional on the specification and the starting capture. Once the spread and the fee are applied, selling now to rebuy later offers no demonstrated advantage. For a player who trades only once, the same paths ${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? 'favour' : 'weigh'} selling in the week of ${longDate(weekStart(decNov))} ${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? 'over' : 'against'} selling today (${prob(se23('nov').pBetter)} of paths, a median of ${moreGold(q50(se23('nov')))}) and buying in the week of ${longDate(weekStart(decJun))} ${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? 'over' : 'against'} buying today (${prob(by23('jun').pBetter)}, a median of ${moreTc(q50(by23('jun')))}), margins that are small beside the range of outcomes and that move with the training window. ${floorFlips.length || aaFlips.length ? 'Some of these conclusions depend on the cleaning floor or the anchor, as the robustness chapter states' : 'None of these conclusions reverses under Buy/Sell floors from 0.70 to 0.85 or without one, or under anchors set to the median of 24 or 72 hours of captures'}, and ${slopeWins.length <= slopeLoses.length ? 'an estimated slope for each world does not forecast better than the one-to-one transfer' : 'an estimated slope improves the transfer to some worlds'}. The forecasts behind them are now frozen in a ledger, so that each later edition tests them on outcomes that were unknown when they were made.`,
      `A pergunta de pesquisa indagava em que medida a dinâmica temporal e cross-sectional dos prices de Tibia Coins em gold pode ser caracterizada e prevista out of sample, e o que esses forecasts implicam sob fricções reais de execution. A dinâmica pode ser caracterizada com segurança: o price se desloca ${trendLo > 0 ? 'para cima' : trendHi < 0 ? 'para baixo' : 'sem direção estável'} entre anos, segue um cycle anual cujo timing tem sido estável e cujas quedas se estreitaram, ${persistence === 'both' ? 'conserva apenas pouca persistence além desse calendário' : 'tem pouca persistence além desse calendário'} e difere entre worlds em price level, spread e estabilidade do relative value. Ela só pode ser prevista em parte: o ensemble supera um forecast constante em um ou dois trimestres, o horizon anual continua sem teste independente, e o path do benchmark só se transfere onde o relative value é estável. Na pergunta que faz quem tem TC, o modelo validado espera nova alta até o peak de fim de ano (${prob(m23.prob.peakAbove3)} para um peak pelo menos 3% acima de hoje) e uma queda a partir dele (${prob(fallAt(d23, 10).fromPeak)} para mais de 10%), mas atribui ${prob(m23.prob.jun28BelowStart)} a uma queda abaixo do price de hoje até o fim de junho com treino desde 2023 e ${prob(m24.prob.jun28BelowStart)} desde 2024, números condicionais à especificação e à captura inicial. Aplicados o spread e a fee, vender agora para recomprar depois não oferece vantagem demonstrada. Para quem negocia uma única vez, os mesmos paths ${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? 'favorecem' : 'comparam'} vender na semana de ${longDate(weekStart(decNov))} ${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? 'em relação a' : 'com'} vender hoje (${prob(se23('nov').pBetter)} dos paths, median de ${moreGold(q50(se23('nov')))}) e comprar na semana de ${longDate(weekStart(decJun))} ${se23('nov').pBetter > .5 && by23('jun').pBetter > .5 ? 'em relação a' : 'com'} comprar hoje (${prob(by23('jun').pBetter)}, median de ${moreTc(q50(by23('jun')))}), margens pequenas diante da faixa de resultados e que variam com a training window. ${floorFlips.length || aaFlips.length ? 'Algumas dessas conclusões dependem do piso de limpeza ou da anchor, como indica o capítulo de robustness' : 'Nenhuma dessas conclusões se inverte sob pisos Buy/Sell de 0,70 a 0,85 ou sem piso, ou sob anchors fixadas na median de 24 ou 72 horas de capturas'}, e ${slopeWins.length <= slopeLoses.length ? 'uma inclinação estimada para cada world não prevê melhor do que a transferência de um para um' : 'uma inclinação estimada melhora a transferência para alguns worlds'}. Os forecasts por trás delas ficam agora congelados em um ledger, para que cada edição seguinte os teste em resultados desconhecidos quando foram feitos.`)}
    </div>
  </section>`,
  sources: `
  <section class="block" id="sources">
    <h2>${SOURCES_TITLE}</h2>
    <ol class="endnotes" id="endnotes"></ol>
  </section>`,
  };
  const shellFoot = `
  <footer>
    ${para('Code, data and input hashes are available in the <a href="https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle">GitHub repository</a>. This research is not investment advice. Tibia and Tibia Coins are trademarks of CipSoft GmbH.', 'Código, dados e hashes de entrada estão disponíveis no <a href="https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle">repositório no GitHub</a>. Esta pesquisa não constitui recomendação de investimento. Tibia e Tibia Coins são marcas da CipSoft GmbH.')}
  </footer>
  </div>
  </div>`;

  // The shell (masthead, headline figures, index and footer) stays on the page; the pages are numbered as one text.
  const order = contents().map(([id]) => id);
  const [head, ...numbered] = numberNotes([shellHead, ...order.map(id => pages[id]), shellFoot]);
  order.forEach((id, i) => { pages[id] = numbered[i]; });
  root.innerHTML = head + numbered.at(-1);
  // Tables written into a page's own markup outlive a page switch, with their order and window.
  for (const [, id] of order.map(id => pages[id]).join('').matchAll(/<table id="(data-table-\d+)"/g)) tableModels.get(id).keep = true;
  // Everything a link can point at, by the page that holds it: the ids in each page's markup, and the dossiers that
  // the dossier block renders into #dossiers.
  const pageOf = Object.create(null);
  order.forEach(page => { for (const [, id] of pages[page].matchAll(/ id="([^"]+)"/g)) pageOf[id] ??= page; });
  const pageFor = id => Object.hasOwn(pages, id) ? id : pageOf[id] ?? (id.startsWith('dossier-') ? pageOf.dossiers : undefined);

  // World and reading share a cell; the name area is as wide as the widest name, in em, so every
  // date starts at the same x and scales with the type. Each row keeps its own capture date.
  const fitWorldNames = scope => scope.querySelectorAll('table.data:has(.world-name)').forEach(tbl => {
    const names = [...tbl.querySelectorAll('.world-name')], size = parseFloat(getComputedStyle(names[0]).fontSize);
    tbl.style.setProperty('--world-name', `${Math.max(...names.map(n => n.getBoundingClientRect().width)) / size}em`);
  });
  const body = root.querySelector('.report-body'), footer = body.querySelector(':scope > footer');
  const pageLinks = [...root.querySelectorAll('.toc a')].filter(a => pages[a.hash.slice(1)]);
  let current;
  // One page at a time: its markup replaces the page shown, the controls in it take the current state, its tables
  // their order and window, and its blocks render. The index marks it.
  function show(page) {
    body.querySelector(':scope > section.block')?.remove();
    pruneTables();
    footer.insertAdjacentHTML('beforebegin', pages[page]);
    current = page;
    const section = document.getElementById(page);
    syncSegments(section);
    section.querySelectorAll('select[data-picker]').forEach(p => { if ([...p.options].some(o => o.value === state[p.dataset.picker])) p.value = state[p.dataset.picker]; });
    section.querySelectorAll('table.data').forEach(({id}) => { const m = tableModels.get(id); if (m && (m.sort >= 0 || m.range !== 'All')) syncTable(id); });
    fitWorldNames(section);
    listeners.filter(l => l.hosts.length && shown(l)).forEach(l => l.fn());
    normalizeReport(section);
    updateTableOverflow();
    pageLinks.forEach(a => { if (a.hash === `#${page}`) { a.classList.add('on'); a.setAttribute('aria-current', 'page'); } else { a.classList.remove('on'); a.removeAttribute('aria-current'); } });
    document.getElementById('section-select').value = page;
  }
  // The address names what the reader asked for: a page, or something on one (a card, a note, a dossier). Anything
  // else, such as the top of the report, keeps the page shown.
  function route() {
    const id = location.hash.slice(1);
    const page = pageFor(id) ?? current ?? order[0], shownNow = page !== current;
    if (shownNow) show(page);
    selectLinkedWorld(location.hash);
    // What a page has just rendered is not yet the document's target: navigating to the same address again, in place
    // and once the current navigation has finished, scrolls to it and styles it as the target, without a history entry.
    if (id && shownNow) setTimeout(() => location.replace(location.href));
  }
  window.addEventListener('hashchange', route);

  // The Market monitor's Δ follows the chosen comparison; only the table's rows are rebuilt.
  on(() => {
    const table = document.querySelector('#market-prices table').id, days = COMPARISONS.find(([text]) => text === state.comparison)[1];
    tableModels.get(table).rows = marketRows.map(row => {
      const cutoff = days ? new Date(ms(row.date) - days * DAY).toISOString().slice(0, 10) : null;
      const prior = cutoff ? row.dailyCaptures.filter(c => c.capturedAt.slice(0, 10) <= cutoff).at(-1) : row.prior;
      return {...row, priorDate: prior?.capturedAt.slice(0, 10), deltaPct: readingDelta(row, prior)};
    });
    redrawTable(table);
  }, ['comparison'], ['market-prices']);

  // Statistics stays an observed rolling series, independent of quote models.
  let statsWorld = 'all', statsBucket = 'reference', statsMetric = 'averagePrice';
  const drawStatistics = () => {
    const statsHost = document.getElementById('market-statistics');
    if (!statsHost) return;
    const all = statisticsObservations(U, {bucket:statsBucket});
    const rows = all.filter(r => statsWorld === 'all' || r.world === statsWorld);
    const statsWorlds = [...new Set(statisticsObservations(U,{bucket:'capture'}).map(r => r.world))].sort();
    const metrics = {tcVolume:'TC Volume (TC)', averagePrice:'Average Price (gp/TC)', highestPrice:'Highest Price (gp/TC)', lowestPrice:'Lowest Price (gp/TC)', transactions:'Transactions (25-TC lots)', rangePct:'Price range (%)', quoteVsAveragePct:'Quote vs Average (%)', averageChangePct:'Average change (%)'};
    const select = (label, key, choices, active) => `<select aria-label="${esc(label)}" data-stats-control="${key}">${choices.map(([value,text]) => `<option value="${esc(value)}" ${value === active ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
    statsHost.innerHTML = card({id:'statistics-30d', evidence:'observed', title:t('30-day Market Statistics', 'Statistics de 30 dias do Market'),
      sub:t('Rolling summaries observed at capture time, with history anchored to their Statistics reference date.', 'Summaries móveis observados na captura, com histórico ancorado na data de referência de Statistics.'),
      controls:select('World','world',[['all',t('All worlds','Todos os worlds')],...statsWorlds.map(w => [w,w])],statsWorld) +
        select(t('Date bucket','Data de agrupamento'),'bucket',[['reference',t('Statistics reference date','Data de referência de Statistics')],['capture',t('Local capture date','Data local da captura')]],statsBucket) +
        select('Metric','metric',Object.entries(metrics),statsMetric),
      body:'<div id="statistics-chart" class="chart"></div>',
      drawer:table({columns:[{key:'world',label:'World'},{key:'side',label:'Side'},
        {key:'capturedAt',label:'Capture',render:v => esc(v.replace('T',', '))},
        {key:'capturedAtUtc',label:'Capture UTC',render:v => v ? esc(v) : MISSING},
        {key:'quoteCapturedAt',label:'Quote capture',render:v => v ? esc(v.replace('T',', ')) : MISSING},
        {key:'statisticsReferenceDate',label:'Statistics reference date',render:v => v ? cellDate(v) : MISSING},
        num('transactions','Transactions (25-TC lots)'), num('tcVolume','TC Volume'), num('highestPrice','Highest Price'), num('averagePrice','Average Price'), num('lowestPrice','Lowest Price'),
        percent('rangePct','Price range'),percent('quoteVsAveragePct','Quote vs Average'),percent('averageChangePct','Average change')], rows,
        empty:t('No validated Statistics for this selection.', 'Sem Statistics validadas para esta seleção.')}),
      note:t('Counts are 25-TC lots; TC Volume = transactions × 25. Prices remain gp/TC. Rolling windows overlap: do not sum counts or infer daily flows from differences. Last capture per world, side and date bucket; historical changes compare consecutive available buckets. Range = (highest / lowest − 1) × 100; Quote vs Average = (latest available best quote at or before the Statistics capture / average − 1) × 100; unavailable without resolved quote context. Statistics reference dates use the local date before/after its 10:00 CET/CEST server save; this anchors historical comparisons by default and requires the original capture timezone. Unknown or ambiguous clocks are excluded only from that view. The displayed 30-day window is not assumed to be exactly 30 server-save intervals. Older records without Statistics remain available in every existing report.',
        'Counts são lots de 25 TC; TC Volume = transactions × 25. Prices permanecem gp/TC. As windows móveis se sobrepõem: não some counts nem derive flows diários das diferenças. Última captura por world, lado e data; historical changes comparam datas disponíveis consecutivas. Range = (highest / lowest − 1) × 100; Quote vs Average = (última best quote disponível até a captura de Statistics / average − 1) × 100; indisponível sem contexto resolvido da quote. As datas de referência de Statistics usam a data local antes/depois do server save de 10:00 CET/CEST e ancoram as comparações históricas por padrão. Exigem o timezone original; clocks desconhecidos ou ambíguos são excluídos apenas dessa visão. Não se presume uma window de exatamente 30 intervalos de server save. Registros antigos sem Statistics continuam disponíveis em todos os relatórios existentes.')});
    const names = [...new Set(rows.map(r => r.world))];
    chart('statistics-chart', host => lineChart(host, {aria:t('30-day Statistics by world and side','Statistics de 30 dias por world e lado'), series:names.flatMap(world => ['buy','sell'].map(side => ({label:`${world} ${side === 'buy' ? 'Buy' : 'Sell'} Offers`, cls:side === 'buy' ? 'c-bid' : 'c-ask', dots:true,
      points:rows.filter(r => r.world === world && r.side === side).map(r => [r.date,r[statsMetric]])}))), yFmt:v => fmt(v, statsMetric.endsWith('Pct') ? 2 : 0)}));
    normalizeReport(statsHost);
  };
  on(drawStatistics, [], ['market-statistics']);
  document.addEventListener('change', e => {
    const key = e.target.dataset.statsControl;
    if (key === 'world') statsWorld = e.target.value;
    else if (key === 'bucket') statsBucket = e.target.value;
    else if (key === 'metric') statsMetric = e.target.value;
    else return;
    drawStatistics();
  });


  document.getElementById('section-select').addEventListener('change', e => {
    window.location.hash = e.target.value;
  });

  // ---------------------------------------------------------------- dynamic blocks
  // Shared by the probability exhibits: the training window as a control, and percentages on a 0 to 100 scale.
  const SAMPLES = [['main', 'Since 2023'], ['since2024', 'Since 2024']];
  const sampleName = k => k === 'main' ? t('training since 2023', 'treino desde 2023') : t('training since 2024', 'treino desde 2024');
  const sampleControl = () => stateControl({label: 'Training Window', key: 'sample', options: SAMPLES});
  const pctScale = v => pctU(v, 0);
  const asIs = v => v;  // cells built only from formatted numbers and dates
  const hist = world => R.history.filter(x => x.world === world);
  const anticaHist = hist(bench);
  // The research reading every benchmark chart starts from, keyed once for all of them.
  const researchCapture = t(`Capture of ${shortDate(antica.date)}`, `Captura de ${shortDate(antica.date)}`);
  // The benchmark's forecast charts open on the same recent window of weekly history.
  const recentFrom = '2025-06-01', anticaRecent = anticaHist.filter(x => x.date >= recentFrom);
  const weeklyHistory = t('Weekly history', 'Histórico semanal'), baseScenario = 'Ensemble scenario', stressBand = 'Heuristic stress band';

  // 07: base scenario chart
  on(() => {
    const s = state.side, f = R.forecast.filter(x => x.side === s), recent = anticaRecent;
    document.getElementById('card-model').innerHTML = card({evidence: 'model', title: sided(bench, s), sub: t(`${priceUnit}. Weekly history since ${monthAxis(recentFrom)}, capture of ${shortDate(antica.date)} and ${horizonWeeks} weeks of scenario`, `${priceUnit}. Histórico semanal desde ${monthAxis(recentFrom)}, captura de ${shortDate(antica.date)} e ${horizonWeeks} semanas de scenario`), controls: sideControl(), body: '<div class="chart" id="ch-model"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, num('constant', 'Constante'), num('seasonal', 'Sazonal'), num('harmonic', 'Harmônico'), num('base', 'Central'), num('low', 'Estresse de baixa'), num('high', 'Estresse de alta'), num('cs', 'C+S')], rows: f.map(x => ({...x, cs: X.challenger.find(c => c.side === s && c.date === x.date)?.['C+S']}))})});
    chart('ch-model', host => lineChart(host, {
      aria: t(`${bench}, ${SIDES[s]}: weekly history and scenarios to September 2027`, `${bench}, ${SIDES[s]}: histórico semanal e scenarios até setembro de 2027`),
      series: [{label: weeklyHistory, cls: `c-${s}`, points: recent.map(x => [x.date, x[s]])}, {label: baseScenario, cls: 'c-ink', points: f.map(x => [x.date, x.base])},
        {label: 'Registered challenger C+S', cls: 'c-muted', dash: true, thin: true, points: X.challenger.filter(x => x.side === s).map(x => [x.date, x['C+S']])}],
      bands: [{label: stressBand, cls: `c-${s} o2`, points: f.map(x => [x.date, x.low, x.high])}],
      markers: [{x: antica.date, y: antica[s], label: t(`Capture ${fmt(antica[s])}`, `Captura ${fmt(antica[s])}`), key: researchCapture, kind: 'capture', of: 0}],
    }));
  }, ['side'], ['card-model']);

  // 04: turning points chart
  on(() => {
    const s = state.side, sw = SW[s], c = sw.current;
    document.getElementById('card-pivots').innerHTML = card({evidence: 'observed', title: sided(`${bench}: Turning Points`, s), sub: t(`${priceUnit}. Weekly medians; peaks and troughs confirmed by a 5% reversal`, `${priceUnit}. Weekly medians; peaks e troughs confirmados por reversal de 5%`), controls: sideControl(), body: '<div class="chart" id="ch-pivots"></div>',
      drawer: table({columns: [{key: 'type', label: 'Tipo', render: v => v === 'P' ? 'Peak' : 'Trough'}, {key: 'date', label: 'Semana', render: cellDate}, num('level', 'Nível')], rows: sw.pivots})});
    chart('ch-pivots', host => lineChart(host, {
      aria: t(`${bench}, ${SIDES[s]}, weekly medians with confirmed peaks and troughs`, `${bench}, ${SIDES[s]}, weekly medians com peaks e troughs confirmados`),
      series: [{label: SIDES[s], cls: `c-${s}`, points: anticaHist.map(x => [x.date, x[s]])}],
      markers: [...sw.pivots.map((p, i) => ({x: p.date, y: p.level, label: i === 0 ? '' : host.clientWidth < G().compact ? `${MONTHS_AXIS[isoMonth(p.date)].replace('.', '')}/${p.date.slice(2, 4)}` : `${p.type === 'P' ? 'peak' : 'trough'} ${monthAxis(p.date)}`, pos: p.type === 'P' ? 'above' : 'below', key: t('Confirmed peak or trough', 'Peak ou trough confirmado')})),
        {x: c.end, y: c.endLevel, label: t(`${sgn(c.changePct)} since the trough`, `${sgn(c.changePct)} desde o trough`), key: researchCapture, kind: 'capture', of: 0}],
    }));
  }, ['side'], ['card-pivots']);

  // 06, 07: simulated distribution, probabilities, seeds, anchor and calibration
  on(() => {
    const s = state.side, fan = P.fan.filter(f => f.side === s && f.sample === 'main'), fan24 = P.fan.filter(f => f.side === s && f.sample === 'since2024');
    const f = R.forecast.filter(x => x.side === s), recent = anticaRecent;
    document.getElementById('card-fan').innerHTML = card({evidence: 'model', title: sided(`${bench}: Simulated Distribution`, s), sub: t(`${priceUnit}. Training since 2023, seed ${SEED}; ${fmt(PATHS)} paths`, `${priceUnit}. Treino desde 2023, seed ${SEED}; ${fmt(PATHS)} paths`), controls: sideControl(), body: '<div class="chart" id="ch-fan"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, num('p10', 'P10'), num('p25', 'P25'), num('p50', 'P50'), num('p75', 'P75'), num('p90', 'P90'), num('p50b', 'P50; desde 2024')], rows: fan.map((x, i) => ({...x, p50b: fan24[i]?.p50}))})});
    chart('ch-fan', host => lineChart(host, {
      aria: t(`Simulated distribution of ${SIDES[s]} in ${bench} to September 2027`, `Distribution simulada de ${SIDES[s]} em ${bench} até setembro de 2027`),
      series: [{label: weeklyHistory, cls: `c-${s}`, points: recent.map(x => [x.date, x[s]])}, {label: t('Median, since 2023', 'Median, desde 2023'), cls: 'c-ink', points: fan.map(x => [x.date, x.p50])},
        {label: t('Median, since 2024', 'Median, desde 2024'), cls: 'c-ink', dash: true, thin: true, points: fan24.map(x => [x.date, x.p50])}, {label: t(`Base scenario (section ${chapterNum('s02')})`, `Base scenario (seção ${chapterNum('s02')})`), cls: 'c-muted', dash: true, thin: true, points: f.map(x => [x.date, x.base])}],
      bands: [{label: t('P10 to P90', 'P10 a P90'), cls: `c-${s} o1`, points: fan.map(x => [x.date, x.p10, x.p90])}, {label: t('P25 to P75', 'P25 a P75'), cls: `c-${s} o2`, points: fan.map(x => [x.date, x.p25, x.p75])}],
      markers: [{x: antica.date, y: antica[s], label: t(`Start ${fmt(antica[s])}`, `Partida ${fmt(antica[s])}`), key: researchCapture, kind: 'capture', of: 0}],
    }));

    const m = run(s, 'main'), s24 = run(s, 'since2024'), rm = P.sides[s].main.seedRange, r24 = P.sides[s].since2024.seedRange;
    const EVENTS = [
      ['peakAbove3', 'peak_above_start_plus3', 'p_peak_gt3', `Peak by ${cellDate(peakBy)} at least 3% above the start`],
      ['peakAfterOct31', 'peak_after_oct31', 'p_peak_after_oct31', `Peak in or after the week of ${cellDate('2026-11-02')}`],
      ['nov30AboveStart', 'nov30_above_start', null, `Week of ${cellDate('2026-11-30')} above the start`],
      ['jun28BelowStart', 'jun28_below_start', 'p_jun27_below', `Week of ${cellDate(rebuyWeek)} below the start`],
      ['troughAbove2026', 'trough2027_above_trough2026', 'p_trough_above_2026', 'March to September 2027 low above the 2026 low'],
      ['jun28BelowNov30', 'jun28_below_nov30', null, `Week of ${cellDate(rebuyWeek)} below the week of ${cellDate('2026-11-30')}`],
    ];
    const rng = r => Math.round(r[0] * 100) !== Math.round(r[1] * 100) ? ` <span class="dim">(${prob(r[0])}${RANGE}${prob(r[1])})</span>` : '';
    const rows = EVENTS.map(([k, pk, stk, label]) => ({label, main: prob(m.prob[k]) + rng(rm[k]), s24: prob(s24.prob[k]) + rng(r24[k]), pkg: prob(PK.prob[pk]) + (stk ? rng(PK.stabilityRange[stk]) : '')}));
    // cells below are built only from formatted numbers and dates, so they render as markup
    const html = v => v;
    const lv = a => `${fmt(a[1])} <span class="dim">(${fmt(a[0])}${RANGE}${fmt(a[2])})</span>`;
    rows.push({label: 'Peak: median (P10 to P90)', main: lv(m.peakLevel), s24: lv(s24.peakLevel), pkg: lv(PK.peak.level_p10_p50_p90)});
    // The package labels a week by its Monday; shown here by the Sunday that ends it, like the offer columns.
    const pkgWeek = iso => new Date(ms(iso) + 6 * DAY).toISOString().slice(0, 10);
    rows.push({label: 'Median peak week (Sunday)', main: cellDate(m.peakDate[1]), s24: cellDate(s24.peakDate[1]), pkg: cellDate(pkgWeek(PK.peak.date_p10_p50_p90[1]))});
    const months = x => `${prob(1 - x.peakMonthShare.novDez - x.peakMonthShare.janFev)} / ${prob(x.peakMonthShare.novDez)} / ${prob(x.peakMonthShare.janFev)}`;
    rows.push({label: 'Peak week: through October / November to December / January to February', main: months(m), s24: months(s24), pkg: MISSING});
    rows.push({label: 'March to September 2027 low: median (P10 to P90)', main: lv(m.troughLevel), s24: lv(s24.troughLevel), pkg: lv(PK.trough.level_p10_p50_p90)});
    rows.push({label: 'Median trough week (Sunday)', main: cellDate(m.troughDate[1]), s24: cellDate(s24.troughDate[1]), pkg: cellDate(pkgWeek(PK.trough.date_p10_p50_p90[1]))});
    rows.push({label: 'Starting Value', main: `${fmt(m.start)} (${shortDate(antica.date)})`, s24: `${fmt(s24.start)} (${shortDate(antica.date)})`, pkg: `${fmt(PK.start.level)} (${shortDate(PK.start.date)}, index)`});
    document.getElementById('card-prob').innerHTML = card({evidence: 'model', title: sided('Probabilities and Levels', s), sub: t(`${priceUnit}. Seed ${SEED}; observed 2026 low: ${fmt(P.spec.trough2026[s])} (${cellDate(P.spec.trough2026Date[s])})`, `${priceUnit}. Seed ${SEED}; mínimo observado em 2026: ${fmt(P.spec.trough2026[s])} (${cellDate(P.spec.trough2026Date[s])})`), controls: sideControl(),
      body: table({columns: [{key: 'label', label: 'Evento', wrap: true}, {key: 'main', label: 'Offers Since 2023 (Seed Range)', num: true, render: html}, {key: 's24', label: 'Offers Since 2024 (Seed Range)', num: true, render: html}, {key: 'pkg', label: 'Package: Daily Averages (Seed Range)', num: true, render: html}], rows, sortable: false,
        caption: t(`The package uses an index of daily averages of Sell Offers across 71 worlds and starts on ${shortDate(PK.start.date)}, so it is not directly comparable with the offers and is the same for both sides; its weeks are dated by the Sunday that closes them.`,
          `O pacote usa um índice de daily averages de Sell Offers de 71 worlds e parte de ${shortDate(PK.start.date)}, de modo que não é diretamente comparável às offers e é igual para os dois lados; suas semanas são datadas pelo domingo que as encerra.`)})});
  }, ['side'], ['card-fan', 'card-prob']);
  // 09: break-even levels from today's quotes and the fee schedule; the model's distribution of the round trip's outcome
  const MODE = {aceitando: 'Taking Offers', 'criando ofertas': 'Making Offers'};
  on(() => {
    document.getElementById('card-breakeven').innerHTML = card({evidence: 'observed', title: `${bench}: Break-Even Levels for Selling and Rebuying`,
      sub: t(`Highest repurchase quote for each TC gain, from the capture of ${shortDate(antica.date)} (Sell ${fmt(antica.ask)}, Buy ${fmt(antica.bid)}) and a 2% fee per created offer`, `Maior quote de recompra para cada gain em TC, a partir da captura de ${shortDate(antica.date)} (Sell ${fmt(antica.ask)}, Buy ${fmt(antica.bid)}) e fee de 2% por offer criada`),
      body: table({columns: [{key: 'targetPct', label: 'TC Gain', render: v => `${sign(v, 0)}${fmt(v)}%`}, {key: 'mode', label: 'Execução', render: v => MODE[v]},
        num('receive', 'Sale Receives'), num('rebuyAtMost', 'Repurchase At Most'),
        {key: 'quote', label: 'Quote Repurchased'}, signed('vsSamePct', 'Fall of That Quote'), signed('vsSellPct', 'Vs Sell Offers')],
        rows: P.breakEven.map(b => ({...b, receive: b.mode === 'aceitando' ? antica.bid : antica.ask * (1 - C.fee.rate), quote: b.mode === 'aceitando' ? 'Sell Offers' : 'Buy Offers'})), sortable: false,
        caption: t(`Taking offers sells at today's Buy Offers and repurchases at the Sell Offers, with no fee; making offers sells at today's Sell Offers and repurchases at the Buy Offers, pays 2% on each offer and assumes both fill.`, `O taker vende às Buy Offers de hoje e recompra às Sell Offers, sem fee; o maker vende às Sell Offers de hoje e recompra às Buy Offers, paga 2% em cada offer e presume que ambas sejam executadas.`)})});
  }, [], ['card-breakeven']);
  on(() => {
    document.getElementById('card-rebuy-dist').innerHTML = card({evidence: 'model', title: `Sell on ${shortDate(antica.date)}, Repurchase in the Week of ${cellDate(rebuyWeek)}: TC Gain`,
      sub: t(`${bench}; share of ${fmt(PATHS)} simulated paths (seed ${SEED}) and percentiles of the gain in TC, %`, `${bench}; fração de ${fmt(PATHS)} paths simulados (seed ${SEED}) e percentis do gain em TC, %`),
      body: table({columns: [{key: 'sample', label: 'Treino', render: v => v === 'main' ? 'Since 2023' : 'Since 2024'}, {key: 'mode', label: 'Execução', render: v => MODE[v]},
        probability('pGain', 'P(Gain)'), probability('pLoss', 'P(Loss)'), probability('pLossGt10', 'P(Loss > 10%)'), probability('pGainGt10', 'P(Gain > 10%)'),
        ...['P10', 'P25', 'P50', 'P75', 'P90'].map((label, i) => ({key: label, label, num: true, sortValue: r => r.quantiles[i], render: (v, r) => sgn(r.quantiles[i]), cls: (v, r) => cls(r.quantiles[i])}))], rows: P.roundtrip,
        caption: t(`Taking offers sells at ${fmt(antica.bid)} and repurchases at the simulated Sell Offers; making offers sells at ${fmt(antica.ask)} less 2% and repurchases at the simulated Buy Offers plus 2%, both filled.`, `O taker vende a ${fmt(antica.bid)} e recompra às Sell Offers simuladas; o maker vende a ${fmt(antica.ask)} menos 2% e recompra às Buy Offers simuladas mais 2%, ambas executadas.`)})});
  }, [], ['card-rebuy-dist']);
  on(() => {
    const k = state.sample, rc = P.rebuyCurve.filter(x => x.sample === k);
    document.getElementById('card-rebuy-curve').innerHTML = card({evidence: 'model', title: 'Probability of a TC Gain by Repurchase Week',
      sub: t(`${bench}; sale on ${shortDate(antica.date)}; share of simulated paths, ${sampleName(k)}, seed ${SEED}`, `${bench}; venda em ${shortDate(antica.date)}; fração dos paths simulados, ${sampleName(k)}, seed ${SEED}`), controls: sampleControl(),
      body: '<div class="chart" id="ch-rebuy-curve"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, probability('taker', 'Taking Offers'), probability('maker', 'Making Offers')], rows: rc})});
    chart('ch-rebuy-curve', host => lineChart(host, {fixedRange: true, domain: [0, 100], yFmt: pctScale, tipFmt: pctScale,
      aria: t(`Probability that selling on ${shortDate(antica.date)} and repurchasing in each week ends with more TC, by execution`, `Probabilidade de que vender em ${shortDate(antica.date)} e recomprar em cada semana termine com mais TC, por execution`),
      series: [{label: 'Taking Offers', cls: 'c-ink', points: rc.map(x => [x.date, x.taker * 100])}, {label: 'Making Offers', cls: 'c-muted', points: rc.map(x => [x.date, x.maker * 100])}],
      vlines: [{x: junWeek, label: shortDate(weekStart(junWeek))}]}));
  }, ['sample'], ['card-rebuy-curve']);
  // 10: buying or selling once: today's orders in the selected world, what gold and TC fetch in each scenario, the odds of waiting
  // by week, each player's plans and the same decisions in past cycles. Cells are built only from formatted numbers and dates.
  on(() => {
    const w = W[state.world] ? state.world : bench, q = W[w];
    const rows = [
      {decision: 'Buy TC', order: 'Take the Best Sell Offer', quote: q.ask, fee: 0, net: q.ask, vs: 0, fills: 'At Once', amount: q.sellTopAmount},
      {decision: 'Buy TC', order: 'Make a Buy Offer at the Best Buy Offer', quote: q.bid, fee, net: q.bid * (1 + fee), vs: (q.ask / (q.bid * (1 + fee)) - 1) * 100, fills: 'If Accepted'},
      {decision: 'Sell TC', order: 'Take the Best Buy Offer', quote: q.bid, fee: 0, net: q.bid, vs: 0, fills: 'At Once', amount: q.buyTopAmount},
      {decision: 'Sell TC', order: 'Make a Sell Offer at the Best Sell Offer', quote: q.ask, fee, net: q.ask * (1 - fee), vs: (q.ask * (1 - fee) / q.bid - 1) * 100, fills: 'If Accepted'}];
    document.getElementById('card-decision-today').innerHTML = card({evidence: 'observed', title: `${w}: Taking or Making an Offer Today`,
      sub: t(`${priceUnit}. Latest reading, ${cellDate(q.date)}; 2% fee per created offer`, `${priceUnit}. Leitura mais recente, ${cellDate(q.date)}; fee de 2% por offer criada`), controls: worldControl({value: w}),
      body: table({columns: [{key: 'decision', label: 'Decision'}, {key: 'order', label: 'Execution', wrap: true}, num('quote', 'Quote'), {key: 'fee', label: 'Fee', num: true, render: v => pctU(v * 100, 0)},
        num('net', 'Net per TC'), signed('vs', 'Vs Taking', 2), {key: 'fills', label: 'Executes'}, num('amount', 'Best Amount')], rows, sortable: false,
        caption: t('Vs Taking: the TC bought, or the gold received, against taking the best offer of the other side. A created offer executes only if a counterparty accepts it. Best Amount: TC available at the best price, beyond which a taker reaches worse prices.', 'Vs Taking: as TC compradas, ou o gold recebido, em relação a aceitar a melhor offer do outro lado. Uma offer criada só é executada se uma counterparty a aceitar. Best Amount: TC disponíveis no best price, além das quais o taker alcança prices piores.')})});
  }, ['world'], ['card-decision-today']);
  on(() => {
    const k = state.sample, ma = run('ask', k), mb = run('bid', k);
    // Each level is [central, low, high]; TC for a fixed amount of gold fall as the price rises, so their range reads high price first.
    const band = (v, f, lo, hi) => v.length > 1 ? `${f(v[0])} <span class="dim">(${f(v[lo])}${RANGE}${f(v[hi])})</span>` : f(v[0]);
    const sim = a => [a[1], a[0], a[2]];
    const row = (label, a, b) => ({label, ask: band(a, fmt, 1, 2), tc: band(a, v => fmt(tcFor(v), 1), 2, 1), buyVs: (antica.ask / a[0] - 1) * 100,
      bid: band(b, fmt, 1, 2), gp: band(b, v => fmt(goldFor(v)), 1, 2), sellVs: (b[0] / antica.bid - 1) * 100});
    const rows = [
      row('Capture Today', [antica.ask], [antica.bid]),
      row(`Ensemble Scenario, Week of ${cellDate(weekStart(decNov))}`, [nov.base, nov.low, nov.high], [novBid.base, novBid.low, novBid.high]),
      row(`Ensemble Scenario, Week of ${cellDate(weekStart(decJun))}`, [june.base, june.low, june.high], [juneBid.base, juneBid.low, juneBid.high]),
      row(`Simulated, Week of ${cellDate(weekStart(decNov))}`, sim(ma.levels[decNov]), sim(mb.levels[decNov])),
      row(`Simulated, Week of ${cellDate(weekStart(decJun))}`, sim(ma.levels[decJun]), sim(mb.levels[decJun])),
      row(`Simulated Peak to ${cellDate(peakBy)}`, sim(ma.peakLevel), sim(mb.peakLevel)),
      row(`Simulated Low, Mar to Sep ${isoYear(peakBy)}`, sim(ma.troughLevel), sim(mb.troughLevel))];
    document.getElementById('card-decision-levels').innerHTML = card({evidence: 'model', title: `${bench}: What 10 Million gp Buy and 100 TC Fetch`,
      sub: t(`${priceUnit}. Central value; in brackets, the heuristic stress band (ensemble) or P10 to P90 (simulation, ${sampleName(k)}, seed ${SEED})`, `${priceUnit}. Valor central; entre parênteses, a heuristic stress band (ensemble) ou P10 a P90 (simulation, ${sampleName(k)}, seed ${SEED})`), controls: sampleControl(),
      body: table({groups: [{label: 'Scenario', span: 1, rowspan: 2}, {label: 'Gold Holder Buying', span: 3, start: true}, {label: 'TC Holder Selling', span: 3, start: true}],
        columns: [{key: 'label', label: 'Scenario', rowspan: true, wrap: true}, {key: 'ask', label: 'Sell Offers', num: true, groupStart: true, render: asIs}, {key: 'tc', label: 'TC for 10 Million gp', num: true, render: asIs}, signed('buyVs', 'Vs Today'),
          {key: 'bid', label: 'Buy Offers', num: true, groupStart: true, render: asIs}, {key: 'gp', label: 'Gp for 100 TC', num: true, render: asIs}, signed('sellVs', 'Vs Today')], rows, sortable: false,
        caption: t('Vs Today: the TC the same gold buys, or the gold the same TC fetch, against taking today\'s offers. Peak and low are each path\'s own, reachable only in hindsight.', 'Vs Today: as TC que o mesmo gold compra, ou o gold que as mesmas TC rendem, em relação a aceitar as offers de hoje. Peak e mínimo são os de cada path, alcançáveis só em retrospectiva.')})});
  }, ['sample'], ['card-decision-levels']);
  on(() => {
    const k = state.sample, wc = waitCurve(k), BUY = 'Buying Later: More TC', SELL = 'Selling Later: More Gold';
    document.getElementById('card-decision-curve').innerHTML = card({evidence: 'model', title: 'Chance That Waiting Beats Acting Today',
      sub: t(`${bench}; taking offers; share of simulated paths, ${sampleName(k)}, seed ${SEED}`, `${bench}; como taker; fração dos paths simulados, ${sampleName(k)}, seed ${SEED}`), controls: sampleControl(),
      body: '<div class="chart" id="ch-decision-curve"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, probability('buyer', BUY), probability('seller', SELL)], rows: wc})});
    chart('ch-decision-curve', host => lineChart(host, {fixedRange: true, domain: [0, 100], yFmt: pctScale, tipFmt: pctScale,
      aria: t(`Probability that buying or selling in each week, instead of on ${shortDate(antica.date)}, yields more TC or more gold`, `Probabilidade de que comprar ou vender em cada semana, em vez de em ${shortDate(antica.date)}, renda mais TC ou mais gold`),
      series: [{label: BUY, cls: 'c-ask', points: wc.map(x => [x.date, x.buyer * 100])}, {label: SELL, cls: 'c-bid', points: wc.map(x => [x.date, x.seller * 100])}],
      vlines: [{x: decNov, label: shortDate(weekStart(decNov))}, {x: decJun, label: shortDate(weekStart(decJun))}]}));
  }, ['sample'], ['card-decision-curve']);
  // Each player's plans against taking today's quote: the condition under which the plan gains, the odds and the spread of outcomes.
  const planLabel = (p, week) => ({nov: `Take ${week}, Week of ${cellDate(weekStart(decNov))}`, jun: `Take ${week}, Week of ${cellDate(weekStart(decJun))}`,
    junMake: `Make a Buy Offer, Week of ${cellDate(weekStart(decJun))}`, novMake: `Make a Sell Offer, Week of ${cellDate(weekStart(decNov))}`,
    half: `Half Today, Half in the Week of ${cellDate(weekStart(week === 'Sell Offers' ? decJun : decNov))}`,
    staged: `Equal Weekly ${week === 'Sell Offers' ? 'Purchases' : 'Sales'}, ${cellDate(weekStart(p.window?.[0] || decNov))} to ${cellDate(weekStart(p.window?.[1] || decNov))}`,
    peak: 'At Each Path\'s Peak (Hindsight)', low: 'At Each Path\'s Low (Hindsight)'})[p.plan];
  const gainsIf = {buyer: {nov: `Sell Offers below ${fmt(antica.ask)}`, jun: `Sell Offers below ${fmt(antica.ask)}`, half: `Sell Offers below ${fmt(antica.ask)}`, junMake: `Buy Offers at or below ${fmt(buyMakeAtMost)}`, staged: `Average Paid below ${fmt(antica.ask)}`},
    seller: {nov: `Buy Offers above ${fmt(antica.bid)}`, jun: `Buy Offers above ${fmt(antica.bid)}`, half: `Buy Offers above ${fmt(antica.bid)}`, novMake: `Sell Offers at or above ${fmt(sellMakeAtLeast)}`, staged: `Average Received above ${fmt(antica.bid)}`}};
  const planCard = (actor, id, title, week, unit, per) => on(() => {
    const k = state.sample, rows = DC[actor][k].map(p => ({...p, label: planLabel(p, week), gains: gainsIf[actor][p.plan] || MISSING, per: per(q50(p))}));
    const pct = i => ({key: `q${i}`, label: ['P10', 'P25', 'Median', 'P75', 'P90'][i], num: true, render: (v, r) => sgn(r.quantiles[i]), cls: (v, r) => cls(r.quantiles[i])});
    document.getElementById(id).innerHTML = card({evidence: 'model', title,
      sub: t(`${bench}; change against taking today's ${week} at ${fmt(week === 'Sell Offers' ? antica.ask : antica.bid)}, %; share of ${fmt(PATHS)} simulated paths, ${sampleName(k)}, seed ${SEED}`, `${bench}; variação em relação a aceitar as ${week} de hoje a ${fmt(week === 'Sell Offers' ? antica.ask : antica.bid)}, %; fração de ${fmt(PATHS)} paths simulados, ${sampleName(k)}, seed ${SEED}`), controls: sampleControl(),
      body: table({columns: [{key: 'label', label: 'Plan', wrap: true}, {key: 'gains', label: 'Gains If', wrap: true}, probability('pBetter', actor === 'buyer' ? 'P(More TC)' : 'P(More Gold)'),
        pct(0), pct(2), pct(4), {key: 'per', label: unit, num: true, render: asIs}, signed('gainIfBetter', 'Median If Better'), signed('lossIfWorse', 'Median If Worse')], rows, sortable: false,
        caption: t(`P10 and P90 bound the central 80% of paths; the ${unit} column applies the median. Making an offer pays the 2% fee and assumes it fills. Hindsight rows are bounds that no plan can target.`, `P10 e P90 delimitam os 80% centrais dos paths; a coluna ${unit} aplica a median. Criar uma offer paga a fee de 2% e presume sua execução. As linhas de retrospectiva são limites que nenhum plano consegue mirar.`)})});
  }, ['sample'], [id]);
  planCard('buyer', 'card-decision-buyer', 'Gold Holder: Plans against Buying Today', 'Sell Offers', 'TC for 10 Million gp', v => fmt(tcFor(antica.ask) * (1 + v / 100), 1));
  planCard('seller', 'card-decision-seller', 'TC Holder: Plans against Selling Today', 'Buy Offers', 'Gp for 100 TC', v => fmt(goldFor(antica.bid) * (1 + v / 100)));
  on(() => {
    document.getElementById('card-decision-history').innerHTML = card({evidence: 'observed', title: `${bench}: The Same Decisions in Past Cycles`,
      sub: t(`Weekly medians; change against acting in the week holding ${dayMonth(antica.date)}, %`, `Weekly medians; variação em relação a agir na semana que contém ${dayMonth(antica.date)}, %`),
      body: table({groups: [{label: 'Cycle', span: 1, rowspan: 2}, {label: 'Buying Later: TC', span: 3, start: true}, {label: 'Selling Later: Gold', span: 3, start: true}],
        columns: [{key: 'cycle', label: 'Cycle', rowspan: true}, {...signed('buyNov', 'Nov Week'), groupStart: true}, signed('buyJun', 'June Week'), signed('buyLow', 'At Low'),
          {...signed('sellNov', 'Nov Week'), groupStart: true}, signed('sellJun', 'June Week'), signed('sellPeak', 'At Peak')], rows: pastCycles, sortable: false,
        caption: t('Buying takes the Sell Offers and selling takes the Buy Offers. The low is the lowest week from March to September of the following year, the peak the highest week up to February, both known only afterwards.', 'A compra aceita as Sell Offers e a venda aceita as Buy Offers. O mínimo é a semana mais baixa de março a setembro do ano seguinte, e o peak, a mais alta até fevereiro, ambos conhecidos só depois.')}),
      drawer: table({columns: [{key: 'cycle', label: 'Cycle'}, {key: 'ref', label: 'Reference Week', render: cellDate}, num('ask', 'Sell Offers'), num('bid', 'Buy Offers'), {key: 'nov', label: 'Nov Week', render: cellDate}, {key: 'jun', label: 'June Week', render: cellDate},
        {key: 'peakDate', label: 'Peak Week', render: cellDate}, {key: 'lowDate', label: 'Low Week', render: cellDate}], rows: pastCycles, sortable: false})});
  }, [], ['card-decision-history']);
  on(() => {
    document.getElementById('card-anchor').innerHTML = card({evidence: 'model', title: sided('Starting Capture Sensitivity', 'ask'), sub: t(`Training since 2023, seed ${SEED}; thresholds fixed at the capture of ${cutoffDay} (${fmt(antica.ask)})`, `Treino desde 2023, seed ${SEED}; thresholds fixos na captura de ${cutoffDay} (${fmt(antica.ask)})`), body: table({columns: [
      {key: 'capture', label: 'Captura', render: v => /^\d{4}-/.test(v) ? cellDate(v) : v}, num('anchor', 'Partida'), num('peakP50', 'Máximo mediano'), num('troughP50', 'Mínimo mediano'),
      probability('pPeakAbove3OfReference', `Peak > ${fmt(Math.round(antica.ask * 1.03))}`), probability('pJun28BelowReference', `June < ${fmt(antica.ask)}`),
      probability('pJun28BelowNov30', 'June < Nov'), probability('fromPeakGt10', 'Fall > 10%')],
      rows: [...anchorRows, ...AA.filter(x => x.hours).map(x => ({capture: `Median, ${x.hours} Hours (${x.captures} Captures)`, anchor: x.ask, peakP50: x.peakP50, troughP50: x.troughP50, pPeakAbove3OfReference: x.pPeakAbove3, pJun28BelowReference: x.pJunBelowToday, pJun28BelowNov30: x.pJunBelowNov, fromPeakGt10: x.fromPeakGt10}))]})});
  }, [], ['card-anchor']);
  on(() => {
    const s = state.side;
    const seedRows = PK.stability.map((p, i) => { const o = P.sides[s].main.runs[i], o24 = P.sides[s].since2024.runs[i]; return {seed: p.seed, a: p.p_peak_gt3, b: p.p_jun27_below, c: p.p_trough_above_2026, e: o.prob.peakAbove3, g: o.prob.jun28BelowStart, h: o.prob.troughAbove2026, i: o24.prob.peakAbove3, j: o24.prob.jun28BelowStart, k: o24.prob.troughAbove2026}; });
    document.getElementById('card-seeds').innerHTML = card({evidence: 'model', title: sided('Seed Stability', s), sub: t(`Package (forecast_stability.json) and offers: peak at least +3%; June below the start; 2027 low above the 2026 low`, `Pacote (forecast_stability.json) e offers: peak de pelo menos +3%; junho abaixo do ponto de partida; mínimo de 2027 acima do de 2026`), controls: sideControl(), body: table({columns: [{key: 'seed', label: 'Semente', num: true, render: v => String(v)},
      probability('a', 'Pacote; ≥+3%'), probability('b', 'Junho'), probability('c', 'Mínimo'),
      probability('e', 'Desde 2023; ≥+3%'), probability('g', 'Junho'), probability('h', 'Mínimo'),
      probability('i', 'Desde 2024; ≥+3%'), probability('j', 'Junho'), probability('k', 'Mínimo')], rows: seedRows,
      caption: t(`If the ${fmt(PATHS)} paths were independent, the Monte Carlo error would be about ${fmt(PK.mcErrorPp.p_jun27_below[0], 1)} pp; because they derive from ${fmt(DRAWS)} parameter draws, it may reach about ${fmt(PK.mcErrorPp.p_jun27_below[1], 1)} pp. The training sample weighs more than the seed.`,
        `Se os ${fmt(PATHS)} paths fossem independentes, o erro de Monte Carlo seria de cerca de ${fmt(PK.mcErrorPp.p_jun27_below[0], 1)} pp; como derivam de ${fmt(DRAWS)} parameter draws, pode chegar a cerca de ${fmt(PK.mcErrorPp.p_jun27_below[1], 1)} pp. A training sample pesa mais do que a seed.`)})});
  }, ['side'], ['card-seeds']);
  on(() => {
    const s = state.side;
    document.getElementById('card-calib').innerHTML = card({evidence: 'backtested', title: sided('Out-of-Sample Calibration: Training Since 2023', s), sub: t('Fortnightly origins; ideal: 50% and 80% inside the intervals', 'Origins quinzenais; ideal: 50% e 80% dentro dos intervalos'), controls: sideControl(), body: table({columns: [num('horizon', 'Semanas'), num('n', 'Origens'), num('windows', 'Janelas sem sobreposição'),
      probability('cov50', 'Dentro de 50%'), probability('cov80', 'Dentro de 80%'),
      probability('meanPUp', 'P(alta) média'), probability('freqUp', 'Altas observadas'),
      num('brier', 'Brier; modelo', 2), num('brierSeasonal', 'Brier; ano anterior', 2), num('brierClimate', 'Brier; frequência histórica', 2), percent('mapePct', 'Erro da mediana', 1)],
      rows: P.calibration.filter(c => c.side === s), caption: t('A lower Brier score is better; a constant 50% scores 0.25. "Prior Year" repeats the direction of the same window a year earlier; "History" uses the share of rises over the horizon up to the origin.', 'Quanto menor o Brier score, melhor; 50% fixos resultam em 0,25. "Prior Year" repete a direção da mesma janela um ano antes; "History" usa a fração de altas no horizon até a origin.')})});
  }, ['side'], ['card-calib']);

  // 09: executable depth: Amount at the best prices, visible Amount and slippage bounds, latest capture of every world
  on(() => {
    const le = v => ok(v) ? `≤ ${pctU(v, 2)}` : 'Beyond Visible Book';
    document.getElementById('card-depth').innerHTML = card({evidence: 'observed', title: 'Executable Depth and Slippage Bounds',
      sub: t(`Latest capture of each world to ${cellDate(R.asOf)}; Amounts in TC; round-trip execution cost of an order that takes both sides, %`, `Última captura de cada world até ${cellDate(R.asOf)}; Amounts em TC; round-trip execution cost de uma ordem que atravessa os dois lados, %`),
      body: table({groups: [{label: 'Mundo', span: 1, rowspan: 2}, {label: 'Sell Offers', span: 2, start: true}, {label: 'Buy Offers', span: 2, start: true}, {label: 'Round-Trip Cost', span: 3, start: true}],
        columns: [{key: 'world', label: 'Mundo', rowspan: true}, num('askTop', 'Best Amount', 0, {groupStart: true}), num('askVisible', 'Visible'), num('bidTop', 'Best Amount', 0, {groupStart: true}), num('bidVisible', 'Visible'),
          percent('costPct', 'Best Quotes', 2, {groupStart: true}), {key: 'cost100', label: '100 TC', num: true, render: le, sortValue: r => r.cost100 ?? Infinity},
          {key: 'cost1000', label: '1,000 TC', num: true, render: le, sortValue: r => r.cost1000 ?? Infinity}], rows: DW,
        caption: t('Bounds, not estimates: the capture gives the best price, its Amount, the visible Amount and its gold value, not every level of the book. Captures are snapshots; the Amount at the best price changes between them.', 'Limites, não estimativas: a captura informa o best price, seu Amount, o Amount visível e seu valor em gold, não cada nível do book. Capturas são snapshots; o Amount no best price muda entre elas.')})});
  }, [], ['card-depth']);

  // 12: the Buy/Sell floor (the whole pipeline rerun under each floor) and the anchor windows of every world
  on(() => {
    const label = r => r.floor === null ? 'No Floor' : `${fmt(r.floor, 2)}${r.baseline ? ' (Baseline)' : ''}`;
    const rows = FR.slice().sort((a, b) => (a.floor ?? -1) - (b.floor ?? -1)).map(r => ({floor: label(r), excluded: r.excluded, worlds: floorWorlds(r).length, days: floorDays(r),
      prob: r.maxProbPp, mape: r.maxMapePp, level: r.maxLevelPct, lost: floorLost(r).length, reversed: r.verdicts.filter(v => v.changed).length}));
    const show = v => typeof v === 'boolean' ? (v ? 'Yes' : 'No') : cleanText(String(v));
    const ordered = FR.slice().sort((a, b) => (a.floor ?? -1) - (b.floor ?? -1));
    const vRows = frBase.verdicts.map((v, i) => Object.fromEntries([['statement', v.statement], ...ordered.map((r, j) => [`f${j}`, show(r.verdicts[i].value)])]));
    document.getElementById('card-filter').innerHTML = card({evidence: 'backtested', title: 'Buy/Sell Floor: Whole Pipeline Rerun',
      sub: t(`Each floor reruns every program to ${cellDate(R.asOf)}; changes against the baseline floor of ${fmt(frBase.floor, 2)}`, `Cada piso refaz todos os programas até ${cellDate(R.asOf)}; variações ante o piso de referência de ${fmt(frBase.floor, 2)}`),
      body: table({sortable: false, columns: [{key: 'floor', label: 'Floor'}, num('excluded', 'Records Excluded'), num('worlds', 'Worlds Changed'), num('days', 'Days Changed'),
        {key: 'prob', label: 'Largest Probability Change', num: true, render: v => `${fmt(v, 2)} pp`}, {key: 'mape', label: 'Largest MAPE Change', num: true, render: v => `${fmt(v, 3)} pp`},
        percent('level', 'Largest Level Change', 2), num('lost', 'Figures Unsupported'), num('reversed', 'Conclusions Reversed')], rows,
        caption: t('Days changed: daily values of a side that differ from the baseline. Probabilities in pp; levels are scenarios, anchors and simulated peaks and lows.', 'Days changed: valores diários de um lado que diferem da referência. Probabilidades em pp; níveis são scenarios, anchors e peaks e mínimos simulados.')}),
      drawer: table({sortable: false, columns: [{key: 'statement', label: 'Stated Conclusion', wrap: true}, ...ordered.map((r, j) => ({key: `f${j}`, label: label(r)}))], rows: vRows})});
    const dev = v => ok(v) ? sgn(v, 2) : MISSING;
    document.getElementById('card-anchors').innerHTML = card({evidence: 'observed', title: 'Latest Capture against 24- and 72-Hour Medians',
      sub: t(`Every modelled world; the difference is the latest capture against the median of the world's captures in the window, %`, `Todos os worlds modelados; a diferença compara a captura mais recente com a median das capturas do world na janela, %`),
      body: table({groups: [{label: 'Mundo', span: 1, rowspan: 2}, {label: 'Captures', span: 2, start: true}, {label: 'Sell Offers', span: 3, start: true}, {label: 'Buy Offers', span: 3, start: true}, {label: 'Reference', span: 2, start: true}],
        columns: [{key: 'world', label: 'Mundo', rowspan: true}, num('n24', '24 Hours', 0, {groupStart: true}), num('n72', '72 Hours'),
          num('ask', 'Latest', 0, {groupStart: true}), {key: 'askDev24', label: 'vs 24 Hours', num: true, render: dev}, {key: 'askDev72', label: 'vs 72 Hours', num: true, render: dev},
          num('bid', 'Latest', 0, {groupStart: true}), {key: 'bidDev24', label: 'vs 24 Hours', num: true, render: dev}, {key: 'bidDev72', label: 'vs 72 Hours', num: true, render: dev},
          percent('costPct', 'Round-Trip Cost', 2, {groupStart: true}), {key: 'bandPct', label: '13-Week Band', num: true, render: v => ok(v) ? `±${pctU(v, 1)}` : MISSING}], rows: AW,
        caption: t('A world with one capture in the window has a difference of zero: its latest quote stands alone. 13-Week Band: half-width of the heuristic stress band of the world\'s scenario.', 'Um world com uma captura na janela tem diferença zero: sua última quote está isolada. 13-Week Band: meia largura da heuristic stress band do scenario do world.')})});
  }, [], ['card-filter', 'card-anchors']);

  // 06: independent evidence per horizon, the registered challenger and the prospective record
  on(() => {
    const s = state.side;
    const rows = IND.filter(x => x.side === s).map(x => { const k = rollSkill(s, x.horizon); return {...x, skill: k?.skill, lo: k?.skillLow, hi: k?.skillHigh}; });
    document.getElementById('card-evidence').innerHTML = card({evidence: 'backtested', title: sided('Independent Evidence by Horizon', s),
      sub: t(`${bench}; weekly origins of the rolling validation, the effective number of independent loss differences and the non-overlapping target windows`, `${bench}; origins semanais da validação móvel, número efetivo de diferenças de perda independentes e janelas-alvo sem sobreposição`), controls: sideControl(),
      body: table({sortable: false, columns: [num('horizon', 'Semanas'), num('n', 'Weekly Origins'), num('nEff', 'Effective Size', 0),
        num('windows', 'Janelas sem sobreposição'), {key: 'skill', label: 'Skill vs Constant', num: true, render: (v, r) => ok(r.lo) ? `${sgn(v, 0)} <span class="dim">(${sgn(r.lo, 0)}${RANGE}${sgn(r.hi, 0)})</span>` : `${sgn(v, 0)} <span class="dim">(no interval)</span>`}], rows,
        caption: t('Effective size: origins times the ratio of the plain to the long-run variance of the loss difference, with Bartlett weights over h minus 1 lags; not estimable with fewer than two blocks of h origins.', 'Effective size: origins vezes a razão entre a variância simples e a de longo prazo da diferença de perda, com pesos de Bartlett em h menos 1 defasagens; não estimável com menos de dois blocos de h origins.')})});
  }, ['side'], ['card-evidence']);
  on(() => {
    document.getElementById('card-challenger').innerHTML = card({evidence: 'backtested', title: `${bench}: Registered Challenger C+S against C+S+H`,
      sub: t('Rolling origins; MAPE, %; difference in pp, negative where C+S is more accurate; 95% interval on the published block-bootstrap resamples', 'Origins móveis; MAPE, %; diferença em pp, negativa onde o C+S é mais preciso; intervalo de 95% nas mesmas reamostragens do block bootstrap publicado'),
      body: table({sortable: false, columns: [num('horizon', 'Semanas'), {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, num('mapeCS', 'C+S MAPE', 2), num('mapeCSH', 'C+S+H MAPE', 2),
        {key: 'diffPp', label: 'Difference', num: true, render: v => pp(v, 2), cls: v => cls(-v)}, {key: 'diffLow', label: '95% Interval', num: true, render: (v, r) => ok(v) ? `${pp(v, 2)}${RANGE}${pp(r.diffHigh, 2)}` : MISSING},
        probability('shareCsBetter', 'Resamples C+S Better'), num('n', 'Origens'), num('windows', 'Janelas sem sobreposição')], rows: IND.slice().sort((a, b) => a.horizon - b.horizon || a.side.localeCompare(b.side))})});
  }, [], ['card-challenger']);
  on(() => {
    if (frozen) {
      // Frozen forecasts, one row per edition; once weeks close, the mean absolute percentage error of each model by horizon band.
      const scored = f => LO.filter(o => o.forecast === f.seq).length;
      const band = h => h <= 13 ? '1 to 13 Weeks' : h <= 26 ? '14 to 26 Weeks' : '27 to 52 Weeks';
      const perf = {};
      LO.forEach(o => Object.entries(o.antica).forEach(([side, x]) => ['C', 'S', 'H', 'C+S', 'C+S+H'].forEach(m => {
        const k = `${band(x.horizon)}|${side}|${m}`; (perf[k] = perf[k] || []).push(x[m].ape); })));
      const perfRows = Object.entries(perf).map(([k, v]) => { const [b, side, model] = k.split('|'); return {band: b, side, model, n: v.length, mape: v.reduce((a, c) => a + c, 0) / v.length}; });
      document.getElementById('card-ledger').innerHTML = card({evidence: LO.length ? 'backtested' : 'model', title: 'Prospective Forecast Ledger',
        sub: t(`forecast-ledger.jsonl; ${fmt(LF.length)} frozen ${LF.length === 1 ? 'forecast' : 'forecasts'}, ${fmt(LO.length)} scored target ${LO.length === 1 ? 'week' : 'weeks'}`, `forecast-ledger.jsonl; ${fmt(LF.length)} ${LF.length === 1 ? 'forecast congelado' : 'forecasts congelados'}, ${fmt(LO.length)} ${LO.length === 1 ? 'semana-alvo avaliada' : 'semanas-alvo avaliadas'}`),
        body: table({sortable: false, columns: [{key: 'cutoff', label: 'Cutoff', render: cellDate}, {key: 'recorded', label: 'Recorded', render: cellDate}, {key: 'anchor', label: 'Anchor (Sell / Buy)'},
          num('targets', 'Weekly Targets'), num('worlds', 'Worlds'), {key: 'first', label: 'First Target Closes', render: cellDate}, num('scored', 'Scored Weeks')],
          rows: LF.map(f => ({cutoff: f.cutoff, recorded: f.recordedAt.slice(0, 10), anchor: `${fmt(f.anchor.ask)} / ${fmt(f.anchor.bid)}`, targets: f.targets.length, worlds: new Set(f.worlds.map(w => w.world)).size, first: f.weekEnding[0], scored: scored(f)})),
          caption: t('Each line is chained to the one before by its SHA-256; outcomes are appended as target weeks close, never written over the forecast.', 'Cada linha se encadeia à anterior por seu SHA-256; os resultados são acrescentados quando as semanas-alvo se encerram, nunca sobre o forecast.')}),
        drawer: perfRows.length ? table({columns: [{key: 'band', label: 'Horizon'}, {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, {key: 'model', label: 'Model'}, num('n', 'Weeks'), num('mape', 'MAPE', 2)], rows: perfRows}) : ''});
    }
  }, [], ['card-ledger']);

  // 13: falsification criteria, each with the reading at this cutoff
  on(() => {
    // Table text is English in both editions, so lists and months are joined here in English.
    const yCur = yA.currentMedianPct, yRec = yA.recentMedianPct, merger = relevantMergers[0];
    const listEn = a => a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a.at(-1)}` : a.join('');
    const peakMonths = [...new Set(peakDays.map(d => isoMonth(d)))].sort((x, y) => x - y).map(i => MONTHS_EN[i]);
    const rows = [
      {claim: 'Seasonal timing is stable', test: 'The 2026-27 peak falls outside October to February, or peak and trough dates change across reversal thresholds of 3% to 10%',
        now: `Complete peaks dated in ${peakMonths.join(' or ')}; dating stable from ${fmt(Math.min(...stable))}% to ${fmt(Math.max(...stable))}%`, status: 'observed'},
      {claim: 'The ensemble beats Constant', test: 'Updated with new origins, the 13-week skill interval against Constant includes zero, or the skill turns negative',
        now: `Skill ${pctU(skill13.skill, 0)} (${pctU(skill13.skillLow, 0)} to ${pctU(skill13.skillHigh, 0)}) over ${r13.n} weekly origins`, status: 'backtested'},
      {claim: 'Declines keep narrowing', test: `The fall from the coming peak exceeds the last complete decline, ${sgn(declines.at(-1).changePct)}`,
        now: `Declines ${listEn(declines.map(d => sgn(d.changePct)))}; model median ${sgn(d23.fromPeak[2])}`, status: 'observed'},
      {claim: 'Relative value is stable where the transfer is used', test: `The ${marketGroup(Y)} premium keeps compressing, or a world where the transfer beats Constant shows a level shift of 15% or more`,
        now: `${marketGroup(Y)} median premium ${sgn(yRec)} over 26 weeks, ${sgn(yCur)} at the latest captures; transfer beats Constant in ${trBeats.length} of ${trAsk.length} worlds`, status: 'observed'},
      ...(merger ? [{claim: 'A merger is confined to its participants', test: `${listEn(merger.participants)} into ${merger.successor} shifts premiums or spreads in other worlds, or ${merger.successor}'s price leaves the range of its participants`,
        now: `Announced ${cellDate(merger.announcedOn)}; ${merger.confirmedDate ? `confirmed for ${cellDate(merger.confirmedDate)}` : `not before ${cellDate(merger.notBefore)}, date unconfirmed`}`, status: 'observed'}] : []),
      {claim: 'C+S+H is the ensemble to publish', test: 'Scored in the forecast ledger, C+S keeps a lower error than C+S+H over two non-overlapping 13-week windows of frozen forecasts, with a paired interval below zero',
        now: `Backtest: C+S lower in ${csLower.length} of ${IND.length} cells, interval below zero in ${csSig.length}; ledger: ${LF.length} frozen ${LF.length === 1 ? 'forecast' : 'forecasts'}, ${LO.length} scored weeks`, status: 'backtested'},
      {claim: 'Worlds respond one-for-one to the benchmark', test: 'A slope estimated for each world beats the one-to-one transfer with an interval above zero in more worlds than it loses, in backtests or in the ledger',
        now: `Slope better in ${slopeWins.length} of ${TBci.length} testable cells, worse in ${slopeLoses.length}; median slope ${fmt(betaMedian, 2)}`, status: 'backtested'},
      {claim: 'Conclusions do not hinge on cleaning or anchor choices', test: 'A Buy/Sell floor from 0.70 to 0.85, no floor, or a 24- or 72-hour anchor reverses a stated conclusion',
        now: `${floorFlips.length + aaFlips.length} reversed; largest probability change ${fmt(Math.max(floorMaxPp, aaMaxPp), 1)} pp`, status: 'model'},
      {claim: 'Fall probabilities are informative', test: 'New forecasts score a Brier above 0.25, or the calibration intercept stays positive as origins accrue',
        now: `Brier ${fmt(pooled.brier, 3)}; mean P(fall) ${prob(pooled.meanP)} against ${prob(pooled.freq)} observed`, status: 'backtested'}];
    document.getElementById('card-falsification').innerHTML = card({title: 'Falsification Criteria',
      sub: t(`What would revise each element of the interpretation, and its reading at the cutoff of ${shortDate(R.asOf)}`, `O que revisaria cada elemento da interpretação, e sua leitura no cutoff de ${shortDate(R.asOf)}`),
      body: table({sortable: false, columns: [{key: 'claim', label: 'Thesis Element', wrap: true}, {key: 'test', label: 'Falsified If', wrap: true}, {key: 'now', label: 'Current Reading', wrap: true}, {key: 'status', label: 'Evidence', render: v => evidenceTag(v)}], rows})});
  }, [], ['card-falsification']);

  // The transfer exhibits share one horizon control, offering the horizons the rolling transfer test was run at.
  const TRANSFER_H = [...new Set(R.transferRolling.map(x => x.horizon))].sort((a, b) => a - b).map(String);
  const transferHorizonControl = () => stateControl({label: 'Horizon', key: 'transferH', options: TRANSFER_H.map(h => [h, `${h}W`])});

  // 11: the one-to-one transfer against a slope and a slope with drift estimated for each world before each origin
  on(() => {
    const s = state.side, h = +state.transferH;
    const slopeVerdict = x => !x || !ok(x.skill_slopeLow) ? 'Too Few Origins' : x.skill_slopeLow > 0 ? 'Slope Better' : x.skill_slopeHigh < 0 ? 'One-to-One Better' : 'Inconclusive';
    const rows = worlds.filter(w => w.world !== bench).map(w => {
      const x = TB.find(r => r.world === w.world && r.side === s && r.horizon === h), c = X.transfer.current.find(r => r.world === w.world && r.side === s && r.horizon === h);
      return {world: w.world, pairs: c?.pairs, beta: c?.beta, lo: c?.betaLow, hi: c?.betaHigh, n: x?.n, windows: x?.windows, prop: x?.mapeProp, slope: x?.mapeSlope, drift: x?.mapeDrift, naive: x?.mapeNaive,
        skill: x?.skill_slope, sLo: x?.skill_slopeLow, sHi: x?.skill_slopeHigh, verdict: slopeVerdict(x)};
    }).filter(r => ok(r.beta) || ok(r.n)).sort((a, b) => (ok(b.skill) ? b.skill : -Infinity) - (ok(a.skill) ? a.skill : -Infinity));
    const opt = (v, d = 2) => ok(v) ? fmt(v, d) : MISSING;
    document.getElementById('card-transfer-slope').innerHTML = card({evidence: 'backtested', title: sided('One-to-One Transfer against an Estimated Slope', s),
      sub: t(`${h}-week changes; slope fitted on spans completed before each origin; MAPE, %; skill of the slope rule against the one-to-one rule with a 95% block-bootstrap interval`, `Variações de ${h} semanas; inclinação ajustada nos intervalos concluídos antes de cada origin; MAPE, %; skill da regra com inclinação ante a de um para um, com intervalo de block bootstrap de 95%`),
      controls: sideControl() + transferHorizonControl(),
      body: table({columns: [{key: 'world', label: 'Mundo'}, {key: 'beta', label: 'Slope (95% Interval)', num: true, render: (v, r) => ok(v) ? `${fmt(v, 2)} <span class="dim">(${opt(r.lo)}${RANGE}${opt(r.hi)})</span>` : MISSING}, num('pairs', 'Spans'),
        num('n', 'Origens'), num('windows', 'Janelas sem sobreposição'), {key: 'prop', label: 'One-to-One', num: true, render: v => opt(v)}, {key: 'slope', label: 'Slope', num: true, render: v => opt(v)}, {key: 'drift', label: 'Slope and Drift', num: true, render: v => opt(v)},
        {key: 'naive', label: 'Constant', num: true, render: v => opt(v)}, {key: 'skill', label: 'Slope vs One-to-One', num: true, render: (v, r) => ok(v) ? `${sgn(v, 0)}${ok(r.sLo) ? ` <span class="dim">(${sgn(r.sLo, 0)}${RANGE}${sgn(r.sHi, 0)})</span>` : ''}` : MISSING}, {key: 'verdict', label: 'Verdict'}], rows,
        caption: t(`Slope over the full history, with a block-bootstrap interval over runs of ${h} spans. A world needs ${X.transfer.minPairs} completed spans before an origin to enter the test.`, `Inclinação no histórico completo, com intervalo de block bootstrap sobre sequências de ${h} intervalos. Um world precisa de ${X.transfer.minPairs} intervalos concluídos antes de uma origin para entrar no teste.`)})});
  }, ['side', 'transferH'], ['card-transfer-slope']);

  // 10: transferability matrix: the rolling transfer test beside premium stability, correlation, history and type
  on(() => {
    const s = state.side, h = +state.transferH;
    const rows = worlds.filter(w => w.world !== bench).map(w => {
      const cw = cwOf(w.world, s), x = TR(w.world, s, h);
      return {world: w.world, kind: worldKind(w.world), weeks: cw?.weeks, corr: cw?.corrWeekly, premium: cw?.recentPremiumPct, stress: w[`${s}LocalStress`] * 100, shift: cw?.largestShiftPct,
        flags: [w.mergerDate ? 'Merger' : '', cw?.breakWeek ? 'Level Shift' : '', w.stale ? 'Stale' : ''].filter(Boolean).join(', ') || MISSING,
        n: x?.n, mape: x?.mape, naive: x?.naiveMape, skill: x?.skill, lo: x?.skillLow, hi: x?.skillHigh, verdict: verdictOf(x)};
    }).sort((a, b) => (ok(b.skill) ? b.skill : -Infinity) - (ok(a.skill) ? a.skill : -Infinity));
    const opt = v => ok(v) ? v : null;
    document.getElementById('card-transfer').innerHTML = card({evidence: 'backtested', title: sided('Transferability Matrix', s),
      sub: t(`Transfer of ${bench}'s ensemble path against each world's own Constant, rolling weekly origins at ${h} weeks; premium over ${bench} in %`, `Transferência do path do ensemble de ${bench} ante o Constant de cada world, origins semanais móveis em ${h} semanas; premium sobre ${bench} em %`),
      controls: sideControl() + transferHorizonControl(),
      body: table({columns: [{key: 'world', label: 'Mundo'}, {key: 'kind', label: 'Tipo', render: v => esc(tableValue(v || MISSING))}, num('weeks', 'Paired Weeks'), num('corr', 'Correlação semanal', 2),
        {key: 'premium', label: 'Premium 26W', num: true, render: v => sgn(opt(v))}, {key: 'stress', label: 'Premium Instability', num: true, render: v => pctU(opt(v))}, {key: 'shift', label: 'Maior mudança de patamar', num: true, render: v => sgn(opt(v))},
        {key: 'flags', label: 'Flags'}, num('n', 'Origens'), num('mape', 'Transfer MAPE', 2), num('naive', 'Constant MAPE', 2),
        {key: 'skill', label: 'Skill', num: true, render: v => sgn(opt(v)), cls: v => cls(v)}, {key: 'lo', label: '95% CI', num: true, sortValue: r => r.lo, render: (v, r) => ok(v) ? `${sgn(v, 0)}${RANGE}${sgn(r.hi, 0)}` : MISSING}, {key: 'verdict', label: 'Verdict'}], rows,
        caption: t(`Premium instability: 80th percentile of the absolute 13-week change in the log premium over ${bench}, the term that widens each world's stress band. Skill: reduction in MAPE against the world's own last quote; 95% circular block bootstrap over runs of ${h} origins, reported where two such blocks fit.`, `Instabilidade do premium: percentil 80 da variação absoluta de 13 semanas do log premium sobre ${bench}, o termo que amplia a stress band de cada world. Skill: redução do MAPE ante a última quote do próprio world; circular block bootstrap de 95% sobre sequências de ${h} origins, informado onde cabem dois desses blocos.`)})});
  }, ['side', 'transferH'], ['card-transfer']);

  // 06: rolling origins, skill with block-bootstrap intervals, the ablation and the calibration of the probability of a fall
  on(() => {
    const s = state.side, H = V.horizons;
    const metricRows = H.flatMap(h => ['Constante', 'Sazonal 52 semanas', 'Harmônico', ENSEMBLE].map(m => rollMetric(s, h, m)));
    document.getElementById('card-rolling').innerHTML = card({evidence: 'backtested', title: sided(`${bench}: Rolling-Origin Accuracy`, s),
      sub: t(`Weekly origins scored at fixed horizons; the same targets for every model; MAE in gp, other measures in %`, `Origins semanais avaliadas em horizons fixos; os mesmos alvos para todos os modelos; MAE em gp, demais medidas em %`), controls: sideControl(),
      body: table({columns: [num('horizon', 'Semanas'), {key: 'model', label: 'Model', render: v => modelName(v)}, num('n', 'Origens'), num('windows', 'Janelas sem sobreposição'),
        num('mape', 'MAPE', 2), num('mae', 'MAE'), num('smape', 'sMAPE', 2), num('logError', 'Log Error', 2), signed('bias', 'Bias', 2)], rows: metricRows,
        caption: t(`Bias is the mean of ${tex(String.raw`100 \ln(P/\hat P)`)}: positive when the model forecast too low. Origins from ${cellDate(metricRows[0].firstOrigin)}.`, `Bias é a média de ${tex(String.raw`100 \ln(P/\hat P)`)}: positivo quando o modelo previu baixo demais. Origins a partir de ${cellDate(metricRows[0].firstOrigin)}.`)})});

    const vsC = H.map(h => rollSkill(s, h)), vsS = H.map(h => rollSkill(s, h, ENSEMBLE, 'Sazonal 52 semanas'));
    const quarter = h => { const q = summaries.find(x => x.horizon === h && x.side === s); return q && ok(q.ensemble) ? (1 - q.ensemble / q.constant) * 100 : null; };
    document.getElementById('card-skill').innerHTML = card({evidence: 'backtested', title: sided('Ensemble Skill against Benchmarks', s),
      sub: t(`${bench}; reduction in MAPE, %; whiskers: 95% circular block bootstrap over runs of h origins`, `${bench}; redução do MAPE, %; whiskers: circular block bootstrap de 95% sobre sequências de h origins`), controls: sideControl(),
      body: '<div class="chart" id="ch-skill"></div>',
      drawer: table({columns: [num('horizon', 'Semanas'), {key: 'reference', label: 'Benchmark', render: v => modelName(v)}, num('n', 'Origens'), num('nEff', 'Effective Size', 0), num('windows', 'Janelas sem sobreposição'), num('mape', 'Ensemble MAPE', 2), num('referenceMape', 'Benchmark MAPE', 2),
        signed('skill', 'Skill'), {key: 'skillLow', label: 'Lower CI', num: true, render: v => sgn(v)}, {key: 'skillHigh', label: 'Upper CI', num: true, render: v => sgn(v)},
        probability('shareBetter', 'Resamples Better')], rows: [...vsC.map(x => ({...x, nEff: ind(s, x.horizon)?.nEff})), ...vsS],
        caption: t(`Quarterly origins against Constant: ${H.map(h => `${h} weeks ${sgn(quarter(h))}`).join(', ')}.`, `Origins trimestrais ante o Constant: ${H.map(h => `${h} semanas ${sgn(quarter(h))}`).join(', ')}.`)})});
    chart('ch-skill', host => barChart(host, {
      aria: t(`Skill of the ensemble against Constant and Seasonal Naive at 13, 26 and 52 weeks, ${SIDES[s]}`, `Skill do ensemble ante Constant e Seasonal Naive em 13, 26 e 52 semanas, ${SIDES[s]}`),
      categories: H.map(h => `${h}W`), yFmt: v => pctU(v, 0), tipFmt: v => sgn(v), ciLabel: t('95% block bootstrap', 'Block bootstrap de 95%'),
      series: [{label: 'vs Constant', cls: 'c-ink', values: vsC.map(x => x.skill), lo: vsC.map(x => x.skillLow), hi: vsC.map(x => x.skillHigh)},
        {label: 'vs Seasonal Naive', cls: 'c-muted', values: vsS.map(x => x.skill), lo: vsS.map(x => x.skillLow), hi: vsS.map(x => x.skillHigh)}]}));

    const single = H.flatMap(h => ['Sazonal 52 semanas', 'Harmônico'].map(m => rollSkill(s, h, m)));
    const ablRows = [...V.ablation.filter(x => x.side === s), ...single].sort((a, b) => a.horizon - b.horizon || a.mape - b.mape);
    document.getElementById('card-ablation').innerHTML = card({evidence: 'backtested', title: sided('Ensemble Ablation', s),
      sub: t(`${bench}; equal-weight combinations of Constant (C), Seasonal Naive (S) and Harmonic (H) on identical origins; skill against Constant`, `${bench}; combinações com pesos iguais de Constant (C), Seasonal Naive (S) e Harmonic (H) nas mesmas origins; skill ante o Constant`), controls: sideControl(),
      body: table({columns: [num('horizon', 'Semanas'), {key: 'model', label: 'Combination', render: v => modelName(v)}, num('mape', 'MAPE', 2), signed('skill', 'Skill'),
        {key: 'skillLow', label: '95% CI', num: true, sortValue: r => r.skillLow, render: (v, r) => ok(v) ? `${sgn(v, 0)}${RANGE}${sgn(r.skillHigh, 0)}` : MISSING}, probability('shareBetter', 'Resamples Better')], rows: ablRows,
        caption: t(`Constant MAPE: ${H.map(h => `${h} weeks ${pctU(rollMetric(s, h, 'Constante').mape, 2)}`).join(', ')}.`, `MAPE do Constant: ${H.map(h => `${h} semanas ${pctU(rollMetric(s, h, 'Constante').mape, 2)}`).join(', ')}.`)})});

    const cdAll = P.calibrationDiagnostics.find(c => c.side === s && c.horizon === 0), cdRows = P.calibrationDiagnostics.filter(c => c.side === s).sort((a, b) => (a.horizon || 99) - (b.horizon || 99));
    document.getElementById('card-reliability').innerHTML = card({evidence: 'backtested', title: sided('Reliability of P(Fall)', s),
      sub: t(`${bench}; ${cdAll.n} fortnightly forecasts at 4 to 52 weeks, training since 2023; five equal bins`, `${bench}; ${cdAll.n} forecasts quinzenais de 4 a 52 semanas, treino desde 2023; cinco faixas iguais`), controls: sideControl(),
      body: '<div class="chart" id="ch-reliability"></div>', note: t(`Forecasts per bin, from the lowest: ${list(cdAll.bins.map(b => fmt(b.n)))}.`, `Forecasts por faixa, da mais baixa: ${list(cdAll.bins.map(b => fmt(b.n)))}.`),
      drawer: table({columns: [{key: 'lo', label: 'Forecast Bin', render: (v, r) => `${fmt(v * 100)}${RANGE}${fmt(r.hi * 100)}%`}, num('n', 'Forecasts'), probability('meanP', 'Mean Forecast'), probability('freq', 'Observed Falls')], rows: cdAll.bins})});
    chart('ch-reliability', host => lineChart(host, {numericX: true, xDomain: [0, 100], domain: [0, 100], xFmt: v => pctU(v, 0), yFmt: v => pctU(v, 0), tipFmt: v => pctU(v, 0),
      tipHead: v => t(`Mean forecast ${fmt(+v)}%`, `Forecast médio ${fmt(+v)}%`),
      aria: t(`Observed frequency of falls against the mean forecast probability of a fall, ${SIDES[s]}`, `Frequência observada de quedas ante a probabilidade média de queda prevista, ${SIDES[s]}`),
      series: [{label: t('Perfect calibration', 'Calibration perfeita'), cls: 'c-muted', dash: true, thin: true, points: [[0, 0], [100, 100]]},
        {label: t('Observed frequency of falls', 'Frequência observada de quedas'), cls: `c-${s}`, dots: true, points: cdAll.bins.map(b => [b.meanP * 100, b.freq * 100])}]}));
    document.getElementById('card-calib-stats').innerHTML = card({evidence: 'backtested', title: sided('Calibration of P(Fall)', s),
      sub: t('Brier score and its decomposition; logistic calibration intercept and slope (0 and 1 when calibrated)', 'Brier score e sua decomposição; intercepto e inclinação da calibration logística (0 e 1 quando calibrado)'), controls: sideControl(),
      body: table({sortable: false, columns: [{key: 'horizon', label: 'Semanas', render: v => v ? String(v) : 'All'}, num('n', 'Forecasts'), probability('meanP', 'Mean P(Fall)'), probability('freq', 'Observed Falls'),
        num('brier', 'Brier', 3), num('reliability', 'Reliability', 3), num('resolution', 'Resolution', 3), num('uncertainty', 'Uncertainty', 3),
        num('intercept', 'Intercept', 2), num('slope', 'Slope', 2)], rows: cdRows,
        caption: t('Brier equals reliability minus resolution plus uncertainty, up to the spread of forecasts within each bin. A slope above 1 means forecasts too timid; a positive intercept, falls forecast too rarely. Overlapping origins overstate the independent evidence; N/A marks a horizon without a finite estimate.', 'Brier é igual a reliability menos resolution mais uncertainty, a menos da dispersão dos forecasts dentro de cada faixa. Inclinação acima de 1 indica forecasts tímidos demais; intercepto positivo, quedas previstas raramente demais. Origins sobrepostas superestimam a evidência independente; N/A marca um horizon sem estimativa finita.')})});
  }, ['side'], ['card-rolling', 'card-skill', 'card-ablation', 'card-reliability', 'card-calib-stats']);

  // 08: will the price fall? Two references for a fall, its size, both training windows and what moves the probabilities.
  on(() => {
    const s = state.side, k = state.sample, d = DS[s][k];
    document.getElementById('card-downside-curve').innerHTML = card({evidence: 'model', title: sided('Probability of Trading below Two References', s),
      sub: t(`${bench}; share of ${fmt(PATHS)} simulated paths, ${sampleName(k)}, seed ${SEED}; today's price ${fmt(antica[s])}`, `${bench}; fração de ${fmt(PATHS)} paths simulados, ${sampleName(k)}, seed ${SEED}; price de hoje ${fmt(antica[s])}`),
      controls: sideControl() + sampleControl(), body: '<div class="chart" id="ch-downside-curve"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, probability('belowStart', 'Below Today'),
        probability('belowNov', `Below Own ${shortDate(weekStart(novWeek))} Level`)], rows: d.curve})});
    chart('ch-downside-curve', host => lineChart(host, {
      aria: t(`${bench}, ${SIDES[s]}: probability of trading below today's price and below each path's own level in the week of ${shortDate(weekStart(novWeek))}, by week to September 2027`, `${bench}, ${SIDES[s]}: probabilidade de negociar abaixo do price de hoje e abaixo do próprio nível de cada path na semana de ${shortDate(weekStart(novWeek))}, por semana até setembro de 2027`),
      fixedRange: true, domain: [0, 100], yFmt: pctScale, tipFmt: pctScale,
      series: [{label: t(`Below today's price (${fmt(antica[s])})`, `Abaixo do price de hoje (${fmt(antica[s])})`), cls: 'c-ink', points: d.curve.map(x => [x.date, x.belowStart * 100])},
        {label: t(`Below its own level in the week of ${shortDate(weekStart(novWeek))}`, `Abaixo do próprio nível na semana de ${shortDate(weekStart(novWeek))}`), cls: `c-${s}`, points: d.curve.filter(x => ok(x.belowNov)).map(x => [x.date, x.belowNov * 100])}],
      vlines: [{x: novWeek, label: shortDate(weekStart(novWeek))}, {x: junWeek, label: shortDate(weekStart(junWeek))}],
    }));

    const da = DS[s].main, db = DS[s].since2024, a = run(s, 'main'), b = run(s, 'since2024');
    document.getElementById('card-downside-size').innerHTML = card({evidence: 'model', title: sided('Fall after the Peak', s),
      sub: t(`${bench}; share of paths whose fall from their own peak exceeds each size, seed ${SEED}`, `${bench}; fração dos paths cuja queda a partir do próprio peak supera cada tamanho, seed ${SEED}`), controls: sideControl(), body: '<div class="chart" id="ch-downside-size"></div>',
      drawer: table({columns: [{key: 'fallPct', label: 'Fall of More Than', render: v => `${fmt(v)}%`}, probability('a1', 'From Peak, Since 2023'), probability('b1', 'From Peak, Since 2024'),
        probability('a2', 'Nov to June, Since 2023'), probability('b2', 'Nov to June, Since 2024'),
        probability('a3', 'Today to June, Since 2023'), probability('b3', 'Today to June, Since 2024')],
        rows: da.thresholds.map((x, i) => ({fallPct: x.fallPct, a1: x.fromPeak, b1: db.thresholds[i].fromPeak, a2: x.junVsNov, b2: db.thresholds[i].junVsNov, a3: x.junVsStart, b3: db.thresholds[i].junVsStart})),
        caption: t(`November and June are the weeks of ${shortDate(weekStart(novWeek))} and ${shortDate(weekStart(junWeek))}; "today" is the capture of ${shortDate(antica.date)}.`, `Novembro e junho são as semanas de ${shortDate(weekStart(novWeek))} e ${shortDate(weekStart(junWeek))}; "hoje" é a captura de ${shortDate(antica.date)}.`)})});
    chart('ch-downside-size', host => barChart(host, {
      aria: t(`${bench}, ${SIDES[s]}: probability that the fall from the peak exceeds 5% to 25%, by training window`, `${bench}, ${SIDES[s]}: probabilidade de a queda a partir do peak superar de 5% a 25%, por training window`),
      categories: da.thresholds.map(x => `> ${fmt(x.fallPct)}%`), yFmt: pctScale, tipFmt: pctScale,
      series: [{label: 'Since 2023', cls: 'c-ink', values: da.thresholds.map(x => x.fromPeak * 100)}, {label: 'Since 2024', cls: 'c-muted', values: db.thresholds.map(x => x.fromPeak * 100)}]}));

    const pRow = (label, x, y) => ({label, a: prob(x), b: prob(y), gap: pp(pc(y) - pc(x), 0)});
    const q = v => `${sgn(v[2])} <span class="dim">(${sgn(v[0])}${RANGE}${sgn(v[4])})</span>`;
    const wk = v => `${cellDate(weekStart(v[1]))} <span class="dim">(${shortDate(weekStart(v[0]))}${RANGE}${shortDate(weekStart(v[2]))})</span>`;
    const nov = cellDate(weekStart(novWeek)), jun = cellDate(rebuyWeek);
    document.getElementById('card-downside-table').innerHTML = card({evidence: 'model', title: sided('Downside by Training Window', s),
      sub: t(`${bench}; seed ${SEED}; weeks named by their Monday; today's price ${fmt(antica[s])}`, `${bench}; seed ${SEED}; semanas nomeadas pela segunda-feira; price de hoje ${fmt(antica[s])}`), controls: sideControl(),
      body: table({sortable: false, columns: [{key: 'label', label: 'Evento', wrap: true}, {key: 'a', label: 'Since 2023', num: true, render: asIs}, {key: 'b', label: 'Since 2024', num: true, render: asIs}, {key: 'gap', label: 'Gap', num: true, render: asIs}],
        rows: [pRow(`Peak by ${cellDate(peakBy)} at least 3% above today`, a.prob.peakAbove3, b.prob.peakAbove3),
          pRow(`Week of ${nov} above today`, a.prob.nov30AboveStart, b.prob.nov30AboveStart),
          ...[5, 10, 15].map(x => pRow(`Fall of more than ${x}% from the peak`, fallAt(da, x).fromPeak, fallAt(db, x).fromPeak)),
          pRow(`Week of ${jun} below the week of ${nov}`, a.prob.jun28BelowNov30, b.prob.jun28BelowNov30),
          pRow(`Week of ${jun} below today`, a.prob.jun28BelowStart, b.prob.jun28BelowStart),
          pRow('March to September 2027 low below today', da.troughBelowStart, db.troughBelowStart),
          {label: 'Fall from the peak: median (P10 to P90)', a: q(da.fromPeak), b: q(db.fromPeak), gap: pp(db.fromPeak[2] - da.fromPeak[2])},
          {label: `Week of ${jun} against today: median (P10 to P90)`, a: q(da.junVsStart), b: q(db.junVsStart), gap: pp(db.junVsStart[2] - da.junVsStart[2])},
          {label: 'Lowest week after the peak: median (P10 to P90)', a: wk(da.lowDate), b: wk(db.lowDate), gap: MISSING}],
        caption: t(`Gap: Since 2024 minus Since 2023, in percentage points. Only the model trained since 2023 has a probabilistic backtest (section ${chapterNum('s06')}).`, `Gap: Since 2024 menos Since 2023, em pontos percentuais. Apenas o modelo treinado desde 2023 tem backtest probabilístico (seção ${chapterNum('s06')}).`)})});
  }, ['side', 'sample'], ['card-downside-curve', 'card-downside-size', 'card-downside-table']);

  const TORNADO = [['peakAbove3', 'Peak ≥ +3%'], ['jun28BelowStart', 'June < Today'], ['jun28BelowNov30', 'June < Nov'], ['fromPeakGt10', 'Fall > 10%']];
  const FACTORS = {seed: 'Random Seed', window: 'Training Window', anchor: 'Starting Capture', spec: 'Model Specification'};
  // A starting capture is labelled by its date and price, as in the sensitivity table.
  const variantLabel = v => { const c = v.match(/^(\d{4}-\d{2}-\d{2}) \((\d+)\)$/); return c ? `${cellDate(c[1])} (${fmt(+c[2])})` : v; };
  on(() => {
    const k = state.tornado, tr = tornado(k), name = TORNADO.find(([v]) => v === k)[1];
    const rows = tr.factors.map(f => ({label: FACTORS[f.factor], lo: f.low * 100, hi: f.high * 100,
      tip: tipReport(`${FACTORS[f.factor]}: ${prob(f.low)}${RANGE}${prob(f.high)}`, f.values.map(v => ['ask', variantLabel(v.label), prob(v.value)]))})).sort((x, y) => (y.hi - y.lo) - (x.hi - x.lo));
    const detail = P.tornado[0].factors.flatMap(f => f.values.map((v, i) => ({factor: FACTORS[f.factor], variant: variantLabel(v.label),
      ...Object.fromEntries(P.tornado.map(m => [m.metric, m.factors.find(x => x.factor === f.factor).values[i].value]))})));
    document.getElementById('card-tornado').innerHTML = card({evidence: 'model', title: sided(`What Moves the Probabilities: ${name}`, 'ask'),
      sub: t(`${bench}; range across the alternatives of each source; base: training since 2023, seed ${SEED}, capture of ${shortDate(antica.date)}, main specification`, `${bench}; amplitude entre as alternativas de cada fonte; base: treino desde 2023, seed ${SEED}, captura de ${shortDate(antica.date)}, especificação principal`),
      controls: stateControl({label: 'Probability', key: 'tornado', options: TORNADO}),
      body: '<div class="chart" id="ch-tornado"></div>',
      drawer: table({columns: [{key: 'factor', label: 'Source'}, {key: 'variant', label: 'Variant'}, ...TORNADO.map(([v, text]) => (probability(v, text)))], rows: detail,
        caption: t(`Starting captures keep today's price as the threshold of "Peak" and "June < Today". Specifications: ARIMA(0,1,1) or ARIMA(2,1,0) errors, one annual harmonic instead of two, or no drift.`, `As capturas iniciais mantêm o price de hoje como threshold de "Peak" e "June < Today". Especificações: erros ARIMA(0,1,1) ou ARIMA(2,1,0), um harmônico anual em vez de dois, ou sem drift.`)})});
    chart('ch-tornado', host => rangeChart(host, {rows, domain: [0, 100], xFmt: pctScale, base: tr.base * 100, cls: 'c-ask',
      label: t('Range across alternatives', 'Amplitude entre alternativas'), baseLabel: t('Base run', 'Rodada base'),
      aria: t(`Range of the probability "${name}" across seeds, training windows, starting captures and specifications`, `Amplitude da probabilidade "${name}" entre seeds, training windows, capturas iniciais e especificações`)}));
  }, ['tornado'], ['card-tornado']);

  // 09: predecessor and server-age information. Exploratory comparisons share the report's side selection and exhibits.
  // The data call the predecessor rule 'Precursor'; the report names it after the concept it tests.
  const lifeModels = {Constant: 'Constant', Benchmark: 'Benchmark', Local: 'Local', Precursor: 'Predecessor', AgeRelative: 'Age Relative', AgeRaw: 'Age Raw'};
  const regimeLabel = x => x === 'preTransfer' ? 'Pre-transfer' : 'Pre-merger';
  const pivotLife = (rows, value) => [...new Set(rows.map(r => r.horizon))].sort((a, b) => a - b).map(h => {
    const subset = rows.filter(r => r.horizon === h), first = subset[0];
    return {horizon: h, n: first.n, target: first.target, status: first.status, crossedModels: subset.filter(r => r.crossedBook).map(r => r.model),
      ...Object.fromEntries(subset.filter(r => r.model).map(r => [r.model, r[value]]))};
  });
  const lifeTable = (rows, models, forecast = false) => table({columns: [num('horizon', 'Weeks'),
    ...(forecast ? [{key: 'target', label: 'Target', render: cellDate}] : [num('n', 'Origins')]),
    ...models.map(m => num(m, lifeModels[m], forecast ? 0 : 2, {render: (v, r) => `${fmt(v, forecast ? 0 : 2)}${forecast && r.crossedModels.includes(m) ? '*' : ''}`}))], rows: pivotLife(rows, forecast ? 'value' : 'mape'),
    empty: t('No eligible observed pairs for the backtest.', 'Sem pares observados elegíveis para o backtest.'),
    caption: forecast ? t('N/A: rule without support. * Buy ≥ Sell for the same model and horizon; the prices do not form an executable order book.', 'N/A: regra sem suporte. * Buy ≥ Sell no mesmo modelo e horizon; os prices não formam um order book executável.') : t('MAPE %, same targets per horizon; overlapping weekly origins.', 'MAPE %, mesmos alvos por horizon; origins semanais sobrepostas.')});
  const scoreDetail = rows => table({columns: [{key: 'regime', label: 'Regime', render: regimeLabel}, num('horizon', 'Weeks'), {key: 'model', label: 'Model', render: v => lifeModels[v]}, num('n', 'Origins'), percent('mape', 'MAPE', 2), num('mae', 'MAE gp', 0)], rows});
  on(() => {
    const side = state.side, terr = L.terribra, age = L.ageAnalogy;
    const tt = terr.backtest.filter(r => r.side === side), at = age.backtest.filter(r => r.side === side && r.regime === 'preTransfer');
    const precursorScores = tt.filter(r => r.model === 'Precursor');
    const activeDonors = [...new Set(terr.backtestDetail.filter(r => r.side === side && r.model === 'Precursor').flatMap(r => r.activeDonors))];
    const inactiveDonors = terr.predecessors.filter(w => !activeDonors.includes(w));
    const origins = r => t(`${r.n} ${r.n === 1 ? 'origin' : 'origins'} at ${r.horizon} weeks`, `${r.n} ${r.n === 1 ? 'origin' : 'origins'} em ${r.horizon} semanas`);
    document.getElementById('card-precursor-test').innerHTML = card({evidence: 'exploratory', title: sided(`${terr.world}: Predecessor Test`, side), controls: sideControl(), body: lifeTable(tt, ['Constant', 'Benchmark', 'Local', 'Precursor']),
      note: precursorScores.length ? t(`The comparison with Local also halves the local term, so it does not isolate the contribution of the predecessors. The predecessor input is supplied by ${list(activeDonors)}${inactiveDonors.length ? `, while ${list(inactiveDonors)} ${inactiveDonors.length > 1 ? 'do' : 'does'} not reach the minimum of eligible returns` : ''}. The test has ${list(precursorScores.map(origins))}, which limits generalisation.`,
        `A comparação com Local também reduz à metade o termo local, sem isolar a contribuição dos predecessors. A informação dos predecessors é fornecida por ${list(activeDonors)}${inactiveDonors.length ? `, enquanto ${list(inactiveDonors)} não ${inactiveDonors.length > 1 ? 'atingem' : 'atinge'} o mínimo de returns elegíveis` : ''}. O teste dispõe de ${list(precursorScores.map(origins))}, o que limita a generalização.`)
        : t('The incremental contribution of the predecessors remains unevaluated, because there are no eligible paired origins.', 'A contribuição incremental dos predecessors permanece sem avaliação, pois não há origins pareadas elegíveis.')});
    document.getElementById('card-age-test').innerHTML = card({evidence: 'exploratory', title: sided(`${age.target}: Age Analogy Test`, side), controls: sideControl(), body: lifeTable(at, ['Constant', 'Benchmark', 'AgeRaw', 'AgeRelative']), drawer: scoreDetail(age.backtest.filter(r => r.side === side))});
    const mapeOf = (rows, h, model) => rows.find(x => x.horizon === h && x.model === model)?.mape;
    const added = tt.filter(r => r.model === 'Precursor'), improved = added.filter(r => r.mape < mapeOf(tt, r.horizon, 'Local'));
    const beatsBench = added.filter(r => r.mape < mapeOf(tt, r.horizon, 'Benchmark'));
    const constantBest = added.filter(r => ['Benchmark', 'Local', 'Precursor'].every(m => mapeOf(tt, r.horizon, 'Constant') < mapeOf(tt, r.horizon, m))).map(r => r.horizon);
    const analog = at.filter(r => r.model === 'AgeRelative'), ahead = analog.filter(r => r.mape < mapeOf(at, r.horizon, 'Constant'));
    const donorCoverage = L.coverage.find(r => r.world === age.donor), targetCoverage = L.coverage.find(r => r.world === age.target);
    document.getElementById('lifecycle-findings').innerHTML = added.length ? t(
      `In ${SIDES[side]}, the Predecessor rule reduces MAPE relative to Local in ${improved.length} of ${added.length} evaluable horizons but improves on the benchmark control in ${beatsBench.length ? `${beatsBench.length} of them` : 'none'}${constantBest.length ? `, and at ${list(constantBest.map(String))} weeks the Constant model beats every rule` : ''}; the comparison changes both the weight of the local term and the predecessor input, so these errors do not establish an incremental contribution from the predecessors; the small, overlapping sample also limits generalisation. ${analog.length ? `In the server-age analogy, Age Relative beats Constant in ${ahead.length} of ${analog.length} evaluable horizons, under the same limits of pairing and overlap.` : `The server-age analogy remains unevaluated, because ${age.donor}'s offers begin at ${donorCoverage.firstAgeDays} days of age and ${age.target} had reached ${targetCoverage.lastAgeDays} days, leaving no later pairs with which to confront its forecasts.`}`,
      `Em ${SIDES[side]}, a regra Predecessor reduz o MAPE em relação à regra Local em ${improved.length} de ${added.length} horizons avaliáveis, ${beatsBench.length ? `mas supera o controle do benchmark em ${beatsBench.length} deles` : 'mas não supera o controle do benchmark em nenhum deles'}${constantBest.length ? `, e, em ${list(constantBest.map(String))} semanas, o modelo Constant supera todas as regras` : ''}; a comparação altera tanto o peso do termo local quanto a informação dos predecessors, de modo que esses erros não estabelecem uma contribuição incremental dos predecessors; a sample pequena e sobreposta também limita a generalização. ${analog.length ? `Na analogia de server age, Age Relative supera Constant em ${ahead.length} de ${analog.length} horizons avaliáveis, sob os mesmos limites de pareamento e sobreposição.` : `A analogia de server age permanece sem avaliação, pois as offers de ${age.donor} começam aos ${donorCoverage.firstAgeDays} dias de idade e ${age.target} havia chegado a ${targetCoverage.lastAgeDays} dias, sem pares posteriores com os quais confrontar seus forecasts.`}`)
      : t('The incremental contribution of the predecessors remains unevaluated, because there are no eligible paired origins.', 'A contribuição incremental dos predecessors permanece sem avaliação, pois não há origins pareadas elegíveis.');
    // An exhibit with no eligible pair would publish an empty table: the sentence above already says so.
    const ageTest = document.getElementById('card-age-test');
    if (!age.backtest.some(r => r.side === side)) ageTest.innerHTML = '';
    const ts = terr.scenarios.filter(r => r.side === side), as = age.scenarios.filter(r => r.side === side && r.regime === 'preTransfer');
    document.getElementById('card-precursor-scenario').innerHTML = card({evidence: 'exploratory', title: sided(`${terr.world}: Predecessor Forecasts`, side), controls: sideControl(), body: lifeTable(ts, ['Constant', 'Benchmark', 'Local', 'Precursor'], true),
      note: t('Each predecessor contributes only when it has at least three returns at the horizon.', 'Cada predecessor contribui apenas quando tem pelo menos três returns no horizon.'),
      drawer: table({columns: [num('horizon', 'Weeks'), num('localReturnSample', 'Local Returns'), {key: 'donorReturnSample', label: 'Donor Returns', render: v => esc(Object.entries(v || {}).map(([w, n]) => `${w}: ${n}`).join('; '))}], rows: ts.filter(r => !r.model || r.model === 'Precursor')})});
    document.getElementById('card-age-scenario').innerHTML = card({evidence: 'exploratory', title: sided(`${age.target}: Age Forecasts`, side), sub: t(`${age.donor} at the same server age, pre-transfer`, `${age.donor} na mesma server age, pre-transfer`),
      note: t(`Age Raw is an analogy ${at.some(r => r.model === 'AgeRaw') ? 'evaluated at the eligible origins of the test above' : 'not yet validated locally'}, whereas Age Relative depends on quotes paired with ${bench} on the dates of the donor's endpoints.`,
        `Age Raw é uma analogia ${at.some(r => r.model === 'AgeRaw') ? 'avaliada nas origins elegíveis do teste acima' : 'ainda sem validação local'}, enquanto Age Relative depende de quotes pareadas com ${bench} nas datas dos endpoints do donor.`),
      controls: sideControl(), body: lifeTable(as, ['Constant', 'Benchmark', 'AgeRaw', 'AgeRelative'], true), drawer: table({columns: [{key: 'regime', label: 'Regime', render: regimeLabel}, num('horizon', 'Weeks'), {key: 'target', label: 'Target', render: cellDate}, {key: 'model', label: 'Model', render: v => lifeModels[v] || 'No Support'}, num('value', 'gp/TC'), {key: 'donorStart', label: 'Donor Start', render: cellDate}, {key: 'donorEnd', label: 'Donor End', render: cellDate}], rows: age.scenarios.filter(r => r.side === side)})});
    const curves = age.curves.filter(r => r.side === side && r.preTransfer);
    document.getElementById('card-age-curve').innerHTML = card({evidence: 'exploratory', title: sided('Same-Age Quote Paths', side), sub: t(`Server age in days since launch; gp/TC; ${age.donor} pre-transfer`, `Server age em dias desde o launch; gp/TC; ${age.donor} pre-transfer`), controls: sideControl(), body: '<div class="chart" id="ch-age"></div>', drawer: table({columns: [{key: 'world', label: 'World'}, num('ageDays', 'Age Days'), {key: 'date', label: 'Observed Date', render: cellDate}, num('price', 'gp/TC'), percent('premiumPct', 'Premium', 1)], rows: curves})});
    chart('ch-age', host => lineChart(host, {numericX: true, aria: t(`${age.target} and ${age.donor}: prices in gold by server age in days`, `${age.target} e ${age.donor}: prices em gold por server age em dias`), yFmt: yLabel, tipFmt: price, series: [age.target, age.donor].map((world, i) => ({label: world, cls: i ? 'c-bid' : 'c-ask', points: curves.filter(r => r.world === world).map(r => [r.ageDays, r.price])}))}));
    // The predecessors of the merged world, charted beside the test that uses them, whatever world is selected.
    const predecessors = (predOf[terr.world] || []).slice().sort((a, b) => terr.predecessors.indexOf(a.world) - terr.predecessors.indexOf(b.world));
    const predCard = document.getElementById('card-predecessor');
    if (predCard) predCard.innerHTML = predecessors.length ? card({evidence: 'observed', title: sided(`${terr.predecessors.join(' and ')}: Pre-Merger History`, side), sub: t(`${priceUnit}. Separate series`, `${priceUnit}. Séries separadas`), controls: sideControl(), body: '<div class="chart" id="ch-obs"></div>'}) : '';
    if (predecessors.length) chart('ch-obs', host => lineChart(host, {aria: t(`${terr.world}: predecessor histories before the merger`, `${terr.world}: históricos dos predecessors antes da merger`),
      series: predecessors.map((p, i) => ({label: p.world, cls: i ? 'c-bid' : 'c-ask', points: hist(p.world).map(x => [x.date, x[side]])}))}));
  }, ['side'], ['card-precursor-test', 'card-age-test', 'lifecycle-findings', 'card-precursor-scenario', 'card-age-scenario', 'card-age-curve', 'card-predecessor']);

  // 09: world blocks. The header carries the world picker and the link to the other edition.
  document.querySelector('.site nav').innerHTML = `<a class="icon-button" href="${t('pt-br.html', './')}" hreflang="${t('pt-BR', 'en')}" lang="${t('pt-BR', 'en')}" aria-label="${t('Português', 'English')}" title="${t('Português', 'English')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8"/></svg></a>${worldControl({all: true})}`;
  on(() => {
    // Any world of the universe can be selected; one the research does not model keeps its captures and says why the rest is absent.
    const w = state.world, s = state.side, sel = W[w], u = UW[w];
    ['card-world-daily', 'selected-context'].forEach(id => { document.getElementById(id).hidden = !w; });
    ['card-world-history', 'card-world-projection', 'card-scenario-table'].forEach(id => { document.getElementById(id).hidden = !sel; });
    document.getElementById('card-world-history').parentElement.hidden = !sel;
    document.getElementById('card-scenario-table').parentElement.hidden = !w;
    if (!w) return;
    const dailyRows = u.dailyCaptures.slice().reverse().map((x, i, a) => {
      const older = a[i + 1];
      const d = readingDelta(x, older);
      return {...x, sellDelta: d.sell, buyDelta: d.buy};
    });
    document.getElementById('card-world-daily').innerHTML = card({evidence: 'observed', title: `${w}: Recent Captures`, sub: t(`${priceUnit}; Amount in TC. ${u.captureCount} Market readings`, `${priceUnit}; Amount em TC. ${u.captureCount} leituras do Market`), body: table({columns: [
      {key: 'capturedAt', label: 'Captura', render: v => `${cellDate(v)}; ${v.slice(11, 16)}`},
      num('sell', 'Sell Offers'), {key: 'sellDelta', label: 'Variação', num: true, render: change},
      num('buy', 'Buy Offers'), {key: 'buyDelta', label: 'Variação', num: true, render: change},
      num('sellTopAmount', 'Sell Offers; melhor Amount'), num('buyTopAmount', 'Buy Offers; melhor Amount'),
      num('sellVolume', 'Sell Offers; Amount total'), num('buyVolume', 'Buy Offers; Amount total')
    ], rows: dailyRows, caption: t('Dates without a stated time zone; changes between captures, not continuous daily changes.', 'Datas sem fuso horário informado; variações entre capturas, e não variações diárias contínuas.'), empty: t(`No recent capture for ${w}; latest API offer on ${cellDate(u.latest.capturedAt)}.`, `Sem captura recente de ${w}; última offer da API em ${cellDate(u.latest.capturedAt)}.`)})});
    if (!sel) { document.getElementById('selected-context').innerHTML = `<p>${outsideResearch(w)}</p>`; return; }
    const h = hist(w), wf = R.worldForecast.filter(x => x.world === w);
    document.getElementById('card-world-history').innerHTML = card({evidence: 'observed', title: `${w}: History`, sub: t(`${priceUnit}. ${fmt(sel.weeks)} weeks with offers; gaps are not interpolated`, `${priceUnit}. ${fmt(sel.weeks)} semanas com offers; lacunas não são interpoladas`), body: '<div class="chart" id="ch-wh"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, num('bid', 'Buy Offers'), num('ask', 'Sell Offers')], rows: h.filter(x => ok(x.ask))})});
    chart('ch-wh', host => lineChart(host, {aria: t(`${w}: weekly medians of ${list(Object.values(SIDES))}`, `${w}: weekly medians de ${list(Object.values(SIDES))}`),
      series: sideSeries(s => ({points: h.map(x => [x.date, x[s]])}))}));
    const wp = wf.filter(x => x.side === s);
    const statuses = [...new Set(wp.filter(x => x.status !== 'Condicional: pontas cruzadas').map(x => t(uiLabel(x.status), {'Cenário de ofertas': 'scenario de offers', 'Condicional: cotação defasada': 'condicional: quote defasada', 'Suspenso: fusão anunciada': 'suspenso: merger anunciada'}[x.status] || x.status)))].join('; ');
    document.getElementById('card-world-projection').innerHTML = card({evidence: 'model', title: sided(`${w}: Scenarios`, s), sub: t(`${priceUnit}. ${statuses}${sel.crossedWeeks ? `; crossed sides in ${sel.crossedWeeks} weeks` : ''}`, `${priceUnit}. ${statuses}${sel.crossedWeeks ? `; lados cruzados em ${sel.crossedWeeks} semanas` : ''}`), controls: sideControl(), note: mergerFor(w) ? t(`Scenario ends before the ${mergerDateLabel(mergerFor(w))} of the merger into ${mergerFor(w).successor} (${longDate(mergerFor(w).confirmedDate || mergerFor(w).notBefore)}).`, `O scenario termina antes da ${mergerDateLabel(mergerFor(w))} da merger em ${mergerFor(w).successor} (${longDate(mergerFor(w).confirmedDate || mergerFor(w).notBefore)}).`) : '', body: '<div class="chart" id="ch-wp"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: cellDate}, num('base', 'Central'), num('low', 'Baixa'), num('high', 'Alta'), {key: 'status', label: 'Condição'}], rows: wp})});
    chart('ch-wp', host => lineChart(host, {aria: t(`${w}: conditional ${SIDES[s]} scenario`, `${w}: scenario condicional de ${SIDES[s]}`),
      series: [{label: baseScenario, cls: 'c-ink', points: wp.map(x => [x.date, x.base])}], bands: [{label: stressBand, cls: `c-${s} o2`, points: wp.map(x => [x.date, x.low, x.high])}],
      vlines: sel.mergerDate ? [{x: sel.mergerDate, label: `merger: ${mergerDateLabel(mergerFor(w))}`}] : [],
      markers: [{x: sel.date, y: sel[s], label: `Anchor ${fmt(sel[s])}`, key: t(`Anchor of ${shortDate(sel.date)}`, `Anchor de ${shortDate(sel.date)}`), kind: 'capture'}]}));
    const rows = MILESTONES.map(d => { const a = wf.find(x => x.side === 'ask' && x.date === d), b = wf.find(x => x.side === 'bid' && x.date === d); return {date: d, ask: a?.base, bid: b?.base, low: a?.low, high: a?.high, status: a?.status}; });
    document.getElementById('card-scenario-table').innerHTML = card({evidence: 'model', title: `${w}: Cycle Milestones`, sub: priceUnit, body: table({columns: [{key: 'date', label: 'Marco', render: monthYearEn}, num('bid', 'Buy Offers; central'), num('ask', 'Sell Offers; central'), num('low', 'Sell Offers; baixa'), num('high', 'Sell Offers; alta'), {key: 'status', label: 'Condição'}], rows})});
    // Every special case is read from the world's own data; several can apply at once.
    const cwAsk = cwOf(w, 'ask');
    const firstNull = wf.find(x => x.base == null)?.date;
    const context = [
      sel.mergerDate ? t(`${w} is one of the worlds to be merged into ${mergerFor(w).successor}, as ${chapterRef('s05')} documents. Given the possible change of regime, the individual horizon ends before ${longDate(sel.mergerDate)}${firstNull ? `, so the week of ${longDate(firstNull)} already lies outside it` : ''}. The continuity of the relative premium after the merger is not established.${cwAsk?.breakWeek ? ` The earlier band is already wide because it incorporates the break in the local premium in ${monthYear(cwAsk.breakWeek)}.` : ''}`,
        `${w} é um dos worlds que serão reunidos em ${mergerFor(w).successor}, como a ${chapterRef('s05')} documenta. Diante da possível mudança de regime, o horizon individual termina antes de ${longDate(sel.mergerDate)}${firstNull ? `, de modo que a semana de ${longDate(firstNull)} já está fora dele` : ''}. A continuidade do relative premium após o merger não está demonstrada.${cwAsk?.breakWeek ? ` A band anterior já é ampla porque incorpora a ruptura do premium local em ${monthYear(cwAsk.breakWeek)}.` : ''}`) : '',
      sel.stale ? t(`The quote of ${longDate(sel.date)} is the latest valid one available at the cutoff of ${longDate(R.asOf)}, ${sel.ageDays} ${sel.ageDays === 1 ? 'day' : 'days'} earlier. The lag makes the scenario conditional, and its path applies the movement of ${bench} since the local reference date.`,
        `A quote de ${longDate(sel.date)} é a última válida disponível no cutoff de ${longDate(R.asOf)}, ${sel.ageDays} ${sel.ageDays === 1 ? 'dia' : 'dias'} antes. A defasagem torna o scenario condicional, e seu path aplica o movimento de ${bench} desde a data de referência local.`) : '',
      cwAsk?.breakWeek && !sel.mergerDate ? t(`The stress band incorporates the break in the premium over ${bench} in the week of ${longDate(cwAsk.breakWeek)}.`, `A stress band incorpora a ruptura do premium sobre ${bench} na semana de ${longDate(cwAsk.breakWeek)}.`) : '',
      sel.askLocalStressBasis !== '13 semanas' && w !== bench ? t(`The local stress uses ${sel.askLocalStressBasis === 'dispersão do prêmio' ? 'the dispersion of the premium' : 'a fixed value of 10%'}, because there ${sel.askLocalStressPairs === 1 ? 'is' : 'are'} ${nw(sel.askLocalStressPairs)} ${sel.askLocalStressPairs === 1 ? 'pair' : 'pairs'} of 13-week changes, below the minimum of five.`,
        `O local stress usa ${sel.askLocalStressBasis === 'dispersão do prêmio' ? 'a dispersão do premium' : 'um valor fixo de 10%'}, pois há ${nw(sel.askLocalStressPairs)} ${sel.askLocalStressPairs === 1 ? 'par' : 'pares'} de variações em 13 semanas, abaixo do mínimo de cinco.`) : '',
      !sel.testN ? t('The transfer has no backtest, because no quarterly origin has an own quote.', 'A transferência fica sem backtest, pois nenhuma origin trimestral tem quote própria.') : '',
      sel.crossedWeeks ? crossedText(sel) : '',
    ].filter(Boolean);
    const sourceName = sel.source === 'Captura' ? t('capture', 'captura') : t('API offer', 'offer da API');
    document.getElementById('selected-context').innerHTML = t(
      `<p>The reference for ${w} is the ${sourceName} of ${longDate(sel.date)}, within a history of ${fmt(sel.days)} valid ${sel.days === 1 ? 'day' : 'days'} since ${longDate(sel.first)}, whose coverage bounds the reading of the scenarios. ${w === bench ? `As the benchmark, ${bench} uses the bands of ${chapterRef('s02')}, without any local premium stress.` : context.length ? context.join(' ') : 'Although the bands incorporate the historical instability of the local premium, applying them presumes that the relationship between worlds remains sufficiently stable.'}</p>`,
      `<p>A referência de ${w} é a ${sourceName} de ${longDate(sel.date)}, em um histórico de ${fmt(sel.days)} ${sel.days === 1 ? 'dia válido' : 'dias válidos'} desde ${longDate(sel.first)}, cuja coverage delimita a leitura dos scenarios. ${w === bench ? `Por ser o benchmark, ${bench} usa as bands da ${chapterRef('s02')}, sem local stress de premium.` : context.length ? context.join(' ') : 'Embora as bands incorporem a instabilidade histórica do premium local, sua aplicação pressupõe que a relação entre worlds permaneça suficientemente estável.'}</p>`);
    document.querySelectorAll('.dossier').forEach(d => d.classList.toggle('on', d.dataset.world === w));
  }, ['side', 'world'], ['card-world-history', 'card-scenario-table', 'card-world-daily', 'selected-context', 'card-world-projection']);

  // 09: relative value
  on(() => {
    document.getElementById('relative-prose').innerHTML = t(`
      <p>The comparison across groups shows ${yA.recentMedianPct - nextGroup >= 5 ? 'a clearly higher premium in one group' : 'recent premiums close to one another'}: ${list(yA.worlds)}, ${groupWorlds(yA.worlds.length)}, recorded median premiums of ${sgn(yA.recentMedianPct)} in Sell Offers and ${sgn(yB.recentMedianPct)} in Buy Offers over the last 26 weeks, while the other groups ranged from ${sgn(Math.min(...others.map(g => g.recentMedianPct)))} to ${sgn(nextGroup)} in Sell Offers. A sample of ${nw(yA.worlds.length)} ${yA.worlds.length === 1 ? 'world' : 'worlds'} cannot isolate causes, because PvP type, BattlEye, region and age are confounded.${y24v.length && Math.max(...y24v) > yA.recentMedianPct ? ` In the quarters of 2024, the premium was higher, between ${sgn(Math.min(...y24v), 0)} and ${sgn(Math.max(...y24v), 0)} over ${bench}, when only ${list(y24m)} had history in the group` : ''}${g25.length ? `; in the second quarter of 2025, ${list(g25.map(x => x.world))}, ${g25Phrase}, stood about ${sgn(green25.medianPremiumPct, 0)} above it, against ${list(g25.map(x => sgn(x.recentPremiumPct)))} over the last 26 weeks` : ''}.</p>
      <p>The Sell Offers premium of that group has ${trend === 'down' ? 'declined' : trend === 'up' ? 'risen' : 'moved'} from ${sgn(yA.recentMedianPct)} in the 26-week median to ${sgn(yA.last8MedianPct)} in the eight weeks to ${longDate(groupLast)} and ${sgn(yA.currentMedianPct)} at the cutoff, while its Buy Offers premium moved from ${sgn(yB.recentMedianPct)} to ${sgn(yB.last8MedianPct)} and ${sgn(yB.currentMedianPct)} over the same windows.${trend === 'down' ? ` Because local prices have not followed ${bench}'s rise in proportion, a return to the historical relationship could come either from a stronger local rise or from a decline in the benchmark, although the short series identifies neither the path nor its timing.` : ''}</p>
      <p>Co-movement does not establish leadership either. The weekly correlation with ${bench} ranges from ${fmt(Math.min(...corr), 2)} to ${fmt(Math.max(...corr), 2)} across worlds without a level shift, and the aggregate of the other worlds moves with ${bench} mainly within the same week (r = ${fmt(lag0.r, 2)}), whereas other lags show correlations in both directions of up to ${fmt(offLag, 2)}, with no consistent leader.</p>`, `
      <p>A comparação entre grupos mostra ${yA.recentMedianPct - nextGroup >= 5 ? 'um premium claramente maior em um grupo' : 'premiums recentes próximos entre si'}: ${list(yA.worlds)}, ${groupWorlds(yA.worlds.length)}, registraram medians de premium de ${sgn(yA.recentMedianPct)} em Sell Offers e ${sgn(yB.recentMedianPct)} em Buy Offers nas últimas 26 semanas, enquanto os demais grupos ficaram entre ${sgn(Math.min(...others.map(g => g.recentMedianPct)))} e ${sgn(nextGroup)} em Sell Offers. Uma sample de ${nw(yA.worlds.length)} ${yA.worlds.length === 1 ? 'world' : 'worlds'} não permite isolar causas, pois tipo de PvP, BattlEye, região e idade se confundem.${y24v.length && Math.max(...y24v) > yA.recentMedianPct ? ` Nos trimestres de 2024, o premium era maior, entre ${sgn(Math.min(...y24v), 0)} e ${sgn(Math.max(...y24v), 0)} sobre ${bench}, quando apenas ${list(y24m)} ${y24m.length > 1 ? 'tinham' : 'tinha'} histórico no grupo` : ''}${g25.length ? `; no segundo trimestre de 2025, ${list(g25.map(x => x.world))}, ${g25Phrase}, ficaram cerca de ${sgn(green25.medianPremiumPct, 0)} acima, ante ${list(g25.map(x => sgn(x.recentPremiumPct)))} nas últimas 26 semanas` : ''}.</p>
      <p>O premium de Sell Offers desse grupo ${trend === 'down' ? 'recuou' : trend === 'up' ? 'subiu' : 'passou'} de ${sgn(yA.recentMedianPct)} na median de 26 semanas para ${sgn(yA.last8MedianPct)} nas oito semanas até ${longDate(groupLast)} e ${sgn(yA.currentMedianPct)} no cutoff, enquanto seu premium de Buy Offers passou de ${sgn(yB.recentMedianPct)} para ${sgn(yB.last8MedianPct)} e ${sgn(yB.currentMedianPct)} nas mesmas janelas.${trend === 'down' ? ` Como os prices locais não acompanharam proporcionalmente a alta de ${bench}, um retorno à relação histórica poderia vir tanto de uma alta local mais forte quanto de uma queda do benchmark, embora a série curta não identifique nem o path nem seu timing.` : ''}</p>
      <p>O co-movement tampouco estabelece liderança. A correlation semanal com ${bench} vai de ${fmt(Math.min(...corr), 2)} a ${fmt(Math.max(...corr), 2)} entre worlds sem level shift, e o agregado dos demais worlds acompanha ${bench} sobretudo na mesma semana (r = ${fmt(lag0.r, 2)}), enquanto outros lags mostram correlations nos dois sentidos de até ${fmt(offLag, 2)}, sem líder consistente.</p>`);
  }, [], ['relative-prose']);
  const premiumBenchmark = new Map(R.history.filter(r => r.world === bench).map(r => [r.date, r]));
  const premiumHistory = new Map(worlds.map(w => [w.world, R.history.filter(r => r.world === w.world)]));
  on(() => {
    const s = state.side, period = PREMIUM_PERIODS.find(p => p.value === state.premiumPeriod);
    const rows = cwRows(s).filter(x => !breaks.includes(x.world)).map(x => ({...x, window: premiumWindow(premiumHistory.get(x.world) || [], premiumBenchmark, s, period.weeks, R.asOf)}))
      .sort((a, b) => (b.window.premiumPct ?? -Infinity) - (a.window.premiumPct ?? -Infinity) || a.world.localeCompare(b.world));
    const periodLabel = period.weeks ? t(`Median of ${period.weeks} ${period.weeks === 1 ? 'week' : 'weeks'}`, `Median de ${period.weeks} ${period.weeks === 1 ? 'semana' : 'semanas'}`) : t('Median of the full history', 'Median do histórico completo');
    document.getElementById('card-premium-chart').innerHTML = card({evidence: 'observed', title: sided(`Premium over ${bench}`, s), sub: t(`Premium in %${breaks.length ? `; ${list(breaks)} excluded (level shift)` : ''}`, `Premium em %${breaks.length ? `; ${list(breaks)} excluídos (level shift)` : ''}`), controls: sideControl() + stateControl({label: 'Time Range', key: 'premiumPeriod', options: PREMIUM_PERIODS.map(p => [p.value, p.label]), title: 'Time Range, ending at each world’s latest paired week'}), body: '<div class="chart" id="ch-prem"></div>'});
    chart('ch-prem', host => dumbbell(host, {cls: `c-${s}`, aLabel: periodLabel, bLabel: t(`Captures of ${captureWindow}${histPremium.length ? ' or last history' : ''}`, `Capturas de ${captureWindow}${histPremium.length ? ' ou último histórico' : ''}`), aria: t(`Premium of each world over ${bench} in ${SIDES[s]}; ${periodLabel}; window ending at each world's latest paired week`, `Premium de cada world sobre ${bench} em ${SIDES[s]}; ${periodLabel}; janela encerrada na última semana pareada de cada world`),
      rows: rows.map(x => ({label: x.world, a: x.window.premiumPct, b: x.currentPremiumPct, details: [['', 'Paired Weeks', fmt(x.window.weeks)], ['', 'Observed Window', `${cellDate(x.window.first)}${RANGE}${cellDate(x.window.last)}`]]}))}));
  }, ['side', 'premiumPeriod'], ['card-premium-chart']);
  on(() => {
    const s = state.side;
    document.getElementById('card-groups').innerHTML = card({evidence: 'observed', title: sided('Premium by Group', s), sub: t(`Medians across worlds, %${[...breaks, ...ungrouped.map(x => x.world)].length ? `; excluded: ${list([...breaks.map(w => `${w} (level shift)`), ...ungrouped.map(x => `${x.world} (${x.type}, no group)`)])}` : ''}`, `Medians entre worlds, %${[...breaks, ...ungrouped.map(x => x.world)].length ? `; excluídos: ${list([...breaks.map(w => `${w} (level shift)`), ...ungrouped.map(x => `${x.world} (${x.type}, sem grupo)`)])}` : ''}`), body: table({columns: [{key: 'group', label: 'Grupo', wrap: true, render: marketGroup}, {key: 'worlds', label: 'Mundos', wrap: true, render: v => v.join(', ')}, signed('recentMedianPct', '26 semanas'), signed('last8MedianPct', '8 semanas'), signed('currentMedianPct', `At Cutoff (${shortDate(R.asOf)})`)], rows: C.crossWorld.groups.filter(g => g.side === s)})});
    document.getElementById('card-premium-table').innerHTML = card({evidence: 'observed', title: sided('Relative Value by World', s), sub: t('Premium in %, same side and week', 'Premium em %, mesmo lado e semana'), body: table({columns: [
      {key: 'world', label: 'Mundo'}, {key: 'type', label: 'Tipo', sortValue: r => worldKind(r.world), render: (v, r) => abbreviateBattlEye(worldKind(r.world)) || MISSING}, num('weeks', 'Semanas'), signed('medianPremiumPct', 'Histórico'), signed('recentPremiumPct', '26 semanas'), signed('last8PremiumPct', '8 semanas'), signed('currentPremiumPct', `At Cutoff (${shortDate(R.asOf)})`),
      {key: 'currentPairs', label: 'Pares', num: true, render: v => v?.length ? String(v.length) : MISSING}, num('corrWeekly', 'Correlação semanal', 2),
      {key: 'largestShiftPct', label: 'Maior mudança de patamar', num: true, render: (v, r) => ok(v) ? `${sgn(v)} (${yy(r.largestShiftWeek)})` : MISSING}],
      rows: cwRows(s), caption: t(`History, 26 and 8 weeks: weekly medians where both worlds have a quote${breaks.length ? ` (${list(breaks)}: after the level shift)` : ''}. At cutoff: median of same-day capture pairs (Pairs)${histPremium.length ? '; without a capture, the last historical pair on the same date; N/A where no pair exists' : ''}. Largest Level Δ: difference between the medians of the 8 weeks before and the 8 weeks from the week shown.`,
        `Histórico, 26 e 8 semanas: weekly medians quando os dois worlds têm quote${breaks.length ? ` (${list(breaks)}: após o level shift)` : ''}. At cutoff: median dos pares de capturas do mesmo dia (Pairs)${histPremium.length ? '; sem captura, o último par histórico da mesma data; N/A quando não há par' : ''}. Largest Level Δ: diferença entre as medians das 8 semanas anteriores e das 8 semanas a partir da semana indicada.`)})});
    const quarters = [...new Set(C.crossWorld.groupsByQuarter.filter(x => x.side === s).map(x => x.quarter))].sort();
    // Every group in the data, the leading one first.
    const G = [Y, ...[...new Set(C.crossWorld.groups.map(g => g.group))].filter(g => g !== Y).sort((a, b) => (b.startsWith('Optional') - a.startsWith('Optional')) || a.localeCompare(b))];
    document.getElementById('card-groups-quarter').innerHTML = card({evidence: 'observed', title: sided('Premium by Group and Quarter', s), sub: t('Median across the worlds of each group, % (number of worlds); fixed composition per group', 'Median entre os worlds de cada grupo, % (número de worlds); composição fixa por grupo'), body: table({columns: [{key: 'q', label: 'Trimestre'}, ...G.map((g, i) => ({key: 'g' + i, label: marketGroup(g), num: true, sortValue: r => r['g' + i]?.medianPremiumPct, render: x => x ? `${sgn(x.medianPremiumPct)} <span class="dim">(${x.worlds})</span>` : MISSING}))],
      rows: quarters.map(q => ({q: q.replace(/^(\d{4})-T(\d)$/, 'Q$2 $1'), ...Object.fromEntries(G.map((g, i) => ['g' + i, C.crossWorld.groupsByQuarter.find(r => r.side === s && r.group === g && r.quarter === q)]))}))})});
  }, ['side'], ['card-groups', 'card-premium-table', 'card-groups-quarter']);

  // 09: dossiers
  const NOTES = {
    [bench]: t(`The length of the series allows temporal models to be compared, although ${bench} serves as the benchmark and is not an index of the whole Market.`, `A extensão da série permite comparar modelos temporais, embora ${bench} funcione como benchmark e não seja um índice de todo o Market.`),
    [target]: t(`Because the short history and the shifts in relative premium limit the transfer from ${bench}, the comparison with ${donor} by server age explores an alternative without identifying a causal effect of maturation.`, `Como o histórico curto e as mudanças de relative premium limitam a transferência de ${bench}, a comparação com ${donor} por server age explora uma alternativa sem identificar um efeito causal de maturação.`),
    [L.terribra.world]: t(`Although ${list(L.terribra.predecessors)} formed ${L.terribra.world}, their prices and dates remain in separate series, from which the predecessor test uses only relative returns as additional information.`, `Embora ${list(L.terribra.predecessors)} tenham formado ${L.terribra.world}, seus prices e datas permanecem em séries separadas, das quais o teste de predecessors usa apenas returns relativos como informação adicional.`),
    [donor]: t(`Because the transfer opening and the announced merger delimit different regimes, the analogy with ${target} uses only observations before the merger and separates the period before transfers.`, `Como a abertura de transfers e a merger anunciada delimitam regimes diferentes, a analogia com ${target} usa apenas observações anteriores à merger e separa o período anterior aos transfers.`),
  };
  // Both sides against their 90-day medians: one direction word when they agree ("9.3% and 8.1% above").
  const vs90 = (w, up, down, and) => { const dir = v => v >= 0 ? up : down; return dir(w.askVs90) === dir(w.bidVs90) ? `${pctU(Math.abs(w.askVs90))} ${and} ${pctU(Math.abs(w.bidVs90))} ${dir(w.askVs90)}` : `${pctU(Math.abs(w.askVs90))} ${dir(w.askVs90)} ${and} ${pctU(Math.abs(w.bidVs90))} ${dir(w.bidVs90)}`; };
  const CONFIDENCE = {Moderada: t('moderate', 'moderada'), Limitada: t('limited', 'limitada')};
  on(() => {
    document.getElementById('dossiers').innerHTML = worlds.map(w => {
      const u = UW[w.world], q = u.latest, d = u.deltaPct;
      const local = R.worldForecast.filter(x => x.world === w.world);
      const scenarioAt = date => ({sell: local.find(x => x.side === 'ask' && x.date === date), buy: local.find(x => x.side === 'bid' && x.date === date)});
      const november = scenarioAt(MILESTONES[0]), juneLocal = scenarioAt(MILESTONES[2]);
      const pa = C.crossWorld.worlds.find(x => x.world === w.world && x.side === 'ask');
      const band = outsideBand.find(x => x.world === w.world), event = mergerFor(w.world);
      const sameDay = q.capturedAt.slice(0, 10) === w.date, time = q.capturedAt.length > 10 ? q.capturedAt.slice(11, 16) : '';
      const captures = w.captureCount === 0 ? t('no capture', 'nenhuma captura') : w.captureCount === 1 ? t('one capture', 'uma captura') : t(`${nw(w.captureCount)} captures`, `${nw(w.captureCount, true)} capturas`);
      const source = w.source === 'Captura' ? t('capture', 'captura') : t('API offer', 'offer da API');
      const opening = t(
        `The scenario is anchored on the ${source} of ${longDate(w.date)}${w.stale ? `, ${w.ageDays} ${w.ageDays === 1 ? 'day' : 'days'} before the research cutoff` : ', the research cutoff'}, and rests on ${fmt(w.weeks)} quoted ${w.weeks === 1 ? 'week' : 'weeks'} (${fmt(w.days)} valid ${w.days === 1 ? 'day' : 'days'}) since ${longDate(w.first)}, with ${captures} between ${captureBetween}; its confidence is ${CONFIDENCE[w.confidence] || uiLabel(w.confidence).toLowerCase()}.`,
        `O scenario tem anchor na ${source} de ${longDate(w.date)}${w.stale ? `, ${w.ageDays} ${w.ageDays === 1 ? 'dia' : 'dias'} antes do cutoff da pesquisa` : ', o cutoff da pesquisa'}, e se apoia em ${fmt(w.weeks)} ${w.weeks === 1 ? 'semana cotada' : 'semanas cotadas'} (${fmt(w.days)} ${w.days === 1 ? 'dia válido' : 'dias válidos'}) desde ${longDate(w.first)}, com ${captures} entre ${captureBetween}; sua confiança é ${CONFIDENCE[w.confidence] || w.confidence.toLowerCase()}.`);
      const reading = t(
        `${sameDay ? `In the reference capture${time ? `, taken at ${time}` : ''}` : `In the latest reading, of ${longDate(q.capturedAt)}${time ? ` at ${time}` : ''}`}, Sell Offers stood at ${fmt(q.sell)} and Buy Offers at ${fmt(q.buy)}${u.prior ? `, changes of ${sgn(d.sell, 2)} and ${sgn(d.buy, 2)} respectively from the capture of ${dayMonth(u.prior.capturedAt)}` : ''}. ${sameDay ? 'The' : `At the reference of ${longDate(w.date)}, when Sell Offers stood at ${fmt(w.ask)} and Buy Offers at ${fmt(w.bid)}, the`} quoted spread was ${fmt(w.spreadPct, 2)}%${ok(w.askVs90) && ok(w.bidVs90) ? `, and the two sides stood ${vs90(w, 'above', 'below', 'and')} the medians of the preceding 90 days` : ''}; ${w.buyVolume == null ? 'market depth is unavailable because no recent capture existed' : w.sellTopAmount === w.buyTopAmount ? `although market depth totalled ${price(w.sellVolume)} TC in Sell Offers and ${price(w.buyVolume)} TC in Buy Offers, only ${fmt(w.sellTopAmount)} TC stood at the best price on each side` : `although market depth totalled ${price(w.sellVolume)} TC in Sell Offers and ${price(w.buyVolume)} TC in Buy Offers, only ${fmt(w.sellTopAmount)} and ${fmt(w.buyTopAmount)} TC respectively stood at the best prices`}.`,
        `${sameDay ? `Na captura de referência${time ? `, feita às ${time}` : ''}` : `Na leitura mais recente, de ${longDate(q.capturedAt)}${time ? `, às ${time}` : ''}`}, as Sell Offers estavam em ${fmt(q.sell)} e as Buy Offers em ${fmt(q.buy)}${u.prior ? `, variações de ${sgn(d.sell, 2)} e ${sgn(d.buy, 2)}, respectivamente, em relação à captura de ${dayMonth(u.prior.capturedAt)}` : ''}. ${sameDay ? 'O' : `Na referência de ${longDate(w.date)}, com Sell Offers a ${fmt(w.ask)} e Buy Offers a ${fmt(w.bid)}, o`} quoted spread era ${fmt(w.spreadPct, 2)}%${ok(w.askVs90) && ok(w.bidVs90) ? `, e os dois lados estavam ${vs90(w, 'acima', 'abaixo', 'e')} das medians dos 90 dias anteriores` : ''}; ${w.buyVolume == null ? 'a market depth não está disponível, pois faltava captura recente' : w.sellTopAmount === w.buyTopAmount ? `embora a market depth somasse ${price(w.sellVolume)} TC em Sell Offers e ${price(w.buyVolume)} TC em Buy Offers, apenas ${fmt(w.sellTopAmount)} TC estavam no best price de cada lado` : `embora a market depth somasse ${price(w.sellVolume)} TC em Sell Offers e ${price(w.buyVolume)} TC em Buy Offers, apenas ${fmt(w.sellTopAmount)} e ${fmt(w.buyTopAmount)} TC, respectivamente, estavam nos best prices`}.`);
      const outlook = event ? t(`${w.world} is one of the worlds to be merged into ${event.successor}, as ${chapterRef('s05')} documents, so its scenario ends before ${longDate(event.confirmedDate || event.notBefore)}, and the successor's prices and probabilities will depend on Market conditions after the merger.`,
          `${w.world} é um dos worlds que serão reunidos em ${event.successor}, como a ${chapterRef('s05')} documenta, de modo que seu scenario termina antes de ${longDate(event.confirmedDate || event.notBefore)}, e os prices e probabilities do successor dependerão das condições de Market após o merger.`)
        : t(`Under the assumptions of the model, the base scenario reaches ${price(november.sell?.base)} gp/TC in Sell Offers and ${price(november.buy?.base)} in Buy Offers in ${monthYear(MILESTONES[0])}, and ${price(juneLocal.sell?.base)} and ${price(juneLocal.buy?.base)} respectively in ${monthYear(MILESTONES[2])}.`,
          `Sob as hipóteses do modelo, o base scenario chega a ${price(november.sell?.base)} gp/TC em Sell Offers e ${price(november.buy?.base)} em Buy Offers em ${monthYear(MILESTONES[0])}, e a ${price(juneLocal.sell?.base)} e ${price(juneLocal.buy?.base)}, respectivamente, em ${monthYear(MILESTONES[2])}.`);
      const test = w.testN ? t(`${w.world === bench ? 'In the ensemble backtest, which covers both sides and horizons of 4 to 52 weeks, the mean error was' : 'When the transfer was tested, its mean error was'} ${fmt(w.testMape, 1)}%, against ${fmt(w.testNaive, 1)}% for the Constant model, in ${w.testN} overlapping comparisons of side and horizon${w.testMape > w.testNaive ? `; because ${w.world === bench ? 'the ensemble' : 'the transfer'} was less accurate than the Constant model, its path serves only as a sensitivity case` : ''}.`,
          `${w.world === bench ? 'No backtest do ensemble, que cobre os dois lados e horizons de 4 a 52 semanas, o MAPE foi' : 'No teste da transferência, o MAPE foi'} ${fmt(w.testMape, 1)}%, ante ${fmt(w.testNaive, 1)}% do modelo Constant, em ${w.testN} comparações sobrepostas de lado e horizon${w.testMape > w.testNaive ? `; como ${w.world === bench ? 'o ensemble' : 'a transferência'} foi menos precisa do que o modelo Constant, seu path serve apenas como caso de sensibilidade` : ''}.`)
        : t('Out-of-sample performance is unknown, because there are not enough observations to test the transfer.', 'O desempenho out of sample é desconhecido, pois faltam observações para testar a transferência.');
      const premium = pa && ok(pa.last8PremiumPct) ? t(`The Sell Offers premium over ${bench} was ${sgn(pa.recentPremiumPct)} across the observations available in the 26-week window and ${sgn(pa.last8PremiumPct)} in the median of the 8-week window; ${pa.currentBasis === 'capturas no mesmo dia' ? `at the cutoff, the capture pairs indicated ${sgn(pa.currentPremiumPct)}` : ok(pa.currentPremiumPct) ? `the last historical offer indicated ${sgn(pa.currentPremiumPct)} against ${bench} on the same date` : `the last historical offer has no comparison because ${bench} has no quote on the same date`}.${pa.breakWeek ? ` The recent calculation is confined to the period after the level shift of ${dayMonth(pa.breakWeek)}; before it, the median ${pa.preBreakMedianPct < 0 ? 'discount' : 'premium'} was ${fmt(Math.abs(pa.preBreakMedianPct))}%${round(pa.preBreakMedianPct, 0) !== round(pa.preBreak8Pct, 0) ? `, or ${fmt(Math.abs(pa.preBreak8Pct))}% in the preceding eight weeks` : ''}.` : ''}`,
          `O premium de Sell Offers sobre ${bench} foi ${sgn(pa.recentPremiumPct)} nas observações disponíveis da janela de 26 semanas e ${sgn(pa.last8PremiumPct)} na median da janela de 8 semanas; ${pa.currentBasis === 'capturas no mesmo dia' ? `no cutoff, os pares de capturas indicaram ${sgn(pa.currentPremiumPct)}` : ok(pa.currentPremiumPct) ? `a última offer histórica indicou ${sgn(pa.currentPremiumPct)} em relação a ${bench} na mesma data` : `a última offer histórica fica sem comparação porque ${bench} não tem quote na mesma data`}.${pa.breakWeek ? ` O cálculo recente se restringe ao período após o level shift de ${dayMonth(pa.breakWeek)}; antes dele, a median do ${pa.preBreakMedianPct < 0 ? 'discount' : 'premium'} era ${fmt(Math.abs(pa.preBreakMedianPct))}%${round(pa.preBreakMedianPct, 0) !== round(pa.preBreak8Pct, 0) ? `, ou ${fmt(Math.abs(pa.preBreak8Pct))}% nas oito semanas anteriores` : ''}.` : ''}`) : '';
      return `<article class="dossier" data-world="${w.world}" id="dossier-${w.world.toLowerCase()}">
        <header class="dossier-head"><h3>${predOf[w.world] ? `${w.world} / ${list(L.terribra.world === w.world ? L.terribra.predecessors : predOf[w.world].map(p => p.world))}` : w.world}</h3>${worldKind(w.world) ? `<p class="dossier-kind">${worldKind(w.world)}</p>` : ''}</header>
        <p>${opening}${NOTES[w.world] ? ` ${NOTES[w.world]}` : ''} ${reading}</p>
        <p>${outlook}${band ? t(` Because the reading of ${dayMonth(band.q.capturedAt)} reached ${fmt(band.q.sell)} in Sell Offers, outside the first week's band of ${fmt(band.f.low)} to ${fmt(band.f.high)}, the scenario no longer describes the world.`, ` Como a leitura de ${dayMonth(band.q.capturedAt)} chegou a ${fmt(band.q.sell)} em Sell Offers, fora da band da primeira semana, de ${fmt(band.f.low)} a ${fmt(band.f.high)}, o scenario já não descreve o world.`) : ''}${w.crossedWeeks ? ` ${crossedText(w)}` : ''} ${test}</p>
        ${premium ? `<p>${premium}</p>` : ''}
      </article>`;
    }).join('');
  }, [], ['dossiers']);
  on(() => {
    document.getElementById('individual-title').hidden = !W[state.world];
    document.getElementById('dossiers').hidden = !W[state.world];
    document.querySelectorAll('.dossier').forEach(d => { d.hidden = d.dataset.world !== state.world; });
  }, ['world'], ['individual-title', 'dossiers']);

  // 03: seasonality
  on(() => {
    chart('card-season', host => {
      host.innerHTML = card({evidence: 'observed', title: `${bench}: Median Monthly Δ`, sub: t(`First to last daily offer of the month, %; at least 10 days; ${monthYear(R.asOf)} still partial`, `Da primeira à última offer diária do mês, %; mínimo de 10 dias; ${monthYear(R.asOf)} ainda parcial`), body: '<div class="chart" id="ch-season"></div>',
        drawer: table({columns: [{key: 'month', label: 'Mês', render: v => MONTHS_EN[v - 1]}, {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, percent('medianPct', 'Variação mediana', 1), num('n', 'Anos')], rows: R.seasonality})});
      const g = (s, mth) => R.seasonality.find(x => x.side === s && x.month === mth)?.medianPct;
      barChart(host.querySelector('#ch-season'), {categories: MONTHS_AXIS.map(m => m.replace('.', '')), aria: t(`Median change by month in ${bench}`, `Variação median por mês em ${bench}`), yFmt: v => pctU(v, 1),
        series: sideSeries(s => ({values: MONTHS_AXIS.map((_, i) => g(s, i + 1))}))});
    });
  }, [], ['card-season']);

  // 08: round trips, maker, spreads; 10: weekday. The round-trip cards show the benchmark until a world is selected.
  on(() => {
    const w = W[state.world] ? state.world : bench, rows = R.roundtrips.filter(x => x.world === w && [9, 11].includes(x.sellMonth));
    document.getElementById('card-roundtrip').innerHTML = card({evidence: 'observed', title: `${w}: Sell in September/November, Repurchase in May to July`, sub: t('Historical round trips when taking existing offers', 'Round trips históricos como taker, aceitando offers existentes'), controls: worldControl({value: w}), body: table({columns: [{key: 'cycle', label: 'Ciclo'}, num('sellMonth', 'Mês de venda'), num('bidMedian', 'Buy Offers; venda'), num('askRebuyMedian', 'Sell Offers; recompra'), signed('tcGainPct', 'Variação TC'), num('sellN', 'Dias venda'), num('buyN', 'Dias recompra')], rows, empty: t(`No cycle of ${w} meets the minimum of three days with offers in each window.`, `Nenhum cycle de ${w} atinge o mínimo de três dias com offers em cada janela.`)})});
    const mk = C.roundtripMaker.filter(x => x.world === w);
    document.getElementById('card-maker').innerHTML = card({evidence: 'observed', title: `${w}: Taking and Making Offers`, sub: t('Hypothetical gain in TC; Create Offer pays 2% on each placement', 'Gain hipotético em TC; Create Offer paga 2% em cada publicação'), controls: worldControl({value: w}), body: table({columns: [{key: 'cycle', label: 'Ciclo'}, num('sellMonth', 'Mês de venda'), signed('acceptPct', 'Aceitando'), signed('makerGrossPct', 'Criando, bruto'), signed('makerNetPct', 'Criando, após taxas')], rows: mk, empty: t(`No cycle of ${w} meets the minimum of three days with offers in each window.`, `Nenhum cycle de ${w} atinge o mínimo de três dias com offers em cada janela.`)})});
  }, ['world'], ['card-roundtrip', 'card-maker']);
  on(() => {
    document.getElementById('card-maker-all').innerHTML = card({evidence: 'observed', title: 'Other Worlds: Median by Cycle', sub: t(`Sale months from September to December; ${bench} excluded`, `Meses de venda de setembro a dezembro; ${bench} excluído`), body: table({columns: [{key: 'cycle', label: 'Ciclo'}, num('worlds', 'Mundos'), num('n', 'Combinações'), signed('accept', 'Aceitando'), signed('gross', 'Criando, bruto'), signed('net', 'Criando, após taxas'), {key: 'diff', label: 'Maker Minus Taker', num: true, render: v => pp(v)}], rows: makerByCycle})});
  }, [], ['card-maker-all']);
  on(() => {
    document.getElementById('card-spread').innerHTML = card({evidence: 'observed', title: 'Round-Trip Execution Cost', sub: t(`${tex(String.raw`1 - P^{B}/P^{S}`)}, %; research anchor and daily offers in the 180 days before ${cutoffDay}`, `${tex(String.raw`1 - P^{B}/P^{S}`)}, %; anchor da pesquisa e offers diárias nos 180 dias anteriores a ${cutoffDay}`), body: table({columns: [{key: 'world', label: 'Mundo'}, {key: 'nowPct', label: `At Cutoff (${shortDate(R.asOf)})`, num: true, render: v => fmt(v, 2), cls: (v, r) => ok(r.recentMedianPct) && v > 1.5 * r.recentMedianPct ? 'flag neg' : ''}, {key: 'nowDate', label: 'Data', render: cellDate}, num('recentMedianPct', 'Mediana 180 dias', 2), probability('shareRecentAtLeastNow', 'Leituras ≥ captura'), num('recentN', 'Leituras'), num('historyMedianPct', 'Mediana histórica', 2)], rows: C.spread.worlds,
      caption: t(`Anchors above 1.5 times the 180-day median are marked.${noCapture.length ? ` Without a capture, the last history is used: ${anchorList(noCapture)}.` : ''}`, `Anchors acima de 1,5 vez a median de 180 dias estão marcadas.${noCapture.length ? ` Sem captura, usa-se o último histórico: ${anchorList(noCapture)}.` : ''}`)})});
  }, [], ['card-spread']);
  on(() => {
    const s = state.side, days = [...new Map(C.weekday.rows.map(r => [r.order, r.weekday]))].sort((a, b) => a[0] - b[0]);
    const get = scope => days.map(([order]) => C.weekday.rows.find(r => r.scope === scope && r.side === s && r.order === order));
    document.getElementById('card-weekday').innerHTML = card({evidence: 'observed', title: sided('Deviation by Server Day', s), sub: t('Deviation from the median of the surrounding 7 days, %', 'Desvio em relação à median dos 7 dias ao redor, %'), controls: sideControl(), body: '<div class="chart" id="ch-wd"></div>', note: t('Other worlds with a window of 3 of 7 days.', 'Demais worlds com janela de 3 de 7 dias.'),
      drawer: table({columns: [{key: 'scope', label: 'Recorte'}, {key: 'weekday', label: 'Dia', sortValue: r => r.order}, num('n', 'Dias'), percent('devPct', 'Desvio', 3), num('ciLowPct', 'IC inferior', 3), num('ciHighPct', 'IC superior', 3)], rows: C.weekday.rows.filter(r => r.side === s)})
        + table({columns: [{key: 'scope', label: 'Teste'}, {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, num('n', 'Dias'), {key: 'window', label: 'Janela'}, percent('rangePct', 'Amplitude', 3), num('pIid', 'p (livre)', 3), num('pBlock', 'p (dentro da semana)', 3), num('pHolm', 'p (Holm)', 3), {key: 'contributors', label: 'Mundos (dias)', wrap: true, render: v => Object.entries(v).map(([k, n]) => `${k} ${n}`).join(', ')}], rows: C.weekday.tests})});
    chart('ch-wd', host => barChart(host, {categories: days.map(([, name]) => t(uiLabel(name), name)), aria: t(`Deviation by weekday in ${SIDES[s]}`, `Desvio por dia da semana em ${SIDES[s]}`), yFmt: v => pctU(v, 2), tipFmt: v => pctU(v, 3), ciLabel: t('95% interval (bootstrap)', 'Intervalo de 95% (bootstrap)'),
      series: [[bench, bench, 'c-ink'], [OTHERS, t('Other worlds', 'Demais worlds'), 'c-muted']].map(([scope, name, c]) => { const r = get(scope); return {label: t(`${name}, mean`, `${name}, mean`), cls: c, values: r.map(x => x?.devPct), lo: r.map(x => x?.ciLowPct), hi: r.map(x => x?.ciHighPct)}; })}));
  }, ['side'], ['card-weekday']);

  // 04: volatility and persistence; 09: relative volatility
  on(() => {
    document.getElementById('card-vol-year').innerHTML = card({evidence: 'observed', title: `${bench}: Annual Volatility`, sub: t('One point per week; consecutive days for the daily change; %', 'Um ponto por semana; dias consecutivos para a variação diária; %'), body: table({columns: [{key: 'year', label: 'Ano', render: v => String(v)}, {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, num('weeklyStdPct', 'Desvio-padrão semanal', 2), num('weeklyN', 'Semanas'), num('dailyMedianAbsPct', 'Variação diária mediana', 2), num('dailyN', 'Dias')], rows: C.volatility.byYear, caption: t(`${R.asOf.slice(0, 4)} covers January to ${MONTHS_LONG[isoMonth(R.asOf)]}.`, `${R.asOf.slice(0, 4)} até ${MONTHS_LONG[isoMonth(R.asOf)]}.`)})});
  }, [], ['card-vol-year']);
  on(() => {
    document.getElementById('card-acf').innerHTML = card({evidence: 'observed', title: sided(`${bench}: Weekly Autocorrelation`, 'ask'), sub: t(`Weekly changes; noise band ±${fmt(mo.band, 2)}`, `Variações semanais; noise band ±${fmt(mo.band, 2)}`), body: table({columns: [num('lag', 'Defasagem (semanas)'), num('rWeeklyMedian', 'Mediana semanal', 2), num('r', 'Um ponto por semana', 2), num('rDeseasonalised', 'Sem ciclo anual', 2), {key: 'null', label: 'Noise Only (5 to 95%)', num: true, sortValue: r => r.null.p05, render: v => `${fmt(v.p05, 2)}${RANGE}${fmt(v.p95, 2)}`}],
      rows: acf.map((a, i) => ({...a, null: mo.null.point[i]})), caption: t(`"Noise only" uses a random walk with noise calibrated to the 1-day and 7-day changes of ${bench}: ${fmt(1000)} simulations, one point per week. Without the annual cycle, the Buy Offers autocorrelations are ${list(mob.acf.map(a => fmt(a.rDeseasonalised, 2)))}.`, `"Noise only" usa um random walk com ruído calibrado às variações de 1 e 7 dias de ${bench}: ${fmt(1000)} simulations, com um ponto por semana. Sem o cycle anual, as autocorrelations de Buy Offers são ${list(mob.acf.map(a => fmt(a.rDeseasonalised, 2)))}.`)})});
  }, [], ['card-acf']);
  on(() => {
    document.getElementById('card-vol-world').innerHTML = card({evidence: 'observed', title: sided('Weekly Volatility by World', 'ask'), sub: t(`Weekly standard deviation, %; one point per week; ${bench} measured over the same weeks; at least 10 pairs`, `Weekly standard deviation, %; um ponto por semana; ${bench} medido nas mesmas semanas; mínimo de 10 pares`), body: table({columns: [{key: 'world', label: 'Mundo'}, num('weeklyStdPct', 'Desvio do mundo', 2), num('anticaSameWeeksStdPct', `${bench}, Same Weeks`, 2, {short: `${bench} SD`}), {key: 'ratio', label: 'Razão', num: true, render: v => ok(v) ? `${fmt(v, 2)}×` : MISSING}, num('n', 'Pares'), num('medianDaysPerWeek', 'Dias com cotação por semana', 0)],
      rows: C.volatility.worlds.filter(x => x.side === 'ask')})});
  }, [], ['card-vol-world']);
  on(() => {
    document.getElementById('card-cond').innerHTML = card({evidence: 'observed', title: `${bench}: Four Weeks Later`, sub: t('Change over the next 4 weeks, by the previous 4; one point per week', 'Variação nas 4 semanas seguintes, conforme as 4 anteriores; um ponto por semana'), body: table({columns: [{key: 'condition', label: 'Condição', wrap: true}, {key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, num('n', 'Semanas'), {key: 'episodes', label: 'Episódios', num: true, render: (v, r) => r.condition === 'todas as semanas' ? MISSING : fmt(v)}, signed('medianFwdPct', 'Mediana seguinte'), probability('shareUp', 'Alta em'),
      probability('monthMatchedShareUp', 'Mesmos meses, outros anos'), signed('seasonAdjMedianFwdPct', 'Sem sazonalidade'), num('declusteredP', 'p (episódios espaçados)', 2)],
      rows: SIDE_KEYS.flatMap(s => C.momentum[s].conditional.map(c => ({...c, side: s}))), caption: t('Windows overlap; p uses a Mann-Whitney test on seasonally adjusted changes, comparing episodes at least 21 days apart with all other weeks. "Seasonally adjusted" subtracts the change expected from the fitted annual cycle.', 'As janelas se sobrepõem; p usa um teste de Mann-Whitney sobre variações sem seasonality, comparando episódios separados por pelo menos 21 dias às demais semanas. "Seasonally adjusted" subtrai a variação esperada pelo cycle anual ajustado.')})});
  }, [], ['card-cond']);

  // 10: offers and daily averages for the selected world
  on(() => {
    document.getElementById('card-trade').hidden = !W[state.world];
    if (!W[state.world]) return;
    const w = state.world;
    document.getElementById('card-trade').innerHTML = card({evidence: 'observed', title: `${w}: Daily Average vs Offer Gap`, controls: worldControl(), body: table({columns: [{key: 'side', label: 'Lado do Market', render: v => SIDES[v]}, num('n', 'Dias pareados'), percent('medianGapPct', 'Mediana', 2), percent('p10', 'P10', 2), percent('p90', 'P90', 2), num('within2Pct', 'Dias dentro de ±2%', 1), percent('sameDayMedianGapPct', 'Mediana sem deslocar dia', 2), {key: 'last', label: 'Último dia', render: cellDate}], rows: R.tradeComparison.filter(x => x.world === w)})});
  }, ['world'], ['card-trade']);

  // 10: events by side
  on(() => {
    const s = state.side;
    document.getElementById('card-events').innerHTML = card({evidence: 'observed', title: sided(`${bench}: Selected Events`, s), controls: sideControl(), body: table({columns: [{key: 'event', label: 'Evento'}, num('n', 'Ocorrências'), signed('returnPct', 'Variação', 2), signed('abnormalPct', 'Excesso vs placebo', 2), num('q', 'q ajustado', 3)],
      rows: R.eventStudy.filter(x => x.side === s && ['XP/Skill Event', 'Rapid Respawn', 'Loot Event', 'Halloween Event', 'Lightbearer', 'Orcsoberfest', 'Colours of Magic', 'Annual Autumn Vintage', 'Winterlight Solstice'].includes(x.event))})});
  }, ['side'], ['card-events']);

  // 03: offer inflation. Its world cards follow the shared selection over the whole universe, worlds
  // without frozen history included; with none selected they show the benchmark the section is anchored on.
  state.inflationMonth = I.comparisonMonth;
  const inflationMonths = [...new Set(I.monthly.map(r => r.date))].sort().reverse();
  const renderInflationWorlds = () => {
    const side = state.side;
    const reference = I.monthly.filter(r => r.world === bench && r.side === side && r.date === state.inflationMonth).map(inflationObserved)[0];
    const comparison = I.monthly.filter(r => r.side === side && r.date === state.inflationMonth).map(inflationObserved).map(r => ({
      ...r, limited: [...r.limited, ...(r.limited.includes('yoyPct') ? ['differenceVsAnticaPp'] : [])], differenceVsAnticaPp: ok(r.yoyPct) && ok(reference?.yoyPct) ? r.yoyPct - reference.yoyPct : null,
    }));
    const monthPicker = pickerControl({label: 'World Inflation Month', key: 'inflationMonth',
      options: inflationMonths.map(date => ({value: date, label: `${monthYearEn(date)}${I.monthly.some(r => r.date === date && r.status === 'Partial month') ? ' (partial)' : ''}`}))});
    const comparable = comparison.filter(r => ok(r.yoyPct)).length;
    document.getElementById('card-inflation-worlds').innerHTML = card({evidence: 'observed', title: sided(`World Inflation: ${monthYearEn(state.inflationMonth)}`, side), sub: t('The same reference month for every world, never replaced by each world\'s latest month', 'O mesmo mês de referência para todos os worlds, nunca substituído pelo último mês de cada um'), controls: sideControl() + monthPicker, body: table({columns: [
      {key: 'world', label: 'World'}, num('price', 'gp/TC', 0), signed('momPct', 'Monthly'), signed('yoyPct', '12 Months'), {key: 'differenceVsAnticaPp', label: `vs ${bench}`, num: true, render: v => pp(v, 2)}, num('days', 'Days'), {key: 'status', label: 'Status', render: (_, r) => r.eligible && !ok(r.yoyPct) ? 'No 12M baseline' : inflationStatus(r)}].map(inflationColumn), rows: comparison,
      caption: t(`${comparable} ${comparable === 1 ? 'world allows' : 'worlds allow'} a 12-month comparison, because ${comparable === 1 ? 'it has' : 'they have'} quotes in both months${ok(reference?.yoyPct) ? `, ${bench} included` : ''}. * At least one reference month has a limited sample, which may reflect collection.${I.unavailable.length ? ` No frozen history exists for ${list(I.unavailable)}.` : ''} Because coverage varies, the comparison is limited; mergers and new worlds do not inherit earlier series.`,
        `${comparable} ${comparable === 1 ? 'world permite' : 'worlds permitem'} comparar 12 meses, pois ${comparable === 1 ? 'tem' : 'têm'} quotes nos dois meses${ok(reference?.yoyPct) ? `, incluindo ${bench}` : ''}. * Ao menos um mês de referência tem sample limitada, que pode refletir a coleta.${I.unavailable.length ? ` Não há histórico congelado para ${list(I.unavailable)}.` : ''} Como a coverage varia, a comparação é limitada; mergers e worlds novos não herdam séries anteriores.`)})});
  };
  const renderInflation = () => {
    const side = state.side, w = state.world || bench;
    const rows = I.monthly.filter(r => r.world === w && r.side === side).map(inflationObserved);
    const last = rows.filter(r => r.eligible).at(-1);
    const model = I.models.find(m => m.side === side && m.since === inflationSamples[0]);
    const sensitivity = I.models.find(m => m.side === side && m.since === inflationSamples[1]);
    const a = I.monthly.find(r => r.world === bench && r.side === side && r.date === I.comparisonMonth);
    const recent = recentAttribution(model);
    const recentAlt = sensitivity.attribution.find(r => r.start === recent.start);
    const refAnnual = I.annual.filter(r => r.world === bench && r.side === side);
    const yr = y => refAnnual.find(r => r.year === y) || {};
    const lastYear = yr(inflationLastYear), partialYear = lastYear.endMonth < 12;
    // A change in the 12-month rate compares this month's move with the same month a year earlier (the base).
    const yearBefore = iso => `${+isoYear(iso) - 1}${iso.slice(4)}`;
    const base = I.monthly.find(r => r.world === bench && r.side === side && r.date === yearBefore(a.date));
    const baseMom = base ? (ok(base.momPct) ? base.momPct : base.observed?.momPct) : null, nowMom = ok(a.momPct) ? a.momPct : a.observed?.momPct;
    const baseEffect = ok(baseMom) && ok(nowMom) && Math.sign(a.accelerationPp) === Math.sign(nowMom - baseMom);
    document.getElementById('inflation-reading').innerHTML = t(
      `<p>In ${bench}, 12-month inflation in ${SIDES[side]} reached ${sgn(a.yoyPct, 2)} in ${monthYear(a.date)}, ${a.accelerationPp >= 0 ? 'an acceleration' : 'a deceleration'} of ${fmt(Math.abs(a.accelerationPp), 2)} pp from the previous month${baseEffect ? `, which reflects the base rather than the current month alone, since ${monthYear(base.date)} had itself moved ${sgn(baseMom)} from the month before, against ${sgn(nowMom)} in ${monthYear(a.date)}` : ''}. Measured from December to December, it moved from ${sgn(yr(inflationLastYear - 2).endVsDecemberPct, 2)} in ${inflationLastYear - 2} to ${sgn(yr(inflationLastYear - 1).endVsDecemberPct, 2)} in ${inflationLastYear - 1}, while the cumulative change from December ${inflationLastYear - 1} to ${monthYear(a.date)} stands at ${sgn(lastYear.endVsDecemberPct, 2)}${partialYear ? ', pending the annual close' : ''}; comparing the same months, the mean of January to ${MONTHS_LONG[lastYear.endMonth - 1]} ${inflationLastYear} is ${sgn(lastYear.meanYoYPct, 2)} relative to ${inflationLastYear - 1}.</p>`,
      `<p>Em ${bench}, a inflation em 12 meses de ${SIDES[side]} chegou a ${sgn(a.yoyPct, 2)} em ${monthYear(a.date)}, ${a.accelerationPp >= 0 ? 'uma aceleração' : 'uma desaceleração'} de ${fmt(Math.abs(a.accelerationPp), 2)} pp em relação ao mês anterior${baseEffect ? `, que reflete a base, e não apenas o mês corrente, pois ${monthYear(base.date)} já havia variado ${sgn(baseMom)} em relação ao mês anterior, ante ${sgn(nowMom)} em ${monthYear(a.date)}` : ''}. Medida de dezembro a dezembro, passou de ${sgn(yr(inflationLastYear - 2).endVsDecemberPct, 2)} em ${inflationLastYear - 2} para ${sgn(yr(inflationLastYear - 1).endVsDecemberPct, 2)} em ${inflationLastYear - 1}, enquanto a variação acumulada de dezembro de ${inflationLastYear - 1} a ${monthYear(a.date)} é ${sgn(lastYear.endVsDecemberPct, 2)}${partialYear ? ', ainda sem fechamento anual' : ''}; comparando os mesmos meses, a mean de janeiro a ${MONTHS_LONG[lastYear.endMonth - 1]} de ${inflationLastYear} varia ${sgn(lastYear.meanYoYPct, 2)} em relação a ${inflationLastYear - 1}.</p>`);
    // Shares of the recent change, in log points, in both estimation samples; a component is named only when it
    // carries most of the change in both.
    const share = (row, key) => 100 * row[key] / row.totalLogPoints;
    const lead = leadComponent([recent, recentAlt]), trendSmall = recent.trendSharePct < 25 && recentAlt.trendSharePct < 25;
    const shares = row => [fmt(row.trendSharePct, 1), fmt(share(row, 'seasonalLogPoints'), 1), fmt(share(row, 'residualLogPoints'), 1)].map(x => `${x}%`);
    const [t1, s1, r1] = shares(recent), [t2, s2, r2] = shares(recentAlt);
    const topTrend = Math.max(model.annualTrendPct, sensitivity.annualTrendPct);
    document.getElementById('inflation-decomposition').innerHTML = t(
      `<p>${lead ? `The decomposition attributes most of the recent change to the ${{trend: 'trend', seasonal: 'seasonal component', residual: 'residual'}[lead]} in both estimation samples` : trendSmall ? 'The decomposition assigns little of the recent change to the trend and splits the remainder between the seasonal component and the residual in proportions that depend on the estimation sample' : 'The decomposition divides the recent change among trend, season and residual in proportions that depend on the estimation sample'}: from ${monthYear(recent.start)} to ${monthYear(recent.end)}, the monthly median of ${SIDES[side]} moved ${sgn(recent.changePct, 2)}, of which, in log terms, the trend accounts for ${t1}, the seasonal component for ${s1} and the residual for ${r1} in the fit since ${monthYear(model.since)}, against ${t2}, ${s2} and ${r2} in the fit since ${monthYear(sensitivity.since)}. The estimated annual trend likewise moves from ${sgn(model.annualTrendPct, 2)} to ${sgn(sensitivity.annualTrendPct, 2)} between the two samples, a sensitivity that forbids reading either figure as a permanent structural rate.${a.yoyPct > topTrend ? ` Because seasonality cancels when the same month is compared across years, a 12-month rate of ${sgn(a.yoyPct, 2)} against an estimated trend of at most ${sgn(topTrend, 2)} places the current level above what the trend and the usual season alone would imply.` : ''}</p>`,
      `<p>${lead ? `A decomposition atribui a maior parte da variação recente ${{trend: 'à trend', seasonal: 'ao componente seasonal', residual: 'ao residual'}[lead]} nas duas samples de estimação` : trendSmall ? 'A decomposition atribui pouco da variação recente à trend e divide o restante entre o componente seasonal e o residual em proporções que dependem da sample de estimação' : 'A decomposition divide a variação recente entre trend, seasonality e residual em proporções que dependem da sample de estimação'}: de ${monthYear(recent.start)} a ${monthYear(recent.end)}, a monthly median de ${SIDES[side]} variou ${sgn(recent.changePct, 2)}, dos quais, em log, a trend responde por ${t1}, o componente seasonal por ${s1} e o residual por ${r1} no ajuste desde ${monthYear(model.since)}, ante ${t2}, ${s2} e ${r2} no ajuste desde ${monthYear(sensitivity.since)}. A trend anual estimada também passa de ${sgn(model.annualTrendPct, 2)} para ${sgn(sensitivity.annualTrendPct, 2)} entre as duas samples, uma sensibilidade que impede ler qualquer dos dois números como uma rate estrutural permanente.${a.yoyPct > topTrend ? ` Como a seasonality se anula quando o mesmo mês é comparado entre anos, uma rate em 12 meses de ${sgn(a.yoyPct, 2)} diante de uma trend estimada de no máximo ${sgn(topTrend, 2)} coloca o price level atual acima do que a trend e a seasonality usual, por si sós, implicariam.` : ''}</p>`);
    document.getElementById('card-inflation-prices').innerHTML = card({evidence: 'observed', title: `${w}: Monthly Offer Prices`, sub: t(`gp/TC; ${last ? `latest eligible month: ${monthYearEn(last.date)}` : 'no month with sufficient coverage'}`, `gp/TC; ${last ? `último mês elegível: ${monthYear(last.date)}` : 'nenhum mês com coverage suficiente'}`), controls: worldControl({value: w}),
      body: '<div class="chart" id="ch-inflation-prices"></div>', note: t('Median of daily medians in closed months, wherever quotes exist, even if limited.', 'Median das daily medians em meses encerrados, sempre que há quotes, mesmo limitadas.')});
    chart('ch-inflation-prices', host => lineChart(host, {aria: t(`${w}: monthly prices in gp/TC`, `${w}: prices mensais em gp/TC`), yFmt: fmt, tipFmt: fmt,
      series: sideSeries(s => ({points: I.monthly.filter(r => r.world === w && r.side === s).map(r => [r.date, r.status !== 'Partial month' ? r.price : null])}))}));
    document.getElementById('card-inflation-rates').innerHTML = card({evidence: 'observed', title: sided(`${w}: Monthly and 12-Month Inflation`, side), sub: t('Change in the available quotes, limited samples included', 'Variação das quotes disponíveis, incluindo samples limitadas'), controls: sideControl(), body: '<div class="chart" id="ch-inflation-rates"></div>'});
    chart('ch-inflation-rates', host => lineChart(host, {aria: t(`${w}: monthly and 12-month inflation`, `${w}: inflation mensal e em 12 meses`), zero: true, yFmt: v => pctU(v, 1), tipFmt: v => sgn(v, 2),
      series: [{label: t('Monthly', 'Mensal'), cls: 'c-ask', points: rows.map(r => [r.date, r.momPct])}, {label: t('12 months', '12 meses'), cls: 'c-bid', points: rows.map(r => [r.date, r.yoyPct])}]}));
    document.getElementById('card-inflation-monthly').innerHTML = card({evidence: 'observed', title: sided(`${w}: Monthly Values`, side), sub: t(`Every month from ${inflationYears[0]} to ${inflationLastYear}; missing months never become zero`, `Todos os meses de ${inflationYears[0]} a ${inflationLastYear}; meses ausentes nunca viram zero`), body: table({columns: [
      {key: 'date', label: 'Month', render: monthYearEn}, num('price', 'gp/TC', 0), signed('momPct', 'Monthly'), signed('yoyPct', '12 Months'),
      {key: 'accelerationPp', label: '12M Δ', num: true, render: v => pp(v, 2)}, num('days', 'Days'), percent('coveragePct', 'Coverage', 1),
      {key: 'first', label: 'First Quote', render: cellDate}, {key: 'last', label: 'Last Quote', render: cellDate}, {key: 'status', label: 'Status', render: (_, r) => inflationStatus(r)}].map(inflationColumn), rows,
      caption: t('* The rate compares limited samples when a reference period falls short of the minimum coverage. Months in progress have no rates. 12M Δ pp: the change, in pp, in 12-month inflation from the previous month.', '* A rate compara samples limitadas quando um período de referência não atinge a coverage mínima. Meses em andamento não têm rates. 12M Δ pp: a variação, em pp, da inflation em 12 meses em relação ao mês anterior.')})});
    document.getElementById('card-inflation-annual').innerHTML = card({evidence: 'observed', title: `${w}: Annual Comparison`, sub: `${inflationYears.join(', ')}; ${list(Object.values(SIDES))}`, body: table({columns: [
      {key: 'year', label: 'Year', render: String}, {key: 'side', label: 'Market Side', render: s => SIDES[s]}, {key: 'period', label: 'Period', render: (_, r) => inflationPeriod(r)},
      {key: 'months', label: 'Months', render: (v, r) => `${v}/${r.referenceMonths}`}, num('meanPrice', 'Mean gp/TC', 0), signed('meanYoYPct', 'Mean vs Prior Year'), num('endPrice', 'End gp/TC', 0),
      signed('endVsDecemberPct', 'End vs Prior Dec'), signed('janToEndPct', 'End vs Jan')].map(inflationColumn), rows: I.annual.filter(r => r.world === w).map(inflationObserved),
      caption: t('* At least one month of the calculation has a limited sample. YTD compares the same months across years; without the previous December, annual inflation is unavailable. End is the median of the final month.', '* Ao menos um mês do cálculo tem sample limitada. YTD compara os mesmos meses entre anos; sem o dezembro anterior, a inflation anual fica indisponível. End é a median do mês final.')})});
    document.getElementById('card-inflation-trend').innerHTML = card({evidence: 'exploratory', title: sided(`${bench}: Trend and Seasonality`, side), sub: t(`Fit since ${monthYearEn(model.since)}; estimated trend ${sgn(model.annualTrendPct, 2)} a year`, `Ajuste desde ${monthYear(model.since)}; trend estimada de ${sgn(model.annualTrendPct, 2)} ao ano`), controls: sideControl(), body: '<div class="chart" id="ch-inflation-trend"></div>',
      drawer: table({columns: [{key: 'date', label: 'Month', render: monthYearEn}, num('price', 'Observed gp/TC', 0), num('trendPrice', 'Trend gp/TC', 0), num('adjustedPrice', 'Seasonally Adjusted gp/TC', 0)], rows: model.points}),
      note: t('Because it is descriptive and estimated on the whole sample, the model is neither a forecast nor causal evidence. The curve removes only the mean monthly pattern and keeps the trend and the residual.', 'Por ser descritivo e estimado com toda a sample, o modelo não é um forecast nem evidência causal. A curva remove apenas o padrão mensal médio e mantém a trend e o residual.')});
    chart('ch-inflation-trend', host => lineChart(host, {aria: t(`${bench}: observed level, trend and seasonally adjusted price`, `${bench}: price level observado, trend e price seasonally adjusted`), yFmt: fmt, tipFmt: fmt,
      series: [['price', t('Observed', 'Observado'), 'c-ask'], ['trendPrice', 'Trend', 'c-ink'], ['adjustedPrice', 'Seasonally adjusted', 'c-bid']].map(([key, label, cls]) => ({label, cls, points: model.points.map(r => [r.date, r[key]])}))}));
    document.getElementById('card-inflation-attribution').innerHTML = card({evidence: 'exploratory', title: sided(`${bench}: Attribution and Sample Sensitivity`, side), sub: t('Additive contributions in log points: 100 × change in the log-price', 'Contribuições aditivas em log points: 100 × variação do log-price'), body: table({columns: [
      {key: 'since', label: 'Sample Since', render: cellDate}, signed('annualTrendPct', 'Trend per Year'), {key: 'start', label: 'From', render: monthYearEn}, {key: 'end', label: 'To', render: monthYearEn},
      signed('changePct', 'Observed'), num('totalLogPoints', 'Total log pts', 2), num('trendLogPoints', 'Trend log pts', 2), num('seasonalLogPoints', 'Seasonal log pts', 2), num('residualLogPoints', 'Residual log pts', 2), percent('trendSharePct', 'Trend Share', 1)],
      rows: [model, sensitivity].flatMap(m => m.attribution.map(r => ({...r, since: m.since, annualTrendPct: m.annualTrendPct})))}), note: t('Contributions in log points, to be read neither as simple percentages nor causally; the residual is what the model does not explain.', 'Contribuições em log points, que não devem ser lidas como percentuais simples nem de forma causal; o residual é o que o modelo não explica.')});
  };
  on(renderInflation, ['side', 'world'], ['inflation-reading', 'inflation-decomposition', 'card-inflation-prices', 'card-inflation-rates', 'card-inflation-monthly', 'card-inflation-annual', 'card-inflation-trend', 'card-inflation-attribution']);
  on(renderInflationWorlds, ['side', 'inflationMonth'], ['card-inflation-worlds']);

  // Pickers inside cards re-render with their card; the header and chapter pickers only follow the selection.
  // Cards that fall back to the benchmark for a world the research does not model keep their picker on the benchmark.
  on(() => document.querySelectorAll('[data-picker="world"]').forEach(p => { if (!W[state.world] && p.closest('#card-roundtrip, #card-maker')) return; if ([...p.options].some(o => o.value === state.world)) p.value = state.world; }), ['world']);
  normalizeReport();
  ro.observe(root);
  document.getElementById('loading')?.remove();
  // Every block is registered: show the page the address names, or the first page.
  route();
  // The report is complete only once the page shown has rendered.
  root.setAttribute('aria-busy', 'false');
}

main().catch(err => {
  const root = document.getElementById('report');
  root.setAttribute('aria-busy', 'false');
  const detail = esc(err.message);
  const message = err instanceof ReportDataError
    ? t(`The report data could not be loaded (${detail}). Please retry. If this page was opened as a local file, open the published report over HTTP instead.`, `Não foi possível carregar os dados do relatório (${detail}). Tente novamente. Se esta página foi aberta como arquivo local, abra o relatório publicado por HTTP.`)
    : t(`The report could not be displayed because of a JavaScript runtime error (${detail}). This may be a browser compatibility issue; please report this error with your browser version.`, `Não foi possível exibir o relatório devido a um erro de execução de JavaScript (${detail}). Pode ser um problema de compatibilidade do navegador; informe este erro junto com a versão do navegador.`);
  root.innerHTML = `<p class="failed">${message}</p>`;
  console.error(err);
});
