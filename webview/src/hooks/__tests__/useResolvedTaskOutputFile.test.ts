import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

let workingDirectory: string | null = '/private/tmp/ccg-demo';
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => (workingDirectory === null ? null : { workingDirectory }),
}));

import { useResolvedTaskOutputFile } from '../useResolvedTaskOutputFile';
import { MessageType } from '@/shared';
import { createTestQueryClient, makeQueryWrapper } from '@/hooks/queries/__tests__/testQueryClient';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    taskType: 'local_agent',
    name: 'demo',
    status: 'running',
    startedAt: 0,
    phases: [],
    agents: [],
    ...overrides,
  };
}

describe('useResolvedTaskOutputFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workingDirectory = '/private/tmp/ccg-demo';
  });

  it('returns task.outputFile directly without calling the resolver when already known', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useResolvedTaskOutputFile(makeTask({ outputFile: '/tmp/tasks/a1.output' })), {
      wrapper: makeQueryWrapper(client),
    });

    expect(result.current).toBe('/tmp/tasks/a1.output');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('resolves the path via FIND_BG_TASK_OUTPUT_PATH by taskId when outputFile is missing', async () => {
    sendMock.mockResolvedValue({ path: '/tmp/claude-501/x/tasks/a1e4a6.output' });
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useResolvedTaskOutputFile(makeTask({ outputFile: undefined, taskId: 'a1e4a6' })),
      { wrapper: makeQueryWrapper(client) },
    );

    await waitFor(() => expect(result.current).toBe('/tmp/claude-501/x/tasks/a1e4a6.output'));
    expect(sendMock).toHaveBeenCalledWith(MessageType.FIND_BG_TASK_OUTPUT_PATH, {
      taskId: 'a1e4a6',
      workingDir: '/private/tmp/ccg-demo',
    });
  });

  it('does not call the resolver when taskId is unknown', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useResolvedTaskOutputFile(makeTask({ outputFile: undefined, taskId: undefined })), {
      wrapper: makeQueryWrapper(client),
    });

    expect(sendMock).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('does not call the resolver when the working directory is unknown', () => {
    workingDirectory = null;
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useResolvedTaskOutputFile(makeTask({ outputFile: undefined, taskId: 'a1e4a6' })),
      { wrapper: makeQueryWrapper(client) },
    );

    expect(sendMock).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });
});
