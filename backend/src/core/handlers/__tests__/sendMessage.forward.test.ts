import { beforeEach, expect, it, vi } from 'vitest';
import { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType } from '../../../shared';
import { sendMessageHandler } from '../sendMessage';
import { ensureClaudeProcess, sendMessageToProcess } from '../../claude-process';
import { forwardMessageToHolder } from '../../forward-to-holder';

vi.mock('../../claude-process', () => ({ ensureClaudeProcess: vi.fn(), restartClaudeSessionProcess: vi.fn(), sendMessageToProcess: vi.fn() }));
vi.mock('../../forward-to-holder', () => ({ forwardMessageToHolder: vi.fn() }));
vi.mock('../../features/account-pool-recovery-store', () => ({ claimAccountPoolContinuation: vi.fn(async () => true), clearAccountPoolRecovery: vi.fn() }));
vi.mock('../../features/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('../../features/session-title-runtime', () => ({ requestSessionTitleAfterSend: vi.fn() }));
vi.mock('../../features/fable-probe', () => ({ invalidateFableProbeCache: vi.fn() }));
vi.mock('../getUsage', () => ({ resetUsageCache: vi.fn() }));
vi.mock('../getAllUsage', () => ({ resetAllUsageCache: vi.fn() }));

const connections = new ConnectionManager(true);
const getProcess = vi.spyOn(connections, 'getProcess');
vi.spyOn(connections, 'subscribe').mockImplementation(() => {});
const sendTo = vi.spyOn(connections, 'sendTo').mockImplementation(() => {});
vi.spyOn(connections, 'broadcastToAll').mockImplementation(() => {});
vi.spyOn(connections, 'broadcastToSession').mockImplementation(() => {});
const bridge = {} as Bridge;

const send = (content: string) =>
  sendMessageHandler('tab', { type: MessageType.SEND_MESSAGE, requestId: 'r', timestamp: 0,
    payload: { sessionId: 'session', workingDir: '/fixture', content, messageUuid: '3f2a0f1e-5b7c-4d8a-9e21-1a2b3c4d5e6f' } }, connections, bridge);

beforeEach(() => {
  vi.clearAllMocks();
  getProcess.mockReturnValue(null);
});

// A tab of another IDE window's backend: the session's CLI belongs to the backend that started it (#711).
it('hands the message to the backend that runs the CLI instead of starting a second one', async () => {
  vi.mocked(forwardMessageToHolder).mockResolvedValue('forwarded');
  await send('hello');
  expect(forwardMessageToHolder).toHaveBeenCalledWith('session', expect.objectContaining({ text: 'hello', messageUuid: '3f2a0f1e-5b7c-4d8a-9e21-1a2b3c4d5e6f' }));
  expect(ensureClaudeProcess).not.toHaveBeenCalled();
  expect(sendMessageToProcess).not.toHaveBeenCalled();
});

it('ends the stream state the sending tab opened, because no CLI of this backend will ever end the turn', async () => {
  vi.mocked(forwardMessageToHolder).mockResolvedValue('forwarded');
  await send('hello');
  expect(sendTo).toHaveBeenCalledWith('tab', MessageType.STREAM_END, {});
});

it('starts the CLI itself when no other backend runs the session', async () => {
  vi.mocked(forwardMessageToHolder).mockResolvedValue('no_holder');
  await send('hello');
  expect(ensureClaudeProcess).toHaveBeenCalledTimes(1);
  expect(sendMessageToProcess).toHaveBeenCalledTimes(1);
  expect(sendTo).not.toHaveBeenCalledWith('tab', MessageType.STREAM_END, expect.anything());
});

it('falls through to the refusal (and its notice) when the holder did not take the message', async () => {
  vi.mocked(forwardMessageToHolder).mockResolvedValue('held_but_unreachable');
  await send('hello');
  expect(ensureClaudeProcess).toHaveBeenCalledTimes(1);
});

it('does not ask another backend when this backend runs the CLI', async () => {
  getProcess.mockReturnValue({} as never);
  await send('hello');
  expect(forwardMessageToHolder).not.toHaveBeenCalled();
  expect(sendMessageToProcess).toHaveBeenCalledTimes(1);
});
