import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useConfirmDialog } from '../useConfirmDialog';

// Helper component to exercise the hook inside a rendered tree
function TestHost() {
  const { confirmDialog, confirm } = useConfirmDialog();

  const handleShowDefault = async () => {
    await confirm({
      title: 'Test Title',
      message: 'Test message',
    });
  };

  const handleShowAndResolve = async () => {
    const result = await confirm({
      title: 'Resolve Test',
      message: 'Click confirm to resolve true',
    });
    // Write result to a data attribute so tests can read it
    document.getElementById('result-target')!.dataset.result = String(result);
  };

  const handleShowAndReject = async () => {
    const result = await confirm({
      title: 'Reject Test',
      message: 'Click cancel to resolve false',
    });
    document.getElementById('result-target')!.dataset.result = String(result);
  };

  return (
    <>
      <div id="result-target" />
      <button onClick={handleShowDefault} data-testid="trigger-default">
        Show Dialog
      </button>
      <button onClick={handleShowAndResolve} data-testid="trigger-confirm">
        Show Confirm
      </button>
      <button onClick={handleShowAndReject} data-testid="trigger-cancel">
        Show Cancel
      </button>
      {confirmDialog}
    </>
  );
}

describe('useConfirmDialog', () => {
  it('does not show the dialog before confirm() is called', () => {
    render(<TestHost />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the dialog when confirm() is called', async () => {
    render(<TestHost />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-default'));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('resolves the Promise with true when the Confirm button is clicked', async () => {
    render(<TestHost />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-confirm'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });

    const resultTarget = document.getElementById('result-target')!;
    expect(resultTarget.dataset.result).toBe('true');
  });

  it('resolves the Promise with false when the Cancel button is clicked', async () => {
    render(<TestHost />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-cancel'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    const resultTarget = document.getElementById('result-target')!;
    expect(resultTarget.dataset.result).toBe('false');
  });
});

describe('useConfirmDialog — confirmWithCheckbox', () => {
  function CheckboxHost() {
    const { confirmDialog, confirmWithCheckbox } = useConfirmDialog();

    const show = async () => {
      const result = await confirmWithCheckbox({
        title: 'With box',
        message: 'Tick it or not',
        confirmLabel: 'Go',
        checkbox: { label: 'Remember', defaultChecked: false },
      });
      document.getElementById('box-result')!.dataset.result = JSON.stringify(result);
    };

    return (
      <>
        <div id="box-result" />
        <button onClick={show} data-testid="trigger-box">
          Show
        </button>
        {confirmDialog}
      </>
    );
  }

  const read = () => document.getElementById('box-result')!.dataset.result;

  it('reports the box when the question is confirmed', async () => {
    render(<CheckboxHost />);
    fireEvent.click(screen.getByTestId('trigger-box'));

    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    });

    expect(read()).toBe('{"confirmed":true,"checked":true}');
  });

  it('reports the box as unchecked when the question is cancelled, however it was left', async () => {
    render(<CheckboxHost />);
    fireEvent.click(screen.getByTestId('trigger-box'));

    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    expect(read()).toBe('{"confirmed":false,"checked":false}');
  });
});
