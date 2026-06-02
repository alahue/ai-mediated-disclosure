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
  activities: string[]; // human-readable orientation labels for the day
}

// Which focal entry (if any) is written on a given day within a condition week.
// Entries 1-3 are written on condition days 1-3; days 4-5 are reflection/survey.
function writingEntryIndexForConditionDay(conditionDay: number): number | null {
  if (conditionDay >= 1 && conditionDay <= ENTRIES_PER_CONDITION) return conditionDay;
  return null;
}

// Orientation labels describing what a participant does on a given condition day.
// These mirror the procedure tables in §7. Phase 1 surfaces them for orientation;
// later phases wire each task to an interactive workflow.
function activitiesForDay(condition: Condition, conditionDay: number): string[] {
  const social = isSocialCondition(condition);
  const shareVerb = condition === 'ai' ? 'Mediate and share' : 'Share';

  switch (conditionDay) {
    case 1:
      return social ? [`Write Entry 1`, `${shareVerb} Entry 1`] : [`Write Entry 1`];
    case 2:
      return social
        ? [`Respond to a peer's entry`, `Write Entry 2`, `${shareVerb} Entry 2`]
        : [`Reflect on Entry 1 (optional)`, `Write Entry 2`];
    case 3:
      return social
        ? [
            `Read the peer response to your Entry 1, then reflect`,
            `Respond to a peer's entry`,
            `Write Entry 3`,
            `${shareVerb} Entry 3`,
          ]
        : [`Reflect on Entry 2 (optional)`, `Write Entry 3`];
    case 4:
      return social
        ? [`Read the peer response to your Entry 2, then reflect`, `Respond to a peer's entry`]
        : [`Reflect on Entry 3 (optional)`];
    case 5:
      return social
        ? [`Read the peer response to your Entry 3, then reflect`, `End-of-condition survey`]
        : [`End-of-condition survey`];
    default:
      return [];
  }
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
    activities: activitiesForDay(condition, conditionDay),
  };
}

// Convenience: the condition active on a given study day (or null).
export function getConditionForStudyDay(order: Condition[] | null, studyDay: number): Condition | null {
  return getDayPlan(order, studyDay).condition;
}
