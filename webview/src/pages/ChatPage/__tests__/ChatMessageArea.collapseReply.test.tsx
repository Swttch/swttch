import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessageArea } from '../ChatMessageArea';
import type { LoadedMessageDto } from '../../../types';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import { i18n } from '@/i18n';
import { _resetRuntimeCache } from '@/config/environment';

/**
 * Read from the same catalogue the component renders from, rather than repeated
 * as literals here.
 *
 * These three are deliberately a matched set — one verb, one object, and the
 * notice as that verb's past participle — and they have been reworded once
 * already. Copying them in would mean a reword either breaks every assertion at
 * once or, worse, quietly stops matching what the user sees.
 */
const COLLAPSE = i18n.t('sendActions.collapseReply', { ns: 'chat' });
const EXPAND = i18n.t('sendActions.expandReply', { ns: 'chat' });
const COLLAPSED = i18n.t('sendActions.collapsedReply', { ns: 'chat' });

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
  it('has three distinct strings to match on', () => {
    // Guards every other test in the file. `i18n.t` returns the key itself when
    // a lookup misses, so a renamed or deleted key would leave the constants
    // holding "sendActions.collapseReply" — which matches no button, making
    // `queryByRole(...)` assertions pass for the wrong reason.
    for (const s of [COLLAPSE, EXPAND, COLLAPSED]) {
      expect(s).toBeTruthy();
      expect(s).not.toContain('sendActions.');
    }
    expect(new Set([COLLAPSE, EXPAND, COLLAPSED]).size).toBe(3);
  });

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
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

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
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

    // Asserted together with the first reply being gone, or this passes just as
    // well when nothing collapses at all.
    expect(screen.queryByText('first answer')).not.toBeInTheDocument();
    expect(screen.getByText('second prompt')).toBeInTheDocument();
    expect(screen.getByText('second answer')).toBeInTheDocument();
  });

  it('marks the gap rather than leaving it blank', async () => {
    const user = userEvent.setup();
    renderArea([
      send('u1', 'first prompt'),
      reply('a1', 'first answer'),
      reply('a2', 'second answer'),
      send('u2', 'second prompt'),
    ]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

    expect(screen.getByRole('button', { name: COLLAPSED })).toBeInTheDocument();
  });

  it('says the same thing however many entries the reply holds', async () => {
    // The notice used to report `body.length`, which counts JSONL entries and
    // not drawn bubbles, so the number disagreed with the screen — and
    // disagreed by a different amount live vs. reloaded from disk.
    //
    // `attachment` entries are what drove the two apart on a real session:
    // `MessageBubble` has no case for them and returns null, yet they sit in
    // the section's body like anything else. Measured on the reporter's
    // transcript, one section held 11 entries and drew 4 — the other 7 were
    // attachments.
    const user = userEvent.setup();
    const attachment = (uuid: string): LoadedMessageDto => ({
      uuid,
      type: 'attachment' as LoadedMessageType,
      message: { role: MessageRole.User, content: 'never drawn' },
      timestamp: now,
    });

    const lean = [send('u1', 'p'), reply('a1', 'one visible answer')];
    const padded = [
      send('u1', 'p'),
      reply('a1', 'one visible answer'),
      attachment('at1'),
      attachment('at2'),
      attachment('at3'),
    ];
    // Guard the premise: if these ever hold the same number of entries, the
    // test has stopped exercising the disagreement it was written for.
    expect(padded.length).toBeGreaterThan(lean.length);

    const { unmount } = renderArea(lean);
    await openMenuOn(user, 'p');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    const leanText = screen.getByRole('button', { name: COLLAPSED }).textContent;
    unmount();

    renderArea(padded);
    await openMenuOn(user, 'p');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    const paddedText = screen.getByRole('button', { name: COLLAPSED }).textContent;

    // Same reply on screen either way, so the notice must read the same.
    expect(paddedText).toBe(leanText);
  });

  it('brings the reply back from the notice left in its place', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    await user.click(screen.getByRole('button', { name: COLLAPSED }));

    expect(screen.getByText('first answer')).toBeInTheDocument();
  });

  it('brings the reply back from the menu, which now offers the opposite action', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    expect(screen.queryByText('first answer')).not.toBeInTheDocument();

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: EXPAND }));

    expect(screen.getByText('first answer')).toBeInTheDocument();
  });

  it('draws no notice for a send that has no reply yet', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

    expect(screen.queryByRole('button', { name: COLLAPSED })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
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
