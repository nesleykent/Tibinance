// The Events dock browses the same canonical events that feed the chart.
import { dateText, eventsFor, queryEvents, eventToday } from './events.js';
import { esc } from './format.js';
export function eventsPanel(root, { onFilter, onFocus }) {
  const today = eventToday();
  let month = today.slice(0, 7), day = null, selected = null, events = [], available = false, categories = [], category = '', period = 'all', scope = '', initialized = false;
  const $ = id => root.querySelector(`#${id}`);
  const filtered = () => queryEvents(events, { category, scope });
  const scopeText = e => e.worlds === 'all' ? 'Global: all worlds' : `Worlds: ${e.worlds.join(', ')}`;
  const row = e => `<button type="button" class="event-row" data-event="${esc(e.id)}" aria-pressed="${e.id === selected}"><small>${esc(dateText(e))} / ${esc(e.category.label)}</small><strong>${esc(e.title)}</strong><small>${esc(scopeText(e))}</small></button>`;
  function render() {
    const list = filtered();
    $('eventsContext').textContent = available ? `Shared Events across all assets and worlds. Dates are inclusive Tibia server days. ${events.length} recorded events. Token price candles use UTC days.` : 'Event data is unavailable. Reload to try again.';
    $('eventCategory').innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${esc(c.id)}">${esc(c.label)} (${queryEvents(events, { category: c.id }).length})</option>`).join('');
    $('eventCategory').value = category;
    $('eventMonth').value = month;
    const first = new Date(`${month}-01T00:00:00Z`), offset = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    $('eventCalendar').innerHTML = '<span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>' + '<span></span>'.repeat(offset) + Array.from({ length: count }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`, hits = queryEvents(list, { first: date, last: date });
      return `<button type="button" data-day="${date}" aria-pressed="${day === date}" ${date === today ? 'aria-current="date"' : ''} aria-label="${date}, ${hits.length} events${hits.length ? ', ' + esc(hits.map(e => e.title).join(', ')) : ''}"><span>${i + 1}</span><small>${hits.length || ''}</small>${hits.some(e => e.start !== e.end) ? '<i class="event-span" aria-hidden="true"></i>' : ''}</button>`;
    }).join('');
    $('eventDayTitle').textContent = day ? `Events on ${day}` : 'Choose a calendar day';
    const hits = day ? queryEvents(list, { first: day, last: day }) : [];
    $('eventDayList').innerHTML = hits.map(row).join('') || (day ? '<p>No events on this day.</p>' : '');
    const agenda = queryEvents(list, { period, today });
    $('eventAgenda').innerHTML = agenda.map(row).join('') || '<p>No events match these filters.</p>';
    $('eventCount').textContent = `${agenda.length} events in chronological order`;
    const e = list.find(e => e.id === selected);
    $('eventDetails').innerHTML = e ? `<small>${esc(dateText(e))} / ${esc(e.category.label)}</small><h3>${esc(e.title)}</h3><p>${esc(e.description)}</p><p>${esc(scopeText(e))}</p>${e.merge ? `<p>${esc(e.merge.from.join(', '))} into ${esc(e.merge.into)}. ${esc(e.merge.status)}${e.merge.notBefore ? `. Not before ${esc(e.merge.notBefore)}` : ''}.</p>` : ''}<button type="button" id="eventFocus">Focus on chart</button><p id="eventFocusStatus" role="status"></p>` : '<p>Select an event for details and chart navigation.</p>';
  }
  root.addEventListener('click', e => {
    const section = e.target.closest('[data-event-section]');
    if (section) $(section.dataset.eventSection).scrollIntoView({ block: 'start' });
    const event = e.target.closest('[data-event]');
    if (event) { selected = event.dataset.event; const container = event.parentElement.id; render(); root.querySelector(`#${container} [data-event="${CSS.escape(selected)}"]`)?.focus({ preventScroll: true }); if (container === 'eventAgenda') $('eventDetails').scrollIntoView({ block: 'nearest' }); }
    const cell = e.target.closest('[data-day]');
    if (cell) { day = cell.dataset.day; render(); root.querySelector(`[data-day="${day}"]`)?.focus({ preventScroll: true }); }
    const move = e.target.closest('[data-month-step]');
    if (move) { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + Number(move.dataset.monthStep)); month = d.toISOString().slice(0, 7); day = null; render(); }
    if (e.target.id === 'eventToday') { month = today.slice(0, 7); day = today; render(); }
    if (e.target.id === 'eventFocus') { const chosen = filtered().find(e => e.id === selected); $('eventFocusStatus').textContent = onFocus(chosen); }
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'eventMonth' && e.target.value !== month && /^\d{4}-\d{2}$/.test(e.target.value)) { month = e.target.value; day = null; render(); }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'eventMonth' && e.target.value !== month && /^\d{4}-\d{2}$/.test(e.target.value)) { month = e.target.value; day = null; render(); }
    if (e.target.id === 'eventPeriod') { period = e.target.value; render(); }
    if (e.target.id === 'eventCategory' || e.target.id === 'eventScope') { category = $('eventCategory').value; scope = $('eventScope').value; selected = null; onFilter(filtered()); render(); }
  });
  return { update(dataset) { available = !!dataset; categories = dataset?.categories ?? []; events = eventsFor(dataset); selected = null;
    if (!initialized && events.length) {
      initialized = true;
      if (!events.some(e => e.end >= today)) {
        const latest = events.at(-1);
        month = latest.start.slice(0, 7);
      }
    }
    onFilter(filtered()); render(); } };
}
