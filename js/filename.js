// 2026-09-21_124317718_Character Name_Hotkey.jpeg
//  └ date ─┘ └ time ┘ └ character ┘
// Trailing digits after HHMMSS are fractions of a second and are dropped.
// Character names may contain spaces but never underscores.
// Only screenshots taken with the Tibia screenshot hotkey are accepted: the
// client's automatic captures (_SkillUp, _LevelUp, _Death, ...) fire on game
// events, not on a deliberate look at the market window.
const RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\d*_([^_]+)_Hotkey$/;
const TIBIA_RE = /^\d{4}-\d{2}-\d{2}_\d{6}\d*_[^_]+_([^_]+)$/;
const HOTKEY_MSG = 'Only screenshots taken with the Tibia screenshot hotkey are accepted. '
  + 'Open the market window and press the hotkey; the file name then ends in _Hotkey.';

export function parseFilename(name) {
  const stem = name.replace(/\.[^.]+$/, '');
  const m = RE.exec(stem);
  if (!m) {
    const auto = TIBIA_RE.exec(stem);
    if (auto) throw new Error(HOTKEY_MSG);
    throw new Error(HOTKEY_MSG);
  }
  const [, Y, Mo, D, h, mi, s, rest] = m;
  const character = rest.trim();
  if (!character) throw new Error('No character name found in the filename');
  // ISO 8601 extended format. Sorts correctly as a plain string, and carries
  // no locale ambiguity about which field is the day and which is the month.
  const capturedAt = `${Y}-${Mo}-${D}T${h}:${mi}:${s}`;
  const date = new Date(`${capturedAt}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== capturedAt) {
    throw new Error('Invalid capture timestamp');
  }
  return { character, capturedAt };
}

// The original website filename rule, without extracting private metadata.
// Python executes this JavaScript implementation through the local bridge.
export function acceptsScreenshotName(name) {
  const match = RE.exec(name.replace(/\.[^.]+$/, ''));
  return Boolean(match && match[7].trim());
}
