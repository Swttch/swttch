import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PromptDropdown } from '../PromptDropdown';
import type { PromptRow } from '../hooks/usePromptLibrary';

// jsdom does not implement scrollIntoView; PromptDropdown calls it to keep the
// selected row visible on selectedIndex change.
Element.prototype.scrollIntoView = vi.fn();

const row = (id: string, name: string, content: string, scope: 'global' | 'project'): PromptRow => ({
  kind: 'prompt',
  prompt: { id, name, content, scope, createdAt: 1, updatedAt: 1 },
});

function renderPanel(rows: PromptRow[], overrides: Partial<React.ComponentProps<typeof PromptDropdown>> = {}) {
  return render(
    <PromptDropdown
      rows={rows}
      selectedIndex={0}
      isLoading={false}
      hasLoaded
      onSelect={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe('PromptDropdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the name and a one-line preview', () => {
    renderPanel([row('p1', '시작', '워크트리 따서 작업 착수하자.\n다음 마일스톤으로 설정해.', 'project')]);

    expect(screen.getByText('시작')).toBeInTheDocument();
    // The preview collapses the line break so the row stays one line tall.
    expect(
      screen.getByText('워크트리 따서 작업 착수하자. 다음 마일스톤으로 설정해.'),
    ).toBeInTheDocument();
  });

  /**
   * Issue #430 — the preview and the scope were on `text-disabled`, the dimmest
   * token in the palette (82/255 in the dark theme), and could not be read at a
   * glance. The name carries the hierarchy by weight instead, so these two can
   * stay legible.
   */
  describe('legibility of the secondary text', () => {
    it('keeps every part of the row off the dimmest token', () => {
      renderPanel([row('p1', '시작', '본문', 'global')]);

      expect(document.querySelectorAll('.text-text-disabled').length).toBe(0);
    });

    it('carries the name hierarchy by weight rather than by dimming its neighbours', () => {
      renderPanel([row('p1', '시작', '본문', 'global')]);

      expect(screen.getByText('시작').className).toContain('font-medium');
    });
  });

  /**
   * The name exists to tell prompts apart at a glance; the content is the thing
   * being pasted, so the content gets the room. They used to split the row
   * evenly, which left the content truncated while the name had space to spare.
   *
   * Asserted on the classes because jsdom lays nothing out — every width it
   * reports is 0 — and the class is what the contract is written in. The real
   * split was measured in a browser: 24.1% name, 63.5% content.
   */
  describe('the row gives the content the room', () => {
    it('caps the name at a quarter of the row instead of letting it grow', () => {
      renderPanel([row('p1', '아주 긴 이름을 가진 프롬프트', '본문', 'global')]);

      const name = screen.getByText('아주 긴 이름을 가진 프롬프트');
      expect(name.className).toContain('w-1/4');
      expect(name.className).toContain('flex-shrink-0');
      expect(name.className).not.toContain('flex-1');
    });

    it('lets the content take the remaining room', () => {
      renderPanel([row('p1', '시작', '본문', 'global')]);

      const previewText = screen.getByText('본문');
      expect(previewText.className).toContain('flex-1');
    });
  });

  /**
   * A truncated line cannot tell the user what they are about to paste, so
   * hovering the preview offers the whole prompt, line breaks and all.
   *
   * The hover is driven for real (mouseenter plus Tippy's open delay) rather
   * than asserting on a closed tooltip's DOM: measured here, Tippy headless does
   * NOT commit its `render` while closed, so "the content is in the document"
   * would pass for the wrong reason — or, as it did first, fail for one.
   */
  describe('the preview offers the whole prompt on hover', () => {
    it('shows the content unedited, newlines included', () => {
      vi.useFakeTimers();
      const content = '첫 줄\n둘째 줄';
      renderPanel([row('p1', '시작', content, 'global')]);

      // Nothing is shown before the pointer arrives.
      expect(document.querySelector('.whitespace-pre-wrap')).toBeNull();

      const preview = screen.getByText('첫 줄 둘째 줄');
      act(() => {
        fireEvent.mouseEnter(preview);
        vi.advanceTimersByTime(500); // past Tippy's 200ms open delay
      });

      const body = document.querySelector('.whitespace-pre-wrap');
      expect(body).not.toBeNull();
      expect(body?.textContent).toBe(content);
    });
  });

  /**
   * The row is itself a <button>, so its two actions are spans with a button
   * role. mousedown rather than click, because the composer's blur must not fire
   * first — the same reason the row uses mousedown to select.
   */
  describe('a row can be edited and deleted from the panel', () => {
    it('names the prompt to edit and does not also select it', () => {
      const onEdit = vi.fn();
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'global')], { onEdit, onSelect });

      fireEvent.mouseDown(screen.getByRole('button', { name: 'Edit' }));

      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', scope: 'global' }),
      );
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('names the prompt to delete and does not also select it', () => {
      const onDelete = vi.fn();
      const onSelect = vi.fn();
      renderPanel([row('p1', '시작', 'body', 'project')], { onDelete, onSelect });

      fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', scope: 'project' }),
      );
      expect(onSelect).not.toHaveBeenCalled();
    });

    // The create row has no prompt behind it, so it has nothing to edit.
    it('offers neither on the create row', () => {
      renderPanel([{ kind: 'create' }]);
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });
  });
});
