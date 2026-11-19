/**
 * Prompt privacy minimization and legacy Gemini model sanitization helpers.
 */

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redact student PII (names, emails, student IDs) from a prompt before sending to non-local LLMs.
 */
export function sanitizePromptForCloud(
  prompt: string,
  identifiers: readonly string[]
): { readonly text: string; readonly redactedCount: number } {
  let result = prompt;
  let redactedCount = 0;

  // Deduplicate and sort longest-first so full names are replaced before individual tokens
  const cleaned = Array.from(
    new Set(
      identifiers
        .map((id) => id.trim())
        .filter((id) => id.length >= 2)
    )
  ).sort((a, b) => b.length - a.length);

  for (const id of cleaned) {
    const re = new RegExp(escapeRegExp(id), 'gi');
    const matches = result.match(re);
    if (matches && matches.length > 0) {
      redactedCount += matches.length;
      result = result.replace(re, '[REDACTED]');
    }
  }

  // Also redact any remaining email addresses
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const emailMatches = result.match(emailRe);
  if (emailMatches && emailMatches.length > 0) {
    redactedCount += emailMatches.length;
    result = result.replace(emailRe, '[REDACTED_EMAIL]');
  }

  return { text: result, redactedCount };
}

/**
 * Port of sanitizeServerGeminiModel from apps/web/utils/apiRoutes.ts.
 */
export function sanitizeGeminiModel(model: string | undefined, defaultModel = 'gemini-2.5-flash'): string {
  const trimmed = (model ?? '').trim();
  if (!trimmed) return defaultModel;
  if (
    trimmed.includes('1.5') ||
    trimmed.includes('2.0-exp') ||
    trimmed === 'gemini-pro'
  ) {
    return defaultModel;
  }
  return trimmed;
}
