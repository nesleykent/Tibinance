/*
 * Renders the Tibia Coins report from results.json (analyze.py + compare_trades.py)
 * and complement.json (complement.py). No build step and no dependencies: every
 * number on the page is read from those two files, so the page can never drift
 * from the analysis that produced it.
 */
'use strict';

// ---------------------------------------------------------------- formatting
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d}));
const ok = v => v != null && Number.isFinite(v);
// Signs follow the rounded value, so −0,004 prints as 0,00 and not as −0,00.
const round = (v, d) => Number(v.toFixed(d)) || 0;
const sign = (v, d) => round(v, d) > 0 ? '+' : round(v, d) < 0 ? '−' : '';
const fmt = (v, d = 0) => ok(v) ? nf(d).format(round(v, d)).replace('-', '−') : '—';
const sgn = (v, d = 1) => ok(v) ? `${sign(v, d)}${fmt(Math.abs(v), d)}%` : '—';
const pctU = (v, d = 1) => ok(v) ? `${fmt(v, d)}%` : '—';
const pp = (v, d = 1) => ok(v) ? `${sign(v, d)}${fmt(Math.abs(v), d)} p.p.` : '—';
const price = v => ok(v) ? `${fmt(v / 1000, 1)} mil` : '—';
const prob = v => ok(v) ? `${fmt(v * 100, 0)}%` : '—';
const br = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
const brShort = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—';
const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const monthYear = iso => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const SIDES = {ask: 'Sell Offers', bid: 'Buy Offers'};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const cls = v => ok(v) ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : 'dim';

// ---------------------------------------------------------------- state shared by every interactive block
const state = {world: 'Antica', side: 'ask'};
const listeners = [];
// A block re-renders only when a key it depends on changes.
const on = (fn, deps = ['side', 'world']) => { listeners.push({fn, deps}); fn(); };
function set(key, value) {
  if (state[key] === value) return;
  // Re-rendering replaces a card's controls and drawers: keep the reader's focus and the drawers they opened.
  const a = document.activeElement, host = a?.closest('[id^="card-"]')?.id, focusSide = a?.dataset?.side;
  const open = [...document.querySelectorAll('details.drawer[open]')].map(d => d.closest('[id^="card-"]')?.id).filter(Boolean);
  state[key] = value;
  listeners.filter(l => l.deps.includes(key)).forEach(l => l.fn());
  open.forEach(id => { const d = document.querySelector(`#${id} details.drawer`); if (d) d.open = true; });
  if (host && focusSide) document.querySelector(`#${host} [data-side="${focusSide}"]`)?.focus();
}

// ---------------------------------------------------------------- tables
function table({columns, rows, caption, empty = 'Sem observações suficientes para esta comparação.'}) {
  const head = columns.map(c => `<th scope="col"${c.num ? ' class="n"' : ''}>${c.label}</th>`).join('');
  const body = rows.length ? rows.map(r => `<tr>${columns.map(c => {
    const v = c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—');
    const k = [c.num ? 'n' : '', c.wrap ? 'wrap' : '', c.cls ? c.cls(r[c.key], r) : ''].filter(Boolean).join(' ');
    return `<td${k ? ` class="${k}"` : ''}>${v}</td>`;
  }).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${empty}</td></tr>`;
  return `<div class="scroll"><table class="data">${caption ? `<caption>${caption}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const num = (key, label, d = 0, extra = {}) => ({key, label, num: true, render: v => fmt(v, d), ...extra});
const signed = (key, label, d = 1) => ({key, label, num: true, render: v => sgn(v, d), cls: v => cls(v)});

let uid = 0;
function card({id, title, sub = '', controls = '', body = '', drawer = ''}) {
  // Every table in the card is named by the card title.
  const tid = `t${++uid}`, named = html => html.replace(/<table class="data">/g, `<table class="data" aria-labelledby="${tid}">`);
  return `<div class="card"${id ? ` id="${id}"` : ''}><div class="card-head"><div><h3 class="card-title" id="${tid}">${title}</h3>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>${controls}</div><div class="card-body">${named(body)}</div>${drawer ? `<details class="drawer"><summary>Dados do gráfico</summary>${named(drawer)}</details>` : ''}</div>`;
}
const sideControl = () => `<div class="seg" role="group" aria-label="Ponta">${Object.entries(SIDES).map(([k, v]) => `<button type="button" data-side="${k}" aria-pressed="${state.side === k}">${v}</button>`).join('')}</div>`;

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
  const years = (x1 - x0) / 3.156e10, out = [];
  const d = new Date(x0); d.setUTCDate(1);
  const stepM = years > 2.5 ? 12 : years > 1.2 ? 6 : years > .6 ? 3 : 1;
  d.setUTCMonth(Math.ceil(d.getUTCMonth() / stepM) * stepM);
  if (stepM === 12) d.setUTCMonth(0), d.setUTCFullYear(d.getUTCFullYear() + (d.getTime() < x0 ? 1 : 0));
  for (; d.getTime() <= x1; d.setUTCMonth(d.getUTCMonth() + stepM)) {
    if (d.getTime() < x0) continue;
    const iso = d.toISOString().slice(0, 10);
    out.push({x: d.getTime(), label: stepM === 12 ? iso.slice(0, 4) : monthYear(iso)});
  }
  return out;
}
const yLabel = v => Math.abs(v) >= 1000 ? `${fmt(v / 1000, v % 1000 ? 1 : 0)} mil` : fmt(v, Number.isInteger(v) ? 0 : 1);

/**
 * Line chart on a date axis. Nulls break a line (never interpolated); a point with
 * no neighbour is drawn as a dot so sparse worlds stay visible.
 */
function lineChart(host, cfg) {
  const W = Math.max(300, host.clientWidth || 640), H = cfg.height || 280;
  const m = {l: 58, r: 14, t: 12, b: 28};
  const xs = [], ys = [];
  (cfg.series || []).forEach(s => s.points.forEach(([x, y]) => { xs.push(ms(x)); if (ok(y)) ys.push(y); }));
  (cfg.bands || []).forEach(b => b.points.forEach(([x, lo, hi]) => { xs.push(ms(x)); if (ok(lo)) ys.push(lo); if (ok(hi)) ys.push(hi); }));
  cfg.markers = (cfg.markers || []).filter(k => ok(k.y));
  cfg.markers.forEach(k => { xs.push(ms(k.x)); ys.push(k.y); });
  if (!ys.length) { host.innerHTML = '<p class="dim">Sem dados para este recorte.</p>'; return; }
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5 * 7; x1 += 864e5 * 7; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0 || y1 * .05 || 1) * .08; y0 -= pad; y1 += pad;
  if (cfg.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const yt = niceTicks(y0, y1, 5).filter(v => v >= y0 && v <= y1);
  const fy = cfg.yFmt || yLabel;
  let svg = `<g class="grid">${yt.map(v => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>`;
  svg += yt.map(v => `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${fy(v)}</text>`).join('');
  svg += timeTicks(x0, x1).map(t => `<text x="${X(t.x)}" y="${H - 8}" text-anchor="middle">${t.label}</text>`).join('');
  if (cfg.zero && y0 < 0 && y1 > 0) svg += `<line class="zero" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  (cfg.vlines || []).forEach(v => { svg += `<line class="rule" x1="${X(ms(v.x))}" x2="${X(ms(v.x))}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(ms(v.x)) + 4}" y="${m.t + 10}">${v.label}</text>`; });
  (cfg.bands || []).forEach(b => {
    let seg = [];
    const flush = () => { if (seg.length > 1) svg += `<path class="band ${b.cls}" d="M${seg.map(p => `${X(p[0])},${Y(p[2])}`).join('L')}L${seg.slice().reverse().map(p => `${X(p[0])},${Y(p[1])}`).join('L')}Z"/>`; seg = []; };
    b.points.forEach(([x, lo, hi]) => ok(lo) && ok(hi) ? seg.push([ms(x), lo, hi]) : flush()); flush();
  });
  (cfg.series || []).forEach(s => {
    const pts = s.points.map(([x, y]) => [ms(x), y]);
    let d = '', pen = false;
    pts.forEach(([x, y], i) => {
      if (!ok(y)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(x)},${Y(y)}`; pen = true;
      const lone = !ok(pts[i - 1]?.[1]) && !ok(pts[i + 1]?.[1]);
      if (lone || s.dots) svg += `<circle class="pt ${s.cls}" cx="${X(x)}" cy="${Y(y)}" r="${s.dots ? 2.5 : 2.75}"/>`;
    });
    svg += `<path class="line ${s.cls}${s.dash ? ' dash' : ''}${s.thin ? ' thin' : ''}" d="${d}"/>`;
  });
  (cfg.markers || []).forEach(k => {
    const cx = X(ms(k.x)), cy = Y(k.y), up = k.pos !== 'below';
    // Labels near either edge are anchored inwards so they are never clipped.
    const anchor = cx > W - m.r - 70 ? 'end' : cx < m.l + 50 ? 'start' : 'middle', tx = anchor === 'end' ? cx + 4 : anchor === 'start' ? cx - 4 : cx;
    svg += `<g class="mk"><circle class="${k.hollow ? 'hollow ' : 'pt '}${k.cls || 'c-ink'}" cx="${cx}" cy="${cy}" r="${k.r || 4}"/>${k.label ? `<text x="${tx}" y="${up ? cy - 9 : cy + 17}" text-anchor="${anchor}">${k.label}</text>` : ''}</g>`;
  });
  svg += `<line class="rule xhair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><rect class="hover" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/>`;
  host.innerHTML = `${cfg.legend ? `<div class="legend">${cfg.legend}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.aria || '')}">${svg}</svg><div class="tip" hidden></div>`;

  // Crosshair tooltip: every series and band at the nearest date that has data.
  const dates = [...new Set([...(cfg.series || []).flatMap(s => s.points.filter(p => ok(p[1])).map(p => p[0])), ...(cfg.bands || []).flatMap(b => b.points.filter(p => ok(p[1])).map(p => p[0]))])].sort();
  const svgEl = host.querySelector('svg'), tip = host.querySelector('.tip'), rule = svgEl.querySelector('.xhair');
  const fv = cfg.tipFmt || (v => fmt(v));
  svgEl.querySelector('.hover').addEventListener('pointermove', e => {
    const box = svgEl.getBoundingClientRect(), sx = (e.clientX - box.left) * W / box.width;
    const target = x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0);
    let best = dates[0]; for (const d of dates) if (Math.abs(ms(d) - target) < Math.abs(ms(best) - target)) best = d;
    const rows = [];
    // Series dated on different weekdays (Sunday weeks, Wednesday scenarios) meet at the nearest point within half a week.
    const near = pts => pts.filter(q => ok(q[1])).find(q => Math.abs(ms(q[0]) - ms(best)) <= 3.5 * 864e5);
    (cfg.series || []).forEach(s => { const p = near(s.points); if (p) rows.push(`${s.label}: <b>${fv(p[1])}</b>`); });
    (cfg.bands || []).forEach(b => { const p = near(b.points); if (p) rows.push(`${b.label}: ${fv(p[1])} – ${fv(p[2])}`); });
    if (!rows.length) return;
    const px = X(ms(best)), hb = host.getBoundingClientRect();
    rule.setAttribute('x1', px); rule.setAttribute('x2', px); rule.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${br(best)}</b><br>${rows.join('<br>')}`; tip.hidden = false;
    const left = box.left - hb.left + px * box.width / W, tw = tip.offsetWidth, th = tip.offsetHeight, py = e.clientY - hb.top;
    tip.style.left = `${left + 12 + tw > hb.width ? Math.max(0, left - tw - 12) : left + 12}px`;
    tip.style.top = `${py - th - 10 < 0 ? py + 14 : py - th - 10}px`;
  });
  svgEl.querySelector('.hover').addEventListener('pointerleave', () => { tip.hidden = true; rule.setAttribute('visibility', 'hidden'); });
}

/** Grouped bars with optional interval whiskers; a <title> on each bar carries its value. */
function barChart(host, cfg) {
  const W = Math.max(300, host.clientWidth || 640), H = cfg.height || 250;
  const m = {l: 52, r: 10, t: 12, b: 28};
  const vals = cfg.series.flatMap(s => [...s.values, ...(s.lo || []), ...(s.hi || [])]).filter(ok);
  let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals); const pad = (y1 - y0 || 1) * .08; y0 -= y0 < 0 ? pad : 0; y1 += pad;
  const n = cfg.categories.length, band = (W - m.l - m.r) / n, bw = Math.min(26, band * .8 / cfg.series.length);
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const yt = niceTicks(y0, y1, 5).filter(v => v >= y0 && v <= y1), fy = cfg.yFmt || (v => fmt(v, 1));
  let svg = `<g class="grid">${yt.map(v => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>`;
  svg += yt.map(v => `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${fy(v)}</text>`).join('');
  svg += `<line class="zero" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  cfg.categories.forEach((c, i) => {
    const cx = m.l + band * (i + .5);
    if (band >= 28 || i % 2 === 0) svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${c}</text>`;
    cfg.series.forEach((s, j) => {
      const v = s.values[i]; if (!ok(v)) return;
      const x = cx - bw * cfg.series.length / 2 + bw * j;
      svg += `<rect class="${s.cls}" x="${x + 1}" y="${Math.min(Y(v), Y(0))}" width="${bw - 2}" height="${Math.max(1, Math.abs(Y(v) - Y(0)))}" rx="2"><title>${esc(`${s.label} · ${c}: ${(cfg.tipFmt || fy)(v)}${s.lo && ok(s.lo[i]) ? ` (IC ${(cfg.tipFmt || fy)(s.lo[i])} a ${(cfg.tipFmt || fy)(s.hi[i])})` : ''}`)}</title></rect>`;
      if (s.lo && ok(s.lo[i])) svg += `<line class="c-ink" x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${Y(s.lo[i])}" y2="${Y(s.hi[i])}" stroke-width="1.25"/>`;
    });
  });
  host.innerHTML = `${cfg.legend ? `<div class="legend">${cfg.legend}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.aria || '')}">${svg}</svg>`;
}

/** One row per world: hollow ring = reference premium, filled dot = premium now. */
function dumbbell(host, cfg) {
  const rows = cfg.rows, W = Math.max(300, host.clientWidth || 640), rowH = 24, m = {l: 92, r: 16, t: 8, b: 26};
  const H = m.t + m.b + rowH * rows.length;
  const vals = rows.flatMap(r => [r.a, r.b]).filter(ok);
  let x0 = Math.min(0, ...vals), x1 = Math.max(0, ...vals); const pad = (x1 - x0 || 1) * .06; x0 -= pad; x1 += pad;
  const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
  const xt = niceTicks(x0, x1, 6).filter(v => v >= x0 && v <= x1);
  let svg = `<g class="grid">${xt.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/>`).join('')}</g>`;
  svg += xt.map(v => `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">${fmt(v, 0)}%</text>`).join('');
  svg += `<line class="zero" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H - m.b}"/>`;
  rows.forEach((r, i) => {
    const y = m.t + rowH * (i + .5);
    svg += `<text x="${m.l - 10}" y="${y + 4}" text-anchor="end" style="fill:var(--ink)">${esc(r.label)}</text>`;
    if (ok(r.a) && ok(r.b)) svg += `<line class="c-muted" x1="${X(r.a)}" x2="${X(r.b)}" y1="${y}" y2="${y}" stroke-width="2" stroke-opacity=".45"/>`;
    if (ok(r.a)) svg += `<circle class="hollow ${cfg.cls}" cx="${X(r.a)}" cy="${y}" r="5"><title>${esc(`${r.label} · ${cfg.aLabel}: ${sgn(r.a)}`)}</title></circle>`;
    if (ok(r.b)) svg += `<circle class="pt ${cfg.cls}" cx="${X(r.b)}" cy="${y}" r="5"><title>${esc(`${r.label} · ${cfg.bLabel}: ${sgn(r.b)}`)}</title></circle>`;
  });
  host.innerHTML = `${cfg.legend ? `<div class="legend">${cfg.legend}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.aria || '')}">${svg}</svg>`;
}

// Charts are drawn at their container's width; redraw them when it changes. Keyed by
// element id, so re-rendering a block after a control change replaces its entry.
const charts = new Map();
function chart(id, draw) {
  const host = document.getElementById(id); if (!host) return;
  charts.set(id, draw); draw(host);
}
let resizeTimer, lastWidth = 0;
const ro = new ResizeObserver(entries => {
  const w = Math.round(entries[0].contentRect.width); if (w === lastWidth) return; lastWidth = w;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => charts.forEach((draw, id) => { const h = document.getElementById(id); if (h) draw(h); }), 120);
});

// ---------------------------------------------------------------- report
async function main() {
  // Always revalidate: a page updated on the server must never pair new code with a cached older data file.
  const [R, C] = await Promise.all(['results.json', 'complement.json'].map(f => fetch(f, {cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); })));
  const root = document.getElementById('report');

  // ---- shorthand over the two files
  const worlds = R.worlds, W = Object.fromEntries(worlds.map(w => [w.world, w]));
  const antica = W.Antica;
  const fc = (side, date) => R.forecast.find(x => x.side === side && x.date === date);
  const MILESTONES = ['2026-11-25', '2027-03-31', '2027-06-30', '2027-09-22'];
  const MNAME = {'2026-11-25': 'Nov. 2026', '2027-03-31': 'Mar. 2027', '2027-06-30': 'Jun. 2027', '2027-09-22': 'Set. 2027'};
  const nov = fc('ask', MILESTONES[0]), june = fc('ask', MILESTONES[2]);
  const bt = R.backtest;
  const summaries = [13, 26, 52].flatMap(h => ['ask', 'bid'].map(s => {
    const rows = bt.filter(x => x.horizon === h && x.side === s), g = m => rows.find(x => x.model === m)?.mape;
    return {horizon: h, side: s, n: rows[0]?.n, constant: g('Constante'), seasonal: g('Sazonal 52 semanas'), harmonic: g('Harmônico'), ensemble: g('Conjunto')};
  }));
  const strongest = R.eventStudy.filter(x => x.q < .05);
  const pred = R.predecessor[0];
  const median = a => { const s = a.filter(ok).slice().sort((x, y) => x - y), k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : null; };
  const list = a => a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a.at(-1)}` : a.join('');
  const yy = iso => `${brShort(iso)}/${iso.slice(2, 4)}`;

  // complement
  const SW = C.swings.sides, P = C.probabilistic, PK = P.package;
  const run = (side, sample, seed = 11) => P.sides[side][sample].runs.find(r => r.seed === seed);
  const m23 = run('ask', 'main'), m24 = run('ask', 'since2024');
  const cal = (side, h) => P.calibration.find(c => c.side === side && c.horizon === h);
  const probKeys = Object.keys(m23.prob);
  const seedSpread = Math.max(...['ask', 'bid'].flatMap(s => ['main', 'since2024'].flatMap(k => Object.values(P.sides[s][k].seedRange).map(([a, b]) => Math.round(b * 100) - Math.round(a * 100)))));
  const sampleGap = Math.max(...['ask', 'bid'].flatMap(s => probKeys.map(k => Math.abs(Math.round(run(s, 'main').prob[k] * 100) - Math.round(run(s, 'since2024').prob[k] * 100)))));
  const pkgSeedSpread = Math.max(...['p_peak_gt3', 'p_peak_after_oct31', 'p_jun27_below', 'p_trough_above_2026'].map(k => PK.stabilityRange[k][1] - PK.stabilityRange[k][0]));
  const anchorRows = P.anchorSensitivity, anchorGap = Math.max(...anchorRows.map(a => Math.round(a.pPeakAbove3OfReference * 100))) - Math.min(...anchorRows.map(a => Math.round(a.pPeakAbove3OfReference * 100)));
  const rt = (sample, mode) => P.roundtrip.find(r => r.sample === sample && r.mode === mode);
  const fitAsk = P.fit.find(f => f.side === 'ask' && f.sample === 'main');
  const cur = SW.ask.current, st = SW.ask.stats, legsAsk = SW.ask.legs;
  const ups = legsAsk.filter(l => l.direction === 'alta' && !l.censored && !l.short), declines = SW.ask.declines;
  const grp = (g, side) => C.crossWorld.groups.find(x => x.group === g && x.side === side);
  const Y = 'Optional PvP · BattlEye Yellow', yA = grp(Y, 'ask'), yB = grp(Y, 'bid');
  const others = C.crossWorld.groups.filter(g => g.side === 'ask' && g.group !== Y);
  const luz = C.crossWorld.worlds.find(x => x.world === 'Luzibra' && x.side === 'ask');
  const makerAntica = C.roundtripMaker.find(x => x.world === 'Antica' && x.cycle === '2025–2026' && x.sellMonth === 11);
  const makerDiffAntica = C.roundtripMaker.filter(x => x.world === 'Antica').map(x => x.makerNetPct - x.acceptPct);
  const makerBR = C.roundtripMaker.filter(x => x.world !== 'Antica' && ok(x.makerNetPct) && ok(x.acceptPct));
  const makerBRWins = makerBR.filter(x => x.makerNetPct > x.acceptPct).length;
  const wd = (scope, side) => C.weekday.tests.find(t => t.scope === scope && t.side === side);
  const volY = (side, y) => C.volatility.byYear.find(x => x.side === side && x.year === y);
  const yoy = (side, month) => C.context.yoy.find(x => x.side === side && x.month === month);
  const fanAt = (side, sample, date) => P.fan.find(f => f.side === side && f.sample === sample && f.date === date);
  // Gaps between probabilities are taken from the rounded percentages the tables show.
  const pc = v => Math.round(v * 100);
  const yearAgo = C.context.captureVsYearAgo.find(x => x.side === 'ask'), lastVsPeak = (cur.lastWeeklyLevel / cur.previousPeak - 1) * 100;
  const fit24 = P.fit.find(f => f.side === 'ask' && f.sample === 'since2024');
  const anchorLo = Math.min(...P.anchorSensitivity.map(a => pc(a.pPeakAbove3OfReference))), anchorHi = Math.max(...P.anchorSensitivity.map(a => pc(a.pPeakAbove3OfReference)));
  const luzLast = C.crossWorld.worlds.find(x => x.world === 'Belobra' && x.side === 'ask').last;

  // ---- hero, key figures, executive summary
  let html = `
  <header class="hero">
    <p class="eyebrow">Tibinance Research · Perspectivas 2026–2027 · Edição de 24 de setembro de 2026, complementada</p>
    <h1>Tibia Coins: cenários do próximo ciclo e execução por mundo</h1>
    <p class="deck">Análise de 16 mundos, com projeções distintas para Buy Offers e Sell Offers, anatomia e probabilidades do ciclo, valor relativo entre mundos e comparação com as médias diárias do histórico. Valores em gold por Tibia Coin (gp/TC).</p>
    <p class="meta">Corte analítico: ${br(R.asOf)} · Fontes: API pública do TibiaMarket (histórico de ofertas) e 45 capturas de mercado · <a href="https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle">código, dados e reprodução</a></p>
  </header>
  <div class="kpis" role="list">
    <div class="kpi" role="listitem"><div class="label">Antica · Sell Offers · captura de ${brShort(antica.date)}</div><div class="value">${fmt(antica.ask)}</div><div class="note">Leitura única. Buy Offers: ${fmt(antica.bid)} gp/TC. ${sgn(cur.aboveAllPreviousPeaksPct)} sobre o maior pico semanal anterior (${price(cur.previousPeak)})</div></div>
    <div class="kpi" role="listitem"><div class="label">Cenário central · ${MNAME[MILESTONES[0]].toLowerCase()} · Sell Offers de Antica</div><div class="value">${price(nov.base)}</div><div class="note">Faixa de estresse ${price(nov.low)} a ${price(nov.high)}; não é intervalo de confiança</div></div>
    <div class="kpi" role="listitem"><div class="label">Alta desde o fundo de ${brShort(cur.start)}</div><div class="value">${sgn(cur.toLastWeeklyPct)} a ${sgn(cur.changePct)}</div><div class="note">Até a mediana de ${brShort(cur.lastWeekly)} e até a captura de ${brShort(cur.end)}; altas completas: ${list(ups.map(u => sgn(u.changePct, 0)))}</div></div>
    <div class="kpi" role="listitem"><div class="label">Pico ≥ +3% até fev. 2027 · Sell Offers de Antica</div><div class="value">${prob(m23.prob.peakAbove3)} a ${prob(m24.prob.peakAbove3)}</div><div class="note">Varia com a amostra de treino (${fmt(m23.prob.peakAbove3 * 100)}–${fmt(m24.prob.peakAbove3 * 100)}%) e com a captura de partida (${anchorLo}–${anchorHi}%); só a amostra desde 2023 foi testada fora da amostra</div></div>
    <div class="kpi" role="listitem"><div class="label">Vender agora, recomprar no fim de junho</div><div class="value">${prob(rt('main', 'aceitando').pGain)} a ${prob(rt('since2024', 'aceitando').pGain)}</div><div class="note">Parcela das trajetórias simuladas que termina com mais TC, aceitando ofertas; varia com a amostra de treino</div></div>
  </div>
  <nav class="toc" aria-label="Seções"><ol>
    ${[['sumario', 'Sumário'], ['s01', 'Ofertas atuais'], ['s02', 'Próximo ciclo'], ['s03', 'Anatomia do ciclo'], ['s04', 'Probabilidades'], ['s05', 'Por mundo'], ['s06', 'Validação'], ['s07', 'Ciclos e sazonalidade'], ['s08', 'Execução'], ['s09', 'Volatilidade'], ['s10', 'Ofertas × médias'], ['s11', 'Eventos'], ['s12', 'Agenda'], ['s13', 'Método']].map(([id, l]) => `<li><a href="#${id}">${l}</a></li>`).join('')}
  </ol></nav>

  <section class="block" id="sumario">
    <h2>Sumário executivo</h2>
    <div class="prose">
      <p><strong>O cenário central admite valorização até o fim de 2026 e acomodação em meados de 2027, com diferenças relevantes de execução entre mundos.</strong> Em Antica, o preço em Sell Offers parte de ${price(antica.ask)} gp/TC; no cenário central, chegaria a ${price(nov.base)} em novembro e recuaria para ${price(june.base)} em junho. São trajetórias condicionais, não preços garantidos nem datas de giro identificáveis antecipadamente.</p>
      <ul>
        <li><strong>O ciclo anual se repetiu três vezes, com quedas cada vez menores.</strong> O máximo das Sell Offers de Antica veio entre o fim de outubro e o fim de novembro e o mínimo, entre meados de junho e julho. As quedas anuais encolheram (${list(declines.map(d => sgn(d.changePct)))}) porque os fundos subiram (${list(declines.map(d => price(d.endLevel)))}) enquanto os picos ficaram entre ${price(Math.min(...ups.map(u => u.endLevel)))} e ${price(Math.max(...ups.map(u => u.endLevel)))}. A última mediana semanal (${brShort(cur.lastWeekly)}) já estava ${sgn(lastVsPeak)} acima de todos esses picos, e a captura de 23/09 (leitura única), ${sgn(cur.aboveAllPreviousPeaksPct)}; a captura está ${sgn(yearAgo.pct, 0)} acima da mediana da mesma semana de 2025.</li>
        <li><strong>O modelo probabilístico do pacote é estável entre sementes, mas não entre amostras de treino nem entre capturas de partida.</strong> Refeito sobre as Sell Offers de Antica, dá ${prob(m23.prob.peakAbove3)} (treino desde 2023) a ${prob(m24.prob.peakAbove3)} (desde 2024) de chance de o máximo até 28/02/2027 ficar ao menos 3% acima da partida. Trocar a semente muda os números em até ${seedSpread} p.p. (${fmt(pkgSeedSpread * 100, 1)} p.p. no <code>forecast_stability.json</code> do pacote); trocar a amostra, em até ${sampleGap} p.p.; trocar a captura de partida (21, 22 ou 23/09), em até ${anchorGap} p.p. Só a amostra desde 2023 pôde ser testada fora da amostra, e nesses testes a direção prevista para 13 semanas perdeu para a regra simples de repetir o mesmo período do ano anterior.</li>
        <li><strong>Vender agora para recomprar em junho de 2027 é uma aposta, não uma certeza.</strong> Vendendo às Buy Offers de hoje e recomprando às Sell Offers da semana de 28/06/2027, o ganho em TC aparece em ${prob(rt('main', 'aceitando').pGain)} das trajetórias simuladas com treino desde 2023 e em ${prob(rt('since2024', 'aceitando').pGain)} com treino desde 2024, a amostra que projeta a queda mais funda.</li>
        <li><strong>A combinação de modelos agrega informação em Antica, mas não em todos os mundos.</strong> Em 13 semanas, o erro médio do preço em Sell Offers foi ${fmt(summaries[0].ensemble, 1)}%, ante ${fmt(summaries[0].constant, 1)}% com preço constante. No horizonte anual há apenas ${summaries.find(x => x.horizon === 52)?.n} origens por ponta: pouco para julgar os modelos em 52 semanas.</li>
        <li><strong>Sell Offers e Buy Offers exigem leituras diferentes, e criar ofertas tem custo.</strong> Luminera tem Sell Offers de ${price(W.Luminera.ask)} e Buy Offers de ${price(W.Luminera.bid)}; Antica, ${price(antica.ask)} e ${price(antica.bid)}. A compra seguida de venda imediata consome aproximadamente ${fmt(W.Luminera.costPct, 1)}% e ${fmt(antica.costPct, 1)}%, respectivamente. Criar uma oferta custa 2% do seu valor. Em Antica, onde as pontas estão próximas, criar ofertas nas duas pontas ficou entre ${pp(Math.min(...makerDiffAntica))} e ${pp(Math.max(...makerDiffAntica))} em relação a aceitar as existentes; nos mundos BR, com pontas mais afastadas, superou aceitar em ${makerBRWins} de ${makerBR.length} combinações, supondo que as duas ofertas sejam executadas.</li>
        <li><strong>Quatro mundos negociam com prêmio, hoje menor.</strong> Belobra, Celebra, Gentebra e Luminera, todos Optional PvP com BattlEye Yellow, ficaram cerca de ${sgn(yA.recentMedianPct, 0)} acima de Antica em Sell Offers nas últimas 26 semanas; os demais grupos, entre ${sgn(Math.min(...others.map(g => g.recentMedianPct)))} e ${sgn(Math.max(...others.map(g => g.recentMedianPct)))}. Nas oito semanas até ${brShort(luzLast)}, o prêmio do grupo caiu para ${sgn(yA.last8MedianPct, 0)}; nas capturas de 21–23/09, ${sgn(yA.currentMedianPct, 0)} em Sell Offers e ${sgn(yB.currentMedianPct, 0)} em Buy Offers. É um padrão de quatro mundos, não uma lei.</li>
        <li><strong>Duas exceções exigem tratamento próprio.</strong> Luzibra tem fusão anunciada e perde a projeção numérica após 22/10; seu desconto sobre Antica em Sell Offers — ${fmt(Math.abs(luz.preBreak8Pct))}% na mediana das oito semanas até ${brShort(luz.preBreak8End)}, ${fmt(Math.abs(luz.preBreakMedianPct))}% em todo o período anterior — desapareceu na semana de ${brShort(luz.breakWeek)}. Terribra/Obscubra recebe análise de histórico antes e depois da fusão, com última oferta de Terribra em 01/09 e sem captura atual.</li>
      </ul>
    </div>
  </section>`;

  // ---- 01 observed prices
  html += `
  <section class="block" id="s01">
    <h2><span class="num">01</span>Preços observados e condições de execução</h2>
    ${card({title: 'Ofertas mais recentes por mundo', sub: 'gp/TC · capturas de 21 a 23/09; Terribra: último histórico', body: table({columns: [
      {key: 'world', label: 'Mundo'}, {key: 'date', label: 'Data', render: br}, num('bid', 'Buy Offers'), num('ask', 'Sell Offers'), num('spreadPct', 'Diferença %', 2),
      {key: 'depthRatio', label: 'Amount: Buy / Sell', num: true, render: v => ok(v) ? `${fmt(v, 2)}×` : '—'}, num('ageDays', 'Idade em dias')], rows: worlds})})}
    <div class="prose">
      <h3>Como ler Sell Offers e Buy Offers</h3>
      <p><strong>Sell Offers:</strong> ofertas de quem quer vender TC. O relatório mostra o menor Piece Price disponível; aceitar uma dessas ofertas compra TC. <strong>Buy Offers:</strong> ofertas de quem quer comprar TC. O relatório mostra o maior Piece Price disponível; aceitar uma dessas ofertas vende TC. Essa é a nomenclatura do <a href="https://www.tibia.com/gameguides/?section=controls_trading&amp;subtopic=manual">Market no manual oficial do Tibia</a>.</p>
      <p><strong>Amount</strong> representa quantidade de TC. A razão Amount: Buy / Sell compara as quantidades totais visíveis; o total não está necessariamente disponível no melhor Piece Price. As capturas não são simultâneas: Celebra está em 21/09 e os demais mundos capturados em 23/09. A idade é medida em relação a 23/09.</p>
      <p>A diferença percentual entre Sell Offers e Buy Offers usa o ponto médio dos dois preços. A perda teórica ao comprar e revender imediatamente usa outra base: <strong>1 − Buy Offers / Sell Offers</strong>, sempre com os melhores preços; o resultado só vale até o Amount disponível nesses preços, que em alguns mundos é de 25 TC.</p>
    </div>
  </section>`;

  // ---- 02 scenarios (edition ensemble)
  html += `
  <section class="block" id="s02">
    <h2><span class="num">02</span>O ciclo oferece cenários; a execução depende de cada ponta</h2>
    <div class="prose">
      <p>O conjunto combina preço constante, repetição sazonal de 52 semanas e regressão com tendência e harmônicos anuais. O treinamento usa <strong>ofertas históricas de Antica</strong>, com a captura de 23/09 como âncora atual. Os modelos de Buy Offers e Sell Offers são estimados separadamente.</p>
      <p>Em novembro, o preço em Sell Offers de referência tem cenário central de <strong>${price(nov.base)} gp/TC</strong>, com estresse entre <strong>${price(nov.low)} e ${price(nov.high)}</strong>. Em junho, o central é <strong>${price(june.base)}</strong>, com estresse entre <strong>${price(june.low)} e ${price(june.high)}</strong>. Os limites combinam erro histórico e divergência de modelos; <strong>não representam probabilidades de 10% e 90% nem intervalos de confiança calibrados</strong>. A seção 04 estima probabilidades com outro modelo e testa sua calibração.</p>
    </div>
    <div id="card-model"></div>
  </section>`;

  // ---- 03 anatomy
  const sens = C.swings.sensitivity.filter(s => s.side === 'ask');
  const key3 = JSON.stringify(ups.map(u => u.end));
  const stable = sens.filter(s => ups.every(u => s.peaks.includes(u.end)) && declines.every(d => s.troughs.includes(d.end))).map(s => s.threshold * 100);
  const retr = SW.ask.retracements;
  const cmp = SW.ask.currentVsPastRises;
  const implied = cmp.map(c => c.impliedEnd).sort();
  html += `
  <section class="block" id="s03">
    <h2><span class="num">03</span>Anatomia do ciclo: o padrão anual se repete com quedas menores<span class="new">Novo</span></h2>
    <div class="prose">
      <p>Os pontos de virada foram marcados nas medianas semanais das Sell Offers de Antica com a regra do pacote recebido: um pico ou fundo só se confirma depois de um recuo de 5% a partir dele, e a última perna é sempre provisória. A série começa em ${br(SW.ask.pivots[0].date)}; a primeira alta, até maio de 2023, é censurada e fica fora das comparações. São três ciclos completos: um padrão descritivo, não uma lei estimada.</p>
      <p><strong>Datas.</strong> Os três picos completos caíram nas semanas encerradas em ${list(ups.map(u => br(u.end)))}; na série diária (mediana móvel de sete dias), os máximos foram ${list(ups.map(u => br(u.dailyPeakDate)))}, com o preço a menos de 2% do máximo por ${list(ups.map(u => fmt(u.plateauDays)))} dias, respectivamente. Os fundos foram ${list(declines.map(d => br(d.end)))}. Essas datas se mantêm com limiares de ${fmt(Math.min(...stable))}% a ${fmt(Math.max(...stable))}%. Com limiares de até 5% aparecem também um pico em maio e um fundo em julho de 2023; acima de 5% eles somem, a alta de 2023 passa a começar na primeira observação (censurada) e restam duas altas completas. Por isso, a alta de ${sgn(ups[0].changePct)} de 2023, a devolução de ${fmt(retr[0].retracePct / 100, 1)} vezes na queda seguinte e a primeira linha da régua dependem desse limiar.</p>
      <p><strong>Amplitude.</strong> As quedas de pico a fundo encolheram: ${list(declines.map(d => `${sgn(d.changePct)} (${d.weeks} semanas até ${yy(d.end)})`))}. Os fundos subiram (${list(declines.map(d => price(d.endLevel)))}) enquanto os picos ficaram em ${price(Math.min(...ups.map(u => u.endLevel)))}–${price(Math.max(...ups.map(u => u.endLevel)))}. A queda de 2023–24 devolveu ${fmt(retr[0].retracePct / 100, 1)} vezes a alta anterior; as seguintes devolveram ${list(retr.slice(1).map(r => pctU(r.retracePct, 0)))} dela. Um modelo de amplitude sazonal constante tende a exagerar o próximo recuo se esse amortecimento continuar.</p>
      <p><strong>Onde estamos.</strong> Do fundo de ${br(cur.start)} (${price(cur.startLevel)}), as Sell Offers subiram <strong>${sgn(cur.toLastWeeklyPct)} até a última mediana semanal</strong> (${br(cur.lastWeekly)}, ${cur.weeksToLastWeekly} semanas) e <strong>${sgn(cur.changePct)} até a captura de ${br(cur.end)}</strong> (${cur.weeks} semanas, leitura única). As altas completas somaram ${list(ups.map(u => `${sgn(u.changePct)} em ${u.weeks} semanas`))}: a atual já supera a de 2023. O maior pico anterior foi ${price(cur.previousPeak)}, em ${br(cur.previousPeakWeek)}; a última mediana semanal estava ${sgn(lastVsPeak)} acima dele, e a captura, ${sgn(cur.aboveAllPreviousPeaksPct)}. A captura de 23/09 está ${sgn(yearAgo.pct)} acima da mediana da mesma semana de 2025 (${price(yearAgo.yearAgoLevel)}); na mediana mensal, julho, agosto e setembro de 2026 (este só até 05/09) ficaram ${list(['07', '08', '09'].map(m => sgn(yoy('ask', `2026-${m}`).pct, 0)))} acima dos mesmos meses de 2025. Se a alta atual durasse o mesmo que cada alta completa, terminaria entre ${br(implied[0])} e ${br(implied.at(-1))} — régua de comparação com três casos, não sinal de venda.</p>
    </div>
    <div id="card-pivots"></div>
    ${card({title: 'Pernas confirmadas · Antica · Sell Offers', sub: 'Medianas semanais; recuo mínimo de 5%', body: table({columns: [
      {key: 'start', label: 'Início', render: br}, {key: 'end', label: 'Fim', render: br}, {key: 'direction', label: 'Direção', render: (v, r) => v + (r.censored ? ' ¹' : '')},
      num('startLevel', 'De'), num('endLevel', 'Para'), signed('changePct', 'Variação'), num('weeks', 'Semanas'), {key: 'dailyPeakDate', label: 'Máximo diário', render: v => v ? br(v) : ''}, {key: 'plateauDays', label: 'Dias a menos de 2% do máximo', num: true, render: (v, r) => v ? `${fmt(v)} (${brShort(r.plateauStart)}–${brShort(r.plateauEnd)})` : ''}],
      rows: [...legsAsk, {...cur, direction: 'alta (em curso)'}],
      caption: '¹ Começa na primeira observação da série: extensão censurada. A última linha termina na captura de 23/09.'})})}
    <div class="grid2">
      ${card({title: 'Régua da alta atual', sub: `Se a alta iniciada em ${br(cur.start)} repetisse cada alta completa`, body: table({columns: [
        {key: 'start', label: 'Alta de referência', render: (v, r) => `${yy(v)} → ${yy(r.end)}`}, signed('changePct', 'Variação'), num('weeks', 'Semanas'),
        {key: 'impliedEnd', label: 'Fim implícito', render: br}, num('impliedLevel', 'Nível implícito')], rows: cmp,
        caption: `Nível implícito = fundo de ${br(cur.start)} (${fmt(cur.startLevel)}) × (1 + variação da alta de referência).`})})}
      ${card({title: 'Antica · mediana mensal contra um ano antes', sub: '2026; setembro até 05/09', body: table({columns: [{key: 'month', label: 'Mês', render: v => monthYear(v + '-01')}, signed('ask', 'Sell Offers'), signed('bid', 'Buy Offers'), num('days', 'Dias')],
        rows: C.context.yoy.filter(x => x.side === 'ask').map(x => ({month: x.month, ask: x.pct, bid: yoy('bid', x.month).pct, days: x.days}))})})}
    </div>
  </section>`;

  // ---- 04 probabilities
  const c80 = P.calibration.map(c => c.cov80), c50 = P.calibration.map(c => c.cov50);
  const c13 = cal('ask', 13), c52 = cal('ask', 52), c13b = cal('bid', 13), c52b = cal('bid', 52);
  const ed = P.spec.editionWeeks, f23n = fanAt('ask', 'main', ed['2026-11-25']), f23j = fanAt('ask', 'main', ed['2027-06-30']), f24j = fanAt('ask', 'since2024', ed['2027-06-30']);
  html += `
  <section class="block" id="s04">
    <h2><span class="num">04</span>Probabilidades do ciclo: estáveis entre sementes, sensíveis à amostra<span class="new">Novo</span></h2>
    <div class="prose">
      <p>O pacote recebido estimava probabilidades com um modelo de tendência linear, dois harmônicos anuais e erros ARIMA(1,1,0), simulando ${fmt(PK.model.n_paths)} trajetórias com incerteza de parâmetros sobre um índice de <em>médias diárias de negócios</em> de 71 mundos. O arquivo <code>forecast_stability.json</code>, incluído no ZIP complementar, repete a simulação com quatro sementes (${PK.stability.map(s => s.seed).join(', ')}): as quatro probabilidades variam no máximo ${fmt(pkgSeedSpread * 100, 1)} p.p. e o pico mediano, ${fmt(PK.stabilityRange.peak_p50[1] - PK.stabilityRange.peak_p50[0])} gp. Isso mostra que o sorteio não muda as conclusões; <strong>não mostra que o modelo acerte</strong>. No código do pacote, a semente fixa só o sorteio de parâmetros: os choques de cada trajetória vêm de um gerador sem semente. Por isso nenhuma execução reproduz o <code>forecast.json</code> bit a bit — a semente 11 dá pico mediano de ${fmt(PK.seed11VsPublished.peakP50[0])} contra ${fmt(PK.seed11VsPublished.peakP50[1])} publicados, diferença do tamanho do erro de simulação, com as mesmas probabilidades em duas casas.</p>
      <p>Nesta edição, o mesmo modelo foi reestimado sobre as <strong>ofertas semanais de Antica</strong>, ancorado na captura de 23/09, com as mesmas quatro sementes — agora controlando também os choques, de modo que o resultado é reproduzível — e duas amostras de treino: desde a primeira semana válida (janeiro de 2023) e desde 15/01/2024, a escolha do pacote. Os eventos usam as mesmas semanas do pacote (30/11 a 06/12/2026 e 28/06 a 04/07/2027; pico depois de 31/10 = a partir da semana de 02/11).</p>
      <p><strong>Resultado.</strong> Entre sementes, os números variam no máximo ${seedSpread} p.p. A amostra pesa muito mais: começar em 2024 eleva a chance de a semana de 28/06/2027 ficar abaixo da partida de ${prob(m23.prob.jun28BelowStart)} para ${prob(m24.prob.jun28BelowStart)} e a de ela ficar abaixo da semana de 30/11/2026 de ${prob(m23.prob.jun28BelowNov30)} para ${prob(m24.prob.jun28BelowNov30)}. A amostra desde 2024 exclui o primeiro semestre de 2023, quando as Sell Offers subiram ${sgn(legsAsk[0].changePct, 0)} em plena época de queda sazonal; sem esse trecho, o ciclo anual ajustado fica mais amplo e a tendência, menor (${sgn(fit24.driftPerYear * 100)} contra ${sgn(fitAsk.driftPerYear * 100)} ao ano, com erro-padrão de ${fmt(fitAsk.driftSe * 100, 1)} p.p. nesta última). Como as quedas vêm encolhendo (seção 03), um ciclo mais amplo tende a exagerar o próximo recuo: leia os números desde 2024 como o lado pessimista da sensibilidade. A âncora também pesa: partindo da captura de 21/09 (${fmt(anchorRows[0].anchor)}) em vez da de 23/09, a chance de o máximo passar de ${fmt(Math.round(antica.ask * 1.03))} cai para ${prob(anchorRows[0].pPeakAbove3OfReference)}.</p>
      <p><strong>O que “pico” significa aqui.</strong> É o máximo de cada trajetória até 28/02/2027. Na amostra desde 2023, ele cai em semanas iniciadas até outubro em ${prob(1 - m23.peakMonthShare.novDez - m23.peakMonthShare.janFev)} das trajetórias, em novembro–dezembro em ${prob(m23.peakMonthShare.novDez)} e em janeiro–fevereiro em ${prob(m23.peakMonthShare.janFev)} — a mesma convenção do evento “a partir da semana de 02/11” (${prob(m23.prob.peakAfterOct31)}). Em ${prob(m23.peakOnEdge)} das trajetórias o máximo fica na primeira ou na última semana da janela, sem ponto de virada dentro dela.</p>
      <p><strong>Calibração.</strong> Em origens quinzenais de ${yy(c13.firstOrigin)} a ${yy(cal('ask', 4).lastOrigin)}, cada uma reestimada só com dados disponíveis naquela data, o intervalo central de 80% conteve ${pctU(Math.min(...c80) * 100, 0)}–${pctU(Math.max(...c80) * 100, 0)} dos valores observados e o de 50%, ${pctU(Math.min(...c50) * 100, 0)}–${pctU(Math.max(...c50) * 100, 0)}: não há subcobertura, e sim folga. Como as origens se sobrepõem (em 52 semanas, as ${c52.n} origens cobrem uma única temporada), isso não prova que os intervalos sejam largos demais. Na direção, o modelo supera um palpite fixo de 50% (Brier ${fmt(Math.min(...P.calibration.map(c => c.brier)), 2)}–${fmt(Math.max(...P.calibration.map(c => c.brier)), 2)} contra 0,25), mas em 13 semanas perde para a regra “repetir a direção do mesmo período do ano anterior” (Brier ${fmt(c13.brierSeasonal, 2)} em Sell Offers e ${fmt(c13b.brierSeasonal, 2)} em Buy Offers, contra ${fmt(c13.brier, 2)} e ${fmt(c13b.brier, 2)} do modelo) e superestimou as altas (probabilidade média de ${prob(c13.meanPUp)} contra ${prob(c13.freqUp)} observadas em Sell Offers e ${prob(c13b.freqUp)} em Buy Offers). Em 52 semanas, com uma única temporada de alvos, empata com a frequência histórica em Sell Offers (${fmt(c52.brier, 2)} e ${fmt(c52.brierClimate, 2)}) e perde para a regra do ano anterior em Buy Offers (${fmt(c52b.brier, 2)} contra ${fmt(c52b.brierSeasonal, 2)}). A calibração vale apenas para a amostra desde 2023: a desde 2024 não tem histórico suficiente nas origens de 2025. Leia as probabilidades como ordenação de cenários, não como frequências exatas: nesta seção, a amostra de treino muda os números em até ${sampleGap} p.p., a captura de partida em até ${anchorGap} p.p., e em 13 semanas o modelo superestimou as altas em ${fmt((c13.meanPUp - c13.freqUp) * 100)} p.p.</p>
      <p><strong>Coerência com a seção 02.</strong> Com treino desde 2023, a mediana simulada fica perto do cenário central: ${price(f23n.p50)} na semana de 23 a 29/11 (central de 25/11: ${price(nov.base)}) e ${price(f23j.p50)} na de 28/06 a 04/07 (central de 30/06: ${price(june.base)}). Com treino desde 2024, junho cai para ${price(f24j.p50)}, abaixo da faixa de estresse da seção 02 (${price(june.low)}) — a mesma sensibilidade à amostra descrita acima. As faixas de estresse da seção 02 são bem mais estreitas que a distribuição simulada: em junho, ${price(june.low)} a ${price(june.high)}, contra ${price(f23j.p10)} a ${price(f23j.p90)} entre P10 e P90; em novembro, ${price(nov.low)} a ${price(nov.high)}, contra ${price(f23n.p10)} a ${price(f23n.p90)}.</p>
      <p><strong>Vender agora, recomprar em junho.</strong> Nas mesmas trajetórias, vender hoje aceitando Buy Offers (${fmt(antica.bid)}) e recomprar aceitando Sell Offers na semana de 28/06/2027 termina com mais TC em ${prob(rt('main', 'aceitando').pGain)} dos casos (treino desde 2023; mediana ${sgn(rt('main', 'aceitando').gainPct[1])}) e em ${prob(rt('since2024', 'aceitando').pGain)} (desde 2024; mediana ${sgn(rt('since2024', 'aceitando').gainPct[1])}). Criando ofertas nas duas pontas, com 2% de taxa em cada e supondo execução, ${prob(rt('main', 'criando ofertas').pGain)} e ${prob(rt('since2024', 'criando ofertas').pGain)}. O pacote ilustrava a falha com um cenário fixo em Gentebra (preço +10% até a recompra, com 4,47% de diferença entre as pontas): ${sgn(P.roundtripPackageFail.fail_case_accept_pct)} em TC, aceitando ofertas. Não é um percentil nem se refere a Antica; aqui, em Antica, 10% das trajetórias perdem mais de ${fmt(Math.abs(rt('main', 'aceitando').gainPct[0]), 1)}% das TC (treino desde 2023).</p>
    </div>
    <div id="card-fan"></div>
    <div id="card-prob"></div>
    <div class="grid2"><div id="card-roundtrip-sim"></div><div id="card-anchor"></div></div>
    <div id="card-seeds"></div>
    <div id="card-calib"></div>
  </section>`;

  // ---- 05 per world
  html += `
  <section class="block" id="s05">
    <h2><span class="num">05</span>Análise por mundo</h2>
    <div class="prose"><p>Selecione um mundo para comparar ofertas históricas, cenários e limites de execução. A tabela de cenários transfere o movimento percentual da mesma ponta de Antica para a última oferta local. Não estima um ciclo independente para cada mundo. As análises individuais abaixo permanecem disponíveis para os 16 mercados.</p></div>
    <div class="controls">
      <label class="control">Mundo <select id="world-select">${worlds.map(w => `<option${w.world === state.world ? ' selected' : ''}>${w.world}</option>`).join('')}</select></label>
      <span class="control">Ponta ${sideControl()}</span>
    </div>
    <div class="grid2"><div id="card-world-history"></div><div id="card-world-projection"></div></div>
    <div id="card-scenario-table"></div>
    <div class="prose" id="selected-context"></div>
    <h3>Valor relativo entre mundos<span class="new">Novo</span></h3>
    <div class="prose" id="relative-prose"></div>
    <div class="grid2"><div id="card-premium-chart"></div><div id="card-groups"></div></div>
    <div id="card-premium-table"></div>
    <div id="card-groups-quarter"></div>
    <h3>Análises individuais</h3>
    <div class="dossiers" id="dossiers"></div>
    <div class="prose" style="margin-top:16px"><p><strong>Obscubra antes da fusão.</strong> A API trouxe ${pred.days} dias com ofertas válidas, de ${br(pred.first)} a ${br(pred.last)}. Na primeira observação, Sell Offers estavam em ${fmt(pred.firstAsk)} e Buy Offers em ${fmt(pred.firstBid)} gp/TC; na última, em ${fmt(pred.ask)} e ${fmt(pred.bid)}, respectivamente. São pontos observados de um mundo anterior à fusão, sem ajuste de composição. O cenário de Terribra parte somente de Terribra; não usamos a sucessão de nomes como continuidade automática de preços. Selecione Terribra acima para ver também o gráfico de Obscubra, logo abaixo.</p></div>
    <div id="card-predecessor"></div>
  </section>`;

  // ---- 06 validation
  html += `
  <section class="block" id="s06">
    <h2><span class="num">06</span>Os testes favorecem a combinação no curto prazo; o ciclo anual continua incerto</h2>
    <div class="prose">
      <p>As origens avançam trimestralmente, sem usar observações futuras no ajuste. O quadro apresenta o erro percentual absoluto médio nas ofertas de Antica, para os mesmos alvos de cada ponta e horizonte. Os pesos do conjunto são iguais em log-preços; não foram otimizados para maximizar o resultado do teste.</p>
      <p>A contagem de origens é pequena e os períodos se sobrepõem. Esses números comparam modelos nesta amostra; não demonstram desempenho estável no próximo ciclo. As faixas de estresse foram construídas com esses erros, portanto não constituem validação independente de cobertura. A calibração probabilística da seção 04 usa origens quinzenais e outro modelo.</p>
    </div>
    ${card({title: 'Erro médio fora do ajuste · Antica · %', sub: 'Erro percentual absoluto médio (MAPE)', body: table({columns: [num('horizon', 'Semanas'), {key: 'side', label: 'Ponta', render: v => SIDES[v]}, num('n', 'Origens'), num('constant', 'Constante', 2), num('seasonal', 'Sazonal', 2), num('harmonic', 'Harmônico', 2), num('ensemble', 'Conjunto', 2)], rows: summaries})})}
  </section>`;

  // ---- 07 cycles & seasonality
  html += `
  <section class="block" id="s07">
    <h2><span class="num">07</span>O histórico sugere sazonalidade, sem determinar a data de reversão</h2>
    <div class="prose"><p>O quadro usa extremos de <strong>medianas semanais de ofertas de Antica</strong> por ano civil. Uma máxima anual observada retrospectivamente não é um ponto de venda identificável em tempo real. O ano de 2026 está incompleto; não deve ser comparado a um ciclo encerrado como se ambos tivessem o mesmo horizonte. A seção 03 mede os mesmos ciclos sem o corte do ano civil, de pico a fundo e de fundo a pico.</p></div>
    ${card({title: 'Antica · extremos semanais observados', sub: 'gp/TC', body: table({columns: [{key: 'year', label: 'Ano', render: v => String(v)}, {key: 'side', label: 'Ponta', render: v => SIDES[v]}, {key: 'lowDate', label: 'Semana mínima', render: br}, num('low', 'Mínima'), {key: 'highDate', label: 'Semana máxima', render: br}, num('high', 'Máxima'), {key: 'complete', label: 'Período', render: v => v ? 'Ano completo' : 'Parcial'}], rows: R.cycles})})}
    <div id="card-season"></div>
  </section>`;

  // ---- 08 execution
  const makerByCycle = [...new Set(C.roundtripMaker.map(x => x.cycle))].map(c => {
    const rows = C.roundtripMaker.filter(x => x.cycle === c && x.world !== 'Antica');
    return {cycle: c, worlds: new Set(rows.map(r => r.world)).size, n: rows.length, accept: median(rows.map(r => r.acceptPct)), gross: median(rows.map(r => r.makerGrossPct)), net: median(rows.map(r => r.makerNetPct)), diff: median(rows.map(r => r.makerNetPct - r.acceptPct))};
  }).filter(c => c.n);
  const terWide = C.spread.worlds.find(w => w.world === 'Terribra' && ok(w.recentMedianPct) && w.nowPct > 1.5 * w.recentMedianPct);
  const cov = C.weekday.coverage, sparse = cov.filter(c => c.medianDaysPerWeek <= 2), dense = cov.filter(c => c.medianDaysPerWeek > 2).sort((a, b) => a.medianDaysPerWeek - b.medianDaysPerWeek);
  const wideNow = C.spread.worlds.filter(w => W[w.world].source === 'Captura' && ok(w.recentMedianPct) && w.nowPct > 1.5 * w.recentMedianPct).sort((a, b) => b.nowPct / b.recentMedianPct - a.nowPct / a.recentMedianPct);
  const wA = wd('Antica', 'ask'), wAb = wd('Antica', 'bid'), wB = wd('Mundos BR', 'ask'), wBb = wd('Mundos BR', 'bid');
  const monthFx = C.spread.anticaMonthEffect.map(x => x.effectPp);
  html += `
  <section class="block" id="s08">
    <h2><span class="num">08</span>A diferença entre as pontas reduz o resultado da venda e recompra</h2>
    <div class="prose">
      <p>Para quem já possui TC, o exercício vende aceitando <strong>Buy Offers</strong> e recompra aceitando <strong>Sell Offers</strong>. O ganho teórico em quantidade de TC é preço recebido na venda / preço pago na recompra − 1. A comparação usa a mediana do mês de venda e a mediana de maio a julho do ano seguinte, sem escolher o melhor dia retrospectivamente.</p>
      <p>O resultado é uma comparação de níveis observados, sem impacto de mercado ou garantia de Amount disponível. Criar uma Sell Offer acima das Buy Offers existentes exige que alguém a aceite; por isso não apresentamos a diferença entre preços como lucro assegurado de uma estratégia passiva. Os ciclos passados tiveram quedas; a seção 04 estima com que frequência a operação para junho de 2027 dá ganho.</p>
    </div>
    <div id="card-roundtrip"></div>
    <h3>Criar ofertas: o custo de 2%<span class="new">Novo</span></h3>
    <div class="prose">
      <p>O <a href="https://www.tibia.com/gameguides/?section=controls_trading&amp;subtopic=manual">manual oficial</a> informa que criar uma oferta custa <strong>2% do seu preço, com mínimo de 20 gp e máximo de 1.000.000 gp</strong>, e que ofertas valem por 30 dias. O teto só alivia ofertas acima de 50 milhões de gp, cerca de ${fmt(C.fee.capBindsAboveTc)} TC a ${price(antica.ask)}; os números abaixo valem para ofertas menores. Aceitar uma oferta existente não paga essa taxa.</p>
      <p>A variante abaixo cria uma Sell Offer ao nível mediano de Sell Offers do mês de venda e uma Buy Offer ao nível mediano de Buy Offers de maio a julho, pagando 2% em cada criação: ganho em TC = (Sell Offers × 0,98) / (Buy Offers × 1,02) − 1. Em Antica, onde a diferença entre as pontas é pequena, as taxas consomem a vantagem: nas ${makerDiffAntica.length} combinações de ciclo e mês, criar ofertas ficou entre ${pp(Math.min(...makerDiffAntica))} e ${pp(Math.max(...makerDiffAntica))} em relação a aceitar (2025–26, venda em novembro: ${sgn(makerAntica.makerNetPct)} contra ${sgn(makerAntica.acceptPct)}). Nos mundos brasileiros, com diferenças maiores entre as pontas, criar ofertas superou aceitar em ${makerBRWins} de ${makerBR.length} combinações (mediana de ${pp(median(makerBR.map(x => x.makerNetPct - x.acceptPct)))}). É um limite superior: supõe que as duas ofertas sejam executadas integralmente, e as medianas mensais dos mundos BR vêm de poucas leituras.</p>
    </div>
    <div class="grid2"><div id="card-maker"></div><div id="card-maker-all"></div></div>
    <h3>Diferença entre as pontas: agora e habitual<span class="new">Novo</span></h3>
    <div class="prose"><p>A perda de comprar e revender imediatamente (1 − Buy Offers / Sell Offers) nas capturas de 21 a 23/09 (a mais recente de cada mundo; Celebra: 21/09) é comparada às leituras da API dos 180 dias anteriores a 23/09. ${wideNow.length ? `Em ${list(wideNow.map(w => `${w.world} (${pctU(w.nowPct, 2)} contra mediana de ${pctU(w.recentMedianPct, 2)})`))}, a diferença atual supera em mais de 50% a habitual e está entre as ${pctU(Math.max(...wideNow.map(w => w.shareRecentAtLeastNow)) * 100, 0)} maiores leituras recentes: executar agora nesses mundos custa mais que o normal.` : ''} ${terWide ? `Terribra, sem captura, também aparece em destaque pela última leitura da API (${pctU(terWide.nowPct, 2)} em ${br(terWide.nowDate)}, contra mediana de ${pctU(terWide.recentMedianPct, 2)}).` : ''} Em Antica, a diferença atual (${pctU(antica.costPct, 2)}) está abaixo da habitual (${pctU(C.spread.worlds.find(w => w.world === 'Antica').recentMedianPct, 2)}). Cada captura é uma leitura única, em horário diferente das leituras da API; não indica quanto tempo a condição dura. Por mês do ano, descontado o nível de cada ano, a diferença em Antica varia só de ${pp(Math.min(...monthFx), 2)} a ${pp(Math.max(...monthFx), 2)}</p></div>
    <div id="card-spread"></div>
    <h3>Dia da semana: sem efeito aproveitável<span class="new">Novo</span></h3>
    <div class="prose"><p>O pacote recebido encontrou diferenças por dia da semana em médias diárias de negócios. Nas ofertas, a medida é o desvio de cada dia do servidor em relação à mediana dos sete dias ao redor. Em Antica, a diferença entre o dia mais caro e o mais barato é de ${pctU(wA.rangePct, 2)} em Sell Offers (p = ${fmt(wA.pBlock, 2)} permutando dentro de cada semana) e ${pctU(wAb.rangePct, 2)} em Buy Offers (p = ${fmt(wAb.pBlock, 2)}); corrigido para os quatro testes, nenhum p fica abaixo de ${fmt(Math.min(...C.weekday.tests.map(t => t.pHolm)), 2)}. Mesmo a maior diferença equivale a ${fmt(wAb.rangePct / 100 * antica.bid)} gp/TC, menos que a diferença entre as pontas e bem menos que a taxa de 2%. Os mundos BR raramente têm cotação em dias seguidos (mediana de 1 a 2 dias por semana em ${sparse.length} dos ${cov.length} mundos; ${list(dense.map(c => `${fmt(c.medianDaysPerWeek)} em ${c.world}`))}); com uma janela menos exigente (3 de 7 dias), ${Object.keys(wB.contributors).length} mundos somam ${fmt(wB.n)} dias, com p = ${fmt(wB.pBlock, 2)} e ${fmt(wBb.pBlock, 2)}. Nos BR a evidência é fraca, não negativa; em nenhum caso há base para escolher o dia da operação pelo calendário semanal.</p></div>
    <div id="card-weekday"></div>
  </section>`;

  // ---- 09 volatility & persistence
  const mo = C.momentum.ask, mob = C.momentum.bid, acf = mo.acf, strongUp = mo.conditional[0], allW = mo.conditional[2];
  const v23 = volY('ask', 2023), v24 = volY('ask', 2024), v25 = volY('ask', 2025), v26 = volY('ask', 2026);
  const volAsk = C.volatility.worlds.filter(x => x.side === 'ask' && x.world !== 'Luzibra' && ok(x.ratio)), ratios = volAsk.map(x => x.ratio);
  const topRatio = volAsk.reduce((a, b) => b.ratio > a.ratio ? b : a);
  const epi = strongUpRanges => { const season = strongUpRanges.filter(([a]) => +a.slice(5, 7) >= 7 && +a.slice(5, 7) <= 10).length; return [season, strongUpRanges.length - season]; };
  html += `
  <section class="block" id="s09">
    <h2><span class="num">09</span>Volatilidade em queda; persistência que se confunde com o calendário<span class="new">Novo</span></h2>
    <div class="prose">
      <p><strong>Volatilidade.</strong> Com um ponto por semana (o último dia do servidor com cotação), o desvio-padrão da variação semanal das Sell Offers de Antica foi ${list([v23, v24, v25].map(v => pctU(v.weeklyStdPct, 2)))} em 2023–25 e ${pctU(v26.weeklyStdPct, 2)} em 2026 (até setembro). O ano de 2026 é o mais calmo da série; a diferença é moderada, e a queda de 2024 para 2025 é menor em Buy Offers. Nos mundos brasileiros, medidos nas mesmas semanas que Antica, a variação semanal é ${fmt(Math.min(...ratios), 1)} a ${fmt(Math.max(...ratios), 1)} vezes a de Antica em Sell Offers — em parte porque o último dia cotado de cada semana varia nos mundos BR (1 a 2 dias com cotação por semana na maioria, ${list(dense.map(c => `${fmt(c.medianDaysPerWeek)} em ${c.world}`))}), contra cotação diária em Antica. A amostragem não explica tudo: ${topRatio.world}, com a maior razão (${fmt(topRatio.ratio, 1)}×), tem ${fmt(topRatio.medianDaysPerWeek)} dias com cotação por semana. Luzibra fica fora dessa faixa pela mudança de patamar de julho.</p>
      <p><strong>Persistência.</strong> Nas medianas semanais, a autocorrelação de uma semana é ${fmt(acf[0].rWeeklyMedian, 2)} em Sell Offers e ${fmt(mob.acf[0].rWeeklyMedian, 2)} em Buy Offers, mas isso vem sobretudo da própria mediana, que suaviza a série, e do ciclo anual. Com um ponto por semana e retirado o ciclo anual (dois harmônicos), nenhuma defasagem de 1 a 4 semanas sai da faixa de ruído de ±${fmt(mo.band, 2)} em Sell Offers (${list(acf.map(a => fmt(a.rDeseasonalised, 2)))}); a de uma semana, ${fmt(acf[0].rDeseasonalised, 2)}, é a esperada só pelo ruído de cotação (${fmt(mo.null.point[0].mean, 2)} numa simulação de passeio aleatório com esse ruído). Depois das ${fmt(strongUp.n)} semanas com as 20% maiores altas em quatro semanas (acima de ${sgn(mo.thresholdUpPct)}), as quatro seguintes tiveram mediana de ${sgn(strongUp.medianFwdPct)} e alta em ${prob(strongUp.shareUp)} dos casos, contra ${sgn(allW.medianFwdPct)} e ${prob(allW.shareUp)} em todas as semanas. Mas essas semanas vêm de ${strongUp.episodes} episódios, ${epi(strongUp.episodeRanges)[0]} deles iniciados entre julho e outubro, na temporada de alta${epi(strongUp.episodeRanges)[1] ? ` (os outros ${epi(strongUp.episodeRanges)[1]}, em ${list(strongUp.episodeRanges.filter(([a]) => !(+a.slice(5, 7) >= 7 && +a.slice(5, 7) <= 10)).map(([a]) => monthYear(a)))})` : ''}; os mesmos meses de outros anos já subiram em ${prob(strongUp.monthMatchedShareUp)} dos casos, e descontada a sazonalidade restam ${sgn(strongUp.seasonAdjMedianFwdPct)} de mediana e ${prob(strongUp.seasonAdjShareUp)} de altas. Com os episódios espaçados em pelo menos 21 dias, o teste sobre a variação descontada da sazonalidade dá p = ${fmt(strongUp.declusteredP, 2)} em Sell Offers e ${fmt(mob.conditional[0].declusteredP, 2)} em Buy Offers: evidência fraca de persistência além do calendário.</p>
      <p><strong>Agora.</strong> Da semana de 30/08 à captura de 23/09 (leitura única), as Sell Offers de Antica subiram ${sgn(mo.anchorPast4Pct)}, logo acima do limiar das 20% maiores altas de quatro semanas (${sgn(mo.thresholdUpPct)}); até a última cotação da API (${br(mo.historicalWeek)}), ${sgn(mo.historicalPast4Pct)}, abaixo dele.</p>
    </div>
    <div class="grid2"><div id="card-vol-year"></div><div id="card-acf"></div></div>
    <div class="grid2"><div id="card-vol-world"></div><div id="card-cond"></div></div>
  </section>`;

  // ---- 10 offers vs daily averages
  html += `
  <section class="block" id="s10">
    <h2><span class="num">10</span>Melhores ofertas e médias diárias não são a mesma série</h2>
    <div class="prose">
      <p>A comparação abaixo mede <strong>média diária do histórico / preço da oferta − 1</strong>, separadamente em cada ponta, nos dias em que ambos estão disponíveis. Valores negativos indicam médias abaixo da oferta diária comparável; positivos, acima. O <a href="https://tibiamarket.top/">TibiaMarket</a> identifica day_average_sell e day_average_buy como médias das últimas 24 horas. Essas estatísticas complementam as ofertas, mas a descrição pública não documenta a ponderação nem permite reconstruir cada negócio executado. As médias são atribuídas ao dia do servidor anterior à coleta, conforme a convenção do pacote recebido. Essa hipótese de data precisa ser confirmada com o provedor; ela não foi usada para deslocar as ofertas.</p>
      <p>O pareamento cobre até 12 meses, terminando em 23/09, com disponibilidade própria por mundo. A cotação é uma mediana de instantâneos e a média diária cobre um período: diferenças não provam erro, lucro capturável ou execução no melhor preço. <strong>As médias diárias não alimentam os modelos de ofertas.</strong> A coluna adicional de pareamento no dia da coleta permite avaliar a sensibilidade à hipótese de deslocamento temporal.</p>
    </div>
    ${card({title: 'Comparação entre mundos · diferença mediana das médias diárias para ofertas', sub: '%', body: table({columns: [{key: 'world', label: 'Mundo'}, num('askN', 'Dias · Sell Offers'), num('askGap', 'Sell Offers %', 2), num('bidN', 'Dias · Buy Offers'), num('bidGap', 'Buy Offers %', 2)],
      rows: worlds.map(w => { const a = R.tradeComparison.find(x => x.world === w.world && x.side === 'ask'), b = R.tradeComparison.find(x => x.world === w.world && x.side === 'bid'); return {world: w.world, askN: a?.n, askGap: a?.medianGapPct, bidN: b?.n, bidGap: b?.medianGapPct}; })})})}
    <div id="card-trade"></div>
  </section>`;

  // ---- 11 events
  html += `
  <section class="block" id="s11">
    <h2><span class="num">11</span>Eventos oferecem contexto; associações históricas não são efeitos causais</h2>
    <div class="prose">
      <p>O estudo foi refeito sobre ofertas de Antica. Compara a mediana dos sete dias após o início à dos sete dias anteriores (ao menos 3 observações em cada janela) e confronta a mudança com 2.000 sorteios de datas placebo do mesmo mês e ano. As datas históricas dos eventos vêm do pacote recebido. A correção de múltiplos testes inclui conjuntamente Buy Offers e Sell Offers.</p>
      <p>${strongest.length ? `Há ${strongest.length} resultados com q inferior a 5%, concentrados em ${[...new Set(strongest.map(x => x.event))].join(', ')}. O número reduzido de ocorrências e a sobreposição de janelas impedem transformar essa associação em regra de execução.` : 'Nenhum teste permanece abaixo de q = 5% após a correção conjunta.'} O preço futuro não recebe um ajuste arbitrário por evento. Os resultados servem para definir períodos de observação, não para atribuir uma causa exclusiva ao movimento.</p>
    </div>
    <div id="card-events"></div>
  </section>`;

  // ---- 12 calendar
  html += `
  <section class="block" id="s12">
    <h2><span class="num">12</span>Agenda de acompanhamento do próximo ciclo</h2>
    <div class="prose">
      <p>Os dois calendários fornecidos concordam nas datas dos eventos remanescentes. A base foi atualizada em ${br(R.calendarUpdated.slice(0, 10))}; a agenda futura permanece sujeita a alteração. A data final é exclusiva. O ICS posiciona os eventos às 08:00 ou 09:00 UTC, conforme o período do ano; o JSON usa marcadores de data.</p>
      <p>A seleção abaixo mantém eventos de maior duração ou interesse para o ciclo. Não foram inventadas datas para futuros eventos de XP, loot ou updates ausentes dos arquivos.</p>
    </div>
    ${card({title: 'Calendário fornecido · setembro de 2026 a setembro de 2027', body: table({columns: [{key: 'start', label: 'Início', render: br}, {key: 'endExclusive', label: 'Fim exclusivo', render: br}, {key: 'event', label: 'Evento'}], rows: R.calendar.filter(x => !['Full Moon', 'Last Creep Standing', "Valentine's Day"].includes(x.event))})})}
  </section>`;

  // ---- 13 method
  html += `
  <section class="block" id="s13">
    <h2><span class="num">13</span>Método, qualidade dos dados e limites de uso</h2>
    <div class="prose">
      <p><strong>Universo e relógio.</strong> O painel cobre os 16 mundos solicitados. O preço histórico usa sell_offer e buy_offer, com dia do servidor iniciado às 10h de Europe/Berlin. As capturas preservam a data fornecida, sem presumir um fuso ausente do arquivo. O corte das capturas é 23/09; a última oferta histórica varia por mundo. A data de execução da coleta não substitui a data da cotação. As medianas semanais cobrem de segunda a domingo e são rotuladas pelo domingo; os cenários da seção 02 avançam de sete em sete dias a partir da captura de 23/09 (quartas-feiras).</p>
      <p><strong>Higienização.</strong> Ausências, preços não positivos, quadros de ofertas cruzados e observações em que o preço em Buy Offers fica abaixo de 80% do preço em Sell Offers saem da modelagem. Esse último critério retira preços extremos, inclusive compras de 1 gp, mas também pode retirar quadros de ofertas reais muito abertos. Os dados brutos são preservados. Não há preenchimento de preços de negócio em lacunas nem filtro de mediana centrado que consulte o futuro.</p>
      <p><strong>Inferência.</strong> A regressão usa log-preço, tendência linear e dois pares seno/cosseno com período anual, em até 130 semanas anteriores. A trajetória é ancorada na oferta atual. O modelo sazonal repete a variação entre datas deslocadas 52 semanas; aceita a observação mais próxima até dez dias apenas dentro do treinamento. O conjunto faz média geométrica dos modelos disponíveis. A transferência por mundo conserva a relação inicial entre ofertas da mesma ponta e acrescenta estresse pelo prêmio local.</p>
      <p><strong>Faixas.</strong> Usa-se o maior entre o percentil 80 do erro absoluto em log no horizonte histórico mais próximo e a divergência dos modelos. Soma-se, no mundo local, o percentil 80 da variação absoluta do prêmio em 13 semanas; quando há menos de cinco pares, usa-se sua dispersão em níveis. É uma regra conservadora de cenários, não estimação de quantis futuros. A incerteza de uma fusão não é mensurável por esse mecanismo.</p>
      <p><strong>Complemento (<code>complement.py</code>).</strong> Usa as mesmas regras de limpeza, o mesmo dia do servidor e as mesmas semanas; o programa confere que suas séries semanais são idênticas às publicadas antes de calcular, e todos os sorteios têm semente, de modo que uma nova execução reproduz <code>complement.json</code> byte a byte. Pontos de virada: regra de reversão de 5% do pacote sobre medianas semanais; pernas com menos de ${C.swings.minLegWeeks} semanas contam como oscilação dentro de uma fase. Probabilidades: tendência, dois harmônicos anuais e erros ARIMA(1,1,0) em log-preço semanal, com 300 sorteios de parâmetros e 20 trajetórias por sorteio; calibração em origens quinzenais com reestimação a cada origem, comparada a duas regras simples. Volatilidade, persistência e liderança entre mundos: um ponto por semana, nunca a mediana semanal. Dia da semana: desvio em relação à mediana centrada de sete dias (medida descritiva, que usa dias vizinhos dos dois lados), permutação dentro de cada semana e correção de Holm. Prêmio: calculado em log(preço do mundo / preço de Antica) e exibido como preço do mundo / preço de Antica − 1, mesma ponta e semana; o prêmio atual é a mediana dos pares de capturas feitas no mesmo dia; uma mudança de patamar de pelo menos ${15}% separa a série (Luzibra). Criação de ofertas: taxa de 2% do manual oficial em cada criação, sem garantia de execução.</p>
      <p><strong>Rupturas e fontes.</strong> <a href="https://www.tibia.com/news/?id=8513&amp;subtopic=newsarchive">A CipSoft anunciou Obscubra e Jacabra como predecessores de Terribra</a>. A consulta direta à API recuperou o histórico de Obscubra; ele é apresentado separadamente, sem concatenar preços dos mundos anteriores à série de Terribra. <a href="https://www.tibia.com/news/?subtopic=latestnews">O anúncio “Game World Merge Announcement”, de 21/09/2026, inclui Luzibra na futura Deslumbra</a>, com 22/10 como primeira data possível. A mesma página oficial registra ajustes de geração de gold em setembro; o efeito sobre TC não foi identificado isoladamente nesta amostra.</p>
      <p><strong>Revisão das fontes anteriores.</strong> O README e o aplicativo Tibinance usam Sell Offers e Buy Offers. O pacote de análise enviado em ZIP combinava campos distintos: o índice principal usava day_average_sell/day_average_buy; a extensão de 2023 usava o ponto médio de sell_offer/buy_offer; e as capturas recentes também eram ofertas. Nesta edição, todos os modelos, cenários, probabilidades e estatísticas de preço usam exclusivamente as melhores ofertas de cada ponta. Os números do pacote (índice, probabilidades, estabilidade entre sementes e caso de falha) aparecem apenas como referência comparativa na seção 04; suas conclusões de ciclos, persistência, dia da semana e eventos foram refeitas sobre ofertas. Do pacote, reaproveitaram-se somente as datas históricas de eventos, sujeitas à qualidade da fonte. Fora da coluna de referência do pacote na seção 04, as médias diárias aparecem apenas no diagnóstico comparativo da seção 10; a ponderação das médias e o alinhamento temporal exato não foram confirmados pelo provedor.</p>
      <p>Fontes: capturas fornecidas, consulta direta à <a href="https://api.tibiamarket.top/docs">API pública do TibiaMarket</a>, calendários JSON/ICS, anúncios e manual da CipSoft. O <a href="https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle">pacote de reprodução</a> preserva entradas, hashes, transformações e resultados. Relatório independente da Tibinance; sem afiliação à CipSoft ou ao TibiaMarket.</p>
    </div>
    ${card({title: 'Cobertura e exclusões da modelagem', body: table({columns: [{key: 'world', label: 'Mundo'}, num('days', 'Dias de ofertas'), num('missingBook', 'Sem quadro de ofertas'), num('crossed', 'Cruzados'), num('wideSpread', 'Diferença >20%'), {key: 'first', label: 'Primeira oferta', render: br}, {key: 'last', label: 'Última oferta', render: br}], rows: R.quality})})}
  </section>
  <footer>
    <p>Relatório gerado a partir de <a href="results.json">results.json</a> (analyze.py, compare_trades.py) e <a href="complement.json">complement.json</a> (complement.py). Hashes de todas as entradas estão nos próprios arquivos; <code>validate.py</code> reconfere aritmética, cronologia, ausência de dados futuros e a reprodução do complemento.</p>
    <p>Não é recomendação de investimento. Tibia e Tibia Coins são marcas da CipSoft GmbH.</p>
  </footer>`;

  root.innerHTML = html;
  root.setAttribute('aria-busy', 'false');

  // ---------------------------------------------------------------- dynamic blocks
  const hist = world => R.history.filter(x => x.world === world);
  const anticaHist = hist('Antica');
  const LEG = {ask: '<span><i class="sw ask"></i>Sell Offers</span>', bid: '<span><i class="sw bid"></i>Buy Offers</span>'};

  // 02 · model chart
  on(() => {
    const s = state.side, f = R.forecast.filter(x => x.side === s), recent = anticaHist.filter(x => x.date >= '2025-06-01');
    document.getElementById('card-model').innerHTML = card({title: `Antica · ${SIDES[s]} · cenários em gp/TC`, sub: 'Histórico semanal desde junho de 2025, captura de 23/09 e 52 semanas de cenário', controls: sideControl(), body: '<div class="chart" id="ch-model"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: br}, num('constant', 'Constante'), num('seasonal', 'Sazonal'), num('harmonic', 'Harmônico'), num('base', 'Central'), num('low', 'Estresse de baixa'), num('high', 'Estresse de alta')], rows: f})});
    chart('ch-model', host => lineChart(host, {
      aria: `Antica, ${SIDES[s]}: histórico semanal e cenários até setembro de 2027`,
      legend: `<span><i class="sw ${s}"></i>Histórico semanal</span><span><i class="sw ink"></i>Cenário central</span><span><i class="sw band-${s}"></i>Faixa de estresse</span>`,
      series: [{label: 'Histórico', cls: `c-${s}`, points: recent.map(x => [x.date, x[s]])}, {label: 'Cenário central', cls: 'c-ink', points: f.map(x => [x.date, x.base])}],
      bands: [{label: 'Estresse', cls: `c-${s} o2`, points: f.map(x => [x.date, x.low, x.high])}],
      markers: [{x: antica.date, y: antica[s], label: `Captura ${fmt(antica[s])}`, cls: 'c-ink'}],
    }));
  }, ['side']);

  // 03 · pivots chart
  on(() => {
    const s = state.side, sw = SW[s], c = sw.current;
    document.getElementById('card-pivots').innerHTML = card({title: `Antica · ${SIDES[s]} · pontos de virada`, sub: 'Medianas semanais; picos e fundos confirmados por recuo de 5%', controls: sideControl(), body: '<div class="chart" id="ch-pivots"></div>',
      drawer: table({columns: [{key: 'type', label: 'Tipo', render: v => v === 'P' ? 'Pico' : 'Fundo'}, {key: 'date', label: 'Semana', render: br}, num('level', 'Nível')], rows: sw.pivots})});
    chart('ch-pivots', host => lineChart(host, {
      height: 300, aria: `Antica, ${SIDES[s]}, medianas semanais com picos e fundos marcados`,
      legend: `${LEG[s]}<span><i class="sw dot" style="background:var(--ink)"></i>Pico ou fundo confirmado</span><span><i class="sw ring" style="color:var(--ink)"></i>Captura de 23/09</span>`,
      series: [{label: SIDES[s], cls: `c-${s}`, points: anticaHist.map(x => [x.date, x[s]])}],
      markers: [...sw.pivots.map((p, i) => ({x: p.date, y: p.level, label: i === 0 ? '' : host.clientWidth < 560 ? `${MONTHS[+p.date.slice(5, 7) - 1].replace('.', '')}/${p.date.slice(2, 4)}` : `${p.type === 'P' ? 'pico' : 'fundo'} ${monthYear(p.date)}`, pos: p.type === 'P' ? 'above' : 'below', cls: 'c-ink', r: 3.5})),
        {x: c.end, y: c.endLevel, label: `${sgn(c.changePct)} desde o fundo`, hollow: true, cls: 'c-ink', r: 4.5}],
    }));
  }, ['side']);

  // 04 · fan, probability table, round trip, anchor, seeds, calibration
  on(() => {
    const s = state.side, fan = P.fan.filter(f => f.side === s && f.sample === 'main'), fan24 = P.fan.filter(f => f.side === s && f.sample === 'since2024');
    const f = R.forecast.filter(x => x.side === s), recent = anticaHist.filter(x => x.date >= '2025-06-01');
    document.getElementById('card-fan').innerHTML = card({title: `Antica · ${SIDES[s]} · distribuição simulada`, sub: 'Treino desde 2023, semente 11: faixas de 10–90% e 25–75% de 6.000 trajetórias. Linhas tracejadas: mediana com treino desde 2024 e cenário central da seção 02', controls: sideControl(), body: '<div class="chart" id="ch-fan"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: br}, num('p10', 'P10'), num('p25', 'P25'), num('p50', 'P50'), num('p75', 'P75'), num('p90', 'P90'), num('p50b', 'P50 · desde 2024')], rows: fan.map((x, i) => ({...x, p50b: fan24[i]?.p50}))})});
    chart('ch-fan', host => lineChart(host, {
      height: 300, aria: `Distribuição simulada de ${SIDES[s]} em Antica até setembro de 2027`,
      legend: `<span><i class="sw ${s}"></i>Histórico</span><span><i class="sw ink"></i>Mediana · desde 2023</span><span><i class="sw band-${s}"></i>25–75% e 10–90%</span><span><i class="sw dashed"></i>Mediana · desde 2024 e central da seção 02</span>`,
      series: [{label: 'Histórico', cls: `c-${s}`, points: recent.map(x => [x.date, x[s]])}, {label: 'Mediana · desde 2023', cls: 'c-ink', points: fan.map(x => [x.date, x.p50])},
        {label: 'Mediana · desde 2024', cls: 'c-ink', dash: true, thin: true, points: fan24.map(x => [x.date, x.p50])}, {label: 'Central (seção 02)', cls: 'c-muted', dash: true, thin: true, points: f.map(x => [x.date, x.base])}],
      bands: [{label: '10–90%', cls: `c-${s} o1`, points: fan.map(x => [x.date, x.p10, x.p90])}, {label: '25–75%', cls: `c-${s} o2`, points: fan.map(x => [x.date, x.p25, x.p75])}],
      markers: [{x: antica.date, y: antica[s], label: `Partida ${fmt(antica[s])}`, cls: 'c-ink'}],
    }));

    const m = run(s, 'main'), s24 = run(s, 'since2024'), rm = P.sides[s].main.seedRange, r24 = P.sides[s].since2024.seedRange;
    const EVENTS = [
      ['peakAbove3', 'peak_above_start_plus3', 'p_peak_gt3', 'Máximo até 28/02/2027 pelo menos 3% acima da partida'],
      ['peakAfterOct31', 'peak_after_oct31', 'p_peak_after_oct31', 'Máximo a partir da semana de 02/11/2026'],
      ['nov30AboveStart', 'nov30_above_start', null, 'Semana de 30/11/2026 acima da partida'],
      ['jun28BelowStart', 'jun28_below_start', 'p_jun27_below', 'Semana de 28/06/2027 abaixo da partida'],
      ['troughAbove2026', 'trough2027_above_trough2026', 'p_trough_above_2026', 'Mínimo de mar.–set. 2027 acima do mínimo de 2026'],
      ['jun28BelowNov30', 'jun28_below_nov30', null, 'Semana de 28/06/2027 abaixo da de 30/11/2026'],
    ];
    const rng = r => Math.round(r[0] * 100) !== Math.round(r[1] * 100) ? ` <span class="dim">(${fmt(r[0] * 100, 0)}–${fmt(r[1] * 100, 0)})</span>` : '';
    const rows = EVENTS.map(([k, pk, stk, label]) => ({label, main: prob(m.prob[k]) + rng(rm[k]), s24: prob(s24.prob[k]) + rng(r24[k]), pkg: prob(PK.prob[pk]) + (stk ? rng(PK.stabilityRange[stk]) : '')}));
    const lv = a => `${fmt(a[1])} <span class="dim">(${fmt(a[0])}–${fmt(a[2])})</span>`;
    rows.push({label: 'Máximo · mediana (P10–P90), gp/TC', main: lv(m.peakLevel), s24: lv(s24.peakLevel), pkg: lv(PK.peak.level_p10_p50_p90)});
    // The package labels a week by its Monday; shown here by the Sunday that ends it, like the offer columns.
    const pkgWeek = iso => new Date(ms(iso) + 6 * 864e5).toISOString().slice(0, 10);
    rows.push({label: 'Semana mediana do máximo (domingo)', main: br(m.peakDate[1]), s24: br(s24.peakDate[1]), pkg: br(pkgWeek(PK.peak.date_p10_p50_p90[1]))});
    const months = x => `${prob(1 - x.peakMonthShare.novDez - x.peakMonthShare.janFev)} / ${prob(x.peakMonthShare.novDez)} / ${prob(x.peakMonthShare.janFev)}`;
    rows.push({label: 'Máximo em semanas iniciadas até out. / em nov.–dez. / em jan.–fev.', main: months(m), s24: months(s24), pkg: '—'});
    rows.push({label: 'Mínimo de mar.–set. 2027 · mediana (P10–P90), gp/TC', main: lv(m.troughLevel), s24: lv(s24.troughLevel), pkg: lv(PK.trough.level_p10_p50_p90)});
    rows.push({label: 'Semana mediana do mínimo (domingo)', main: br(m.troughDate[1]), s24: br(s24.troughDate[1]), pkg: br(pkgWeek(PK.trough.date_p10_p50_p90[1]))});
    rows.push({label: 'Partida', main: `${fmt(m.start)} (${brShort(antica.date)})`, s24: `${fmt(s24.start)} (${brShort(antica.date)})`, pkg: `${fmt(PK.start.level)} (${brShort(PK.start.date)}, índice)`});
    document.getElementById('card-prob').innerHTML = card({title: `Probabilidades e níveis · ${SIDES[s]}`, sub: `Semente 11; entre parênteses, mínimo e máximo das quatro sementes quando diferem. Mínimo de 2026 nas ofertas: ${fmt(P.spec.trough2026[s])} (${br(P.spec.trough2026Date[s])})`, controls: sideControl(),
      body: table({columns: [{key: 'label', label: 'Evento', wrap: true}, {key: 'main', label: 'Ofertas · desde 2023', num: true}, {key: 's24', label: 'Ofertas · desde 2024', num: true}, {key: 'pkg', label: 'Pacote · médias diárias', num: true}], rows,
        caption: 'O pacote não é diretamente comparável: um único índice de médias diárias de Sell Offers de 71 mundos (a coluna é a mesma nas duas pontas) e partida em 21/09. As datas do pacote, rotuladas pela segunda-feira, aparecem aqui pelo domingo que encerra a semana, como nas colunas de ofertas.'})});
  }, ['side']);
  document.getElementById('card-roundtrip-sim').innerHTML = card({title: 'Vender agora, recomprar na semana de 28/06/2027', sub: `Antica; mesmas trajetórias (semente 11). Aceitando: vende a ${fmt(antica.bid)}, recompra às Sell Offers simuladas`, body: table({columns: [
    {key: 'sample', label: 'Treino', render: v => v === 'main' ? 'desde 2023' : 'desde 2024'}, {key: 'mode', label: 'Execução'}, {key: 'pGain', label: 'Com ganho em TC', num: true, render: v => prob(v)},
    {key: 'gainPct', label: 'Ganho P10 / P50 / P90', num: true, render: v => v.map(x => sgn(x)).join(' / ')}], rows: P.roundtrip,
    caption: 'Criando ofertas: vende às Sell Offers de hoje × 0,98 e recompra às Buy Offers simuladas × 1,02, supondo execução integral.'})});
  document.getElementById('card-anchor').innerHTML = card({title: 'Sensibilidade à captura de partida', sub: `Sell Offers, treino desde 2023, semente 11; limiares fixos na captura de 23/09 (${fmt(antica.ask)})`, body: table({columns: [
    {key: 'capture', label: 'Captura', render: br}, num('anchor', 'Partida'), num('peakP50', 'Máximo mediano'), num('troughP50', 'Mínimo mediano'),
    {key: 'pPeakAbove3OfReference', label: `Máximo > ${fmt(Math.round(antica.ask * 1.03))}`, num: true, render: v => prob(v)}, {key: 'pJun28BelowReference', label: `Junho < ${fmt(antica.ask)}`, num: true, render: v => prob(v)}], rows: anchorRows})});
  on(() => {
    const s = state.side;
    const seedRows = PK.stability.map((p, i) => { const o = P.sides[s].main.runs[i], o24 = P.sides[s].since2024.runs[i]; return {seed: p.seed, a: prob(p.p_peak_gt3), b: prob(p.p_jun27_below), c: prob(p.p_trough_above_2026), e: prob(o.prob.peakAbove3), g: prob(o.prob.jun28BelowStart), h: prob(o.prob.troughAbove2026), i: prob(o24.prob.peakAbove3), j: prob(o24.prob.jun28BelowStart), k: prob(o24.prob.troughAbove2026)}; });
    document.getElementById('card-seeds').innerHTML = card({title: 'Estabilidade entre sementes', sub: `Pacote (forecast_stability.json) × ofertas, ${SIDES[s]}: máximo ≥ +3% · junho abaixo da partida · mínimo de 2027 acima do de 2026`, controls: sideControl(), body: table({columns: [{key: 'seed', label: 'Semente', num: true, render: v => String(v)},
      {key: 'a', label: 'Pacote · ≥+3%', num: true}, {key: 'b', label: 'junho', num: true}, {key: 'c', label: 'mínimo', num: true},
      {key: 'e', label: 'Desde 2023 · ≥+3%', num: true}, {key: 'g', label: 'junho', num: true}, {key: 'h', label: 'mínimo', num: true},
      {key: 'i', label: 'Desde 2024 · ≥+3%', num: true}, {key: 'j', label: 'junho', num: true}, {key: 'k', label: 'mínimo', num: true}], rows: seedRows,
      caption: `Com 6.000 trajetórias independentes, o erro de simulação seria de ~${fmt(PK.mcErrorPp.p_jun27_below[0], 1)} p.p.; como elas saem de 300 sorteios de parâmetros, pode chegar a ~${fmt(PK.mcErrorPp.p_jun27_below[1], 1)} p.p. A amostra de treino muda mais que qualquer semente.`})});
    document.getElementById('card-calib').innerHTML = card({title: 'Calibração fora da amostra · treino desde 2023', sub: `Origens quinzenais, ${SIDES[s]}; ideal: 50% e 80% dentro dos intervalos`, controls: sideControl(), body: table({columns: [num('horizon', 'Semanas'), num('n', 'Origens'), num('windows', 'Janelas sem sobreposição'),
      {key: 'cov50', label: 'Dentro de 50%', num: true, render: v => prob(v)}, {key: 'cov80', label: 'Dentro de 80%', num: true, render: v => prob(v)},
      {key: 'meanPUp', label: 'P(alta) média', num: true, render: v => prob(v)}, {key: 'freqUp', label: 'Altas observadas', num: true, render: v => prob(v)},
      num('brier', 'Brier · modelo', 2), num('brierSeasonal', 'Brier · ano anterior', 2), num('brierClimate', 'Brier · frequência histórica', 2), num('mapePct', 'Erro da mediana %', 1)],
      rows: P.calibration.filter(c => c.side === s), caption: 'Brier menor é melhor; palpite fixo de 50%: 0,25. “Ano anterior”: repete a direção do mesmo intervalo um ano antes. “Frequência histórica”: fração de altas no mesmo horizonte até a origem.'})});
  }, ['side']);

  // 05 · world blocks
  document.getElementById('world-select').addEventListener('change', e => set('world', e.target.value));
  on(() => {
    const w = state.world, s = state.side, sel = W[w], h = hist(w), wf = R.worldForecast.filter(x => x.world === w);
    document.getElementById('card-world-history').innerHTML = card({title: `${w} · ofertas históricas semanais (gp/TC)`, sub: `${fmt(sel.weeks)} semanas com ofertas; lacunas não são interpoladas`, body: '<div class="chart" id="ch-wh"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: br}, num('bid', 'Buy Offers'), num('ask', 'Sell Offers')], rows: h.filter(x => ok(x.ask))})});
    chart('ch-wh', host => lineChart(host, {height: 260, aria: `${w}: medianas semanais de Sell Offers e Buy Offers`, legend: LEG.ask + LEG.bid,
      series: [{label: 'Sell Offers', cls: 'c-ask', points: h.map(x => [x.date, x.ask])}, {label: 'Buy Offers', cls: 'c-bid', points: h.map(x => [x.date, x.bid])}]}));
    const wp = wf.filter(x => x.side === s);
    document.getElementById('card-world-projection').innerHTML = card({title: `${w} · ${SIDES[s]} · cenários condicionais (gp/TC)`, sub: [...new Set(wp.map(x => x.status))].join(' → '), body: '<div class="chart" id="ch-wp"></div>',
      drawer: table({columns: [{key: 'date', label: 'Semana', render: br}, num('base', 'Central'), num('low', 'Baixa'), num('high', 'Alta'), {key: 'status', label: 'Condição'}], rows: wp})});
    chart('ch-wp', host => lineChart(host, {height: 260, aria: `${w}: cenário condicional de ${SIDES[s]}`,
      legend: `<span><i class="sw ink"></i>Cenário central</span><span><i class="sw band-${s}"></i>Faixa de estresse</span>`,
      series: [{label: 'Cenário central', cls: 'c-ink', points: wp.map(x => [x.date, x.base])}], bands: [{label: 'Estresse', cls: `c-${s} o2`, points: wp.map(x => [x.date, x.low, x.high])}],
      vlines: w === 'Luzibra' ? [{x: '2026-10-22', label: 'fusão: 1ª data possível'}] : [],
      markers: [{x: sel.date, y: sel[s], label: `Âncora ${fmt(sel[s])}`, cls: 'c-ink'}]}));
    const rows = MILESTONES.map(d => { const a = wf.find(x => x.side === 'ask' && x.date === d), b = wf.find(x => x.side === 'bid' && x.date === d); return {date: d, ask: a?.base, bid: b?.base, low: a?.low, high: a?.high, status: a?.status}; });
    document.getElementById('card-scenario-table').innerHTML = card({title: `${w} · marcos do ciclo (gp/TC)`, body: table({columns: [{key: 'date', label: 'Marco', render: v => MNAME[v]}, num('bid', 'Buy Offers · central'), num('ask', 'Sell Offers · central'), num('low', 'Sell Offers · baixa'), num('high', 'Sell Offers · alta'), {key: 'status', label: 'Condição'}], rows})});
    document.getElementById('selected-context').innerHTML = `<p><strong>${w}:</strong> âncora em ${br(sel.date)} (${sel.source.toLowerCase()}); ${fmt(sel.days)} dias de ofertas históricas válidas. ${w === 'Luzibra' ? `Sem números a partir de 28/10 (22/10 é a primeira data possível da fusão): os preços de Deslumbra ainda não são observados. A faixa de estresse das semanas anteriores ainda incorpora a mudança de patamar de julho no prêmio local, por isso já começa larga.` : w === 'Terribra' ? 'A cotação tem 22 dias de defasagem em relação ao corte; o ajuste posterior depende de Antica e não é uma atualização observada de Terribra.' : w === 'Antica' ? 'Antica é a referência: as faixas são as da seção 02, sem estresse de prêmio local.' : 'As faixas incorporam a instabilidade histórica do prêmio local; não garantem que a relação entre os mundos persistirá.'}</p>`;
    const ph = hist('Obscubra');
    document.getElementById('card-predecessor').innerHTML = w === 'Terribra' ? card({title: 'Obscubra · histórico anterior à fusão (gp/TC)', body: '<div class="chart" id="ch-obs"></div>'}) : '';
    if (w === 'Terribra') chart('ch-obs', host => lineChart(host, {height: 240, aria: 'Obscubra: medianas semanais antes da fusão', legend: LEG.ask + LEG.bid,
      series: [{label: 'Sell Offers', cls: 'c-ask', points: ph.map(x => [x.date, x.ask])}, {label: 'Buy Offers', cls: 'c-bid', points: ph.map(x => [x.date, x.bid])}]}));
    document.querySelectorAll('.dossier').forEach(d => d.classList.toggle('on', d.dataset.world === w));
  });

  // 05 · relative value
  const cwRows = side => C.crossWorld.worlds.filter(x => x.side === side);
  const gq = (side, g) => C.crossWorld.groupsByQuarter.filter(x => x.side === side && x.group === g);
  const green = 'Optional PvP · BattlEye Green';
  const greenQ = gq('ask', green), yellowQ = gq('ask', Y);
  // The daily readings around the break: the last one still near the old level and the first near the new one.
  const luzDaily = luz.breakDaily || [], nearNew = d => Math.abs(d.premiumPct - luz.recentPremiumPct) < Math.abs(d.premiumPct - luz.preBreak8Pct);
  const iNew = luzDaily.findIndex(nearNew), luzAfter = luzDaily[iNew], luzBefore = iNew > 0 ? luzDaily[iNew - 1] : null;
  const corr = cwRows('ask').filter(x => ok(x.corrWeekly) && x.world !== 'Luzibra').map(x => x.corrWeekly);
  const lag0 = C.crossWorld.leadLag.find(x => x.side === 'ask' && x.lag === 0);
  // Day-to-day change of the same-day capture premium, across worlds and sides: how noisy one capture is.
  const capSteps = C.crossWorld.worlds.flatMap(x => (x.currentPairs || []).slice().sort((a, b) => a.date < b.date ? -1 : 1).map(p => p.premiumPct).flatMap((v, k, a) => k ? [Math.abs(v - a[k - 1])] : []));
  const belobra24 = yellowQ.filter(q => q.quarter.startsWith('2024')).map(q => q.medianPremiumPct);
  const green25 = greenQ.find(q => q.quarter === '2025-T2'), dU = ['Descubra', 'Ustebra'].map(w => C.crossWorld.worlds.find(x => x.world === w && x.side === 'ask'));
  const offLag = Math.max(...C.crossWorld.leadLag.filter(x => x.lag !== 0).map(x => x.r));
  document.getElementById('relative-prose').innerHTML = `
    <p>Prêmio = preço do mundo / preço de Antica − 1, na mesma ponta e na mesma semana (medianas semanais). O prêmio atual é a mediana dos pares de capturas feitas no mesmo dia em 21, 22 e 23/09, cada captura contra a de Antica daquele dia; Terribra, sem captura, usa seu último histórico contra Antica no mesmo dia. As capturas são leituras isoladas: a mesma comparação muda em média ${fmt(capSteps.reduce((a, b) => a + b, 0) / capSteps.length, 1)} p.p. de um dia para o outro (até ${fmt(Math.max(...capSteps), 0)} p.p.).</p>
    <p><strong>Um grupo se destaca.</strong> Belobra, Celebra, Gentebra e Luminera — os quatro mundos Optional PvP com BattlEye Yellow do painel — tiveram prêmio mediano de ${sgn(yA.recentMedianPct)} em Sell Offers e ${sgn(yB.recentMedianPct)} em Buy Offers nas últimas 26 semanas; os demais grupos, entre ${sgn(Math.min(...others.map(g => g.recentMedianPct)))} e ${sgn(Math.max(...others.map(g => g.recentMedianPct)))} em Sell Offers. Com quatro mundos, tipo de PvP, BattlEye e idade do mundo se confundem: o agrupamento descreve, não explica. Prêmios assim já encolheram: Belobra negociava entre ${sgn(Math.min(...belobra24), 0)} e ${sgn(Math.max(...belobra24), 0)} acima de Antica nos trimestres de 2024, e Descubra e Ustebra, os dois Optional PvP com BattlEye Green com histórico em 2025, cerca de ${sgn(green25?.medianPremiumPct, 0)} no segundo trimestre de 2025, contra ${list(dU.map(x => sgn(x.recentPremiumPct)))} nas últimas 26 semanas.</p>
    <p><strong>O prêmio encolheu nas últimas semanas.</strong> O grupo passou de ${sgn(yA.recentMedianPct)} (26 semanas) para ${sgn(yA.last8MedianPct)} nas oito semanas até ${br(luzLast)} e ${sgn(yA.currentMedianPct)} nas capturas, em Sell Offers; em Buy Offers, ${sgn(yB.recentMedianPct)}, ${sgn(yB.last8MedianPct)} e ${sgn(yB.currentMedianPct)}. A alta recente de Antica não foi acompanhada na mesma proporção. Se a relação habitual voltasse, esses mundos subiriam mais que Antica ou Antica recuaria; a série curta não permite dizer qual, nem quando.</p>
    <p><strong>Luzibra mudou de patamar.</strong> Seu desconto em Sell Offers — ${fmt(Math.abs(luz.preBreak8Pct))}% na mediana das oito semanas até ${br(luz.preBreak8End)}, ${fmt(Math.abs(luz.preBreakMedianPct))}% em todo o período anterior — desapareceu na semana de ${br(luz.breakWeek)}${luzBefore && luzAfter ? ` (${sgn(luzBefore.premiumPct, 0)} em ${brShort(luzBefore.date)}; ${sgn(luzAfter.premiumPct, 1)} em ${brShort(luzAfter.date)})` : ''}; desde então fica perto de zero (${sgn(luz.recentPremiumPct)}). A mudança antecede em cerca de ${Math.round((Date.parse('2026-09-21') - Date.parse(luz.breakWeek)) / 6048e5)} semanas o anúncio da fusão; os dados não identificam a causa. Na comparação de valor relativo, Luzibra é medida só no novo patamar e fica fora do gráfico; a faixa de estresse do seu cenário nesta seção ainda incorpora a ruptura. <strong>Comovimento:</strong> a correlação das variações semanais com Antica vai de ${fmt(Math.min(...corr), 2)} a ${fmt(Math.max(...corr), 2)} por mundo; o agregado brasileiro acompanha Antica sobretudo na mesma semana (r = ${fmt(lag0.r, 2)}); correlações em outras defasagens aparecem nos dois sentidos (até ${fmt(offLag, 2)}), sem liderança consistente de um lado.</p>`;
  on(() => {
    const s = state.side, rows = cwRows(s).filter(x => x.world !== 'Luzibra' && ok(x.last8PremiumPct)).sort((a, b) => b.recentPremiumPct - a.recentPremiumPct);
    const col = s === 'ask' ? 'a' : 'b';
    document.getElementById('card-premium-chart').innerHTML = card({title: `Prêmio sobre Antica · ${SIDES[s]}`, sub: 'Anel: mediana das últimas 8 semanas de histórico · ponto: capturas de 21–23/09', controls: sideControl(), body: '<div class="chart" id="ch-prem"></div>'});
    chart('ch-prem', host => dumbbell(host, {cls: `c-${s}`, aLabel: 'últimas 8 semanas', bLabel: 'capturas', aria: `Prêmio de cada mundo sobre Antica em ${SIDES[s]}`,
      legend: `<span><i class="sw ring" style="color:var(--chart-${col})"></i>Últimas 8 semanas</span><span><i class="sw dot" style="background:var(--chart-${col})"></i>Capturas</span>`,
      rows: rows.map(x => ({label: x.world, a: x.last8PremiumPct, b: x.currentPremiumPct}))}));
    document.getElementById('card-groups').innerHTML = card({title: `Prêmio por grupo · ${SIDES[s]}`, sub: 'Medianas entre mundos, %; Luzibra e Terribra excluídas', body: table({columns: [{key: 'group', label: 'Grupo', wrap: true}, {key: 'worlds', label: 'Mundos', wrap: true, render: v => v.join(', ')}, signed('recentMedianPct', '26 semanas'), signed('last8MedianPct', '8 semanas'), signed('currentMedianPct', 'Capturas')], rows: C.crossWorld.groups.filter(g => g.side === s)})});
    document.getElementById('card-premium-table').innerHTML = card({title: `Valor relativo por mundo · ${SIDES[s]}`, sub: 'Prêmio em %, mesma ponta e semana', body: table({columns: [
      {key: 'world', label: 'Mundo'}, {key: 'type', label: 'Tipo', render: (v, r) => v ? `${v} · ${r.battleye}` : '—'}, num('weeks', 'Semanas'), signed('medianPremiumPct', 'Histórico'), signed('recentPremiumPct', '26 semanas'), signed('last8PremiumPct', '8 semanas'), signed('currentPremiumPct', 'Capturas'),
      {key: 'currentPairs', label: 'Pares', num: true, render: v => v?.length ? String(v.length) : '—'}, num('corrWeekly', 'Correlação semanal', 2),
      {key: 'largestShiftPct', label: 'Maior mudança de patamar', num: true, render: (v, r) => ok(v) ? `${sgn(v)} (${yy(r.largestShiftWeek)})` : '—'}],
      rows: cwRows(s), caption: 'Histórico, 26 e 8 semanas: medianas das semanas com cotação nos dois mundos (Luzibra: só desde a mudança de patamar). Maior mudança: diferença entre as medianas das 8 semanas antes e das 8 semanas a partir da semana indicada.'})});
    const quarters = [...new Set(C.crossWorld.groupsByQuarter.filter(x => x.side === s).map(x => x.quarter))].sort();
    const G = [Y, green, 'Open PvP'];
    document.getElementById('card-groups-quarter').innerHTML = card({title: `Prêmio por grupo e trimestre · ${SIDES[s]}`, sub: 'Mediana entre os mundos do grupo, com o número de mundos entre parênteses; composição fixa por grupo', body: table({columns: [{key: 'q', label: 'Trimestre'}, ...G.map((g, i) => ({key: 'g' + i, label: g, num: true}))],
      rows: quarters.map(q => ({q, ...Object.fromEntries(G.map((g, i) => { const x = C.crossWorld.groupsByQuarter.find(r => r.side === s && r.group === g && r.quarter === q); return ['g' + i, x ? `${sgn(x.medianPremiumPct)} <span class="dim">(${x.worlds})</span>` : '—']; }))}))})});
  }, ['side']);

  // 05 · dossiers
  const NOTES = {
    Antica: 'A série mais longa permite estimar sazonalidade e testar horizontes maiores. É a referência de movimento para os demais mundos, não um índice representativo de todo o mercado.',
    Belobra: 'A profundidade visível favorece Buy Offers, mas esse estoque não mostra quantas TC foram negociadas. A sazonalidade transferida teve erro maior que a referência constante; use a trajetória cíclica como sensibilidade.',
    Celebra: 'A captura mais recente é de 21 de setembro. A comparação com mundos capturados no dia 23 incorpora essa diferença de data; o nível não deve ser tratado como uma cotação simultânea.',
    Collabra: 'As quantidades visíveis nas duas pontas são relativamente equilibradas. A alta em Buy Offers frente à referência de 90 dias deve ser acompanhada junto com sua continuidade no topo do quadro de ofertas.',
    Descubra: 'Sell Offers subiram mais que Buy Offers frente às respectivas referências de 90 dias. A diferença atual entre as duas ofertas eleva a perda de comprar e revender imediatamente e reduz a utilidade de um alvo único para as duas pontas.',
    Gentebra: 'O excesso de quantidade em Buy Offers coincide com uma faixa ampla entre as pontas. Criar uma Sell Offer não garante sua execução. Para vender TC imediatamente, a referência é Buy Offers e o Amount disponível nessa oferta.',
    Luminera: 'O maior valor em Sell Offers desta amostra não corresponde ao maior valor em Buy Offers. A diferença torna especialmente importante distinguir o preço pedido pelo vendedor do preço imediatamente disponível para quem vende TC.',
    Luzibra: 'A fusão anunciada com Yubra e Etebra para criar Deslumbra introduz uma ruptura econômica. As projeções numéricas cessam a partir de 22 de outubro de 2026, primeira data possível divulgada; os preços do sucessor exigem nova referência.',
    Ombra: 'A profundidade compradora é superior à vendedora na captura, mas não estabelece direção futura. Nos testes disponíveis, a transferência do ciclo teve erro menor que o preço constante.',
    Ourobra: 'O diferencial entre compra e venda está entre os menores do painel. Isso reduz a barreira de preço para uma operação completa, embora a execução dependa da quantidade disponível no topo.',
    Quelibra: 'O Amount total em Sell Offers supera o de Buy Offers. Esse desequilíbrio distingue o mundo dos mercados com grande estoque comprador e merece acompanhamento separado dos movimentos de Antica.',
    Rasteibra: 'Sell Offers e Buy Offers avançaram de forma semelhante frente à referência de 90 dias. A relação entre as pontas é mais informativa para execução que observar apenas o preço pedido.',
    Terribra: 'Obscubra e Jacabra deram origem a Terribra. As séries não são concatenadas: o estudo começa nas ofertas disponíveis de Terribra. A ausência de captura recente torna o cenário dependente de uma referência antiga e do movimento posterior de Antica.',
    Tornabra: 'A diferença entre as pontas é intermediária no painel. A quantidade em Buy Offers e a trajetória do preço em Buy Offers precisam confirmar qualquer melhora sugerida pelo cenário sazonal.',
    Ustebra: 'As duas pontas estão acima da mediana disponível nos 90 dias anteriores, com quantidade compradora elevada. Esse retrato pode mudar por cancelamento de ordens e não equivale ao fluxo de negócios executados.',
    Venebra: 'A razão entre Amount em Buy Offers e Sell Offers é a maior da amostra, mas a diferença entre preços permanece ampla. O estoque comprador, isoladamente, não permite concluir que o preço em Sell Offers será alcançado.',
  };
  document.getElementById('dossiers').innerHTML = worlds.map(w => {
    const local = R.worldForecast.filter(x => x.world === w.world);
    const milestones = [MILESTONES[0], MILESTONES[2]].map(d => { const a = local.find(x => x.side === 'ask' && x.date === d), b = local.find(x => x.side === 'bid' && x.date === d); return `${MNAME[d]}: Buy Offers ${price(b?.base)} / Sell Offers ${price(a?.base)}`; }).join('; ');
    const pa = C.crossWorld.worlds.find(x => x.world === w.world && x.side === 'ask');
    return `<article class="dossier" data-world="${w.world}" id="dossier-${w.world.toLowerCase()}">
      <h3>${w.world === 'Terribra' ? 'Terribra / Obscubra' : w.world}</h3>
      <p>${w.type ? `<strong>${w.type} · BattlEye ${w.battleye}.</strong> ` : ''}${NOTES[w.world]}</p>
      <p><strong>Sell Offers / Buy Offers.</strong> Buy Offers ${fmt(w.bid)}; Sell Offers ${fmt(w.ask)} gp/TC; diferença entre preços ${fmt(w.spreadPct, 2)}%. Em relação à mediana das ofertas disponíveis nos 90 dias anteriores, Buy Offers ${sgn(w.bidVs90)} e Sell Offers ${sgn(w.askVs90)}. ${w.buyVolume == null ? 'Sem captura de profundidade recente.' : `Quantidade visível: ${price(w.buyVolume)} TC em Buy Offers e ${price(w.sellVolume)} TC em Sell Offers. No melhor preço: ${fmt(w.buyTopAmount)} TC em Buy Offers e ${fmt(w.sellTopAmount)} TC em Sell Offers.`}</p>
      <p><strong>Cenário e robustez.</strong> ${w.world === 'Luzibra' ? 'Após a fusão, avaliar convergência, estabilidade ou queda no novo quadro de ofertas de Deslumbra, sem atribuir níveis numéricos ou probabilidades antes das primeiras observações.' : milestones + ' gp/TC, no cenário central.'} ${w.testN ? `${w.world === 'Antica' ? 'O teste do conjunto (horizontes de 4 a 52 semanas, as duas pontas)' : 'O teste da transferência'} apresenta erro médio de ${fmt(w.testMape, 1)}%, contra ${fmt(w.testNaive, 1)}% mantendo o preço constante (${w.testN} comparações de pontas e horizontes, com sobreposição).` : 'Sem observações suficientes para testar a transferência.'} ${w.testMape > w.testNaive ? 'Como não supera a referência simples, a trajetória cíclica deve ser interpretada como uma hipótese de sensibilidade.' : ''} Cobertura: ${fmt(w.days)} dias, de ${br(w.first)} a ${br(w.last)}; ${w.captureCount === 0 ? 'sem capturas' : w.captureCount === 1 ? '1 captura' : `${w.captureCount} capturas`} em 21–23/09.</p>
      ${pa && ok(pa.last8PremiumPct) ? `<p><strong>Valor relativo.</strong> Prêmio em Sell Offers sobre Antica: ${sgn(pa.recentPremiumPct)} nas últimas 26 semanas, ${sgn(pa.last8PremiumPct)} nas últimas 8 e ${sgn(pa.currentPremiumPct)} nas capturas.${w.world === 'Luzibra' ? ` Medido só desde a mudança de patamar de ${brShort(pa.breakWeek)}; antes, desconto de ${fmt(Math.abs(pa.preBreakMedianPct))}% (${fmt(Math.abs(pa.preBreak8Pct))}% nas oito semanas anteriores).` : ''}</p>` : ''}
    </article>`;
  }).join('');
  document.querySelectorAll('.dossier').forEach(d => d.classList.toggle('on', d.dataset.world === state.world));

  // 07 · seasonality
  chart('card-season', host => {
    host.innerHTML = card({title: 'Antica · variação mediana dentro de cada mês (%)', sub: 'Primeira para última oferta diária do mês; mínimo de 10 dias; setembro de 2026 excluído', body: '<div class="chart" id="ch-season"></div>',
      drawer: table({columns: [{key: 'month', label: 'Mês', render: v => MONTHS[v - 1]}, {key: 'side', label: 'Ponta', render: v => SIDES[v]}, num('medianPct', 'Variação mediana %', 1), num('n', 'Anos')], rows: R.seasonality})});
    const g = (s, mth) => R.seasonality.find(x => x.side === s && x.month === mth)?.medianPct;
    barChart(host.querySelector('#ch-season'), {categories: MONTHS.map(m => m.replace('.', '')), aria: 'Variação mediana por mês em Antica', legend: LEG.ask + LEG.bid, yFmt: v => `${fmt(v, 1)}%`,
      series: ['ask', 'bid'].map(s => ({label: SIDES[s], cls: `c-${s}`, values: MONTHS.map((_, i) => g(s, i + 1))}))});
  });

  // 08 · round trips, maker, spreads, weekday
  on(() => {
    const w = state.world, rows = R.roundtrips.filter(x => x.world === w && [9, 11].includes(x.sellMonth));
    document.getElementById('card-roundtrip').innerHTML = card({title: `${w} · venda em setembro/novembro e recompra em maio–julho`, sub: 'Aceitando ofertas existentes; o mundo segue a seleção da seção 05', body: table({columns: [{key: 'cycle', label: 'Ciclo'}, num('sellMonth', 'Mês de venda'), num('bidMedian', 'Preço recebido'), num('askRebuyMedian', 'Preço pago'), signed('tcGainPct', 'Variação TC'), num('sellN', 'Dias venda'), num('buyN', 'Dias recompra')], rows})});
    const mk = C.roundtripMaker.filter(x => x.world === w);
    document.getElementById('card-maker').innerHTML = card({title: `${w} · aceitar × criar ofertas`, sub: 'Ganho em TC; criar ofertas paga 2% em cada ponta', body: table({columns: [{key: 'cycle', label: 'Ciclo'}, num('sellMonth', 'Mês de venda'), signed('acceptPct', 'Aceitando'), signed('makerGrossPct', 'Criando, bruto'), signed('makerNetPct', 'Criando, após taxas')], rows: mk})});
  }, ['world']);
  document.getElementById('card-maker-all').innerHTML = card({title: 'Mundos BR · mediana por ciclo', sub: 'Meses de venda de setembro a dezembro; Antica fora', body: table({columns: [{key: 'cycle', label: 'Ciclo'}, num('worlds', 'Mundos'), num('n', 'Combinações'), signed('accept', 'Aceitando'), signed('gross', 'Criando, bruto'), signed('net', 'Criando, após taxas'), {key: 'diff', label: 'Mediana de (criando − aceitando)', num: true, render: v => pp(v)}], rows: makerByCycle})});
  document.getElementById('card-spread').innerHTML = card({title: 'Perda de comprar e revender imediatamente · %', sub: '1 − Buy Offers / Sell Offers; referência: leituras da API nos 180 dias anteriores a 23/09', body: table({columns: [{key: 'world', label: 'Mundo'}, {key: 'nowPct', label: 'Agora', num: true, render: v => fmt(v, 2), cls: (v, r) => ok(r.recentMedianPct) && v > 1.5 * r.recentMedianPct ? 'flag neg' : ''}, {key: 'nowDate', label: 'Data', render: br}, num('recentMedianPct', 'Mediana 180 dias', 2), {key: 'shareRecentAtLeastNow', label: 'Leituras ≥ agora', num: true, render: v => prob(v)}, num('recentN', 'Leituras'), num('historyMedianPct', 'Mediana histórica', 2)], rows: C.spread.worlds,
    caption: 'Em destaque: atual acima de 1,5 vez a mediana de 180 dias. Terribra: último histórico (01/09).'})});
  on(() => {
    const s = state.side, names = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
    const get = scope => names.map((_, i) => C.weekday.rows.find(r => r.scope === scope && r.side === s && r.order === i));
    document.getElementById('card-weekday').innerHTML = card({title: `Desvio por dia do servidor · ${SIDES[s]} · %`, sub: 'Em relação à mediana dos 7 dias ao redor; barras: média; traço: intervalo de 95% (bootstrap). Mundos BR com janela de 3 de 7 dias', controls: sideControl(), body: '<div class="chart" id="ch-wd"></div>',
      drawer: table({columns: [{key: 'scope', label: 'Recorte'}, {key: 'weekday', label: 'Dia'}, num('n', 'Dias'), num('devPct', 'Desvio %', 3), num('ciLowPct', 'IC inferior', 3), num('ciHighPct', 'IC superior', 3)], rows: C.weekday.rows.filter(r => r.side === s)})
        + table({columns: [{key: 'scope', label: 'Teste'}, {key: 'side', label: 'Ponta', render: v => SIDES[v]}, num('n', 'Dias'), {key: 'window', label: 'Janela'}, num('rangePct', 'Amplitude %', 3), num('pIid', 'p (livre)', 3), num('pBlock', 'p (dentro da semana)', 3), num('pHolm', 'p (Holm)', 3), {key: 'contributors', label: 'Mundos (dias)', wrap: true, render: v => Object.entries(v).map(([k, n]) => `${k} ${n}`).join(', ')}], rows: C.weekday.tests})});
    chart('ch-wd', host => barChart(host, {categories: names, aria: `Desvio por dia da semana em ${SIDES[s]}`, yFmt: v => `${fmt(v, 2)}%`, tipFmt: v => `${fmt(v, 3)}%`,
      legend: '<span><i class="sw ink"></i>Antica</span><span><i class="sw muted"></i>Mundos BR</span>',
      series: [['Antica', 'c-ink'], ['Mundos BR', 'c-muted']].map(([scope, c]) => { const r = get(scope); return {label: scope, cls: c, values: r.map(x => x?.devPct), lo: r.map(x => x?.ciLowPct), hi: r.map(x => x?.ciHighPct)}; })}));
  }, ['side']);

  // 09 · volatility & persistence
  document.getElementById('card-vol-year').innerHTML = card({title: 'Antica · volatilidade por ano', sub: 'Um ponto por semana; dias consecutivos para a variação diária; %', body: table({columns: [{key: 'year', label: 'Ano', render: v => String(v)}, {key: 'side', label: 'Ponta', render: v => SIDES[v]}, num('weeklyStdPct', 'Desvio-padrão semanal', 2), num('weeklyN', 'Semanas'), num('dailyMedianAbsPct', 'Variação diária mediana', 2), num('dailyN', 'Dias')], rows: C.volatility.byYear, caption: '2026 até setembro.'})});
  document.getElementById('card-acf').innerHTML = card({title: 'Autocorrelação semanal · Antica · Sell Offers', sub: 'Variações semanais; faixa de ruído ±' + fmt(mo.band, 2), body: table({columns: [num('lag', 'Defasagem (semanas)'), num('rWeeklyMedian', 'Mediana semanal', 2), num('r', 'Um ponto por semana', 2), num('rDeseasonalised', 'Sem ciclo anual', 2), {key: 'null', label: 'Só ruído (5–95%)', num: true, render: v => `${fmt(v.p05, 2)} a ${fmt(v.p95, 2)}`}],
    rows: acf.map((a, i) => ({...a, null: mo.null.point[i]})), caption: `“Só ruído”: passeio aleatório com ruído de cotação calibrado às variações de 1 e 7 dias de Antica (1.000 simulações), um ponto por semana. Buy Offers: ${list(mob.acf.map(a => fmt(a.rDeseasonalised, 2)))} sem ciclo anual.`})});
  document.getElementById('card-vol-world').innerHTML = card({title: 'Volatilidade semanal por mundo · Sell Offers · %', sub: 'Um ponto por semana; Antica medida nas mesmas semanas; mínimo de 10 pares', body: table({columns: [{key: 'world', label: 'Mundo'}, num('weeklyStdPct', 'Desvio do mundo', 2), num('anticaSameWeeksStdPct', 'Antica, mesmas semanas', 2), {key: 'ratio', label: 'Razão', num: true, render: v => ok(v) ? `${fmt(v, 2)}×` : '—'}, num('n', 'Pares'), num('medianDaysPerWeek', 'Dias com cotação por semana', 0)],
    rows: C.volatility.worlds.filter(x => x.side === 'ask')})});
  document.getElementById('card-cond').innerHTML = card({title: 'Quatro semanas depois · Antica', sub: 'Variação nas 4 semanas seguintes, conforme as 4 anteriores; um ponto por semana', body: table({columns: [{key: 'condition', label: 'Condição', wrap: true}, {key: 'side', label: 'Ponta', render: v => SIDES[v]}, num('n', 'Semanas'), {key: 'episodes', label: 'Episódios', num: true, render: (v, r) => r.condition === 'todas as semanas' ? '—' : fmt(v)}, signed('medianFwdPct', 'Mediana seguinte'), {key: 'shareUp', label: 'Alta em', num: true, render: v => prob(v)},
    {key: 'monthMatchedShareUp', label: 'Mesmos meses, outros anos', num: true, render: v => prob(v)}, signed('seasonAdjMedianFwdPct', 'Sem sazonalidade'), {key: 'declusteredP', label: 'p (episódios espaçados)', num: true, render: v => ok(v) ? fmt(v, 2) : '—'}],
    rows: ['ask', 'bid'].flatMap(s => C.momentum[s].conditional.map(c => ({...c, side: s}))), caption: 'Janelas sobrepostas. “Sem sazonalidade”: variação menos a esperada pelo ciclo anual ajustado. p: Mann-Whitney sobre variações sem sazonalidade, episódios a pelo menos 21 dias entre si contra as demais semanas.'})});

  // 10 · trade comparison by selected world
  on(() => {
    const w = state.world;
    document.getElementById('card-trade').innerHTML = card({title: `${w} · diferença das médias diárias para as ofertas (%)`, sub: 'O mundo segue a seleção da seção 05', body: table({columns: [{key: 'side', label: 'Ponta', render: v => SIDES[v]}, num('n', 'Dias pareados'), num('medianGapPct', 'Mediana %', 2), num('p10', 'P10 %', 2), num('p90', 'P90 %', 2), num('within2Pct', 'Dias dentro de ±2%', 1), num('sameDayMedianGapPct', 'Mediana sem deslocar dia %', 2), {key: 'last', label: 'Último dia', render: br}], rows: R.tradeComparison.filter(x => x.world === w)})});
  }, ['world']);

  // 11 · events by side
  on(() => {
    const s = state.side;
    document.getElementById('card-events').innerHTML = card({title: `Eventos selecionados · ${SIDES[s]} · ofertas de Antica`, controls: sideControl(), body: table({columns: [{key: 'event', label: 'Evento'}, num('n', 'Ocorrências'), signed('returnPct', 'Variação', 2), signed('abnormalPct', 'Excesso vs placebo', 2), num('q', 'q ajustado', 3)],
      rows: R.eventStudy.filter(x => x.side === s && ['XP/Skill Event', 'Rapid Respawn', 'Loot Event', 'Halloween Event', 'Lightbearer', 'Orcsoberfest', 'Colours of Magic', 'Annual Autumn Vintage', 'Winterlight Solstice'].includes(x.event))})});
  }, ['side']);

  // side buttons anywhere on the page, and the active section in the index
  root.addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (b) set('side', b.dataset.side); });
  on(() => document.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === state.side))), ['side']);
  on(() => { const sel = document.getElementById('world-select'); if (sel.value !== state.world) sel.value = state.world; }, ['world']);
  const links = [...document.querySelectorAll('.toc a')];
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#${en.target.id}`));
    // Keep the active entry visible in the horizontally scrolling index on narrow screens.
    const a = links.find(l => l.classList.contains('on')), ol = a?.closest('ol');
    if (ol) ol.scrollLeft = a.offsetLeft - ol.clientWidth / 2 + a.offsetWidth / 2;
  }), {rootMargin: '-45% 0px -50% 0px'});
  document.querySelectorAll('section.block').forEach(s => io.observe(s));
  ro.observe(root);
  document.getElementById('loading')?.remove();
}

main().catch(err => {
  const root = document.getElementById('report');
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = `<p class="failed">Não foi possível carregar os dados do relatório (${esc(err.message)}). Abra esta página por HTTP — GitHub Pages ou <code>python3 -m http.server</code> nesta pasta —, não como arquivo local.</p>`;
  console.error(err);
});
