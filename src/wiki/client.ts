import {
  buildNamespaceTable,
  fallbackNamespaceTable,
  isArticleTitle,
  type NamespaceTable,
} from './namespaces';
import { processArticleHtml, sanitizeDisplayTitle } from './sanitize';
import { isValidTitle, normalizeTitle } from './titles';
import { WikiError, type Article, type Lang, type PageInfo, type SearchSuggestion } from './types';

/**
 * Client for the MediaWiki Action API (https://{lang}.wikipedia.org/w/api.php).
 *
 * Anonymous cross-origin requests are allowed by passing `origin=*`, which
 * makes the API answer with `Access-Control-Allow-Origin: *`. Browsers cannot
 * set User-Agent, so Wikimedia asks clients to identify via `Api-User-Agent`.
 */

function buildUserAgent(): string {
  // The deployed site URL doubles as the contact information Wikimedia's policy asks for.
  const origin = typeof window !== 'undefined' ? window.location?.origin : undefined;
  const site = origin?.startsWith('http') ? new URL(import.meta.env.BASE_URL, origin).toString() : 'static browser game';
  return `WikiRace/1.0 (${site})`;
}

export const API_USER_AGENT = buildUserAgent();
const REQUEST_TIMEOUT_MS = 20_000;

export interface ArticleSource {
  fetchArticle(lang: Lang, title: string, signal?: AbortSignal): Promise<Article>;
  resolvePage(lang: Lang, title: string, signal?: AbortSignal): Promise<PageInfo>;
  getNamespaces(lang: Lang): Promise<NamespaceTable>;
}

export interface WikiClient extends ArticleSource {
  search(lang: Lang, query: string, signal?: AbortSignal): Promise<SearchSuggestion[]>;
}

type Params = Record<string, string>;
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface ApiErrorBody {
  error?: { code?: string; info?: string };
}

interface ParseResponse extends ApiErrorBody {
  parse?: {
    title: string;
    pageid: number;
    revid?: number;
    text?: string;
    displaytitle?: string;
    redirects?: Array<{ from: string; to: string }>;
    properties?: Record<string, string>;
  };
}

interface QueryPage {
  pageid?: number;
  ns: number;
  title: string;
  missing?: boolean;
  invalid?: boolean;
  special?: boolean;
  index?: number;
  description?: string;
  pageprops?: Record<string, string>;
}

interface QueryResponse extends ApiErrorBody {
  query?: {
    pages?: QueryPage[];
    namespaces?: Record<string, { id: number; name: string; canonical?: string }>;
    namespacealiases?: Array<{ id: number; alias: string }>;
  };
}

function mapApiError(error: { code?: string; info?: string }, title: string | null): WikiError {
  switch (error.code) {
    case 'missingtitle':
    case 'nosuchpageid':
      return new WikiError('missing', 'This page does not exist on Wikipedia.', title);
    case 'invalidtitle':
    case 'invalid':
      return new WikiError('invalid', 'This is not a valid Wikipedia title.', title);
    default:
      return new WikiError('api', error.info ?? 'Wikipedia returned an error.', title);
  }
}

export function createWikiClient(fetchImpl: FetchFn = (input, init) => fetch(input, init)): WikiClient {
  const namespaceCache = new Map<Lang, Promise<NamespaceTable>>();

  async function apiGet<T extends ApiErrorBody>(
    lang: Lang,
    params: Params,
    signal?: AbortSignal,
    title: string | null = null,
  ): Promise<T> {
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    const allParams: Params = { format: 'json', formatversion: '2', origin: '*', ...params };
    for (const [key, value] of Object.entries(allParams)) url.searchParams.set(key, value);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { 'Api-User-Agent': API_USER_AGENT },
        signal: controller.signal,
      });
    } catch {
      if (signal?.aborted) throw new WikiError('aborted', 'Request cancelled.', title);
      throw new WikiError('network', 'Could not reach Wikipedia. Check your connection and try again.', title);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
    }

    if (!response.ok) {
      throw new WikiError('network', `Wikipedia responded with HTTP ${response.status}.`, title);
    }
    let body: T;
    try {
      body = (await response.json()) as T;
    } catch {
      throw new WikiError('api', 'Wikipedia returned an unreadable response.', title);
    }
    if (body.error) throw mapApiError(body.error, title);
    return body;
  }

  function getNamespaces(lang: Lang): Promise<NamespaceTable> {
    const cached = namespaceCache.get(lang);
    if (cached) return cached;
    const pending = apiGet<QueryResponse>(lang, {
      action: 'query',
      meta: 'siteinfo',
      siprop: 'namespaces|namespacealiases',
    })
      .then((body) => {
        const entries: Array<[string, number]> = [];
        for (const ns of Object.values(body.query?.namespaces ?? {})) {
          entries.push([ns.name, ns.id]);
          if (ns.canonical) entries.push([ns.canonical, ns.id]);
        }
        for (const alias of body.query?.namespacealiases ?? []) entries.push([alias.alias, alias.id]);
        if (entries.length === 0) throw new Error('empty namespace list');
        return buildNamespaceTable(entries);
      })
      .catch(() => {
        namespaceCache.delete(lang);
        return fallbackNamespaceTable(lang);
      });
    namespaceCache.set(lang, pending);
    return pending;
  }

  async function fetchArticle(lang: Lang, rawTitle: string, signal?: AbortSignal): Promise<Article> {
    if (!isValidTitle(rawTitle)) throw new WikiError('invalid', 'This is not a valid Wikipedia title.', rawTitle);
    const requested = normalizeTitle(rawTitle);
    const [namespaces, body] = await Promise.all([
      getNamespaces(lang),
      apiGet<ParseResponse>(
        lang,
        {
          action: 'parse',
          page: requested,
          redirects: '1',
          prop: 'text|displaytitle|properties|revid',
          disableeditsection: '1',
          disablelimitreport: '1',
          maxage: '300',
          smaxage: '300',
        },
        signal,
        requested,
      ),
    ]);

    const parsed = body.parse;
    if (!parsed || typeof parsed.text !== 'string') {
      throw new WikiError('api', 'Wikipedia returned an incomplete article.', requested);
    }
    const title = normalizeTitle(parsed.title);
    if (!isArticleTitle(title, namespaces)) {
      throw new WikiError('not-article', 'This link leads to a non-article page.', title);
    }

    const { html, css } = processArticleHtml(parsed.text, { lang, title, namespaces });
    const properties = parsed.properties ?? {};
    const redirect = parsed.redirects?.[0];
    return {
      lang,
      title,
      pageId: parsed.pageid,
      revId: parsed.revid ?? null,
      displayTitleHtml: sanitizeDisplayTitle(parsed.displaytitle ?? title),
      html,
      css,
      isDisambiguation: 'disambiguation' in properties,
      description: properties['wikibase-shortdesc'] ?? null,
      redirectedFrom: redirect ? normalizeTitle(redirect.from) : null,
    };
  }

  async function resolvePage(lang: Lang, rawTitle: string, signal?: AbortSignal): Promise<PageInfo> {
    if (!isValidTitle(rawTitle)) throw new WikiError('invalid', 'This is not a valid Wikipedia title.', rawTitle);
    const requested = normalizeTitle(rawTitle);
    const body = await apiGet<QueryResponse>(
      lang,
      {
        action: 'query',
        titles: requested,
        redirects: '1',
        prop: 'pageprops|description',
        ppprop: 'disambiguation',
      },
      signal,
      requested,
    );
    const page = body.query?.pages?.[0];
    if (!page || page.missing) throw new WikiError('missing', 'This page does not exist on Wikipedia.', requested);
    if (page.invalid) throw new WikiError('invalid', 'This is not a valid Wikipedia title.', requested);
    if (page.special || page.ns !== 0 || page.pageid === undefined) {
      throw new WikiError('not-article', 'Only regular articles can be used.', normalizeTitle(page.title));
    }
    return {
      title: normalizeTitle(page.title),
      pageId: page.pageid,
      isDisambiguation: page.pageprops !== undefined && 'disambiguation' in page.pageprops,
      description: page.description ?? null,
    };
  }

  function toSuggestions(pages: QueryPage[] | undefined): SearchSuggestion[] {
    const seen = new Set<string>();
    return [...(pages ?? [])]
      .filter((page) => page.ns === 0 && !page.missing)
      .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))
      .filter((page) => (seen.has(page.title) ? false : (seen.add(page.title), true)))
      .map((page) => ({
        title: normalizeTitle(page.title),
        description: page.description ?? null,
        isDisambiguation: page.pageprops !== undefined && 'disambiguation' in page.pageprops,
      }));
  }

  async function search(lang: Lang, query: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const common: Params = {
      action: 'query',
      redirects: '1',
      prop: 'pageprops|description',
      ppprop: 'disambiguation',
    };
    const prefix = await apiGet<QueryResponse>(
      lang,
      { ...common, generator: 'prefixsearch', gpssearch: trimmed, gpsnamespace: '0', gpslimit: '8' },
      signal,
    );
    const suggestions = toSuggestions(prefix.query?.pages);
    if (suggestions.length > 0) return suggestions;
    const fullText = await apiGet<QueryResponse>(
      lang,
      { ...common, generator: 'search', gsrsearch: trimmed, gsrnamespace: '0', gsrlimit: '8' },
      signal,
    );
    return toSuggestions(fullText.query?.pages);
  }

  return { fetchArticle, resolvePage, getNamespaces, search };
}

export const wikiClient: WikiClient = createWikiClient();
