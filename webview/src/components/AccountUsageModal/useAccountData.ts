import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { useAccountQuery } from '@/hooks/queries/useAccountQuery';

// Display-ready data for the UI
interface AccountInfo {
  authMethod: string | null;
  email: string | null;
  plan: string | null;
  /** Set when the credential came from an environment variable, naming which one. */
  apiKeySource: string | null;
}

interface UseAccountDataReturn {
  data: AccountInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// jO1 equivalent - maps authMethod raw value to display string
function formatAuthMethod(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').toLowerCase();
  switch (normalized) {
    case 'claudeai': return 'Claude AI';
    case 'console': return 'Anthropic Console';
    case 'apikey':
    case 'api-key': return 'API Key';
    case '3p': return 'Third Party';
    default: return raw;
  }
}

// BO1 equivalent - snake_case → Title Case
function formatPlan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function useAccountData(): UseAccountDataReturn {
  const queryClient = useQueryClient();
  const accountQuery = useAccountQuery();

  // Shares the `[GET_ACCOUNT]` cache with AuthContext, so opening this modal no
  // longer fires its own GET_ACCOUNT — it reads the already-fetched snapshot.
  const raw = accountQuery.data?.account;
  const data: AccountInfo | null = raw
    ? {
        authMethod: formatAuthMethod(raw.authMethod),
        email: raw.email ?? null,
        plan: formatPlan(raw.subscriptionType),
        apiKeySource: raw.apiKeySource ?? null,
      }
    : null;

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_ACCOUNT] });
  }, [queryClient]);

  return {
    data,
    isLoading: accountQuery.isLoading,
    error: accountQuery.isError ? (accountQuery.error?.message ?? 'Unknown error') : null,
    refetch,
  };
}
