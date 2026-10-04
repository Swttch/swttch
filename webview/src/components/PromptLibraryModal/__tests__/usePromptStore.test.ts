import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';
import {
  getCategoryOrder,
  getPromptOrder,
  getPromptOrderByCategory,
  resetPromptOrder,
  updatePromptOrder,
} from '@/utils/promptOrderStore';
import type { PromptLink, SavedPrompt } from '@/types/prompt';

const prompt = (id: string): SavedPrompt => ({ id, name: id, content: `${id} body`, createdAt: 1, updatedAt: 1 });

let workingDirectory: string | null = '/work';
const defaultCategories: Array<{ id: string; name: string; createdAt: number; priority?: number }> = [
  { id: 'c2', name: 'docs', createdAt: 1 },
  { id: 'c1', name: 'review', createdAt: 1 },
];
let categoriesAck = defaultCategories;
const defaultSend = (type: string, payload?: Record<string, unknown>): Promise<unknown> => {
  if (type === MessageType.GET_PROMPTS) {
    return Promise.resolve(
      payload?.scope === 'project'
        ? { scope: 'project', prompts: [prompt('p2'), prompt('p1')], orderByCategory: { c1: ['p1'] } }
        : { scope: 'global', prompts: [prompt('g2'), prompt('g1')], orderByCategory: { c1: ['g1', 'g2'] } },
    );
  }
  if (type === MessageType.GET_PROMPT_CATEGORIES) {
    return Promise.resolve({ categories: categoriesAck });
  }
  return Promise.resolve({ status: 'ok' });
};
const sendMock = vi.fn(defaultSend);

// One object for every render: the store reloads whenever the bridge it was given
// changes, so a fresh object per call would reload for ever.
const bridge = { isConnected: true, send: sendMock, subscribe: vi.fn(() => vi.fn()), lastError: null };
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => bridge,
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory }),
}));

import { usePromptStore } from '../usePromptStore';

describe('usePromptStore', () => {
  beforeEach(() => {
    resetPromptOrder();
    sendMock.mockClear();
    sendMock.mockImplementation(defaultSend);
    workingDirectory = '/work';
    categoriesAck = defaultCategories;
  });

  async function loaded() {
    const rendered = renderHook(() => usePromptStore());
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));
    return rendered;
  }

  // The backend answers a library it cannot read with an error, as a reply and not
  // as a rejection. Drawing that reply's empty list shows a library that looks wiped.
  describe('a library the backend could not read', () => {
    const failing = (scopeThatFails: 'global' | 'project') => {
      sendMock.mockImplementation((type: string, payload?: Record<string, unknown>) => {
        if (type === MessageType.GET_PROMPTS) {
          const scope = payload?.scope === 'project' ? 'project' : 'global';
          return Promise.resolve(
            scope === scopeThatFails
              ? { status: 'error', error: 'migration 20261004120200_import-legacy-prompts failed: boom', scope, prompts: [] }
              : { status: 'ok', scope, prompts: [prompt(`${scope}-1`)], orderByCategory: {} },
          );
        }
        if (type === MessageType.GET_PROMPT_CATEGORIES) return Promise.resolve({ categories: defaultCategories });
        return Promise.resolve({ status: 'ok' });
      });
    };

    it('shows the "could not load" state instead of an empty library', async () => {
      failing('global');

      const { result } = await loaded();

      expect(result.current.error).toMatch(/import-legacy-prompts failed/);
      expect(result.current.globalPrompts).toEqual([]);
    });

    it('does so when only the project half failed, and shows neither half', async () => {
      failing('project');

      const { result } = await loaded();

      expect(result.current.error).not.toBeNull();
      expect(result.current.globalPrompts).toEqual([]);
    });

    it('does not fill the order caches from the empty list', async () => {
      failing('global');

      await loaded();

      expect(getPromptOrder()).toEqual({ global: [], project: [] });
    });
  });

  // The backend owns the order. What the screens draw is a cache of it, filled
  // from the replies, so a reload shows the order that is actually saved.
  describe('the order it reads from the backend', () => {
    it('fills the library order of each scope from the order the prompts arrive in', async () => {
      await loaded();

      expect(getPromptOrder()).toEqual({ global: ['g2', 'g1'], project: ['p2', 'p1'] });
    });

    it('fills the order inside each category, per scope', async () => {
      await loaded();

      expect(getPromptOrderByCategory().c1).toEqual({ global: ['g1', 'g2'], project: ['p1'] });
    });

    it('fills the category column from the order the categories arrive in', async () => {
      await loaded();

      // "All" is part of the column; with no stored place it is on top.
      await waitFor(() => expect(getCategoryOrder()).toEqual(['__all__', 'c2', 'c1']));
    });

    it('puts "All" where the saved priorities left it', async () => {
      categoriesAck = [
        { id: 'c1', name: 'review', createdAt: 1, priority: -1 },
        { id: 'c2', name: 'docs', createdAt: 1, priority: 1 },
      ];
      await loaded();

      await waitFor(() => expect(getCategoryOrder()).toEqual(['c1', '__all__', 'c2']));
    });

    it('replaces an order made on the screen with the saved one on reload', async () => {
      const { result } = await loaded();
      act(() => updatePromptOrder(() => ({ global: ['g1', 'g2'], project: ['p1', 'p2'] })));

      act(() => result.current.reload());
      await waitFor(() => expect(getPromptOrder().global).toEqual(['g2', 'g1']));
    });

    it('does not save what it read', async () => {
      await loaded();

      expect(sendMock.mock.calls.some(([type]) => type === MessageType.REORDER_PROMPTS)).toBe(false);
      expect(sendMock.mock.calls.some(([type]) => type === MessageType.REORDER_PROMPT_CATEGORIES)).toBe(false);
    });
  });

  describe('saving an order the user made', () => {
    it('sends a changed library order to the backend with its scope', async () => {
      await loaded();

      act(() => updatePromptOrder((order) => ({ ...order, global: ['g1', 'g2'] })));

      expect(sendMock).toHaveBeenCalledWith(MessageType.REORDER_PROMPTS, { scope: 'global', ids: ['g1', 'g2'] });
    });

    it('sends a project order with the project it belongs to', async () => {
      await loaded();

      act(() => updatePromptOrder((order) => ({ ...order, project: ['p1', 'p2'] })));

      expect(sendMock).toHaveBeenCalledWith(MessageType.REORDER_PROMPTS, {
        scope: 'project',
        workingDir: '/work',
        ids: ['p1', 'p2'],
      });
    });

    it('does not send a project order when no project is open', async () => {
      workingDirectory = null;
      await loaded();

      act(() => updatePromptOrder((order) => ({ ...order, project: ['x'] })));

      expect(sendMock.mock.calls.some(([type]) => type === MessageType.REORDER_PROMPTS)).toBe(false);
    });
  });

  describe('importing', () => {
    const links: PromptLink[] = [{ categoryId: 'c1', promptId: 'a', priority: 1 }];

    it('hands the links of the preview back with the import', async () => {
      const { result } = await loaded();

      await act(async () => {
        await result.current.importPrompts('global', [prompt('a')], 'skip', links);
      });

      expect(sendMock).toHaveBeenCalledWith(
        MessageType.IMPORT_PROMPTS,
        expect.objectContaining({ scope: 'global', strategy: 'skip', links }),
      );
    });

    it('reads again afterwards, so the screen shows where the imported prompts landed', async () => {
      const { result } = await loaded();
      sendMock.mockClear();

      await act(async () => {
        await result.current.importPrompts('global', [prompt('a')], 'skip', links);
      });

      expect(sendMock.mock.calls.some(([type]) => type === MessageType.GET_PROMPTS)).toBe(true);
    });
  });
});
