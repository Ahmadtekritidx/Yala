// Claude prices in US dollars per million tokens (Anthropic API list prices, November 2026).
// Used to estimate the cost of each AI call in the log. Update when prices change.
// Cache writes are billed at about 1.25x the input price, cache reads at about 0.1x.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

// Estimated cost of one call, or null for a model not in the table.
export function costUsd(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const perTok = (n: number | null | undefined, price: number) => ((n ?? 0) * price) / 1e6;
  const cost =
    perTok(u.input_tokens, p.input) +
    perTok(u.output_tokens, p.output) +
    perTok(u.cache_creation_input_tokens, p.input * 1.25) +
    perTok(u.cache_read_input_tokens, p.input * 0.1);
  return Math.round(cost * 1e6) / 1e6;
}
