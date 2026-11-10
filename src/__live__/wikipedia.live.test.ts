import { describe, expect, it } from 'vitest';
import { CHALLENGE_POOLS } from '../game/challenges';
import { GameEngine } from '../game/engine';
import { createWikiClient } from '../wiki/client';
import { SUPPORTED_LANGUAGES, type Lang } from '../wiki/types';

/**
 * Exercises the real MediaWiki Action API in both supported languages.
 * Node is not subject to CORS, so CORS headers are asserted explicitly.
 *
 * Unlike browsers, Node must send a User-Agent with contact information or
 * Wikimedia answers HTTP 429. Set WIKIRACE_CONTACT to your repo URL or email.
 */

const CONTACT = process.env.WIKIRACE_CONTACT ?? 'https://github.com/';
const USER_AGENT = `WikiRace-live-tests/1.0 (${CONTACT})`;

const client = createWikiClient((input, init) =>
  fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': USER_AGENT } }),
);

const KNOWN: Record<Lang, { article: string; redirect: [string, string]; disambiguation: string; search: string }> = {
  en: { article: 'Germany', redirect: ['VW', 'Volkswagen'], disambiguation: 'Mercury', search: 'Volksw' },
  he: { article: 'גרמניה', redirect: ['טיטאניק', 'טיטניק'], disambiguation: 'פירמידה', search: 'גרמנ' },
};

function articleLinks(html: string): string[] {
  const container = document.createElement('div');
  container.innerHTML = html;
  return [...container.querySelectorAll('a[data-wr-kind="article"]')].map((a) => a.getAttribute('data-wr-title') ?? '');
}

describe.each(SUPPORTED_LANGUAGES)('live Wikipedia (%s)', (lang) => {
  const known = KNOWN[lang];

  it('allows anonymous cross-origin requests with Api-User-Agent', async () => {
    const origin = 'https://example.github.io';
    const allowed = [origin, '*'];
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*`;
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'User-Agent': USER_AGENT,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'api-user-agent',
      },
    });
    expect(allowed).toContain(preflight.headers.get('access-control-allow-origin'));
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('api-user-agent');

    const response = await fetch(url, { headers: { Origin: origin, 'User-Agent': USER_AGENT } });
    expect(response.ok).toBe(true);
    expect(allowed).toContain(response.headers.get('access-control-allow-origin'));
  });

  it('fetches and sanitizes a real article with annotated links', async () => {
    const article = await client.fetchArticle(lang, known.article);
    expect(article.title).toBe(known.article);
    expect(article.html).not.toMatch(/<script|onerror=|onclick=/i);
    expect(articleLinks(article.html).length).toBeGreaterThan(100);
    expect(article.html).toContain('data-wr-kind="namespace"');
    expect(article.html).toMatch(/src="https:\/\/(upload|thumb)\.wikimedia\.org\//);
  });

  it('resolves redirects to canonical titles', async () => {
    const [from, to] = known.redirect;
    const article = await client.fetchArticle(lang, from);
    expect(article.title).toBe(to);
    expect(article.redirectedFrom).toBe(from);
    expect((await client.resolvePage(lang, from)).title).toBe(to);
  });

  it('detects missing pages, namespaces and disambiguation pages', async () => {
    await expect(client.fetchArticle(lang, 'Zzqx nonexistent article 8472')).rejects.toMatchObject({ kind: 'missing' });
    await expect(client.resolvePage(lang, 'Special:Random')).rejects.toMatchObject({ kind: 'not-article' });
    expect((await client.resolvePage(lang, known.disambiguation)).isDisambiguation).toBe(true);
    const namespaces = await client.getNamespaces(lang);
    expect(namespaces.get(lang === 'he' ? 'קובץ' : 'file')).toBe(6);
  });

  it('returns search suggestions', async () => {
    const results = await client.search(lang, known.search);
    expect(results.length).toBeGreaterThan(0);
  });

  it('plays a real game: dead end, back, then reach the target', async () => {
    const start = await client.fetchArticle(lang, known.article);
    const links = [...new Set(articleLinks(start.html))];
    const targetInfo = await client.resolvePage(lang, links[20]);
    const detour = links.find((title) => title !== links[20] && title !== targetInfo.title)!;

    const engine = new GameEngine({ source: client });
    await engine.start({ lang, start: known.article, target: targetInfo.title });
    expect(engine.getState().status).toBe('playing');

    expect((await engine.followLink(detour)).status).toBe('moved');
    expect(await engine.back()).toBe(true);
    const result = await engine.followLink(links[20]);
    const state = engine.getState();
    expect(result).toMatchObject({ status: 'moved', won: true });
    expect(state.status).toBe('won');
    expect(state.moves).toBe(2);
    expect(state.path).toEqual([known.article, targetInfo.title]);
  });

  it('curated challenge titles exist and are canonical, non-disambiguation articles', async () => {
    const pool = CHALLENGE_POOLS[lang];
    for (let i = 0; i < pool.length; i += 50) {
      const batch = pool.slice(i, i + 50);
      const params = new URLSearchParams({
        action: 'query',
        titles: batch.join('|'),
        redirects: '1',
        prop: 'pageprops',
        ppprop: 'disambiguation',
        format: 'json',
        formatversion: '2',
        origin: '*',
      });
      const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
      });
      const body = (await response.json()) as {
        query: {
          redirects?: unknown[];
          normalized?: unknown[];
          pages: Array<{ title: string; ns: number; missing?: boolean; pageprops?: object }>;
        };
      };
      expect(body.query.redirects ?? [], 'redirects').toEqual([]);
      expect(body.query.normalized ?? [], 'normalized').toEqual([]);
      for (const page of body.query.pages) {
        expect(page.missing, page.title).toBeFalsy();
        expect(page.ns, page.title).toBe(0);
        expect(page.pageprops, `${page.title} is a disambiguation page`).toBeUndefined();
      }
    }
  });
});
