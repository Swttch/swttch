import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useIdeSelection, IdeSelectionPayload } from '@/hooks/useIdeSelection';
import { useSessionContext } from './SessionContext';
import { useSettings } from './SettingsContext';
import { SettingKey } from '@/types/settings';
import { resolveInitialInclude } from './ideSelectionInitialState';

interface IdeSelectionContextType {
  /** The latest IDE selection for the current working dir, or null. */
  currentSelection: IdeSelectionPayload | null;
  /**
   * Whether the next send should prepend the IDE-context tag. Seeded per
   * session from the `attachEditorContext` setting (#237); enabled unless that
   * setting is explicitly false.
   */
  includeSelection: boolean;
  /** Flip the include flag (chip click). */
  toggleIncludeSelection: () => void;
}

const IdeSelectionContext = createContext<IdeSelectionContextType>({
  currentSelection: null,
  includeSelection: true,
  toggleIncludeSelection: () => {},
});

export function useIdeSelectionContext() {
  return useContext(IdeSelectionContext);
}

interface Props {
  children: ReactNode;
  /**
   * Shared refs handed down from ChatProviderBridge so the sibling
   * ChatStreamProvider can read the live selection / toggle inside its stable
   * sendMessage callback WITHOUT subscribing to this context (which re-renders
   * on every IDE selection change). Mirrors the inputRef pattern.
   */
  currentSelectionRef?: React.MutableRefObject<IdeSelectionPayload | null>;
  includeSelectionRef?: React.MutableRefObject<boolean>;
}

/**
 * Owns the IDE-context state used by the composer chip and by message
 * injection:
 *  - currentSelection: latest IDE_SELECTION push for this working dir.
 *  - includeSelection: user toggle (eye / eye-off), seeded each session from
 *    the `attachEditorContext` setting and kept session-local thereafter — a
 *    click changes this session only and is never saved back (#237).
 *
 * State lives here (not in ChatStreamProvider) so the chip can re-render on
 * selection changes, while the live values are also mirrored into refs so the
 * outer ChatStreamProvider reads them without re-rendering its consumers.
 */
export function IdeSelectionProvider(props: Props) {
  const { children, currentSelectionRef, includeSelectionRef } = props;
  const { workingDirectory, currentSessionId } = useSessionContext();
  const { currentSelection } = useIdeSelection({ currentWorkingDir: workingDirectory ?? '' });
  const { settings, isLoading } = useSettings();

  // The setting seeds this state; it never receives it back. Start excluded
  // while the value is still unknown — see resolveInitialInclude for why the
  // unknown case leans that way.
  const seeded = resolveInitialInclude({
    isLoading,
    value: settings[SettingKey.ATTACH_EDITOR_CONTEXT],
  });
  const [includeSelection, setIncludeSelection] = useState(seeded);

  // Re-seed on the two events that begin a session's chip state: the settings
  // value first becoming known, and moving to a different session (/clear,
  // reset and new session all land here via the URL-derived id).
  //
  // Keyed on both so a mid-session toggle survives unrelated re-renders: the
  // effect only re-seeds when one of the two keys actually changes, which is
  // what keeps the click session-local.
  const seedKeyRef = useRef<string | null>(null);
  const seedKey = `${isLoading ? 'pending' : 'ready'}:${currentSessionId ?? 'new'}`;
  useEffect(() => {
    if (seedKeyRef.current === seedKey) return;
    seedKeyRef.current = seedKey;
    setIncludeSelection(seeded);
  }, [seedKey, seeded]);

  const toggleIncludeSelection = useCallback(() => {
    setIncludeSelection((prev) => !prev);
  }, []);

  // Mirror live values into the shared refs (effect, not during render).
  useEffect(() => {
    if (currentSelectionRef) currentSelectionRef.current = currentSelection;
  }, [currentSelection, currentSelectionRef]);

  useEffect(() => {
    if (includeSelectionRef) includeSelectionRef.current = includeSelection;
  }, [includeSelection, includeSelectionRef]);

  return (
    <IdeSelectionContext.Provider
      value={{ currentSelection, includeSelection, toggleIncludeSelection }}
    >
      {children}
    </IdeSelectionContext.Provider>
  );
}
