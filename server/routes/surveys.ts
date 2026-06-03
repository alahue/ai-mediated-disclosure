import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';
import { decodeConditionOrder, getDayPlan, type Condition } from '../study/config.js';
import {
  getSurveyItems, LIKERT_SCALE, SURVEY_TITLES, SURVEY_INSTRUCTIONS, type SurveyType,
} from '../study/surveys.js';

const router = Router();

const SURVEY_TYPES: SurveyType[] = ['entry_experience', 'peer_response', 'condition'];

// Resolve the condition a survey applies to: from the linked entry for the
// entry-level checks, or from the participant's current condition for the
// end-of-condition survey.
function resolveCondition(db: any, user: any, type: SurveyType, entryId: string | null): Condition | null {
  if (type === 'condition') {
    const plan = getDayPlan(decodeConditionOrder(user.condition_order), user.current_study_day ?? 0);
    return plan.condition;
  }
  if (!entryId) return null;
  const entry = db.prepare('SELECT condition FROM journal_entries WHERE id = ? AND user_pin = ?').get(entryId, user.pin) as any;
  return entry ? entry.condition : null;
}

function isSubmitted(db: any, userPin: string, type: SurveyType, entryId: string | null, condition: Condition | null): boolean {
  if (type === 'condition') {
    const row = db
      .prepare("SELECT 1 FROM survey_responses WHERE user_pin = ? AND survey_type = 'condition' AND condition = ? LIMIT 1")
      .get(userPin, condition);
    return !!row;
  }
  const row = db
    .prepare('SELECT 1 FROM survey_responses WHERE user_pin = ? AND survey_type = ? AND entry_id = ? LIMIT 1')
    .get(userPin, type, entryId);
  return !!row;
}

// Returns the items for a survey, scoped to the participant's condition, plus
// whether it has already been submitted.
router.get('/definition', (req: Request, res: Response) => {
  const userPin = (req as any).userPin as string;
  const type = req.query.type as SurveyType;
  const entryId = (req.query.entry_id as string) || null;

  if (!SURVEY_TYPES.includes(type)) {
    res.status(400).json({ error: 'Unknown survey type' });
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(userPin) as any;
  const condition = resolveCondition(db, user, type, entryId);
  if (!condition) {
    res.status(400).json({ error: 'Could not determine the condition for this survey' });
    return;
  }

  const items = getSurveyItems(type, condition);
  if (items.length === 0) {
    res.status(400).json({ error: 'This survey does not apply to the current condition' });
    return;
  }

  res.json({
    survey_type: type,
    condition,
    title: SURVEY_TITLES[type],
    instructions: SURVEY_INSTRUCTIONS[type],
    scale: LIKERT_SCALE,
    items,
    submitted: isSubmitted(db, userPin, type, entryId, condition),
  });
});

// Persists one row per item. Requires every item to be answered with a valid
// 1-5 Likert value.
router.post('/submit', (req: Request, res: Response) => {
  const userPin = (req as any).userPin as string;
  const { survey_type, entry_id, responses } = req.body as {
    survey_type: SurveyType;
    entry_id?: string | null;
    responses?: Record<string, number>;
  };

  if (!SURVEY_TYPES.includes(survey_type)) {
    res.status(400).json({ error: 'Unknown survey type' });
    return;
  }
  const entryId = entry_id || null;

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(userPin) as any;
  const condition = resolveCondition(db, user, survey_type, entryId);
  if (!condition) {
    res.status(400).json({ error: 'Could not determine the condition for this survey' });
    return;
  }

  const items = getSurveyItems(survey_type, condition);
  if (items.length === 0) {
    res.status(400).json({ error: 'This survey does not apply to the current condition' });
    return;
  }

  if (isSubmitted(db, userPin, survey_type, entryId, condition)) {
    res.status(409).json({ error: 'You have already completed this survey.' });
    return;
  }

  // Validate every item has a 1-5 response.
  const values = responses || {};
  for (const item of items) {
    const v = values[item.key];
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      res.status(400).json({ error: 'Please answer every question.' });
      return;
    }
  }

  const studyDay = user.current_study_day ?? null;
  const insert = db.prepare(`
    INSERT INTO survey_responses (id, user_pin, entry_id, study_day, condition, survey_type, item_key, response_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const item of items) {
      insert.run(uuidv4(), userPin, entryId, studyDay, condition, survey_type, item.key, values[item.key]);
    }
  });
  tx();

  logEvent(db, {
    user_pin: userPin,
    study_day: studyDay,
    condition,
    entry_id: entryId,
    event_type: 'survey_submitted',
    payload: { survey_type, item_count: items.length },
  });

  res.json({ success: true });
});

export default router;
