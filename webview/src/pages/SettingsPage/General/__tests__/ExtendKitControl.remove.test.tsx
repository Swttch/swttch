import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ExtendKitInfo } from '@/hooks/queries/useExtendKit';

/**
 * Acceptance for: "As a user who installed the kit, I want to remove it from the
 * same line that tells me it is installed."
 */

let kitInfo: ExtendKitInfo | undefined;
let uninstalling = false;
let refreshing = false;
const installMock = vi.fn(() => Promise.resolve());
const uninstallMock = vi.fn(() => Promise.resolve());
const refreshMock = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({
    info: kitInfo,
    loading: kitInfo === undefined,
    install: installMock,
    installing: false,
    uninstall: uninstallMock,
    uninstalling,
    refresh: refreshMock,
    refreshing,
  }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

// Imported AFTER the mocks so they are wired first.
import { ExtendKitControl } from '../ExtendKitControl';

const INSTALLED: ExtendKitInfo = {
  packageName: '@swttch/extend-kit',
  installed: '0.4.0',
  latest: '0.4.0',
  updatable: false,
};

/**
 * The trash button, found the way a screen reader would. It carries an
 * aria-label; the dialog's confirm button carries visible TEXT with the same
 * word, so the two are told apart by which one has the label attribute.
 */
function removeButton() {
  return screen
    .getAllByRole('button', { name: /remove|삭제/i })
    .find((b) => b.hasAttribute('aria-label'))!;
}

/** Click through the confirmation the remove button raises. */
async function confirmRemoval() {
  fireEvent.click(removeButton());
  await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
  const confirmInDialog = screen
    .getAllByRole('button', { name: /remove|삭제/i })
    .find((b) => !b.hasAttribute('aria-label'))!;
  fireEvent.click(confirmInDialog);
}

describe('ExtendKitControl — removing the kit', () => {
  beforeEach(() => {
    uninstalling = false;
    refreshing = false;
    uninstallMock.mockClear();
    refreshMock.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    uninstallMock.mockImplementation(() => Promise.resolve());
    kitInfo = INSTALLED;
  });

  it('offers removal only once the kit is installed', () => {
    kitInfo = { ...INSTALLED, installed: null };
    render(<ExtendKitControl />);
    // Nothing to remove yet — the line offers installing instead.
    expect(screen.queryByRole('button', { name: /remove|삭제/i })).toBeNull();
  });

  it('shows the remove control beside the version', () => {
    render(<ExtendKitControl />);
    expect(screen.getByText('v0.4.0')).toBeDefined();
    expect(removeButton()).toBeDefined();
  });

  // Removal turns voice input off machine-wide and reinstalling is a download,
  // so a stray click must not be enough.
  it('asks before removing anything', () => {
    render(<ExtendKitControl />);
    fireEvent.click(removeButton());
    expect(uninstallMock).not.toHaveBeenCalled();
  });

  it('removes once the confirmation is accepted', async () => {
    render(<ExtendKitControl />);
    await confirmRemoval();
    await waitFor(() => expect(uninstallMock).toHaveBeenCalledTimes(1));
  });

  it('reports completion with a toast', async () => {
    render(<ExtendKitControl />);
    await confirmRemoval();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  // The backend hands back a runnable command when a global location needs
  // elevation, so the message is worth showing verbatim rather than replacing.
  it('surfaces the backend message when removal fails', async () => {
    uninstallMock.mockImplementation(() => Promise.reject(new Error('sudo npm uninstall -g @swttch/extend-kit')));
    render(<ExtendKitControl />);
    await confirmRemoval();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toContain('sudo npm uninstall -g');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('disables the control while a removal is in flight', () => {
    uninstalling = true;
    render(<ExtendKitControl />);
    expect(removeButton().hasAttribute('disabled')).toBe(true);
  });
});

/**
 * Acceptance for: "As a user who changed the kit outside this app, I want to
 * re-check without reopening the screen."
 */
describe('ExtendKitControl — re-checking the version', () => {
  beforeEach(() => {
    uninstalling = false;
    refreshing = false;
    refreshMock.mockClear();
    kitInfo = INSTALLED;
  });

  it('re-checks when the version is clicked', async () => {
    render(<ExtendKitControl />);
    fireEvent.click(screen.getByText('v0.4.0'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it('says it is checking while the answer is in flight', () => {
    refreshing = true;
    render(<ExtendKitControl />);
    // The version is replaced by the progress text rather than sitting next to
    // it: the number on screen would otherwise be the stale one being replaced.
    expect(screen.queryByText('v0.4.0')).toBeNull();
  });

  it('does not re-check while a removal is running', () => {
    uninstalling = true;
    render(<ExtendKitControl />);
    fireEvent.click(screen.getByText('v0.4.0'));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
