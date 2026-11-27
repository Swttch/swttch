import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import enSettings from '@/i18n/locales/en/settings.json';
import { ChatLoadingSection } from '../index';

/**
 * The "Loading conversations" section (#680). The window sliding switch comes first; with it off nothing is
 * let go of, so the two page counts and the line that adds them up say nothing and are not drawn.
 */

let mockSettings: Record<string, unknown> = {};

vi.mock('@/contexts/SettingsContext', () => {
  const value = () => ({
    scope: 'global',
    scopeSettings: mockSettings,
    settings: mockSettings,
    overrides: [] as string[],
    updateSetting: vi.fn(),
    updateSettingWithScope: vi.fn(),
    resetToGlobal: vi.fn(),
    ideAttached: false,
    ideProduct: '',
  });
  return { useSettings: value, useSettingsOrNull: value };
});

const chat = enSettings.general.chatLoading;

beforeEach(() => {
  mockSettings = {};
});

describe('ChatLoadingSection', () => {
  it('puts the window sliding switch first, on by default', () => {
    render(<ChatLoadingSection />);
    const rows = screen.getAllByRole('switch').concat(screen.getAllByRole('spinbutton'));
    expect(rows[0]).toHaveAccessibleName(chat.windowing.label);
    expect(screen.getByRole('switch', { name: chat.windowing.label })).toHaveAttribute('aria-checked', 'true');
    // The switch is above the first number in the document.
    const sw = screen.getByRole('switch', { name: chat.windowing.label });
    const size = screen.getByRole('spinbutton', { name: chat.pageSize.label });
    expect(sw.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws the page size, both page counts and the total while window sliding is on', () => {
    render(<ChatLoadingSection />);
    expect(screen.getByRole('spinbutton', { name: chat.pageSize.label })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: chat.latestPages.label })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: chat.historyPages.label })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // #708: a page holds 20 messages by default, and more than 50 is slow enough to be called out.
  it('holds 20 messages a page by default, and calls out more than 50', () => {
    const { rerender } = render(<ChatLoadingSection />);
    const size = () => screen.getByRole('spinbutton', { name: chat.pageSize.label });
    expect(size()).toHaveValue(20);
    expect(size()).toHaveAttribute('min', '10');
    expect(screen.queryByText(chat.notRecommended)).toBeNull();

    mockSettings = { chatMessagesPerPage: 60 };
    rerender(<ChatLoadingSection />);
    expect(screen.getByText(chat.notRecommended)).toBeInTheDocument();
  });

  it('keeps only the switch and the page size when window sliding is off', () => {
    mockSettings = { chatWindowing: false };
    render(<ChatLoadingSection />);
    expect(screen.getByRole('switch', { name: chat.windowing.label })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('spinbutton', { name: chat.pageSize.label })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: chat.latestPages.label })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: chat.historyPages.label })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
