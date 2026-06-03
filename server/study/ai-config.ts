// Frozen AI configuration for the AI-mediated condition (§8).
//
// This module is the single, documented source of truth for what the AI
// condition actually tested: the model and version, the decoding parameters,
// the exact mediator and validator prompts, and the allowed/disallowed
// transformations. Each piece carries a version identifier that is stamped onto
// every logged mediation, so the AI condition is a reproducible instrument and
// any change to it is explicit. Lock these values (and confirm the provider's
// data-handling settings) before participant data collection begins.

export const AI_CONFIG = {
  provider: 'google',
  model: 'gemini-3-flash-preview',
  // Bump config_version (and locked_at) whenever ANY field below changes.
  config_version: 'ai-mediator-2026-06-03.2',
  locked_at: '2026-06-03',
  mediator_prompt_version: 'mediator-v1',
  validator_prompt_version: 'validator-v1',
  decoding: {
    temperature: 0.3,
    topP: 0.95,
    // Large enough to hold a polished copy of a long entry plus the explanation;
    // too small a budget truncates the JSON response.
    maxOutputTokens: 4096,
    // Native JSON mode: the model returns strict, parseable JSON.
    responseMimeType: 'application/json',
  },
  // Safety thresholds are left at the provider default and documented here.
  // If the IRB/protocol requires explicit thresholds, set them in gemini.ts and
  // record the descriptor here before locking.
  safety_descriptor: 'provider default',
} as const;

export const INTENTION_DESCRIPTIONS: Record<string, string> = {
  support: 'emotional support and understanding',
  accountability: 'encouragement and support in reaching their goals',
  perspective: 'fresh insights and alternative viewpoints',
  connection: 'a sense of shared experience and belonging',
};

// Allowed / disallowed transformations (§8), recorded for the protocol and
// exported with the data so reviewers can see the instrument's boundaries.
export const ALLOWED_TRANSFORMATIONS = [
  'Redact direct identifiers (names, phone numbers, addresses, emails, specific organizations) and highly specific contextual clues.',
  'Suggest a shorter excerpt aligned with the participant’s selected sharing intention.',
  'Make light clarity edits while preserving meaning, emotion, uncertainty, and voice.',
  'Warn when content appears unusually revealing, identifiable, or potentially harmful to disclose.',
  'Explain changes in plain language.',
];

export const DISALLOWED_TRANSFORMATIONS = [
  'Share anything without explicit participant approval.',
  'Add facts, events, explanations, diagnoses, or interpretations not in the entry.',
  'Change the participant’s stance, emotional intensity, or level of vulnerability.',
  'Classify mental-health status, provide therapeutic advice, or encourage crisis disclosure.',
  'Hide or obscure what was changed from the participant.',
];

export const MEDIATOR_SYSTEM_PROMPT = `You are a disclosure mediator for a peer journaling study. Your job is to help a participant prepare text for optional peer sharing while preserving their control, meaning, and voice.

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

export function buildMediatorUserPrompt(excerpt: string, intention: string): string {
  const intentionDesc = INTENTION_DESCRIPTIONS[intention] || 'general feedback';
  return `Sharing intention: ${intention} (the peer will read this to offer ${intentionDesc}).

Participant-selected excerpt:
"""
${excerpt}
"""`;
}

export const VALIDATOR_SYSTEM_PROMPT = `You are a content safety validator for a peer journaling platform. You will be given a journal entry that has already been processed by a mediator. Your job is to verify that it is free of:
1. Potentially harmful or abusive language
2. Personal identifiers such as names, phone numbers, addresses, and emails

Respond in exactly this JSON format:
{
  "passed": true or false,
  "issues": ["list of issues found, if any"]
}`;

export function buildValidatorUserPrompt(polishedEntry: string): string {
  return `Is this journal entry free of potentially harmful/abusive language and personal identifiers such as names, phone numbers, addresses, and emails?\n\n${polishedEntry}`;
}

// Full, exportable manifest of the frozen instrument.
export function aiConfigManifest() {
  return {
    provider: AI_CONFIG.provider,
    model: AI_CONFIG.model,
    config_version: AI_CONFIG.config_version,
    locked_at: AI_CONFIG.locked_at,
    temperature: AI_CONFIG.decoding.temperature,
    top_p: AI_CONFIG.decoding.topP,
    max_output_tokens: AI_CONFIG.decoding.maxOutputTokens,
    response_mime_type: AI_CONFIG.decoding.responseMimeType,
    safety: AI_CONFIG.safety_descriptor,
    mediator_prompt_version: AI_CONFIG.mediator_prompt_version,
    validator_prompt_version: AI_CONFIG.validator_prompt_version,
    mediator_system_prompt: MEDIATOR_SYSTEM_PROMPT,
    validator_system_prompt: VALIDATOR_SYSTEM_PROMPT,
    allowed_transformations: ALLOWED_TRANSFORMATIONS,
    disallowed_transformations: DISALLOWED_TRANSFORMATIONS,
  };
}

// Compact stamp attached to each logged mediation row.
export function aiConfigStamp() {
  return {
    model: AI_CONFIG.model,
    config_version: AI_CONFIG.config_version,
    mediator_prompt_version: AI_CONFIG.mediator_prompt_version,
    validator_prompt_version: AI_CONFIG.validator_prompt_version,
  };
}
