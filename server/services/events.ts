import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

// Append-only event logging spine. Behavioral disclosure is a primary outcome
// (§7, §9), so events are recorded uniformly here and exported for analysis in
// a later phase. Logging must never break a request, so failures are swallowed
// after being reported to the server console.

export interface EventInput {
  user_pin?: string | null;
  study_day?: number | null;
  condition?: string | null;
  entry_id?: string | null;
  event_type: string;
  payload?: unknown;
}

export function logEvent(db: Database.Database, event: EventInput): void {
  try {
    db.prepare(
      `INSERT INTO events (id, user_pin, study_day, condition, entry_id, event_type, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      event.user_pin ?? null,
      event.study_day ?? null,
      event.condition ?? null,
      event.entry_id ?? null,
      event.event_type,
      event.payload === undefined ? null : JSON.stringify(event.payload)
    );
  } catch (err) {
    console.error('Failed to log event', event.event_type, err);
  }
}
