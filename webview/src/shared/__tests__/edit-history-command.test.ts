import { describe, it, expect } from 'vitest';
import { EditHistoryCommand, parseEditHistoryCommand } from '../edit-history-command';

/**
 * The backend routes EDIT_HISTORY_COMMAND_REQUESTED from the IDE to a panel
 * only when the command is one the IDE sends (issue #495). Anything else is
 * dropped, so a malformed notification never reaches a webview as an edit.
 */
describe('parseEditHistoryCommand', () => {
  it.each([
    ['undo', EditHistoryCommand.Undo],
    ['redo', EditHistoryCommand.Redo],
  ])('accepts %s', (value, expected) => {
    expect(parseEditHistoryCommand(value)).toBe(expected);
  });

  it('has exactly undo and redo', () => {
    expect(Object.values(EditHistoryCommand).sort()).toEqual(['redo', 'undo']);
  });

  it('rejects other strings, case variants, padding and the empty string', () => {
    for (const value of ['Undo', 'REDO', ' undo', 'redo ', 'cut', '']) {
      expect(parseEditHistoryCommand(value)).toBeNull();
    }
  });

  it('rejects values that are not strings', () => {
    for (const value of [undefined, null, 0, 1, true, {}, ['undo']]) {
      expect(parseEditHistoryCommand(value)).toBeNull();
    }
  });
});
