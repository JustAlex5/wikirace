import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStrings } from '../i18n';
import { fallbackNamespaceTable } from '../wiki/namespaces';
import { processArticleHtml } from '../wiki/sanitize';
import type { Article } from '../wiki/types';
import { ArticleView } from './ArticleView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RAW_HTML = `
  <div class="mw-parser-output">
    <p>
      <a id="article" href="/wiki/German_economy">economy</a>
      <a id="external" class="external" href="https://www.volkswagen.com">site</a>
      <a id="red" class="new" href="/w/index.php?title=Nothing&amp;action=edit&amp;redlink=1">Nothing</a>
      <a id="file" href="/wiki/File:Flag.svg"><img id="flag" src="//upload.wikimedia.org/flag.svg"></a>
      <a id="cite" href="#cite_note-1">[1]</a>
      <a id="self" href="/wiki/Germany#History">history</a>
    </p>
    <h2 id="History">History</h2>
    <ol class="references"><li id="cite_note-1">Ref</li></ol>
  </div>`;

function makeArticle(): Article {
  const { html, css } = processArticleHtml(RAW_HTML, { lang: 'en', title: 'Germany', namespaces: fallbackNamespaceTable('en') });
  return {
    lang: 'en',
    title: 'Germany',
    pageId: 1,
    revId: 1,
    displayTitleHtml: 'Germany',
    html,
    css,
    isDisambiguation: false,
    description: null,
    redirectedFrom: null,
  };
}

describe('ArticleView link interception', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onFollow = vi.fn();
  const onBlocked = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollIntoView = vi.fn();
    act(() => {
      root.render(
        <ArticleView article={makeArticle()} busy={false} strings={getStrings('en')} onFollow={onFollow} onBlocked={onBlocked} />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    onFollow.mockReset();
    onBlocked.mockReset();
  });

  function click(selector: string, init: MouseEventInit = {}) {
    const target = container.querySelector(selector)!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  }

  it('routes article links through the game and prevents real navigation', () => {
    const event = click('#article');
    expect(event.defaultPrevented).toBe(true);
    expect(onFollow).toHaveBeenCalledWith('German economy', null);
  });

  it('prevents navigation for modified clicks too', () => {
    const event = click('#article', { ctrlKey: true, metaKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('blocks external links, red links and file links without counting a move', () => {
    expect(click('#external').defaultPrevented).toBe(true);
    expect(click('#red').defaultPrevented).toBe(true);
    expect(click('#flag').defaultPrevented).toBe(true);
    expect(onFollow).not.toHaveBeenCalled();
    expect(onBlocked.mock.calls).toEqual([
      ['external', null],
      ['redlink', 'Nothing'],
      ['not-article', null],
    ]);
  });

  it('scrolls to in-page anchors without leaving the article', () => {
    expect(click('#cite').defaultPrevented).toBe(true);
    expect(click('#self').defaultPrevented).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(onFollow).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('blocks middle-click on links', () => {
    const target = container.querySelector('#article')!;
    const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    act(() => {
      target.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it('renders attribution with a link to the original article', () => {
    const attribution = container.querySelector('.wr-attribution')!;
    expect(attribution.textContent).toContain('CC BY-SA 4.0');
    expect(attribution.querySelector('a')?.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Germany');
  });
});
