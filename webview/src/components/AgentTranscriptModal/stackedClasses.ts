/**
 * The classes of a workflow's agent picker take two shapes by the width of the *window*: a sidebar column from `sm` up,
 * a stacked block of rows below it. The side panel is narrow whatever the window is, so it asks for the stacked shape
 * outright: this takes every `sm:` class off, leaving the one the picker has below `sm`.
 */
export function stackedClasses(stacked?: boolean): (classes: string) => string {
  if (!stacked) return (classes) => classes;
  return (classes) =>
    classes
      .split(/\s+/)
      .filter((name) => name !== '' && !name.startsWith('sm:'))
      .join(' ');
}
