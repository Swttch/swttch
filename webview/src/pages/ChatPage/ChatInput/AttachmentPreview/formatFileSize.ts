const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * A size the way the Finder writes it: thousands rather than 1024s, three
 * significant digits, no space before the unit (`25KB`, `12.7MB`, `1.46GB`).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes}B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  let rounded = Number(value.toPrecision(3));
  // 999.6KB rounds up to 1000, which belongs to the next unit.
  if (rounded >= 1000 && unit < UNITS.length - 1) {
    rounded = 1;
    unit += 1;
  }
  return `${rounded}${UNITS[unit]}`;
}
