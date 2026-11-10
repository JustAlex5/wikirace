import { isArticleTitle, type NamespaceTable } from './namespaces';
import { isValidTitle, normalizeTitle, safeDecode } from './titles';

export type LinkKind =
  /** Link to another article in the same wiki: the only kind that counts as a move. */
  | 'article'
  /** In-page fragment link (references, sections). */
  | 'anchor'
  /** Link to a non-article namespace such as File:, Category:, Special:. */
  | 'namespace'
  /** Link to a page that does not exist yet. */
  | 'redlink'
  /** Any link leaving the current wiki, including other-language Wikipedias. */
  | 'external'
  /** Edit/history links and anything else that cannot be followed. */
  | 'unsupported';

export interface ClassifiedLink {
  kind: LinkKind;
  /** Normalized target title for article/namespace/redlink links. */
  title: string | null;
  /** Decoded fragment without "#". */
  fragment: string | null;
}

function result(kind: LinkKind, title: string | null = null, fragment: string | null = null): ClassifiedLink {
  return { kind, title, fragment };
}

function decodeFragment(hash: string): string | null {
  if (!hash || hash === '#') return null;
  return safeDecode(hash.replace(/^#/, ''));
}

function isSameWikiHost(host: string, lang: string): boolean {
  const lower = host.toLowerCase();
  return lower === `${lang}.wikipedia.org` || lower === `${lang}.m.wikipedia.org`;
}

/**
 * Classifies an href found in Wikipedia-rendered HTML for the given wiki.
 * Relative hrefs are resolved against `https://{lang}.wikipedia.org/wiki/`.
 */
export function classifyHref(href: string | null | undefined, lang: string, namespaces: NamespaceTable): ClassifiedLink {
  const raw = href?.trim();
  if (!raw) return result('unsupported');

  if (raw.startsWith('#')) {
    const fragment = decodeFragment(raw);
    return fragment ? result('anchor', null, fragment) : result('unsupported');
  }

  let url: URL;
  try {
    url = new URL(raw, `https://${lang}.wikipedia.org/wiki/`);
  } catch {
    return result('unsupported');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return result('external');
  if (!isSameWikiHost(url.hostname, lang)) return result('external');

  if (url.pathname.startsWith('/wiki/')) {
    if (url.search) return result('unsupported');
    const decoded = safeDecode(url.pathname.slice('/wiki/'.length));
    if (decoded === null || !isValidTitle(decoded)) return result('unsupported');
    const title = normalizeTitle(decoded);
    const fragment = decodeFragment(url.hash);
    if (!isArticleTitle(title, namespaces)) return result('namespace', title, fragment);
    return result('article', title, fragment);
  }

  if (url.pathname === '/w/index.php') {
    const titleParam = url.searchParams.get('title');
    if (url.searchParams.get('redlink') === '1' && titleParam && isValidTitle(titleParam)) {
      return result('redlink', normalizeTitle(titleParam));
    }
  }

  return result('unsupported');
}
