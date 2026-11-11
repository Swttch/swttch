import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { DragDropProvider, PointerSensor, useDragOperation, useDraggable, useDroppable } from '@dnd-kit/react';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import { useTranslation } from '@/i18n';
import type { SessionFamilies } from './families';
import {
  SESSION_DRAG_TYPE,
  TOP_LEVEL_DROP_ID,
  canDropOnTopLevel,
  canDropUnder,
  readSessionDrag,
} from './linkDragRules';

interface DragLinksValue {
  families: SessionFamilies;
}

const DragLinksContext = createContext<DragLinksValue | null>(null);

/**
 * A press on a button inside a row is a click on that button and never the start of a drag. The row itself is a
 * button, and it is the handle, so only the controls drawn inside it are excluded.
 */
const SESSION_SENSORS = [
  PointerSensor.configure({
    preventActivation: (event) =>
      event.target instanceof Element &&
      // The drag layer gives the row it drags role="button" itself, which must not count as a control inside it.
      event.target.closest('[role="button"]:not([aria-roledescription="draggable"]), input') !== null,
  }),
];

interface ProviderProps {
  families: SessionFamilies;
  /** Put [sessionId] under [parentId], or at the top level when [parentId] is null. */
  onMove: (sessionId: string, parentId: string | null) => void;
  children: ReactNode;
}

/**
 * Makes the rows inside draggable, for a sponsor. Mounted only while the setting is on; for someone who is not a
 * sponsor it draws the rows as they are, so the setting being left on after a sponsorship ends does nothing.
 */
export function DragLinksProvider({ families, onMove, children }: ProviderProps) {
  const { isSponsor } = useSponsorStatus();
  if (!isSponsor) return <>{children}</>;
  return (
    <DragDropProvider
      sensors={SESSION_SENSORS}
      onDragEnd={(event) => {
        if (event.canceled) return;
        const { source, target } = event.operation;
        const dragged = readSessionDrag(source?.data);
        if (!dragged || !target) return;
        if (target.id === TOP_LEVEL_DROP_ID) {
          if (canDropOnTopLevel(families, dragged.sessionId)) onMove(dragged.sessionId, null);
          return;
        }
        const onto = readSessionDrag(target.data);
        if (onto && canDropUnder(families, dragged.sessionId, onto.sessionId)) onMove(dragged.sessionId, onto.sessionId);
      }}
    >
      <DragLinksContext.Provider value={{ families }}>{children}</DragLinksContext.Provider>
    </DragDropProvider>
  );
}

/** One session row, made draggable and a place to drop, when the list allows dragging. */
export function DraggableRow({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const context = useContext(DragLinksContext);
  if (!context) return <>{children}</>;
  return (
    <DragRow sessionId={sessionId} families={context.families}>
      {children}
    </DragRow>
  );
}

function DragRow({ sessionId, families, children }: { sessionId: string; families: SessionFamilies; children: ReactNode }) {
  const { ref: dragRef, isDragging } = useDraggable({
    id: `session:${sessionId}`,
    type: SESSION_DRAG_TYPE,
    data: { sessionId },
  });
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: `session-drop:${sessionId}`,
    accept: SESSION_DRAG_TYPE,
    data: { sessionId },
  });
  const { source } = useDragOperation();
  const dragged = readSessionDrag(source?.data);
  const wouldAccept = dragged !== null && canDropUnder(families, dragged.sessionId, sessionId);

  // One element, two registrations. Memoised: a new ref function every render would make the drag layer
  // unregister and register the row again each time.
  const setRefs = useCallback(
    (element: Element | null) => {
      dragRef(element);
      dropRef(element);
    },
    [dragRef, dropRef],
  );

  return (
    <div
      ref={setRefs}
      data-testid="session-drag-row"
      data-dragging={isDragging || undefined}
      data-drop-target={(isDropTarget && wouldAccept) || undefined}
      className={`rounded ${isDropTarget && wouldAccept ? 'ring-1 ring-accent-primary bg-accent-primary/10' : ''} ${
        dragged !== null && !wouldAccept && !isDragging ? 'opacity-40' : ''
      } ${isDragging ? 'relative z-10 bg-surface-overlay shadow-lg' : ''}`}
    >
      {children}
    </div>
  );
}

/**
 * The strip at the top of the list that takes a dragged session to the top level. Drawn only while a session that
 * is under another one is being dragged, and over the first rows instead of above them, so that the rows do not
 * move under the pointer when it appears.
 */
export function TopLevelDropZone() {
  const context = useContext(DragLinksContext);
  const { t } = useTranslation('common');
  const { source } = useDragOperation();
  const { ref, isDropTarget } = useDroppable({ id: TOP_LEVEL_DROP_ID, accept: SESSION_DRAG_TYPE });
  if (!context) return null;
  const dragged = readSessionDrag(source?.data);
  const show = dragged !== null && canDropOnTopLevel(context.families, dragged.sessionId);
  return (
    <div className="sticky top-0 z-20 h-0">
      <div
        ref={ref}
        data-testid="session-top-level-drop"
        // Always laid out, so that the drag layer has measured it before it is wanted; only drawn while it can be used.
        className={`absolute inset-x-0 top-0 flex h-8 items-center justify-center rounded border border-dashed text-xs ${
          show ? '' : 'pointer-events-none opacity-0'
        } ${
          isDropTarget
            ? 'border-accent-primary bg-accent-primary/20 text-text-primary'
            : 'border-text-tertiary/60 bg-surface-raised text-text-secondary'
        }`}
      >
        {t('sessionList.dragLinks.topLevel')}
      </div>
    </div>
  );
}
