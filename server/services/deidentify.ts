import type Database from 'better-sqlite3';

// De-identification helpers for data export (§13). Participant PINs are mapped to
// stable pseudonymous IDs, and free text gets an automated pass that masks
// obvious direct identifiers. Automated redaction is a safety net, not a
// guarantee: human review is still required before sharing any text externally.

export type PinMap = Record<string, string>;

// Assign P01, P02, … in enrollment order so IDs are stable across export runs as
// long as the participant set is unchanged.
export function buildPinMap(db: Database.Database): PinMap {
  const rows = db
    .prepare('SELECT pin FROM users ORDER BY created_at ASC, pin ASC')
    .all() as Array<{ pin: string }>;
  const width = Math.max(2, String(rows.length).length);
  const map: PinMap = {};
  rows.forEach((r, i) => {
    map[r.pin] = 'P' + String(i + 1).padStart(width, '0');
  });
  return map;
}

export function mapPin(pinMap: PinMap, pin: string | null | undefined): string | null {
  if (!pin) return null;
  return pinMap[pin] ?? pin;
}

// Mask obvious direct identifiers in free text. Order matters (emails/URLs before
// the broad phone pattern).
export function redactText(input: string | null | undefined): string {
  if (!input) return '';
  let text = input;
  text = text.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[redacted-email]');
  text = text.replace(/\bhttps?:\/\/\S+/gi, '[redacted-url]');
  text = text.replace(/\bwww\.\S+/gi, '[redacted-url]');
  text = text.replace(/(^|[\s(])@\w{2,}/g, '$1[redacted-handle]');
  // Phone-like runs: 7+ digits possibly broken by spaces, dashes, dots, parens.
  text = text.replace(/\+?\d[\d().\-\s]{6,}\d/g, '[redacted-phone]');
  return text;
}

// Recursively replace any PIN values in a logged event payload with pseudonymous
// IDs, and rename keys ending in `_pin` to `_id`, so the de-identified event log
// never leaks raw PINs.
export function sanitizePayload(value: unknown, pinMap: PinMap): unknown {
  if (typeof value === 'string') {
    return pinMap[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizePayload(v, pinMap));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const key = k.endsWith('_pin') ? k.slice(0, -4) + '_id' : k;
      out[key] = sanitizePayload(v, pinMap);
    }
    return out;
  }
  return value;
}
