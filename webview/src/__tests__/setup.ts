import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';

// ---------------------------------------------------------------------------
// Hermetic browser-env guarantees (issue #193)
//
// The webview suite runs under jsdom, but a couple of browser globals are not
// dependable across the Node/jsdom versions contributors run on:
//   - `localStorage`/`sessionStorage` can be `undefined` on some Node+jsdom
//     combos. That surfaced directly as "Cannot read properties of undefined
//     (reading 'setItem')" and indirectly as theme/dir tests failing — a
//     swallowed seed write left components rendering on their defaults.
//   - jsdom never implements `matchMedia`, so any code path that reaches it
//     (e.g. SYSTEM theme resolution) throws unless a test stubs it first.
//   - jsdom never implements `ResizeObserver` either, and dnd-kit constructs one
//     while its module is being evaluated (not lazily on first drag). Without a
//     stub, merely importing a component that renders the dock editor throws
//     before a single test runs.
//   - jsdom has no `PointerEvent` class at all. Code that narrows an event with
//     `instanceof PointerEvent` (dnd-kit's drag handling does) then throws
//     "Right-hand side of 'instanceof' is not an object" rather than simply
//     returning false, so a test dispatching pointer events crashes the run.
//
// We install deterministic implementations here so a red always means a real
// regression, regardless of the host environment. Individual tests remain free
// to re-define these (the descriptors are `configurable`/`writable`).
// ---------------------------------------------------------------------------

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(String(key), String(value));
    },
  } as Storage;
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const mock = createStorageMock();
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: mock });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: mock });
  }
}

installStorage('localStorage');
installStorage('sessionStorage');

if (typeof globalThis.ResizeObserver === 'undefined') {
  // Inert on purpose: nothing under test asserts on resize-driven layout, so the
  // stub only has to exist and stay silent. A version that fired callbacks would
  // invent resize events jsdom never actually produces.
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}

// jsdom implements no part of the Web Animations API. dnd-kit calls
// `getAnimations()` — on the document to settle in-flight transitions, and on an
// element before measuring it — and an empty list is the honest answer here:
// jsdom never runs animations in the first place.
if (typeof document !== 'undefined' && typeof document.getAnimations !== 'function') {
  Object.defineProperty(document, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [],
  });
}

if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [],
  });
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  // Same reasoning as the ResizeObserver stub: dnd-kit builds one to watch a
  // dragged element's position, and nothing under test depends on it firing.
  class IntersectionObserverStub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverStub,
  });
}

if (typeof globalThis.PointerEvent === 'undefined') {
  // Extends MouseEvent so the coordinate/button fields tests rely on keep
  // working; only the pointer-specific fields are added on top.
  class PointerEventStub extends MouseEvent implements PointerEvent {
    readonly pointerId: number;
    readonly width = 1;
    readonly height = 1;
    readonly pressure: number;
    readonly tangentialPressure = 0;
    readonly tiltX = 0;
    readonly tiltY = 0;
    readonly twist = 0;
    readonly altitudeAngle = 0;
    readonly azimuthAngle = 0;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pressure = init.pressure ?? (init.buttons ? 0.5 : 0);
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }

    getCoalescedEvents(): PointerEvent[] {
      return [];
    }

    getPredictedEvents(): PointerEvent[] {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', {
    configurable: true,
    writable: true,
    value: PointerEventStub,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      writable: true,
      value: PointerEventStub,
    });
  }
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const matchMediaStub = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMediaStub });
}
