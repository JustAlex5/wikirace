import { describe, expect, it } from 'vitest';
import { fallbackNamespaceTable } from './namespaces';
import { filterTemplateStyles, processArticleHtml, sanitizeDisplayTitle } from './sanitize';

const namespaces = fallbackNamespaceTable('en');

function render(html: string, title = 'Germany') {
  const { html: output, css } = processArticleHtml(html, { lang: 'en', title, namespaces });
  const container = document.createElement('div');
  container.innerHTML = output;
  return { container, css, html: output };
}

describe('processArticleHtml: safety', () => {
  it('removes scripts, event handlers and javascript: URLs', () => {
    const { html, container } = render(
      '<p onclick="alert(1)">Text<script>alert(1)</script></p><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a><iframe src="https://evil.example"></iframe>',
    );
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    expect(container.querySelector('a')?.getAttribute('data-wr-kind')).not.toBe('article');
  });

  it('removes forms and inputs', () => {
    const { container } = render('<form action="https://evil.example"><input name="q"><button>Go</button></form>');
    expect(container.querySelector('form, input, button')).toBeNull();
  });

  it('strips forged game annotations from Wikipedia content', () => {
    const { container } = render(
      '<a href="https://example.com" data-wr-kind="article" data-wr-title="Volkswagen">fake</a><span data-wr-title="X">s</span>',
    );
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('data-wr-kind')).toBe('external');
    expect(anchor?.hasAttribute('data-wr-title')).toBe(false);
    expect(container.querySelector('span')?.hasAttribute('data-wr-title')).toBe(false);
  });

  it('drops unsafe inline styles but keeps harmless ones', () => {
    const { container } = render(
      '<div id="a" style="position: fixed; top: 0">x</div><div id="b" style="background:url(https://evil.example/x.png)">y</div><div id="c" style="color: red">z</div><div id="d" style="background:u\\72l(https://evil.example/x.png)">w</div>',
    );
    expect(container.querySelector('#a')?.hasAttribute('style')).toBe(false);
    expect(container.querySelector('#b')?.hasAttribute('style')).toBe(false);
    expect(container.querySelector('#d')?.hasAttribute('style')).toBe(false);
    expect(container.querySelector('#c')?.getAttribute('style')).toBe('color: red');
  });

  it('removes target attributes', () => {
    const { container } = render('<a href="/wiki/Berlin" target="_top">Berlin</a>');
    expect(container.querySelector('a')?.hasAttribute('target')).toBe(false);
  });
});

describe('processArticleHtml: links', () => {
  it('annotates article links and points them at Wikipedia', () => {
    const { container } = render('<a href="/wiki/German_economy" title="German economy">economy</a>');
    const anchor = container.querySelector('a')!;
    expect(anchor.getAttribute('data-wr-kind')).toBe('article');
    expect(anchor.getAttribute('data-wr-title')).toBe('German economy');
    expect(anchor.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/German_economy');
  });

  it('turns links to the current article into in-page anchors', () => {
    const { container } = render('<a href="/wiki/Germany#History">history</a>');
    const anchor = container.querySelector('a')!;
    expect(anchor.getAttribute('data-wr-kind')).toBe('anchor');
    expect(anchor.getAttribute('data-wr-fragment')).toBe('History');
  });

  it('annotates every other link kind', () => {
    const { container } = render(
      [
        '<a id="file" href="/wiki/File:Flag.svg"><img src="//upload.wikimedia.org/flag.svg"></a>',
        '<a id="red" class="new" href="/w/index.php?title=Missing&amp;action=edit&amp;redlink=1">Missing</a>',
        '<a id="ext" class="external" href="https://www.volkswagen.com">VW</a>',
        '<a id="cite" href="#cite_note-1">[1]</a>',
        '<a id="edit" href="/w/index.php?title=Germany&amp;action=edit">edit</a>',
      ].join(''),
    );
    const kind = (id: string) => container.querySelector(`#${id}`)?.getAttribute('data-wr-kind');
    expect(kind('file')).toBe('namespace');
    expect(kind('red')).toBe('redlink');
    expect(kind('ext')).toBe('external');
    expect(container.querySelector('#ext')?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(kind('cite')).toBe('anchor');
    expect(kind('edit')).toBe('unsupported');
    expect(container.querySelector('#edit')?.hasAttribute('href')).toBe(false);
  });
});

describe('processArticleHtml: content', () => {
  it('makes image URLs absolute and lazy-loaded', () => {
    const { container } = render(
      '<img src="//upload.wikimedia.org/a.jpg" srcset="//upload.wikimedia.org/a2.jpg 2x, /static/b.png 1.5x"><img src="/static/c.png">',
    );
    const [first, second] = container.querySelectorAll('img');
    expect(first.getAttribute('src')).toBe('https://upload.wikimedia.org/a.jpg');
    expect(first.getAttribute('srcset')).toBe('https://upload.wikimedia.org/a2.jpg 2x, https://en.wikipedia.org/static/b.png 1.5x');
    expect(first.getAttribute('loading')).toBe('lazy');
    expect(second.getAttribute('src')).toBe('https://en.wikipedia.org/static/c.png');
  });

  it('keeps standard article structure', () => {
    const { container } = render(
      '<div class="mw-parser-output"><div class="mw-heading mw-heading2"><h2 id="History">History</h2><span class="mw-editsection">[edit]</span></div><p>Text <b>bold</b></p><ul><li>One</li></ul><table class="wikitable"><tr><th>A</th><td>B</td></tr></table><figure typeof="mw:File/Thumb"><img src="//x/y.jpg"><figcaption>Cap</figcaption></figure></div>',
    );
    expect(container.querySelector('h2#History')).not.toBeNull();
    expect(container.querySelector('.mw-editsection')).toBeNull();
    expect(container.querySelector('table.wikitable th')?.textContent).toBe('A');
    expect(container.querySelector('figure')?.getAttribute('typeof')).toBe('mw:File/Thumb');
    expect(container.querySelector('li')?.textContent).toBe('One');
  });

  it('wraps non-floating top-level tables in a horizontal scroller', () => {
    const { container } = render(
      '<table class="navbox-largecities" id="wide"><tr><td><table id="inner"><tr><td>x</td></tr></table></td></tr></table><table class="infobox" id="info"><tr><td>i</td></tr></table>',
    );
    expect(container.querySelector('#wide')?.parentElement?.className).toBe('wr-table-scroll');
    expect(container.querySelector('#inner')?.parentElement?.className).not.toBe('wr-table-scroll');
    expect(container.querySelector('#info')?.parentElement?.className).not.toBe('wr-table-scroll');
  });

  it('extracts TemplateStyles and drops other style and link tags', () => {
    const { css, html } = render(
      '<style data-mw-deduplicate="TemplateStyles:r1">.mw-parser-output .hatnote{font-style:italic}</style><style>body{display:none}</style><link rel="stylesheet" href="https://evil.example/x.css"><div class="hatnote">Note</div>',
    );
    expect(css).toContain('.mw-parser-output .hatnote{font-style:italic}');
    expect(css).not.toContain('body{display:none}');
    expect(html).not.toMatch(/<style|<link/);
  });
});

describe('filterTemplateStyles', () => {
  it('removes imports, foreign URLs and fixed positioning', () => {
    const css = filterTemplateStyles(
      '@import url(https://evil.example/a.css); .mw-parser-output .a{background:url("https://evil.example/x.png")} .mw-parser-output .b{background:url(//upload.wikimedia.org/x.png)} .mw-parser-output .c{position: fixed}',
    );
    expect(css).not.toContain('@import');
    expect(css).not.toContain('evil.example');
    expect(css).toContain('url(//upload.wikimedia.org/x.png)');
    expect(css).toContain('position:static');
  });
});

describe('sanitizeDisplayTitle', () => {
  it('keeps simple formatting only', () => {
    expect(sanitizeDisplayTitle('<span class="mw-page-title-main"><i>Titanic</i></span><img src=x onerror=alert(1)>')).toBe(
      '<span><i>Titanic</i></span>',
    );
  });
});
