import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConfirmDialog } from '../index';

describe('ConfirmDialog onReady', () => {
  const baseProps = {
    title: 'Open it',
    message: 'The usual question.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it('loads first: the title stays, the body is a spinner with the word, and the message waits', async () => {
    const d = deferred();
    render(<ConfirmDialog {...baseProps} onReady={() => d.promise} />);

    expect(screen.getByText('Open it')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-loading')).toHaveTextContent('Loading…');
    expect(screen.queryByText('The usual question.')).not.toBeInTheDocument();

    await act(async () => d.resolve());
    expect(screen.queryByTestId('confirm-dialog-loading')).not.toBeInTheDocument();
    expect(screen.getByText('The usual question.')).toBeInTheDocument();
  });

  it('takes no input on the confirm button while loading, and Cancel keeps working', async () => {
    const d = deferred();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel} onReady={() => d.promise} />);

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm.className).toContain('pointer-events-none');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve());
  });

  it('opens the confirm button once ready', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onReady={async () => undefined} />);

    await waitFor(() => expect(screen.queryByTestId('confirm-dialog-loading')).not.toBeInTheDocument());
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm.className).not.toContain('pointer-events-none');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the reason as it was given when getting ready fails, and keeps confirm closed', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onConfirm={onConfirm}
        onReady={() => Promise.reject(new Error('backend said no'))}
      />,
    );

    expect(await screen.findByTestId('confirm-dialog-error')).toHaveTextContent('backend said no');
    expect(screen.queryByText('The usual question.')).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm.className).toContain('pointer-events-none');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not apply the result after the dialog is gone', async () => {
    const d = deferred();
    const { unmount } = render(<ConfirmDialog {...baseProps} onReady={() => d.promise} />);
    unmount();
    await act(async () => d.resolve());
  });
});
