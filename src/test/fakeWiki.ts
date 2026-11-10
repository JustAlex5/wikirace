import type { ArticleSource } from '../wiki/client';
import { fallbackNamespaceTable, isArticleTitle } from '../wiki/namespaces';
import { normalizeTitle } from '../wiki/titles';
import { WikiError, type Article, type Lang, type PageInfo } from '../wiki/types';

export interface FakePage {
  links?: string[];
  redirectTo?: string;
  disambiguation?: boolean;
}

interface Gate {
  promise: Promise<void>;
  release: () => void;
}

function createGate(): Gate {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * In-memory stand-in for Wikipedia. `hold()` pauses all article fetches until
 * `release()` so tests can simulate slow networks and overlapping clicks.
 */
export function createFakeSource(pages: Record<string, FakePage>) {
  const fetchCalls: string[] = [];
  const failures = new Map<string, WikiError>();
  let gate: Gate | null = null;

  const resolve = (raw: string): { title: string; redirectedFrom: string | null; page: FakePage } => {
    const requested = normalizeTitle(raw);
    const page = pages[requested];
    if (!page) throw new WikiError('missing', 'missing', requested);
    if (page.redirectTo) {
      const target = normalizeTitle(page.redirectTo);
      const targetPage = pages[target];
      if (!targetPage) throw new WikiError('missing', 'missing', target);
      return { title: target, redirectedFrom: requested, page: targetPage };
    }
    return { title: requested, redirectedFrom: null, page };
  };

  const source: ArticleSource = {
    async fetchArticle(lang: Lang, rawTitle: string, signal?: AbortSignal): Promise<Article> {
      fetchCalls.push(normalizeTitle(rawTitle));
      if (gate) {
        const current = gate;
        await new Promise<void>((resolveWait, reject) => {
          current.promise.then(resolveWait);
          signal?.addEventListener('abort', () => reject(new WikiError('aborted', 'aborted')), { once: true });
        });
      }
      const failure = failures.get(normalizeTitle(rawTitle));
      if (failure) throw failure;
      const { title, redirectedFrom, page } = resolve(rawTitle);
      if (!isArticleTitle(title, fallbackNamespaceTable(lang))) {
        throw new WikiError('not-article', 'not-article', title);
      }
      return {
        lang,
        title,
        pageId: title.length,
        revId: 1,
        displayTitleHtml: title,
        html: (page.links ?? [])
          .map((link) => `<a data-wr-kind="article" data-wr-title="${link}">${link}</a>`)
          .join(' '),
        css: '',
        isDisambiguation: page.disambiguation ?? false,
        description: null,
        redirectedFrom,
      };
    },
    async resolvePage(_lang: Lang, rawTitle: string): Promise<PageInfo> {
      const { title, page } = resolve(rawTitle);
      return { title, pageId: title.length, isDisambiguation: page.disambiguation ?? false, description: null };
    },
    async getNamespaces(lang: Lang) {
      return fallbackNamespaceTable(lang);
    },
  };

  return {
    source,
    fetchCalls,
    hold() {
      gate = createGate();
    },
    release() {
      const current = gate;
      gate = null;
      current?.release();
    },
    failNext(title: string, error: WikiError) {
      failures.set(normalizeTitle(title), error);
    },
    clearFailures() {
      failures.clear();
    },
  };
}

/** Lets pending promise callbacks run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
