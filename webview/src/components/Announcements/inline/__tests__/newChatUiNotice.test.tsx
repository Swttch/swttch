import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';

const { mockView, mockOpenSettingsAt } = vi.hoisted(() => ({
  mockView: vi.fn(),
  mockOpenSettingsAt: vi.fn(),
}));
vi.mock('@/pages/ChatPage/message-renderers/transcriptViewMode', () => ({ useTranscriptViewMode: mockView }));
vi.mock('@/utils/openSettingsAt', () => ({ openSettingsAt: mockOpenSettingsAt }));

import { NEW_CHAT_UI_NOTICE_ID, NewChatUiNoticeCard, newChatUiNotice, useNewChatUiNoticeRelevant } from '../newChatUiNotice';
import { readInlineDismissed } from '../dismissed';

describe('new chat UI notice', () => {
  beforeEach(() => {
    localStorage.clear();
    mockView.mockReset();
    mockOpenSettingsAt.mockReset();
  });

  it('is shown for someone looking at one of the new views', () => {
    mockView.mockReturnValue('normal');
    expect(renderHook(() => useNewChatUiNoticeRelevant()).result.current).toBe(true);
  });

  it('is not shown to someone who already chose Classic', () => {
    mockView.mockReturnValue(null);
    expect(renderHook(() => useNewChatUiNoticeRelevant()).result.current).toBe(false);
  });

  it('stays closed once it was closed', () => {
    mockView.mockReturnValue('normal');
    render(<NewChatUiNoticeCard />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(readInlineDismissed(NEW_CHAT_UI_NOTICE_ID)).toBe(true);
    expect(renderHook(() => useNewChatUiNoticeRelevant()).result.current).toBe(false);
  });

  it('says how to get back to Classic and opens the setting', () => {
    mockView.mockReturnValue('normal');
    render(<NewChatUiNoticeCard />);
    expect(screen.getByText(/Classic/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /open this setting/i }));
    expect(mockOpenSettingsAt).toHaveBeenCalledTimes(1);
  });

  it('competes for the empty chat', () => {
    expect(newChatUiNotice.id).toBe(NEW_CHAT_UI_NOTICE_ID);
  });
});
