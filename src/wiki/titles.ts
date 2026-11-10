/**
 * Title helpers mirroring MediaWiki's basic title normalization for wikis
 * with `$wgCapitalLinks = true` (both English and Hebrew Wikipedia).
 */

// Characters MediaWiki forbids in page titles.
// oxlint-disable-next-line no-control-regex
const ILLEGAL_TITLE_CHARS = /[#<>[\]|{}\u0000-\u001f\u007f\ufffd]/;
const MAX_TITLE_BYTES = 255;

function uppercaseFirst(value: string): string {
  const first = value.codePointAt(0);
  if (first === undefined) return value;
  const firstChar = String.fromCodePoint(first);
  const upper = firstChar.toUpperCase();
  // Avoid expansions such as "ß" -> "SS" which MediaWiki does not apply.
  if ([...upper].length !== 1) return value;
  return upper + value.slice(firstChar.length);
}

/** Normalizes a raw title: underscores to spaces, whitespace collapsed, first letter capitalized. */
export function normalizeTitle(raw: string): string {
  const cleaned = raw
    .replace(/_/g, ' ')
    .replace(/[\s\u00a0\u200e\u200f]+/g, ' ')
    .trim()
    .replace(/^:+\s*/, '');
  return uppercaseFirst(cleaned);
}

export function titlesEqual(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

export function isValidTitle(raw: string): boolean {
  const title = normalizeTitle(raw);
  if (!title) return false;
  if (ILLEGAL_TITLE_CHARS.test(title)) return false;
  if (new TextEncoder().encode(title).length > MAX_TITLE_BYTES) return false;
  return true;
}

/** Converts a normalized title into the path segment used in /wiki/ URLs. */
export function titleToPath(title: string): string {
  return encodeURIComponent(normalizeTitle(title).replace(/ /g, '_'))
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%2C/g, ',');
}

export function wikiArticleUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${titleToPath(title)}`;
}

/** Safe decodeURIComponent: returns null for malformed escape sequences. */
export function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
