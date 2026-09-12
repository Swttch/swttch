import { describe, it, expect } from 'vitest';
import { buildPromptRows } from '../PromptList';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({
  id,
  name: id,
  content: id,
  createdAt: 1,
  updatedAt: 1,
});

/**
 * The sections render from this order and the arrow keys walk it, so the one
 * thing that must hold is that it matches what is drawn: global first, project
 * second, each scope in the order the backend sent.
 */
describe('buildPromptRows', () => {
  it('puts every global prompt before every project prompt', () => {
    const rows = buildPromptRows([prompt('g1'), prompt('g2')], [prompt('p1')]);
    expect(rows.map((row) => `${row.scope}:${row.prompt.id}`)).toEqual([
      'global:g1',
      'global:g2',
      'project:p1',
    ]);
  });

  it('keeps each scope in the order it was given', () => {
    const rows = buildPromptRows([], [prompt('first'), prompt('second'), prompt('third')]);
    expect(rows.map((row) => row.prompt.id)).toEqual(['first', 'second', 'third']);
  });

  it('is empty when neither scope has a prompt', () => {
    expect(buildPromptRows([], [])).toEqual([]);
  });

  it('carries the scope each prompt came from, so an edit writes back to it', () => {
    const rows = buildPromptRows([prompt('g1')], [prompt('p1')]);
    expect(rows[0]?.scope).toBe('global');
    expect(rows[1]?.scope).toBe('project');
  });
});
