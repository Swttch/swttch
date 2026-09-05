export enum AccountSwitchPreflightOutcome {
  SUCCESS = 'success',
  TIMEOUT = 'timeout',
  ERROR = 'error',
}

export interface AccountSwitchPreflightResult {
  outcome: AccountSwitchPreflightOutcome;
  error?: string;
}
