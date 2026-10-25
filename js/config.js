/*
 * Public application settings. Static hosting has no process.env: tools/write_public_config.mjs validates a
 * whitelist of deployment environment variables and writes js/public-config.js. Defaults preserve the shipped
 * behavior. Credentials are never accepted or serialized by that tool.
 */
import { publicConfig } from './public-config.js';

/** @typedef {'1M'|'3M'|'6M'|'YTD'|'1Y'|'All'} Range */
/**
 * @typedef {Readonly<{
 *   apiBaseUrl: string, worldsCacheMs: number, onlineRefreshMs: number, downloadRevokeMs: number,
 *   announcementDelayMs: number, defaultWorld: string, marketRange: Range, economyRange: Range,
 *   staleDays: number
 * }>} AppConfig
 */
export const ENV_KEYS = Object.freeze([
  'TIBINANCE_API_BASE_URL', 'TIBINANCE_WORLDS_CACHE_MS', 'TIBINANCE_ONLINE_REFRESH_MS',
  'TIBINANCE_DOWNLOAD_REVOKE_MS', 'TIBINANCE_ANNOUNCEMENT_DELAY_MS', 'TIBINANCE_DEFAULT_WORLD',
  'TIBINANCE_MARKET_RANGE', 'TIBINANCE_ECONOMY_RANGE', 'TIBINANCE_STALE_DAYS'
]);
const RANGES = new Set(['1M', '3M', '6M', 'YTD', '1Y', 'All']);

/** @param {Readonly<Record<string, unknown>>} env @param {string} key @param {string} fallback */
function text(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be nonempty text`);
  return value.trim();
}

/** @param {Readonly<Record<string, unknown>>} env @param {string} key @param {number} fallback @param {number} max */
function integer(env, key, fallback, max) {
  const raw = text(env, key, String(fallback));
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${key} must be an integer from 1 to ${max}`);
  return value;
}

/** @param {Readonly<Record<string, unknown>>} env @param {string} key @param {Range} fallback @returns {Range} */
function range(env, key, fallback) {
  const value = text(env, key, fallback);
  if (!RANGES.has(value)) throw new Error(`${key} must be one of ${[...RANGES].join(', ')}`);
  return /** @type {Range} */ (value);
}

/** @param {Readonly<Record<string, unknown>>} [env] @returns {AppConfig} */
export function createConfig(env = {}) {
  const base = text(env, 'TIBINANCE_API_BASE_URL', 'https://api.tibiadata.com/v5');
  let url;
  try { url = new URL(base); } catch { throw new Error('TIBINANCE_API_BASE_URL must be an absolute HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('TIBINANCE_API_BASE_URL must use HTTPS without credentials, query or fragment');
  }
  const defaultWorld = text(env, 'TIBINANCE_DEFAULT_WORLD', 'Antica');
  if (!/^[A-Za-z][A-Za-z0-9 -]{0,39}$/.test(defaultWorld)) throw new Error('TIBINANCE_DEFAULT_WORLD must be a world name');
  return Object.freeze({
    apiBaseUrl: url.href.replace(/\/+$/, ''),
    worldsCacheMs: integer(env, 'TIBINANCE_WORLDS_CACHE_MS', 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000),
    onlineRefreshMs: integer(env, 'TIBINANCE_ONLINE_REFRESH_MS', 5 * 60 * 1000, 24 * 60 * 60 * 1000),
    downloadRevokeMs: integer(env, 'TIBINANCE_DOWNLOAD_REVOKE_MS', 10000, 60 * 1000),
    announcementDelayMs: integer(env, 'TIBINANCE_ANNOUNCEMENT_DELAY_MS', 700, 5000),
    defaultWorld,
    marketRange: range(env, 'TIBINANCE_MARKET_RANGE', '1Y'),
    economyRange: range(env, 'TIBINANCE_ECONOMY_RANGE', 'All'),
    staleDays: integer(env, 'TIBINANCE_STALE_DAYS', 7, 365)
  });
}

export const config = createConfig(publicConfig);
