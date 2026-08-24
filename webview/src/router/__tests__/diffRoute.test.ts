/**
 * The diff review route: `/diff/<toolUseId>`.
 *
 * The first case here is not about diffs at all — it resolves ordinary chat and
 * settings paths. That is deliberate: `pathToRoute` grew a new branch, and the
 * routes that were already working are the ones nobody would think to re-check.
 */
import { describe, it, expect } from 'vitest';
import { Route, pathToRoute, parseToolUseIdFromPath, diffToPath } from '../routes';

describe('pathToRoute', () => {
  it('resolves a path that has nothing to do with diffs', () => {
    // Guards the constant's declaration order — see the note above.
    expect(pathToRoute('/sessions/new')).toBe(Route.NEW_SESSION);
    expect(pathToRoute('/settings/general')).toBe(Route.SETTINGS_GENERAL);
  });

  it('resolves a diff review path', () => {
    expect(pathToRoute('/diff/toolu_123')).toBe(Route.DIFF);
  });

  it('does not mistake a chat path for a diff', () => {
    expect(pathToRoute('/sessions/abc')).toBe(Route.SESSION);
  });
});

describe('parseToolUseIdFromPath', () => {
  it('reads the tool call out of a diff path', () => {
    expect(parseToolUseIdFromPath('/diff/toolu_123')).toBe('toolu_123');
  });

  it('answers null for a path that is not a diff', () => {
    expect(parseToolUseIdFromPath('/sessions/abc')).toBeNull();
    expect(parseToolUseIdFromPath('/settings/general')).toBeNull();
  });

  it('answers null when the id is missing', () => {
    expect(parseToolUseIdFromPath('/diff/')).toBeNull();
  });
});

describe('diffToPath', () => {
  it('builds a path the parser reads back', () => {
    const id = 'toolu_01Xdtk2VbRZnFNhyw9WqzXNx';
    expect(parseToolUseIdFromPath(diffToPath(id))).toBe(id);
  });

  it('resolves to the diff route', () => {
    expect(pathToRoute(diffToPath('toolu_1'))).toBe(Route.DIFF);
  });
});
