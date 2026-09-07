import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, toInstance } from '../../../../dto/common';
import { SectionFoldContext, SectionKeyContext } from '../../SectionFoldContext';

// The renderer reads the CLI config to localize a `/model` echo; no provider is
// mounted here, so stub it with an empty response.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null }),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { UserMessageRenderer } from '../UserMessageRenderer';
import { parseUserContent } from '../utils/parseUserContent';

const SECTION_KEY = 'u-test';

/** The shape every slash-command entry the CLI writes actually has. */
const CLEAR_ENTRY =
  '<command-name>/clear</command-name>\n' +
  '            <command-message>clear</command-message>\n' +
  '            <command-args></command-args>';

let writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

function userMessage(content: unknown): LoadedMessageDto {
  return toInstance(LoadedMessageDto, {
    type: LoadedMessageType.User,
    uuid: SECTION_KEY,
    message: { role: 'user', content },
  });
}

/**
 * The menu draws nothing without a fold provider and a section key, so a send
 * rendered bare has no copy entry to click. Both are supplied here because the
 * real transcript supplies both for every send the user typed.
 *
 * No `SendActionsContext`: the fork and rewind entries are deliberately absent,
 * which is what makes these tests also assert that copying does not depend on
 * them.
 */
function renderSend(content: unknown) {
  const fold = { isCollapsed: () => false, toggle: vi.fn() };
  return render(
    <SectionFoldContext.Provider value={fold}>
      <SectionKeyContext.Provider value={SECTION_KEY}>
        <UserMessageRenderer message={userMessage(content)} />
      </SectionKeyContext.Provider>
    </SectionFoldContext.Provider>,
  );
}

function clickCopy() {
  fireEvent.click(screen.getByRole('button', { name: 'sendActions.menuLabel' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'sendActions.copyMessage' }));
}

describe('UserMessageRenderer — copying a send (issue #412)', () => {
  it('copies the prompt the user typed', async () => {
    renderSend('rewrite the parser, please');

    clickCopy();

    expect(writeText).toHaveBeenCalledWith('rewrite the parser, please');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('sendActions.copyDone'));
  });

  it('keeps a multi-line prompt intact, which is the one hand-selecting cannot manage', () => {
    renderSend('first line\n\nsecond line\n  indented');

    clickCopy();

    expect(writeText).toHaveBeenCalledWith('first line\n\nsecond line\n  indented');
  });

  /*
   * The whole reason the old hover button was not worth keeping. Every
   * slash-command entry the CLI writes is three tags and nothing else, and
   * `parseUserContent` strips all three — so the text the button copied was
   * the empty string while the bubble plainly read `/clear`.
   *
   * The first assertion pins that old value down, so the test below it cannot
   * pass vacuously: without it, a copy entry wired back to `parsedContent.text`
   * would only be caught by trusting that the expected string is not what the
   * naive path produces.
   */
  it('copies a slash command as it reads on screen, not as the empty string left after parsing', () => {
    expect(parseUserContent(CLEAR_ENTRY).text).toBe('');

    renderSend(CLEAR_ENTRY);
    clickCopy();

    expect(writeText).toHaveBeenCalledWith('/clear');
  });

  /*
   * This shape is constructed, not observed: across all 45 slash-command
   * entries in the local session files, none carries text outside the three
   * tags, and the ones that do carry arguments put them in `<command-args>`,
   * which `parseUserContent` strips. Those are all `/model`, which never
   * reaches this branch anyway — it is routed to a notification line above.
   *
   * The case is kept because the bubble itself has the same branch: it draws
   * `parsedContent.text` after the command name when there is any. Copying has
   * to follow whatever the bubble draws, so the two have to agree here even
   * while no entry we have seen exercises it.
   */
  it('includes what the bubble draws after the command name, when there is any', () => {
    renderSend(
      '<command-name>/compact</command-name>\n' +
        '            <command-message>compact</command-message>\n' +
        '            <command-args></command-args>\n' +
        'keep the build notes',
    );

    clickCopy();

    expect(writeText).toHaveBeenCalledWith('/compact keep the build notes');
  });

  it('closes the menu on the click, since the copied state is reported by the toast instead', () => {
    renderSend('anything');

    clickCopy();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  /*
   * A clipboard write does fail — a WebView without permission, a page that
   * lost focus mid-click. Staying silent there is worse than most failures,
   * because the user walks away believing they hold the text.
   */
  it('says so when the clipboard write fails, rather than looking like it worked', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderSend('anything');

    clickCopy();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('sendActions.copyFailed'));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
