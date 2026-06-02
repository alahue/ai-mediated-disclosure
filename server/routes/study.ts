import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';
import { decodeConditionOrder, getDayPlan, type DayTask } from '../study/config.js';

const router = Router();

type TaskStatus = 'available' | 'done' | 'locked' | 'upcoming';

// Compute the status of a day task from the participant's stored state. Tasks
// from build phases not yet implemented (peer exchange = 3, surveys = 4) are
// surfaced as "upcoming" so participants see the full shape of the day.
function statusForTask(
  task: DayTask,
  entry: any | undefined,
  hasReflection: boolean
): TaskStatus {
  switch (task.type) {
    case 'write':
      return entry ? 'done' : 'available';
    case 'share':
      if (!entry) return 'locked';
      return entry.share_decision ? 'done' : 'available';
    case 'reflect_private':
      if (!entry) return 'locked';
      return hasReflection ? 'done' : 'available';
    default:
      // respond_peer, read_response, reflect_social, surveys — later phases.
      return 'upcoming';
  }
}

// Returns the participant's current study-day experience: the day plan, the
// day's tasks with computed status, the writing prompt, and the entry already
// written today (if any). Opening "today" lazily records a session row and logs
// a session_started event.
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

  // Entries for the current condition, keyed by focal entry index, plus the set
  // of entries that already have a reflection addendum.
  const entriesByIndex: Record<number, any> = {};
  let todaysEntry: any = null;
  if (plan.in_study && plan.condition) {
    const entries = db
      .prepare('SELECT * FROM journal_entries WHERE user_pin = ? AND condition = ?')
      .all(userPin, plan.condition) as any[];
    for (const e of entries) {
      if (e.entry_index != null) entriesByIndex[e.entry_index] = e;
    }
    if (plan.writing_entry_index) {
      todaysEntry = entriesByIndex[plan.writing_entry_index] || null;
    }
  }

  const reflectedEntryIds = new Set(
    (db.prepare('SELECT DISTINCT journal_entry_id FROM reflection_addendums WHERE user_pin = ?').all(userPin) as any[])
      .map((r) => r.journal_entry_id)
  );

  const tasks = plan.tasks.map((task) => {
    const entry = task.entry_index != null ? entriesByIndex[task.entry_index] : undefined;
    return {
      ...task,
      entry_id: entry ? entry.id : null,
      status: statusForTask(task, entry, entry ? reflectedEntryIds.has(entry.id) : false),
    };
  });

  // Record a session for this study day (idempotent) and log the visit once.
  if (plan.in_study) {
    const existing = db
      .prepare('SELECT id FROM sessions WHERE user_pin = ? AND study_day = ?')
      .get(userPin, studyDay);
    if (!existing) {
      db.prepare(
        `INSERT INTO sessions (id, user_pin, study_day, condition) VALUES (?, ?, ?, ?)`
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
    tasks,
    todays_entry: todaysEntry,
  });
});

export default router;
