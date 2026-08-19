import { describe, it, expect } from 'vitest';
import { classifyWorkingDirs, WorkingDirEntry } from '../classifyWorkingDirs';
import { buildDisplayNodes, visibleUnder } from '../WorkingDirMenu';
import { indentStyle } from '../WorkingDirItem';

const REPO = '/Users/yonghyun/Projects/yhk1038/claude-code-gui-jetbrains';

function entry(path: string, sessionCount = 1): WorkingDirEntry {
  return {
    name: path.split('/').pop() || path,
    path,
    sessionCount,
    lastModified: new Date(0).toISOString(),
  };
}

/**
 * Snapshot of the reporter's real working-dir list. The monorepo sub-projects
 * live two levels below the repo root, which is exactly the shape a
 * direct-children-only filter used to drop.
 */
const ALL: WorkingDirEntry[] = [
  entry('/private/tmp', 51),
  entry('/private/tmp/acli-live', 20),
  entry('/private/tmp/ccg-demo', 20),
  entry('/Users/yonghyun/Desktop/Fred/think-book', 6),
  entry('/Users/yonghyun/Projects/Atoz/payplo/front', 2),
  entry('/Users/yonghyun/Projects/t-ruby', 65),
  entry('/Users/yonghyun/Projects/yhk1038/active-cli-sdk', 2),
  entry(REPO, 144),
  entry(`${REPO}-worktrees`, 1),
  entry(`${REPO}-worktrees/issue-267`, 1),
  entry(`${REPO}/packages/active-cli-sdk`, 1),
  entry(`${REPO}/packages/claude-code-battery`, 2),
  entry(`${REPO}/webview`, 3),
];

describe('classifyWorkingDirs — descendants at any depth', () => {
  it('includes monorepo sub-projects nested deeper than one level', () => {
    const { descendants } = classifyWorkingDirs(ALL, REPO, REPO);

    expect(descendants.map((e) => e.path)).toEqual([
      `${REPO}/packages/active-cli-sdk`,
      `${REPO}/packages/claude-code-battery`,
      `${REPO}/webview`,
    ]);
  });

  it('does not treat a sibling sharing the name prefix as a descendant', () => {
    const { descendants } = classifyWorkingDirs(ALL, REPO, REPO);

    // `<repo>-worktrees` starts with the repo path as a string but is not
    // inside it. Matching on `startsWith(path)` alone would swallow it.
    expect(descendants.map((e) => e.path)).not.toContain(`${REPO}-worktrees`);
    expect(descendants.map((e) => e.path)).not.toContain(`${REPO}-worktrees/issue-267`);
  });

  it('leaves unrelated working dirs out of the tree', () => {
    const { descendants, ancestors, siblings } = classifyWorkingDirs(ALL, REPO, REPO);
    const shown = [...descendants, ...ancestors, ...siblings].map((e) => e.path);

    expect(shown).not.toContain('/private/tmp');
    expect(shown).not.toContain('/Users/yonghyun/Projects/t-ruby');
    expect(shown).not.toContain('/Users/yonghyun/Projects/yhk1038/active-cli-sdk');
  });
});

describe('buildDisplayNodes — descendant tree shape', () => {
  const classified = classifyWorkingDirs(ALL, REPO, REPO);
  const nodes = buildDisplayNodes(classified, REPO);
  const rows = nodes.map((n) => ({
    path: n.entry.path,
    name: n.entry.name,
    depth: n.depth,
    isScaffold: n.isScaffold,
    isCurrent: n.isCurrent,
    parentPath: n.parentPath,
    hasChildren: n.hasChildren,
  }));

  it('nests every descendant under the current working dir', () => {
    expect(rows).toEqual([
      { path: REPO, name: 'claude-code-gui-jetbrains', depth: 0, isScaffold: false, isCurrent: true, parentPath: null, hasChildren: true },
      { path: `${REPO}/packages`, name: 'packages', depth: 1, isScaffold: true, isCurrent: false, parentPath: REPO, hasChildren: true },
      { path: `${REPO}/packages/active-cli-sdk`, name: 'active-cli-sdk', depth: 2, isScaffold: false, isCurrent: false, parentPath: `${REPO}/packages`, hasChildren: false },
      { path: `${REPO}/packages/claude-code-battery`, name: 'claude-code-battery', depth: 2, isScaffold: false, isCurrent: false, parentPath: `${REPO}/packages`, hasChildren: false },
      { path: `${REPO}/webview`, name: 'webview', depth: 1, isScaffold: false, isCurrent: false, parentPath: REPO, hasChildren: false },
    ]);
  });

  it('gives a chevron only to rows that actually have children', () => {
    // Leaves must report hasChildren=false so the row renders a blank slot
    // instead of a toggle — otherwise the icons stop lining up vertically.
    const leaves = nodes.filter((n) => !n.hasChildren).map((n) => n.entry.name);
    expect(leaves).toEqual(['active-cli-sdk', 'claude-code-battery', 'webview']);
  });

  it('marks the folder that is not itself a working dir as scaffold', () => {
    const packages = nodes.find((n) => n.entry.path === `${REPO}/packages`);

    // `packages/` only exists to carry the tree shape — nobody ran claude
    // there, so it must not advertise a session count or be clickable.
    expect(packages?.isScaffold).toBe(true);
    expect(packages?.entry.sessionCount).toBe(0);
  });

  it('keeps real working dirs clickable with their session counts', () => {
    const battery = nodes.find(
      (n) => n.entry.path === `${REPO}/packages/claude-code-battery`,
    );

    expect(battery?.isScaffold).toBe(false);
    expect(battery?.entry.sessionCount).toBe(2);
  });
});

describe('buildDisplayNodes — unbounded depth', () => {
  it('keeps every level distinct no matter how deep the nesting runs', () => {
    const deep = `${REPO}/a/b/c/d/e/f/g/h`;
    const all = [entry(REPO, 1), entry(deep, 1)];
    const nodes = buildDisplayNodes(classifyWorkingDirs(all, REPO, REPO), REPO);

    // One row per path segment below the root, each one level deeper. A fixed
    // indent palette used to clamp here, collapsing the deepest levels onto a
    // single indent and making distinct folders look like siblings.
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const deepest = nodes[nodes.length - 1];
    expect(deepest.entry.path).toBe(deep);
    expect(deepest.isScaffold).toBe(false);
  });
});

describe('buildDisplayNodes — the deep fixture from ignore/make-deep-tree-fixture.sh', () => {
  // Mirrors the profile that script generates: 7 levels, 30+ char segments,
  // and two unregistered gaps (levels 2 and 5) that must come back as scaffold.
  const DEEP_ROOT = '/tmp/cd/deep-tree-demo-root';
  const SEGMENTS = [
    'packages-long-directory-name-01',
    'nested-package-directory-lvl-02',
    'nested-package-directory-lvl-03',
    'nested-package-directory-lvl-04',
    'nested-package-directory-lvl-05',
    'nested-package-directory-lvl-06',
    'nested-package-directory-lvl-07',
  ];
  const at = (level: number) => `${DEEP_ROOT}/${SEGMENTS.slice(0, level).join('/')}`;

  const all = [
    entry(DEEP_ROOT),
    entry(at(1)),
    entry(at(3)),
    entry(at(4)),
    entry(at(6)),
    entry(at(7)),
    entry(`${DEEP_ROOT}/webview`),
  ];
  const nodes = buildDisplayNodes(classifyWorkingDirs(all, DEEP_ROOT, DEEP_ROOT), DEEP_ROOT);

  it('renders all seven levels, each at its own depth', () => {
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 1]);
  });

  it('rebuilds the unregistered levels as scaffold rows', () => {
    const scaffolds = nodes.filter((n) => n.isScaffold).map((n) => n.entry.path);
    expect(scaffolds).toEqual([at(2), at(5)]);
  });

  it('indents the deepest row far past the old six-step ceiling', () => {
    const deepest = nodes[nodes.length - 2];
    expect(deepest.entry.path).toBe(at(7));
    expect(indentStyle(deepest.depth).paddingInlineStart).toBe('6.75rem');
  });
});

describe('buildDisplayNodes — a freshly picked working dir', () => {
  it('marks a working dir with no sessions yet as draft, not scaffold', () => {
    // Picked via "Add new" but never used, so it is absent from the list. It is
    // still a real, clickable destination — unlike a scaffold path segment —
    // so the row must be flagged draft and keep its normal tone.
    const fresh = `${REPO}/packages/brand-new-untouched-package`;
    const nodes = buildDisplayNodes(classifyWorkingDirs(ALL, fresh, REPO), fresh);
    const row = nodes.find((n) => n.entry.path === fresh);

    expect(row?.isDraft).toBe(true);
    expect(row?.isScaffold).toBe(false);
    expect(row?.entry.sessionCount).toBe(0);
  });
});

describe('buildDisplayNodes — anchor and highlight are separate', () => {
  const NESTED = `${REPO}/packages/active-cli-sdk`;
  // Browsing the repo root while a session nested under it is open.
  const classified = classifyWorkingDirs(ALL, REPO, REPO);
  const nodes = buildDisplayNodes(classified, REPO, NESTED);

  it('keeps the tree rooted at the directory being browsed', () => {
    // Re-rooting on the session's own directory would make the panel look
    // exactly like having entered that sub-project directly — the sibling
    // packages and the repo root would vanish from the tree.
    expect(nodes.map((n) => n.entry.path)).toEqual([
      REPO,
      `${REPO}/packages`,
      `${REPO}/packages/active-cli-sdk`,
      `${REPO}/packages/claude-code-battery`,
      `${REPO}/webview`,
    ]);
  });

  it('highlights the session’s own directory, not the anchor', () => {
    const highlighted = nodes.filter((n) => n.isCurrent).map((n) => n.entry.path);
    expect(highlighted).toEqual([NESTED]);
  });

  it('highlights the anchor when no separate selection is given', () => {
    const plain = buildDisplayNodes(classified, REPO);
    expect(plain.filter((n) => n.isCurrent).map((n) => n.entry.path)).toEqual([REPO]);
  });
});

describe('indentStyle — indentation without a ceiling', () => {
  it('steps in by a constant amount per level', () => {
    expect(indentStyle(0).paddingInlineStart).toBe('0.625rem');
    expect(indentStyle(1).paddingInlineStart).toBe('1.5rem');
    expect(indentStyle(2).paddingInlineStart).toBe('2.375rem');
  });

  it('keeps growing past the depth a fixed class palette used to cap at', () => {
    // The old palette held six steps and clamped beyond it, so depth 6 and 12
    // rendered identically. Every level must now be strictly wider than the last.
    const widths = [6, 7, 8, 12, 20].map((d) => indentStyle(d).paddingInlineStart);
    expect(new Set(widths).size).toBe(widths.length);
    expect(indentStyle(20).paddingInlineStart).toBe('18.125rem');
  });

  it('uses a logical property so RTL indents from the right', () => {
    // paddingLeft would indent from the left even in RTL, breaking the tree.
    expect(indentStyle(3)).toEqual({ paddingInlineStart: '3.25rem' });
  });
});

describe('visibleUnder — folding subtrees', () => {
  const classified = classifyWorkingDirs(ALL, REPO, REPO);
  const nodes = buildDisplayNodes(classified, REPO);
  const names = (set: Set<string>) => visibleUnder(nodes, set).map((n) => n.entry.name);

  it('shows every row by default', () => {
    expect(names(new Set())).toEqual([
      'claude-code-gui-jetbrains',
      'packages',
      'active-cli-sdk',
      'claude-code-battery',
      'webview',
    ]);
  });

  it('hides the children of a collapsed row but keeps the row itself', () => {
    expect(names(new Set([`${REPO}/packages`]))).toEqual([
      'claude-code-gui-jetbrains',
      'packages',
      'webview',
    ]);
  });

  it('takes grandchildren down with a collapsed grandparent', () => {
    // Collapsing the repo root must fold `packages` AND everything below it —
    // checking only the direct parent would leave the grandchildren stranded.
    expect(names(new Set([REPO]))).toEqual(['claude-code-gui-jetbrains']);
  });

  it('leaves the tree untouched when a leaf is marked collapsed', () => {
    expect(names(new Set([`${REPO}/webview`]))).toEqual([
      'claude-code-gui-jetbrains',
      'packages',
      'active-cli-sdk',
      'claude-code-battery',
      'webview',
    ]);
  });
});
