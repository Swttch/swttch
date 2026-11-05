/**
 * Text and fields for the input and output sections of the generic MCP renderer.
 *
 * An unregistered MCP server chooses its own input names and its own result
 * shape, so nothing here reads a particular key. Input is shown as one labelled
 * field per key, whatever the keys are; a JSON result is kept as the JSON it is.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The caption for an input key: separators become spaces and the first letter is
 * capitalised (`timeout_ms` → `Timeout ms`, `command` → `Command`). The key is
 * not interpreted, only made readable.
 */
export function mcpFieldLabel(key: string): string {
    const spaced = key.replace(/[_-]+/g, ' ').trim();
    if (spaced === '') return key;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The input's fields in the order the call sent them, or null when it has none. */
export function mcpInputEntries(input: unknown): Array<[string, unknown]> | null {
    if (!isPlainObject(input)) return null;
    const entries = Object.entries(input);
    return entries.length === 0 ? null : entries;
}

/**
 * One field value as the text shown next to its caption. A string is shown as it
 * is (an empty one as two quotes, so the caption does not look blank). A list of
 * plain values (strings, numbers, booleans) reads as one comma-separated line;
 * anything else goes through `JSON.stringify`.
 */
export function formatMcpFieldValue(value: unknown): string {
    if (typeof value === 'string') return value === '' ? '""' : value;
    if (Array.isArray(value) && value.length > 0 && value.every(isPlainValue)) {
        return value.map((item) => (item === '' ? '""' : String(item))).join(', ');
    }
    return JSON.stringify(value, null, 2) ?? String(value);
}

function isPlainValue(value: unknown): boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * The CLI puts a note next to a picture it returns, `[Image: source: <path>]`,
 * as a text block of its own. When the picture itself is drawn, the note is just
 * a file path in the middle of the output, so it is dropped; a line that merely
 * resembles it, or any text that comes with it, is kept.
 */
export function stripImageNotes(text: string): string {
    return text
        .split('\n')
        .filter((line) => !/^\[Image: source: [^\]]*\]$/.test(line.trim()))
        .join('\n')
        .trim();
}

/**
 * The OUT row text. A result that is a JSON object or array packed into one text
 * value (the way a server returns `{"stdout": ..., "exit_code": ...}`) is shown as
 * that same JSON, indented: keys, nesting, types and escapes stay as the server
 * sent them. Any other text, including a JSON scalar, an empty object or array,
 * and broken JSON, is returned as it came.
 */
export function formatMcpResult(text: string): string {
    return formatMcpResultParts(text).text;
}

/** Same as `formatMcpResult`, and says whether the text is JSON (so it can be coloured). */
export function formatMcpResultParts(text: string): {text: string; json: boolean} {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return {text, json: false};
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed !== 'object' || parsed === null) return {text, json: false};
        if (Object.keys(parsed).length === 0) return {text, json: false};
        return {text: JSON.stringify(parsed, null, 2), json: true};
    } catch {
        return {text, json: false};
    }
}
