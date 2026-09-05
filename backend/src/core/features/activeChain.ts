/**
 * Filter messages to only include those in active conversation chains.
 * Ported from frontend filterActiveChain to allow backend-only pagination.
 */
export function filterActiveChain(messages: Record<string, any>[]): Record<string, any>[] {
  if (messages.length === 0) return messages;

  // Build uuid → message lookup
  const byUuid = new Map<string, Record<string, any>>();
  for (const msg of messages) {
    const uuid = msg.uuid as string | undefined;
    if (uuid) byUuid.set(uuid, msg);
  }

  // Find all child→parent references to identify leaf messages
  const hasChild = new Set<string>();
  for (const msg of messages) {
    const parentUuid = msg.parentUuid as string | undefined;
    if (parentUuid && byUuid.has(parentUuid)) {
      hasChild.add(parentUuid);
    }
  }

  // Find leaf messages (no message references them as parent)
  // For each leaf, trace back to root — collecting all active UUIDs
  const activeUuids = new Set<string>();
  for (const msg of messages) {
    const uuid = msg.uuid as string | undefined;
    if (!uuid) continue;
    if (hasChild.has(uuid)) continue; // not a leaf

    // Trace from this leaf backwards
    let current: Record<string, any> | undefined = msg;
    while (current) {
      const curUuid = current.uuid as string | undefined;
      if (curUuid) activeUuids.add(curUuid);
      const parentUuid = current.parentUuid as string | undefined;
      if (parentUuid && byUuid.has(parentUuid)) {
        current = byUuid.get(parentUuid);
      } else {
        break;
      }
    }
  }

  // Filter: keep messages in any active chain.
  //
  // An entry without a uuid is not a member of the parent-child chain walked
  // above, so this filter has nothing to say about it and keeps it. Deciding by
  // type instead meant every type nobody had thought to list was dropped on the
  // way to the webview, which is the information loss CLAUDE.md's original-data
  // rule forbids: a range filter may send fewer entries, it may not edit what an
  // entry is. Measured across 120 session files, seven such types existed and
  // only three were listed — `last-prompt` (1967), `atis-latch` (1041), `mode`
  // (608), `pr-link` (321), `ai-title` (49), `file-history-snapshot` (6) and
  // `permission-mode` (2) never reached the frontend at all.
  //
  // Two of those are load-bearing. `queue-operation` is how the CLI records a
  // message typed while a turn was still running: it writes `enqueue` on receipt
  // and `remove` on consumption and never writes a `user` entry, so dropping the
  // pair loses that message outright once a session is re-read from disk (#220).
  // `file-history-snapshot` is what says a message can be rewound to (#356).
  return messages.filter(msg => {
    const uuid = msg.uuid as string | undefined;
    if (!uuid) return true;
    return activeUuids.has(uuid);
  });
}
