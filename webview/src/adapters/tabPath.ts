/**
 * The address a tab is known by, with everything that does not say WHICH page it
 * is taken off: the leading `#`, the query (`?workingDir=`) and a trailing slash.
 *
 * Two requests mean the same tab when this is equal. Mirrors `normalizeTabPath` in
 * the IDE plugin, which answers the same question there.
 */
export function normalizeTabPath(path: string): string {
  let p = path.trim();
  if (p.startsWith('#')) p = p.slice(1);
  p = p.split('?')[0].split('#')[0];
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}
