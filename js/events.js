/*
 * Canonical Events: dated facts plotted over a world's chart, kept apart from the market history
 * (data/events/events.json). Pure functions; no DOM, no chart library.
 *
 * An event:
 *   id           stable and unique
 *   category     one of the dataset's categories: { id, label, mark, group, lifecycle, recurring }
 *   start, end   server days, inclusive ('YYYY-MM-DD'); end equals start for a one-day event
 *   title, description
 *   worlds       'all', or the names of the worlds it concerns (one or several)
 *   merge        world merges only: { from: [worlds], into: world, status: 'completed' | 'announced', notBefore? }
 *   provenance   source records and original boundaries; references hold citation URLs
 *   type, assets, entities  canonical affected-entity metadata, used only by explicit queries
 *
 * Every consumer receives all events. Explicit queries may use metadata. Its own lifecycle events (opened, retired, merged) also
 * bound its time axis, so they are plotted even where no price was observed near them.
 */
export const EVENTS = new URL('../data/events/events.json', import.meta.url);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = value => typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
// Tibinance copy never uses a middle dot, and Markets copy no dashes as punctuation.
const FORBIDDEN = /[\u00b7\u2013\u2014]/;

export const appliesTo = (event, world) => event.worlds === 'all' || event.worlds.includes(world);

// The full collection, in date order, with resolved categories. Context arguments cannot select a universe.
export function eventsFor(dataset) {
  if (!dataset) return [];
  const categories = new Map(dataset.categories.map((c, rank) => [c.id, { ...c, rank }]));
  return dataset.events.map(e => ({ ...e, category: categories.get(e.category) }));
}

// A lifecycle event that has happened (an announcement has not) and concerns this world by name.
const ownLifecycle = (event, world) => event.category.lifecycle && Array.isArray(event.worlds) && event.worlds.includes(world)
  && event.merge?.status !== 'announced';

// The first and last day of a world's own lifecycle events on or after `from` (the market history's first day), or
// null. A world opened long before the history began does not stretch the axis back to its opening.
export function lifecycleSpan(events, world, from) {
  const days = events.filter(e => ownLifecycle(e, world)).flatMap(e => [e.start, e.end]).filter(d => !from || d >= from).sort();
  return days.length ? { first: days[0], last: days.at(-1) } : null;
}

// Events overlapping [first, last], their days clipped to it: what a chart of those days can place.
export function within(events, first, last) {
  return events.filter(e => e.end >= first && e.start <= last)
    .map(e => (e.start < first || e.end > last) ? { ...e, start: e.start < first ? first : e.start, end: e.end > last ? last : e.end } : e);
}

export const dateText = event => event.start === event.end ? event.start : `${event.start} to ${event.end}`;
export const eventText = event => `${dateText(event)}, ${event.title}: ${event.description}`;
// A marker's accessible name: what it stands for, one event or several.
export function groupLabel(events) {
  return events.length === 1 ? eventText(events[0]) : `${events.length} events. ${events.map(eventText).join(' ')}`;
}

/*
 * Markers that would overlap become one group. items: [{x, width, event}] (or groups, {x, width, events}) sorted by
 * x; a marker joins the group before it when it starts within `gap` of that group's right edge. A group stands at its
 * earliest event, so it marks where its first event begins, and is as wide as its own label needs (`widthOf`).
 *
 * With `bounds` [from, to], every marker is kept whole inside them: placed in before grouping, and a group its own
 * label widens past an edge is moved in and, should that touch its neighbour, joined to it.
 */
export function cluster(items, { gap = 2, widthOf, bounds = null }) {
  const inside = (x, width) => bounds ? Math.min(Math.max(x, bounds[0] + width / 2), bounds[1] - width / 2) : x;
  let groups = [];
  for (const item of items) {
    const x = inside(item.x, item.width), events = item.events ?? [item.event];
    const last = groups.at(-1);
    if (last && x - item.width / 2 < last.x + last.width / 2 + gap) {
      last.events.push(...events);
      last.width = widthOf(last.events);
    } else groups.push({ x, width: item.width, events: [...events] });
  }
  if (bounds) {
    const placed = groups.map(g => ({ ...g, x: inside(g.x, g.width) }));
    const touching = placed.some((g, i) => i && g.x - g.width / 2 < placed[i - 1].x + placed[i - 1].width / 2 + gap);
    groups = touching ? cluster(placed, { gap, widthOf, bounds }) : placed;
  }
  return groups.map(g => ({ ...g, key: g.events.map(e => e.id).join(' ') }));
}

/*
 * What an exported image says about the markers it shows: a key per category, recurring categories with their
 * count, and the other events one per line (date, mark, title) up to `limit`, then how many more.
 */
export function exportNotes(events, { limit = 6 } = {}) {
  const byCategory = new Map();
  for (const e of events) byCategory.set(e.category.id, [...(byCategory.get(e.category.id) ?? []), e]);
  const keys = [...byCategory.values()].map(list => ({ category: list[0].category, count: list.length }))
    .sort((a, b) => (a.category.rank ?? 0) - (b.category.rank ?? 0));
  const listed = events.filter(e => !e.category.recurring);
  return { keys, rows: listed.slice(0, limit), more: Math.max(0, listed.length - limit) };
}

/*
 * Every problem with a dataset, as text; none means it is valid. worlds: the known world names (current, retired and
 * any the dataset declares). A completed merge's successor must be a known world; an announced one may not exist yet.
 */
export function validate(dataset, worlds = dataset.worlds ?? []) {
  const errors = [], known = new Set(worlds);
  const categories = new Map();
  for (const c of dataset.categories ?? []) {
    if (categories.has(c.id)) errors.push(`category ${c.id} is defined twice`);
    for (const field of ['id', 'label', 'mark', 'group']) if (typeof c[field] !== 'string' || !c[field]) errors.push(`category ${c.id}: ${field} is required`);
    if (typeof c.lifecycle !== 'boolean' || typeof c.recurring !== 'boolean') errors.push(`category ${c.id}: lifecycle and recurring are true or false`);
    if (typeof c.mark === 'string' && !/^[A-Z]{1,2}$/.test(c.mark)) errors.push(`category ${c.id}: mark is one or two capital letters`);
    categories.set(c.id, c);
  }
  const ids = new Set(), occurrences = new Set();
  let previous = null;
  for (const e of dataset.events ?? []) {
    const at = `event ${e.id}`;
    if (typeof e.id !== 'string' || !e.id) errors.push('an event has no id');
    if (ids.has(e.id)) errors.push(`${at} is listed twice`);
    ids.add(e.id);
    const occurrence = `${e.type}|${e.start}`;
    if (occurrences.has(occurrence)) errors.push(`${at}: duplicate real occurrence`);
    occurrences.add(occurrence);
    if (!categories.has(e.category)) errors.push(`${at}: unknown category ${e.category}`);
    if (!isDay(e.start) || !isDay(e.end)) errors.push(`${at}: start and end are server days (YYYY-MM-DD)`);
    else if (e.end < e.start) errors.push(`${at}: ends before it starts`);
    for (const field of ['title', 'description']) {
      if (typeof e[field] !== 'string' || !e[field].trim()) errors.push(`${at}: ${field} is required`);
      else if (FORBIDDEN.test(e[field])) errors.push(`${at}: ${field} uses a middle dot or a dash`);
    }
    if (e.worlds !== 'all') {
      if (!Array.isArray(e.worlds) || !e.worlds.length) errors.push(`${at}: worlds is 'all' or a list of worlds`);
      else {
        for (const w of e.worlds) if (!known.has(w)) errors.push(`${at}: unknown world ${w}`);
        if (new Set(e.worlds).size !== e.worlds.length) errors.push(`${at}: a world is listed twice`);
      }
    }
    if (e.category === 'world-merge') {
      const m = e.merge;
      if (!m || !Array.isArray(m.from) || !m.from.length || typeof m.into !== 'string') errors.push(`${at}: a merge names the worlds it joins and the world they join`);
      else {
        if (!['completed', 'announced'].includes(m.status)) errors.push(`${at}: a merge is completed or announced`);
        if (m.status === 'completed' && !known.has(m.into)) errors.push(`${at}: unknown successor ${m.into}`);
        for (const field of ['notBefore', 'confirmedDate', 'verifiedOn', 'announcedOn', 'confirmedOn']) {
          if (m[field] !== undefined && m[field] !== null && !isDay(m[field])) errors.push(`${at}: ${field} is a server day`);
        }
        const scope = Array.isArray(e.worlds) ? new Set(e.worlds) : null;
        if (!scope || m.from.some(w => !scope.has(w))) errors.push(`${at}: a merge concerns every world it joins`);
        if (m.status === 'completed' && !scope?.has(m.into)) errors.push(`${at}: a completed merge concerns its successor`);
      }
    } else if (e.merge !== undefined) errors.push(`${at}: only a world merge has merge details`);
    if (!Array.isArray(e.provenance) || !e.provenance.length || e.provenance.some(p => !p || !(p.url || p.file))) errors.push(`${at}: provenance (url or file) is required`);
    if (!e.type || typeof e.type !== 'string') errors.push(`${at}: type is required`);
    if (e.assets !== 'all' && (!Array.isArray(e.assets) || !e.assets.length || e.assets.some(a => !['tibia-coin', 'tibia-token'].includes(a)))) errors.push(`${at}: invalid assets`);
    if (!Array.isArray(e.entities) || !Array.isArray(e.references)) errors.push(`${at}: entities and references are lists`);
    // Date order, then category order, then id: the order the builder writes.
    if (previous && isDay(e.start) && order(previous, e, dataset.categories) > 0) errors.push(`${at} is out of order`);
    previous = e;
  }
  return errors;
}

export function order(a, b, categories) {
  const rank = id => categories.findIndex(c => c.id === id);
  return a.start.localeCompare(b.start) || rank(a.category) - rank(b.category) || a.id.localeCompare(b.id);
}

// One loader for every page. Failed attempts are retryable; successful reads are shared.
let loaded;
export function loadEvents() {
  return loaded ??= fetch(EVENTS, { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error(`Events: HTTP ${response.status}`);
    const dataset = await response.json(), errors = validate(dataset);
    if (dataset.format !== 2 || errors.length) throw new Error(`Invalid canonical Events: ${errors.join('; ')}`);
    return dataset;
  }).catch(error => { loaded = null; throw error; });
}

export const addEventDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Filters only arise from an explicit user or analytical query, never a selected page/Market.
export function queryEvents(events, { category = '', scope = '', type = '', asset = '', world = '', first = '', last = '', period = 'all', today = eventToday() } = {}) {
  return events.filter(e => (!category || (e.category.id ?? e.category) === category)
    && (!scope || (scope === 'global' ? e.worlds === 'all' : e.worlds !== 'all'))
    && (!type || e.type === type) && (!asset || e.assets === 'all' || e.assets.includes(asset))
    && (!world || appliesTo(e, world)) && (!first || e.end >= first) && (!last || e.start <= last)
    && (period === 'all' || (period === 'upcoming' ? e.end >= today : period === 'recent' ? e.end < today && e.end >= addEventDays(today, -90) : e.end < today)));
}
export function mergerAnnouncements(dataset) {
  return eventsFor(dataset).filter(e => e.merge?.status === 'announced').map(e => ({
    id: e.id, successor: e.merge.into, participants: e.merge.from, announcedOn: e.start,
    notBefore: e.merge.notBefore, confirmedDate: e.merge.confirmedDate ?? null,
    verifiedOn: e.merge.verifiedOn, sourceTitle: e.provenance[0].title ?? e.title,
    source: e.provenance[0].url ?? e.references[0]
  }));
}
export function lifecycleFacts(dataset) {
  const events = eventsFor(dataset);
  return { births: Object.fromEntries(events.filter(e => e.category.id === 'world-created').flatMap(e => e.worlds.map(w => [w, e.start]))),
    predecessors: Object.fromEntries(events.filter(e => e.merge?.status === 'completed').map(e => [e.merge.into, e.merge.from])),
    retirements: Object.fromEntries(events.filter(e => e.merge?.status === 'completed').flatMap(e => e.merge.from.map(w => [w, {offline:e.start, mergedInto:e.merge.into}]))),
    transfers: Object.fromEntries(events.filter(e => e.type === 'Transfers opened').flatMap(e => e.worlds.map(w => [w, e.start]))) };
}

// Today means a Tibia server day, consistently across timezones and pages.
export function eventToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin',
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(now).map(p=>[p.type,p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < 10 ? addEventDays(day,-1) : day;
}
