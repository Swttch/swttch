import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({ existsSync: vi.fn() }));
vi.mock('../../features/getProjectSessionsPath', () => ({ getProjectSessionsPath: vi.fn() }));
vi.mock('../../features/sessionTitleOverrides', () => ({ removeSessionTitleOverride: vi.fn() }));
vi.mock('../../features/sessionTitleForDesktop', () => ({ readTranscriptTitleState: vi.fn() }));
vi.mock('../../features/cli-rename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/cli-rename')>()),
  renameSessionThroughCli: vi.fn(),
}));

import { existsSync } from 'fs';
import { updateSessionDesktopTitleHandler } from '../updateSessionDesktopTitle';
import { getProjectSessionsPath } from '../../features/getProjectSessionsPath';
import { readTranscriptTitleState } from '../../features/sessionTitleForDesktop';
import { renameSessionThroughCli } from '../../features/cli-rename';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const connections = () =>
  ({ sendTo: vi.fn(), broadcastToAll: vi.fn(), broadcastToListsHolding: vi.fn() }) as unknown as ConnectionManager;
const message = (payload: Record<string, unknown>): IPCMessage => ({
  type: MessageType.UPDATE_SESSION_DESKTOP_TITLE,
  payload,
  timestamp: 0,
  requestId: 'req-1',
});
const payload = { sessionId: 'abc123', title: 'Shown title', workingDir: '/test' };

describe('updateSessionDesktopTitleHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProjectSessionsPath).mockResolvedValue('/home/user/.claude/projects/-test');
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('writes the shown title when the transcript has no custom-title', async () => {
    vi.mocked(readTranscriptTitleState).mockResolvedValue({ entrypoint: 'sdk-cli', hasCustomTitle: false });
    const c = connections();
    await updateSessionDesktopTitleHandler('conn-1', message(payload), c, {} as Bridge);
    expect(renameSessionThroughCli).toHaveBeenCalledWith(c, 'abc123', 'Shown title', '/test');
    expect(c.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({ status: 'ok', written: true }));
  });

  it('leaves a transcript that already has a custom-title alone', async () => {
    vi.mocked(readTranscriptTitleState).mockResolvedValue({ entrypoint: 'sdk-cli', hasCustomTitle: true });
    const c = connections();
    await updateSessionDesktopTitleHandler('conn-1', message(payload), c, {} as Bridge);
    expect(renameSessionThroughCli).not.toHaveBeenCalled();
    expect(c.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({ status: 'ok', written: false }));
  });

  it('writes a title even for a session another client started (only a custom-title stops it)', async () => {
    vi.mocked(readTranscriptTitleState).mockResolvedValue({ entrypoint: 'cli', hasCustomTitle: false });
    await updateSessionDesktopTitleHandler('conn-1', message(payload), connections(), {} as Bridge);
    expect(renameSessionThroughCli).toHaveBeenCalledTimes(1);
  });

  it('refuses a missing title or a session that is not there', async () => {
    const c = connections();
    await updateSessionDesktopTitleHandler('conn-1', message({ ...payload, title: '  ' }), c, {} as Bridge);
    vi.mocked(existsSync).mockReturnValue(false);
    await updateSessionDesktopTitleHandler('conn-1', message(payload), c, {} as Bridge);
    expect(c.sendTo).toHaveBeenCalledTimes(2);
    expect(c.sendTo).toHaveBeenNthCalledWith(1, 'conn-1', MessageType.ACK, expect.objectContaining({ status: 'error' }));
    expect(c.sendTo).toHaveBeenNthCalledWith(2, 'conn-1', MessageType.ACK, expect.objectContaining({ status: 'error' }));
    expect(renameSessionThroughCli).not.toHaveBeenCalled();
  });
});
