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

  it('has nothing for the other tools, and for a request with no words to show', () => {
    expect(desktopCardPreview('Bash', { command: 'ls' })).toBeNull();
    expect(desktopCardPreview('WebSearch', {})).toBeNull();
    expect(desktopCardPreview('Read', null)).toBeNull();
  });
});
