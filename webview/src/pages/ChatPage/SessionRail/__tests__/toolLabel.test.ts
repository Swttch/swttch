import {describe, expect, it} from 'vitest';
import {toolLabel} from '@/utils/toolLabel';

describe('toolLabel', () => {
    it('names the server of an MCP tool and the tool itself otherwise', () => {
        expect(toolLabel('mcp__Claude_Browser__computer')).toBe('Claude Browser');
        expect(toolLabel('mcp__my-server__shot')).toBe('my server');
        expect(toolLabel('Read')).toBe('Read');
    });
});
