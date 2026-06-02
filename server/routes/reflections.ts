import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';

const router = Router();

// Get entries that have simulated peer responses but no reflection addendum yet
router.get('/pending', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const db = getDb();

  const entries = db.prepare(`
    SELECT je.*,
      spr.what_i_heard AS sim_what_i_heard,
      spr.what_im_wondering AS sim_what_im_wondering,
      spr.what_i_suggest AS sim_what_i_suggest
    FROM journal_entries je
    INNER JOIN simulated_peer_responses spr ON spr.journal_entry_id = je.id
    LEFT JOIN reflection_addendums ra ON ra.journal_entry_id = je.id
    WHERE je.user_pin = ? AND je.shared = 1 AND ra.id IS NULL
    ORDER BY je.created_at DESC
  `).all(userPin);

  res.json(entries);
});

router.post('/', (req: Request, res: Response) => {
  const userPin = (req as any).userPin;
  const { journal_entry_id, content } = req.body;

  if (!journal_entry_id || !content) {
    res.status(400).json({ error: 'journal_entry_id and content are required' });
    return;
  }

  const db = getDb();

  // Verify the entry belongs to the user
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ? AND user_pin = ?').get(journal_entry_id, userPin) as any;

  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // One reflection addendum per entry.
  const existing = db
    .prepare('SELECT id FROM reflection_addendums WHERE journal_entry_id = ?')
    .get(journal_entry_id);
  if (existing) {
    res.status(409).json({ error: 'You have already reflected on this entry.' });
    return;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO reflection_addendums (id, journal_entry_id, user_pin, content)
    VALUES (?, ?, ?, ?)
  `).run(id, journal_entry_id, userPin, content);

  logEvent(db, {
    user_pin: userPin,
    study_day: entry.study_day,
    condition: entry.condition,
    entry_id: journal_entry_id,
    event_type: 'reflection_added',
    payload: { char_count: content.length },
  });

  res.json({ success: true });
});

export default router;
