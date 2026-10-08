import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SponsorBenefitsSection } from '../SponsorBenefitsSection';

describe('SponsorBenefitsSection', () => {
  it('lists every sponsor feature, the newest one included', () => {
    render(<SponsorBenefitsSection />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Scheduled messages',
      'Auto-resume on usage limit',
      'Step across a session’s assets',
      'Allow all command in all sessions',
    ]);
  });

  it('links each feature to its English doc file, not to the folder holding it', () => {
    render(<SponsorBenefitsSection />);

    const docs: Array<[string, string]> = [
      ['Scheduled messages', '018-scheduled_messages'],
      ['Auto-resume on usage limit', '019-auto_resume_on_limit'],
      ['Step across a session’s assets', '059-assets'],
    ];
    for (const [name, folder] of docs) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        `https://github.com/Swttch/swttch/blob/main/docs/features/${folder}/en.md`,
      );
    }
  });

  it('names the feature that has no doc without linking it, rather than opening a missing page', () => {
    render(<SponsorBenefitsSection />);

    expect(screen.getByText('Allow all command in all sessions')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Allow all command in all sessions' })).not.toBeInTheDocument();
  });
});
