/**
 * Cancelling a permission prompt has to reach the CLI, and the click path is
 * where that broke: React hands a click handler its MouseEvent, so a cancel
 * wired straight through to `onDeny(reason?)` sent the event as the reason. The
 * bridge then failed to serialise it ("Converting circular structure to JSON"),
 * no control_response ever went out, and the turn hung with the diff still open
 * — measured in the sandbox IDE, not assumed.
 *
 * Typing does not catch this: passing an argument to a `() => void` is legal.
 * So it is pinned here instead.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBanner } from '../PermissionBanner';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

const permission: PendingPermission = {
  controlRequestId: 'ctrl-1',
  toolName: 'Write',
  toolUseId: 'toolu_1',
  input: { file_path: '/tmp/cart.js', content: 'x' },
  riskLevel: 'medium',
  description: 'Write file: /tmp/cart.js',
};

function renderBanner(onDeny: (reason?: string) => void) {
  render(
    <PermissionBanner
      permission={permission}
      onApprove={vi.fn()}
      onApproveForSession={vi.fn()}
      onDeny={onDeny}
    />,
  );
}

describe('PermissionBanner — cancelling', () => {
  it('denies with no reason when "Esc to cancel" is clicked', () => {
    const onDeny = vi.fn();
    renderBanner(onDeny);

    fireEvent.click(screen.getByRole('button', { name: 'Esc to cancel' }));

    expect(onDeny).toHaveBeenCalledTimes(1);
    // The reason must be absent, not a MouseEvent: anything unserialisable here
    // stops the whole message from reaching the backend.
    expect(onDeny.mock.calls[0][0]).toBeUndefined();
  });

  it('denies with no reason when Escape is pressed', () => {
    const onDeny = vi.fn();
    renderBanner(onDeny);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onDeny.mock.calls[0][0]).toBeUndefined();
  });

  it('passes a real reason through when the user types one', () => {
    // The reason argument still has to work — this is not "drop every argument".
    const onDeny = vi.fn();
    renderBanner(onDeny);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'not this file' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onDeny).toHaveBeenCalledWith('not this file');
  });
});
