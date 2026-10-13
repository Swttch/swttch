import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingBadge, SettingBadgeVariant } from '../SettingBadge';

/**
 * The badge a project-tab row wears when the project sets the value itself, and
 * the way back it offers: a reset link inside the badge's own tooltip. Switches
 * and text fields have no "Not set" entry to pick, and this is the one control
 * that works for every kind of row.
 */
beforeEach(() => cleanup());

const projectValueBadge = () => screen.getByRole('img', { name: /This project sets its own value/ });

describe('SettingBadge (project value)', () => {
  it('says the project overrides the global value', () => {
    render(<SettingBadge variant={SettingBadgeVariant.ProjectValue} />);

    expect(projectValueBadge()).toBeInTheDocument();
  });

  it('puts a reset link in the tooltip and runs it when pressed', async () => {
    const onReset = vi.fn();
    render(
      <SettingBadge
        variant={SettingBadgeVariant.ProjectValue}
        action={{ label: 'Reset to global', onClick: onReset }}
      />,
    );

    fireEvent.mouseEnter(projectValueBadge());
    const link = await screen.findByRole('button', { name: 'Reset to global' });
    fireEvent.click(link);

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows no reset link when the row gives no way back', async () => {
    render(<SettingBadge variant={SettingBadgeVariant.ProjectValue} />);

    fireEvent.mouseEnter(projectValueBadge());
    await screen.findByText(/This project sets its own value/);

    expect(screen.queryByRole('button', { name: 'Reset to global' })).not.toBeInTheDocument();
  });
});
