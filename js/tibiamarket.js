/*
 * TibiaMarket API (api.tibiamarket.top) - the historical Tibia Coin data
 * behind tibiamarket.top, the site this project exists to replace the live
 * side of. Its own automated collection stopped, but the history it already
 * gathered is still served, and CORS is open, so it can be read straight
 * from the browser exactly like TibiaData.
 *
 * Not affiliated with tibiamarket.top or its author; this is a public,
 * documented endpoint (api.tibiamarket.top/docs).
 *
 * The server enforces 1 request / 5 seconds and answers a request made too
 * soon with HTTP 429 and a Retry-After header. requestSlot() below serialises
 * every call through this module onto one queue spaced 5.1s apart, so
 * fetching several worlds' history back-to-back never needs a manual retry.
 */
const API = 'https://api.tibiamarket.top';
const COIN_ITEM_ID = 22118;          // "Tibia Coins" - confirmed via /item_metadata
const MIN_INTERVAL_MS = 5100;

let queue = Promise.resolve();
let lastCallAt = 0;

function requestSlot() {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  queue = run.catch(() => {});      // one failed slot must not jam the queue
  return run;
}

async function getJSON(path, params) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  await requestSlot();
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 429) {
    const retryAfter = Number(r.headers.get('retry-after')) || 5;
    lastCallAt = Date.now() + retryAfter * 1000 - MIN_INTERVAL_MS;
    await requestSlot();
    const retry = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!retry.ok) throw new Error(`TibiaMarket request failed (HTTP ${retry.status})`);
    return retry.json();
  }
  if (!r.ok) throw new Error(`TibiaMarket request failed (HTTP ${r.status})`);
  return r.json();
}

/*
 * Full Tibia Coin history for one world, oldest first. TibiaMarket's own
 * sell/buy naming matches this project's: sell_offer is the best (lowest)
 * ask, buy_offer the best (highest) bid.
 *
 * A point with no data yet (both offers at the API's -1 sentinel) is
 * dropped rather than plotted as zero. month_sold/month_bought are kept as
 * loose context only - they are trailing 30-day turnover, not the order-book
 * volume this project otherwise stores, so they are never mixed into the
 * sellVolume/buyVolume fields screenshots produce.
 */
export async function fetchCoinHistory(world, { startDaysAgo = 3650, endDaysAgo = -1 } = {}) {
  const rows = await getJSON('/item_history', {
    server: world,
    item_id: COIN_ITEM_ID,
    start_days_ago: startDaysAgo,
    end_days_ago: endDaysAgo
  });
  return rows
    .filter(r => r.sell_offer > 0 || r.buy_offer > 0)
    .map(r => ({
      capturedAt: new Date(r.time * 1000).toISOString().slice(0, 19),
      sell: r.sell_offer > 0 ? r.sell_offer : null,
      buy: r.buy_offer > 0 ? r.buy_offer : null,
      monthSold: r.month_sold >= 0 ? r.month_sold : null,
      monthBought: r.month_bought >= 0 ? r.month_bought : null
    }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}
