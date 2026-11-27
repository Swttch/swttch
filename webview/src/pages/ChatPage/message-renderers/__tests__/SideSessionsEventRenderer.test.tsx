import { describe, it, expect } from 'vitest';
import { parseSideSessionsEvent } from '../SideSessionsEventRenderer';
import { isUserSendEntry } from '../../../../shared';

const note = '<system-reminder>\nThe session "a" finished a turn.\n</system-reminder>\n<system-reminder>\nThe session "b" is working.\n</system-reminder>\n<side-sessions-event>None of the sessions is working now.</side-sessions-event>';

describe('parseSideSessionsEvent', () => {
  it('reads the notes and the text of the app\'s note', () => {
    expect(parseSideSessionsEvent(note)).toEqual({
      notes: ['The session "a" finished a turn.', 'The session "b" is working.'],
      body: 'None of the sessions is working now.',
    });
  });

  it('reads a copy cut before the closing tag', () => {
    expect(parseSideSessionsEvent('<side-sessions-event>None of the sess')?.body).toBe('None of the sess');
  });

  it('leaves anything else alone, including text that only mentions the tag', () => {
    expect(parseSideSessionsEvent('plain')).toBeUndefined();
    expect(parseSideSessionsEvent('what is <side-sessions-event> for?')).toBeUndefined();
  });

  it('is not a send of the user\'s', () => {
    const entry = (content: string) => ({ type: 'user', message: { role: 'user', content } });
    expect(isUserSendEntry(entry(note))).toBe(false);
    expect(isUserSendEntry(entry('hello'))).toBe(true);
  });
});
