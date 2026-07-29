import { describe, it, expect, afterEach } from 'vitest';
import {
  clampZoom,
  zoomIn,
  zoomOut,
  applyZoom,
  ZOOM_DEFAULT,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEPS,
} from '../zoom';

describe('clampZoom', () => {
  it('keeps in-range values unchanged', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.25)).toBe(1.25);
  });

  it('clamps to the supported range', () => {
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(-3)).toBe(ZOOM_MIN);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampZoom(NaN)).toBe(ZOOM_DEFAULT);
    expect(clampZoom(Infinity)).toBe(ZOOM_DEFAULT);
  });
});

describe('zoomIn', () => {
  it('advances to the next ladder stop', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomIn(1.1)).toBe(1.25);
  });

  it('jumps up to the next stop from an off-ladder value', () => {
    expect(zoomIn(1.3)).toBe(1.5);
  });

  it('saturates at the maximum', () => {
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomIn(99)).toBe(ZOOM_MAX);
  });
});

describe('zoomOut', () => {
  it('steps down to the previous ladder stop', () => {
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomOut(0.9)).toBe(0.8);
  });

  it('jumps down to the previous stop from an off-ladder value', () => {
    expect(zoomOut(1.3)).toBe(1.25);
  });

  it('saturates at the minimum', () => {
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(zoomOut(0.01)).toBe(ZOOM_MIN);
  });
});

describe('zoom ladder round-trip', () => {
  // Zooming out then back in must land exactly on the original stop, otherwise
  // repeated gestures would drift the user off the round 100% level.
  it('returns to the starting stop after out-then-in', () => {
    for (const step of ZOOM_STEPS.slice(1, -1)) {
      expect(zoomIn(zoomOut(step))).toBe(step);
    }
  });

  it('contains the default level as a stop', () => {
    expect(ZOOM_STEPS).toContain(ZOOM_DEFAULT);
  });
});

describe('applyZoom', () => {
  afterEach(() => {
    document.documentElement.style.zoom = '';
  });

  it('writes the level to the document element', () => {
    applyZoom(1.25);
    expect(document.documentElement.style.zoom).toBe('1.25');
  });

  it('clamps out-of-range levels before applying', () => {
    applyZoom(99);
    expect(document.documentElement.style.zoom).toBe(String(ZOOM_MAX));
  });

  // The mobile bootstrap applies a 1.25 base zoom; a user gesture must compose
  // with it rather than overwrite it (which would shrink the phone layout).
  it('multiplies by the base zoom instead of replacing it', () => {
    applyZoom(2, 1.25);
    expect(document.documentElement.style.zoom).toBe('2.5');
  });
});
