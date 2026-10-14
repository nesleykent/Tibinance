/*
 * Where a page's chart meets the TradingView tools (js/tv-terminal.js): the page connects its chart once, and tells
 * the tools when what it shows changes (another world, side, measure or interval). The tools never reach into a
 * page's state; they ask the context it gave.
 *
 * A context:
 *   page              'markets' | 'token' | 'economy'
 *   chart             the Lightweight Charts chart
 *   series()          the series drawings attach to and whose values indicators read (the main line)
 *   key()             what drawings are kept under: the symbol shown, e.g. 'markets:tibia-coin:Antica:sell'
 *   symbol()          the name the search button shows
 *   times()           every time on the chart's time scale, in order (its logical indexes)
 *   values()          [{time, value}] of the main line, for indicators and the magnet
 *   format(v)         a price as the page writes it
 *   worlds?()         [{world, last, ratio, meta}] for the search dialog; open?(world) opens one
 *   priceScaleId?     the main series' price scale, 'right' unless the page says otherwise
 *   reset()           the chart's default view (Alt+R)
 *   setStyle?(style)  'line' | 'markers' | 'step' | 'curved'
 *   retheme()         re-read the colour tokens
 *   replay?(time)     show the chart as of a time, or everything with null
 */
export const bridge = new EventTarget();
let current = null;

export function connect(context) {
  current = context;
  bridge.dispatchEvent(new Event('chart'));
}
export const changed = () => current && bridge.dispatchEvent(new Event('view'));
export const context = () => current;
export function whenConnected(fn) {
  if (current) fn(current);
  else bridge.addEventListener('chart', () => fn(current), { once: true });
}
