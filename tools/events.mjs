// Shared Events boundary for repository checks and Python research consumers.
import { readFile } from 'node:fs/promises';
import { EVENTS, eventsFor, validate, lifecycleFacts, mergerAnnouncements } from '../js/events.js';
const dataset = JSON.parse(await readFile(EVENTS, 'utf8'));
const errors = validate(dataset);
if (dataset.format !== 2 || errors.length) throw new Error(errors.join('\n') || 'Unsupported Events schema');
if (process.argv.includes('--json')) console.log(JSON.stringify({ dataset, events: eventsFor(dataset), lifecycle: lifecycleFacts(dataset), mergers: mergerAnnouncements(dataset) }));
else console.log(`Canonical Events verified: ${dataset.events.length} records, ${dataset.categories.length} categories.`);
