import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionList } from '../useSessionList';
import { SessionMetaDto } from '@/dto';

const ROOT = '/repo';

function session(id: string, title: string, sessionDir?: string): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title,
    sessionDir,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
  });
}

const SESSIONS = [
  session('11111111-aaaa-4000-8000-000000000001', 'fix the parser', ROOT),
  session('22222222-bbbb-4000-8000-000000000002', 'battery status', `${ROOT}/packages/battery`),
  session('33333333-cccc-4000-8000-000000000003', 'tune the webview', `${ROOT}/webview`),
];

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    sessions: SESSIONS,
    currentSessionId: null,
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  }),
}));

vi.mock('@/components/ConfirmDialog/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirmDialog: null, confirm: vi.fn() }),
}));

function search(query: string) {
  const { result } = renderHook(() => useSessionList());
  act(() => result.current.setSearchQuery(query));
  return result.current.filteredSessions.map((s) => s.title);
}

describe('useSessionList — searching by project', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches a partial project name', () => {
    expect(search('batt')).toEqual(['battery status']);
  });

  it('matches a path fragment spanning directories', () => {
    expect(search('packages/')).toEqual(['battery status']);
  });

  it('still matches titles and ids', () => {
    expect(search('parser')).toEqual(['fix the parser']);
    expect(search('33333333')).toEqual(['tune the webview']);
  });

  it('returns rows matching in EITHER the title or the project', () => {
    // "webview" is this row's project and also appears in another row's title,
    // so both must come back rather than one field shadowing the other.
    expect(search('webview')).toEqual(['tune the webview']);
  });

  it('falls back to substring matching when the query is not a valid regex', () => {
    // An unclosed bracket throws in the RegExp constructor; the fallback path
    // has to search the project field too, not just title and id.
    expect(search('packages/battery[')).toEqual([]);
    expect(search('battery[')).toEqual([]);
    expect(search('[')).toEqual([]);
  });

  it('tolerates a session with no directory attached', () => {
    const { result } = renderHook(() => useSessionList());
    act(() => result.current.setSearchQuery('parser'));
    expect(result.current.filteredSessions).toHaveLength(1);
  });

  it('returns everything for an empty query', () => {
    expect(search('   ')).toHaveLength(3);
  });
});
