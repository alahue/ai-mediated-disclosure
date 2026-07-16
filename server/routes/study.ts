import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { logEvent } from '../services/events.js';
import { decodeConditionOrder, getDayPlan, type DayTask, type Condition } from '../study/config.js';
import { sharerRing, targetWriterPin } from '../study/rotation.js';

const router = Router();

type TaskStatus = 'available' | 'done' | 'locked' | 'upcoming' | 'waiting' | 'missed';

interface TodayContext {
  studyDay: number;
  condition: string | null;
  isSocial: boolean;
  entriesByIndex: Record<number, any>; // own focal entries this condition
  reflectedEntryIds: Set<string>;
  exchangesByEntryId: Record<string, any>; // exchanges where participant is writer
  myResponderExchangesBySlot: Record<number, any>; // exchanges where participant responds
  eligiblePendingBySlot: Record<number, boolean>; // a peer entry is available to respond to
  entryExperienceDone: Set<string>; // entry_ids with a submitted entry experience check
  peerResponseDone: Set<string>; // entry_ids with a submitted peer response check
  conditionSurveyDone: Set<string>; // conditions with a submitted end-of-condition survey
}

// Compute the status of a day task from the participant's stored state. Survey
// tasks (phase 4) are surfaced as "upcoming".
function statusForTask(task: DayTask, ctx: TodayContext): TaskStatus {
  switch (task.type) {
    case 'write':
      return ctx.entriesByIndex[task.entry_index as number] ? 'done' : 'available';

    case 'share': {
      const entry = ctx.entriesByIndex[task.entry_index as number];
      if (!entry) return 'locked';
      return entry.share_decision ? 'done' : 'available';
    }

    case 'reflect_private': {
      const entry = ctx.entriesByIndex[task.entry_index as number];
      if (!entry) return 'locked';
      return ctx.reflectedEntryIds.has(entry.id) ? 'done' : 'available';
    }

    case 'respond_peer': {
      const slot = task.entry_index as number;
      const mine = ctx.myResponderExchangesBySlot[slot];
      if (mine) return mine.responded_at ? 'done' : 'available';
      return ctx.eligiblePendingBySlot[slot] ? 'available' : 'waiting';
    }

    case 'read_response': {
      const entry = ctx.entriesByIndex[task.entry_index as number];
      if (!entry) return 'missed'; // entry was never shared (e.g. canceled)
      const ex = ctx.exchangesByEntryId[entry.id];
      if (!ex) return 'missed';
      if (ex.responded_at) return ex.read_at ? 'done' : 'available';
      // No response yet: still time on the read day, missed once past it.
      const readDay = (entry.study_day as number) + 2;
      return ctx.studyDay > readDay ? 'missed' : 'waiting';
    }

    case 'reflect_social': {
      const entry = ctx.entriesByIndex[task.entry_index as number];
      if (!entry) return 'locked';
      if (ctx.reflectedEntryIds.has(entry.id)) return 'done';
      const ex = ctx.exchangesByEntryId[entry.id];
      // Reflection comes after reading the peer response.
      return ex && ex.read_at ? 'available' : 'locked';
    }

    case 'survey_entry_experience': {
      const entry = ctx.entriesByIndex[task.entry_index as number];
      if (!entry) return 'locked';
      // Fires after the writing + disclosure decision: a share/cancel decision
      // in the social conditions, or simply writing in the private condition.
      const precondition = ctx.isSocial ? !!entry.share_decision : true;
      if (!precondition) return 'locked';
      return ctx.entryExperienceDone.has(entry.id) ? 'done' : 'available';
    }

    case 'survey_peer_response': {
      const entry = ctx.entriesByIndex[task.entry_index as number];
      if (!entry) return 'missed';
      if (ctx.peerResponseDone.has(entry.id)) return 'done';
      const ex = ctx.exchangesByEntryId[entry.id];
      if (ex && ex.read_at) return 'available'; // fires after reading the response
      const readDay = (entry.study_day as number) + 2;
      return ctx.studyDay > readDay ? 'missed' : 'waiting';
    }

    case 'survey_condition':
      return ctx.condition && ctx.conditionSurveyDone.has(ctx.condition) ? 'done' : 'available';

    default:
      return 'upcoming';
  }
}

// Whether this participant's deterministic rotation target has shared the entry
// for the given slot (so a peer entry is available to respond to).
function hasEligiblePending(db: any, condition: Condition, entryIndex: number, responderPin: string): boolean {
  const ring = sharerRing(db, condition, entryIndex);
  const target = targetWriterPin(ring, responderPin, entryIndex);
  if (!target) return false;
  const ex = db
    .prepare('SELECT responder_pin FROM peer_exchanges WHERE condition = ? AND entry_index = ? AND writer_pin = ?')
    .get(condition, entryIndex, target) as any;
  if (!ex) return false;
  return ex.responder_pin === null || ex.responder_pin === responderPin;
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

  const entriesByIndex: Record<number, any> = {};
  const exchangesByEntryId: Record<string, any> = {};
  const myResponderExchangesBySlot: Record<number, any> = {};
  const eligiblePendingBySlot: Record<number, boolean> = {};
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

    if (plan.is_social) {
      const asWriter = db
        .prepare('SELECT * FROM peer_exchanges WHERE writer_pin = ? AND condition = ?')
        .all(userPin, plan.condition) as any[];
      for (const ex of asWriter) exchangesByEntryId[ex.entry_id] = ex;

      const asResponder = db
        .prepare('SELECT * FROM peer_exchanges WHERE responder_pin = ? AND condition = ?')
        .all(userPin, plan.condition) as any[];
      for (const ex of asResponder) myResponderExchangesBySlot[ex.entry_index] = ex;

      // Pre-compute respond eligibility for the slots that appear today.
      for (const task of plan.tasks) {
        if (task.type === 'respond_peer' && task.entry_index != null) {
          eligiblePendingBySlot[task.entry_index] = hasEligiblePending(
            db, plan.condition as Condition, task.entry_index, userPin
          );
        }
      }
    }
  }

  const reflectedEntryIds = new Set(
    (db.prepare('SELECT DISTINCT journal_entry_id FROM reflection_addendums WHERE user_pin = ?').all(userPin) as any[])
      .map((r) => r.journal_entry_id)
  );

  const surveyRows = db
    .prepare('SELECT DISTINCT survey_type, entry_id, condition FROM survey_responses WHERE user_pin = ?')
    .all(userPin) as any[];
  const entryExperienceDone = new Set<string>();
  const peerResponseDone = new Set<string>();
  const conditionSurveyDone = new Set<string>();
  for (const r of surveyRows) {
    if (r.survey_type === 'entry_experience' && r.entry_id) entryExperienceDone.add(r.entry_id);
    else if (r.survey_type === 'peer_response' && r.entry_id) peerResponseDone.add(r.entry_id);
    else if (r.survey_type === 'condition' && r.condition) conditionSurveyDone.add(r.condition);
  }

  const ctx: TodayContext = {
    studyDay,
    condition: plan.condition,
    isSocial: plan.is_social,
    entriesByIndex,
    reflectedEntryIds,
    exchangesByEntryId,
    myResponderExchangesBySlot,
    eligiblePendingBySlot,
    entryExperienceDone,
    peerResponseDone,
    conditionSurveyDone,
  };

  const tasks = plan.tasks.map((task) => {
    // For read/reflect-social the entry referenced is the participant's own
    // focal entry; for respond it's a slot, with no own entry to link.
    const ownEntry = task.entry_index != null ? entriesByIndex[task.entry_index] : undefined;
    const entryId = task.type === 'respond_peer' ? null : ownEntry ? ownEntry.id : null;
    return { ...task, entry_id: entryId, status: statusForTask(task, ctx) };
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
