// 2026-09-21_124317718_Royal Flyn_Hotkey.jpeg
//  └ date ─┘ └ time ┘ └ character ┘
// Trailing digits after HHMMSS are fractions of a second and are dropped.
// Character names may contain spaces but never underscores.
const RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\d*_(.+)$/;

export function parseFilename(name) {
  const stem = name.replace(/\.[^.]+$/, '');
  const m = RE.exec(stem);
  if (!m) {
    throw new Error('Filename must look like 2026-09-21_124317718_Character Name_Hotkey.jpeg');
  }
  const [, Y, Mo, D, h, mi, s, rest] = m;
  const character = rest.split('_')[0].trim();
  if (!character) throw new Error('No character name found in the filename');
  // ISO 8601 extended format. Sorts correctly as a plain string, and carries
  // no locale ambiguity about which field is the day and which is the month.
  return { character, capturedAt: `${Y}-${Mo}-${D}T${h}:${mi}:${s}` };
}
