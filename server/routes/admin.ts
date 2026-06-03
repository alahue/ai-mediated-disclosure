import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireAdmin } from '../middleware/admin-auth.js';
import { logEvent } from '../services/events.js';
import { buildExport, type ExportTier } from '../services/export.js';
import { toCsv } from '../services/csv.js';
import {
  assignConditionOrder,
  encodeConditionOrder,
  decodeConditionOrder,
  getDayPlan,
  TOTAL_STUDY_DAYS,
} from '../study/config.js';

const router = Router();

// Admin login - no middleware needed
router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid admin password' });
    return;
  }

  const db = getDb();
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  db.prepare(`
    INSERT INTO admin_sessions (token, expires_at)
    VALUES (?, ?)
  `).run(token, expiresAt);

  res.json({ token });
});

// All routes below require admin auth
router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  const db = getDb();

  const users = db.prepare(`
    SELECT u.pin, u.created_at, u.is_active, u.condition_order, u.current_study_day,
      (SELECT COUNT(*) FROM journal_entries WHERE user_pin = u.pin) as entry_count,
      (SELECT COUNT(*) FROM peer_entries WHERE target_user_pin = u.pin) as peer_entry_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all() as any[];

  // Attach the derived current-day plan so the dashboard can show study status.
  const withPlan = users.map((u) => ({
    ...u,
    day_plan: getDayPlan(decodeConditionOrder(u.condition_order), u.current_study_day ?? 0),
  }));

  res.json(withPlan);
});

router.post('/users', requireAdmin, (req: Request, res: Response) => {
  const { pin } = req.body;

  if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'A valid 4-digit PIN is required' });
    return;
  }

  const db = getDb();

  // Check if PIN already exists
  const existing = db.prepare('SELECT pin FROM users WHERE pin = ?').get(pin);
  if (existing) {
    res.status(409).json({ error: 'PIN already exists' });
    return;
  }

  // Assign a counterbalanced condition order in round-robin fashion.
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c as number;
  const order = assignConditionOrder(count);
  const encoded = encodeConditionOrder(order);

  db.prepare(
    'INSERT INTO users (pin, condition_order, current_study_day) VALUES (?, ?, 0)'
  ).run(pin, encoded);

  logEvent(db, {
    user_pin: pin,
    study_day: 0,
    event_type: 'participant_enrolled',
    payload: { condition_order: order },
  });

  res.status(201).json({ success: true, pin, condition_order: order });
});

// Advance or set a participant's current study day (admin-driven cadence).
router.post('/users/:pin/study-day', requireAdmin, (req: Request, res: Response) => {
  const { pin } = req.params;
  const { day, delta } = req.body;

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(pin) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const current = user.current_study_day ?? 0;
  let target = current;
  if (typeof day === 'number') {
    target = day;
  } else if (typeof delta === 'number') {
    target = current + delta;
  } else {
    res.status(400).json({ error: 'Provide either "day" or "delta" as a number' });
    return;
  }

  // Clamp to the valid range [0, TOTAL_STUDY_DAYS + 1]; one past the end marks
  // the study as complete.
  target = Math.max(0, Math.min(TOTAL_STUDY_DAYS + 1, Math.round(target)));

  db.prepare('UPDATE users SET current_study_day = ? WHERE pin = ?').run(target, pin);

  const plan = getDayPlan(decodeConditionOrder(user.condition_order), target);
  logEvent(db, {
    user_pin: pin,
    study_day: target,
    condition: plan.condition,
    event_type: 'study_day_changed',
    payload: { from: current, to: target },
  });

  res.json({ success: true, pin, current_study_day: target, day_plan: plan });
});

router.delete('/users/:pin', requireAdmin, (req: Request, res: Response) => {
  const { pin } = req.params;
  const db = getDb();

  const result = db.prepare('DELETE FROM users WHERE pin = ?').run(pin);

  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ success: true });
});

router.get('/users/:pin/history', requireAdmin, (req: Request, res: Response) => {
  const { pin } = req.params;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(pin) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const journalEntries = db.prepare(`
    SELECT je.*,
      p.text AS prompt_text,
      p.prompt_type AS prompt_type,
      pe.responder_pin AS peer_responder_pin,
      pe.what_i_heard AS peer_what_i_heard,
      pe.what_im_wondering AS peer_what_im_wondering,
      pe.what_i_suggest AS peer_what_i_suggest,
      pe.status AS peer_status,
      pe.responded_at AS peer_responded_at,
      pe.read_at AS peer_read_at,
      ra.content AS reflection_content
    FROM journal_entries je
    LEFT JOIN prompts p ON p.id = je.prompt_id
    LEFT JOIN peer_exchanges pe ON pe.entry_id = je.id AND pe.writer_pin = je.user_pin
    LEFT JOIN reflection_addendums ra ON ra.journal_entry_id = je.id
    WHERE je.user_pin = ?
    ORDER BY je.created_at DESC
  `).all(pin);

  const peerEntries = db.prepare(`
    SELECT pe.*,
      pr.what_i_heard, pr.what_im_wondering, pr.what_i_suggest,
      pr.created_at AS response_created_at
    FROM peer_entries pe
    LEFT JOIN peer_responses pr ON pr.peer_entry_id = pe.id
    WHERE pe.target_user_pin = ?
    ORDER BY pe.created_at DESC
  `).all(pin);

  const dayPlan = getDayPlan(decodeConditionOrder(user.condition_order), user.current_study_day ?? 0);

  res.json({ user, dayPlan, journalEntries, peerEntries });
});

// Data export (§13). Two de-identified tiers: an analysis bundle (pseudonymous
// IDs, no raw journal text) and a blinded coding export (original entries,
// condition/timestamps stripped, PII-redacted). format=json returns the whole
// tier; format=csv&table=NAME returns one table as a CSV download.
router.get('/export', requireAdmin, (req: Request, res: Response) => {
  const tier = req.query.tier as ExportTier;
  const format = (req.query.format as string) || 'json';

  if (tier !== 'analysis' && tier !== 'coding' && tier !== 'raw') {
    res.status(400).json({ error: 'tier must be "analysis", "coding", or "raw"' });
    return;
  }

  const bundle = buildExport(getDb(), tier);
  if (!bundle) {
    res.status(400).json({ error: 'Unknown export tier' });
    return;
  }

  if (format === 'csv') {
    const table = req.query.table as string;
    const t = table && bundle[table];
    if (!t) {
      res.status(400).json({ error: `Unknown table. Available: ${Object.keys(bundle).join(', ')}` });
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tier}_${table}.csv"`);
    res.send(toCsv(t.columns, t.rows));
    return;
  }

  // JSON: tables as plain row arrays, plus a manifest of available tables.
  const tables: Record<string, unknown[]> = {};
  for (const [name, t] of Object.entries(bundle)) tables[name] = t.rows;
  res.json({ tier, generated_at: new Date().toISOString(), tables: Object.keys(bundle), data: tables });
});

router.delete('/entries/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();

  const result = db.prepare('DELETE FROM journal_entries WHERE id = ?').run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
