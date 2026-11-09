import { describe, expect, it } from 'vitest';
import { isCycleShortcut, nextTranscriptViewChoice } from '../useCycleTranscriptViewMode';

describe('nextTranscriptViewChoice', () => {
  it('goes Normal, Thinking, Verbose, classic and round again', () => {
    expect(nextTranscriptViewChoice('normal')).toBe('thinking');
    expect(nextTranscriptViewChoice('thinking')).toBe('verbose');
    expect(nextTranscriptViewChoice('verbose')).toBe('classic');
    expect(nextTranscriptViewChoice('classic')).toBe('normal');
  });

  it('visits Thinking on every lap, whether or not the session has thinking yet', () => {
    let view = nextTranscriptViewChoice('classic');
    const lap = [view];
    for (let i = 0; i < 3; i++) lap.push((view = nextTranscriptViewChoice(view)));
    expect(lap).toEqual(['normal', 'thinking', 'verbose', 'classic']);
  });
});

describe('isCycleShortcut', () => {
  const press = (init: Partial<Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>>) => ({
    code: 'KeyI',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  });

  it('takes Control and Alt with the I key, by physical key so a Korean layout still works', () => {
    expect(isCycleShortcut(press({ ctrlKey: true, altKey: true }))).toBe(true);
  });

  it('leaves Ctrl+I alone, which Chrome keeps for itself', () => {
    expect(isCycleShortcut(press({ ctrlKey: true }))).toBe(false);
  });

  it('leaves Alt+I, Command, Shift and other keys alone', () => {
    expect(isCycleShortcut(press({ altKey: true }))).toBe(false);
    expect(isCycleShortcut(press({ ctrlKey: true, altKey: true, metaKey: true }))).toBe(false);
    expect(isCycleShortcut(press({ ctrlKey: true, altKey: true, shiftKey: true }))).toBe(false);
    expect(isCycleShortcut(press({ ctrlKey: true, altKey: true, code: 'KeyO' }))).toBe(false);
  });
});
