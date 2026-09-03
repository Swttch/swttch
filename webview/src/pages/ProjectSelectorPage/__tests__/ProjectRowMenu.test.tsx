import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'name' in opts ? `${key}:${String(opts.name)}` : key,
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

import { ProjectRowMenu } from '../ProjectRowMenu';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'menu.label' }));
}

describe('ProjectRowMenu', () => {
  it('starts closed', () => {
    render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={vi.fn()} />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu with copy-path and delete', () => {
    render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={vi.fn()} />);

    openMenu();

    expect(screen.getByRole('menuitem', { name: 'menu.copyPath' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'menu.delete' })).toBeInTheDocument();
  });

  it('copies the real path, not an abbreviated one, and closes the menu', () => {
    render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={vi.fn()} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'menu.copyPath' }));

    expect(writeText).toHaveBeenCalledWith('/Users/me/app');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on an outside click', () => {
    render(
      <div>
        <ProjectRowMenu name="app" path="/Users/me/app" onDelete={vi.fn()} />
        <button>elsewhere</button>
      </div>,
    );

    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('elsewhere'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={vi.fn()} />);

    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  describe('delete', () => {
    it('asks for confirmation naming the project before deleting anything', () => {
      const onDelete = vi.fn();
      render(<ProjectRowMenu name="my-app" path="/Users/me/my-app" onDelete={onDelete} />);

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('deleteConfirm.message:my-app')).toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('closes the menu the moment delete is clicked, before the answer', () => {
      render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={vi.fn()} />);

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const onDelete = vi.fn();
      render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={onDelete} />);

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'confirmDialog.cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('deletes and reports success when confirmed', async () => {
      const onDelete = vi.fn().mockResolvedValue(true);
      render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={onDelete} />);

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'deleteConfirm.confirmLabel' }));

      await waitFor(() => expect(onDelete).toHaveBeenCalled());
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('deleteDone'));
      expect(toastError).not.toHaveBeenCalled();
    });

    // Backend refused the write (e.g. #386-style unreadable file) or the
    // request itself failed — either way the row must not silently vanish
    // while claiming success.
    it('reports failure without pretending it worked', async () => {
      const onDelete = vi.fn().mockResolvedValue(false);
      render(<ProjectRowMenu name="app" path="/Users/me/app" onDelete={onDelete} />);

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'deleteConfirm.confirmLabel' }));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('deleteFailed'));
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });
});
