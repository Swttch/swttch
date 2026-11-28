import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const messages = [{ uuid: 'entry-1' }];
vi.mock('@/contexts/ChatStreamContext', () => ({ useChatStreamContext: () => ({ messages }) }));
vi.mock('@/contexts/SessionContext', () => ({ useSessionContext: () => ({ currentSessionId: 's1' }) }));
const download = vi.fn();
vi.mock('@/utils/downloadFrontendLogs', () => ({ downloadFrontendLogs: (source: unknown) => download(source) }));

import { useMessageAreaMenu } from '../useMessageAreaMenu';

function Area() {
  const menu = useMessageAreaMenu();
  return (
    <div onContextMenu={menu.onContextMenu}>
      {menu.menu}
      <div data-entry-uuid="entry-1">
        <p>a reply</p>
        <a href="https://example.com">a link</a>
        <div contentEditable="plaintext-only" suppressContentEditableWarning>
          a draft
        </div>
        <span onContextMenu={(event) => event.preventDefault()}>a sent file</span>
      </div>
    </div>
  );
}

const item = (name: string) => screen.queryByRole('menuitem', { name });

describe('useMessageAreaMenu', () => {
  beforeEach(() => {
    download.mockReset();
    vi.restoreAllMocks();
    window.getSelection()?.removeAllRanges();
  });

  it('opens on a right click, in place of the browser menu', () => {
    render(<Area />);

    const passedOn = fireEvent.contextMenu(screen.getByText('a reply'));

    expect(passedOn).toBe(false);
    expect(item('Copy')).not.toBeNull();
    expect(item('Download plugin front log')).not.toBeNull();
  });

  it('downloads the log with the message it was opened on, and closes', () => {
    render(<Area />);
    fireEvent.contextMenu(screen.getByText('a reply'));

    fireEvent.click(item('Download plugin front log')!);

    expect(download).toHaveBeenCalledWith({ messages, sessionId: 's1', entryUuid: 'entry-1' });
    expect(item('Download plugin front log')).toBeNull();
  });

  it('copies the selected text, and offers no copy when nothing is selected', () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    render(<Area />);
    fireEvent.contextMenu(screen.getByText('a reply'));
    expect(item('Copy')).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(item('Copy')).toBeNull();

    window.getSelection()!.selectAllChildren(screen.getByText('a reply'));
    fireEvent.contextMenu(screen.getByText('a reply'));
    fireEvent.click(item('Copy')!);

    expect(exec).toHaveBeenCalledWith('copy');
    expect(item('Copy')).toBeNull();
  });

  it('leaves a link its own menu', () => {
    render(<Area />);

    const passedOn = fireEvent.contextMenu(screen.getByText('a link'));

    expect(passedOn).toBe(true);
    expect(item('Copy')).toBeNull();
  });

  // A long press is how a phone selects text; taking it over would leave no way to select.
  it('leaves a long press by finger or pen to the browser', () => {
    render(<Area />);

    for (const pointerType of ['touch', 'pen']) {
      const press = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      Object.defineProperty(press, 'pointerType', { value: pointerType });

      expect(fireEvent(screen.getByText('a reply'), press)).toBe(true);
      expect(item('Copy')).toBeNull();
    }
  });

  it('leaves a field that is typed in its own menu', () => {
    render(<Area />);

    expect(fireEvent.contextMenu(screen.getByText('a draft'))).toBe(true);
    expect(item('Copy')).toBeNull();
  });

  it('stays out of the way of a menu something below has opened', () => {
    render(<Area />);

    fireEvent.contextMenu(screen.getByText('a sent file'));

    expect(item('Copy')).toBeNull();
  });
});
