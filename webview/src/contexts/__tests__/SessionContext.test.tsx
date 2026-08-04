import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SessionProvider, useSessionContext } from '../SessionContext';
import type { SessionMetaDto } from '../../dto/session/SessionDto';
import { MessageType } from '@/shared';

// Mock contexts
const mockSubscribe = vi.fn(() => vi.fn());
const mockSend = vi.fn();
let mockIsConnected = true;

vi.mock('../BridgeContext', () => ({
  useBridgeContext: () => ({
    subscribe: mockSubscribe,
    send: mockSend,
    isConnected: mockIsConnected,
  }),
}));

// Mock API
const mockSessionsIndex = vi.fn();
const mockSessionsLoad = vi.fn();
const mockSessionsDestroy = vi.fn();
const mockSessionsCreate = vi.fn();
const mockSetWorkingDir = vi.fn();

const mockApi = {
  sessions: {
    index: mockSessionsIndex,
    load: mockSessionsLoad,
    destroy: mockSessionsDestroy,
    create: mockSessionsCreate,
  },
  setWorkingDir: mockSetWorkingDir,
};

vi.mock('../ApiContext', () => ({
  useApi: () => mockApi,
}));

vi.mock('../../adapters', () => ({
  getAdapter: () => ({
    openNewTab: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
  }),
  onBridgeReady: vi.fn(),
}));

// Mock WorkingDirContext
let mockWorkingDirectory: string | null = '/test/workspace';
const mockSetWorkingDirectory = vi.fn((dir: string | null) => {
  mockWorkingDirectory = dir;
});

vi.mock('../WorkingDirContext', () => ({
  useWorkingDir: () => ({
    workingDirectory: mockWorkingDirectory,
    setWorkingDirectory: mockSetWorkingDirectory,
  }),
}));

vi.mock('../ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({
    settings: {
      permissions: {},
    },
    scopeSettings: {},
    isLoading: false,
    scope: 'global',
    setScope: vi.fn(),
    updateSetting: vi.fn(),
    resetToGlobal: vi.fn(),
  }),
}));

// Mock react-router-dom
let mockPathname = '/';
const mockNavigate = vi.fn((path: string, _options?: unknown) => {
  if (typeof path === 'string') {
    // Strip query string for pathname tracking
    mockPathname = path.split('?')[0];
  }
});
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
  useParams: () => ({}),
}));

// Test data
const mockSessionDtos: SessionMetaDto[] = [
  {
    id: 'session-1',
    title: 'Chat 1',
    createdAt: new Date('2026-02-02T10:00:00Z'),
    updatedAt: new Date('2026-02-02T11:00:00Z'),
    messageCount: 5,
    isSidechain: false,
  },
  {
    id: 'session-2',
    title: 'Chat 2',
    createdAt: new Date('2026-02-01T09:00:00Z'),
    updatedAt: new Date('2026-02-01T10:00:00Z'),
    messageCount: 3,
    isSidechain: false,
  },
];

// Test helper component
interface TestConsumerProps {
  onMount: (ctx: ReturnType<typeof useSessionContext>) => void;
}

function TestConsumer({ onMount }: TestConsumerProps) {
  const ctx = useSessionContext();
  React.useEffect(() => {
    onMount(ctx);
  }, [onMount, ctx]);
  return null;
}

describe('SessionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/';
    mockIsConnected = true;
    mockWorkingDirectory = '/test/workspace';
    mockSessionsIndex.mockResolvedValue({ sessions: [] });
    mockSessionsLoad.mockResolvedValue(undefined);
    mockSessionsDestroy.mockResolvedValue(undefined);
    mockSessionsCreate.mockResolvedValue(undefined);
  });

  it('loadSessions - API 호출 후 sessions 상태 업데이트', async () => {
    mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    expect(mockSessionsIndex).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(capturedCtx?.sessions).toHaveLength(2);
      expect(capturedCtx?.sessions[0].id).toBe('session-1');
      expect(capturedCtx?.sessions[0].title).toBe('Chat 1');
      expect(capturedCtx?.sessions[1].id).toBe('session-2');
    });
  });

  it('loadSessions - exposes serviceError as sessionsServiceError state', async () => {
    const serviceError = { type: MessageType.WSL_HOST_MISMATCH, reason: 'inside WSL' };
    mockSessionsIndex.mockResolvedValue({ sessions: [], serviceError });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    await waitFor(() => {
      expect(capturedCtx?.sessionsServiceError).toEqual(serviceError);
      expect(capturedCtx?.sessions).toHaveLength(0);
    });
  });

  it('loadSessions - sessionsServiceError is null when no serviceError is returned', async () => {
    mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    await waitFor(() => {
      expect(capturedCtx?.sessionsServiceError).toBeNull();
    });
  });

  it('loadSessions - a rejected reload resets a stale sessionsServiceError from a previous successful load', async () => {
    const serviceError = { type: MessageType.WSL_HOST_MISMATCH, reason: 'inside WSL' };
    mockSessionsIndex.mockResolvedValueOnce({ sessions: [], serviceError });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    await waitFor(() => {
      expect(capturedCtx?.sessionsServiceError).toEqual(serviceError);
    });

    mockSessionsIndex.mockRejectedValueOnce(new Error('transient bridge error'));

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    await waitFor(() => {
      expect(capturedCtx?.sessionsServiceError).toBeNull();
    });
  });

  it('loadSessions - 미연결 시 API 호출 안 함', async () => {
    mockIsConnected = false;

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    expect(mockSessionsIndex).not.toHaveBeenCalled();
    expect(capturedCtx!.sessions).toHaveLength(0);
  });

  it('switchSession - 성공 시 navigate 호출', async () => {
    mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    act(() => {
      capturedCtx?.switchSession('session-1');
    });

    // jsdom 환경에서 isJetBrains()=false → replace: false
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/sessions/session-1'),
      expect.objectContaining({ replace: false })
    );
    await waitFor(() => {
      expect(capturedCtx?.sessionState).toBe('idle');
    });
  });

  it('switchSession - 존재하지 않는 세션 ID로 호출 시 무시', async () => {
    mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    act(() => {
      capturedCtx?.switchSession('non-existent-id');
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(capturedCtx!.currentSessionId).toBeNull();
  });

  it('deleteSession - 성공 시 sessions에서 제거', async () => {
    mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    await act(async () => {
      await capturedCtx?.deleteSession('session-2');
    });

    expect(mockSessionsDestroy).toHaveBeenCalledWith('session-2', '/test/workspace');
    await waitFor(() => {
      expect(capturedCtx?.sessions).toHaveLength(1);
      expect(capturedCtx?.sessions[0].id).toBe('session-1');
    });
  });

  it('deleteSession - 현재 세션 삭제 시 currentSessionId null로 초기화', async () => {
    // Start with current session already set via URL (SSOT)
    mockPathname = '/sessions/session-1';
    mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

    let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

    render(
      <SessionProvider>
        <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
      </SessionProvider>
    );

    await act(async () => {
      await capturedCtx?.loadSessions();
    });

    await act(async () => {
      await capturedCtx?.deleteSession('session-1');
    });

    expect(mockSessionsDestroy).toHaveBeenCalledWith('session-1', '/test/workspace');
    expect(mockNavigate).toHaveBeenLastCalledWith(
      expect.stringContaining('/sessions/new'),
      expect.objectContaining({ replace: false })
    );
    await waitFor(() => {
      expect(capturedCtx?.sessionState).toBe('idle');
    });
  });

  describe('inputMode - 세션 전환 시 모드 관리', () => {
    it('addNewSession 호출 시 사용자가 변경한 inputMode가 유지됨', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      // 사용자가 모드를 plan으로 변경
      act(() => {
        capturedCtx?.setInputMode('plan');
      });
      expect(capturedCtx!.inputMode).toBe('plan');

      // 첫 메시지 제출로 새 세션 생성 (addNewSession → URL 변경)
      act(() => {
        capturedCtx?.addNewSession('new-session-123', 'Hello world');
      });

      // 새 세션 생성 후에도 사용자가 선택한 plan 모드가 유지되어야 함
      await waitFor(() => {
        expect(capturedCtx!.inputMode).toBe('plan');
      });
    });

    it('switchSession 호출 시 inputMode가 기본값으로 리셋됨', async () => {
      mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      await act(async () => {
        await capturedCtx?.loadSessions();
      });

      // 사용자가 모드를 plan으로 변경
      act(() => {
        capturedCtx?.setInputMode('plan');
      });
      expect(capturedCtx!.inputMode).toBe('plan');

      // 다른 세션으로 전환
      act(() => {
        capturedCtx?.switchSession('session-1');
      });

      // 세션 전환 후에는 모드가 "정해지지 않은" 상태로 리셋되어 syncInitialInputMode가
      // 다시 적용 가능해야 함 (실제 적용은 ChatInput의 useEffect에서 이루어지므로
      // 여기서는 재동기화 트리거가 올랐는지로 간접 확인)
      await waitFor(() => {
        // modeResetTrigger가 증가했는지 확인 (간접 검증)
        expect(capturedCtx?.modeResetTrigger).toBeGreaterThan(0);
      });
    });

    // ChatInput은 AskUserQuestion 패널·플랜 승인 패널이 뜨는 동안 언마운트됐다가 다시
    // 붙고, 마운트될 때마다 syncInitialInputMode를 호출한다. 진행 중인 세션의 모드가
    // 그 재호출로 설정 기본값에 덮이면, 화면은 느슨한 모드를 보여주는데 CLI는 원래
    // 모드로 도는 표시/실제 불일치가 된다.
    it('세션 모드가 정해진 뒤에는 초기값 재동기화가 이를 덮지 않는다', async () => {
      mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      // 세션이 plan으로 진행 중 — 사용자가 모드 버튼을 누르지 않아도 이 상태일 수 있다
      act(() => {
        capturedCtx?.syncInitialInputMode('plan');
      });
      expect(capturedCtx!.inputMode).toBe('plan');

      // AskUserQuestion 답변 → ChatInput 재마운트 → 기본값으로 재동기화 시도
      act(() => {
        capturedCtx?.syncInitialInputMode('bypass');
      });

      expect(capturedCtx!.inputMode).toBe('plan');
    });

    // CLI가 통보한 실제 적용 모드도 "정해진" 모드다. 그 뒤 인풋이 재마운트되어
    // 기본값 재동기화가 호출돼도 CLI의 진실이 유지되어야 한다.
    it('CLI가 통보한 모드도 초기값 재동기화에 덮이지 않는다', async () => {
      mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      act(() => {
        capturedCtx?.syncEffectiveMode('plan');
      });
      expect(capturedCtx!.inputMode).toBe('plan');

      act(() => {
        capturedCtx?.syncInitialInputMode('bypass');
      });

      expect(capturedCtx!.inputMode).toBe('plan');
    });

    // Reload ordering: ChatInput mounts and applies the settings default the
    // instant the page renders, but SESSION_LOADED (carrying the session's actual
    // last mode) only arrives after a backend round trip — strictly later. The
    // restored mode must still win even though it settles the mode SECOND.
    it('세션 로드로 복원된 모드는 이미 정해진 기본값보다 늦게 도착해도 이긴다', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      // ChatInput mounts first and applies the configured default (settles the mode).
      act(() => {
        capturedCtx?.syncInitialInputMode('bypass');
      });
      expect(capturedCtx!.inputMode).toBe('bypass');

      // SESSION_LOADED arrives afterward with the session's actual last mode.
      act(() => {
        capturedCtx?.syncEffectiveMode('plan');
      });

      expect(capturedCtx!.inputMode).toBe('plan');
    });

    it('세션 전환 후에는 초기값 재동기화가 다시 적용된다', async () => {
      mockPathname = '/sessions/session-1';
      mockSessionsIndex.mockResolvedValue({ sessions: mockSessionDtos });

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      const { rerender } = render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      act(() => {
        capturedCtx?.setInputMode('plan');
      });
      expect(capturedCtx!.inputMode).toBe('plan');

      // 다른 세션으로 이동 — currentSessionId는 URL에서 파생되므로 경로를 바꾸고
      // 리렌더해야 세션 전환이 실제로 관측된다.
      mockPathname = '/sessions/session-2';
      rerender(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      // 이전 세션에서 정해진 모드는 더 이상 유효하지 않으므로 기본값이 다시 적용된다
      act(() => {
        capturedCtx?.syncInitialInputMode('bypass');
      });

      expect(capturedCtx!.inputMode).toBe('bypass');
    });
  });

  describe('auto mode - 노출/동기화/강등', () => {
    it('autoModeAvailable이 false면 cycle이 auto를 건너뛴다', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;
      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      // 기본 ask_before_edit → cycle 한 바퀴 돌려도 auto에 도달하지 않아야 함
      const seen = new Set<string>();
      for (let i = 0; i < 5; i++) {
        act(() => { capturedCtx?.cycleInputMode(); });
        seen.add(capturedCtx!.inputMode);
      }
      expect(seen.has('auto')).toBe(false);
    });

    it('autoModeAvailable이 true면 cycle에 auto가 포함된다', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;
      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      act(() => { capturedCtx?.setAutoModeAvailable(true); });

      const seen = new Set<string>();
      for (let i = 0; i < 6; i++) {
        act(() => { capturedCtx?.cycleInputMode(); });
        seen.add(capturedCtx!.inputMode);
      }
      expect(seen.has('auto')).toBe(true);
    });

    it('syncEffectiveMode가 inputMode를 CLI 적용 모드로 반영한다', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;
      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      act(() => { capturedCtx?.syncEffectiveMode('auto'); });
      expect(capturedCtx!.inputMode).toBe('auto');

      act(() => { capturedCtx?.syncEffectiveMode('ask_before_edit'); });
      expect(capturedCtx!.inputMode).toBe('ask_before_edit');
    });

    it('notifyAutoFallback/dismissAutoFallback이 배너 상태를 토글한다', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;
      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      expect(capturedCtx!.autoFallbackNotice).toBe(false);
      act(() => { capturedCtx?.notifyAutoFallback(); });
      expect(capturedCtx!.autoFallbackNotice).toBe(true);
      act(() => { capturedCtx?.dismissAutoFallback(); });
      expect(capturedCtx!.autoFallbackNotice).toBe(false);
    });
  });

  describe('workingDirectory - WorkingDirContext 연동', () => {
    it('useWorkingDir의 workingDirectory가 SessionContext에 노출됨', async () => {
      mockWorkingDirectory = '/projects/my-app';

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.workingDirectory).toBe('/projects/my-app');
      });
    });

    it('workingDirectory가 null이면 SessionContext에도 null', async () => {
      mockWorkingDirectory = null;

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(capturedCtx?.workingDirectory).toBeNull();
      });
    });

    it('workingDirectory 없으면 loadSessions 호출해도 API 요청 안 함', async () => {
      mockWorkingDirectory = null;

      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      await act(async () => {
        await capturedCtx?.loadSessions();
      });

      expect(mockSessionsIndex).not.toHaveBeenCalled();
    });

    it('setWorkingDirectory가 WorkingDirContext의 함수를 위임', async () => {
      let capturedCtx: ReturnType<typeof useSessionContext> | null = null;

      render(
        <SessionProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </SessionProvider>
      );

      await act(async () => {
        capturedCtx?.setWorkingDirectory('/new/project');
      });

      expect(mockSetWorkingDirectory).toHaveBeenCalledWith('/new/project');
    });
  });
});
