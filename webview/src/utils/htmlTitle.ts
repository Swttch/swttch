/** The text of a page's `<title>`, or undefined when it has none (or only blanks). */
export function htmlTitleOf(html: string): string | undefined {
  const title = new DOMParser().parseFromString(html, 'text/html').title.trim();
  return title === '' ? undefined : title;
}
