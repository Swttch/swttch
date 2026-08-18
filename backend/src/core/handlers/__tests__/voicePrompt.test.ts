import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../extend-kit', () => ({
  getExtendKitVersion: vi.fn(async () => null),
  EXTEND_KIT_PACKAGE: '@swttch/extend-kit',
}));
// Only the reads/writes are replaced; VoicePromptStatus comes through from the
// real module so the fixtures below are the enum the handlers actually compare
// against, not strings that merely look like it.
vi.mock('../../features/profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/profile')>();
  return {
    VoicePromptStatus: actual.VoicePromptStatus,
    getVoicePrompt: vi.fn(),
    markVoicePromptAsked: vi.fn(),
    setVoicePromptDecision: vi.fn(),
    acceptVoicePromptForInstalledKit: vi.fn(),
  };
});

import { getVoicePromptHandler } from '../getVoicePrompt';
import { setVoicePromptHandler } from '../setVoicePrompt';
import { getExtendKitVersion } from '../../extend-kit';
import {
  getVoicePrompt,
  markVoicePromptAsked,
  setVoicePromptDecision,
  acceptVoicePromptForInstalledKit,
  VoicePromptStatus,
} from '../../features/profile';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockKitVersion = vi.mocked(getExtendKitVersion);
const mockGet = vi.mocked(getVoicePrompt);
const mockAsked = vi.mocked(markVoicePromptAsked);
const mockDecide = vi.mocked(setVoicePromptDecision);
const mockAcceptForKit = vi.mocked(acceptVoicePromptForInstalledKit);

const bridge = {} as Bridge;
const pending = { status: VoicePromptStatus.PENDING, askedAt: null, decidedAt: null };

function mockConns() {
  return { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
}

function msg(type: MessageType, payload: Record<string, unknown> = {}): IPCMessage {
  return { type, payload, timestamp: 0, requestId: 'req-1' };
}

function lastPayload(conns: ConnectionManager): Record<string, unknown> {
  const calls = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][2];
}

describe('GET_VOICE_PROMPT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(pending);
    mockKitVersion.mockResolvedValue(null);
  });

  it('reports pending when the question is unanswered and the kit is absent', async () => {
    const conns = mockConns();

    await getVoicePromptHandler('c1', msg(MessageType.GET_VOICE_PROMPT), conns, bridge);

    expect(lastPayload(conns).voicePrompt).toEqual(pending);
    expect(mockAcceptForKit).not.toHaveBeenCalled();
  });

  // Asking someone who already has the kit whether to install it has no meaning.
  it('answers itself when the kit is already installed', async () => {
    mockKitVersion.mockResolvedValue('0.4.0');
    mockAcceptForKit.mockResolvedValue({
      status: VoicePromptStatus.ACCEPTED,
      askedAt: null,
      decidedAt: '2026-01-01T00:00:00.000Z',
    });
    const conns = mockConns();

    await getVoicePromptHandler('c1', msg(MessageType.GET_VOICE_PROMPT), conns, bridge);

    expect(mockAcceptForKit).toHaveBeenCalled();
    expect(lastPayload(conns).voicePrompt).toMatchObject({ status: VoicePromptStatus.ACCEPTED, askedAt: null });
  });

  it('leaves an existing answer alone rather than re-deriving it from the kit', async () => {
    mockGet.mockResolvedValue({
      status: VoicePromptStatus.DECLINED,
      askedAt: '2026-01-01T00:00:00.000Z',
      decidedAt: '2026-01-01T00:00:05.000Z',
    });
    mockKitVersion.mockResolvedValue('0.4.0');
    const conns = mockConns();

    await getVoicePromptHandler('c1', msg(MessageType.GET_VOICE_PROMPT), conns, bridge);

    // A user who declined and later installed the kit by hand keeps their answer.
    expect(mockKitVersion).not.toHaveBeenCalled();
    expect(lastPayload(conns).voicePrompt).toMatchObject({ status: 'declined' });
  });

  // Failing to look is not an answer.
  it('stays pending when the kit lookup throws', async () => {
    mockKitVersion.mockRejectedValue(new Error('spawn failed'));
    const conns = mockConns();

    await getVoicePromptHandler('c1', msg(MessageType.GET_VOICE_PROMPT), conns, bridge);

    expect(mockAcceptForKit).not.toHaveBeenCalled();
    expect(lastPayload(conns).voicePrompt).toEqual(pending);
  });
});

describe('SET_VOICE_PROMPT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAsked.mockResolvedValue({ ...pending, askedAt: '2026-01-01T00:00:00.000Z' });
    mockDecide.mockResolvedValue({
      status: VoicePromptStatus.ACCEPTED,
      askedAt: '2026-01-01T00:00:00.000Z',
      decidedAt: '2026-01-01T00:00:05.000Z',
    });
  });

  it('records the question being shown without recording an answer', async () => {
    const conns = mockConns();

    await setVoicePromptHandler('c1', msg(MessageType.SET_VOICE_PROMPT, { asked: true }), conns, bridge);

    expect(mockAsked).toHaveBeenCalled();
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('records an accepted answer', async () => {
    const conns = mockConns();

    await setVoicePromptHandler(
      'c1',
      msg(MessageType.SET_VOICE_PROMPT, { accepted: true }),
      conns,
      bridge,
    );

    expect(mockDecide).toHaveBeenCalledWith(true);
    expect(lastPayload(conns).voicePrompt).toMatchObject({ status: 'accepted' });
  });

  it('records a declined answer', async () => {
    mockDecide.mockResolvedValue({
      status: VoicePromptStatus.DECLINED,
      askedAt: '2026-01-01T00:00:00.000Z',
      decidedAt: '2026-01-01T00:00:05.000Z',
    });
    const conns = mockConns();

    await setVoicePromptHandler(
      'c1',
      msg(MessageType.SET_VOICE_PROMPT, { accepted: false }),
      conns,
      bridge,
    );

    expect(mockDecide).toHaveBeenCalledWith(false);
  });
});
