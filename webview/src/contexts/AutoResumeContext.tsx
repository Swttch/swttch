import { createContext, useContext, type ReactNode } from 'react';
import { useAutoResume, type UseAutoResumeResult } from '@/hooks/useAutoResume';

const AutoResumeContext = createContext<UseAutoResumeResult | null>(null);

export function AutoResumeProvider(props: { children: ReactNode }) {
  const value = useAutoResume();
  return <AutoResumeContext.Provider value={value}>{props.children}</AutoResumeContext.Provider>;
}

export function useAutoResumeContext(): UseAutoResumeResult {
  const value = useContext(AutoResumeContext);
  if (!value) throw new Error('useAutoResumeContext must be used inside AutoResumeProvider');
  return value;
}
