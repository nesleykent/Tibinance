// In-memory local IPC bridge. Source names/bytes never become URLs or files.
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cleanStatistics, parseStatisticsText, statisticsIssues, statisticsReferenceDate, validTimeZone } from '../js/statistics.js';
import { acceptsScreenshotName } from '../js/filename.js';
import { INGESTION_VERSION, STAGES, preflightScreenshot } from '../js/ingestion.js';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
let browser, page;
const queuedHashes = new Set();
let activeStage = 'filename', activeHash, browserEvent = 'none';
async function start() {
  const { chromium } = require(process.env.TIBINANCE_NODE_MODULES
    ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
  browser = await chromium.launch({ headless: true,
    ...(process.env.TIBINANCE_CHROME ? { executablePath: process.env.TIBINANCE_CHROME } : { channel: 'chrome' }) });
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('crash', () => { browserEvent = 'page_crash'; });
  browser.on('disconnected', () => { browserEvent = 'disconnected'; });
  await page.exposeFunction('__ingestionStage', stage => { if (STAGES.includes(stage)) activeStage = stage; });
  await page.exposeFunction('__ingestionHash', hash => { if (/^[a-f0-9]{64}$/.test(hash)) activeHash = hash; });
  await page.route('http://127.0.0.1:8766/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({ contentType: 'text/html',
      body: '<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"></script>' });
    if (!/^\/js\/[a-z-]+\.js$/.test(pathname)) return route.abort();
    return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(pathname.slice(1), root), 'utf8') });
  });
  await page.goto('http://127.0.0.1:8766/');
  await page.waitForFunction(() => Boolean(window.Tesseract), { timeout: 60000 });
}

async function dispatch(request) {
  if (request.op === 'statistics-contract') return { statistics30d: cleanStatistics(parseStatisticsText(request.text)),
    issues: statisticsIssues(parseStatisticsText(request.text)), statisticsReferenceDate: statisticsReferenceDate(request.capturedAt, request.captureTimeZone) };
  if (request.op === 'contract') return { version: INGESTION_VERSION, stages: STAGES, localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null };
  if (request.op === 'eligibility') return { eligible: request.names.map(acceptsScreenshotName) };
  if (request.op === 'close') return { closed: true };
  if (request.op !== 'ingest') throw new Error();
  if (request.captureTimeZone != null && !validTimeZone(request.captureTimeZone)) throw new Error('Invalid capture timezone');
  activeStage = 'filename'; activeHash = undefined; browserEvent = 'none';
  const source = { name: request.name, arrayBuffer: async () => {
    const bytes = Buffer.from(request.bytes, 'base64');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } };
  const checked = await preflightScreenshot(source, {
    reprocess: request.reprocess ?? true, getExisting: async () => request.context ?? null,
    isQueued: hash => queuedHashes.has(hash), onHash: hash => { activeHash = hash; },
    onStage: stage => { activeStage = stage; }
  });
  if (checked.blocked) {
    if (checked.result.hash) queuedHashes.add(checked.result.hash);
    return { result: checked.result };
  }
  activeStage = 'market';
  if (!page) await start();
  const result = await page.evaluate(async input => {
    const { ingestScreenshot } = await import('/js/ingestion.js');
    const bytes = Uint8Array.from(atob(input.bytes), c => c.charCodeAt(0));
    const file = new File([bytes], input.name, { type: input.mimeType });
    const result = await ingestScreenshot(file, {
      reprocess: input.reprocess ?? true,
      getExisting: async () => input.context ?? null,
      correction: input.correction,
      captureTimeZone: input.captureTimeZone,
      isQueued: hash => input.queuedHashes.includes(hash),
      onHash: hash => { window.__ingestionHash(hash).catch(() => {}); },
      onStage: stage => { window.__ingestionStage(stage).catch(() => {}); }
    });
    return result;
  }, { ...request, queuedHashes: [...queuedHashes] });
  if (result.hash) queuedHashes.add(result.hash);
  // Deliberately return only the canonical anonymous result, never request data.
  return { result };
}

try {
  const input = createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    let request, response;
    try {
      request = JSON.parse(line);
      response = await dispatch(request);
    } catch (error) {
      const message = String(error?.message ?? '');
      const fault = /crash/i.test(message) ? 'browser_crash' : /closed/i.test(message) ? 'browser_closed'
        : /timeout/i.test(message) ? 'timeout' : 'transport_failure';
      if (request?.op === 'ingest' && page && ['browser_closed', 'browser_crash'].includes(fault)) {
        // A transport failure is review evidence, not a positive/negative image
        // classification. Reset only the owned browser, retaining hash reservations.
        const entered = STAGES.slice(0, STAGES.indexOf(activeStage) + 1);
        const stages = Object.fromEntries(entered.map(stage => [stage, stage !== activeStage]));
        if (activeHash) queuedHashes.add(activeHash);
        response = { result: { hash: activeHash, processingVersion: INGESTION_VERSION,
          status: 'needs_review', stages, attemptedStages: entered, offers: [], runtimeFault: fault,
          itemVerification: { status: entered.includes('metadata') ? 'tibia_coins' : 'unconfirmed' },
          issues: [{ field: activeStage, reason: 'Local execution failed; retry required.' }] } };
        await browser?.close().catch(() => {});
        browser = page = undefined;
      } else {
        response = { error: 'Local website ingestion failed; private diagnostics suppressed.', fault,
          phase: activeStage, browserEvent };
      }
    }
    process.stdout.write(JSON.stringify(response) + '\n');
    if (request?.op === 'close') break;
  }
} catch { process.exitCode = 1; }
finally { await browser?.close(); }
