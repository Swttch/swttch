import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { desktopCardPreview } from '../PermissionBanner/PermissionPreview';

describe('desktopCardPreview', () => {
  it('shows a read as the path in a box and nothing else', () => {
    render(<>{desktopCardPreview('Read', { file_path: '/etc/hosts', limit: 1 })}</>);
    expect(screen.getByTestId('permission-value')).toHaveTextContent('/etc/hosts');
    expect(screen.queryByTestId('permission-input-rows')).not.toBeInTheDocument();
  });

  it('shows a web search as the words searched, and the rest of its input as captioned lines', () => {
    render(<>{desktopCardPreview('WebSearch', { query: 'claude code permission modes', mode: 'standard' })}</>);
    expect(screen.getByTestId('permission-value')).toHaveTextContent('claude code permission modes');
    const rows = screen.getByTestId('permission-input-rows');
    expect(rows).toHaveTextContent('Mode');
    expect(rows).toHaveTextContent('standard');
  });

  it('shows an edit as the path and the lines taken out above the lines put in, with the changed words marked', () => {
    render(<>{desktopCardPreview('Edit', { file_path: '/tmp/x/dm.txt', old_string: 'l1\nl2', new_string: 'L1\nl2' })}</>);
    expect(screen.getByTestId('permission-value')).toHaveTextContent('/tmp/x/dm.txt');
    const removed = screen.getAllByTestId('permission-diff-removed');
    const added = screen.getAllByTestId('permission-diff-added');
    expect(removed.map((row) => row.textContent)).toEqual(['l1', 'l2']);
    expect(added.map((row) => row.textContent)).toEqual(['L1', 'l2']);
    // "l1" -> "L1" is the change: marked on both sides. The "l2" both sides share stays plain.
    expect(removed[0].querySelector('[data-testid=permission-diff-chip]')).not.toBeNull();
    expect(removed[1].querySelector('[data-testid=permission-diff-chip]')).toBeNull();
    expect(added[1].querySelector('[data-testid=permission-diff-chip]')).toBeNull();
    expect(screen.queryByTestId('permission-input-rows')).not.toBeInTheDocument();
  });

  it('shows a new file as every line added, numbered from 1, with no removed line', () => {
    render(<>{desktopCardPreview('Write', { file_path: '/tmp/x/dm.txt', content: 'a\nb\nc\n' })}</>);
    expect(screen.queryAllByTestId('permission-diff-removed')).toHaveLength(0);
    const added = screen.getAllByTestId('permission-diff-added');
    // A trailing newline ends the last line, it does not add a fourth empty one.
    expect(added.map((row) => row.textContent)).toEqual(['1a', '2b', '3c']);
  });

  it('draws a line that was emptied as a row of its own', () => {
    render(<>{desktopCardPreview('Edit', { file_path: '/p', old_string: 'a\n\nb', new_string: 'a\nb' })}</>);
    expect(screen.getAllByTestId('permission-diff-removed')).toHaveLength(3);
    expect(screen.getAllByTestId('permission-diff-added')).toHaveLength(2);
  });

  it('has nothing for the other tools, and for a request with no words to show', () => {
    expect(desktopCardPreview('Bash', { command: 'ls' })).toBeNull();
    expect(desktopCardPreview('WebSearch', {})).toBeNull();
    expect(desktopCardPreview('Read', null)).toBeNull();
  });
});
