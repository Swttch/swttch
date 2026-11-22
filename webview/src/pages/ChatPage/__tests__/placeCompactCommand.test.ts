import { describe, it, expect } from 'vitest';
import { placeCompactCommand } from '../placeCompactCommand';
import { LoadedMessageDto } from '../../../types';
import { LoadedMessageType } from '../../../dto/common';

function user(uuid: string, content: string, extra: Partial<LoadedMessageDto> = {}): LoadedMessageDto {
  return { type: LoadedMessageType.User, uuid, message: { role: 'user', content }, ...extra } as LoadedMessageDto;
}

function boundary(uuid: string, extra: Partial<LoadedMessageDto> = {}): LoadedMessageDto {
  return { type: 'system', subtype: 'compact_boundary', uuid, ...extra } as LoadedMessageDto;
}

const SUMMARY = 'This session is being continued from a previous conversation that ran out of context.';
const CAVEAT = '<local-command-caveat>The command below was run directly in the terminal</local-command-caveat>';
const COMMAND = '<command-name>/compact</command-name>\n<command-message>compact</command-message>';
const OUTPUT = '<local-command-stdout>Compacted</local-command-stdout>';

/** What the CLI writes for a manual /compact: file order is boundary, summary, caveat, command, output. */
function manualCompact(extra: { commandAt?: string } = {}): LoadedMessageDto[] {
  return [
    boundary('b', { timestamp: '2026-11-22T10:29:06.970Z' }),
    user('s', SUMMARY, { parentUuid: 'b', isCompactSummary: true, timestamp: '2026-11-22T10:29:06.951Z' }),
    user('cv', CAVEAT, { parentUuid: 's', isMeta: true, timestamp: '2026-11-22T10:28:57.656Z' }),
    user('cm', COMMAND, { parentUuid: 'cv', timestamp: extra.commandAt ?? '2026-11-22T10:28:57.656Z' }),
    user('o', OUTPUT, { parentUuid: 'cm', timestamp: '2026-11-22T10:29:07.589Z' }),
  ];
}

const ids = (list: LoadedMessageDto[]) => list.map((m) => m.uuid);

describe('placeCompactCommand', () => {
  it('moves the caveat and the command it was typed with to just before the boundary', () => {
    const list = [user('q', 'hello'), ...manualCompact()];
    expect(ids(placeCompactCommand(list))).toEqual(['q', 'cv', 'cm', 'b', 's', 'o']);
  });

  it('does not edit the entries, only their order', () => {
    const list = manualCompact();
    const placed = placeCompactCommand(list);
    expect(placed.find((m) => m.uuid === 'cm')).toBe(list[3]);
    expect(placed.find((m) => m.uuid === 'b')).toBe(list[0]);
  });

  it('returns the same array when there is no compaction', () => {
    const list = [user('q', 'hello'), user('a', 'world')];
    expect(placeCompactCommand(list)).toBe(list);
  });

  it('leaves an automatic compaction alone: no /compact command follows the summary', () => {
    const list = [
      boundary('b', { timestamp: '2026-11-22T10:29:06.970Z' }),
      user('s', SUMMARY, { parentUuid: 'b', isCompactSummary: true, timestamp: '2026-11-22T10:29:06.951Z' }),
      user('n', 'next question', { parentUuid: 's' }),
      user('n2', 'another', { parentUuid: 'n' }),
    ];
    expect(placeCompactCommand(list)).toBe(list);
  });

  it('leaves a command written after the summary where it is', () => {
    const list = manualCompact({ commandAt: '2026-11-22T10:29:09.000Z' });
    expect(placeCompactCommand(list)).toBe(list);
  });

  it('leaves a run whose chain does not link up alone', () => {
    const list = manualCompact();
    list[3] = user('cm', COMMAND, { parentUuid: 'somewhere-else', timestamp: '2026-11-22T10:28:57.656Z' });
    expect(placeCompactCommand(list)).toBe(list);
  });

  it('puts each of two compactions in order', () => {
    const second = manualCompact().map((m) => ({ ...m, uuid: `${m.uuid}2`, parentUuid: m.parentUuid ? `${m.parentUuid}2` : m.parentUuid }) as LoadedMessageDto);
    const list = [...manualCompact(), user('mid', 'between', { parentUuid: 'o' }), ...second];
    expect(ids(placeCompactCommand(list))).toEqual(['cv', 'cm', 'b', 's', 'o', 'mid', 'cv2', 'cm2', 'b2', 's2', 'o2']);
  });

  it('does nothing for a run that is cut off at the end of the list', () => {
    const list = manualCompact().slice(0, 3);
    expect(placeCompactCommand(list)).toBe(list);
  });
});
