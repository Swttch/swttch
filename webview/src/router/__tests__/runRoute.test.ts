/**
 * The run page route: `/runs/<sessionId>/<toolUseId>`.
 *
 * It names the session that started the task but is not under `/sessions/`: the IDE reads a tab at
 * `/sessions/<id>...` as a tab on that conversation, so a run under it would be labelled with the conversation's name.
 */
import { describe, it, expect } from 'vitest';
import { Route, pathToRoute, parseRunFromPath, parseSessionIdFromPath, runToPath } from '../routes';

describe('run route', () => {
  it('builds the path of a run and reads it back', () => {
    const path = runToPath('sess-1', 'toolu_abc');
    expect(path).toBe('/runs/sess-1/toolu_abc');
    expect(parseRunFromPath(path)).toEqual({ sessionId: 'sess-1', toolUseId: 'toolu_abc' });
  });

  it('keeps an id that needs escaping whole', () => {
    const path = runToPath('s', 'a/b c');
    expect(parseRunFromPath(path)).toEqual({ sessionId: 's', toolUseId: 'a/b c' });
  });

  it('is the run route, and no other', () => {
    expect(pathToRoute('/runs/s/t')).toBe(Route.RUN);
    expect(pathToRoute('/sessions/abc')).toBe(Route.SESSION);
    expect(pathToRoute('/diff/toolu_1')).toBe(Route.DIFF);
    expect(pathToRoute('/sessions/new')).toBe(Route.NEW_SESSION);
  });

  it('answers null for a path that is not a run', () => {
    expect(parseRunFromPath('/sessions/abc')).toBeNull();
    expect(parseRunFromPath('/runs/only-one')).toBeNull();
    expect(parseRunFromPath('/runs/a/b/c')).toBeNull();
  });

  it('answers null, and does not throw, for a broken escape typed into the address', () => {
    expect(parseRunFromPath('/runs/%E0%A4%A/toolu_1')).toBeNull();
    expect(parseRunFromPath('/runs/s1/%')).toBeNull();
  });

  it('is not a session page: the session of a run is read from the run', () => {
    expect(parseSessionIdFromPath('/runs/s/t')).toBeNull();
  });
});
