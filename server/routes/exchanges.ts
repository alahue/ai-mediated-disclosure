import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';
import { decodeConditionOrder, getDayPlan } from '../study/config.js';

const router = Router();

// Minimum lengths for the structured peer-response template (§11 lightweight
// completion rules). "What I suggest" may be a short "no suggestion".
const MIN_HEARD = 10;
const MIN_WONDERING = 10;
const MIN_SUGGEST = 2;

// The participant's currently-active social condition, or null.
function currentSocialCondition(user: any): string | null {
  const order = decodeConditionOrder(user.condition_order);
  const plan = getDayPlan(order, user.current_study_day ?? 0);
  return plan.is_social ? plan.condition : null;
}

// Find a pending exchange the responder is eligible to take: same condition and
// entry index, written by someone else, and not a repeated pairing within this
// condition (§5: avoid pairing the same two participants more than once).
function findEligibleExchange(db: any, condition: string, entryIndex: number, responderPin: string) {
  return db
    .prepare(
      `SELECT * FROM peer_exchanges pe
       WHERE pe.condition = ? AND pe.entry_index = ? AND pe.responder_pin IS NULL
         AND pe.status = 'pending' AND pe.writer_pin != ?
         AND pe.writer_pin NOT IN (
           SELECT writer_pin FROM peer_exchanges WHERE condition = ? AND responder_pin = ?
           UNION
           SELECT responder_pin FROM peer_exchanges WHERE condition = ? AND writer_pin = ? AND responder_pin IS NOT NULL
         )
       ORDER BY pe.created_at ASC
       LIMIT 1`
    )
    .get(condition, entryIndex, responderPin, condition, responderPin, condition, responderPin);
}

// Public shape of an exchange for a responder (writer stays anonymous).
function toRespondView(ex: any) {
  return {
    id: ex.id,
    entry_index: ex.entry_index,
    shared_text: ex.shared_text,
    intention: ex.intention,
    peer_label: 'A peer',
    already_responded: !!ex.responded_at,
    what_i_heard: ex.what_i_heard,
    what_im_wondering: ex.what_im_wondering,
    what_i_suggest: ex.what_i_suggest,
  };
}

// Claim (assign) a peer entry to respond to for the given slot (peer entry
// index). Idempotent: if the participant already holds an exchange for this
// slot, it is returned. Returns 404 with code "no_peer_available" if the pool
// is empty for this slot.
router.post('/claim', (req: Request, res: Response) => {
  const userPin = (req as any).userPin as string;
  const entryIndex = Number(req.body?.entry_index);
  if (!Number.isInteger(entryIndex) || entryIndex < 1 || entryIndex > 3) {
    res.status(400).json({ error: 'A valid entry_index (1-3) is required' });
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(userPin) as any;
  const condition = currentSocialCondition(user);
  if (!condition) {
    res.status(400).json({ error: 'You are not currently in a peer-sharing condition' });
    return;
  }

  // Already holding one for this slot? Return it.
  const existing = db
    .prepare(
      `SELECT * FROM peer_exchanges WHERE responder_pin = ? AND condition = ? AND entry_index = ?`
    )
    .get(userPin, condition, entryIndex) as any;
  if (existing) {
    res.json({ exchange: toRespondView(existing) });
    return;
  }

  // Assign the oldest eligible pending exchange, guarding against races by only
  // updating while it is still unassigned.
  const assign = db.transaction(() => {
    const candidate = findEligibleExchange(db, condition, entryIndex, userPin) as any;
    if (!candidate) return null;
    const result = db
      .prepare(
        `UPDATE peer_exchanges SET responder_pin = ?, status = 'assigned', assigned_at = datetime('now')
         WHERE id = ? AND responder_pin IS NULL`
      )
      .run(userPin, candidate.id);
    if (result.changes === 0) return null;
    return db.prepare('SELECT * FROM peer_exchanges WHERE id = ?').get(candidate.id);
  });

  const assigned = assign() as any;
  if (!assigned) {
    res.status(404).json({ error: 'no_peer_available' });
    return;
  }

  logEvent(db, {
    user_pin: userPin,
    study_day: user.current_study_day ?? null,
    condition,
    entry_id: assigned.entry_id,
    event_type: 'peer_assigned',
    payload: { exchange_id: assigned.id, entry_index: entryIndex, writer_pin: assigned.writer_pin },
  });

  res.json({ exchange: toRespondView(assigned) });
});

// Submit the structured peer response for an assigned exchange.
router.post('/:id/respond', (req: Request, res: Response) => {
  const userPin = (req as any).userPin as string;
  const { id } = req.params;
  const what_i_heard = (req.body?.what_i_heard ?? '').trim();
  const what_im_wondering = (req.body?.what_im_wondering ?? '').trim();
  const what_i_suggest = (req.body?.what_i_suggest ?? '').trim();

  if (what_i_heard.length < MIN_HEARD || what_im_wondering.length < MIN_WONDERING || what_i_suggest.length < MIN_SUGGEST) {
    const tooShort: string[] = [];
    if (what_i_heard.length < MIN_HEARD) tooShort.push('“What I heard”');
    if (what_im_wondering.length < MIN_WONDERING) tooShort.push('“What I am wondering”');
    if (what_i_suggest.length < MIN_SUGGEST) tooShort.push('“What I suggest”');
    res.status(400).json({
      error: `Please write a little more for: ${tooShort.join(', ')}. For the suggestion you can write "No suggestion" if one isn't appropriate.`,
    });
    return;
  }

  const db = getDb();
  const ex = db.prepare('SELECT * FROM peer_exchanges WHERE id = ?').get(id) as any;
  if (!ex || ex.responder_pin !== userPin) {
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }
  if (ex.responded_at) {
    res.status(409).json({ error: 'You have already responded to this entry' });
    return;
  }

  db.prepare(
    `UPDATE peer_exchanges
     SET what_i_heard = ?, what_im_wondering = ?, what_i_suggest = ?,
         status = 'responded', responded_at = datetime('now')
     WHERE id = ?`
  ).run(what_i_heard, what_im_wondering, what_i_suggest, id);

  logEvent(db, {
    user_pin: userPin,
    condition: ex.condition,
    entry_id: ex.entry_id,
    event_type: 'peer_response_submitted',
    payload: {
      exchange_id: id,
      writer_pin: ex.writer_pin,
      heard_len: what_i_heard.length,
      wondering_len: what_im_wondering.length,
      suggest_len: what_i_suggest.length,
    },
  });

  res.json({ success: true });
});

// The writer reads the peer response to their own entry. Marks the read
// timestamp the first time it is read (§7 peer response read timestamp).
router.get('/for-entry/:entryId', (req: Request, res: Response) => {
  const userPin = (req as any).userPin as string;
  const { entryId } = req.params;

  const db = getDb();
  const ex = db
    .prepare('SELECT * FROM peer_exchanges WHERE entry_id = ? AND writer_pin = ?')
    .get(entryId, userPin) as any;

  if (!ex) {
    res.json({ exists: false, responded: false });
    return;
  }

  if (!ex.responded_at) {
    res.json({ exists: true, responded: false, status: ex.status });
    return;
  }

  if (!ex.read_at) {
    db.prepare("UPDATE peer_exchanges SET read_at = datetime('now') WHERE id = ?").run(ex.id);
    logEvent(db, {
      user_pin: userPin,
      condition: ex.condition,
      entry_id: entryId,
      event_type: 'peer_response_read',
      payload: { exchange_id: ex.id },
    });
  }

  res.json({
    exists: true,
    responded: true,
    peer_label: 'Your peer',
    intention: ex.intention,
    what_i_heard: ex.what_i_heard,
    what_im_wondering: ex.what_im_wondering,
    what_i_suggest: ex.what_i_suggest,
  });
});

export default router;
