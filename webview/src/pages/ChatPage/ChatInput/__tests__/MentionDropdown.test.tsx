import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MentionDropdown } from '../MentionDropdown';
import { MentionResult, MentionItemType } from '../hooks/useMention';

// jsdom does not implement scrollIntoView; MentionDropdown calls it to keep
// the selected row visible on selectedIndex change.
Element.prototype.scrollIntoView = vi.fn();

describe('MentionDropdown', () => {
  it('renders the relativePath as plain text when matchIndices is absent', () => {
    const results = [new MentionResult({ relativePath: 'src/App.tsx', type: MentionItemType.File })];
    render(
      <MentionDropdown results={results} selectedIndex={0} isLoading={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
    // No highlight spans should exist without matchIndices.
    expect(document.querySelectorAll('.text-text-link').length).toBe(0);
  });

  it('wraps matched character runs in a bold accent-colored span', () => {
    // "webview/src/adapters/BrowserAdapter.ts" -> matches at 21,22 ("Br") and 28,29 ("Ad").
    const relativePath = 'webview/src/adapters/BrowserAdapter.ts';
    const results = [
      new MentionResult({
        relativePath,
        type: MentionItemType.File,
        matchIndices: [21, 22, 28, 29],
      }),
    ];
    render(
      <MentionDropdown results={results} selectedIndex={0} isLoading={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    const highlighted = Array.from(document.querySelectorAll('.text-text-link')).map(el => el.textContent);
    expect(highlighted).toEqual(['Br', 'Ad']);

    // The full path text is still present and unedited.
    const rowButton = screen.getAllByRole('button').find(b => b.textContent?.includes('BrowserAdapter'));
    expect(rowButton?.textContent).toContain(relativePath);
  });

  it('does not highlight the trailing "/" appended for directories', () => {
    const results = [
      new MentionResult({
        relativePath: 'src/utils',
        type: MentionItemType.Directory,
        matchIndices: [0, 1, 2],
      }),
    ];
    render(
      <MentionDropdown results={results} selectedIndex={0} isLoading={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    const highlighted = Array.from(document.querySelectorAll('.text-text-link')).map(el => el.textContent);
    expect(highlighted).toEqual(['src']);
    const rowButton = screen.getAllByRole('button').find(b => b.textContent?.includes('src/utils'));
    expect(rowButton?.textContent).toContain('src/utils/');
  });

  it('gives the selected row a light-theme-safe selected background instead of the near-black tooltip color', () => {
    const results = [
      new MentionResult({ relativePath: 'src/App.tsx', type: MentionItemType.File }),
      new MentionResult({ relativePath: 'src/main.tsx', type: MentionItemType.File }),
    ];
    render(
      <MentionDropdown results={results} selectedIndex={0} isLoading={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    const buttons = screen.getAllByRole('button').filter(b => b.textContent?.includes('.tsx'));
    const selectedClasses = buttons[0].className.split(/\s+/);
    expect(selectedClasses).toContain('bg-surface-selected');
    expect(selectedClasses).not.toContain('bg-surface-tooltip');
    expect(buttons[1].className.split(/\s+/)).not.toContain('bg-surface-selected');
  });
});
