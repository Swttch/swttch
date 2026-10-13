import { fireEvent, screen } from '@testing-library/react';

/**
 * The badge a row wears on the project tab when the project sets the value
 * itself, and the reset link in its tooltip. Shared by the table tests so each
 * row is asked the same two questions: does the badge show exactly when it
 * should, and does the link take the project's value back.
 */
export const projectValueBadge = () =>
  screen.queryByRole('img', { name: /This project sets its own value/ });

/** Hover the badge the way a pointer does, then press the reset link in its tooltip. */
export async function resetFromBadge(): Promise<void> {
  const badge = projectValueBadge();
  if (!badge) throw new Error('no project-value badge on screen to reset from');
  fireEvent.mouseEnter(badge);
  fireEvent.click(await screen.findByRole('button', { name: 'Reset to global' }));
}
