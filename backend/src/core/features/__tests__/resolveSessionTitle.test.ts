import { describe, expect, it } from 'vitest';
import { NO_TITLE, resolveSessionTitle } from '../resolveSessionTitle';

describe('resolveSessionTitle', () => {
  const all = {
    override: 'typed here',
    customTitle: 'renamed',
    aiTitle: 'generated',
    lastPrompt: 'newest prompt',
    summary: 'summary',
    firstPrompt: 'first prompt',
  };

  it('names a session in the order the Claude Code clients list by', () => {
    expect(resolveSessionTitle(all)).toBe('typed here');
    expect(resolveSessionTitle({ ...all, override: null })).toBe('renamed');
    expect(resolveSessionTitle({ ...all, override: null, customTitle: null })).toBe('generated');
    expect(resolveSessionTitle({ ...all, override: null, customTitle: null, aiTitle: null })).toBe('newest prompt');
    expect(resolveSessionTitle({ firstPrompt: 'first prompt', summary: 'summary' })).toBe('summary');
    expect(resolveSessionTitle({ firstPrompt: 'first prompt' })).toBe('first prompt');
  });

  it('shows the lower source until a higher one exists, then the higher one', () => {
    const before = { lastPrompt: 'newest prompt', firstPrompt: 'first prompt' };
    expect(resolveSessionTitle(before)).toBe('newest prompt');
    expect(resolveSessionTitle({ ...before, aiTitle: 'generated' })).toBe('generated');
  });

  it('skips a source that is empty or only blanks instead of stopping there', () => {
    expect(resolveSessionTitle({ customTitle: '', aiTitle: '   ', lastPrompt: 'newest prompt' })).toBe('newest prompt');
    expect(resolveSessionTitle({ override: '\n', customTitle: undefined, aiTitle: 'generated' })).toBe('generated');
  });

  it('falls back to a fixed name when no source holds anything', () => {
    expect(resolveSessionTitle({})).toBe(NO_TITLE);
    expect(resolveSessionTitle({ firstPrompt: ' ' })).toBe(NO_TITLE);
  });
});
