import { useEffect } from 'react';
import { useCommandPaletteRegistry } from '@/commandPalette/CommandPaletteProvider';

/**
 * Hook to handle keyboard shortcuts in the WebView.
 * Delegates to KeyboardRegistry for all shortcut handling.
 *
 * Registered shortcuts (via KeyboardRegistry):
 * - Cmd+N (Mac) / Ctrl+N (Windows/Linux): Open new tab
 * - Cmd+, (Mac) / Ctrl+, (Windows/Linux): Open settings
 * - Cmd+Shift+C (Mac) / Ctrl+Shift+C (Windows/Linux): Clear conversation (from ClearCommand)
 * - Cmd+Option+A (Mac) / Ctrl+Alt+A (Windows/Linux): Archive the open session, or bring it back (see archiveShortcut)
 */
export function useKeyboardShortcuts() {
  const { keyboardRegistry } = useCommandPaletteRegistry();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (keyboardRegistry.handleKeyEvent(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardRegistry]);
}
