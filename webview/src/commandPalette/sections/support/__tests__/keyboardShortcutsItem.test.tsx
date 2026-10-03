import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getSupportItems } from '../items';
import { StaticItem } from '../../../types';
import { OPEN_HELP_EVENT } from '@/components/HelpModal/events';

const item = (): StaticItem =>
  getSupportItems().find((candidate) => candidate.id === 'keyboard-shortcuts') as StaticItem;

describe('the "Keyboard shortcuts" support item', () => {
  it('is listed in the support section', () => {
    expect(item()).toBeDefined();
    expect(item().label).toBe('Keyboard shortcuts');
    expect(item().disabled).toBe(false);
  });

  it('asks the help modal to open when chosen', async () => {
    const heard = vi.fn();
    window.addEventListener(OPEN_HELP_EVENT, heard);

    await item().execute();

    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_HELP_EVENT, heard);
  });

  it('shows the shortcut that opens it beside the label', () => {
    render(<>{item().valueComponent?.()}</>);
    expect(screen.getByText('/')).toBeInTheDocument();
  });
});
