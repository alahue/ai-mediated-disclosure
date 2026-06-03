import { generateContent, parseJsonResponse } from './gemini.js';
import { MEDIATOR_SYSTEM_PROMPT, buildMediatorUserPrompt } from '../study/ai-config.js';
import type { MediatorResult } from '../types.js';

// Disclosure mediator (§8). The prompt and decoding settings are frozen in
// study/ai-config.ts so the AI condition is a reproducible instrument. The
// mediator prepares a participant-selected excerpt for optional peer sharing
// while preserving the participant's control, meaning, and voice; nothing is
// shared unless the participant approves it.
export async function mediateEntry(excerpt: string, intention: string): Promise<MediatorResult> {
  const response = await generateContent(MEDIATOR_SYSTEM_PROMPT, buildMediatorUserPrompt(excerpt, intention));
  return parseJsonResponse<MediatorResult>(response);
}
