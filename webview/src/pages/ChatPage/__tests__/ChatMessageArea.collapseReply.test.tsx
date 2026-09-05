import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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
 * What the notice reads once it has a number to report.
 *
 * The plain `COLLAPSED` above is the fallback for a reply that drew no bullet
 * at all, so most of these assertions want this one.
 */
const collapsedCount = (count: number) =>
  i18n.t('sendActions.collapsedReplyCount', { ns: 'chat', count });

/**
 * Collapsing a reply, end to end through the real bubbles (issue #368).
 *
 * `ChatMessageArea.test.tsx` next door mocks `MessageBubble` away, which is the
 * right call for the list behaviour it covers but leaves no control to click —
 * both of them live inside `UserMessageRenderer`. So these render the genuine
 * renderers and drive the controls the way a user would.
 *
 * A collapsed reply is asserted with `toBeVisible`, not `toBeInTheDocument`.
 * Folding hides the body with CSS and leaves it mounted, which is what keeps
 * the notice's count able to follow a reply that is still streaming — so "the
 * reply is collapsed" means it is on the page and not showing, and a presence
 * check would now pass for a section that never folded at all.
 */

const mockSessionContext = {
  workingDirectory: '/test/path' as string | null,
  setWorkingDirectory: vi.fn(),
  // The send menu's fork entry names the branch after the session it came from,
  // so it reads the list (issue #356).
  sessions: [] as Array<{ id: string; title: string }>,
  currentSessionId: null as string | null,
  addNewSession: vi.fn(),
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

// The send menu's rewind entry talks to the backend through the bridge, and its
// fork entry asks the api layer to load the branch it opens (issue #356). These
// tests only render the menu, so stubs are enough.
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: vi.fn().mockResolvedValue({ status: 'ok' }) }),
}));

vi.mock('@/contexts/ApiContext', () => ({
  useApi: () => ({ sessions: { load: vi.fn() } }),
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

// The menu these tests open now also carries fork and rewind, and the fork entry
// reads the router to hand itself to the session it opens (issue #356).
const renderArea = (messages: LoadedMessageDto[]) =>
  render(
    <MemoryRouter>
      <ChatMessageArea
        isStreaming={false}
        mergedMessages={messages}
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
      />
    </MemoryRouter>,
  );

/** Opens the menu on the send whose text is `sendText`. */
async function openMenuOn(user: ReturnType<typeof userEvent.setup>, sendText: string) {
  const bubble = screen.getByText(sendText).closest('.group');
  expect(bubble).not.toBeNull();
  const button = bubble!.querySelector('button[aria-haspopup="menu"]');
  expect(button).not.toBeNull();
  await user.click(button!);
}

/**
 * The fold arrow in the gutter beside the send whose text is `sendText`.
 *
 * Matched by what it is rather than by its label: the ⋮ button on the same
 * bubble also carries `aria-expanded` (its menu's open state), and both
 * controls answer to the same name while the menu is shut. `aria-haspopup` is
 * what tells them apart, and it is the menu button's own defining attribute
 * rather than a hook added for this test.
 */
function foldArrowOn(sendText: string): HTMLElement {
  const bubble = screen.getByText(sendText).closest('.group');
  expect(bubble).not.toBeNull();
  const arrow = bubble!.querySelector<HTMLElement>('button[aria-expanded]:not([aria-haspopup])');
  expect(arrow).not.toBeNull();
  return arrow!;
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

    expect(screen.getByText('first answer')).toBeVisible();

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

    expect(screen.getByText('first answer')).not.toBeVisible();
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
    expect(screen.getByText('first answer')).not.toBeVisible();
    expect(screen.getByText('second prompt')).toBeInTheDocument();
    expect(screen.getByText('second answer')).toBeVisible();
  });

  it('marks the gap rather than leaving it blank, and says how big it is', async () => {
    const user = userEvent.setup();
    renderArea([
      send('u1', 'first prompt'),
      reply('a1', 'first answer'),
      reply('a2', 'second answer'),
      send('u2', 'second prompt'),
    ]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

    // Two assistant turns, one bullet each — the number a reader would reach by
    // counting the dots down the left of the reply that just disappeared.
    expect(screen.getByRole('button', { name: collapsedCount(2) })).toBeInTheDocument();
  });

  it('counts what the reply drew, not the entries it is made of', async () => {
    // The notice reported `body.length` once and the number disagreed with the
    // screen: it counts JSONL entries, and an entry is not a bullet.
    //
    // `attachment` entries are what drove the two apart on a real session:
    // `MessageBubble` has no case for them and returns null, yet they sit in
    // the section's body like anything else. Measured on the reporter's
    // transcript, one section held 11 entries and drew 4.
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
    const leanText = screen.getByRole('button', { name: collapsedCount(1) }).textContent;
    unmount();

    renderArea(padded);
    await openMenuOn(user, 'p');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    const paddedText = screen.getByRole('button', { name: collapsedCount(1) }).textContent;

    // Same reply on screen either way, so the notice must read the same — and
    // must say one, not four.
    expect(paddedText).toBe(leanText);
  });

  it('brings the reply back from the notice left in its place', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    await user.click(screen.getByRole('button', { name: collapsedCount(1) }));

    expect(screen.getByText('first answer')).toBeVisible();
  });

  it('brings the reply back from the menu, which now offers the opposite action', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));
    expect(screen.getByText('first answer')).not.toBeVisible();

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: EXPAND }));

    expect(screen.getByText('first answer')).toBeVisible();
  });

  it('draws no notice for a send that has no reply yet', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt')]);

    await openMenuOn(user, 'first prompt');
    await user.click(screen.getByRole('menuitem', { name: COLLAPSE }));

    expect(screen.queryByRole('button', { name: COLLAPSED })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: collapsedCount(0) })).not.toBeInTheDocument();
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
    expect(screen.getByText('second answer')).not.toBeVisible();

    rerender(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    // Still the same send that is collapsed, and only that one.
    expect(screen.getByText('second answer')).not.toBeVisible();
    expect(screen.getByText('first answer')).toBeVisible();
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

/**
 * The fold arrow in the gutter (issue #368, second round).
 *
 * The menu shipped first and the reporter counted its steps: open, cross the
 * bubble, click the item. These cover the direct control that replaced that
 * count with one click, and the arrow's own job of saying which state the
 * section is in without anything being hovered.
 */
describe('ChatMessageArea — the fold arrow beside a send', () => {
  it('hides the reply in a single click, with no menu opened', async () => {
    const user = userEvent.setup();
    renderArea([
      send('u1', 'first prompt'),
      reply('a1', 'first answer'),
      send('u2', 'second prompt'),
      reply('a2', 'second answer'),
    ]);

    await user.click(foldArrowOn('first prompt'));

    // No menu was ever on screen, which is the whole point of this control.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByText('first answer')).not.toBeVisible();
    // Asserted alongside, or this passes just as well when nothing collapses.
    expect(screen.getByText('second answer')).toBeVisible();
  });

  it('brings the reply back on a second click', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await user.click(foldArrowOn('first prompt'));
    expect(screen.getByText('first answer')).not.toBeVisible();

    await user.click(foldArrowOn('first prompt'));
    expect(screen.getByText('first answer')).toBeVisible();
  });

  it('reports the section state, so a collapsed reply reads as folded and not as broken', async () => {
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    expect(foldArrowOn('first prompt')).toHaveAttribute('aria-expanded', 'true');
    expect(foldArrowOn('first prompt')).toHaveAccessibleName(COLLAPSE);

    await user.click(foldArrowOn('first prompt'));

    expect(foldArrowOn('first prompt')).toHaveAttribute('aria-expanded', 'false');
    expect(foldArrowOn('first prompt')).toHaveAccessibleName(EXPAND);
  });

  it('agrees with the menu, which still offers the same action', async () => {
    // The two controls read one piece of state. Folding from the arrow has to
    // leave the menu offering the opposite action, or the pair would drift into
    // disagreeing about what is on screen.
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    await user.click(foldArrowOn('first prompt'));

    await openMenuOn(user, 'first prompt');
    expect(screen.getByRole('menuitem', { name: EXPAND })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: EXPAND }));

    expect(screen.getByText('first answer')).toBeVisible();
    expect(foldArrowOn('first prompt')).toHaveAttribute('aria-expanded', 'true');
  });

  it('is drawn on a slash command too, which heads a section like any other send', async () => {
    // The send bubble has two shapes and each builds its own row, so wiring one
    // and not the other is the failure this catches: a `/compact` at the top of
    // a long run of tool calls is exactly the reply worth folding.
    const user = userEvent.setup();
    renderArea([
      send('u1', '<command-name>/compact</command-name>'),
      reply('a1', 'first answer'),
    ]);

    await user.click(foldArrowOn('compact'));

    expect(screen.getByText('first answer')).not.toBeVisible();
  });

  it('does not toggle the bubble expand underneath', async () => {
    // The arrow sits inside the send's own row, and two ancestors act on
    // clicks that reach them: `MessageBox` expands the bubble and
    // `ChatMessageArea` logs the raw entry.
    const user = userEvent.setup();
    renderArea([send('u1', 'first prompt'), reply('a1', 'first answer')]);

    const box = screen.getByText('first prompt').closest('[data-message-box]');
    expect(box).not.toBeNull();
    const before = box!.className;

    await user.click(foldArrowOn('first prompt'));

    expect(box!.className).toBe(before);
  });
});
