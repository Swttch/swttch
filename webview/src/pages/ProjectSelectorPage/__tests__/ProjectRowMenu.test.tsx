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

/** Sensible defaults so each test only overrides what it actually cares about. */
function renderMenu(overrides: Partial<React.ComponentProps<typeof ProjectRowMenu>> = {}) {
  const props: React.ComponentProps<typeof ProjectRowMenu> = {
    displayName: 'app',
    realName: 'app',
    currentName: '',
    currentDescription: '',
    path: '/Users/me/app',
    onDelete: vi.fn(),
    onSaveMeta: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return render(<ProjectRowMenu {...props} />);
}

describe('ProjectRowMenu', () => {
  it('starts closed', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu with edit, copy-path, and delete', () => {
    renderMenu();

    openMenu();

    expect(screen.getByRole('menuitem', { name: 'menu.editProject' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'menu.copyPath' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'menu.delete' })).toBeInTheDocument();
  });

  it('copies the real path, not an abbreviated one, and closes the menu', () => {
    renderMenu({ path: '/Users/me/app' });

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'menu.copyPath' }));

    expect(writeText).toHaveBeenCalledWith('/Users/me/app');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on an outside click', () => {
    render(
      <div>
        <ProjectRowMenu
          displayName="app"
          realName="app"
          currentName=""
          currentDescription=""
          path="/Users/me/app"
          onDelete={vi.fn()}
          onSaveMeta={vi.fn().mockResolvedValue(true)}
        />
        <button>elsewhere</button>
      </div>,
    );

    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('elsewhere'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    renderMenu();

    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  describe('delete', () => {
    it('asks for confirmation naming the project before deleting anything', () => {
      const onDelete = vi.fn();
      renderMenu({ displayName: 'my-app', onDelete });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('deleteConfirm.message:my-app')).toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    // The confirmation names what the user is actually looking at, which is
    // the alias once one is set — not the real folder name underneath it.
    it('names the alias in the confirmation, not the real folder name', () => {
      renderMenu({ displayName: 'My Cool App', realName: 'internal-tool-7' });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));

      expect(screen.getByText('deleteConfirm.message:My Cool App')).toBeInTheDocument();
    });

    it('closes the menu the moment delete is clicked, before the answer', () => {
      renderMenu();

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const onDelete = vi.fn();
      renderMenu({ onDelete });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'confirmDialog.cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('deletes and reports success when confirmed', async () => {
      const onDelete = vi.fn().mockResolvedValue(true);
      renderMenu({ onDelete });

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
      renderMenu({ onDelete });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'deleteConfirm.confirmLabel' }));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('deleteFailed'));
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });

  describe('edit project', () => {
    it('opens the edit dialog and closes the menu', () => {
      renderMenu();

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('shows the real folder name as context', () => {
      renderMenu({ realName: 'internal-tool-7' });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));

      expect(screen.getByText('internal-tool-7')).toBeInTheDocument();
    });

    // The name field must start with the raw alias, not the resolved display
    // name — pre-filling with the real folder name would make an unset alias
    // look already set, and clearing it would then look like a no-op.
    it('seeds the name field with the current alias, not the resolved display name', () => {
      renderMenu({ displayName: 'internal-tool-7', realName: 'internal-tool-7', currentName: '' });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));

      const nameInput = screen.getByPlaceholderText('internal-tool-7') as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });

    it('seeds both fields from the current alias and description', () => {
      renderMenu({ currentName: 'My App', currentDescription: 'The internal tool' });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));

      expect(screen.getByDisplayValue('My App')).toBeInTheDocument();
      expect(screen.getByDisplayValue('The internal tool')).toBeInTheDocument();
    });

    it('saves the edited fields and reports success', async () => {
      const onSaveMeta = vi.fn().mockResolvedValue(true);
      renderMenu({ onSaveMeta });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));
      fireEvent.change(screen.getByLabelText('editDialog.nameLabel'), {
        target: { value: 'My App' },
      });
      fireEvent.change(screen.getByLabelText('editDialog.descriptionLabel'), {
        target: { value: 'notes' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'editDialog.save' }));

      await waitFor(() =>
        expect(onSaveMeta).toHaveBeenCalledWith({ name: 'My App', description: 'notes' }),
      );
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('editDone'));
    });

    it('discards the edit and saves nothing when cancelled', () => {
      const onSaveMeta = vi.fn();
      renderMenu({ onSaveMeta });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));
      fireEvent.change(screen.getByLabelText('editDialog.nameLabel'), {
        target: { value: 'Changed' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'editDialog.cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onSaveMeta).not.toHaveBeenCalled();
    });

    it('reports failure without pretending it worked', async () => {
      const onSaveMeta = vi.fn().mockResolvedValue(false);
      renderMenu({ onSaveMeta });

      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'menu.editProject' }));
      fireEvent.click(screen.getByRole('button', { name: 'editDialog.save' }));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('editFailed'));
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });
});
