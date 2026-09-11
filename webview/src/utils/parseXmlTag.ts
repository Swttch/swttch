/**
 * Extract the inner text of the first `<tag>…</tag>` occurrence (dot matches
 * newlines). Returns the trimmed inner text, or `undefined` when the tag is
 * absent. Used to read the pseudo-XML envelopes the CLI emits for background
 * tasks and dynamic-workflow `<task-notification>` messages.
 */
export function parseXmlTag(text: string, tag: string): string | undefined {
    const match = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
    return match?.[1]?.trim();
}

/**
 * Every top-level `<tag>…</tag>` of a block, keyed by the tag's own name.
 *
 * Reading a fixed list of tags instead means a tag the CLI adds later is
 * dropped where nothing can notice — which is what happened to `<note>` in the
 * `<task-notification>` envelope.
 */
export function parseXmlTags(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const match of text.matchAll(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g)) {
        out[match[1]] = match[2].trim();
    }
    return out;
}
