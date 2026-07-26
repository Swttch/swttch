import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * Session-local override for the "auto-resume on limit" preference, modeled on
 * how Cursor's Claude Code extension handles thinking/fast mode: a global
 * default (the app setting `autoResumeOnLimit`) seeds each session, but a session
 * can override it on the fly without touching the global setting. Unlike model
 * selection there is no CLI source-of-truth for this (it's a pure GUI feature),
 * so the override lives in this in-memory, session-keyed store. It intentionally
 * does NOT persist to disk — an override is a per-session, in-the-moment choice;
 * a fresh session re-inherits the global default.
 */
interface AutoResumeOverrideContextValue {
  /** The session's override (true/false), or undefined when it inherits the global default. */
  getOverride: (sessionId: string | null | undefined) => boolean | undefined;
  /** Set the session-local override. */
  setOverride: (sessionId: string, value: boolean) => void;
}

const AutoResumeOverrideContext = createContext<AutoResumeOverrideContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function AutoResumeOverrideProvider(props: Props) {
  const { children } = props;
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const getOverride = useCallback(
    (sessionId: string | null | undefined): boolean | undefined =>
      sessionId ? overrides[sessionId] : undefined,
    [overrides],
  );

  const setOverride = useCallback((sessionId: string, value: boolean): void => {
    setOverrides((prev) => ({ ...prev, [sessionId]: value }));
  }, []);

  return (
    <AutoResumeOverrideContext.Provider value={{ getOverride, setOverride }}>
      {children}
    </AutoResumeOverrideContext.Provider>
  );
}

export function useAutoResumeOverride(): AutoResumeOverrideContextValue {
  const ctx = useContext(AutoResumeOverrideContext);
  if (!ctx) {
    throw new Error('useAutoResumeOverride must be used within an AutoResumeOverrideProvider');
  }
  return ctx;
}
