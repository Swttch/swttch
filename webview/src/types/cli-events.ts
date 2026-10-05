/** CLI control_request event payload received via CLI_EVENT message */
export interface CliControlRequestEvent {
  type: 'control_request';
  request_id: string;
  request: {
    subtype: string;
    tool_name?: string;
    tool_use_id?: string;
    input?: Record<string, unknown>;
    description?: string;
    /**
     * Set by the CLI when a rule granted with this approval would be ignored,
     * e.g. a `safetyCheck` that could not read the command. Offering "allow for
     * the session" then promises something the CLI will not keep.
     */
    suppress_always_allow_rule?: boolean;
    [key: string]: unknown;
  };
}
