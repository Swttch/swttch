import { useState, useCallback, useEffect, useRef } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { getBridgeClient } from '@/api/bridge/BridgeClient';
import type { CliControlRequestEvent } from '@/types';
import { MessageType } from '@/shared';
import { useAllowAllCommands } from '@/contexts/AllowAllCommandsContext';
import { useSessionContext } from '@/contexts/SessionContext';

export type PermissionRiskLevel = 'low' | 'medium' | 'high';

export interface PendingPermission {
  controlRequestId: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  riskLevel: PermissionRiskLevel;
  description: string;
  /**
   * The CLI said it will not keep a rule granted with this approval, so the
   * "allow for the session" answer must not be offered.
   */
  suppressAlwaysAllowRule: boolean;
}

function assessRiskLevel(toolName: string, input: Record<string, unknown>): PermissionRiskLevel {
  if (toolName === 'Bash' || toolName === 'PowerShell') return 'high';
  if (toolName === 'Write' || toolName === 'Edit') {
    const path = (input.file_path as string) || (input.path as string) || '';
    if (path.includes('/etc/') || path.includes('/System/') || path.includes('C:\\Windows\\')) {
      return 'high';
    }
    return 'medium';
  }
  if (toolName === 'Delete') return 'high';
  return 'low';
}

function generateDescription(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
      return `Execute: ${(input.command as string) || 'Unknown command'}`;
    case 'Write':
      return `Write file: ${(input.file_path as string) || 'Unknown'}`;
    case 'Edit':
      return `Edit file: ${(input.file_path as string) || 'Unknown'}`;
    case 'Delete':
      return `Delete file: ${(input.file_path as string) || 'Unknown'}`;
    case 'Read':
      return `Read file: ${(input.file_path as string) || 'Unknown'}`;
    case 'Glob':
      return `Search files: ${(input.pattern as string) || 'Unknown'}`;
    case 'Grep':
      return `Search content: ${(input.pattern as string) || 'Unknown'}`;
    case 'WebFetch':
      return `Fetch URL: ${(input.url as string) || 'Unknown'}`;
    case 'WebSearch':
      return `Web search: ${(input.query as string) || 'Unknown'}`;
    case 'NotebookEdit':
      return `Edit notebook: ${(input.notebook_path as string) || 'Unknown'}`;
    default:
      return `Use tool: ${toolName}`;
  }
}

interface UsePendingPermissionsReturn {
  pending: PendingPermission | null;
  approve: (controlRequestId: string) => void;
  approveForSession: (controlRequestId: string) => void;
  deny: (controlRequestId: string, reason?: string) => void;
}

export function usePendingPermissions(): UsePendingPermissionsReturn {
  const api = useApi();
  const [requests, setRequests] = useState<PendingPermission[]>([]);
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Read through a ref so the CLI_EVENT subscription below is not torn down and
  // re-made every time the user flips the setting: a request that arrives in
  // that gap would be missed by both the old and the new subscriber.
  const { currentSessionId } = useSessionContext();
  const { isEnabled: isAllowAllCommandsEnabled } = useAllowAllCommands();
  const autoAnswerRef = useRef(false);
  autoAnswerRef.current = isAllowAllCommandsEnabled(currentSessionId);

  /*
   * There is no session-permission cache here any more.
   *
   * "Yes, allow all edits this session" used to add the tool name to a ref, and
   * every later request for that name was auto-answered from this hook. That
   * hid the question rather than answering it: the CLI still asked every time,
   * the memory died with the render, and it covered the one tool name that
   * happened to ask while Claude edits through several (#393).
   *
   * The rule now goes to the CLI on the approval itself (approveForSession), so
   * the CLI stops asking on its own and there is no state on this side to keep
   * in step, clear on session change, or lose on a remount.
   */

  // Subscribe to CLI_EVENT for control_request (non-AskUserQuestion tools)
  useEffect(() => {
    const bridge = getBridgeClient();
    const unsubscribe = bridge.subscribe(MessageType.CLI_EVENT, (message) => {
      const cliEvent = message.payload as CliControlRequestEvent | undefined;
      if (cliEvent?.type !== 'control_request') return;

      const request = cliEvent?.request;

      // Skip AskUserQuestion (handled by usePendingAskUserQuestion)
      // Skip ExitPlanMode (handled by usePendingPlanApproval)
      if (!request || request.subtype !== 'can_use_tool' || request.tool_name === 'AskUserQuestion' || request.tool_name === 'ExitPlanMode') {
        return;
      }

      const controlRequestId = cliEvent.request_id as string;
      const toolName = request.tool_name as string;
      const toolUseId = request.tool_use_id as string;
      const input = (request.input || {}) as Record<string, unknown>;

      if (!controlRequestId || processedIdsRef.current.has(controlRequestId)) return;

      const suppressAlwaysAllowRule = request.suppress_always_allow_rule === true;

      // The user turned on "Allow all command in this session", so the safety
      // prompts the CLI will never remember a rule for are answered here. Only
      // those: an ordinary request still gets its panel, because the CLI can
      // keep the rule for it and asking again is its call.
      if (suppressAlwaysAllowRule && autoAnswerRef.current) {
        processedIdsRef.current.add(controlRequestId);
        api.tools.approve(toolUseId, controlRequestId, input);
        return;
      }

      setRequests(prev => [...prev, {
        controlRequestId,
        toolName,
        toolUseId,
        input,
        riskLevel: assessRiskLevel(toolName, input),
        description: generateDescription(toolName, input),
        suppressAlwaysAllowRule,
      }]);
    });
    return unsubscribe;
  }, [api.tools]);

  // A request answered in the IDE's diff review is settled — drop its prompt
  // here rather than leaving a question the CLI has already moved on from, which
  // the user would otherwise have to dismiss after watching their edit apply.
  useEffect(() => {
    const bridge = getBridgeClient();
    return bridge.subscribe(MessageType.PERMISSION_RESOLVED, (message) => {
      const controlRequestId = message.payload?.controlRequestId as string | undefined;
      if (!controlRequestId) return;
      processedIdsRef.current.add(controlRequestId);
      setRequests(prev => prev.filter(r => r.controlRequestId !== controlRequestId));
    });
  }, []);

  const approve = useCallback((controlRequestId: string) => {
    const req = requests.find(r => r.controlRequestId === controlRequestId);
    if (!req) return;

    processedIdsRef.current.add(controlRequestId);
    api.tools.approve(req.toolUseId, controlRequestId, req.input);
    setRequests(prev => prev.filter(r => r.controlRequestId !== controlRequestId));
  }, [requests, api.tools]);

  const approveForSession = useCallback((controlRequestId: string) => {
    const req = requests.find(r => r.controlRequestId === controlRequestId);
    if (!req) return;

    processedIdsRef.current.add(controlRequestId);
    // The rule travels with the approval, so the CLI is the one that stops
    // asking. Nothing is remembered here.
    api.tools.approveForSession(req.toolUseId, req.toolName, controlRequestId, req.input);
    setRequests(prev => prev.filter(r => r.controlRequestId !== controlRequestId));
  }, [requests, api.tools]);

  const deny = useCallback((controlRequestId: string, reason?: string) => {
    const req = requests.find(r => r.controlRequestId === controlRequestId);
    if (!req) return;

    processedIdsRef.current.add(controlRequestId);
    api.tools.deny(req.toolUseId, controlRequestId, reason);
    setRequests(prev => prev.filter(r => r.controlRequestId !== controlRequestId));
  }, [requests, api.tools]);

  // Return the first pending request (FIFO)
  const pending = requests.length > 0 ? requests[0] : null;

  return { pending, approve, approveForSession, deny };
}
