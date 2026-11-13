/**
 * Which allow answer leads the next permission card: the one picked last.
 *
 * Measured in the desktop app over three cards in different sessions: "Always allow" led after "Always allow" was
 * picked, and "Allow once", picked from the menu, led the card after it, with "Always allow" moved into the menu.
 * Kept for as long as this window lives (the desktop app's own reach past a restart is not known).
 */
export type AllowChoice = 'once' | 'always';

let last: AllowChoice = 'always';

export function getLastAllowChoice(): AllowChoice {
  return last;
}

export function setLastAllowChoice(choice: AllowChoice): void {
  last = choice;
}
