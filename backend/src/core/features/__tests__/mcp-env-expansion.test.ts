import { describe, it, expect } from 'vitest';
import { expandPlaceholders, hasPlaceholder } from '../mcp-env-expansion';

// Every expectation below was measured against the `claude` CLI (2.1.170 and 2.1.251)
// by pointing a stdio MCP server at a probe that records the env it was spawned with.
// They are the contract this module has to keep, not guesses about the grammar.
const SOURCE = {
  SET: 'resolved-value',
  EMPTY: '',
};

describe('expandPlaceholders', () => {
  const cases: Array<{ name: string; input: string; expanded: string; missingVars: string[] }> = [
    {
      name: 'substitutes a resolvable placeholder',
      input: '${SET}',
      expanded: 'resolved-value',
      missingVars: [],
    },
    {
      name: 'uses the fallback when the variable is unset',
      input: '${UNSET:-fallback-value}',
      expanded: 'fallback-value',
      missingVars: [],
    },
    {
      name: 'prefers the variable over the fallback when it is set',
      input: '${SET:-fallback-value}',
      expanded: 'resolved-value',
      missingVars: [],
    },
    {
      name: 'treats an empty variable as resolved, not as unset',
      input: '${EMPTY:-fallback-value}',
      expanded: '',
      missingVars: [],
    },
    {
      name: 'accepts an empty fallback',
      input: '${UNSET:-}',
      expanded: '',
      missingVars: [],
    },
    {
      name: 'leaves an unresolvable placeholder verbatim and reports it',
      input: '${UNSET}',
      expanded: '${UNSET}',
      missingVars: ['UNSET'],
    },
    {
      name: 'expands in place, keeping surrounding text',
      input: 'prefix-${SET}-suffix',
      expanded: 'prefix-resolved-value-suffix',
      missingVars: [],
    },
    {
      name: 'expands several placeholders in one string',
      input: '${SET}/${UNSET:-fb}/${SET}',
      expanded: 'resolved-value/fb/resolved-value',
      missingVars: [],
    },
    {
      name: 'reports each missing name once, in first-seen order',
      input: '${B_MISSING} ${A_MISSING} ${B_MISSING}',
      expanded: '${B_MISSING} ${A_MISSING} ${B_MISSING}',
      missingVars: ['B_MISSING', 'A_MISSING'],
    },
    {
      name: 'passes through a string with no placeholder',
      input: 'postgresql://user:pass@host:5432/db',
      expanded: 'postgresql://user:pass@host:5432/db',
      missingVars: [],
    },
    {
      name: 'ignores a bare $VAR without braces',
      input: '$SET',
      expanded: '$SET',
      missingVars: [],
    },
    {
      name: 'ignores a name that starts with a digit',
      input: '${1BAD}',
      expanded: '${1BAD}',
      missingVars: [],
    },
    {
      name: 'ignores an unclosed placeholder',
      input: '${SET',
      expanded: '${SET',
      missingVars: [],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(expandPlaceholders(c.input, SOURCE)).toEqual({
        expanded: c.expanded,
        missingVars: c.missingVars,
      });
    });
  }

  it('does not treat an expanded value as a placeholder to expand again', () => {
    // A resolved value that itself looks like a placeholder must be left alone,
    // otherwise a config value could reach a variable the user never referenced.
    const source = { OUTER: '${INNER}', INNER: 'secret' };
    expect(expandPlaceholders('${OUTER}', source)).toEqual({
      expanded: '${INNER}',
      missingVars: [],
    });
  });
});

describe('hasPlaceholder', () => {
  it('detects a placeholder', () => {
    expect(hasPlaceholder('${VAR}')).toBe(true);
    expect(hasPlaceholder('pre-${VAR:-x}-post')).toBe(true);
  });

  it('rejects strings without one', () => {
    expect(hasPlaceholder('plain')).toBe(false);
    expect(hasPlaceholder('$VAR')).toBe(false);
  });

  it('is not affected by regex lastIndex across repeated calls', () => {
    // A shared /g regex would alternate true/false here; each call must stand alone.
    expect(hasPlaceholder('${VAR}')).toBe(true);
    expect(hasPlaceholder('${VAR}')).toBe(true);
    expect(hasPlaceholder('${VAR}')).toBe(true);
  });
});
