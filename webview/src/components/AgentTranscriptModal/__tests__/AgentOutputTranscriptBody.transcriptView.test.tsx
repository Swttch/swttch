import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';

const handlers = new Map<string, (message: { type: string; payload?: Record<string, unknown> }) => void>();
const sendRawMock = vi.fn();
const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn((type: string, handler: (message: { type: string; payload?: Record<string, unknown> }) => void) => {
  handlers.set(type, handler);
  return unsubscribeMock;
});
// One stable object: a new one per render would resubscribe the output watch on every render.
const bridge = { sendRaw: sendRawMock, subscribe: subscribeMock };
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => bridge }));
// The reply footer's read-aloud button needs the app's bridge provider, which this standalone render has none of.
vi.mock('@/hooks/useReadAloud', () => ({ useReadAloud: () => ({ status: 'idle', toggle: vi.fn(), stop: vi.fn() }) }));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));
vi.mock('@/contexts/SettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/SettingsContext')>()),
  useSettings: () => ({ settings: {} }),
}));

// The view mode the chat is in, set per test. Only this one export is replaced.
let mode: 'normal' | 'verbose' | null = 'normal';
vi.mock('@/pages/ChatPage/message-renderers/transcriptViewMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pages/ChatPage/message-renderers/transcriptViewMode')>()),
  useTranscriptViewMode: () => mode,
}));

import { AgentOutputTranscriptBody } from '../AgentOutputTranscriptBody';
import { MessageType } from '@/shared';

const FILE = '/tmp/tasks/a1.output';
const task: WorkflowTask = { toolUseId: 't', taskType: 'local_agent', name: 'n', status: 'completed', startedAt: 0, phases: [], agents: [] };

function open(running = false, extra: object[] = [], truncated = false) {
  render(<AgentOutputTranscriptBody task={running ? { ...task, status: 'running' } : task} outputFile={FILE} sendCount={0} />);
  const entries = [
    // As a subagent's own record writes it: the prompt is the first line, with the sidechain fields.
    { parentUuid: null, isSidechain: true, agentId: 'a1', promptId: 'p1', userType: 'external', timestamp: '2026-11-20T08:03:10.203Z', type: 'user', uuid: 'u1', message: { role: 'user', content: 'find the cart bug' } },
    { type: 'assistant', uuid: 'a1', message: { role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'It is in cart.js' }] } },
  ].concat(extra as never[]);
  act(() => handlers.get(MessageType.BACKGROUND_TASK_OUTPUT_CHANGED)?.({
    type: MessageType.BACKGROUND_TASK_OUTPUT_CHANGED,
    payload: { outputFile: FILE, text: entries.map((e) => JSON.stringify(e)).join('\n') + '\n', truncated },
  }));
}

describe('AgentOutputTranscriptBody in the chat view modes', () => {
  beforeEach(() => handlers.clear());

  it('draws the transcript view (send, then reply as prose) when the chat is in a transcript mode', () => {
    mode = 'normal';
    open();
    expect(screen.getByText('find the cart bug')).toBeInTheDocument();
    expect(screen.getByText('It is in cart.js')).toBeInTheDocument();
    expect(document.querySelector('[data-send-section],[data-seg="blocks"]')).toBeInTheDocument();
  });

  it('says "No result" under a finished agent whose record ends on a call, not under one that answered', () => {
    mode = 'normal';
    const call = (id: string) => ({ type: 'assistant', uuid: `a-${id}`, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: id, description: id } }] } });
    const result = (id: string) => ({ type: 'user', uuid: `r-${id}`, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, toolUseResult: { stdout: 'ok' } });
    open(false, [call('t1'), result('t1'), call('t2'), result('t2')]);
    expect(document.querySelector('[data-transcript-no-result="ended"]')).toBeInTheDocument();
    cleanup();
    open(false, []);
    expect(document.querySelector('[data-transcript-no-result]')).toBeNull();
  });

  it('says which model the agent ran on under the prompt, as the desktop app does', () => {
    mode = 'normal';
    open();
    expect(screen.getByText(/Model Haiku 5\.5/)).toBeInTheDocument();
  });

  it('shows the working mark alone, with no words, while the agent runs', () => {
    mode = 'normal';
    open(true);
    expect(document.querySelector('[data-transcript-streaming]')).toBeInTheDocument();
    expect(document.querySelector('[data-transcript-streaming]')?.textContent).toBe('');
  });

  it('ends a finished agent with one line of what it ran in all, and has none while it runs', () => {
    mode = 'normal';
    const call = (id: string, command: string) => ({ type: 'assistant', uuid: `a-${id}`, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command, description: command } }] } });
    const result = (id: string) => ({ type: 'user', uuid: `r-${id}`, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, toolUseResult: { stdout: 'ok' } });
    const extra = [call('t1', 'ls'), result('t1'), call('t2', 'pwd'), result('t2')];
    open(false, extra);
    expect(document.querySelector('[data-transcript-ran-summary]')?.textContent).toMatch(/2 commands/i);
    cleanup();
    open(true, extra);
    expect(document.querySelector('[data-transcript-ran-summary]')).not.toBeInTheDocument();
    cleanup();
    // A record cut to its cap cannot be counted.
    open(false, extra, true);
    expect(document.querySelector('[data-transcript-ran-summary]')).not.toBeInTheDocument();
  });

  it('does not draw the note the CLI slips in for the model', () => {
    mode = 'normal';
    open(false, [{ type: 'user', isMeta: true, turnCompanion: true, uuid: 'n1', message: { role: 'user', content: '[Your previous response had no visible output. Please continue and produce a user-visible response.]' } }]);
    expect(screen.queryByText(/had no visible output/)).not.toBeInTheDocument();
    expect(screen.getByText('It is in cart.js')).toBeInTheDocument();
  });

  it('lets the call the agent waits on say it is running, and draws no separate dots under it', () => {
    mode = 'normal';
    const waiting = { type: 'assistant', uuid: 'a-w', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tw', name: 'Bash', input: { command: 'sleep 45', description: 'Sleeping 45 seconds' } }] } };
    open(true, [waiting]);
    expect(document.querySelector('[data-transcript-streaming]')).not.toBeInTheDocument();
    expect(screen.getByText(/Sleeping 45 seconds/)).toBeInTheDocument();
    expect(document.querySelector('svg ellipse')).toBeInTheDocument();
  });

  it('offers the page before when the record was sent from the middle, and asks for it on a click', () => {
    mode = 'normal';
    open(false, [], true);
    const button = screen.getByRole('button', { name: /older|earlier|이전/i });
    fireEvent.click(button);
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.LOAD_EARLIER_BACKGROUND_TASK_OUTPUT, { outputFile: FILE });
    // The page is on its way: the button gives way to the spinner line.
    expect(screen.queryByRole('button', { name: /older|earlier|이전/i })).not.toBeInTheDocument();
  });

  it('offers nothing when the whole record is here', () => {
    mode = 'normal';
    open(false, [], false);
    expect(screen.queryByRole('button', { name: /older|earlier|이전/i })).not.toBeInTheDocument();
  });

  it('keeps drawing the classic bubbles when the chat is classic', () => {
    mode = null;
    open();
    expect(screen.getByText('It is in cart.js')).toBeInTheDocument();
    expect(document.querySelector('[data-seg="blocks"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/Haiku 5\.5/)).not.toBeInTheDocument();
  });
});
