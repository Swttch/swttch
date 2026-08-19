import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import {NavigateOptions, useNavigate, useSearchParams} from 'react-router-dom';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useApi } from '@/contexts/ApiContext';
import { Route, routeToPath, withWorkingDir } from '@/router/routes';
import { MessageType } from '@/shared';
import { WORKING_DIR_PARAM_KEY } from './workingDirParam';
import { ROOT_DIR_PARAM_KEY } from './rootDirParam';

interface WorkingDirContextValue {
  workingDirectory: string | null;
  setWorkingDirectory: (dir: string | null, options?: NavigateOptions) => void;
  /**
   * Where the user is looking FROM: the anchor of the working-directory tree
   * and the scope sessions are listed for. Always present alongside
   * [workingDirectory], which is where the current session actually runs.
   *
   * The two carry the same value whenever the user is working in the directory
   * they are browsing, and diverge when they open a session nested under it.
   * Consumers should not branch on that — read the one that answers their
   * question. Resolution from the URL happens here and nowhere else.
   */
  rootDir: string | null;
  /**
   * IDE project root that contains the current [workingDirectory]. JetBrains
   * hosts return `project.basePath`; browser hosts return null (no ancestor
   * cap). Used by the working-directory dropdown to bound ancestor traversal
   * so the user cannot navigate above their IDE project.
   */
  ideRoot: string | null;
}

const WorkingDirContext = createContext<WorkingDirContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export { WORKING_DIR_PARAM_KEY, readWorkingDirFromUrl } from './workingDirParam';
export { ROOT_DIR_PARAM_KEY, readRootDirFromUrl } from './rootDirParam';

export function WorkingDirProvider(props: Props) {
  const { children } = props;
  const { isConnected, send, subscribe } = useBridgeContext();
  const api = useApi();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Strip trailing slashes so a path coming in via the URL (e.g. from the
  // native folder dialog, which on macOS appends "/") matches the
  // sessions-index `projectPath` values (which never have one). Without this,
  // `find(e => e.path === current)` misses, ancestors filter goes off, and
  // the synthesized fallback name becomes the full path.
  const rawWorkingDirectory = searchParams.get(WORKING_DIR_PARAM_KEY) || null;
  const workingDirectory = rawWorkingDirectory
    ? rawWorkingDirectory.replace(/\/+$/, '') || rawWorkingDirectory
    : null;
  // The single place `rootDir` is resolved. An absent parameter means the
  // anchor and the session's directory coincide — the ordinary case — so it
  // falls back to [workingDirectory] here rather than leaving every consumer
  // to remember the same `?? workingDir` dance.
  const rawRootDir = searchParams.get(ROOT_DIR_PARAM_KEY) || null;
  const rootDir = rawRootDir
    ? rawRootDir.replace(/\/+$/, '') || rawRootDir
    : workingDirectory;

  const [ideRoot, setIdeRoot] = useState<string | null>(null);

  const setWorkingDirectory = useCallback((dir: string | null, options: NavigateOptions = {}) => {
    const isOnProjectSelector = window.location.pathname === routeToPath(Route.PROJECT_SELECTOR);

    // "Project Select Page" with workingDir params => redirect new session page.
    if (isOnProjectSelector && dir) {
      navigate(withWorkingDir(routeToPath(Route.NEW_SESSION), dir), options);
    }

    // "Other pages" without workingDir params => redirect "Project Select Page".
    if (!isOnProjectSelector && !dir) {
      navigate(routeToPath(Route.PROJECT_SELECTOR), { replace: true, ...options });
    }
  }, [navigate]);

  // Routing guard: ensure workingDir and pathname are consistent
  useEffect(() => {
    if (isConnected) setWorkingDirectory(workingDirectory);
  }, [isConnected, workingDirectory, setWorkingDirectory]);

  // Sync workingDir to API whenever it changes
  useEffect(() => {
    if (workingDirectory) {
      api.setWorkingDir(workingDirectory);
    }
  }, [api, workingDirectory]);

  // Resolve IDE root for the current workingDirectory. The bridge replies with
  // the project base path on JetBrains hosts and null on browser hosts.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const unsubscribe = subscribe(MessageType.IDE_ROOT, (message) => {
      if (cancelled) return;
      const next = message.payload?.ideRoot;
      setIdeRoot(typeof next === 'string' && next.length > 0 ? next : null);
    });
    void send(MessageType.GET_IDE_ROOT, workingDirectory ? { workingDir: workingDirectory } : {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isConnected, workingDirectory, send, subscribe]);

  const value: WorkingDirContextValue = {
    workingDirectory,
    setWorkingDirectory,
    rootDir,
    ideRoot,
  };

  return (
    <WorkingDirContext.Provider value={value}>
      {children}
    </WorkingDirContext.Provider>
  );
}

export function useWorkingDir(): WorkingDirContextValue {
  const context = useContext(WorkingDirContext);
  if (!context) {
    throw new Error('useWorkingDir must be used within a WorkingDirProvider');
  }
  return context;
}

/**
 * Like {@link useWorkingDir} but returns null instead of throwing when there is
 * no provider. For deeply-nested, broadly-reused components (e.g. a tool-card
 * header) that want the working dir when available but must not hard-depend on
 * the provider being mounted.
 */
export function useWorkingDirOrNull(): WorkingDirContextValue | null {
  return useContext(WorkingDirContext);
}
