import { describe, it, expect } from 'vitest';
import { projectBadgeHue, projectBadgeStyle, projectInitials } from '../projectBadge';

describe('projectInitials', () => {
  it('gives a single-word name one letter', () => {
    expect(projectInitials('api')).toBe('A');
    expect(projectInitials('tmp')).toBe('T');
  });

  // The leading words are what collide in practice, so the last word carries
  // more information than the second one.
  it('takes the first and last word of a multi-word name', () => {
    expect(projectInitials('scordi-agent')).toBe('SA');
    expect(projectInitials('claude-code-battery')).toBe('CB');
    expect(projectInitials('claude-code-gui-jetbrains-worktrees')).toBe('CW');
  });

  it('tells apart two names that share every leading word', () => {
    expect(projectInitials('claude-code-gui-jetbrains')).not.toBe(
      projectInitials('claude-code-gui-jetbrains-worktrees'),
    );
  });

  it('ignores leading punctuation', () => {
    expect(projectInitials('.claude')).toBe('C');
  });

  it('splits on underscores and spaces too', () => {
    expect(projectInitials('my_cool_app')).toBe('MA');
    expect(projectInitials('my cool app')).toBe('MA');
  });

  it('falls back to a placeholder when there is no letter or digit', () => {
    expect(projectInitials('---')).toBe('?');
    expect(projectInitials('')).toBe('?');
  });

  // A project's display name is user-editable free text (ProjectMetaDialog),
  // not a folder name, so it can be Korean, Japanese, Arabic, or anything
  // else — this used to fall through to '?' because the old split regex
  // treated every non-ASCII character as delimiter material.
  describe('non-Latin names', () => {
    it('takes the first character of a single Korean word', () => {
      expect(projectInitials('테스트')).toBe('테');
    });

    it('takes the first character of the first and last Korean word', () => {
      expect(projectInitials('테스트 프로젝트')).toBe('테프');
    });

    it('splits Korean words on the same separators as Latin ones', () => {
      expect(projectInitials('테스트-프로젝트')).toBe('테프');
    });
  });
});

describe('projectBadgeHue', () => {
  it('gives the same key the same hue every time', () => {
    expect(projectBadgeHue('/Users/me/app')).toBe(projectBadgeHue('/Users/me/app'));
  });

  // Keyed on path, not name: a profile can hold three projects called proj2,
  // and identical badges would defeat the point of having one.
  it('gives two same-named projects different hues', () => {
    expect(projectBadgeHue('/Users/me/a/proj2')).not.toBe(projectBadgeHue('/Users/me/b/proj2'));
  });

  it('stays inside the hue circle for a long path', () => {
    const hue = projectBadgeHue('/Users/me/'.padEnd(500, 'x'));
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});

describe('projectBadgeStyle', () => {
  it('pairs the hue with white text', () => {
    const style = projectBadgeStyle('/Users/me/app');
    expect(style.backgroundColor).toBe(`hsl(${projectBadgeHue('/Users/me/app')} 55% 45%)`);
    expect(style.color).toBe('hsl(0 0% 100%)');
  });
});
