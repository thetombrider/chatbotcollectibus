export const DEFAULT_FLASH_MODEL = 'openrouter/google/gemini-2.5-flash'
export const DEFAULT_PRO_MODEL = 'openrouter/google/gemini-2.5-pro'

/**
 * Normalizes a model identifier ensuring it includes the OpenRouter prefix.
 *
 * @param model - Model identifier from configuration or fallback.
 * @returns Normalized model identifier with OpenRouter namespace.
 */
export function normalizeModelId(model?: string | null): string {
  const fallback = DEFAULT_FLASH_MODEL

  if (!model) {
    return fallback
  }

  const trimmed = model.trim()
  if (trimmed.length === 0) {
    return fallback
  }

  if (trimmed.startsWith('openrouter/')) {
    return trimmed
  }

  return `openrouter/${trimmed}`
}

