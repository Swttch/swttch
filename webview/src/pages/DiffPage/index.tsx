import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '@/contexts/ApiContext';
import { useTranslation } from '@/i18n';
import { useStaticDocumentTitle } from '@/hooks/useStaticDocumentTitle';
import { useHunkDecisions } from './useHunkDecisions';
import type { DiffPreview } from '@/api/modules/ToolsApi';
import { DiffUnavailable } from './DiffUnavailable';
import { useCloseDiffWindow } from './useCloseDiffWindow';

/**
 * Loaded lazily because the renderer is large and most sessions never open this
 * page; paying for it up front would slow every chat down for a screen many
 * never see.
 */
const ReviewDiffSurface = lazy(() => import('../ChatPage/ReviewDiffSurface'));

interface Props {
  /**
   * The tool call to review. Read from the route when absent, which is the
   * ordinary case; passed in when the page is mounted as an overlay, where
   * there is no URL of its own.
   */
  toolUseId?: string;
  /** Dismiss an overlay. Absent when the page fills a window it can close. */
  onClose?: () => void;
  /**
   * Whether this page is drawn over a screen that is not its own.
   *
   * Decides one thing: whether the page may name the tab. See {@link diffTabTitle}
   * — an overlay must not, because the tab still belongs to the chat underneath.
   *
   * Separate from `onClose`, which both surfaces pass.
   */
  isOverlay?: boolean;
}

/**
 * Review one proposed file edit, and answer the permission request behind it.
 *
 * A page of its own rather than a strip inside the chat: a diff needs room, and
 * inside the chat column it had none — it was capped at a fixed height, scrolled
 * inside that cap, and dropped to a single column below 720px. Here the window
 * is the size, so those compromises are gone.
 *
 * The same page serves every host. An IDE opens it in an editor tab, a browser
 * in a tab or an overlay; all three arrive with nothing but a tool-call id and
 * fetch the rest, so none of them needs a variant of this component.
 */
export function DiffPage(props: Props) {
  const params = useParams<{ tool_use_id?: string }>();
  const toolUseId = props.toolUseId ?? params.tool_use_id ?? '';
  const api = useApi();
  const { t } = useTranslation('chat');
  const closeWindow = useCloseDiffWindow();
  const close = props.onClose ?? closeWindow;
  const isOverlay = props.isOverlay ?? false;

  const [preview, setPreview] = useState<DiffPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  // The proposed side as the reviewer has it now. Undefined until they touch
  // it, which is what tells the backend to let Claude's own call through.
  const editedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!toolUseId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.tools
      .getDiffPreview(toolUseId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, toolUseId]);

  const handleEdit = useCallback((contents: string) => {
    editedRef.current = contents;
  }, []);

  const hunks = useMemo(() => preview?.hunks ?? [], [preview]);
  const decisions = useHunkDecisions(hunks);

  /*
   * Whether the reviewer can pick parts of this change.
   *
   * They cannot when the backend could not split it — computeHunks answers null
   * for a change too large to diff, and stores an empty list. There is nothing
   * to tick there, and offering controls that decide nothing would be worse
   * than offering none.
   */
  const canPickHunks = hunks.length > 0;

  /*
   * The regions to write.
   *
   * With no split to work from, the whole proposal is the only region we can
   * name — which is what this screen sent for every review before it could pick.
   */
  const acceptedRanges = useMemo(() => {
    if (!preview) return [];
    if (canPickHunks) return decisions.acceptedRanges;
    return [
      {
        oldStart: 0,
        oldEnd: lineCount(preview.oldContent),
        newStart: 0,
        newEnd: lineCount(preview.newContent),
      },
    ];
  }, [preview, canPickHunks, decisions.acceptedRanges]);

  const resolve = useCallback(
    async (keepEdits: boolean) => {
      if (!preview?.sessionId || !preview.controlRequestId) return;
      setResolving(true);
      try {
        await api.tools.resolveDiff({
          toolUseId,
          controlRequestId: preview.controlRequestId,
          sessionId: preview.sessionId,
          // What the reviewer kept. Empty is a refusal, which is exactly what
          // Reject means and also what unticking every hunk means.
          acceptedRanges: keepEdits ? acceptedRanges : [],
          // Reject discards any edit: refusing a change is not a way to write
          // a different one.
          editedContent: keepEdits ? editedRef.current : undefined,
        });
        // Answered, so the window has done its job. In an IDE the backend closes
        // the tab; elsewhere this is what dismisses it.
        close();
      } finally {
        setResolving(false);
      }
    },
    [api, preview, toolUseId, close, acceptedRanges],
  );

  const fileName = useMemo(
    () => (preview ? (preview.filePath.split(/[\\/]/).pop() ?? preview.filePath) : ''),
    [preview],
  );

  /*
   * Name the window after the file being reviewed.
   *
   * One line covers both hosts: a browser tab reads document.title directly,
   * and the JetBrains editor tab derives its label from it too (see
   * useStaticDocumentTitle). Without this the tab wore the raw URL.
   *
   * The file name is not known at open time — the tab is addressed by tool call
   * and fetches the rest — so the label starts generic and narrows once the
   * change arrives, the way a chat tab does when its conversation is named.
   */
  useStaticDocumentTitle(diffTabTitle(fileName, isOverlay));

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-text-tertiary text-sm">{t('reviewDiff.loading')}</span>
      </div>
    );
  }

  // Answered while we were fetching, opened twice, or reloaded long after the
  // fact. Either way there is no question left to put on screen.
  if (!preview) return <DiffUnavailable onClose={close} />;

  return (
    <div className="flex h-full w-full flex-col bg-bg-primary">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-default px-4 py-3">
        <span
          className="truncate text-sm font-medium text-text-primary"
          title={preview.filePath}
        >
          {fileName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {/*
            A count of what is still open, not a control.

            Answering a hunk collapses it out of the diff, so the screen already
            says which ones are left; this only puts a number on it for a long
            file where the remaining ones are off-screen.
          */}
          {canPickHunks && decisions.openCount > 0 && (
            <>
              <span className="text-xs text-text-tertiary">
                {t('diffPage.hunk.remaining', { count: decisions.openCount })}
              </span>
              <span className="mx-1 h-4 w-px bg-border-default" aria-hidden />
            </>
          )}
          <button
            type="button"
            className="rounded bg-state-success-bg px-3 py-1.5 text-sm text-state-success-fg disabled:opacity-50"
            // Nothing ticked is a refusal, and this button does not say that.
            // Confirming here would answer no while reading "confirm".
            disabled={resolving || (canPickHunks && decisions.keptCount === 0)}
            onClick={() => void resolve(true)}
          >
            {t('diffPage.confirm')}
          </button>
          <button
            type="button"
            className="rounded bg-state-error-bg px-3 py-1.5 text-sm text-state-error-fg disabled:opacity-50"
            disabled={resolving}
            onClick={() => void resolve(false)}
          >
            {t('diffPage.cancel')}
          </button>
        </div>
      </header>

      {/*
        The diff takes the rest of the window and scrolls on its own, so the
        header — the file name and the two decisions — stays put however long
        the change is.
      */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="p-4 text-sm text-text-tertiary">{t('reviewDiff.loading')}</div>
          }
        >
          <ReviewDiffSurface
            preview={preview}
            onEdit={handleEdit}
            // Omitted when there is no split to pick from, which is what keeps
            // the per-hunk controls off that diff entirely.
            decisions={canPickHunks ? decisions : undefined}
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * What the window is called, before the file name is known.
 *
 * Not translated, and deliberately: this is the tab label, which sits next to
 * source file names in an editor's tab strip. "Diff" reads the same to every
 * developer, and a localized word here would be the odd one out in that row.
 *
 * This is NOT licence to leave other strings in English. It holds because the
 * row this word sits in is filenames; anything inside the page sits beside
 * translated text and has to match it. The hunk buttons were left half-English
 * on exactly this reasoning once, and read as a bug.
 */
const DIFF_TITLE_PREFIX = 'Diff';

/**
 * The label before the file name arrives, and for a request with no file to
 * name. Spelled out rather than a bare "Diff" so a tab in this state reads as a
 * screen rather than a truncated title.
 */
const DIFF_TITLE_FALLBACK = 'Diff view';

/**
 * What this page should call the tab it is drawn in — or '' to leave the tab's
 * name alone.
 *
 * An overlay names nothing. It is drawn OVER a chat that still owns the tab, and
 * the IDE takes an editor tab's label from document.title and persists it: a
 * review shown as an overlay would rename the chat underneath, and the wrong
 * name would outlive the overlay. Settings hit exactly this and answers it the
 * same way (see settingsTabTitle).
 *
 * Exported so the rule can be asserted directly, without a window to inspect.
 */
export function diffTabTitle(fileName: string, isOverlay: boolean): string {
  if (isOverlay) return '';
  return fileName ? `${DIFF_TITLE_PREFIX}: ${fileName}` : DIFF_TITLE_FALLBACK;
}

/** Lines in [text], counting the way the backend's ranges do. */
function lineCount(text: string): number {
  if (text === '') return 0;
  const withoutTrailing = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutTrailing.split('\n').length;
}
