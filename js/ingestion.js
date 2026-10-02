import { cleanStatistics, validatedStatistics, statisticsIssues, statisticsExtractionIssues, statisticsReferenceDate, validTimeZone, captureInstant } from './statistics.js';
import { acceptsScreenshotName, parseFilename } from './filename.js';
import { verifyMarket, verifyTibiaCoins, extractMarketOffers, extractMarketStatistics } from './ocr.js';
import { lookupWorld, worldInfo } from './tibiadata.js';
import { sha256 } from './hash.js';
import { analyse } from './validation.js';

// Changing the ordered ingestion contract invalidates old batch checkpoints.
export const INGESTION_VERSION = 6;
export const STAGES = ['filename', 'deduplication', 'market', 'item', 'view', 'metadata', 'world', 'extraction', 'statistics', 'validation'];
const messages = {
  filename: 'Checking capture eligibility', market: 'Locating the Market interface',
  item: 'Checking the selected Market item', view:'Identifying the Market view', metadata: 'Reading capture time',
  world: 'Resolving the world', extraction: 'Reading individual offers',
  statistics: 'Reading 30-day Statistics', validation: 'Validating offers and Statistics', deduplication: 'Checking for duplicates'
};
const failures = {
  filename: 'Only screenshots taken with the Tibia screenshot hotkey are accepted.',
  market: 'Could not verify a Market Offers or Details view.',
  item: 'Could not confirm Tibia Coins in the highlighted Items row.',
  view:'Market view could not be identified.', metadata: 'Capture metadata is invalid.', world: 'World resolution failed.',
  statistics: '30-day Statistics require review.', extraction: 'Offer extraction failed.', validation: 'Capture values require correction.',
  deduplication: 'Duplicate verification failed.'
};
let readerQueue = Promise.resolve();
async function acquireReader() {
  const previous = readerQueue;
  let release;
  readerQueue = new Promise(resolve => { release = resolve; });
  await previous;
  return release;
}

function publicRows(rows) {
  return rows.map(r => Object.fromEntries(['amount', 'price', 'total', 'endsAt'].map(k => [k, r[k] ?? null])));
}

export function prepareCapture(state) {
  const analysis = analyse(state);
  if (!analysis.ok) throw new Error('Correct the validation issues before saving.');
  const viewType = state.viewType ?? 'offers';
  const timeZone = validTimeZone(state.captureTimeZone) ? state.captureTimeZone : null;
  const instant = captureInstant(state.capturedAt, timeZone);
  const common = {
    world:state.world.world, type:state.world.type, battleye:state.world.battleye,
    hash:state.hash, capturedAt:state.capturedAt, captureDate:state.capturedAt.slice(0,10),
    captureTimeZone:timeZone, capturedAtUtc:instant === null ? null : new Date(instant).toISOString(),
    viewType, processingVersion:INGESTION_VERSION
  };
  if (viewType === 'statistics') return {...common, statisticsReferenceDate:statisticsReferenceDate(state.capturedAt,timeZone), statistics30d:validatedStatistics(state.statistics30d)};
  return {...common,
    ...Object.fromEntries(['sell','buy','sellVolume','buyVolume','goldSupply','goldDemand','sellTopAmount','buyTopAmount'].map(k => [k,analysis[k]])),
    offers:['sell','buy'].flatMap(side => publicRows(state.rows[side]).map((r,rowIndex) => {
      const end = captureInstant(r.endsAt,timeZone);
      return {...r,side,rowIndex,endsAtUtc:end === null ? null : new Date(end).toISOString()};
    }))
  };
}

// Original website preflight, shared by the browser and the Python transport.
// The Node bridge can reject duplicates without starting an OCR browser.
export async function preflightScreenshot(file, options = {}, services = {}) {
  const api = { acceptsScreenshotName, sha256, ...services };
  const result = { status: 'pending', processingVersion: INGESTION_VERSION, stages: {},
    attemptedStages: [], itemVerification: { status: 'unconfirmed' }, offers: [], issues: [] };
  let phase = 'filename';
  try {
    result.attemptedStages.push(phase); options.onStage?.(phase); options.onStep?.(messages[phase]);
    if (!api.acceptsScreenshotName(file.name)) throw new Error();
    result.stages.filename = true;
    phase = 'deduplication'; result.attemptedStages.push(phase);
    options.onStage?.(phase); options.onStep?.(messages[phase]);
    result.hash = await api.sha256(file); options.onHash?.(result.hash);
    const alreadyQueued = options.isQueued?.(result.hash);
    const existing = await options.getExisting?.(result.hash);
    if ((!options.reprocess && existing) || await alreadyQueued) {
      result.status = 'duplicate'; result.stages.deduplication = false;
      return { result, blocked: true };
    }
    result.stages.deduplication = true;
    return { result, existing, blocked: false };
  } catch {
    result.stages[phase] = false;
    result.status = phase === 'filename' ? 'excluded_automatic' : 'needs_review';
    result.error = failures[phase]; result.issues = [{ field: phase, reason: failures[phase] }];
    return { result, blocked: true };
  }
}

// Transport/storage injection never supplies another filtering policy.
export async function ingestScreenshot(file, options = {}, services = {}) {
  const api = { parseFilename, verifyMarket, verifyTibiaCoins, extractMarketOffers, extractMarketStatistics,
    lookupWorld, worldInfo, createBitmap: f => createImageBitmap(f), ...services };
  const { result, existing, blocked } = await preflightScreenshot(file, options, services);
  if (blocked) return result;
  let phase = 'deduplication', bitmap, releaseReader;
  const enter = stage => {
    phase = stage; result.attemptedStages.push(stage);
    options.onStage?.(stage); options.onStep?.(messages[stage]);
  };
  const pass = () => { result.stages[phase] = true; };
  try {
    releaseReader = await acquireReader();
    enter('market');
    bitmap = await api.createBitmap(file);
    const context = await api.verifyMarket(bitmap, options.onStep);
    pass();
    enter('item');
    await api.verifyTibiaCoins(context, options.onStep);
    result.itemVerification.status = 'tibia_coins';
    pass();
    enter('view');
    result.viewType = context.viewType ?? 'offers';
    if (!['offers','statistics'].includes(result.viewType)) throw new Error();
    pass();
    enter('metadata');
    let { character, capturedAt } = api.parseFilename(file.name);
    result.capturedAt = capturedAt;
    pass();
    enter('world');
    const world = existing
      ? { world: existing.world, type: existing.type, battleye: existing.battleye }
      : await api.worldInfo(await api.lookupWorld(character));
    character = undefined;
    if (!world?.world || !world.type || !world.battleye) throw new Error();
    result.world = { world: world.world, type: world.type, battleye: world.battleye };
    result.capturedAt = existing?.capturedAt ?? capturedAt;
    result.captureTimeZone = existing?.captureTimeZone ?? options.captureTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    pass();
    if (result.viewType === 'offers') {
      enter('extraction');
      const reading = await api.extractMarketOffers(context, options.onStep);
      result.rows = { sell: publicRows(reading.sell ?? []), buy: publicRows(reading.buy ?? []) };
      result.ocrWarnings = [...(reading.warnings ?? [])];
      result.ocrNotices = [...(reading.notices ?? [])];
      // Complete explicit corrections cannot override filename, Market or item gates.
      if (options.correction?.offers) {
        result.rows = Object.fromEntries(['sell', 'buy'].map(side => [side,
          publicRows(options.correction.offers.filter(r => r.side === side))]));
        result.ocrWarnings = [];
      }
      pass();
    } else {
      result.rows = {sell:[],buy:[]};
      enter('statistics');
      // A failed Statistics read leaves the Statistics editor available for review.
      try { result.statistics30d = cleanStatistics(await api.extractMarketStatistics(context, options.onStep)); }
      catch { result.statistics30d = null; }
      if (options.correction?.statistics30d !== undefined) {
        result.statistics30d = cleanStatistics(options.correction.statistics30d);
      }
      const extractionIssues = statisticsExtractionIssues(result.statistics30d);
      result.stages.statistics = extractionIssues.length === 0;
      if (extractionIssues.length) {
        result.status = 'needs_review';
        result.issues = extractionIssues;
        result.analysis = analyse(result);
        return result;
      }
    }
    enter('validation');
    result.analysis = analyse(result);
    if (!result.analysis.ok) {
      result.status = 'needs_review'; result.stages.validation = false;
      result.issues = [...(result.viewType === 'statistics' ? statisticsIssues(result.statistics30d) : []), ...(result.analysis.offerOk ? [] : [{ field: 'row', reason: failures.validation }])];
      if (!result.issues.length) result.issues = [{field:'validation',reason:failures.validation}];
      return result;
    }
    result.capture = prepareCapture(result);
    result.offers = result.capture.offers ?? [];
    pass();
    result.status = 'ready'; result.reprocess = Boolean(existing);
    return result;
  } catch (error) {
    result.stages[phase] = false;
    result.status = ({ filename: 'excluded_automatic', market: 'excluded_market', item: 'unclassifiable',
      metadata: 'needs_review', world: 'needs_review', extraction: 'needs_review' })[phase] ?? 'needs_review';
    if (phase === 'item' && error?.code === 'other_item') {
      result.status = 'excluded_other_item'; result.itemVerification.status = 'other_item';
    }
    result.error = failures[phase];
    result.issues = [{ field: phase === 'metadata' ? 'capturedAt' : phase === 'item' ? 'selectedItem' : phase,
      reason: failures[phase] }];
    return result;
  } finally {
    bitmap?.close?.();
    releaseReader?.();
  }
}
