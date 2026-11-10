import { memo, useCallback, useRef, type MouseEvent } from 'react';
import type { NoticeCode } from '../game/types';
import type { Strings } from '../i18n';
import { wikiArticleUrl } from '../wiki/titles';
import { langDir, type Article } from '../wiki/types';
import { scrollToFragment } from './scrollToFragment';

interface ArticleViewProps {
  article: Article;
  busy: boolean;
  strings: Strings;
  onFollow: (title: string, fragment: string | null) => void;
  onBlocked: (code: NoticeCode, title: string | null) => void;
}

/**
 * Renders sanitized Wikipedia HTML and routes every link click through the
 * game. Links are annotated by `processArticleHtml`; nothing in the article
 * can trigger a real page navigation.
 */
export const ArticleView = memo(function ArticleView({ article, busy, strings, onFollow, onBlocked }: ArticleViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || !event.currentTarget.contains(anchor)) return;
      event.preventDefault();

      const kind = anchor.getAttribute('data-wr-kind');
      const title = anchor.getAttribute('data-wr-title');
      const fragment = anchor.getAttribute('data-wr-fragment');
      switch (kind) {
        case 'article':
          if (title) onFollow(title, fragment);
          break;
        case 'anchor':
          if (fragment) scrollToFragment(contentRef.current, fragment);
          break;
        case 'namespace':
          onBlocked('not-article', null);
          break;
        case 'redlink':
          onBlocked('redlink', anchor.textContent?.trim() || null);
          break;
        case 'external':
          onBlocked('external', null);
          break;
        default:
          break;
      }
    },
    [onFollow, onBlocked],
  );

  const preventAuxNavigation = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest?.('a')) event.preventDefault();
  }, []);

  const dir = langDir(article.lang);
  const articleUrl = wikiArticleUrl(article.lang, article.title);
  const historyUrl = `https://${article.lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(
    article.title.replace(/ /g, '_'),
  )}&action=history`;

  return (
    <article className={busy ? 'wr-article is-busy' : 'wr-article'} lang={article.lang} dir={dir} aria-busy={busy}>
      {article.css && <style>{article.css}</style>}
      <h1 className="wr-article-title" dangerouslySetInnerHTML={{ __html: article.displayTitleHtml }} />
      <div className="wr-article-meta">
        {article.description && <p className="wr-article-description">{article.description}</p>}
        {article.redirectedFrom && <p className="wr-redirect-note">{strings.redirectedFrom(article.redirectedFrom)}</p>}
        {article.isDisambiguation && (
          <p className="wr-disambiguation-note" role="note">
            {strings.disambiguationNotice}
          </p>
        )}
      </div>
      <div
        ref={contentRef}
        className="wr-article-body"
        onClick={handleClick}
        onAuxClick={preventAuxNavigation}
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
      <footer className="wr-attribution">
        {strings.attribution.before}{' '}
        <a href={articleUrl} target="_blank" rel="noopener noreferrer">
          <bdi>{article.title}</bdi>
        </a>{' '}
        (
        <a href={historyUrl} target="_blank" rel="noopener noreferrer">
          {strings.attribution.history}
        </a>
        ),{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer license">
          {strings.attribution.license}
        </a>
        .
      </footer>
    </article>
  );
});
