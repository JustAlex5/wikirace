import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSource, flush } from '../test/fakeWiki';
import { WikiError } from '../wiki/types';
import { GameEngine } from './engine';
import type { GameState } from './types';

const PAGES = {
  Germany: { links: ['Berlin', 'German economy', 'VW', 'File:Flag of Germany.svg', 'Nowhere'] },
  Berlin: { links: ['Germany', 'Brandenburg Gate'] },
  'Brandenburg Gate': { links: ['Berlin'] },
  'German economy': { links: ['Automotive industry', 'Germany'] },
  'Automotive industry': { links: ['Volkswagen', 'Toyota'] },
  Toyota: { links: ['Automotive industry'] },
  Volkswagen: { links: ['Germany'] },
  VW: { redirectTo: 'Volkswagen' },
  'Federal Republic of Germany': { redirectTo: 'Germany' },
  Mercury: { disambiguation: true, links: ['Mercury (planet)'] },
};

function setup(options: { now?: () => number } = {}) {
  const fake = createFakeSource(PAGES);
  const started: GameState[] = [];
  const won: GameState[] = [];
  let clock = 1_000;
  const engine = new GameEngine({
    source: fake.source,
    now: options.now ?? (() => clock),
    onGameStarted: (state) => started.push(state),
    onGameWon: (state) => won.push(state),
  });
  return {
    engine,
    fake,
    started,
    won,
    advance(ms: number) {
      clock += ms;
    },
  };
}

async function startGame(t: ReturnType<typeof setup>, start = 'Germany', target = 'Volkswagen') {
  await t.engine.start({ lang: 'en', start, target });
  return t.engine.getState();
}

describe('GameEngine: starting a challenge', () => {
  it('loads the start article with zero moves', async () => {
    const t = setup();
    const state = await startGame(t);
    expect(state.status).toBe('playing');
    expect(state.start).toBe('Germany');
    expect(state.target).toBe('Volkswagen');
    expect(state.path).toEqual(['Germany']);
    expect(state.pathIndex).toBe(0);
    expect(state.moves).toBe(0);
    expect(state.article?.title).toBe('Germany');
    expect(state.startedAt).toBe(1_000);
    expect(t.started).toHaveLength(1);
  });

  it('resolves redirects for start and target to canonical titles', async () => {
    const t = setup();
    const state = await startGame(t, 'federal_Republic_of_Germany', 'VW');
    expect(state.start).toBe('Germany');
    expect(state.target).toBe('Volkswagen');
    expect(state.path).toEqual(['Germany']);
  });

  it('fails when the start article does not exist', async () => {
    const t = setup();
    const state = await startGame(t, 'Atlantis Prime', 'Volkswagen');
    expect(state.status).toBe('failed');
    expect(state.startError).toEqual({ code: 'missing', which: 'start', title: 'Atlantis Prime' });
    expect(t.started).toHaveLength(0);
  });

  it('fails when the target does not exist', async () => {
    const t = setup();
    const state = await startGame(t, 'Germany', 'Atlantis Prime');
    expect(state.startError?.code).toBe('missing');
    expect(state.startError?.which).toBe('target');
  });

  it('rejects challenges whose start and target are the same article after redirects', async () => {
    const t = setup();
    expect((await startGame(t, 'Germany', 'germany')).startError?.code).toBe('same-article');
    expect((await startGame(t, 'Federal Republic of Germany', 'Germany')).startError?.code).toBe('same-article');
  });

  it('rejects a disambiguation page as the target', async () => {
    const t = setup();
    const state = await startGame(t, 'Germany', 'Mercury');
    expect(state.startError).toEqual({ code: 'target-disambiguation', which: 'target', title: 'Mercury' });
  });

  it('rejects invalid titles without making requests', async () => {
    const t = setup();
    const state = await startGame(t, 'Bad[title]', 'Volkswagen');
    expect(state.startError?.code).toBe('invalid');
    expect(t.fake.fetchCalls).toHaveLength(0);
  });

  it('reports network failures as retryable start errors', async () => {
    const t = setup();
    t.fake.failNext('Germany', new WikiError('network', 'offline'));
    const state = await startGame(t);
    expect(state.startError?.code).toBe('network');
  });

  it('ignores a slower earlier start when a new challenge was started meanwhile', async () => {
    const t = setup();
    t.fake.hold();
    const first = t.engine.start({ lang: 'en', start: 'Berlin', target: 'Volkswagen' });
    const second = t.engine.start({ lang: 'en', start: 'Germany', target: 'Toyota' });
    t.fake.release();
    await Promise.all([first, second]);
    const state = t.engine.getState();
    expect(state.start).toBe('Germany');
    expect(state.target).toBe('Toyota');
    expect(t.started).toHaveLength(1);
  });
});

describe('GameEngine: navigation and move counting', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(async () => {
    t = setup();
    await startGame(t);
  });

  it('follows a valid article link and counts one move', async () => {
    const result = await t.engine.followLink('Berlin');
    const state = t.engine.getState();
    expect(result).toEqual({ status: 'moved', index: 1, won: false });
    expect(state.moves).toBe(1);
    expect(state.path).toEqual(['Germany', 'Berlin']);
    expect(state.pathIndex).toBe(1);
    expect(state.article?.title).toBe('Berlin');
    expect(state.moveLog).toEqual([{ from: 'Germany', to: 'Berlin', via: 'Berlin', at: 1_000 }]);
  });

  it('counts every successfully followed link', async () => {
    await t.engine.followLink('German economy');
    await t.engine.followLink('Automotive industry');
    await t.engine.followLink('Toyota');
    expect(t.engine.getState().moves).toBe(3);
    expect(t.engine.getState().path).toEqual(['Germany', 'German economy', 'Automotive industry', 'Toyota']);
  });

  it('normalizes underscores and lowercase first letters in link titles', async () => {
    await t.engine.followLink('german_economy');
    expect(t.engine.getState().path).toEqual(['Germany', 'German economy']);
  });

  it('does not count namespace links (File:, Category:, Special:)', async () => {
    for (const title of ['File:Flag of Germany.svg', 'Category:Countries', 'Special:Random', 'Help:Contents']) {
      const result = await t.engine.followLink(title);
      expect(result).toEqual({ status: 'rejected', reason: 'not-article' });
    }
    const state = t.engine.getState();
    expect(state.moves).toBe(0);
    expect(state.path).toEqual(['Germany']);
    expect(state.notice?.code).toBe('not-article');
    expect(t.fake.fetchCalls).toEqual(['Germany']);
  });

  it('does not count links to missing pages', async () => {
    const result = await t.engine.followLink('Nowhere');
    expect(result).toEqual({ status: 'rejected', reason: 'missing' });
    expect(t.engine.getState().moves).toBe(0);
    expect(t.engine.getState().pending).toBeNull();
    expect(t.engine.getState().notice).toMatchObject({ code: 'missing', title: 'Nowhere' });
  });

  it('does not count invalid titles', async () => {
    expect(await t.engine.followLink('')).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(await t.engine.followLink('A|B')).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(t.engine.getState().moves).toBe(0);
  });

  it('does not count failed requests and allows retrying', async () => {
    t.fake.failNext('Berlin', new WikiError('network', 'offline'));
    expect(await t.engine.followLink('Berlin')).toEqual({ status: 'rejected', reason: 'network' });
    expect(t.engine.getState().moves).toBe(0);
    t.fake.clearFailures();
    expect((await t.engine.followLink('Berlin')).status).toBe('moved');
    expect(t.engine.getState().moves).toBe(1);
  });

  it('ignores links to the current article', async () => {
    expect(await t.engine.followLink('Germany')).toEqual({ status: 'ignored', reason: 'same-article' });
    expect(await t.engine.followLink('Federal Republic of Germany')).toEqual({ status: 'ignored', reason: 'same-article' });
    expect(t.engine.getState().moves).toBe(0);
  });

  it('records the canonical title when a link is a redirect', async () => {
    await t.engine.start({ lang: 'en', start: 'Germany', target: 'Toyota' });
    const result = await t.engine.followLink('VW');
    const state = t.engine.getState();
    expect(result.status).toBe('moved');
    expect(state.path).toEqual(['Germany', 'Volkswagen']);
    expect(state.moveLog[0]).toMatchObject({ to: 'Volkswagen', via: 'VW' });
  });

  it('ignores clicks before the game has started or after it ended', async () => {
    const idle = setup();
    expect(await idle.engine.followLink('Berlin')).toEqual({ status: 'ignored', reason: 'not-playing' });
  });
});

describe('GameEngine: back navigation', () => {
  it('returns to previous articles without reducing moves and without refetching', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('Berlin');
    await t.engine.followLink('Brandenburg Gate');
    const fetchesBefore = t.fake.fetchCalls.length;

    expect(await t.engine.back()).toBe(true);
    let state = t.engine.getState();
    expect(state.pathIndex).toBe(1);
    expect(state.article?.title).toBe('Berlin');
    expect(state.moves).toBe(2);

    expect(await t.engine.goToIndex(0)).toBe(true);
    state = t.engine.getState();
    expect(state.article?.title).toBe('Germany');
    expect(state.moves).toBe(2);
    expect(state.path).toEqual(['Germany', 'Berlin', 'Brandenburg Gate']);
    expect(t.fake.fetchCalls.length).toBe(fetchesBefore);
  });

  it('allows going forward again (browser Forward) without counting a move', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('Berlin');
    await t.engine.goToIndex(0);
    expect(await t.engine.goToIndex(1)).toBe(true);
    expect(t.engine.getState().article?.title).toBe('Berlin');
    expect(t.engine.getState().moves).toBe(1);
  });

  it('truncates the forward path and keeps counting when a new link is followed after going back', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('Berlin');
    await t.engine.back();
    await t.engine.followLink('German economy');
    const state = t.engine.getState();
    expect(state.path).toEqual(['Germany', 'German economy']);
    expect(state.pathIndex).toBe(1);
    expect(state.moves).toBe(2);
    expect(state.moveLog.map((move) => move.to)).toEqual(['Berlin', 'German economy']);
  });

  it('rejects out-of-range positions and Back from the start article', async () => {
    const t = setup();
    await startGame(t);
    expect(await t.engine.back()).toBe(false);
    expect(await t.engine.goToIndex(5)).toBe(false);
    expect(await t.engine.goToIndex(-1)).toBe(false);
    expect(await t.engine.goToIndex(0.5)).toBe(false);
  });

  it('refetches evicted articles without counting a move', async () => {
    const fake = createFakeSource(PAGES);
    const engine = new GameEngine({ source: fake.source, cacheSize: 1 });
    await engine.start({ lang: 'en', start: 'Germany', target: 'Volkswagen' });
    await engine.followLink('Berlin');
    await engine.followLink('Brandenburg Gate');
    expect(await engine.goToIndex(0)).toBe(true);
    expect(engine.getState().article?.title).toBe('Germany');
    expect(engine.getState().moves).toBe(2);
    expect(fake.fetchCalls.filter((title) => title === 'Germany')).toHaveLength(2);
  });
});

describe('GameEngine: duplicate and overlapping navigation', () => {
  it('counts a double-click on a link only once', async () => {
    const t = setup();
    await startGame(t);
    t.fake.hold();
    const first = t.engine.followLink('Berlin');
    const second = t.engine.followLink('Berlin');
    expect(t.engine.getState().pending).toEqual({ title: 'Berlin', kind: 'link' });
    t.fake.release();
    expect(await second).toEqual({ status: 'ignored', reason: 'busy' });
    expect((await first).status).toBe('moved');
    expect(t.engine.getState().moves).toBe(1);
    expect(t.fake.fetchCalls.filter((title) => title === 'Berlin')).toHaveLength(1);
  });

  it('ignores clicks on other links while an article is loading', async () => {
    const t = setup();
    await startGame(t);
    t.fake.hold();
    const first = t.engine.followLink('Berlin');
    const second = t.engine.followLink('German economy');
    t.fake.release();
    await Promise.all([first, second]);
    expect(await second).toEqual({ status: 'ignored', reason: 'busy' });
    expect(t.engine.getState().path).toEqual(['Germany', 'Berlin']);
    expect(t.engine.getState().moves).toBe(1);
  });

  it('cancels a pending link when the player navigates back, so it is never counted', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('Berlin');
    t.fake.hold();
    const pending = t.engine.followLink('Brandenburg Gate');
    await t.engine.goToIndex(0);
    t.fake.release();
    expect(await pending).toEqual({ status: 'cancelled' });
    await flush();
    const state = t.engine.getState();
    expect(state.moves).toBe(1);
    expect(state.pathIndex).toBe(0);
    expect(state.article?.title).toBe('Germany');
    expect(state.pending).toBeNull();
  });

  it('cancels a pending link when the game is restarted', async () => {
    const t = setup();
    await startGame(t);
    t.fake.hold();
    const pending = t.engine.followLink('Berlin');
    const restart = t.engine.restart();
    t.fake.release();
    expect(await pending).toEqual({ status: 'cancelled' });
    await restart;
    expect(t.engine.getState().moves).toBe(0);
    expect(t.engine.getState().path).toEqual(['Germany']);
  });
});

describe('GameEngine: victory', () => {
  it('detects reaching the target and freezes the game', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('German economy');
    t.advance(30_000);
    await t.engine.followLink('Automotive industry');
    t.advance(15_000);
    const result = await t.engine.followLink('Volkswagen');

    const state = t.engine.getState();
    expect(result).toEqual({ status: 'moved', index: 3, won: true });
    expect(state.status).toBe('won');
    expect(state.moves).toBe(3);
    expect(state.finishedAt! - state.startedAt!).toBe(45_000);
    expect(state.path).toEqual(['Germany', 'German economy', 'Automotive industry', 'Volkswagen']);
    expect(t.won).toHaveLength(1);

    expect(await t.engine.followLink('Germany')).toEqual({ status: 'ignored', reason: 'not-playing' });
    expect(await t.engine.goToIndex(0)).toBe(false);
    expect(t.engine.getState().moves).toBe(3);
    expect(t.won).toHaveLength(1);
  });

  it('wins when a redirect leads to the target', async () => {
    const t = setup();
    await startGame(t);
    const result = await t.engine.followLink('VW');
    expect(result).toEqual({ status: 'moved', index: 1, won: true });
    expect(t.engine.getState().path).toEqual(['Germany', 'Volkswagen']);
  });

  it('wins when the target itself was given as a redirect', async () => {
    const t = setup();
    await startGame(t, 'Germany', 'VW');
    expect((await t.engine.followLink('Volkswagen')).status).toBe('moved');
    expect(t.engine.getState().status).toBe('won');
  });

  it('counts moves spent on dead ends that were backed out of', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('Berlin');
    await t.engine.back();
    await t.engine.followLink('VW');
    const state = t.engine.getState();
    expect(state.status).toBe('won');
    expect(state.moves).toBe(2);
    expect(state.path).toEqual(['Germany', 'Volkswagen']);
  });
});

describe('GameEngine: restart and reset', () => {
  it('restarts the same challenge from zero with a new game id', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('Berlin');
    const before = t.engine.getState();
    await t.engine.restart();
    const after = t.engine.getState();
    expect(after.gameId).toBeGreaterThan(before.gameId);
    expect(after.status).toBe('playing');
    expect(after.moves).toBe(0);
    expect(after.path).toEqual(['Germany']);
    expect(after.moveLog).toEqual([]);
    expect(t.started).toHaveLength(2);
  });

  it('can restart after winning', async () => {
    const t = setup();
    await startGame(t);
    await t.engine.followLink('VW');
    await t.engine.restart();
    expect(t.engine.getState().status).toBe('playing');
    expect(t.engine.getState().moves).toBe(0);
  });

  it('reset returns to idle', async () => {
    const t = setup();
    await startGame(t);
    t.engine.reset();
    expect(t.engine.getState().status).toBe('idle');
    expect(t.engine.getState().path).toEqual([]);
  });
});

describe('GameEngine: subscriptions', () => {
  it('notifies subscribers and stops after unsubscribe', async () => {
    const t = setup();
    const listener = vi.fn();
    const unsubscribe = t.engine.subscribe(listener);
    await startGame(t);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    unsubscribe();
    await t.engine.followLink('Berlin');
    expect(listener).not.toHaveBeenCalled();
  });
});
