import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { mediateEntry } from '../services/mediator.js';
import { validateEntry } from '../services/validator.js';
import { logEvent } from '../services/events.js';
import { computeDisclosureMetrics } from '../services/text-metrics.js';
import { aiConfigStamp } from '../study/ai-config.js';

const router = Router();

const INTENTIONS = ['support', 'accountability', 'perspective', 'connection'];

// Load a journal entry that the participant is allowed to share: it must belong
// to them and be in a social condition (manual or AI).
function loadShareableEntry(userPin: string, entryId: string) {
  const db = getDb();
  const entry = db
    .prepare('SELECT * FROM journal_entries WHERE id = ? AND user_pin = ?')
    .get(entryId, userPin) as any;
  if (!entry) return { error: 404 as const };
  if (entry.condition !== 'manual' && entry.condition !== 'ai') {
    return { error: 400 as const };
  }
  return { entry };
}

// AI-mediated condition only: run the mediator (and validator second pass) on
// the participant's selected excerpt. Returns a suggested shared version for the
// participant to review, edit, regenerate, or reject. Nothing is shared here.
router.post('/mediate', async (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const { entryId, intention, excerpt, regenerate } = req.body;

  if (!entryId || !intention || !INTENTIONS.includes(intention)) {
    res.status(400).json({ error: 'entryId and a valid intention are required' });
    return;
  }
  if (!excerpt || typeof excerpt !== 'string' || !excerpt.trim()) {
    res.status(400).json({ error: 'A non-empty excerpt is required' });
    return;
  }

  const { entry, error } = loadShareableEntry(userPin, entryId);
  if (error === 404) { res.status(404).json({ error: 'Entry not found' }); return; }
  if (error === 400) { res.status(400).json({ error: 'This entry is not in a sharing condition' }); return; }
  if (entry.condition !== 'ai') {
    res.status(400).json({ error: 'Mediation is only available in the AI condition' });
    return;
  }

  try {
    const mediatorResult = await mediateEntry(excerpt, intention);
    const validatorResult = await validateEntry(mediatorResult.polished_entry);

    const db = getDb();
    const stamp = aiConfigStamp();

    // Persist the full mediation I/O (§8). A regeneration supersedes the prior
    // pending suggestion, which is marked 'regenerated' but kept on record.
    db.prepare(
      "UPDATE ai_mediations SET disposition = 'regenerated' WHERE entry_id = ? AND disposition = 'generated'"
    ).run(entryId);
    const attemptNo =
      ((db.prepare('SELECT COUNT(*) AS c FROM ai_mediations WHERE entry_id = ?').get(entryId) as any).c as number) + 1;
    db.prepare(`
      INSERT INTO ai_mediations (
        id, entry_id, user_pin, attempt_no, intention, input_excerpt, suggested_text,
        explanation, warning, validation_passed, validation_issues,
        model, config_version, mediator_prompt_version, validator_prompt_version, disposition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated')
    `).run(
      uuidv4(), entryId, userPin, attemptNo, intention, excerpt, mediatorResult.polished_entry,
      mediatorResult.explanation ?? null, mediatorResult.warning ?? null,
      validatorResult.passed ? 1 : 0, JSON.stringify(validatorResult.issues || []),
      stamp.model, stamp.config_version, stamp.mediator_prompt_version, stamp.validator_prompt_version
    );

    logEvent(db, {
      user_pin: userPin,
      study_day: entry.study_day,
      condition: entry.condition,
      entry_id: entryId,
      event_type: regenerate ? 'ai_regenerated' : 'ai_mediation_generated',
      payload: {
        intention,
        attempt_no: attemptNo,
        excerpt_char_count: excerpt.length,
        had_warning: !!mediatorResult.warning,
        validation_passed: validatorResult.passed,
        config_version: stamp.config_version,
      },
    });

    res.json({
      polished_entry: mediatorResult.polished_entry,
      explanation: mediatorResult.explanation,
      warning: mediatorResult.warning,
      validation_passed: validatorResult.passed,
      validation_issues: validatorResult.issues || [],
    });
  } catch (err: any) {
    console.error('Mediation error:', err);
    // §8 fallback behavior: surface the failure so the participant can retry or
    // proceed manually; never share or fabricate content on failure.
    res.status(502).json({ error: 'The AI mediator is unavailable right now. Please try again, or edit your excerpt and share it without AI changes.' });
  }
});

// Final approval at the point of disclosure. Persists the shared text and the
// entry-linked behavioral disclosure measures (§7, §9). The shared disclosure
// is now ready to be routed to a peer in Phase 3.
router.post('/approve', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const {
    entryId,
    intention,
    selected_excerpt,
    final_shared_text,
    ai_action,
    regeneration_count,
    ai_suggestion,
    explanation,
    warning,
  } = req.body;

  if (!entryId || !intention || !INTENTIONS.includes(intention)) {
    res.status(400).json({ error: 'entryId and a valid intention are required' });
    return;
  }
  if (!final_shared_text || typeof final_shared_text !== 'string' || !final_shared_text.trim()) {
    res.status(400).json({ error: 'final_shared_text is required' });
    return;
  }

  const { entry, error } = loadShareableEntry(userPin, entryId);
  if (error === 404) { res.status(404).json({ error: 'Entry not found' }); return; }
  if (error === 400) { res.status(400).json({ error: 'This entry is not in a sharing condition' }); return; }

  const db = getDb();
  const excerpt = typeof selected_excerpt === 'string' ? selected_excerpt : entry.content;
  const isAi = entry.condition === 'ai';
  const metrics = computeDisclosureMetrics({
    original: entry.content,
    selectedExcerpt: excerpt,
    finalSharedText: final_shared_text,
    aiSuggestion: isAi ? (ai_suggestion ?? null) : null,
  });

  const sharedAt = new Date().toISOString();
  const timeToShareMs = entry.write_complete_time
    ? Date.parse(sharedAt) - Date.parse(entry.write_complete_time)
    : null;
  const resolvedAiAction = isAi ? (ai_action || 'accepted') : null;

  db.prepare(`
    UPDATE journal_entries
    SET intention = ?, selected_excerpt = ?, final_shared_text = ?, modified_content = ?,
        mediator_explanation = ?, mediator_warning = ?, ai_action = ?,
        share_decision = 'shared', shared = 1, approved = 1, shared_at = ?
    WHERE id = ? AND user_pin = ?
  `).run(
    intention,
    excerpt,
    final_shared_text,
    final_shared_text,
    isAi ? (explanation ?? null) : null,
    isAi ? (warning ?? null) : null,
    resolvedAiAction,
    sharedAt,
    entryId,
    userPin
  );

  // Record the participant's disposition on the current AI suggestion (§8).
  if (isAi) {
    db.prepare(
      "UPDATE ai_mediations SET disposition = ?, final_text = ? WHERE entry_id = ? AND disposition = 'generated'"
    ).run(resolvedAiAction === 'edited' ? 'edited' : 'accepted', final_shared_text, entryId);
  }

  // Create the rotating peer exchange: the approved disclosure now enters the
  // pool to be routed to a single anonymous responder (§5).
  const exchangeId = uuidv4();
  db.prepare(`
    INSERT INTO peer_exchanges (id, condition, entry_index, writer_pin, entry_id, shared_text, intention, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(exchangeId, entry.condition, entry.entry_index, userPin, entryId, final_shared_text, intention);

  logEvent(db, {
    user_pin: userPin,
    study_day: entry.study_day,
    condition: entry.condition,
    entry_id: entryId,
    event_type: 'share_approved',
    payload: {
      intention,
      share_decision: 'shared',
      ai_action: resolvedAiAction,
      regeneration_count: isAi ? (regeneration_count ?? 0) : null,
      time_to_share_ms: timeToShareMs,
      exchange_id: exchangeId,
      ...metrics,
    },
  });

  res.json({ success: true });
});

// The participant began the sharing workflow but declined to send. Canceled
// share is itself a behavioral disclosure measure (§9), so it is logged.
router.post('/cancel', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const { entryId, intention, selected_excerpt, ai_action, regeneration_count } = req.body;

  if (!entryId) {
    res.status(400).json({ error: 'entryId is required' });
    return;
  }

  const { entry, error } = loadShareableEntry(userPin, entryId);
  if (error === 404) { res.status(404).json({ error: 'Entry not found' }); return; }
  if (error === 400) { res.status(400).json({ error: 'This entry is not in a sharing condition' }); return; }

  const db = getDb();
  db.prepare(`
    UPDATE journal_entries
    SET share_decision = 'canceled', shared = 0, approved = 0,
        intention = COALESCE(?, intention), selected_excerpt = COALESCE(?, selected_excerpt),
        ai_action = ?
    WHERE id = ? AND user_pin = ?
  `).run(
    intention || null,
    typeof selected_excerpt === 'string' ? selected_excerpt : null,
    entry.condition === 'ai' ? (ai_action || 'canceled') : null,
    entryId,
    userPin
  );

  // Mark any pending AI suggestion as canceled (kept on record).
  if (entry.condition === 'ai') {
    db.prepare(
      "UPDATE ai_mediations SET disposition = 'canceled' WHERE entry_id = ? AND disposition = 'generated'"
    ).run(entryId);
  }

  logEvent(db, {
    user_pin: userPin,
    study_day: entry.study_day,
    condition: entry.condition,
    entry_id: entryId,
    event_type: 'share_canceled',
    payload: {
      intention: intention || null,
      ai_action: entry.condition === 'ai' ? (ai_action || 'canceled') : null,
      regeneration_count: entry.condition === 'ai' ? (regeneration_count ?? 0) : null,
    },
  });

  res.json({ success: true });
});

export default router;
