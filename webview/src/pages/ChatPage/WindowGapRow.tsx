interface Props {
  isLoading: boolean;
}

/**
 * Where the transcript window holds nothing between two stretches of messages (#680).
 *
 * The window is built so that the reader never gets here: the pages around the one they are
 * reading are held before they can scroll to them (see `nextStep`). So this draws nothing, and
 * is no more than the mark `data-window-gap` that says where the two stretches meet. Only if
 * the reader does get here (a drag of the scroll bar, say) is there something to show, and it
 * is no more than a spinner for as long as the missing page is on its way. It never says that
 * anything was skipped: from the reader's side nothing is, the messages just are not drawn yet.
 *
 * Both transcripts, the classic chat and the Transcript view modes, draw it, and it is not a
 * message: it is never part of the list of messages those are drawn from.
 */
export function WindowGapRow({ isLoading }: Props) {
  return (
    <div data-window-gap aria-hidden className={isLoading ? 'flex justify-center py-4' : 'h-0'}>
      {isLoading && (
        <span className="w-3.5 h-3.5 border-2 border-border-default border-t-text-secondary rounded-full animate-spin" />
      )}
    </div>
  );
}
