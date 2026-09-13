import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WhatsNewModal } from '../index';

const openUrl = vi.fn();
vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openUrl }),
}));

// The modal reads its strings from the chat namespace; the test only needs the
// keys back so assertions can name them.
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const releases = [
  { id: 3, version: '0.31.0', notes: '<h3>Newest</h3><ul><li>Third item</li></ul>', cdate: '1757116800000' },
  { id: 2, version: '0.30.2', notes: '<h3>Middle</h3><ul><li>Second item</li></ul>', cdate: '1756857600000' },
  { id: 1, version: '0.30.1', notes: '<h3>Oldest</h3><ul><li>First item</li></ul>', cdate: '1756598400000' },
];

describe('WhatsNewModal', () => {
  beforeEach(() => {
    cleanup();
    openUrl.mockClear();
  });

  it('opens on the installed version rather than the newest listing entry', () => {
    render(<WhatsNewModal releases={releases} initialVersion="0.30.2" onClose={vi.fn()} />);

    expect(screen.getByText('v0.30.2')).toBeTruthy();
    expect(screen.getByTestId('whats-new-pager').textContent).toBe('2 / 3');
  });

  it('falls back to the newest release when the installed version is not listed', () => {
    render(<WhatsNewModal releases={releases} initialVersion="9.9.9" onClose={vi.fn()} />);

    expect(screen.getByText('v0.31.0')).toBeTruthy();
    expect(screen.getByTestId('whats-new-pager').textContent).toBe('1 / 3');
  });

  it('pages through the whole history one release at a time', () => {
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('whatsNew.older'));
    expect(screen.getByTestId('whats-new-pager').textContent).toBe('2 / 3');
    expect(screen.getByText('Middle')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('whatsNew.older'));
    expect(screen.getByTestId('whats-new-pager').textContent).toBe('3 / 3');
    expect(screen.getByText('Oldest')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('whatsNew.newer'));
    expect(screen.getByTestId('whats-new-pager').textContent).toBe('2 / 3');
  });

  it('disables paging past either end', () => {
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={vi.fn()} />);

    expect((screen.getByLabelText('whatsNew.newer') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('whatsNew.older'));
    fireEvent.click(screen.getByLabelText('whatsNew.older'));
    expect((screen.getByLabelText('whatsNew.older') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the marketplace note as markup, not as escaped text', () => {
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={vi.fn()} />);

    const body = screen.getByTestId('whats-new-body');
    expect(body.querySelectorAll('li').length).toBe(1);
    expect(body.textContent).toContain('Third item');
  });

  it('strips script tags out of an untrusted release note', () => {
    const hostile = [{
      id: 1,
      version: '0.31.0',
      notes: '<h3>T</h3><p>safe</p><script>window.pwned = 1</script>',
      cdate: '1757116800000',
    }];
    render(<WhatsNewModal releases={hostile} initialVersion="0.31.0" onClose={vi.fn()} />);

    const body = screen.getByTestId('whats-new-body');
    expect(body.querySelector('script')).toBeNull();
    expect(body.textContent).toContain('safe');
  });

  it('closes on the X button, on the backdrop and on Escape', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText('whatsNew.close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('whats-new-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('closes on the footer dismiss button as well as the corner X', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={onClose} />);

    // The X carries the label; the footer button carries the same string as its
    // visible text, so the two are addressed differently on purpose.
    fireEvent.click(screen.getByText('whatsNew.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the fixed English masthead regardless of the active locale', () => {
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={vi.fn()} />);

    // `t` is stubbed to echo keys here, so a translated title would read
    // "whatsNew.title". The masthead is hard-coded instead.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe("What's new");
  });

  it('does not close when the click lands inside the dialog', () => {
    const onClose = vi.fn();
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('whats-new-body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends the Star button to the repository through the adapter', () => {
    render(<WhatsNewModal releases={releases} initialVersion="0.31.0" onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('whatsNew.star'));
    expect(openUrl).toHaveBeenCalledWith('https://github.com/yhk1038/claude-code-gui-jetbrains');
  });

  it('renders nothing when the listing is empty', () => {
    const { container } = render(<WhatsNewModal releases={[]} onClose={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
