/**
 * Claude Desktop's file viewer (the one it uses for a session whose files are on another machine)
 * draws a page's own inline pictures and runs its scripts, but shows no picture that lives on
 * another site: an `<img>`, in any format, and a CSS background alike come up broken or empty
 * (measured in the Windows app, with a PNG, a JPG and an SVG from one host, while a script from
 * another host ran). The pane does the same through the page's own content policy, which covers
 * every way a picture is asked for.
 *
 * It goes first inside `<head>`: a policy given after the content it governs governs only what comes
 * after it.
 */
const POLICY = `<meta http-equiv="Content-Security-Policy" content="img-src data: blob:">`;

export function withImagePolicy(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + POLICY + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + POLICY + html.slice(root.index + root[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype[0].length) + POLICY + html.slice(doctype[0].length);
  return POLICY + html;
}
