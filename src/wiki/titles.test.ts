import { describe, expect, it } from 'vitest';
import { isValidTitle, normalizeTitle, titlesEqual, titleToPath, wikiArticleUrl } from './titles';

describe('normalizeTitle', () => {
  it('converts underscores, trims and collapses whitespace', () => {
    expect(normalizeTitle('  German_economy ')).toBe('German economy');
    expect(normalizeTitle('Mount   Everest')).toBe('Mount Everest');
    expect(normalizeTitle('New\u00a0York')).toBe('New York');
  });

  it('capitalizes the first letter only', () => {
    expect(normalizeTitle('volkswagen Beetle')).toBe('Volkswagen Beetle');
    expect(normalizeTitle('iPhone')).toBe('IPhone');
  });

  it('strips leading colons', () => {
    expect(normalizeTitle(':Germany')).toBe('Germany');
  });

  it('keeps Hebrew titles intact', () => {
    expect(normalizeTitle('תל_אביב-יפו')).toBe('תל אביב-יפו');
    expect(normalizeTitle('\u200fגרמניה')).toBe('גרמניה');
  });

  it('does not expand characters like ß', () => {
    expect(normalizeTitle('ß')).toBe('ß');
  });
});

describe('titlesEqual', () => {
  it('compares normalized titles', () => {
    expect(titlesEqual('german_economy', 'German economy')).toBe(true);
    expect(titlesEqual('Germany', 'German economy')).toBe(false);
  });
});

describe('isValidTitle', () => {
  it('rejects empty and illegal titles', () => {
    expect(isValidTitle('')).toBe(false);
    expect(isValidTitle('   ')).toBe(false);
    expect(isValidTitle('A[b]')).toBe(false);
    expect(isValidTitle('A#b')).toBe(false);
    expect(isValidTitle('A|b')).toBe(false);
    expect(isValidTitle('x'.repeat(256))).toBe(false);
  });

  it('accepts ordinary titles', () => {
    expect(isValidTitle('Apollo 11')).toBe(true);
    expect(isValidTitle("לאונרדו דה וינצ'י")).toBe(true);
    expect(isValidTitle('AC/DC')).toBe(true);
  });
});

describe('URLs', () => {
  it('builds Wikipedia article URLs', () => {
    expect(titleToPath('Star Wars: Episode IV')).toBe('Star_Wars:_Episode_IV');
    expect(titleToPath('AC/DC')).toBe('AC/DC');
    expect(wikiArticleUrl('he', 'גרמניה')).toBe('https://he.wikipedia.org/wiki/%D7%92%D7%A8%D7%9E%D7%A0%D7%99%D7%94');
  });
});
