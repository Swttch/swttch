/**
 * Where a `#fragment` of a markdown link points inside the file: the line of the
 * heading it names, so the editor opens there as a renderer would scroll there.
 */

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces turned into `-`. */
function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** A heading's text as it is read: links show their label, code and emphasis marks go. */
function headingText(source: string): string {
  return source.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/[`*]/g, '');
}

const ATX_HEADING = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const HTML_ANCHOR = /<a\s[^>]*\b(?:id|name)=["']([^"']+)["']/i;

/**
 * The 1-based line `fragment` names in the markdown `content`, or undefined. A
 * heading is matched by its GitHub anchor (repeats get `-1`, `-2`, …), and a
 * `<a id="…">` by its id. A fragment written as the heading's own text matches too.
 */
export function findMarkdownHeadingLine(content: string, fragment: string): number | undefined {
  const wanted = fragment.toLowerCase();
  const wantedSlug = slug(fragment);
  const lines = content.split(/\r?\n/);
  const seen = new Map<string, number>();
  let fence: string | null = null;
  let loose: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const marker = FENCE.exec(lines[i])?.[1];
    if (fence !== null) {
      if (marker === fence) fence = null;
      continue;
    }
    if (marker !== undefined) {
      fence = marker;
      continue;
    }
    if (HTML_ANCHOR.exec(lines[i])?.[1].toLowerCase() === wanted) return i + 1;

    let text = ATX_HEADING.exec(lines[i])?.[1];
    if (text === undefined && lines[i].trim() !== '' && SETEXT_UNDERLINE.test(lines[i + 1] ?? '')) text = lines[i].trim();
    if (text === undefined) continue;

    const base = slug(headingText(text));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if ((count === 0 ? base : `${base}-${count}`) === wanted) return i + 1;
    // Kept for the end: an exact anchor further down wins over a loosely written one.
    if (loose === undefined && wantedSlug !== '' && base === wantedSlug) loose = i + 1;
  }
  return loose;
}
