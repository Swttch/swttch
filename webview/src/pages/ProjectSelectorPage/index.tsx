import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProjectRow } from './ProjectRow';
import { ProjectSortToggle } from './ProjectSortToggle';
import { type ProjectSortOrder, persistSortOrder, readSortOrder } from './sortOrderStorage';
import { useBridgeContext } from '../../contexts/BridgeContext';
import { useWorkingDir } from '@/contexts';
import { MessageType, abbreviateHomeDir, isSameWorkingDir } from '@/shared';
import { useTranslation } from '@/i18n';

interface Project {
  name: string;
  path: string;
  sessionCount: number;
  lastModified: string;
  createdAt: string;
}

/**
 * [projects] ordered by the chosen timestamp, newest first.
 *
 * 'recent' reads lastModified — the newest session's last write, so it answers
 * "what did I touch last". 'created' reads createdAt — the earliest known
 * session, so it answers "what did I start most recently" instead. The two
 * disagree exactly for a project someone opened long ago and is still actively
 * using, which is the case this toggle exists to separate.
 */
export function sortProjects(projects: Project[], order: ProjectSortOrder): Project[] {
  const key: keyof Pick<Project, 'lastModified' | 'createdAt'> =
    order === 'created' ? 'createdAt' : 'lastModified';
  return [...projects].sort((a, b) => new Date(b[key]).getTime() - new Date(a[key]).getTime());
}

/**
 * [projects] with the pinned ones lifted to the top, each group otherwise
 * keeping the order the backend sent.
 *
 * Membership is decided by isSameWorkingDir rather than string equality: a
 * pinned path is stored as it was spelled when pinned, and the same directory
 * can reach the list spelled differently (Windows case, or slash versus
 * backslash). Comparing strings would leave a star that pins but never unpins.
 */
export function sortFavoritesFirst(projects: Project[], favoritePaths: string[]): Project[] {
  const pinned = (project: Project) =>
    favoritePaths.some((favorite) => isSameWorkingDir(favorite, project.path));

  // Array.prototype.sort is stable, so the backend's recency order survives
  // inside each group.
  return [...projects].sort((a, b) => Number(pinned(b)) - Number(pinned(a)));
}

/**
 * Rows whose name or path contains [query], case-insensitively.
 *
 * The abbreviated path is matched as well as the recorded one, because that is
 * the spelling on screen: someone reading `~/Projects/app` and typing `~/Pro`
 * is searching for what they can see.
 */
export function filterProjects(projects: Project[], query: string, homeDir: string | null): Project[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return projects;

  return projects.filter((project) => {
    const haystacks = [project.name, project.path, abbreviateHomeDir(project.path, homeDir)];
    return haystacks.some((value) => value.toLowerCase().includes(needle));
  });
}

export function ProjectSelectorPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [favoritePaths, setFavoritePaths] = useState<string[]>([]);
  // Lazy initializer so localStorage is read once, not on every render.
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>(() => readSortOrder());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { send, isConnected, subscribe } = useBridgeContext();
  const { setWorkingDirectory } = useWorkingDir();
  const { t } = useTranslation('projectSelector');
  const searchRef = useRef<HTMLInputElement>(null);

  const handleOpenFolderDialog = () => {
    const unsubscribe = subscribe(MessageType.FOLDER_SELECTED, (message) => {
      const selectedPath = message.payload?.path as string | null;
      unsubscribe();
      if (selectedPath) {
        setWorkingDirectory(selectedPath, { replace: false });
      }
    });
    send(MessageType.OPEN_FOLDER_DIALOG, {});
  };

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Subscribe to PROJECTS_LIST response
        const unsubscribe = subscribe(MessageType.PROJECTS_LIST, (message) => {
          const projectsList = (message.payload?.projects as Project[]) || [];
          setProjects(projectsList);
          setHomeDir((message.payload?.homeDir as string | undefined) ?? null);
          setFavoritePaths((message.payload?.favoritePaths as string[] | undefined) ?? []);
          setIsLoading(false);
          unsubscribe();
        });

        // Request projects list
        await send(MessageType.GET_PROJECTS, {});
      } catch (err) {
        setError(t('errors.loadFailed'));
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [isConnected, send, subscribe]);

  const visible = useMemo(
    () =>
      filterProjects(
        sortFavoritesFirst(sortProjects(projects, sortOrder), favoritePaths),
        query,
        homeDir,
      ),
    [projects, favoritePaths, sortOrder, query, homeDir],
  );

  const handleSortOrderChange = (order: ProjectSortOrder) => {
    setSortOrder(order);
    persistSortOrder(order);
  };

  const isFavorite = useCallback(
    (path: string) => favoritePaths.some((favorite) => isSameWorkingDir(favorite, path)),
    [favoritePaths],
  );

  /**
   * Pin or unpin, showing the change at once and then settling on whatever the
   * backend stored. The optimistic step keeps the star responsive; the reply is
   * what the next load will render, so it wins.
   */
  const toggleFavorite = async (path: string) => {
    const next = !isFavorite(path);
    setFavoritePaths((paths) =>
      next ? [...paths, path] : paths.filter((favorite) => !isSameWorkingDir(favorite, path)),
    );

    try {
      const ack = await send<{ status?: string; favoritePaths?: string[] }>(
        MessageType.SET_PROJECT_FAVORITE,
        { path, favorite: next },
      );
      // The backend answers with the list as stored, on success and on a
      // refused write alike, so taking it either way puts the screen back in
      // step with the file rather than leaving it claiming an unsaved pin.
      if (Array.isArray(ack?.favoritePaths)) setFavoritePaths(ack.favoritePaths);
    } catch {
      setFavoritePaths((paths) =>
        next ? paths.filter((favorite) => !isSameWorkingDir(favorite, path)) : [...paths, path],
      );
    }
  };

  /**
   * Deletes a project's session records. The row's menu already ran the
   * confirmation and shows the success/failure toast; this only talks to the
   * backend and, on success, drops the row so a second visit to the folder
   * (there is nothing left to open) does not remain possible from this list.
   */
  const deleteProject = async (path: string): Promise<boolean> => {
    try {
      const ack = await send<{ status?: string }>(MessageType.DELETE_PROJECT, { path });
      const ok = ack?.status !== 'error';
      if (ok) setProjects((current) => current.filter((p) => p.path !== path));
      return ok;
    } catch {
      return false;
    }
  };

  // A narrowed list can be shorter than where the cursor was standing.
  useEffect(() => {
    setActiveIndex((index) => (index < visible.length ? index : 0));
  }, [visible.length]);

  // Focus starts in the search box so typing filters straight away, with the
  // arrow keys driving the list from there rather than moving focus into it.
  useEffect(() => {
    if (!isLoading && !error && projects.length > 0) searchRef.current?.focus();
  }, [isLoading, error, projects.length]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (visible.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((index) => (index + 1) % visible.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((index) => (index - 1 + visible.length) % visible.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const project = visible[activeIndex];
      if (project) setWorkingDirectory(project.path, { replace: false });
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-base">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-border-strong border-t-text-secondary rounded-full mx-auto mb-3" />
          <p className="text-text-tertiary text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-base">
        <div className="text-center">
          <p className="text-state-error-fg text-sm mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-text-secondary text-xs hover:text-text-primary underline"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-base">
        <div className="text-center max-w-md px-4 w-full">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-surface-overlay flex items-center justify-center">
            <svg className="w-6 h-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="text-text-secondary text-sm mb-4">{t('empty')}</p>
          <button
            onClick={handleOpenFolderDialog}
            className="w-full border border-dashed border-border-default hover:border-border-strong rounded-lg py-2.5 text-text-tertiary hover:text-text-secondary text-sm transition-colors"
          >
            + {t('addProject')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface-base">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pt-6 min-h-0">
        {/* Search on the left, the one action we have on the right */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="w-full rounded bg-transparent py-2 ps-9 pe-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>
          <ProjectSortToggle order={sortOrder} onChange={handleSortOrderChange} />
          <button
            onClick={handleOpenFolderDialog}
            className="flex-shrink-0 rounded border border-border-default px-4 py-2 text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            {t('addProject')}
          </button>
        </div>

        <div className="mt-3 border-t border-border-default" />

        {/*
          The list takes the window, not a 448px column.

          pe-3 + project-picker-list: without either, a row's kebab trigger
          sits right against the scrollbar track — this app runs on JCEF/
          Chromium's classic, space-taking scrollbar (no macOS-style overlay),
          so that gap is real screen space, not a rendering quirk. pe-3 pulls
          the row content away from the edge; project-picker-list shrinks the
          scrollbar itself from Chromium's ~15px default to 6px, matching the
          thin scrollbar this app already uses for the slash-command panel.
        */}
        <div className="project-picker-list min-h-0 flex-1 overflow-y-auto py-3 pe-3">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-tertiary">{t('noMatches')}</p>
          ) : (
            visible.map((project, index) => (
              <ProjectRow
                key={project.path}
                name={project.name}
                path={project.path}
                sessionCount={project.sessionCount}
                homeDir={homeDir}
                isActive={index === activeIndex}
                isFavorite={isFavorite(project.path)}
                onSelect={() => setWorkingDirectory(project.path, { replace: false })}
                onToggleFavorite={() => void toggleFavorite(project.path)}
                onDelete={() => deleteProject(project.path)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
