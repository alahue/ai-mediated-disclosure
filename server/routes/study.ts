import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';
import { decodeConditionOrder, getDayPlan } from '../study/config.js';

const router = Router();

// Returns the participant's current study-day experience: which condition and
// condition-day they are on, the day's activities, the writing prompt (if a
// focal entry is due), and the entry already written today (if any). Opening
// "today" lazily records a session row and logs a session_started event.
router.get('/today', (req: Request, res: Response) => {
  const userPin = (req as any).userPin as string;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(userPin) as any;
  if (!user) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }

  const order = decodeConditionOrder(user.condition_order);
  const studyDay = user.current_study_day ?? 0;
  const plan = getDayPlan(order, studyDay);

  // The focal entry written for today's writing slot, if it exists yet.
  let todaysEntry: any = null;
  if (plan.in_study && plan.writing_entry_index && plan.condition) {
    todaysEntry = db
      .prepare(
        `SELECT * FROM journal_entries
         WHERE user_pin = ? AND condition = ? AND entry_index = ?`
      )
      .get(userPin, plan.condition, plan.writing_entry_index) || null;
  }

  // Record a session for this study day (idempotent) and log the visit once.
  if (plan.in_study) {
    const existing = db
      .prepare('SELECT id FROM sessions WHERE user_pin = ? AND study_day = ?')
      .get(userPin, studyDay);
    if (!existing) {
      db.prepare(
        `INSERT INTO sessions (id, user_pin, study_day, condition)
         VALUES (?, ?, ?, ?)`
      ).run(uuidv4(), userPin, studyDay, plan.condition);
      logEvent(db, {
        user_pin: userPin,
        study_day: studyDay,
        condition: plan.condition,
        event_type: 'session_started',
        payload: { condition_day: plan.condition_day },
      });
    }
  }

  res.json({
    condition_order: order,
    ...plan,
    todays_entry: todaysEntry,
  });
});

export default router;
