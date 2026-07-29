/**
 * UI zoom level (whole-interface scaling), driven by CmdOrCtrl +/- and
 * CmdOrCtrl + wheel — the same gesture browsers and editors use.
 *
 * This scales the WHOLE interface (icons, padding, borders), unlike the
 * separate `fontSize` setting which only scales rem-based text. The two are
 * independent on purpose: the effective text size is `fontSize × zoom`.
 */

/** 100% — the level a fresh install renders at, and the reset target. */
export const ZOOM_DEFAULT = 1;

/**
 * Extra scale phones get for readability, applied by the mobile bootstrap in
 * `main.tsx`. The user's own zoom multiplies on top of this rather than
 * replacing it, so a phone never snaps back to the cramped desktop scale.
 */
export const MOBILE_BASE_ZOOM = 1.25;
/** Below this the chat input and header controls start clipping. */
export const ZOOM_MIN = 0.5;
/** Above this a single message fills the viewport on a laptop display. */
export const ZOOM_MAX = 3;

/**
 * Discrete stops the keyboard/wheel gestures walk through, mirroring the
 * familiar browser zoom ladder. Stepping through a fixed ladder (rather than
 * multiplying by a factor) keeps every stop a round, repeatable number, so
 * zooming out and back in returns to exactly 100%.
 */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Clamp any candidate level into the supported range. */
export function clampZoom(level: number): number {
  if (!Number.isFinite(level)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
}

/**
 * The next ladder stop above `level`. Values that sit between two stops jump to
 * the next stop up, so a hand-edited settings value still zooms sensibly.
 * Returns the max when already at (or past) the top.
 */
export function zoomIn(level: number): number {
  const current = clampZoom(level);
  const next = ZOOM_STEPS.find((step) => step > current + 1e-6);
  return next ?? ZOOM_MAX;
}

/** The next ladder stop below `level`; the min when already at the bottom. */
export function zoomOut(level: number): number {
  const current = clampZoom(level);
  const prev = [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6);
  return prev ?? ZOOM_MIN;
}

/**
 * Apply the level to the document.
 *
 * `zoom` is chosen over a CSS transform because it reflows layout rather than
 * painting a scaled bitmap, so text stays crisp and scroll heights stay honest.
 *
 * The mobile bootstrap in `main.tsx` sets a 1.25 base zoom for readability on
 * phones; that base is passed in here as `baseZoom` and multiplied, so the user
 * gesture composes with it instead of silently overwriting it.
 */
export function applyZoom(level: number, baseZoom = ZOOM_DEFAULT): void {
  const effective = clampZoom(level) * baseZoom;
  document.documentElement.style.zoom = String(effective);
}
