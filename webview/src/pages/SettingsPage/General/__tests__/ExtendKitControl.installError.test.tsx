import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ExtendKitInfo } from '@/hooks/queries/useExtendKit';

/**
 * Acceptance for: "As a user whose install was blocked by permissions, I want to
 * be able to read the command I have to run, instead of it vanishing."
 *
 * #298 follow-up. The backend already answers a permission failure with the exact
 * command to paste into a terminal — but it was shown in a toast that
 * react-hot-toast dismisses after 4 seconds. The reporter never used it; he
 * worked the command out himself and said the button "did nothing". A message
 * that cannot be read in the time it is shown is not a message.
 */

let kitInfo: ExtendKitInfo | undefined;
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
    uninstalling: false,
    refresh: refreshMock,
    refreshing: false,
  }),
}));

const toastError = vi.fn();
const toastDismiss = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: (...a: unknown[]) => toastError(...a),
    dismiss: (...a: unknown[]) => toastDismiss(...a),
  },
}));

import { ExtendKitControl } from '../ExtendKitControl';

const NOT_INSTALLED: ExtendKitInfo = {
  packageName: '@swttch/extend-kit',
  installed: null,
  latest: '0.4.0',
  updatable: false,
};

const PERMISSION_MESSAGE =
  'The update could not complete because it needs elevated permissions to write to a global install location. ' +
  'Run it yourself in a terminal:\n\n    sudo /usr/local/bin/npm install -g --prefix /usr/local @swttch/extend-kit';

/** The toast options object passed alongside the message. */
function toastOptions(): { duration?: number } {
  return (toastError.mock.calls[0][1] ?? {}) as { duration?: number };
}

/**
 * Render the toast body, which is a function of the toast instance.
 *
 * Returns the container too: asserting on text with a matcher function hits
 * every ancestor whose textContent contains it, so assertions read the body's
 * own textContent rather than searching the tree.
 */
function renderToastBody() {
  const body = toastError.mock.calls[0][0] as (t: { id: string }) => React.ReactElement;
  expect(typeof body).toBe('function');
  return render(body({ id: 'toast-1' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  kitInfo = NOT_INSTALLED;
});

describe('ExtendKitControl — a failed install has to stay readable', () => {
  it('keeps the error up instead of dismissing it on a timer', async () => {
    installMock.mockRejectedValueOnce(new Error(PERMISSION_MESSAGE));
    render(<ExtendKitControl />);

    fireEvent.click(screen.getByRole('button', { name: /install|설치/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Not 4000 (the library default) and not any other countdown: a message
    // holding a command to retype must wait for the reader.
    expect(toastOptions().duration).toBe(Infinity);
  });

  it('shows the backend message verbatim, so the command survives', async () => {
    installMock.mockRejectedValueOnce(new Error(PERMISSION_MESSAGE));
    render(<ExtendKitControl />);

    fireEvent.click(screen.getByRole('button', { name: /install|설치/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    const { container } = renderToastBody();
    // The whole point of the message: the exact command, sudo included.
    expect(container.textContent).toContain(
      'sudo /usr/local/bin/npm install -g --prefix /usr/local @swttch/extend-kit',
    );
  });

  it('offers a way to close it, since it will not close itself', async () => {
    installMock.mockRejectedValueOnce(new Error(PERMISSION_MESSAGE));
    render(<ExtendKitControl />);

    fireEvent.click(screen.getByRole('button', { name: /install|설치/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    const { getByRole } = renderToastBody();
    fireEvent.click(getByRole('button', { name: /dismiss|닫기/i }));
    expect(toastDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('shows the "did not complete, try again" message the same way', async () => {
    // The backend sends this when the command succeeded but the kit could not
    // be found even after a retry. It is prose, not a command, but it is the
    // only thing telling the user to press the button again.
    installMock.mockRejectedValueOnce(
      new Error('The @swttch/extend-kit installation did not complete. Please try again.'),
    );
    render(<ExtendKitControl />);

    fireEvent.click(screen.getByRole('button', { name: /install|설치/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    const { container } = renderToastBody();
    expect(container.textContent).toContain('did not complete');
    expect(container.textContent).toContain('try again');
  });
});
