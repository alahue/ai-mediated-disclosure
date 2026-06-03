// Study design constants and helpers for the AI-Mediated Disclosure
// peer journaling study (CHI Study Design v4).
//
// This module is the single source of truth for the experimental structure:
// the three conditions, the six counterbalanced condition orders, the matched
// daily writing prompts, and the per-study-day activity plan. Backend routes
// derive a participant's "current day" experience from these definitions so the
// experimental structure stays consistent and is logged uniformly.

export type Condition = 'private' | 'manual' | 'ai';

export const CONDITIONS: Condition[] = ['private', 'manual', 'ai'];

export const CONDITION_LABELS: Record<Condition, string> = {
  private: 'Private journaling',
  manual: 'Manual peer sharing',
  ai: 'AI-mediated peer sharing',
};

// A social condition is one in which the entry may be shared with a peer.
export function isSocialCondition(condition: Condition): boolean {
  return condition === 'manual' || condition === 'ai';
}

// The six fully counterbalanced condition orders (one condition per week).
// Participants are assigned in round-robin order so order cells stay balanced.
export const CONDITION_ORDERS: Condition[][] = [
  ['private', 'manual', 'ai'],
  ['private', 'ai', 'manual'],
  ['manual', 'private', 'ai'],
  ['manual', 'ai', 'private'],
  ['ai', 'private', 'manual'],
  ['ai', 'manual', 'private'],
];

// Study structure (revised v4: three focal entries per condition, five days
// per condition, three conditions).
export const ENTRIES_PER_CONDITION = 3;
export const DAYS_PER_CONDITION = 5;
export const CONDITIONS_PER_STUDY = 3;
export const TOTAL_STUDY_DAYS = DAYS_PER_CONDITION * CONDITIONS_PER_STUDY; // 15

export interface StudyPrompt {
  id: string;
  entry_index: number; // 1..ENTRIES_PER_CONDITION
  prompt_type: string;
  text: string;
}

// Matched daily writing prompt schedule (Appendix A). The same three prompt
// types are used in each condition week, in the same within-week order.
export const PROMPTS: StudyPrompt[] = [
  {
    id: 'prompt-1',
    entry_index: 1,
    prompt_type: 'recent_manageable_challenge',
    text: 'Describe a recent challenge that felt manageable. What made it challenging, and what did you learn from it?',
  },
  {
    id: 'prompt-2',
    entry_index: 2,
    prompt_type: 'decision_or_tradeoff',
    text: 'Describe a decision or tradeoff you faced recently. What values or priorities shaped your thinking?',
  },
  {
    id: 'prompt-3',
    entry_index: 3,
    prompt_type: 'another_perspective',
    text: 'Describe a situation where another perspective might help you think differently. What kind of perspective would be useful?',
  },
];

export function getPromptForEntryIndex(entryIndex: number): StudyPrompt | null {
  return PROMPTS.find((p) => p.entry_index === entryIndex) || null;
}

// ---------------------------------------------------------------------------
// Condition order encoding/decoding
// ---------------------------------------------------------------------------

export function encodeConditionOrder(order: Condition[]): string {
  return order.join(',');
}

export function decodeConditionOrder(encoded: string | null | undefined): Condition[] | null {
  if (!encoded) return null;
  const parts = encoded.split(',').map((p) => p.trim()) as Condition[];
  if (parts.length !== CONDITIONS_PER_STUDY) return null;
  if (!parts.every((p) => CONDITIONS.includes(p))) return null;
  return parts;
}

// Round-robin assignment so that, with N completers, order cells stay balanced.
export function assignConditionOrder(existingParticipantCount: number): Condition[] {
  return CONDITION_ORDERS[existingParticipantCount % CONDITION_ORDERS.length];
}

// ---------------------------------------------------------------------------
// Study-day plan
// ---------------------------------------------------------------------------

export interface DayPlan {
  study_day: number;
  in_study: boolean; // a real study day (1..15)
  not_started: boolean; // day 0, onboarding/pending
  complete: boolean; // past the final study day
  week: number | null; // 1..3
  condition: Condition | null;
  condition_label: string | null;
  condition_day: number | null; // 1..5 within the condition week
  is_social: boolean;
  is_survey_day: boolean; // condition_day === 5
  writing_entry_index: number | null; // 1..3 if a focal entry is written today
  prompt: StudyPrompt | null;
  tasks: DayTask[]; // structured, phase-tagged tasks for the day
  activities: string[]; // human-readable labels (derived from tasks)
}

// The kinds of tasks a participant can encounter in a daily session.
export type TaskType =
  | 'write'
  | 'share'
  | 'reflect_private'
  | 'respond_peer'
  | 'read_response'
  | 'reflect_social'
  | 'survey_entry_experience'
  | 'survey_peer_response'
  | 'survey_condition';

export interface DayTask {
  key: string; // unique within the day, e.g. 'write-1'
  type: TaskType;
  label: string;
  entry_index: number | null; // the focal entry this task concerns, if any
  phase: 1 | 2 | 3 | 4; // build phase in which this task becomes actionable
}

// Which focal entry (if any) is written on a given day within a condition week.
// Entries 1-3 are written on condition days 1-3; days 4-5 are reflection/survey.
function writingEntryIndexForConditionDay(conditionDay: number): number | null {
  if (conditionDay >= 1 && conditionDay <= ENTRIES_PER_CONDITION) return conditionDay;
  return null;
}

// Structured task list for a given condition day, mirroring the procedure
// tables in §7. Each task carries the build phase in which it becomes
// actionable so the UI can present later-phase tasks as upcoming.
function tasksForDay(condition: Condition, conditionDay: number): DayTask[] {
  const social = isSocialCondition(condition);
  const shareVerb = condition === 'ai' ? 'Mediate and share' : 'Share';
  const writeIdx = writingEntryIndexForConditionDay(conditionDay);

  const tasks: DayTask[] = [];

  // Reading a peer's response to a prior entry (+ its peer-response check and
  // social reflection) happens on the days after that entry was shared.
  // Entry N is shared on condition day N and read on condition day N+2.
  const readEntryIndex = conditionDay >= 3 ? conditionDay - 2 : null;
  if (social && readEntryIndex) {
    tasks.push({
      key: `read-${readEntryIndex}`,
      type: 'read_response',
      label: `Read the peer response to your Entry ${readEntryIndex}`,
      entry_index: readEntryIndex,
      phase: 3,
    });
    tasks.push({
      key: `survey-pr-${readEntryIndex}`,
      type: 'survey_peer_response',
      label: `Peer response check (Entry ${readEntryIndex})`,
      entry_index: readEntryIndex,
      phase: 4,
    });
    tasks.push({
      key: `reflect-social-${readEntryIndex}`,
      type: 'reflect_social',
      label: `Reflect on your Entry ${readEntryIndex} after the response`,
      entry_index: readEntryIndex,
      phase: 3,
    });
  }

  // Private-condition delayed reflection on the previous day's entry.
  if (!social && conditionDay >= 2 && conditionDay <= ENTRIES_PER_CONDITION + 1) {
    const reflectIdx = conditionDay - 1;
    tasks.push({
      key: `reflect-${reflectIdx}`,
      type: 'reflect_private',
      label: `Reflect on your Entry ${reflectIdx} (optional)`,
      entry_index: reflectIdx,
      phase: 2,
    });
  }

  // Responding to a (different) peer's shared entry on social days 2-4. The
  // entry_index here is the *peer's* entry index being responded to (E1 on day
  // 2, E2 on day 3, E3 on day 4), used to draw from the matching rotation pool.
  if (social && conditionDay >= 2 && conditionDay <= 4) {
    const respondSlot = conditionDay - 1;
    tasks.push({
      key: `respond-${respondSlot}`,
      type: 'respond_peer',
      label: `Respond to a peer's entry`,
      entry_index: respondSlot,
      phase: 3,
    });
  }

  // Writing today's focal entry.
  if (writeIdx) {
    tasks.push({
      key: `write-${writeIdx}`,
      type: 'write',
      label: `Write Entry ${writeIdx}`,
      entry_index: writeIdx,
      phase: 1,
    });
    if (social) {
      tasks.push({
        key: `share-${writeIdx}`,
        type: 'share',
        label: `${shareVerb} Entry ${writeIdx}`,
        entry_index: writeIdx,
        phase: 2,
      });
    }
    tasks.push({
      key: `survey-ee-${writeIdx}`,
      type: 'survey_entry_experience',
      label: `Entry experience check (Entry ${writeIdx})`,
      entry_index: writeIdx,
      phase: 4,
    });
  }

  // End-of-condition survey on the final day of the week.
  if (conditionDay === DAYS_PER_CONDITION) {
    tasks.push({
      key: 'survey-condition',
      type: 'survey_condition',
      label: 'End-of-condition survey',
      entry_index: null,
      phase: 4,
    });
  }

  return tasks;
}

export function getDayPlan(order: Condition[] | null, studyDay: number): DayPlan {
  const base: DayPlan = {
    study_day: studyDay,
    in_study: false,
    not_started: false,
    complete: false,
    week: null,
    condition: null,
    condition_label: null,
    condition_day: null,
    is_social: false,
    is_survey_day: false,
    writing_entry_index: null,
    prompt: null,
    tasks: [],
    activities: [],
  };

  if (!order) {
    return base;
  }

  if (studyDay <= 0) {
    return { ...base, not_started: true };
  }

  if (studyDay > TOTAL_STUDY_DAYS) {
    return { ...base, complete: true };
  }

  const week = Math.ceil(studyDay / DAYS_PER_CONDITION); // 1..3
  const condition = order[week - 1];
  const conditionDay = ((studyDay - 1) % DAYS_PER_CONDITION) + 1; // 1..5
  const writingEntryIndex = writingEntryIndexForConditionDay(conditionDay);
  const prompt = writingEntryIndex ? getPromptForEntryIndex(writingEntryIndex) : null;
  const tasks = tasksForDay(condition, conditionDay);

  return {
    study_day: studyDay,
    in_study: true,
    not_started: false,
    complete: false,
    week,
    condition,
    condition_label: CONDITION_LABELS[condition],
    condition_day: conditionDay,
    is_social: isSocialCondition(condition),
    is_survey_day: conditionDay === DAYS_PER_CONDITION,
    writing_entry_index: writingEntryIndex,
    prompt,
    tasks,
    activities: tasks.map((t) => t.label),
  };
}

// Convenience: the condition active on a given study day (or null).
export function getConditionForStudyDay(order: Condition[] | null, studyDay: number): Condition | null {
  return getDayPlan(order, studyDay).condition;
}
