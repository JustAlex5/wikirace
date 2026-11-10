import { describe, expect, it } from 'vitest';
import { buildChallengeUrl, challengeSearch, parseChallengeParams } from './shareUrl';

describe('parseChallengeParams', () => {
  it('returns "none" when no challenge is encoded', () => {
    expect(parseChallengeParams('')).toEqual({ kind: 'none' });
    expect(parseChallengeParams('?utm_source=x')).toEqual({ kind: 'none' });
  });

  it('parses a valid English challenge and normalizes titles', () => {
    expect(parseChallengeParams('?lang=en&start=germany&target=Volkswagen_Beetle')).toEqual({
      kind: 'ok',
      challenge: { lang: 'en', start: 'Germany', target: 'Volkswagen Beetle' },
    });
  });

  it('parses percent-encoded Hebrew titles', () => {
    const search = `?lang=he&start=${encodeURIComponent('גרמניה')}&target=${encodeURIComponent('פולקסווגן')}`;
    expect(parseChallengeParams(search)).toEqual({
      kind: 'ok',
      challenge: { lang: 'he', start: 'גרמניה', target: 'פולקסווגן' },
    });
  });

  it('defaults to English when lang is omitted', () => {
    const result = parseChallengeParams('?start=Germany&target=Volkswagen');
    expect(result.kind === 'ok' && result.challenge.lang).toBe('en');
  });

  it('rejects unsupported languages', () => {
    expect(parseChallengeParams('?lang=xx&start=A&target=B')).toEqual({ kind: 'error', reason: 'invalid-lang' });
  });

  it('rejects missing, invalid and identical titles', () => {
    expect(parseChallengeParams('?start=Germany')).toEqual({ kind: 'error', reason: 'missing-title' });
    expect(parseChallengeParams('?start=&target=B')).toEqual({ kind: 'error', reason: 'missing-title' });
    expect(parseChallengeParams('?start=A[1]&target=B')).toEqual({ kind: 'error', reason: 'invalid-title' });
    expect(parseChallengeParams(`?start=${'x'.repeat(300)}&target=B`)).toEqual({ kind: 'error', reason: 'invalid-title' });
    expect(parseChallengeParams('?start=germany&target=Germany')).toEqual({ kind: 'error', reason: 'same-article' });
  });

  it('never encodes the player position', () => {
    const result = parseChallengeParams('?lang=en&start=Germany&target=Volkswagen&current=Volkswagen&moves=0');
    expect(result).toEqual({ kind: 'ok', challenge: { lang: 'en', start: 'Germany', target: 'Volkswagen' } });
  });
});

describe('building share URLs', () => {
  it('round-trips through parseChallengeParams', () => {
    const challenge = { lang: 'he' as const, start: 'תל אביב-יפו', target: "לאונרדו דה וינצ'י" };
    const url = buildChallengeUrl(challenge, 'https://user.github.io/wikirace/');
    expect(url.startsWith('https://user.github.io/wikirace/?')).toBe(true);
    expect(parseChallengeParams(new URL(url).search)).toEqual({ kind: 'ok', challenge });
  });

  it('replaces any existing query and hash', () => {
    const url = buildChallengeUrl({ lang: 'en', start: 'A', target: 'B' }, 'https://x.github.io/repo/?old=1#frag');
    expect(url).toBe('https://x.github.io/repo/?lang=en&start=A&target=B');
  });

  it('produces a relative search string', () => {
    expect(challengeSearch({ lang: 'en', start: 'Apollo 11', target: 'Moon' })).toBe('?lang=en&start=Apollo+11&target=Moon');
  });
});
