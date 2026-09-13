import { ModelInfo } from './ModelInfo';

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
  /**
   * Instances, not raw JSON: `CliConfigContext` hydrates this array the moment
   * the payload arrives, so nothing downstream ever holds a plain catalog row.
   */
  models: ModelInfo[];
  account: AccountInfo;
  pid: number;
}

export interface AgentInfo {
  name: string;
  description: string;
  model?: string;
}

/**
 * Re-exported so the many modules that already import `ModelInfo` from here
 * keep working. It is a class now, and `CliConfigContext` is the one place that
 * turns the CLI's JSON into instances — see `ModelInfo.ts`.
 */
export { ModelInfo } from './ModelInfo';

export interface AccountInfo {
  email: string;
  subscriptionType: string;
}

export type CliConfigControlResponse = ControlResponse<CliInitResponse>;
