import { useCallback, useState } from 'react';

/**
 * Collapsed state for a prompt panel. Scoped to the panel's mount on purpose:
 * every new request arrives expanded, so a panel collapsed earlier can never
 * hide a fresh one that is waiting for an answer.
 */
export function useCollapsiblePanel() {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed(prev => !prev), []);
  const expand = useCallback(() => setCollapsed(false), []);

  return { collapsed, toggle, expand };
}
