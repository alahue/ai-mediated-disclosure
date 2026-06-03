// In-app survey instruments. Items are transcribed verbatim from the study's
// survey documents (Entry Experience Check, Peer Response Check, End-of-Condition
// Survey). All items use a 5-point Likert agreement scale. Reverse-coded items
// are flagged for analysis; raw 1-5 responses are stored as given.

import type { Condition } from './config.js';

export type SurveyType = 'entry_experience' | 'peer_response' | 'condition';

export interface SurveyItem {
  key: string;
  text: string;
  reverse?: boolean;
}

export const LIKERT_SCALE = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neither agree nor disagree' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
];

// 1. Entry Experience Check — condition-specific, after writing + the privacy/
// sharing decision, before reading any peer response.
const ENTRY_EXPERIENCE: Record<Condition, SurveyItem[]> = {
  private: [
    { key: 'P1', text: 'I felt in control of what happened to my journal entry.' },
    { key: 'P2', text: 'I understood who could and could not see this entry.' },
    { key: 'P3', text: 'I felt able to maintain my privacy boundaries.' },
    { key: 'P4', text: 'I felt safe using this journaling process.' },
    { key: 'P5', text: 'I worried that this entry might be visible to someone I did not intend.', reverse: true },
  ],
  manual: [
    { key: 'M1', text: 'I felt in control of what happened to my journal entry.' },
    { key: 'M2', text: 'I understood what would be shared or not shared.' },
    { key: 'M3', text: 'I felt able to prevent oversharing.' },
    { key: 'M4', text: 'I felt safe using this journaling process.' },
    { key: 'M5', text: 'I worried that I might share more than I intended.', reverse: true },
  ],
  ai: [
    { key: 'A1', text: 'I felt in control of what happened to my journal entry.' },
    { key: 'A2', text: 'I understood what would be shared or not shared.' },
    { key: 'A3', text: 'I felt able to prevent oversharing.' },
    { key: 'A4', text: 'I felt safe using this journaling process.' },
    { key: 'A5', text: 'I worried that I might share more than I intended.', reverse: true },
  ],
};

// 2. Peer Response Check — social conditions only, when reading a peer response.
const PEER_RESPONSE: Record<'manual' | 'ai', SurveyItem[]> = {
  manual: [
    { key: 'M1', text: 'The peer response felt respectful and nonjudgmental.' },
    { key: 'M2', text: 'The peer seemed to understand what I was trying to express.' },
    { key: 'M3', text: 'The peer response felt supportive.' },
    { key: 'M4', text: 'The peer response helped me reflect or see the situation differently.' },
    { key: 'M5', text: 'After reading this response, I would be willing to share a similar entry again.' },
  ],
  ai: [
    { key: 'A1', text: 'The peer response felt respectful and nonjudgmental.' },
    { key: 'A2', text: 'The peer seemed to understand what I was trying to express.' },
    { key: 'A3', text: 'The peer response felt supportive.' },
    { key: 'A4', text: 'The peer response helped me reflect or see the situation differently.' },
    { key: 'A5', text: 'After reading this response, I would be willing to share a similar entry again.' },
  ],
};

// 3. End-of-Condition Survey — once per condition. C-items always; S-items in the
// social conditions; A-items in the AI condition only.
const CONDITION_BASE: SurveyItem[] = [
  { key: 'C1', text: 'This journaling process supported me in reflecting on my experiences.' },
  { key: 'C2', text: 'This journaling process helped me better understand my thoughts or feelings.' },
  { key: 'C3', text: 'I understood who could and could not see my writing in this journaling process.' },
  { key: 'C4', text: 'I felt in control of what happened to my entries in this journaling process.' },
  { key: 'C5', text: 'I felt able to maintain my privacy boundaries in this journaling process.' },
  { key: 'C6', text: 'I felt safe using this journaling process.' },
  { key: 'C7', text: 'I trusted this journaling mechanism to handle my writing appropriately.' },
  { key: 'C8', text: 'What I wrote or shared accurately reflected what I meant.' },
  { key: 'C9', text: 'My writing felt like my own words in this journaling process.' },
  { key: 'C10', text: 'This journaling process met my needs.' },
  { key: 'C11', text: 'This journaling process was easy to use.' },
  { key: 'C12', text: 'I would use this journaling process again.' },
];

const CONDITION_SOCIAL: SurveyItem[] = [
  { key: 'S1', text: 'I felt comfortable sharing selected parts of my entries with anonymous peers.' },
  { key: 'S2', text: 'The peer responses helped me think more deeply.' },
  { key: 'S3', text: 'The peer responses felt supportive.' },
  { key: 'S4', text: 'Receiving responses from different anonymous peers felt comfortable.' },
];

const CONDITION_AI: SurveyItem[] = [
  { key: 'A1', text: 'I was confident in the AI mediator.' },
  { key: 'A2', text: 'The AI mediator was reliable.' },
  { key: 'A3', text: 'I could trust the AI mediator.' },
  { key: 'A4', text: 'I felt that I had final control after seeing the AI suggestion.' },
];

export const SURVEY_TITLES: Record<SurveyType, string> = {
  entry_experience: 'Entry experience check',
  peer_response: 'Peer response check',
  condition: 'End-of-condition survey',
};

export const SURVEY_INSTRUCTIONS: Record<SurveyType, string> = {
  entry_experience:
    'Thinking only about the entry you just wrote and the step you just completed, please answer the following.',
  peer_response:
    'Thinking only about the peer response you just read for this entry, please answer the following.',
  condition:
    'Thinking about the journaling process you used over the past 5 days, please answer the following. Focus on your overall experience across these activities, not just one entry.',
};

// The items for a survey type given the participant's condition. Returns an empty
// array for combinations that do not apply (e.g. peer response in the private
// condition).
export function getSurveyItems(type: SurveyType, condition: Condition): SurveyItem[] {
  if (type === 'entry_experience') return ENTRY_EXPERIENCE[condition] ?? [];
  if (type === 'peer_response') {
    if (condition === 'manual') return PEER_RESPONSE.manual;
    if (condition === 'ai') return PEER_RESPONSE.ai;
    return [];
  }
  // condition survey
  let items = [...CONDITION_BASE];
  if (condition === 'manual' || condition === 'ai') items = items.concat(CONDITION_SOCIAL);
  if (condition === 'ai') items = items.concat(CONDITION_AI);
  return items;
}
