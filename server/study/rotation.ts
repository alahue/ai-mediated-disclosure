import type Database from 'better-sqlite3';
import { decodeConditionOrder, getDayPlan, isSocialCondition, type Condition } from './config.js';

// Deterministic peer rotation (replaces greedy matching).
//
// Within a condition, the participants currently in that condition who have
// actually shared the entry for a given slot form a ring ordered by participant
// number (PIN). For entry slot s (Entry 1 is responded to on condition day 2,
// Entry 2 on day 3, Entry 3 on day 4), the participant at ring position i
// responds to the entry of the participant s positions ahead (wrapping). Because
// the ring is restricted to sharers, this guarantees every shared entry gets
// exactly one reviewer who is themselves a sharer, no reviewer is stranded on a
// peer who never shared, and — in a fully-sharing four-person pool — each
// participant reviews each of the other three exactly once across the three
// entries. Participants who did not share a given entry are simply absent from
// that slot's ring: they are neither reviewed (they wrote nothing) nor assigned
// to review, which keeps supply and demand balanced at one response per entry.

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

// The rotation ring for a given entry slot: the current condition ring, narrowed
// to participants who have actually shared that entry (i.e. hold a peer_exchanges
// row for this condition + slot). PIN order is preserved. This is the ring the
// routing actually uses, so every reviewer is a sharer and every shared entry is
// reachable by exactly one reviewer.
export function sharerRing(db: Database.Database, condition: Condition, slot: number): string[] {
  const ring = conditionRing(db, condition);
  if (ring.length === 0) return ring;
  const shared = new Set(
    (
      db
        .prepare('SELECT DISTINCT writer_pin FROM peer_exchanges WHERE condition = ? AND entry_index = ?')
        .all(condition, slot) as Array<{ writer_pin: string }>
    ).map((r) => r.writer_pin)
  );
  return ring.filter((pin) => shared.has(pin));
}

// The participant the responder should review for a given entry slot, or null if
// no valid target exists (ring too small, or the offset lands on themselves).
export function targetWriterPin(ring: string[], responderPin: string, slot: number): string | null {
  const n = ring.length;
  if (n < 2) return null;
  const i = ring.indexOf(responderPin);
  if (i < 0) return null;
  // Shift by the slot number so that, across Entries 1-3, a participant reviews
  // three distinct peers. In a full pool (n > slot) this is exactly `slot`; when
  // the sharer pool is small enough that a raw shift of `slot` would wrap onto
  // the responder themselves (slot is a multiple of n), fold the offset into
  // [1, n-1] so a valid, distinct target is always chosen.
  const offset = ((slot - 1) % (n - 1)) + 1;
  const target = ring[(i + offset) % n];
  if (target === responderPin) return null;
  return target;
}
