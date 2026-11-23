import { buildUserDeclinedContent } from '../shared';
import type { PermissionUpdate } from '../shared';

/** What a person decided about one request the CLI raised (a permission prompt, a question, a plan). */
export interface ToolAnswer {
  approved: boolean;
  updatedInput?: Record<string, unknown>;
  /** Permission rules to install alongside an approval — "yes, and stop asking this session" (#393). */
  updatedPermissions?: PermissionUpdate[];
  reason?: string;
}

/**
 * The `control_response` that answers the CLI's `control_request` [requestId] (can_use_tool permission,
 * ExitPlanMode, AskUserQuestion).
 *
 * A denial here is the user's DECISION, not a tool/server failure: the CLI turns our `deny` message into the
 * resulting tool_result content (is_error:true). The message carries the shared USER_DECLINED_PREFIX marker so the
 * webview renders it as a neutral "Declined" note instead of a red error, and, since the marker lives in the
 * persisted content, the distinction survives a reload.
 *
 * One builder for both ways an answer arrives: from a screen of the backend that holds the CLI, and from a screen of
 * another backend that handed the answer over (see forward-to-holder.ts), so the two can never word it differently.
 */
export function buildControlResponse(requestId: string, answer: ToolAnswer): Record<string, unknown> {
  return {
    subtype: 'success' as const,
    request_id: requestId,
    response: answer.approved
      ? {
          behavior: 'allow',
          updatedInput: answer.updatedInput ?? {},
          // Only when there is something to install: an empty array is a different statement from saying
          // nothing, and the CLI has no reason to read one.
          ...(answer.updatedPermissions?.length ? { updatedPermissions: answer.updatedPermissions } : {}),
        }
      : { behavior: 'deny', message: buildUserDeclinedContent(answer.reason) },
  };
}
