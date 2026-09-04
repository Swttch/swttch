import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CompositionEvent as ReactCompositionEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { setCaretOffset } from '@/utils/domSelection';
import { splitIntoSegments } from './segments';
import { useIMEComposition, type IMEComposition } from './useIMEComposition';
import { insertNewlineAtCursor } from './insertNewlineAtCursor';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: ReactClipboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * Path tokens (e.g. `src/file.ts#L10-L25`) to highlight as chips in the
   * mirror overlay. Only exact, known tokens are highlighted — arbitrary text
   * is never chipped. Defaults to an empty list (plain text, no chips).
   */
  highlightTokens?: readonly string[];
  /**
   * Bounds of dictated text the recognizer has not settled on yet, painted in
   * italics so it reads as provisional. Null when nothing is being dictated.
   *
   * While this is set it takes over the mirror: path chips are not drawn. The
   * two never usefully overlap — a phrase being spoken is not a path yet — and
   * letting them compete would mean splitting the same run twice.
   */
  interimRange?: { start: number; end: number } | null;
  /**
   * IME composition state, optionally owned by the parent (ChatInput) so its
   * keydown handler and this editor agree on a single source of truth. Under
   * JCEF the native `isComposing` flag is unreliable; this ref-only hook is
   * authoritative. When omitted, RichInput manages its own instance so it stays
   * usable standalone.
   */
  ime?: IMEComposition;
}

/**
 * Layout classes shared by the editable div and the mirror overlay. The two
 * layers MUST agree on font, padding, line-height and wrapping so the visible
 * (mirror) glyphs land exactly under the (transparent) editable glyphs and the
 * caret. Keep this list the single source of truth for both layers.
 *
 * One thing they must also agree on lives in CSS instead: only the editable
 * layer scrolls, so `scrollbar-gutter: stable` is applied to BOTH layers
 * (index.css) to keep their content boxes equally wide where the platform draws
 * a space-taking scrollbar. Without it they wrap at different points and the
 * same glyph lands a line apart (issue #329).
 */
const LAYOUT_CLASSES = [
  // pe-11 keeps text clear of the mic button, which floats over the box's top
  // right. Both layers take it so the mirror's glyphs stay under the caret.
  'w-full ps-3 pe-11 text-base leading-normal',
  'whitespace-pre-wrap break-words',
] as const;

/**
 * RichInput — a `contentEditable="plaintext-only"` div that behaves like a
 * controlled <textarea> for plain text, with a non-interactive mirror overlay
 * that paints the same text and wraps known path tokens in highlight chips.
 *
 * Two-layer composition (mirrors the Claude Code extension composer):
 *   - The editable div holds the real text + caret but renders its glyphs
 *     transparent (`richInputEditable`: color:transparent, caret-color visible),
 *     sitting on top (z-10) so typing / selection / IME all behave normally.
 *   - The mirror div (`richInputMirror`, aria-hidden, pointer-events:none) sits
 *     behind it and paints the visible text: plain runs as text, known tokens
 *     as chip spans. It shares {@link LAYOUT_CLASSES} so glyphs align exactly.
 *
 * Editing always happens in the plaintext editable div, so caret-offset math
 * (mentions, slash, history, Cmd+Arrow) is unchanged — the mirror is display
 * only. Scroll position is synced from the editable div to the mirror.
 *
 * value ↔ textContent sync rule: the editable DOM is only rewritten when it
 * actually diverges from `value`, so user typing never triggers a caret-jumping
 * reset. External (programmatic) value changes move the caret to the end. While
 * an IME composition is in flight the sync is skipped so the in-progress glyphs
 * are never clobbered.
 */
export const RichInput = forwardRef<HTMLDivElement, Props>((props: Props, ref) => {
  const {
    value,
    onChange,
    onKeyDown,
    onPaste,
    onFocus,
    onBlur,
    placeholder,
    disabled = false,
    className,
    ariaLabel,
    highlightTokens = [],
    interimRange = null,
    ime: imeProp,
  } = props;

  const elRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  // Own an IME instance so RichInput works standalone; when the parent supplies
  // one (ChatInput), use it so keydown and this editor share a single truth.
  const internalIme = useIMEComposition();
  const ime = imeProp ?? internalIme;
  // IME truth lives in the (possibly parent-owned) hook; alias for local reads.
  const isComposingRef = ime.isComposingRef;

  // Live display text that drives the mirror. Unlike `value` (the controlled
  // prop, which is NOT updated mid-IME-composition), this tracks the editable
  // div's textContent on every keystroke AND every composition update, so the
  // mirror paints in-progress glyphs in real time. Without this the transparent
  // editable glyphs would vanish during composition and the visible text would
  // appear to lag one character behind.
  const [displayText, setDisplayText] = useState(value);

  // Expose the editable div to the parent (focus / domSelection utilities) while
  // keeping our own internal ref for sync work.
  useImperativeHandle(ref, () => elRef.current as HTMLDivElement, []);

  // value → DOM sync. Only writes when the DOM diverges from `value` (prevents
  // caret jumps on every keystroke) and never during IME composition.
  useLayoutEffect(() => {
    const el = elRef.current;
    if (el === null) return;
    // While composing, leave both the DOM and displayText untouched so the
    // in-progress glyphs (driven by composition events) are never clobbered.
    if (isComposingRef.current) return;

    const current = el.textContent ?? '';
    if (current === value) {
      // An empty value can still leave a stray <br>/empty node behind (e.g.
      // after clearing an IME composition), which defeats `:empty` and hides
      // the placeholder. Force a real empty node so the placeholder shows.
      if (value === '' && el.childNodes.length > 0) {
        el.textContent = '';
      }
      // DOM already matches; still reconcile displayText so an external value
      // change that equals the live text (rare) doesn't leave a stale mirror.
      if (displayText !== value) setDisplayText(value);
      return;
    }

    el.textContent = value;
    // External value changes (submit/clear/Alt+K insert) must repaint the
    // mirror to match the freshly written DOM.
    setDisplayText(value);

    // Only reposition the caret when this element is focused, so background
    // (programmatic) updates don't steal the selection from elsewhere.
    if (document.activeElement === el) {
      setCaretOffset(el, value.length);
    }
  }, [value, displayText]);

  const handleInput = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      const text = e.currentTarget.textContent ?? '';
      // Always repaint the mirror in real time, including mid-composition.
      setDisplayText(text);
      // Report the input BEFORE the composing guard below reads the flag: an
      // edit that belongs to no composition is what lowers a flag an IME left
      // stuck by never firing compositionend (issue #403). Reporting after the
      // guard would keep the composer deaf to every later keystroke.
      const native = e.nativeEvent as InputEvent;
      ime.notifyInput({
        isComposing: native.isComposing === true,
        inputType: native.inputType ?? '',
      });
      // During composition the intermediate text is not yet committed; defer
      // reporting to the parent until compositionend to avoid emitting partial
      // glyphs. The mirror still updates above so the user sees live feedback.
      if (isComposingRef.current) return;
      onChange(text);
    },
    [onChange, ime, isComposingRef],
  );

  // beforeinput safety net (issue #215): under JCEF a non-English-layout Enter
  // can slip past keydown, so the composer never receives our explicit-newline
  // handling. `insertParagraph` (the paragraph-break intent) is layout-
  // independent — catch it here, convert it to a single `\n`, and keep `value`
  // the single source of truth. Skipped while composing so an IME commit stands.
  const handleBeforeInput = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      const native = e.nativeEvent as InputEvent;
      if (native.inputType !== 'insertParagraph') return;
      if (isComposingRef.current) return;
      e.preventDefault();
      insertNewlineAtCursor();
      const text = elRef.current?.textContent ?? '';
      setDisplayText(text);
      onChange(text);
    },
    [onChange, isComposingRef],
  );

  const handleCompositionStart = useCallback(() => {
    ime.handleCompositionStart();
  }, [ime]);

  const handleCompositionUpdate = useCallback(
    (e: ReactCompositionEvent<HTMLDivElement>) => {
      // Repaint the mirror on every composition update so the in-progress
      // glyphs track the caret without lagging a character behind.
      setDisplayText(e.currentTarget.textContent ?? '');
    },
    [],
  );

  const handleCompositionEnd = useCallback(
    (e: ReactCompositionEvent<HTMLDivElement>) => {
      ime.handleCompositionEnd();
      const text = e.currentTarget.textContent ?? '';
      setDisplayText(text);
      onChange(text);
    },
    [onChange, ime],
  );

  // Keep the mirror's scroll position locked to the editable div so long /
  // multi-line input stays glyph-aligned while scrolling.
  const handleScroll = useCallback((e: ReactUIEvent<HTMLDivElement>) => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    mirror.scrollTop = e.currentTarget.scrollTop;
    mirror.scrollLeft = e.currentTarget.scrollLeft;
  }, []);

  // The mirror paints `displayText` (live, includes in-progress IME glyphs),
  // NOT `value` (which lags during composition).
  const segments = splitIntoSegments(displayText, highlightTokens);
  // Clamp against displayText rather than trusting the caller: during IME
  // composition the mirror paints text the dictation layer has not seen, so a
  // range computed a moment ago can point past the end.
  const interim =
    interimRange && interimRange.end > interimRange.start && interimRange.start < displayText.length
      ? { start: interimRange.start, end: Math.min(interimRange.end, displayText.length) }
      : null;
  // A trailing newline collapses on the last line of a wrapping box; append a
  // zero-content newline so the mirror's height matches the editable div.
  const trailingNewline = displayText.endsWith('\n');

  return (
    <div className="relative">
      {/* Mirror overlay — paints visible text + chips behind the editable div. */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={[
          'richInputMirror',
          'absolute inset-0 pointer-events-none',
          'min-h-[20px] max-h-[200px] overflow-hidden',
          ...LAYOUT_CLASSES,
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {interim ? (
          <>
            {displayText.slice(0, interim.start)}
            <span className="italic text-text-tertiary">
              {displayText.slice(interim.start, interim.end)}
            </span>
            {displayText.slice(interim.end)}
          </>
        ) : (
          segments.map((seg, i) =>
            seg.isToken ? (
              <span key={i} className="richInputChip">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )
        )}
        {trailingNewline && '\n'}
      </div>

      {/* Editable div — real text + caret, glyphs transparent (see CSS). */}
      <div
        ref={elRef}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable={disabled ? false : 'plaintext-only'}
        spellCheck={false}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={[
          'richInputEditable',
          'relative z-10 cursor-text bg-transparent',
          'min-h-[20px] max-h-[200px] overflow-y-auto',
          'focus:outline-none',
          ...LAYOUT_CLASSES,
          disabled ? 'opacity-50' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        onInput={handleInput}
        onBeforeInput={handleBeforeInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        onScroll={handleScroll}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
      />
    </div>
  );
});

RichInput.displayName = 'RichInput';
