/**
 * Shape of the objects stored in `history.state`. Every followed link pushes
 * one entry, so browser Back/Forward map onto positions in the game path.
 */
export type HistoryEntry =
  | { wikirace: 'home' }
  | { wikirace: 'game'; gameId: number; index: number };

export function readHistoryEntry(state: unknown): HistoryEntry | null {
  if (!state || typeof state !== 'object') return null;
  const entry = state as Record<string, unknown>;
  if (entry.wikirace === 'home') return { wikirace: 'home' };
  if (
    entry.wikirace === 'game' &&
    typeof entry.gameId === 'number' &&
    typeof entry.index === 'number' &&
    Number.isInteger(entry.index) &&
    entry.index >= 0
  ) {
    return { wikirace: 'game', gameId: entry.gameId, index: entry.index };
  }
  return null;
}

export function gameEntry(gameId: number, index: number): HistoryEntry {
  return { wikirace: 'game', gameId, index };
}

export const HOME_ENTRY: HistoryEntry = { wikirace: 'home' };
