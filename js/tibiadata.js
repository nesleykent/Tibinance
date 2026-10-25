// TibiaData API v5. Sends Access-Control-Allow-Origin: *, so the browser can
// call it directly - no proxy, no server, nothing to pay for.
import { config } from './config.js';
const API = config.apiBaseUrl;
const WORLDS_TTL = config.worldsCacheMs;

async function getJSON(url) {
  let r;
  try {
    r = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (e) {
    // v5 errors carry CORS headers, so a bare network failure now means the
    // API was not reached at all (offline, blocked, or an edge outage).
    throw new Error('TibiaData could not be reached; check that you are online');
  }
  if (!r.ok) {
    // v5: 404 = the resource does not exist, 502 = tibia.com/upstream failed.
    if (r.status === 404) {
      throw new Error('TibiaData returned 404; the character name is most likely ' +
                      'misspelled or does not exist');
    }
    if (r.status === 502) {
      throw new Error('TibiaData returned 502; tibia.com could not be reached, ' +
                      'try again later');
    }
    throw new Error(`TibiaData request failed (HTTP ${r.status})`);
  }
  return r.json();
}

// The character name is passed in, used, and dropped by the caller.
// Nothing here writes it anywhere.
export async function lookupWorld(character) {
  const data = await getJSON(`${API}/character/${encodeURIComponent(character)}`);
  const world = data?.character?.character?.world;
  if (!world) throw new Error('Character world could not be resolved on TibiaData');
  return world;
}

let worldsCache = null;

async function loadWorlds(force = false) {
  if (!force && worldsCache && Date.now() - worldsCache.at < WORLDS_TTL) return worldsCache.map;
  try {
    const raw = sessionStorage.getItem('tc_worlds');
    if (!force && raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.at < WORLDS_TTL) { worldsCache = c; return c.map; }
    }
  } catch { /* storage unavailable - just refetch */ }

  const data = await getJSON(`${API}/worlds`);
  const list = [...(data?.worlds?.regular_worlds ?? []), ...(data?.worlds?.tournament_worlds ?? [])];
  if (!list.length) throw new Error('TibiaData returned an empty worlds list');
  const map = Object.fromEntries(list.map(w => [w.name, w]));
  worldsCache = { at: Date.now(), map };
  try { sessionStorage.setItem('tc_worlds', JSON.stringify(worldsCache)); } catch { /* storage unavailable: keep the in-memory cache */ }
  return map;
}

/*
 * BattlEye is derived from the authoritative fields, never guessed:
 *   battleye_protected === false -> Off
 *   battleye_date === "release"  -> Green  (protected since the world's release)
 *   an explicit date             -> Yellow (protected from that date onward)
 *
 * Comparing the date against the public rollout would be wrong: Luminera was
 * created in 2005-07 but reports a BattlEye date of 2017-09-05.
 */
export function battleyeColour(entry) {
  if (!entry.battleye_protected) return { colour: 'Off', since: null };
  const date = (entry.battleye_date ?? '').trim();
  if (date.toLowerCase() === 'release') return { colour: 'Green', since: 'release' };
  if (date) return { colour: 'Yellow', since: date };
  throw new Error(`World ${entry.name}: protected but no battleye_date; cannot derive colour`);
}

export async function worldInfo(worldName) {
  let worlds = await loadWorlds();
  if (!worlds[worldName]) worlds = await loadWorlds(true);
  const entry = worlds[worldName];
  if (!entry) throw new Error(`World "${worldName}" is not in the TibiaData worlds list`);
  const be = battleyeColour(entry);
  return {
    world: entry.name,
    type: entry.pvp_type,          // verbatim source terminology
    battleye: be.colour,
    battleyeSince: be.since
  };
}
