// Static deployment bridge: emit only explicitly public settings, after validating every value.
import { writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createConfig, ENV_KEYS } from '../js/config.js';

const values = Object.fromEntries(ENV_KEYS.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
createConfig(values);
const target = fileURLToPath(new URL('../js/public-config.js', import.meta.url));
const content = '// Public deployment overrides, generated from the validated env whitelist. Never add credentials.\n'
  + '/** @type {Readonly<Record<string, unknown>>} */\n'
  + `export const publicConfig = Object.freeze(${JSON.stringify(values, null, 2)});\n`;
writeFileSync(`${target}.pending`, content);
renameSync(`${target}.pending`, target);
