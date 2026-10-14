import { describe, it, expect, vi, beforeEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

vi.mock('../../features/settings', () => ({
  readSettingsFile: vi.fn(),
  readProjectSettings: vi.fn(),
}));
vi.mock('../../claude', () => ({
  Claude: { inheritedClaudeConfigDir: undefined as string | undefined },
}));

import { getClaudeConfigDirHandler } from '../getClaudeConfigDir';
import { readSettingsFile, readProjectSettings } from '../../features/settings';
import { Claude } from '../../claude';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

function setInherited(value: string | undefined) {
  (Claude as unknown as { inheritedClaudeConfigDir: string | undefined }).inheritedClaudeConfigDir = value;
}

function lastAck(connections: ConnectionManager) {
  const calls = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][2];
}

async function invoke(
  connections: ConnectionManager,
  payload: Record<string, unknown>,
) {
  const message: IPCMessage = {
    type: MessageType.GET_CLAUDE_CONFIG_DIR,
    payload,
    timestamp: 0,
    requestId: 'req',
  };
  await getClaudeConfigDirHandler('conn-1', message, connections, mockBridge);
}

describe('getClaudeConfigDirHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInherited(undefined);
  });

  it('global scope: effective uses ONLY the global setting, ignoring project', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '/global' } });
    vi.mocked(readProjectSettings).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '/project' } });

    await invoke(connections, { workingDir: '/proj', scope: 'global' });

    expect(lastAck(connections)).toMatchObject({
      effective: '/global',
      globalSetting: '/global',
      projectSetting: '/project',
    });
  });

  it('global scope with no global setting falls back to ~/.claude (NOT the project value)', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({});
    vi.mocked(readProjectSettings).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '/project' } });
    setInherited(undefined);

    await invoke(connections, { workingDir: '/proj', scope: 'global' });

    expect(lastAck(connections)).toMatchObject({
      effective: join(homedir(), '.claude'),
      globalSetting: null,
      projectSetting: '/project',
    });
  });

  it('global scope with no setting falls back to the inherited startup env', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({});
    setInherited('/inherited');

    await invoke(connections, { scope: 'global' });

    expect(lastAck(connections)).toMatchObject({
      effective: '/inherited',
      inherited: '/inherited',
    });
  });

  it('project scope: project value overrides global', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '/global' } });
    vi.mocked(readProjectSettings).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '/project' } });

    await invoke(connections, { workingDir: '/proj', scope: 'project' });

    expect(lastAck(connections)).toMatchObject({ effective: '/project' });
  });

  it('project scope with no project value falls back to the global setting', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '/global' } });
    vi.mocked(readProjectSettings).mockResolvedValue({});

    await invoke(connections, { workingDir: '/proj', scope: 'project' });

    expect(lastAck(connections)).toMatchObject({ effective: '/global' });
  });

  it('shows a leading ~ expanded while reporting the stored value as typed (#538)', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({ env: { CLAUDE_CONFIG_DIR: '~/.claude-work' } });

    await invoke(connections, { scope: 'global' });

    // The input box keeps what the user typed; the "active" line shows what the CLI receives.
    expect(lastAck(connections)).toMatchObject({
      effective: `${homedir()}/.claude-work`,
      globalSetting: '~/.claude-work',
    });
  });

  it('shows an inherited startup value with a leading ~ expanded, reporting it as inherited', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({});
    setInherited('~/.claude-work');

    await invoke(connections, { scope: 'global' });

    expect(lastAck(connections)).toMatchObject({
      effective: `${homedir()}/.claude-work`,
      inherited: '~/.claude-work',
    });
  });

  it('does not read project settings when no workingDir is given', async () => {
    const connections = createMockConnections();
    vi.mocked(readSettingsFile).mockResolvedValue({});

    await invoke(connections, { scope: 'global' });

    expect(readProjectSettings).not.toHaveBeenCalled();
  });
});
