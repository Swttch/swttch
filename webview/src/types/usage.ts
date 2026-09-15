/**
 * Anthropic OAuth Usage API response types.
 * 필드명은 API 원본 그대로 유지 (원본 데이터 보존 원칙).
 */

export interface UsageBucket {
  utilization: number;       // 0-100 percentage
  resets_at: string;         // ISO 8601 datetime
}

/**
 * A limit the API describes by name instead of giving it a field of its own.
 *
 * Newer per-model windows arrive only here, so a reader that walks the named fields
 * never sees them. That is why a Fable weekly limit was missing from this panel while
 * the API was plainly reporting it: the array is not a duplicate of the flat fields, it
 * is where the entries the flat fields have no name for live.
 */
export interface UsageLimit {
  kind: string;              // e.g. "weekly_scoped"
  percent: number;           // 0-100 percentage
  resets_at?: string | null;
  scope?: { model?: { display_name?: string; id?: string } };
}

export interface ExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
}

export interface UsageResponse {
  five_hour: UsageBucket | null;
  seven_day: UsageBucket | null;
  seven_day_oauth_apps: UsageBucket | null;
  seven_day_sonnet: UsageBucket | null;
  seven_day_opus: UsageBucket | null;
  seven_day_cowork: UsageBucket | null;
  iguana_necktie: UsageBucket | null;
  extra_usage: ExtraUsage | null;
  limits?: UsageLimit[] | null;
}

export type UsageErrorKind =
  | 'ccb_missing' | 'npm_missing' | 'auth' | 'network' | 'rate_limited' | 'unknown';
