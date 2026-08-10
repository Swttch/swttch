export interface SlashCommandInfo {
  name: string;
  description: string;
  argumentHint: string;
}

export interface ControlResponse<T> {
  type: 'control_response';
  response: {
    subtype: 'success';
    request_id: string;
    response: T;
  };
}

export interface CliInitResponse {
  commands: SlashCommandInfo[];
  agents: AgentInfo[];
  output_style: string;
  available_output_styles: string[];
  models: ModelInfo[];
  account: AccountInfo;
  pid: number;
}

export interface AgentInfo {
  name: string;
  description: string;
  model?: string;
}

export interface ModelInfo {
  value: string;
  /**
   * The concrete model this row resolves to, as the CLI reports it
   * (`claude-haiku-4-5-20251001`). `value` is what we hand back to the CLI to
   * select the row; this is what the CLI echoes as the running model on
   * `system/init`, so placing a reported model on its row keys on this field.
   * Absent on rows the CLI did not resolve (our Fable fallback row).
   */
  resolvedModel?: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
  supportsAutoMode?: boolean;
}

export interface AccountInfo {
  email: string;
  subscriptionType: string;
}

export type CliConfigControlResponse = ControlResponse<CliInitResponse>;
