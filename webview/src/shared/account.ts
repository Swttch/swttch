/**
 * StoredAccount — a Claude account the user saved for quick switching.
 *
 * Field names mirror Claude's own data verbatim (data-preservation rule in
 * CLAUDE.md): `emailAddress`, `displayName`, `organizationName` come straight
 * from `~/.claude.json`'s `oauthAccount`; `subscriptionType`/`authMethod` come
 * from `claude auth status`. We never rename them on the way to the webview.
 *
 * NOTE: This file is mirrored 1:1 in `backend/src/shared/account.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export interface StoredAccount {
  /** Stable account id: "acc:" + uuid. */
  id: string;
  /** Claude account email (oauthAccount.emailAddress). The natural identity key. */
  emailAddress: string;
  /** Human display name (oauthAccount.displayName), if any. */
  displayName: string | null;
  /** Organization name (oauthAccount.organizationName), if any. */
  organizationName: string | null;
  /** Plan/subscription tier from `claude auth status` (e.g. "max", "team"). */
  subscriptionType: string | null;
  /** Auth method from `claude auth status` (e.g. "claudeai", "console"). */
  authMethod: string | null;
  /** Epoch ms when the snapshot was first captured. */
  createdAt: number;
  /** Epoch ms when the snapshot was last refreshed. */
  updatedAt: number;
  /** Usage data cached from the last time this account was active (fetched via ccb). Null until first active fetch. */
  usageCached: AccountUsageData | null;
  /** Epoch ms when usageCached was last written. 0 when never fetched. */
  usageCachedAt: number;
}

export enum AccountPoolStrategy {
  ORDERED = 'ordered',
}

export interface AccountPool {
  id: string;
  name: string;
  provider: 'claude';
  enabled: boolean;
  strategy: AccountPoolStrategy;
  accountIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** A StoredAccount plus whether it is the account currently live in the CLI. */
export interface AccountListItem extends StoredAccount {
  /** True when this account's email matches the live `claude auth status` email. */
  active: boolean;
}

/** Payload of GET_ACCOUNTS: the saved accounts plus who is live right now. */
export interface AccountsResult {
  accounts: AccountListItem[];
  accountPools: AccountPool[];
  /** Email of the live CLI account, or null when not logged in / unknown. */
  activeEmail: string | null;
}

export interface AccountUsageBucket { utilization: number; resets_at: string; }
export interface AccountUsageData {
  five_hour: AccountUsageBucket | null;
  seven_day: AccountUsageBucket | null;
  seven_day_sonnet: AccountUsageBucket | null;
  seven_day_opus: AccountUsageBucket | null;
}
export interface AccountUsage {
  id: string; emailAddress: string; displayName: string | null;
  subscriptionType: string | null;
  active: boolean;
  usage: AccountUsageData | null;
  error: string | null;
  errorKind: string | null;
}
export interface AllUsageResult { accounts: AccountUsage[]; }
