import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_CONFIG, SAFETY_SETTINGS } from '../study/ai-config.js';

let genAI: GoogleGenerativeAI;

export function initGemini(): void {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    console.warn('Warning: GEMINI_API_KEY not set. AI features will not work.');
    return;
  }
  genAI = new GoogleGenerativeAI(apiKey);
}

export function getModelId(): string {
  return AI_CONFIG.model;
}

export async function generateContent(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Set GEMINI_API_KEY in .env');
  }

  // Model and decoding parameters come from the frozen AI configuration (§8) so
  // the AI condition behaves identically across the whole data-collection window.
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.model,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: AI_CONFIG.decoding.temperature,
      topP: AI_CONFIG.decoding.topP,
      maxOutputTokens: AI_CONFIG.decoding.maxOutputTokens,
      responseMimeType: AI_CONFIG.decoding.responseMimeType,
    },
    safetySettings: SAFETY_SETTINGS,
  });

  const result = await model.generateContent(userPrompt);
  const response = result.response;

  // With strict safety thresholds the model may block the prompt or the
  // response; surface that distinctly so callers can report it (and not retry).
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`blocked_by_safety:prompt:${blockReason}`);
  }
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    throw new Error(`blocked_by_safety:response:${finish}`);
  }

  return response.text();
}

export function parseJsonResponse<T>(text: string): T {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON object from the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    // Surface a snippet to make truncation/formatting issues diagnosable.
    const snippet = cleaned.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Failed to parse JSON from AI response (got ${cleaned.length} chars): ${snippet}…`);
  }
}
