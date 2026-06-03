import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';
import { decodeConditionOrder, getDayPlan } from '../study/config.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const db = getDb();

  const entries = db.prepare(`
    SELECT je.*,
      p.text AS prompt_text,
      p.prompt_type AS prompt_type,
      pe.what_i_heard AS peer_what_i_heard,
      pe.what_im_wondering AS peer_what_im_wondering,
      pe.what_i_suggest AS peer_what_i_suggest,
      pe.responded_at AS peer_responded_at,
      ra.content AS reflection_content
    FROM journal_entries je
    LEFT JOIN prompts p ON p.id = je.prompt_id
    LEFT JOIN peer_exchanges pe ON pe.entry_id = je.id AND pe.writer_pin = je.user_pin
    LEFT JOIN reflection_addendums ra ON ra.journal_entry_id = je.id
    WHERE je.user_pin = ?
    ORDER BY je.created_at DESC
  `).all(userPin);

  res.json(entries);
});

// Create the focal journal entry for today's writing slot. The entry is linked
// to the participant's current condition, study day, entry index, and prompt
// (§7 data linkage), and write start/complete times are recorded for the
// behavioral disclosure measures.
router.post('/', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const { content, write_start_time, write_complete_time } = req.body;

  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(userPin) as any;
  if (!user) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }

  const order = decodeConditionOrder(user.condition_order);
  const studyDay = user.current_study_day ?? 0;
  const plan = getDayPlan(order, studyDay);

  // Entries can only be written on a day with a scheduled focal-writing task.
  if (!plan.in_study || !plan.writing_entry_index || !plan.condition || !plan.prompt) {
    res.status(409).json({
      error: 'No journal entry is scheduled to be written today.',
    });
    return;
  }

  // One focal entry per (condition, entry_index) slot.
  const existing = db
    .prepare(
      `SELECT id FROM journal_entries
       WHERE user_pin = ? AND condition = ? AND entry_index = ?`
    )
    .get(userPin, plan.condition, plan.writing_entry_index);
  if (existing) {
    res.status(409).json({ error: 'You have already written this entry.' });
    return;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO journal_entries (
      id, user_pin, content,
      condition, condition_order, study_day, entry_index, prompt_id,
      write_start_time, write_complete_time,
      shared, approved
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(
    id,
    userPin,
    content,
    plan.condition,
    user.condition_order,
    studyDay,
    plan.writing_entry_index,
    plan.prompt.id,
    write_start_time || null,
    write_complete_time || new Date().toISOString()
  );

  logEvent(db, {
    user_pin: userPin,
    study_day: studyDay,
    condition: plan.condition,
    entry_id: id,
    event_type: 'entry_created',
    payload: {
      entry_index: plan.writing_entry_index,
      prompt_id: plan.prompt.id,
      char_count: content.length,
      write_start_time: write_start_time || null,
      write_complete_time: write_complete_time || null,
    },
  });

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
  res.status(201).json(entry);
});

router.put('/:id', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const { id } = req.params;
  const updates = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM journal_entries WHERE id = ? AND user_pin = ?').get(id, userPin);

  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const allowedFields = ['content', 'modified_content', 'mediator_explanation', 'mediator_warning', 'intention', 'shared', 'approved'];
  const setClauses: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  values.push(id, userPin);
  db.prepare(`UPDATE journal_entries SET ${setClauses.join(', ')} WHERE id = ? AND user_pin = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const { id } = req.params;

  const db = getDb();
  const result = db.prepare('DELETE FROM journal_entries WHERE id = ? AND user_pin = ?').run(id, userPin);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  logEvent(db, {
    user_pin: userPin,
    entry_id: id,
    event_type: 'entry_deleted',
  });

  res.json({ success: true });
});

export default router;
