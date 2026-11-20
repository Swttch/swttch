import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';
import { ModalTitleBar } from '../ModalTitleBar';

const task = { name: 'list readme headings' } as WorkflowTask;

describe('ModalTitleBar back chevron', () => {
  it('draws no back button where nothing asks for one, as in the modal', () => {
    render(<ModalTitleBar task={task} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Back to the session' })).not.toBeInTheDocument();
    // Only the close button is there.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('draws a back button before the title when given one, and calls it on click', () => {
    const onBack = vi.fn();
    render(<ModalTitleBar task={task} onBack={onBack} backLabel="Back to the session" />);

    const back = screen.getByRole('button', { name: 'Back to the session' });
    const heading = screen.getByRole('heading');
    // Before the title, not after it.
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
