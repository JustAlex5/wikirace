import { describe, expect, it, vi } from 'vitest';
import { API_USER_AGENT, createWikiClient } from './client';
import { WikiError } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SITEINFO = {
  query: {
    namespaces: {
      '-1': { id: -1, name: 'Special', canonical: 'Special' },
      '0': { id: 0, name: '' },
      '6': { id: 6, name: 'File', canonical: 'File' },
      '14': { id: 14, name: 'Category', canonical: 'Category' },
    },
    namespacealiases: [{ id: 6, alias: 'Image' }],
  },
};

function mockFetch(handler: (params: URLSearchParams, url: URL) => Response | Promise<Response>) {
  return vi.fn(async (input: string, _init?: RequestInit) => {
    const url = new URL(input);
    if (url.searchParams.get('meta') === 'siteinfo') return jsonResponse(SITEINFO);
    return handler(url.searchParams, url);
  });
}

describe('wiki client: fetchArticle', () => {
  it('requests action=parse with CORS and identification parameters', async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({ parse: { title: 'Germany', pageid: 11867, revid: 5, text: '<p>Hi</p>', displaytitle: 'Germany', properties: {} } }),
    );
    const client = createWikiClient(fetchImpl);
    await client.fetchArticle('en', 'germany');

    const parseCall = fetchImpl.mock.calls.find(([url]) => url.includes('action=parse'))!;
    const url = new URL(parseCall[0]);
    expect(url.origin).toBe('https://en.wikipedia.org');
    expect(url.pathname).toBe('/w/api.php');
    expect(url.searchParams.get('origin')).toBe('*');
    expect(url.searchParams.get('redirects')).toBe('1');
    expect(url.searchParams.get('formatversion')).toBe('2');
    expect(url.searchParams.get('page')).toBe('Germany');
    const headers = parseCall[1]?.headers as Record<string, string> | undefined;
    expect(headers?.['Api-User-Agent']).toBe(API_USER_AGENT);
  });

  it('follows redirects to the canonical title and annotates links', async () => {
    const client = createWikiClient(
      mockFetch(() =>
        jsonResponse({
          parse: {
            title: 'Volkswagen',
            pageid: 32413,
            revid: 9,
            redirects: [{ from: 'VW', to: 'Volkswagen' }],
            text: '<div class="mw-parser-output"><p><a href="/wiki/Wolfsburg">Wolfsburg</a> <a href="/wiki/File:Logo.svg">logo</a></p></div>',
            displaytitle: '<span class="mw-page-title-main">Volkswagen</span>',
            properties: { 'wikibase-shortdesc': 'German automobile brand' },
          },
        }),
      ),
    );
    const article = await client.fetchArticle('en', 'VW');
    expect(article.title).toBe('Volkswagen');
    expect(article.redirectedFrom).toBe('VW');
    expect(article.description).toBe('German automobile brand');
    expect(article.isDisambiguation).toBe(false);
    expect(article.html).toContain('data-wr-title="Wolfsburg"');
    expect(article.html).toContain('data-wr-kind="namespace"');
  });

  it('flags disambiguation pages', async () => {
    const client = createWikiClient(
      mockFetch(() =>
        jsonResponse({ parse: { title: 'Mercury', pageid: 1, text: '<p/>', properties: { disambiguation: '' } } }),
      ),
    );
    expect((await client.fetchArticle('en', 'Mercury')).isDisambiguation).toBe(true);
  });

  it('maps missing pages to a "missing" error', async () => {
    const client = createWikiClient(mockFetch(() => jsonResponse({ error: { code: 'missingtitle', info: 'nope' } })));
    await expect(client.fetchArticle('en', 'Nope')).rejects.toMatchObject({ kind: 'missing' });
  });

  it('rejects pages that resolve outside the article namespace', async () => {
    const client = createWikiClient(
      mockFetch(() => jsonResponse({ parse: { title: 'File:Logo.svg', pageid: 3, text: '<p/>' } })),
    );
    await expect(client.fetchArticle('en', 'Logo redirect')).rejects.toMatchObject({ kind: 'not-article' });
  });

  it('maps HTTP and network failures to "network" errors', async () => {
    const http = createWikiClient(mockFetch(() => new Response('oops', { status: 503 })));
    await expect(http.fetchArticle('en', 'Germany')).rejects.toMatchObject({ kind: 'network' });

    const offline = createWikiClient(
      mockFetch(() => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(offline.fetchArticle('en', 'Germany')).rejects.toBeInstanceOf(WikiError);
  });

  it('reports caller cancellation as "aborted"', async () => {
    const client = createWikiClient(
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.includes('siteinfo')) return jsonResponse(SITEINFO);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }),
    );
    const controller = new AbortController();
    const pending = client.fetchArticle('en', 'Germany', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('rejects invalid titles without a request', async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    const client = createWikiClient(fetchImpl);
    await expect(client.fetchArticle('en', 'Bad|Title')).rejects.toMatchObject({ kind: 'invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('wiki client: resolvePage', () => {
  it('returns the canonical title and disambiguation flag', async () => {
    const client = createWikiClient(
      mockFetch(() =>
        jsonResponse({
          query: { pages: [{ pageid: 19007, ns: 0, title: 'Mercury', pageprops: { disambiguation: '' }, description: 'Topics' }] },
        }),
      ),
    );
    expect(await client.resolvePage('en', 'mercury')).toEqual({
      title: 'Mercury',
      pageId: 19007,
      isDisambiguation: true,
      description: 'Topics',
    });
  });

  it('rejects missing and non-article pages', async () => {
    const missing = createWikiClient(mockFetch(() => jsonResponse({ query: { pages: [{ ns: 0, title: 'Nope', missing: true }] } })));
    await expect(missing.resolvePage('en', 'Nope')).rejects.toMatchObject({ kind: 'missing' });

    const special = createWikiClient(
      mockFetch(() => jsonResponse({ query: { pages: [{ ns: -1, title: 'Special:Random', special: true }] } })),
    );
    await expect(special.resolvePage('en', 'Special:Random')).rejects.toMatchObject({ kind: 'not-article' });
  });
});

describe('wiki client: search', () => {
  it('returns prefix-search suggestions ordered by rank', async () => {
    const client = createWikiClient(
      mockFetch((params) => {
        expect(params.get('generator')).toBe('prefixsearch');
        expect(params.get('gpsnamespace')).toBe('0');
        return jsonResponse({
          query: {
            pages: [
              { pageid: 2, ns: 0, title: 'Volkswagen Group', index: 2 },
              { pageid: 1, ns: 0, title: 'Volkswagen', index: 1, description: 'German automobile brand' },
            ],
          },
        });
      }),
    );
    const results = await client.search('en', 'volksw');
    expect(results.map((result) => result.title)).toEqual(['Volkswagen', 'Volkswagen Group']);
    expect(results[0].description).toBe('German automobile brand');
  });

  it('falls back to full-text search when the prefix search is empty', async () => {
    const client = createWikiClient(
      mockFetch((params) =>
        params.get('generator') === 'prefixsearch'
          ? jsonResponse({ batchcomplete: true })
          : jsonResponse({ query: { pages: [{ pageid: 1, ns: 0, title: 'Volkswagen', index: 1 }] } }),
      ),
    );
    expect((await client.search('en', 'folkswagen')).map((result) => result.title)).toEqual(['Volkswagen']);
  });

  it('returns nothing for blank queries', async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    expect(await createWikiClient(fetchImpl).search('en', '   ')).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('wiki client: namespaces', () => {
  it('loads namespaces and aliases from siteinfo', async () => {
    const client = createWikiClient(mockFetch(() => jsonResponse({})));
    const table = await client.getNamespaces('en');
    expect(table.get('image')).toBe(6);
    expect(table.get('category')).toBe(14);
  });

  it('falls back to the built-in table when siteinfo fails', async () => {
    const client = createWikiClient(vi.fn(async () => new Response('down', { status: 500 })));
    const table = await client.getNamespaces('he');
    expect(table.get('קובץ')).toBe(6);
  });
});
