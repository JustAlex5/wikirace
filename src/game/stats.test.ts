import { describe, expect, it } from 'vitest';
import { MAX_HISTORY, STATS_KEY, createStatsStore, parseStats, type CompletedGame } from './stats';
import { createSafeStorage } from './storage';

function game(moves: number, durationMs = 60_000, completedAt = 1): CompletedGame {
  return { lang: 'en', start: 'Germany', target: 'Volkswagen', moves, durationMs, path: ['Germany', 'Volkswagen'], completedAt };
}

function memoryBackend(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

describe('stats store', () => {
  it('tracks played/completed counts, best moves, best time and history', () => {
    const store = createStatsStore(createSafeStorage(memoryBackend));
    store.recordStarted();
    store.recordStarted();
    store.recordCompleted(game(5, 90_000, 1));
    const stats = store.recordCompleted(game(3, 120_000, 2));
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.gamesCompleted).toBe(2);
    expect(stats.bestMoves).toBe(3);
    expect(stats.bestTimeMs).toBe(90_000);
    expect(stats.history.map((entry) => entry.completedAt)).toEqual([2, 1]);
    expect(store.load()).toEqual(stats);
  });

  it(`keeps at most ${MAX_HISTORY} history entries`, () => {
    const store = createStatsStore(createSafeStorage(memoryBackend));
    for (let i = 0; i < MAX_HISTORY + 5; i++) store.recordCompleted(game(4, 1000, i));
    expect(store.load().history).toHaveLength(MAX_HISTORY);
  });

  it('clears stats', () => {
    const store = createStatsStore(createSafeStorage(memoryBackend));
    store.recordStarted();
    expect(store.clear().gamesPlayed).toBe(0);
    expect(store.load().gamesPlayed).toBe(0);
  });

  it('keeps working when localStorage is unavailable', () => {
    const storage = createSafeStorage(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const store = createStatsStore(storage);
    expect(store.persistent).toBe(false);
    store.recordStarted();
    expect(store.recordCompleted(game(2)).gamesCompleted).toBe(1);
    expect(store.load().gamesPlayed).toBe(1);
  });

  it('keeps working when writes fail (quota exceeded)', () => {
    const backend = memoryBackend();
    let failWrites = false;
    const flaky: Storage = {
      ...backend,
      getItem: backend.getItem,
      removeItem: backend.removeItem,
      setItem: (key, value) => {
        if (failWrites) throw new DOMException('full', 'QuotaExceededError');
        backend.setItem(key, value);
      },
    };
    const store = createStatsStore(createSafeStorage(() => flaky));
    failWrites = true;
    expect(() => store.recordStarted()).not.toThrow();
  });
});

describe('parseStats', () => {
  it('returns empty stats for missing or corrupted data', () => {
    expect(parseStats(null).gamesPlayed).toBe(0);
    expect(parseStats('{not json').gamesPlayed).toBe(0);
    expect(parseStats('"string"').gamesPlayed).toBe(0);
  });

  it('drops malformed fields and history entries', () => {
    const stats = parseStats(
      JSON.stringify({ gamesPlayed: -1, gamesCompleted: 'x', bestMoves: 4, history: [game(4), { lang: 'xx' }, null] }),
    );
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.gamesCompleted).toBe(0);
    expect(stats.bestMoves).toBe(4);
    expect(stats.history).toHaveLength(1);
  });

  it('uses a versioned storage key', () => {
    expect(STATS_KEY).toBe('wikirace:stats:v1');
  });
});
