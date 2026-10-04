# OCR batch isolation investigation — 2026-10-04

No cross-image recognition, geometry or capture-context contamination was found.
The earlier wording, “reused Chrome OCR batches may require isolation”, conflated
an automated Chrome process closing with reuse of OCR state. Extraction remains
unchanged. Browser process lifetime remains an operational limitation on this
machine; its native shutdown cause has not been established.

## What is reused

`tools/website_pipeline.py` keeps one Node IPC process. By default,
`tools/website_ingestion.mjs` keeps one Chrome process, browser context and page
across sequential requests. The website also processes a queue in one page.
Neither path keeps a Tesseract worker across eligible screenshots:

- `js/ingestion.js` serializes readers until bitmap closure and awaited
  `disposeOcr()` finish, including extraction failures.
- `js/ocr.js` clears `workerPromise` and terminates the worker. The next image
  initializes a new engine, rather than inheriting recognition parameters,
  learned recognition state or its WASM heap.
- Full-image canvases, anchors, table boundaries, header geometry, crop pixels,
  readings and Statistics candidates belong to that invocation's context.
  `reuseGeometry()` borrows a header from the other table **in the same image**.
- Each invocation creates its own result and receives its own explicit existing
  capture context. The bridge resets active stage, hash, context and browser
  event before each request; stage bindings mutate synchronously when delivered.
  Requests are awaited serially. There is no recognition-result cache.
- `queuedHashes` intentionally survives requests to reject duplicate bytes. It
  stores identities, not OCR values or geometry. Browser library/language caches
  are reusable resources, not prior screenshot readings.

This establishes application-level isolation. It does not promise a browser
cannot fail or that OCR can read every possible image correctly.

## Reproduction and controls

Original bytes were located privately by fixture hash. Only anonymous case
numbers, lifecycle counts and process diagnostics were logged. No screenshots,
private filenames or character names were added to the repository.
The local runtime was macOS 27.0.1, Chrome 154.0.8037.97 and Playwright 1.62.1.

| Experiment before implementation changes | Result |
| --- | --- |
| Existing shared Chrome regression | First image exactly correct; Chrome closes during the second image's Market stage |
| Instrumented shared Chrome | One worker created and terminated for the first image; process exits with code 0 and no signal during the second |
| Fresh page per image, same Chrome process | Same closure on the second image |
| Fresh context per image, same Chrome process | Same closure on the second image |
| Interrupted second image alone | Exactly matches independent ground truth |
| Blank Chrome page, no application or OCR, `launchServer` | Process exits with code 0 after 32,134 ms |
| Blank Chrome page, exact production `chromium.launch` path | Disconnects after 32,151 ms; disconnected at the 45-second check |

The no-OCR controls establish that screenshot reuse is not necessary for the
observed closure. Sampled renderer memory decreased before one closure; there
was no page-crash event or demonstrated OCR heap exhaustion. Those observations
do **not** establish a native Chrome memory or policy diagnosis. We do not change
extraction or force browser rotation based on an unproven diagnosis. The existing
`--isolate-browser` option is a practical workaround when individual images
finish before the process exits, not a correction to contaminated readings.

## Coverage and verification

The existing real-image harness now asserts that every accepted image creates
exactly one fresh OCR worker and terminates it before ingestion returns. Its
independent value checks remain unchanged. A new queue test holds cleanup open,
queues a different image, and checks that decoding waits and that hash, world,
timestamp, geometry context and rows belong to the second image, after both a
successful first extraction and a failed one. Removing the cleanup `await` in a
temporary copy makes this test fail; the repository implementation is unchanged.

The eleven original-image fixtures and two historical controls pass, together
with a repeat of the first image after the mixed Offers/Statistics sequence.
Shared WebKit exercises reuse; isolated Chrome exercises the operational
workaround. The original shared Chrome run remains a reproduced runtime failure,
not a passing test or an extraction discrepancy.

Full JavaScript tests: 80 passing. Python tools: 59 run, one optional browser test
skipped. Pinned research tests: 37 passing. Research reproducibility, forecast
ledger validation and deterministic Market history checks pass. Report arithmetic,
findings and compatibility checks pass. Local detailed evidence is retained in
the ignored `data/rebuilt-market/20261004-chrome-batch-investigation/` directory.
The Chrome report-export browser test was also interrupted by process closure;
this failure is not counted as a pass. Running its unchanged assertions using
WebKit passed all 71 export figures in each language (142 total).

With Playwright available via `TIBINANCE_NODE_MODULES`, reproduce the default
mixed sequence using `TIBINANCE_SCREENSHOT_DIR=screenshots
TIBINANCE_BROWSER=webkit node tests/ocr-review-browser.mjs`. For Chrome, replace
`TIBINANCE_BROWSER=webkit` with `TIBINANCE_ISOLATE_BROWSER=1`. Omitting both tests
the shared Chrome process and reproduces the local runtime limitation.

## Published captures

No evidence links this closure to an incorrect ready capture. The bridge turns
browser closure into an explicit review result with empty offers, rather than
publishing values from another image. The previous 467-capture batch completed
using isolated browser processing and independent fixture verification.

All pre-investigation files under public `data/` and `reports/tc-cycle/` are checked
against their saved SHA-256 baseline. None of the 467 captures, frozen inputs,
published results or forecast ledger entries is rewritten by this investigation.
There is no evidence that any of the 467 published captures is affected. The
remaining limitation is unexplained automated Chrome process shutdown on this
machine, not a demonstrated need to isolate recognition between screenshots.
