export type FocusListener = (focused: boolean) => void;
export type FocusSetup = (refresh: (focused?: boolean) => void) => (() => void) | undefined;

/**
 * Tells subscribers whether this window is the one the user is looking at.
 *
 * Modelled on TanStack Query v5's focusManager: detection is switched on by the
 * first subscriber and off again by the last (lazy setup/cleanup), the detection
 * source can be replaced, the state can be overridden by hand, and subscribers
 * are told only when the state actually changes.
 */
export class FocusManager {
  private listeners = new Set<FocusListener>();
  private override: boolean | undefined;
  private cleanup: (() => void) | undefined;
  private setup: FocusSetup = FocusManager.defaultSetup;
  /** The state subscribers were last told about (or the baseline at first subscribe). */
  private lastState = true;

  /**
   * Default detection source.
   *
   * TanStack v5 listens to `visibilitychange` only. In the JetBrains JCEF
   * webview that is not enough: measured there, coming back to the tab fires
   * `focus` alone and never `visibilitychange`. Leaving the tab fires `blur`,
   * then `visibilitychange(hidden)`, then 43ms later `visibilitychange(visible)`,
   * so hidden flashes on and off. Every event therefore just recomputes the
   * state, and the change-only notification absorbs the flash.
   */
  private static defaultSetup: FocusSetup = (refresh) => {
    if (typeof window === 'undefined') return undefined;
    const onChange = () => refresh();
    document.addEventListener('visibilitychange', onChange, false);
    window.addEventListener('focus', onChange, false);
    window.addEventListener('blur', onChange, false);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('blur', onChange);
    };
  };

  subscribe(listener: FocusListener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.lastState = this.isFocused();
      this.startDetecting();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopDetecting();
      }
    };
  }

  /** Replace the detection source, as TanStack's `setEventListener` does. */
  setEventListener(setup: FocusSetup): void {
    this.stopDetecting();
    this.setup = setup;
    if (this.listeners.size > 0) {
      this.lastState = this.isFocused();
      this.startDetecting();
    }
  }

  /** Override the state by hand. `undefined` returns to the default judgement. */
  setFocused(focused?: boolean): void {
    this.override = focused;
    this.notifyIfChanged();
  }

  isFocused(): boolean {
    if (typeof this.override === 'boolean') return this.override;
    if (typeof document === 'undefined') return true;
    return document.visibilityState !== 'hidden' && document.hasFocus();
  }

  private startDetecting(): void {
    this.cleanup = this.setup((focused) => {
      if (typeof focused === 'boolean') {
        this.setFocused(focused);
      } else {
        this.notifyIfChanged();
      }
    });
  }

  private stopDetecting(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }

  private notifyIfChanged(): void {
    const current = this.isFocused();
    if (current === this.lastState) return;
    this.lastState = current;
    this.listeners.forEach((listener) => listener(current));
  }
}

export const focusManager = new FocusManager();
