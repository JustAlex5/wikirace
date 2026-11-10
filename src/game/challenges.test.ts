import { describe, expect, it } from 'vitest';
import { isValidTitle, normalizeTitle } from '../wiki/titles';
import { SUPPORTED_LANGUAGES } from '../wiki/types';
import { CHALLENGE_POOLS, pickRandomChallenge } from './challenges';

function sequence(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('challenge pools', () => {
  it.each(SUPPORTED_LANGUAGES)('%s pool has many unique, valid, normalized titles', (lang) => {
    const pool = CHALLENGE_POOLS[lang];
    expect(pool.length).toBeGreaterThanOrEqual(40);
    expect(new Set(pool).size).toBe(pool.length);
    for (const title of pool) {
      expect(isValidTitle(title), title).toBe(true);
      expect(normalizeTitle(title)).toBe(title);
    }
  });
});

describe('pickRandomChallenge', () => {
  it('picks two different articles from the selected language', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (let i = 0; i < 200; i++) {
        const challenge = pickRandomChallenge(lang);
        expect(challenge.lang).toBe(lang);
        expect(challenge.start).not.toBe(challenge.target);
        expect(CHALLENGE_POOLS[lang]).toContain(challenge.start);
        expect(CHALLENGE_POOLS[lang]).toContain(challenge.target);
      }
    }
  });

  it('never pairs an article with itself even at the extremes of the RNG', () => {
    const pool = CHALLENGE_POOLS.en;
    expect(pickRandomChallenge('en', sequence([0, 0]))).toEqual({ lang: 'en', start: pool[0], target: pool[1] });
    const last = pickRandomChallenge('en', sequence([0.9999999, 0.9999999]));
    expect(last.start).toBe(pool[pool.length - 1]);
    expect(last.target).toBe(pool[pool.length - 2]);
  });

  it('avoids repeating the previous pair', () => {
    const random = sequence([0, 0, 0.5, 0.5]);
    const previous = { lang: 'en' as const, start: CHALLENGE_POOLS.en[0], target: CHALLENGE_POOLS.en[1] };
    const next = pickRandomChallenge('en', random, previous);
    expect(next).not.toEqual(previous);
  });
});
