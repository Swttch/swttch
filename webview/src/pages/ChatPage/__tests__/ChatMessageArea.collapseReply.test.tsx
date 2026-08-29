import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessageArea } from '../ChatMessageArea';
import type { LoadedMessageDto } from '../../../types';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import { _resetRuntimeCache } from '@/config/environment';

/**
 * Collapsing a reply, end to end through the real bubbles (issue #368).
 *
 * `ChatMessageArea.test.tsx` next door mocks `MessageBubble` away, which is the
 * right call for the list behaviour it covers but leaves no menu to click — the
 * control lives inside `UserMessageRenderer`. So these render the genuine
 * renderers and drive the menu the way a user would.
 */

const mockSessionContext = {
  workingDirectory: '/test/path' as string | null,
  setWorkingDirectory: vi.fn(),
};

const mockChatStreamContext = {
  messages: [] as LoadedMessageDto[],
  retry: vi.fn(),
};

vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => mockSessionContext,
}));

vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => mockChatStreamContext,
}));

vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null }),
}));

const now = new Date().toISOString();

const send = (uuid: string, text: string): LoadedMessageDto => ({
  uuid,
  type: LoadedMessageType.User,
  message: { role: MessageRole.User, content: text },
  timestamp: now,
});

const reply = (uuid: string, text: string): LoadedMessageDto => ({
  uuid,
  type: LoadedMessageType.Assistant,
  message: { role: MessageRole.Assistant, content: text },
  timestamp: now,
});

const renderArea = (messages: LoadedMessageDto[]) =>
  render(
    <ChatMessageArea
      isStreaming={false}
      mergedMessages={messages}
      hasMore={false}
      isLoadingMore={false}
      onLoadMore={vi.fn()}
    />,
  );

/** Opens the menu on the send whose text is `sendText`. */
async function openMenuOn(user: ReturnType<typeof userEvent.setup>, sendText: string) {
  const bubble = screen.getByText(sendText).closest('.group');
  expect(bubble).not.toBeNull();
  const button = bubble!.querySelector('button[aria-haspopup="menu"]');
  expect(button).not.toBeNull();
  await user.click(button!);
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  delete (window as any).cefQuery_test_1;
  _resetRuntimeCache();
  mockSessionContext.workingDirectory = '/test/path';
  mockChatStreamContext.messages = [];
  // The console.log on every bubble click is deliberate production behaviour
  // (see ChatMessageArea); silence it so the test output stays readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ChatMessageArea — collapsing a reply', () => {
  it('hides the reply below a send and leaves the send itself standing', async () => {
    const user = userEvent.setup();
    renderArea([
      send('u1', 'first prompt'),
      reply('a1', 'first answer'),
      send('u2', 'second prompt'),
      reply('a2', 'second answer'),
    ]);

    expect(screen.getByText('first answer')).toBeInTheDocument();

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));

    expect(screen.queryByText('first answer')).not.toBeInTheDocument();
    // The send stays: collapsing turns the transcript into a list of prompts.
    expect(screen.getByText('first prompt')).toBeInTheDocument();
  });

  it('leaves every other section alone', async () => {
    const user = userEvent.setup();
    renderArea([
      send('u1', 'first prompt'),
      reply('a1', 'first answer'),
      send('u2', 'second prompt'),
      reply('a2', 'second answer'),
    ]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));

    // Asserted together with the first reply being gone, or this passes just as
    // well when nothing collapses at all.
    expect(screen.queryByText('first answer')).not.toBeInTheDocument();
    expect(screen.getByText('second prompt')).toBeInTheDocument();
    expect(screen.getByText('second answer')).toBeInTheDocument();
  });

  it('says how much is hidden rather than leaving a blank gap', async () => {
    const user = userEvent.setup();
    renderArea([
      send('u1', 'first prompt'),
      reply('a1', 'first answer'),
      reply('a2', 'second answer'),
      send('u2', 'second prompt'),
    ]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));

    expect(screen.getByRole('button', { name: '2 hidden messages' })).toBeInTheDocument();
  });

  it('brings the reply back from the notice left in its place', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));
    await user.click(screen.getByRole('button', { name: '1 hidden message' }));

    expect(screen.getByText('first answer')).toBeInTheDocument();
  });

  it('brings the reply back from the menu, which now offers the opposite action', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));
    expect(screen.queryByText('first answer')).not.toBeInTheDocument();

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Expand reply' }));

    expect(screen.getByText('first answer')).toBeInTheDocument();
  });

  it('draws no notice for a send that has no reply yet', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));

    expect(screen.queryByRole('button', { name: /hidden message/ })).not.toBeInTheDocument();
    expect(screen.getByText('first prompt')).toBeInTheDocument();
  });

  it('keeps the collapse tied to the send, not to its position in the list', async () => {
    const user = userEvent.setup();
    // A page of older messages arriving in front is what shifts every index.
    const { rerender } = renderArea([
      send('u2', 'second prompt'),
      reply('a2', 'second answer'),
    ]);

    await openMenuOn(user, 'second prompt');
    await user.click(screen.getByRole('menuitem', { name: 'Collapse reply up to the next message' }));
    expect(screen.queryByText('second answer')).not.toBeInTheDocument();

    rerender(
      <ChatMessageArea
        isStreaming={false}
        mergedMessages={[
          send('u1', 'first prompt'),
          reply('a1', 'first answer'),
          send('u2', 'second prompt'),
          reply('a2', 'second answer'),
        ]}
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    // Still the same send that is collapsed, and only that one.
    expect(screen.queryByText('second answer')).not.toBeInTheDocument();
    expect(screen.getByText('first answer')).toBeInTheDocument();
  });

  it('does not toggle the bubble expand underneath when the menu is used', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    const box = screen.getByText('first prompt').closest('[data-message-box]');
    expect(box).not.toBeNull();
    const before = box!.className;

    await openMenuOn(user, 'first prompt');

    // Opening the menu is not a click on the send, so the box must not have
    // switched into its expanded styling.
    expect(box!.className).toBe(before);
  });
});
