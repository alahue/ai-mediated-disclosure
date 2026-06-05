import type Database from 'better-sqlite3';
import { decodeConditionOrder, getDayPlan, isSocialCondition, type Condition } from './config.js';

// Deterministic peer rotation (replaces greedy matching).
//
// Within a condition, the participants currently in that condition form a ring
// ordered by participant number (PIN). For entry slot s (Entry 1 is responded to
// on condition day 2, Entry 2 on day 3, Entry 3 on day 4), the participant at
// ring position i responds to the entry of the participant s positions ahead
// (wrapping). This guarantees every shared entry gets exactly one reviewer, no
// participant is stranded, and — in a four-person pool — each participant reviews
// each of the other three exactly once across the three entries.

// The rotation ring for a social condition: participants whose current condition
// is `condition`, ordered by PIN ascending.
export function conditionRing(db: Database.Database, condition: Condition): string[] {
  const users = db
    .prepare('SELECT pin, condition_order, current_study_day FROM users WHERE is_active = 1')
    .all() as Array<{ pin: string; condition_order: string | null; current_study_day: number }>;
  const ring: string[] = [];
  for (const u of users) {
    if (!isSocialCondition(condition)) continue;
    const plan = getDayPlan(decodeConditionOrder(u.condition_order), u.current_study_day ?? 0);
    if (plan.condition === condition && plan.is_social) ring.push(u.pin);
  }
  ring.sort(); // PINs are fixed-width strings, so lexical sort == numeric order
  return ring;
}

// The participant the responder should review for a given entry slot, or null if
// no valid target exists (ring too small, or the offset lands on themselves).
export function targetWriterPin(ring: string[], responderPin: string, slot: number): string | null {
  const n = ring.length;
  if (n < 2) return null;
  const i = ring.indexOf(responderPin);
  if (i < 0) return null;
  const target = ring[(i + slot) % n];
  if (target === responderPin) return null;
  return target;
}
