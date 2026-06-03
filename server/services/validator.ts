import { generateContent, parseJsonResponse } from './gemini.js';
import { VALIDATOR_SYSTEM_PROMPT, buildValidatorUserPrompt } from '../study/ai-config.js';
import type { ValidatorResult } from '../types.js';

// Second-pass safety check on the mediator's suggested shared version. The
// prompt and pass/fail format are frozen in study/ai-config.ts.
export async function validateEntry(polishedEntry: string): Promise<ValidatorResult> {
  const response = await generateContent(VALIDATOR_SYSTEM_PROMPT, buildValidatorUserPrompt(polishedEntry));
  return parseJsonResponse<ValidatorResult>(response);
}
