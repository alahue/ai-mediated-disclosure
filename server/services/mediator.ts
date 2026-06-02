import { generateContent, parseJsonResponse } from './gemini.js';
import type { MediatorResult } from '../types.js';

// Disclosure mediator (§8). The mediator prepares a participant-selected excerpt
// for optional peer sharing while preserving the participant's control, meaning,
// and voice. It produces a *suggested* shared version only — nothing is shared
// unless the participant approves it. The prompt below follows the §8 skeleton
// and the allowed/disallowed behavior table.

const INTENTION_DESCRIPTIONS: Record<string, string> = {
  support: 'emotional support and understanding',
  accountability: 'encouragement and support in reaching their goals',
  perspective: 'fresh insights and alternative viewpoints',
  connection: 'a sense of shared experience and belonging',
};

const SYSTEM_PROMPT = `You are a disclosure mediator for a peer journaling study. Your job is to help a participant prepare text for optional peer sharing while preserving their control, meaning, and voice.

You receive the participant's selected excerpt and their sharing intention. Produce a suggested shared version only — it is reviewed and approved by the participant, and nothing is shared unless they approve it.

Tasks:
- Preserve the participant's meaning, emotional stance, uncertainty, and voice.
- Redact direct identifiers (names, phone numbers, addresses, emails, specific organizations) and highly specific contextual clues that could identify people or places.
- Make light, clarity-preserving edits aligned with the sharing intention without changing the participant's stance, emotional intensity, or level of vulnerability.
- Do NOT add new facts, events, advice, diagnoses, interpretations, or moral judgment.
- Provide a brief, plain-language explanation of what you changed and why.
- Add an oversharing warning ONLY if the content appears unusually revealing, identifiable, or potentially harmful to disclose; otherwise set it to null.
- Do not classify mental-health status, provide therapeutic advice, or encourage crisis disclosure. Do not hide or obscure what you changed.

Respond in exactly this JSON format:
{
  "polished_entry": "the suggested shared version",
  "explanation": "what you changed and why, in plain language",
  "warning": "an oversharing warning" or null
}`;

function buildUserPrompt(excerpt: string, intention: string): string {
  const intentionDesc = INTENTION_DESCRIPTIONS[intention] || 'general feedback';
  return `Sharing intention: ${intention} (the peer will read this to offer ${intentionDesc}).

Participant-selected excerpt:
"""
${excerpt}
"""`;
}

export async function mediateEntry(
  excerpt: string,
  intention: string
): Promise<MediatorResult> {
  const response = await generateContent(SYSTEM_PROMPT, buildUserPrompt(excerpt, intention));
  return parseJsonResponse<MediatorResult>(response);
}
