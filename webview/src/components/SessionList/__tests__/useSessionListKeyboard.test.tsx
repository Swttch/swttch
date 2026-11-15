import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { useSessionListKeyboard } from '../useSessionListKeyboard';
import { SessionMetaDto } from '@/dto';
import { SessionGroup, type GroupedSessions } from '../utils';

function session(id: string, provisional = false): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title: id,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
    ...(provisional ? { provisional: true } : {}),
  });
}

function grouped(sessions: SessionMetaDto[]): GroupedSessions {
  return {
    [SessionGroup.Today]: sessions,
    [SessionGroup.Yesterday]: [],
    [SessionGroup.PastWeek]: [],
    [SessionGroup.PastMonth]: [],
    [SessionGroup.PastYear]: [],
  };
}

const key = (name: string) => ({ key: name, preventDefault: vi.fn() }) as unknown as KeyboardEvent<HTMLInputElement>;

describe('opening a session with the keyboard', () => {
  function setup(sessions: SessionMetaDto[]) {
    const onSelect = vi.fn();
    const hook = renderHook(() =>
      useSessionListKeyboard({ groupedSessions: grouped(sessions), searchQuery: '', isActive: true, onSelect, onRefresh: vi.fn() }),
    );
    return { onSelect, hook };
  }

  it('opens the highlighted session on Enter', () => {
    const { onSelect, hook } = setup([session('ready')]);

    act(() => hook.result.current.handleSearchKeyDown(key('ArrowDown')));
    act(() => hook.result.current.handleSearchKeyDown(key('Enter')));

    expect(onSelect).toHaveBeenCalledWith('ready');
  });

  it('opens nothing on Enter for a session whose transcript does not exist yet', () => {
    const { onSelect, hook } = setup([session('starting', true)]);

    act(() => hook.result.current.handleSearchKeyDown(key('ArrowDown')));
    act(() => hook.result.current.handleSearchKeyDown(key('Enter')));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
