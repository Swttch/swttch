import {describe, it, expect} from 'vitest';
import {formatMcpFieldValue, formatMcpResult, mcpFieldLabel, mcpInputEntries, stripImageNotes} from '../formatMcpPayload';

describe('mcpFieldLabel', () => {
    it('capitalises the first letter and turns separators into spaces', () => {
        expect(mcpFieldLabel('command')).toBe('Command');
        expect(mcpFieldLabel('timeout_ms')).toBe('Timeout ms');
        expect(mcpFieldLabel('dry-run')).toBe('Dry run');
    });

    it('keeps the rest of the key as it is', () => {
        expect(mcpFieldLabel('workingDir')).toBe('WorkingDir');
    });

    it('returns a key made only of separators unchanged', () => {
        expect(mcpFieldLabel('__')).toBe('__');
    });
});

describe('mcpInputEntries', () => {
    it('returns the fields in the order the call sent them, whatever the keys are', () => {
        expect(mcpInputEntries({command: 'echo', timeout_ms: 30000, dry_run: false}))
            .toEqual([['command', 'echo'], ['timeout_ms', 30000], ['dry_run', false]]);
    });

    it('returns null when there is nothing to show', () => {
        expect(mcpInputEntries({})).toBeNull();
        expect(mcpInputEntries(undefined)).toBeNull();
        expect(mcpInputEntries(null)).toBeNull();
        expect(mcpInputEntries([] as never)).toBeNull();
    });
});

describe('formatMcpFieldValue', () => {
    it('shows a string as it is, including its line breaks', () => {
        expect(formatMcpFieldValue('set -e\necho a\n')).toBe('set -e\necho a\n');
    });

    it('shows an empty string as two quotes so the caption does not look blank', () => {
        expect(formatMcpFieldValue('')).toBe('""');
    });

    it('spells out a number, a boolean and null', () => {
        expect(formatMcpFieldValue(30000)).toBe('30000');
        expect(formatMcpFieldValue(false)).toBe('false');
        expect(formatMcpFieldValue(null)).toBe('null');
    });

    it('reads a list of plain values as one comma-separated line', () => {
        expect(formatMcpFieldValue(['--fast', '--no-color'])).toBe('--fast, --no-color');
        expect(formatMcpFieldValue([1, true, ''])).toBe('1, true, ""');
    });

    it('spells out an empty list and a list holding objects as JSON', () => {
        expect(formatMcpFieldValue([])).toBe('[]');
        expect(formatMcpFieldValue([{a: 1}])).toBe('[\n  {\n    "a": 1\n  }\n]');
    });
});

describe('stripImageNotes', () => {
    it('drops the CLI\'s note about where a returned picture was saved', () => {
        expect(stripImageNotes('[Image: source: /tmp/a/b.png]')).toBe('');
    });

    it('keeps the text that comes with the note', () => {
        expect(stripImageNotes('Captured.\n[Image: source: /tmp/a/b.png]\nDone')).toBe('Captured.\nDone');
    });

    it('keeps a line that only resembles the note', () => {
        expect(stripImageNotes('see [Image: source: x] here')).toBe('see [Image: source: x] here');
    });
});

describe('formatMcpResult', () => {
    it('shows a JSON object held in the text as that same JSON, indented', () => {
        const text = '{"stdout":"hello 3\\n","stderr":"","exit_code":0}';
        expect(formatMcpResult(text))
            .toBe('{\n  "stdout": "hello 3\\n",\n  "stderr": "",\n  "exit_code": 0\n}');
    });

    it('keeps nesting, arrays and types', () => {
        expect(formatMcpResult('{"a":[{"ok":true}],"n":null}'))
            .toBe('{\n  "a": [\n    {\n      "ok": true\n    }\n  ],\n  "n": null\n}');
    });

    it('shows a JSON array the same way', () => {
        expect(formatMcpResult('[1,2]')).toBe('[\n  1,\n  2\n]');
    });

    it('returns text that is not JSON as it came', () => {
        expect(formatMcpResult('Found 2 pages.\n1. a')).toBe('Found 2 pages.\n1. a');
        expect(formatMcpResult('')).toBe('');
    });

    it('returns a JSON scalar as it came', () => {
        expect(formatMcpResult('"quoted"')).toBe('"quoted"');
    });

    it('returns broken JSON, an empty object and an empty array as they came', () => {
        expect(formatMcpResult('{"a": ')).toBe('{"a": ');
        expect(formatMcpResult('{}')).toBe('{}');
        expect(formatMcpResult('[]')).toBe('[]');
    });
});
