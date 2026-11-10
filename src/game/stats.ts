import type { Lang } from '../wiki/types';
import { isSupportedLang } from '../wiki/types';
import type { KeyValueStorage } from './storage';

export const STATS_KEY = 'wikirace:stats:v1';
export const MAX_HISTORY = 50;

export interface CompletedGame {
  lang: Lang;
  start: string;
  target: string;
  moves: number;
  durationMs: number;
  path: string[];
  completedAt: number;
}

export interface Stats {
  gamesPlayed: number;
  gamesCompleted: number;
  bestMoves: number | null;
  bestTimeMs: number | null;
  history: CompletedGame[];
}

export function emptyStats(): Stats {
  return { gamesPlayed: 0, gamesCompleted: 0, bestMoves: null, bestTimeMs: null, history: [] };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCompletedGame(value: unknown): value is CompletedGame {
  if (!value || typeof value !== 'object') return false;
  const game = value as Record<string, unknown>;
  return (
    isSupportedLang(game.lang) &&
    typeof game.start === 'string' &&
    typeof game.target === 'string' &&
    isCount(game.moves) &&
    isCount(game.durationMs) &&
    isCount(game.completedAt) &&
    Array.isArray(game.path) &&
    game.path.every((step) => typeof step === 'string')
  );
}

export function parseStats(raw: string | null): Stats {
  if (!raw) return emptyStats();
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return emptyStats();
    const history = Array.isArray(data.history) ? data.history.filter(isCompletedGame).slice(0, MAX_HISTORY) : [];
    return {
      gamesPlayed: isCount(data.gamesPlayed) ? data.gamesPlayed : 0,
      gamesCompleted: isCount(data.gamesCompleted) ? data.gamesCompleted : 0,
      bestMoves: isCount(data.bestMoves) ? data.bestMoves : null,
      bestTimeMs: isCount(data.bestTimeMs) ? data.bestTimeMs : null,
      history,
    };
  } catch {
    return emptyStats();
  }
}

export interface StatsStore {
  load(): Stats;
  recordStarted(): Stats;
  recordCompleted(game: CompletedGame): Stats;
  clear(): Stats;
  readonly persistent: boolean;
}

export function createStatsStore(storage: KeyValueStorage): StatsStore {
  const save = (stats: Stats): Stats => {
    storage.setItem(STATS_KEY, JSON.stringify(stats));
    return stats;
  };
  const load = (): Stats => parseStats(storage.getItem(STATS_KEY));

  return {
    persistent: storage.persistent,
    load,
    recordStarted() {
      const stats = load();
      return save({ ...stats, gamesPlayed: stats.gamesPlayed + 1 });
    },
    recordCompleted(game) {
      const stats = load();
      return save({
        ...stats,
        gamesCompleted: stats.gamesCompleted + 1,
        bestMoves: stats.bestMoves === null ? game.moves : Math.min(stats.bestMoves, game.moves),
        bestTimeMs: stats.bestTimeMs === null ? game.durationMs : Math.min(stats.bestTimeMs, game.durationMs),
        history: [game, ...stats.history].slice(0, MAX_HISTORY),
      });
    },
    clear() {
      storage.removeItem(STATS_KEY);
      return emptyStats();
    },
  };
}
