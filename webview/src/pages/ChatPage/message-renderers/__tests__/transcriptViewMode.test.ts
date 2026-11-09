import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SettingKey } from '@/types/settings';

const { mockSettings, mockSession } = vi.hoisted(() => ({
  mockSettings: vi.fn(),
  mockSession: vi.fn(),
}));
vi.mock('@/contexts/SettingsContext', () => ({ useSettingsOrNull: mockSettings }));
vi.mock('@/contexts/SessionContext', () => ({ useSessionContextOrNull: mockSession }));

import { useTranscriptViewMode } from '../transcriptViewMode';

function settingsWith(values: Record<string, unknown>) {
  mockSettings.mockReturnValue({ settings: values });
}

/** A default that was never chosen is Normal; Classic is a choice like the others. */
describe('useTranscriptViewMode', () => {
  beforeEach(() => {
    mockSession.mockReturnValue({ currentSessionId: 's1' });
  });

  it('draws the classic chat without a settings provider', () => {
    mockSettings.mockReturnValue(null);
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBeNull();
  });

  it('is Normal when the default was never chosen', () => {
    settingsWith({});
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBe('normal');
    settingsWith({ [SettingKey.TRANSCRIPT_VIEW_MODE]: null });
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBe('normal');
  });

  it('follows a default that was chosen, Classic included', () => {
    settingsWith({ [SettingKey.TRANSCRIPT_VIEW_MODE]: 'verbose' });
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBe('verbose');
    settingsWith({ [SettingKey.TRANSCRIPT_VIEW_MODE]: 'classic' });
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBeNull();
  });

  it('lets the session own pick win over the default', () => {
    settingsWith({
      [SettingKey.TRANSCRIPT_VIEW_MODE]: 'verbose',
      [SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]: { s1: 'classic' },
    });
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBeNull();
    settingsWith({
      [SettingKey.TRANSCRIPT_VIEW_MODE]: 'classic',
      [SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]: { s1: 'thinking' },
    });
    expect(renderHook(() => useTranscriptViewMode()).result.current).toBe('thinking');
  });
});
