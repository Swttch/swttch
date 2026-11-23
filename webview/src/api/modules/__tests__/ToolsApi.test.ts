import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsApi } from '../ToolsApi';
import { PermissionType, RiskLevel } from '../../../dto/common';
import { MessageType } from '@/shared';

function createMockBridge() {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  } as unknown as import('../../bridge/BridgeClient').BridgeClient;
}

describe('ToolsApi', () => {
  let api: ToolsApi;
  let bridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    bridge = createMockBridge();
    api = new ToolsApi(bridge);
  });

  describe('approve()', () => {
    it('should send TOOL_RESPONSE with approved=true', async () => {
      await api.approve('tool-1');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: true,
      });
    });

    it('should include controlRequestId when provided', async () => {
      await api.approve('tool-1', 'ctrl-1');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: true,
        controlRequestId: 'ctrl-1',
      });
    });

    it('should include updatedInput when provided', async () => {
      await api.approve('tool-1', undefined, { command: 'ls -la' });
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: true,
        updatedInput: { command: 'ls -la' },
      });
    });
  });

  describe('deny()', () => {
    it('should send TOOL_RESPONSE with approved=false', async () => {
      await api.deny('tool-1');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: false,
      });
    });

    it('should include reason when provided', async () => {
      await api.deny('tool-1', undefined, 'Too dangerous');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: false,
        reason: 'Too dangerous',
      });
    });
  });

  describe('respond()', () => {
    it('should send TOOL_RESPONSE with approved=true and result', async () => {
      await api.respond('tool-1', 'custom result');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: true,
        result: 'custom result',
      });
    });

    // A card of a session another IDE window's backend holds has no request number, but the answer it hands over
    // must still say what was chosen (#711).
    it('sends the chosen answer even when the card has no control request id', async () => {
      const updatedInput = { questions: [{ question: 'q' }], answers: { q: 'red' } };
      await api.respond('tool-1', 'red', { updatedInput });
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: true,
        result: 'red',
        updatedInput,
      });
    });

    it('sends the request number with the chosen answer when the card has one', async () => {
      const updatedInput = { answers: { q: 'red' } };
      await api.respond('tool-1', 'red', { controlRequestId: 'ctrl-1', updatedInput });
      expect(bridge.request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
        toolUseId: 'tool-1',
        approved: true,
        result: 'red',
        controlRequestId: 'ctrl-1',
        updatedInput,
      });
    });
  });

  describe('openDiff()', () => {
    it('should send OPEN_DIFF with file details', async () => {
      await api.openDiff('/path/file.ts', 'old content', 'new content');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.OPEN_DIFF, {
        filePath: '/path/file.ts',
        oldContent: 'old content',
        newContent: 'new content',
      });
    });
  });

  describe('applyDiff()', () => {
    it('should send APPLY_DIFF with toolUseId', async () => {
      await api.applyDiff('tool-1');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.APPLY_DIFF, { toolUseId: 'tool-1' });
    });
  });

  describe('rejectDiff()', () => {
    it('should send REJECT_DIFF with toolUseId', async () => {
      await api.rejectDiff('tool-1');
      expect(bridge.request).toHaveBeenCalledWith(MessageType.REJECT_DIFF, { toolUseId: 'tool-1' });
    });
  });

  describe('getPermissionType()', () => {
    it('should return FileWrite for Write', () => {
      expect(api.getPermissionType('Write')).toBe(PermissionType.FileWrite);
    });

    it('should return FileWrite for Edit', () => {
      expect(api.getPermissionType('Edit')).toBe(PermissionType.FileWrite);
    });

    it('should return FileDelete for Delete', () => {
      expect(api.getPermissionType('Delete')).toBe(PermissionType.FileDelete);
    });

    it('should return BashExecute for Bash', () => {
      expect(api.getPermissionType('Bash')).toBe(PermissionType.BashExecute);
    });

    it('should return null for Read', () => {
      expect(api.getPermissionType('Read')).toBeNull();
    });

    it('should return null for unknown tool', () => {
      expect(api.getPermissionType('SomeCustomTool')).toBeNull();
    });
  });

  describe('getRiskLevel()', () => {
    it('should return High for Bash', () => {
      expect(api.getRiskLevel('Bash')).toBe(RiskLevel.High);
    });

    it('should return High for Delete', () => {
      expect(api.getRiskLevel('Delete')).toBe(RiskLevel.High);
    });

    it('should return Medium for Write', () => {
      expect(api.getRiskLevel('Write')).toBe(RiskLevel.Medium);
    });

    it('should return Medium for Edit', () => {
      expect(api.getRiskLevel('Edit')).toBe(RiskLevel.Medium);
    });

    it('should return Low for Read', () => {
      expect(api.getRiskLevel('Read')).toBe(RiskLevel.Low);
    });

    it('should return Low for unknown tool', () => {
      expect(api.getRiskLevel('Unknown')).toBe(RiskLevel.Low);
    });
  });

  describe('requiresPermission()', () => {
    it('should return true for Write', () => {
      expect(api.requiresPermission('Write')).toBe(true);
    });

    it('should return true for Bash', () => {
      expect(api.requiresPermission('Bash')).toBe(true);
    });

    it('should return false for Read', () => {
      expect(api.requiresPermission('Read')).toBe(false);
    });
  });
});
