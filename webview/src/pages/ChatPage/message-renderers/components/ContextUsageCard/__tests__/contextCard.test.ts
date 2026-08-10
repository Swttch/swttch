import { describe, it, expect } from 'vitest';
import type { ModelInfo } from '@/types/slashCommand';
import { assignCategoryColors, FREE_CELL_CLASS } from '../palette';
import { buildAgentGroups, buildSkillGroups, buildMemoryGroups } from '../treeModel';
import { formatTokensSummary, resolveContextModelName } from '../modelDisplayName';
import type {
  ContextAgentEntry,
  ContextSkillEntry,
  ContextMemoryEntry,
  ContextUsageCategory,
} from '@/utils/parseContextUsage';

describe('assignCategoryColors', () => {
  const categories: ContextUsageCategory[] = [
    { name: 'System prompt', tokens: 2400, tokensLabel: '2.4k', percent: 0.2 },
    { name: 'Skills', tokens: 5200, tokensLabel: '5.2k', percent: 0.5 },
    { name: 'Free space', tokens: 941700, tokensLabel: '941.7k', percent: 94.2 },
  ];

  it('assigns distinct colors to used categories and the free class to Free space', () => {
    const colored = assignCategoryColors(categories);
    expect(colored).toHaveLength(3);
    expect(colored[0].free).toBe(false);
    expect(colored[1].free).toBe(false);
    expect(colored[0].colorClass).not.toBe(colored[1].colorClass);
    const free = colored.find((c) => c.name === 'Free space');
    expect(free?.free).toBe(true);
    expect(free?.colorClass).toBe(FREE_CELL_CLASS);
  });

  it('keeps the CLI row order', () => {
    const colored = assignCategoryColors(categories);
    expect(colored.map((c) => c.name)).toEqual(['System prompt', 'Skills', 'Free space']);
  });
});

describe('tree group builders', () => {
  it('groups agents by source preserving first-seen order', () => {
    const agents: ContextAgentEntry[] = [
      { name: 'a', source: 'Plugin', tokensLabel: '40' },
      { name: 'b', source: 'Project', tokensLabel: '50' },
      { name: 'c', source: 'Plugin', tokensLabel: '60' },
    ];
    const groups = buildAgentGroups(agents);
    expect(groups.map((g) => g.label)).toEqual(['Plugin', 'Project']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['a', 'c']);
  });

  it('groups skills by source and keeps verbatim token labels', () => {
    const skills: ContextSkillEntry[] = [
      { name: 'email-writing', source: 'User', tokensLabel: '~50' },
      { name: 'analyze', source: 'Plugin (oh-my-claudecode)', tokensLabel: '< 20' },
    ];
    const groups = buildSkillGroups(skills);
    expect(groups.map((g) => g.label)).toEqual(['User', 'Plugin (oh-my-claudecode)']);
    expect(groups[1].items[0].tokensLabel).toBe('< 20');
  });

  it('orders skill groups Project → User → Plugin(*) → Built-in regardless of CLI order', () => {
    const skills: ContextSkillEntry[] = [
      { name: 'email-writing', source: 'User', tokensLabel: '~50' },
      { name: 'deploy', source: 'Project', tokensLabel: '~130' },
      { name: 'update-config', source: 'Built-in', tokensLabel: '~240' },
      { name: 'analyze', source: 'Plugin (oh-my-claudecode)', tokensLabel: '< 20' },
      { name: 'skill-creator', source: 'Plugin (skill-creator)', tokensLabel: '~120' },
    ];
    const groups = buildSkillGroups(skills);
    expect(groups.map((g) => g.label)).toEqual([
      'Project',
      'User',
      'Plugin (oh-my-claudecode)',
      'Plugin (skill-creator)',
      'Built-in',
    ]);
  });

  it('renders memory files as a single unlabeled group of paths', () => {
    const files: ContextMemoryEntry[] = [
      { type: 'User', path: '/a/CLAUDE.md', tokensLabel: '9.6k' },
      { type: 'Project', path: '/b/CLAUDE.md', tokensLabel: '720' },
    ];
    const groups = buildMemoryGroups(files);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeUndefined();
    expect(groups[0].items.map((i) => i.name)).toEqual(['/a/CLAUDE.md', '/b/CLAUDE.md']);
    expect(groups[0].items[0].title).toBe('/a/CLAUDE.md');
  });

  it('returns no groups for empty memory files', () => {
    expect(buildMemoryGroups([])).toEqual([]);
  });
});

describe('model display helpers', () => {
  it('normalizes the token summary spacing and inserts "tokens"', () => {
    expect(formatTokensSummary('58.3k', '1m', 6)).toBe('58.3k/1m tokens (6%)');
  });

  it('falls back to em dashes when labels are missing', () => {
    expect(formatTokensSummary('', '', 0)).toBe('—/— tokens (0%)');
  });

  it('reconstructs a parenthesized model name from the catalog description', () => {
    const models: ModelInfo[] = [
      {
        value: 'opus[1m]',
        resolvedModel: 'claude-opus-4-8[1m]',
        displayName: 'Opus',
        description: 'Opus 4.8 with 1M context · Best for everyday tasks',
      },
    ];
    expect(resolveContextModelName(models, 'claude-opus-4-8[1m]')).toBe('Opus 4.8 (1M context)');
  });

  it('returns an empty string when the catalog is empty', () => {
    expect(resolveContextModelName([], 'claude-opus-4-8[1m]')).toBe('');
  });
});
