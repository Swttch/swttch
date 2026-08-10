import { useCallback } from 'react';
import { MessageType } from '@/shared';
import {
  buildControlRequestPayload,
  matchControlRequestCommand,
  type ControlRequestCommand,
} from '@/shared';
/** The one bridge capability this hook needs — request/response over IPC. */
interface ControlRequestSender {
  send: <T = unknown>(type: string, payload?: Record<string, unknown>) => Promise<T>;
}

/**
 * Prefix for the request ids we mint, so the webview can tell a control_response
 * to one of our slash commands apart from the CLI's own control traffic.
 */
export const CONTROL_REQUEST_COMMAND_PREFIX = 'ccg-cmd-';

/** Whether a control_response request_id belongs to a command we dispatched. */
export function isControlRequestCommandId(requestId: unknown): requestId is string {
  return typeof requestId === 'string' && requestId.startsWith(CONTROL_REQUEST_COMMAND_PREFIX);
}

/** Mint a request id for a command dispatch. Exported for tests. */
export function buildControlRequestId(
  command: ControlRequestCommand,
  unique: string,
): string {
  return `${CONTROL_REQUEST_COMMAND_PREFIX}${command.subtype}-${unique}`;
}

/** Session details the backend needs to spawn a CLI when none is running yet. */
export interface ControlRequestSessionContext {
  sessionId?: string;
  workingDir: string;
  inputMode: string;
  model?: string;
}

export interface ControlRequestDispatchResult {
  /** The command that was recognised, so callers can report on it. */
  command: ControlRequestCommand;
  /** Request id to match the CLI's control_response against. */
  requestId: string;
  /** False when the request never reached the CLI and text delivery should run. */
  sent: boolean;
}

/**
 * Dispatch slash commands the CLI refuses over stream-json (#270).
 *
 * `/reload-plugins` and `/btw` are absent from the CLI's command list for a
 * non-interactive session and are rejected when sent as text, but the CLI still
 * honours the `control_request` that does the same work. This runs that request
 * over the stdin channel the backend already owns.
 *
 * Returns null when the input is not one of those commands, leaving normal text
 * delivery untouched. When the request cannot be delivered the result carries
 * `sent: false` — callers must then send the command as text so the user still
 * gets the CLI's own explanation rather than silence. That fallback is what
 * keeps this an optimisation rather than a dependency on an undocumented
 * subtype.
 */
export function useControlRequestCommand(bridge: ControlRequestSender) {
  return useCallback(
    async (
      trimmedInput: string,
      session: ControlRequestSessionContext,
    ): Promise<ControlRequestDispatchResult | null> => {
      const matched = matchControlRequestCommand(trimmedInput);
      if (!matched) return null;

      const { command, args } = matched;
      const requestId = buildControlRequestId(command, crypto.randomUUID());

      try {
        const ack = await bridge.send<{ sent?: boolean }>(
          MessageType.SEND_CONTROL_REQUEST,
          {
            requestId,
            request: buildControlRequestPayload(command, args),
            // Sent so the backend can start a CLI when the chat is still empty
            // — running a command first thing must work, not fall back to text.
            sessionId: session.sessionId,
            workingDir: session.workingDir,
            inputMode: session.inputMode,
            model: session.model,
          },
        );
        return { command, requestId, sent: ack?.sent === true };
      } catch (error) {
        console.error('[useControlRequestCommand] dispatch failed:', error);
        return { command, requestId, sent: false };
      }
    },
    [bridge],
  );
}
