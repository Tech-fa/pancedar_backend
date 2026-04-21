export interface LlmPricing {
  /** The provider API name, e.g. 'openai', 'anthropic', 'google' */
  api: string;
  /** Cost in USD per 1 million input (prompt) tokens – cache miss */
  input_per_1m_tokens: number;
  /** Cost in USD per 1 million cached input tokens (cache hit) */
  cached_input_per_1m_tokens: number;
  /** Cost in USD per 1 million output (completion) tokens */
  output_per_1m_tokens: number;
}

/**
 * Pricing map keyed by the exact model name sent to the API.
 * Prices are in USD and sourced from provider pricing pages.
 * Update this map whenever models or prices change.
 *
 * Cache-hit pricing:
 *   OpenAI  – cached input tokens billed at 50 % of the regular input rate
 *   Anthropic – cache read tokens billed at 10 % of the regular input rate
 *   Google  – context caching at roughly 25 % of the regular input rate
 */
export const LLM_PRICING_MAP: Record<string, LlmPricing> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  "gpt-4o": {
    api: "openai",
    input_per_1m_tokens: 2.5,
    cached_input_per_1m_tokens: 1.25,
    output_per_1m_tokens: 10.0,
  },
  "gpt-4o-mini": {
    api: "openai",
    input_per_1m_tokens: 0.15,
    cached_input_per_1m_tokens: 0.075,
    output_per_1m_tokens: 0.6,
  },
  "gpt-4-turbo": {
    api: "openai",
    input_per_1m_tokens: 10.0,
    cached_input_per_1m_tokens: 5.0,
    output_per_1m_tokens: 30.0,
  },
  "gpt-4": {
    api: "openai",
    input_per_1m_tokens: 30.0,
    cached_input_per_1m_tokens: 15.0,
    output_per_1m_tokens: 60.0,
  },
  "gpt-3.5-turbo": {
    api: "openai",
    input_per_1m_tokens: 0.5,
    cached_input_per_1m_tokens: 0.25,
    output_per_1m_tokens: 1.5,
  },
  o1: {
    api: "openai",
    input_per_1m_tokens: 15.0,
    cached_input_per_1m_tokens: 7.5,
    output_per_1m_tokens: 60.0,
  },
  "o1-mini": {
    api: "openai",
    input_per_1m_tokens: 1.1,
    cached_input_per_1m_tokens: 0.55,
    output_per_1m_tokens: 4.4,
  },
  "o3-mini": {
    api: "openai",
    input_per_1m_tokens: 1.1,
    cached_input_per_1m_tokens: 0.55,
    output_per_1m_tokens: 4.4,
  },

  // ── Anthropic ────────────────────────────────────────────────────────────
  "claude-3-5-sonnet-20241022": {
    api: "anthropic",
    input_per_1m_tokens: 3.0,
    cached_input_per_1m_tokens: 0.3,
    output_per_1m_tokens: 15.0,
  },
  "claude-3-5-haiku-20241022": {
    api: "anthropic",
    input_per_1m_tokens: 0.8,
    cached_input_per_1m_tokens: 0.08,
    output_per_1m_tokens: 4.0,
  },
  "claude-3-opus-20240229": {
    api: "anthropic",
    input_per_1m_tokens: 15.0,
    cached_input_per_1m_tokens: 1.5,
    output_per_1m_tokens: 75.0,
  },
  "claude-3-sonnet-20240229": {
    api: "anthropic",
    input_per_1m_tokens: 3.0,
    cached_input_per_1m_tokens: 0.3,
    output_per_1m_tokens: 15.0,
  },
  "claude-3-haiku-20240307": {
    api: "anthropic",
    input_per_1m_tokens: 0.25,
    cached_input_per_1m_tokens: 0.03,
    output_per_1m_tokens: 1.25,
  },

  // ── Google ───────────────────────────────────────────────────────────────
  "gemini-1.5-pro": {
    api: "google",
    input_per_1m_tokens: 1.25,
    cached_input_per_1m_tokens: 0.3125,
    output_per_1m_tokens: 5.0,
  },
  "gemini-1.5-flash": {
    api: "google",
    input_per_1m_tokens: 0.075,
    cached_input_per_1m_tokens: 0.01875,
    output_per_1m_tokens: 0.3,
  },
  "gemini-2.0-flash": {
    api: "google",
    input_per_1m_tokens: 0.1,
    cached_input_per_1m_tokens: 0.025,
    output_per_1m_tokens: 0.4,
  },
  "deepseek-chat": {
    api: "deepseek",
    input_per_1m_tokens: 0.28,
    cached_input_per_1m_tokens: 0.028,
    output_per_1m_tokens: 0.42,
  },
};

/**
 * Look up pricing for a given model name.
 * Returns undefined if the model is not in the map.
 */
export function getLlmPricing(modelName: string): LlmPricing | undefined {
  return LLM_PRICING_MAP[modelName];
}

/**
 * Calculate the USD cost for a given token breakdown.
 *
 * Cache-hit tokens are billed at the discounted `cached_input_per_1m_tokens` rate.
 * Cache-miss tokens (= promptTokens − cacheHitTokens) are billed at the full rate.
 * Returns cost 0 and api 'unknown' when the model is not found in the pricing map.
 */
export function calculateLlmCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number,
  cacheHitTokens: number = 0,
): { cost: number; api: string } {
  const pricing = getLlmPricing(modelName);
  if (!pricing) {
    return { cost: 0, api: "unknown" };
  }

  const cacheMissTokens = Math.max(0, promptTokens - cacheHitTokens);

  const cost =
    (cacheMissTokens / 1_000_000) * pricing.input_per_1m_tokens +
    (cacheHitTokens / 1_000_000) * pricing.cached_input_per_1m_tokens +
    (completionTokens / 1_000_000) * pricing.output_per_1m_tokens;

  return { cost, api: pricing.api };
}
