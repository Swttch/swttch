/**
 * What a reply sounds like when it is read: its markdown without the marks, and a code block as one short phrase
 * (the voice would otherwise spell out every symbol of it).
 */
export function speakableText(markdown: string, codeBlockPhrase: string): string {
  return markdown
    // A fenced block becomes the phrase, on lines of its own so the voice pauses around it.
    .replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g, `\n\n${codeBlockPhrase}\n\n`)
    // An unterminated fence (a reply still being written) is dropped with what follows it.
    .replace(/(^|\n)(```|~~~)[\s\S]*$/, `\n\n${codeBlockPhrase}`)
    // A picture says nothing aloud; a link says its words and not its address.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/(^|[^\w_])_(?!\s)(.+?)_(?=[^\w_]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*(\|?\s*:?-{3,}:?\s*)+\|?\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
