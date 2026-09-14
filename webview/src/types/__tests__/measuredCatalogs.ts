import { ModelInfo } from '../slashCommand';

/**
 * Catalogs captured verbatim from CLI 2.1.261 on 2026-09-13, by sending an
 * `initialize` control_request and printing `response.response.models`.
 *
 * They exist because a fixture written from imagination sent an earlier round of
 * this work in the wrong direction: it assumed a remapped catalog puts the
 * custom id in `value`/`displayName`, which is only true once ANTHROPIC_BASE_URL
 * is set as well. Reproducing both halves is what surfaced the label bugs the
 * tests pin down, so the rows stay measured rather than hand-written.
 *
 * They live in their own module because several suites now read the same rows
 * (the row label, the composer chip, the model-change line), and measured data
 * copied into a second file is data that can drift from what was measured.
 */

/** No remapping: a plain first-party account. */
export const ANTHROPIC: ModelInfo[] = [
  ModelInfo.from({ value: 'default', resolvedModel: 'claude-opus-5[1m]', displayName: 'Default (recommended)', description: 'Opus 5 with 1M context · Best for everyday, complex tasks' }),
  ModelInfo.from({ value: 'opus[1m]', resolvedModel: 'claude-opus-5[1m]', displayName: 'Opus (1M context)', description: 'Opus 5 with 1M context · Best for everyday, complex tasks' }),
  ModelInfo.from({ value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Sonnet 5 · Efficient for routine tasks' }),
  ModelInfo.from({ value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' }),
];

/**
 * ANTHROPIC_DEFAULT_*_MODEL set, ANTHROPIC_BASE_URL not. The CLI still believes
 * it is talking to Anthropic, so every row keeps Anthropic's own wording while
 * `resolvedModel` alone names the model that actually runs.
 */
export const REMAPPED_NAMES_ONLY: ModelInfo[] = [
  ModelInfo.from({ value: 'default', resolvedModel: 'glm-5.2-mayi[1m]', displayName: 'Default (recommended)', description: 'Opus with 1M context · Best for everyday, complex tasks' }),
  ModelInfo.from({ value: 'opus[1m]', resolvedModel: 'glm-5.2-mayi[1m]', displayName: 'Opus (1M context)', description: 'Opus with 1M context · Best for everyday, complex tasks' }),
  ModelInfo.from({ value: 'sonnet', resolvedModel: 'glm-4.7-mayi', displayName: 'Sonnet', description: 'Sonnet · Efficient for routine tasks' }),
  ModelInfo.from({ value: 'haiku', resolvedModel: 'glm-4.5-air-mayi', displayName: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' }),
];

/** ANTHROPIC_BASE_URL set too: the CLI relabels most rows, but not all of them. */
export const PROXIED: ModelInfo[] = [
  ModelInfo.from({ value: 'default', resolvedModel: 'glm-4.6[1m]', displayName: 'Default (recommended)', description: 'Use the default model (currently glm-4.6[1m])' }),
  ModelInfo.from({ value: 'opus', resolvedModel: 'glm-4.6', displayName: 'glm-4.6', description: 'Custom Opus model' }),
  ModelInfo.from({ value: 'sonnet', resolvedModel: 'glm-4.6', displayName: 'glm-4.6', description: 'Custom Sonnet model' }),
  ModelInfo.from({ value: 'haiku', resolvedModel: 'glm-4.5-air', displayName: 'glm-4.5-air', description: 'Custom Haiku model' }),
  ModelInfo.from({ value: 'opus[1m]', resolvedModel: 'glm-4.6[1m]', displayName: 'Opus (1M context)', description: 'Opus with 1M context · Best for everyday, complex tasks' }),
];

export const rowFor = (catalog: ModelInfo[], value: string): ModelInfo => {
  const row = catalog.find((m) => m.value === value);
  if (!row) throw new Error(`no row ${value}`);
  return row;
};
