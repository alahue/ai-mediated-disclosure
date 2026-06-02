// Text metrics for the behavioral disclosure measures (§9, primary outcome 3):
// excerpt length, percentage shared, and edit magnitude (Levenshtein distance
// between the selected excerpt, any AI suggestion, and the final shared text).

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function charCount(text: string): number {
  return text.length;
}

// Standard Levenshtein edit distance (O(n*m) with a single rolling row).
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1);
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export interface DisclosureMetrics {
  original_char_count: number;
  original_word_count: number;
  shared_char_count: number;
  shared_word_count: number;
  percentage_shared: number; // shared chars / original chars (0..1+, clamped >= 0)
  edit_distance_excerpt_to_final: number; // selected excerpt -> final shared text
  edit_distance_ai_to_final: number | null; // AI suggestion -> final (AI condition only)
}

export function computeDisclosureMetrics(params: {
  original: string;
  selectedExcerpt: string;
  finalSharedText: string;
  aiSuggestion?: string | null;
}): DisclosureMetrics {
  const { original, selectedExcerpt, finalSharedText, aiSuggestion } = params;
  const originalChars = charCount(original);

  return {
    original_char_count: originalChars,
    original_word_count: wordCount(original),
    shared_char_count: charCount(finalSharedText),
    shared_word_count: wordCount(finalSharedText),
    percentage_shared: originalChars > 0 ? charCount(finalSharedText) / originalChars : 0,
    edit_distance_excerpt_to_final: editDistance(selectedExcerpt, finalSharedText),
    edit_distance_ai_to_final:
      aiSuggestion != null ? editDistance(aiSuggestion, finalSharedText) : null,
  };
}
